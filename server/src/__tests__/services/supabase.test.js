const mockList = jest.fn();
const mockRemove = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: { from: () => ({ list: mockList, remove: mockRemove }) },
  }),
}));

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';

const { deleteSubmissionImages } = require('../../services/supabase');

const folder = (name) => ({ id: null, name });
const file = (name) => ({ id: `id-${name}`, name });

describe('deleteSubmissionImages', () => {
  beforeEach(() => jest.resetAllMocks());

  it('removes every file under the submission folder', async () => {
    mockList.mockImplementation(async (path) => ({
      data: {
        sub: [folder('card-1'), folder('card-2')],
        'sub/card-1': [file('front.jpg'), file('back.jpg')],
        'sub/card-2': [file('front.jpg')],
      }[path],
      error: null,
    }));
    mockRemove.mockResolvedValue({ error: null });

    await expect(deleteSubmissionImages('sub')).resolves.toBe(true);

    expect(mockRemove).toHaveBeenCalledWith([
      'sub/card-1/front.jpg',
      'sub/card-1/back.jpg',
      'sub/card-2/front.jpg',
    ]);
  });

  it('reads past the first page of results', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => file(`${i}.jpg`));
    mockList.mockImplementation(async (path, { offset }) => ({
      data: offset === 0 ? firstPage : [file('last.jpg')],
      error: null,
    }));
    mockRemove.mockResolvedValue({ error: null });

    await expect(deleteSubmissionImages('sub')).resolves.toBe(true);

    expect(mockRemove).toHaveBeenCalledTimes(2);
    expect(mockRemove.mock.calls[0][0]).toHaveLength(1000);
    expect(mockRemove.mock.calls[1][0]).toEqual(['sub/last.jpg']);
  });

  it('does nothing when the submission has no images', async () => {
    mockList.mockResolvedValue({ data: [], error: null });

    await expect(deleteSubmissionImages('sub')).resolves.toBe(true);

    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('reports failure when listing fails', async () => {
    mockList.mockResolvedValue({ data: null, error: new Error('list failed') });

    await expect(deleteSubmissionImages('sub')).resolves.toBe(false);
  });

  it('reports failure when removing fails', async () => {
    mockList.mockResolvedValue({ data: [file('front.jpg')], error: null });
    mockRemove.mockResolvedValue({ error: new Error('remove failed') });

    await expect(deleteSubmissionImages('sub')).resolves.toBe(false);
  });
});
