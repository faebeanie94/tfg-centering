const mockList = jest.fn();
const mockRemove = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockCreateSignedUrls = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockGetBucket = jest.fn();
const mockCreateBucket = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      getBucket: mockGetBucket,
      createBucket: mockCreateBucket,
      from: () => ({
        list: mockList,
        remove: mockRemove,
        createSignedUrl: mockCreateSignedUrl,
        createSignedUrls: mockCreateSignedUrls,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}));

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'test-key';

const {
  deleteImage,
  deleteSubmissionImages,
  ensureBucket,
  getPresignedUrl,
  signCardImageUrls,
} = require('../../services/supabase');

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

describe('ensureBucket', () => {
  beforeEach(() => jest.resetAllMocks());

  it('creates the bucket as private', async () => {
    mockGetBucket.mockResolvedValue({ data: null, error: { statusCode: 404 } });
    mockCreateBucket.mockResolvedValue({ error: null });

    await expect(ensureBucket()).resolves.toBe(true);

    expect(mockCreateBucket).toHaveBeenCalledWith('tfg-submissions', { public: false });
  });
});

describe('getPresignedUrl', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns a signed URL, never a public one', async () => {
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.supabase.co/signed' },
      error: null,
    });

    await expect(getPresignedUrl('sub', 1, 'front')).resolves.toBe(
      'https://example.supabase.co/signed'
    );

    expect(mockCreateSignedUrl).toHaveBeenCalledWith('sub/card-1/front.jpg', 3600);
    expect(mockGetPublicUrl).not.toHaveBeenCalled();
  });

  it('returns null when the image cannot be signed', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: new Error('Object not found') });

    await expect(getPresignedUrl('sub', 1, 'front')).resolves.toBeNull();
  });
});

describe('signCardImageUrls', () => {
  const card = (number, front, back) => ({
    card_number: number,
    front_image_url: front,
    back_image_url: back,
  });
  const stored = 'https://example.supabase.co/storage/v1/object/public/tfg-submissions/stored.jpg';

  beforeEach(() => jest.resetAllMocks());

  it('signs the stored images of every card in one request', async () => {
    mockCreateSignedUrls.mockImplementation(async (paths) => ({
      data: paths.map((path) => ({ path, signedUrl: `signed:${path}`, error: null })),
      error: null,
    }));

    const signed = await signCardImageUrls('sub', [
      card(1, stored, stored),
      card(2, stored, null),
    ]);

    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
    expect(signed).toEqual([
      card(1, 'signed:sub/card-1/front.jpg', 'signed:sub/card-1/back.jpg'),
      card(2, 'signed:sub/card-2/front.jpg', null),
    ]);
  });

  it('keeps the other fields on each card', async () => {
    mockCreateSignedUrls.mockResolvedValue({ data: [], error: null });

    const [signed] = await signCardImageUrls('sub', [{ ...card(1, stored, null), front_grade: '9' }]);

    expect(signed.front_grade).toBe('9');
  });

  it('skips storage when no card has an image', async () => {
    await signCardImageUrls('sub', [card(1, null, null)]);

    expect(mockCreateSignedUrls).not.toHaveBeenCalled();
  });

  it('returns null for an image storage cannot find', async () => {
    mockCreateSignedUrls.mockResolvedValue({
      data: [
        { path: 'sub/card-1/front.jpg', signedUrl: 'signed', error: null },
        { path: 'sub/card-1/back.jpg', signedUrl: null, error: 'Object not found' },
      ],
      error: null,
    });

    await expect(signCardImageUrls('sub', [card(1, stored, stored)])).resolves.toEqual([
      card(1, 'signed', null),
    ]);
  });

  it('never returns a stored URL when signing fails', async () => {
    mockCreateSignedUrls.mockResolvedValue({ data: null, error: new Error('storage down') });

    await expect(signCardImageUrls('sub', [card(1, stored, stored)])).resolves.toEqual([
      card(1, null, null),
    ]);
  });
});

describe('deleteImage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockRemove.mockResolvedValue({ error: null });
  });

  it.each([
    ['the public URL stored on older rows', '/object/public/tfg-submissions/sub/card-1/front.jpg'],
    ['a signed URL', '/object/sign/tfg-submissions/sub/card-1/front.jpg?token=abc'],
  ])('finds the file from %s', async (_, path) => {
    await expect(
      deleteImage(`https://example.supabase.co/storage/v1${path}`)
    ).resolves.toBe(true);

    expect(mockRemove).toHaveBeenCalledWith(['sub/card-1/front.jpg']);
  });
});
