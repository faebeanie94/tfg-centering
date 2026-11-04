const request = require('supertest');
const express = require('express');
const fileUpload = require('express-fileupload');

// Mock dependencies FIRST
const mockPool = { query: jest.fn() };

jest.mock('../../server', () => ({
  pool: mockPool,
}));

jest.mock('../../services/supabase', () => ({
  uploadImage: jest.fn().mockResolvedValue('https://storage.example.com/image.jpg'),
  deleteImage: jest.fn().mockResolvedValue(true),
  getPresignedUrl: jest.fn(async (submissionId, cardNumber, side) => `https://storage.example.com/signed/${side}.jpg`),
  signCardImageUrls: jest.fn(async (submissionId, cards) =>
    cards.map((card) => ({
      ...card,
      front_image_url: card.front_image_url && 'https://storage.example.com/signed/front.jpg',
      back_image_url: card.back_image_url && 'https://storage.example.com/signed/back.jpg',
    }))
  ),
}));

jest.mock('../../services/localStorage', () => ({
  saveCardImage: jest.fn().mockResolvedValue(null),
  saveCardMetadata: jest.fn().mockResolvedValue(undefined),
  deleteCardFolder: jest.fn().mockResolvedValue(undefined),
}));

// NOW import after mocks are defined
const cardsRouter = require('../../api/cards');
const { saveCardMetadata } = require('../../services/localStorage');
const { uuidv4 } = require('../setup');

const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));
  app.use('/', cardsRouter);
  return app;
};

describe('Cards API', () => {
  let app;
  const submissionId = uuidv4();
  const cardId = uuidv4();

  const testCard = {
    id: cardId,
    submission_id: submissionId,
    card_number: 1,
    front_image_url: 'https://s3.example.com/front.jpg',
    back_image_url: 'https://s3.example.com/back.jpg',
    front_local_path: null,
    back_local_path: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const signedCard = {
    ...testCard,
    front_image_url: 'https://storage.example.com/signed/front.jpg',
    back_image_url: 'https://storage.example.com/signed/back.jpg',
  };

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  describe('POST /:submissionId/cards', () => {
    it('should create a card with image files', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: submissionId }] }) // Check submission exists
        .mockResolvedValueOnce({ rows: [testCard] }); // Insert card

      const res = await request(app)
        .post(`/${submissionId}/cards`)
        .field('cardNumber', '1')
        .attach('frontImage', Buffer.from('fake image'), 'front.jpg');

      expect(res.status).toBe(201);
      expect(res.body.card_number).toBe(1);
    });

    it('should return signed URLs but keep the stored ones in card.json', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: submissionId }] })
        .mockResolvedValueOnce({ rows: [testCard] });

      const res = await request(app)
        .post(`/${submissionId}/cards`)
        .field('cardNumber', '1')
        .attach('frontImage', Buffer.from('fake image'), 'front.jpg');

      expect(res.body.front_image_url).toBe(signedCard.front_image_url);
      expect(saveCardMetadata).toHaveBeenCalledWith(submissionId, testCard, null);
    });

    it('should reject missing card number', async () => {
      const res = await request(app)
        .post(`/${submissionId}/cards`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject non-existent submission', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post(`/${submissionId}/cards`)
        .field('cardNumber', '1');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Submission not found');
    });
  });

  describe('GET /:submissionId/cards', () => {
    it('should list cards for submission', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [testCard] });

      const res = await request(app).get(`/${submissionId}/cards`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([signedCard]);
    });
  });

  describe('GET /:submissionId/cards/:cardNumber', () => {
    it('should get card by number', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [testCard] });

      const res = await request(app).get(`/${submissionId}/cards/1`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(signedCard);
    });

    it('should return 404 for non-existent card', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(`/${submissionId}/cards/999`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Card not found');
    });
  });

  describe('GET /:submissionId/cards/:cardNumber/image/:side', () => {
    const realFetch = global.fetch;

    afterEach(() => {
      global.fetch = realFetch;
    });

    it('should read the image through a signed URL', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [testCard] });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => Buffer.from('image'),
      });

      const res = await request(app).get(`/${submissionId}/cards/1/image/front`);

      expect(res.status).toBe(200);
      expect(global.fetch.mock.calls[0][0]).toBe(signedCard.front_image_url);
      expect(res.body.data).toBe(`data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`);
    });
  });

  describe('PUT /:submissionId/cards/:cardNumber', () => {
    it('should return signed URLs', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: cardId }] })
        .mockResolvedValueOnce({ rows: [testCard] });

      const res = await request(app).put(`/${submissionId}/cards/1`).send({});

      expect(res.status).toBe(200);
      expect(res.body).toEqual(signedCard);
    });

    it('should return 404 for non-existent card', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put(`/${submissionId}/cards/999`)
        .send({ metadata: {} });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Card not found');
    });
  });

  describe('DELETE /:submissionId/cards/:cardNumber', () => {
    it('should delete card', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [testCard] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app).delete(`/${submissionId}/cards/1`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Card deleted');
    });

    it('should return 404 for non-existent card', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete(`/${submissionId}/cards/999`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Card not found');
    });
  });
});
