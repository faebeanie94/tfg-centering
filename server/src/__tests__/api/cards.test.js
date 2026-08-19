const request = require('supertest');
const express = require('express');
const fileUpload = require('express-fileupload');
const cardsRouter = require('../../api/cards');
const { mockPool, uuidv4 } = require('../setup');

jest.mock('../../server', () => ({
  pool: mockPool,
}));

jest.mock('../../services/s3', () => ({
  uploadImage: jest.fn().mockResolvedValue('https://s3.example.com/image.jpg'),
  deleteImage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/localStorage', () => ({
  saveCardImage: jest.fn().mockResolvedValue(null),
  saveCardMetadata: jest.fn().mockResolvedValue(undefined),
  deleteCardFolder: jest.fn().mockResolvedValue(undefined),
}));

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
    front_s3_url: 'https://s3.example.com/front.jpg',
    back_s3_url: 'https://s3.example.com/back.jpg',
    front_local_path: null,
    back_local_path: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
      expect(res.body).toEqual([testCard]);
    });
  });

  describe('GET /:submissionId/cards/:cardNumber', () => {
    it('should get card by number', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [testCard] });

      const res = await request(app).get(`/${submissionId}/cards/1`);

      expect(res.status).toBe(200);
      expect(res.body.card_number).toBe(1);
    });

    it('should return 404 for non-existent card', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(`/${submissionId}/cards/999`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Card not found');
    });
  });

  describe('PUT /:submissionId/cards/:cardNumber', () => {
    it('should update card metadata', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: cardId }] }) // Update card
        .mockResolvedValueOnce({ rows: [testCard] }); // Fetch updated card

      const metadata = {
        frontGrade: 'PSA 9',
        backGrade: 'PSA 8',
        condition: 'Mint',
        notes: 'Nice card',
      };

      const res = await request(app)
        .put(`/${submissionId}/cards/1`)
        .send({ metadata });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /:submissionId/cards/:cardNumber', () => {
    it('should delete card', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [testCard] });

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
