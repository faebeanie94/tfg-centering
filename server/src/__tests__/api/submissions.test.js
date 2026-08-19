const request = require('supertest');
const express = require('express');

// Mock dependencies FIRST
const mockPool = { query: jest.fn() };

jest.mock('../../server', () => ({
  pool: mockPool,
}));

jest.mock('../../services/s3', () => ({
  deleteSubmissionImages: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/localStorage', () => ({
  saveSubmissionMetadata: jest.fn().mockResolvedValue(undefined),
  deleteSubmissionFolder: jest.fn().mockResolvedValue(undefined),
}));

// NOW import after mocks are defined
const submissionsRouter = require('../../api/submissions');
const { uuidv4 } = require('../setup');

// Create test app
const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/', submissionsRouter);
  return app;
};

describe('Submissions API', () => {
  let app;
  const testId = uuidv4();
  const testSubmission = {
    id: testId,
    name: 'Test Submission',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
  });

  describe('POST /', () => {
    it('should create a submission with valid name', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [testSubmission] });

      const res = await request(app)
        .post('/')
        .send({ name: 'Test Submission' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(testSubmission);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO submissions'),
        ['Test Submission']
      );
    });

    it('should reject submission without name', async () => {
      const res = await request(app)
        .post('/')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should reject submission with empty name', async () => {
      const res = await request(app)
        .post('/')
        .send({ name: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('should reject submission with name > 255 chars', async () => {
      const longName = 'a'.repeat(256);
      const res = await request(app)
        .post('/')
        .send({ name: longName });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /', () => {
    it('should list all submissions', async () => {
      const submissions = [testSubmission];
      mockPool.query.mockResolvedValueOnce({ rows: submissions });

      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(submissions);
    });
  });

  describe('GET /:id', () => {
    it('should get submission by ID', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [testSubmission] });

      const res = await request(app).get(`/${testId}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(testSubmission);
    });

    it('should return 404 for non-existent submission', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get(`/${testId}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Submission not found');
    });

    it('should reject invalid UUID', async () => {
      const res = await request(app).get('/invalid-id');

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('PUT /:id', () => {
    it('should update submission name', async () => {
      const updated = { ...testSubmission, name: 'Updated' };
      mockPool.query.mockResolvedValueOnce({ rows: [updated] });

      const res = await request(app)
        .put(`/${testId}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });

    it('should return 404 for non-existent submission', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .put(`/${testId}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Submission not found');
    });
  });

  describe('DELETE /:id', () => {
    it('should delete submission', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [testSubmission] });

      const res = await request(app).delete(`/${testId}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Submission deleted');
      expect(res.body.id).toBe(testId);
    });

    it('should return 404 for non-existent submission', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const res = await request(app).delete(`/${testId}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Submission not found');
    });
  });
});
