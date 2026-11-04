const request = require('supertest');
const express = require('express');
// jszip comes from the app's own dependencies (repo root node_modules).
const JSZip = require('jszip');

const mockPool = { query: jest.fn() };

jest.mock('../../server', () => ({ pool: mockPool }));
jest.mock('../../services/supabase', () => ({ getPresignedUrl: jest.fn().mockResolvedValue(null) }));
jest.mock('../../services/localStorage', () => ({ getSubmissionPath: jest.fn(() => '/nonexistent') }));

const exportRouter = require('../../api/export');
const { sharePct } = require('../../services/export');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MISSING = '33333333-3333-4333-8333-333333333333';

const submissions = {
  [A]: { id: A, name: 'TFG0005132', completed_at: '2026-11-01T00:00:00Z' },
  // Same folder name on purpose: folders must not collide.
  [B]: { id: B, name: 'tfg0005132', completed_at: null },
};
const cards = {
  [A]: [{ card_number: 1, front_grade: 'TFG 9.5', back_grade: 'TFG 10', notes: 'note, with comma',
    front_left_mm: '1.92', front_right_mm: '1.96', front_top_mm: '2.22', front_bottom_mm: '2.36',
    back_left_mm: '4.27', back_right_mm: '4.20', back_top_mm: '10.82', back_bottom_mm: '10.33' }],
  [B]: [{ card_number: 1, front_grade: 'TFG 10', back_grade: null,
    front_left_mm: '3.97', front_right_mm: '4.29', front_top_mm: '1.56', front_bottom_mm: '3.04' }],
};

mockPool.query.mockImplementation(async (sql, params) => {
  const id = params[0];
  if (sql.includes('FROM cards')) return { rows: (cards[id] || []).map((c) => ({ ...c })) };
  if (sql.includes('FROM submissions')) return { rows: submissions[id] ? [submissions[id]] : [] };
  return { rows: [] };
});

const app = express();
app.use(express.json());
app.use('/', exportRouter);

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('POST /export-all', () => {
  it('puts every submission in one ZIP with a library.csv of all cards', async () => {
    const res = await request(app).post('/export-all').send({ ids: [A, B, MISSING] }).buffer().parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/tfg_library_\d{4}-\d{2}-\d{2}\.zip/);

    const zip = await JSZip.loadAsync(res.body);
    const names = Object.keys(zip.files);
    expect(names).toEqual(expect.arrayContaining([
      'library.csv', 'library.json',
      'tfg0005132/grades.csv', 'tfg0005132/submission.json', 'tfg0005132/card-1/metadata.json',
      'tfg0005132_2/grades.csv', 'tfg0005132_2/card-1/metadata.json',
    ]));

    const csv = (await zip.file('library.csv').async('string')).trim().split('\n');
    expect(csv).toHaveLength(3);
    expect(csv[0]).toMatch(/^Submission,Submission Completed,Card Number,Folder,/);
    expect(csv[1]).toBe('TFG0005132,yes,1,tfg0005132/card-1,TFG 9.5,TFG 10,TFG 9.5,1.92,1.96,2.22,2.36,4.27,4.20,10.82,10.33,48.5,49.5,"note, with comma"');
    expect(csv[2]).toBe('tfg0005132,no,1,tfg0005132_2/card-1,TFG 10,,TFG 10,3.97,4.29,1.56,3.04,,,,,33.9,48.1,');

    const summary = JSON.parse(await zip.file('library.json').async('string'));
    expect(summary.cardCount).toBe(2);
    expect(summary.skippedSubmissionIds).toEqual([MISSING]);

    const grades = (await zip.file('tfg0005132/grades.csv').async('string')).split('\n');
    expect(grades[0]).toMatch(/Front Top \(%\),Front Left \(%\)$/);
    expect(grades[1]).toMatch(/,48\.5,49\.5$/);
  });

  it.each([
    [{}, /non-empty array/],
    [{ ids: [] }, /non-empty array/],
    [{ ids: ['not-a-uuid'] }, /valid UUID/],
  ])('rejects %j', async (body, message) => {
    const res = await request(app).post('/export-all').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(message);
  });
});

describe('sharePct', () => {
  it('gives the first border as a share of both, blank when unmeasured', () => {
    expect(sharePct('1.56', '3.04')).toBe('33.9');
    expect(sharePct(null, '1')).toBe('');
    expect(sharePct('0', '0')).toBe('');
  });
});
