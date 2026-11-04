const { PassThrough } = require('stream');

const mockPool = { query: jest.fn() };

jest.mock('../../server', () => ({ pool: mockPool }));

jest.mock('../../services/supabase', () => ({
  getPresignedUrl: jest.fn(async (submissionId, cardNumber, side) => `https://storage.example.com/signed/${side}.jpg`),
}));

const { createSubmissionZip } = require('../../services/export');

describe('createSubmissionZip', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('adds images read through signed URLs', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'sub', name: 'Batch' }] })
      .mockResolvedValueOnce({
        rows: [{ card_number: 1, front_image_url: 'stored-front', back_image_url: 'stored-back' }],
      });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('image'),
    }));

    const output = new PassThrough();
    const chunks = [];
    output.on('data', (chunk) => chunks.push(chunk));
    const finished = new Promise((resolve) => output.on('end', resolve));

    await createSubmissionZip('sub', output);
    await finished;

    expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://storage.example.com/signed/front.jpg',
      'https://storage.example.com/signed/back.jpg',
    ]);

    const zip = Buffer.concat(chunks);
    expect(zip.includes('batch/card-1/front.jpg')).toBe(true);
    expect(zip.includes('batch/card-1/back.jpg')).toBe(true);
  });
});
