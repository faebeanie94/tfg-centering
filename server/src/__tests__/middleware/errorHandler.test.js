const { AppError, asyncHandler, errorHandler } = require('../../middleware/errorHandler');

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Error Handler Middleware', () => {
  describe('AppError', () => {
    it('should create error with status code', () => {
      const error = new AppError('Test error', 400);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error).toBeInstanceOf(Error);
    });

    it('should default to 500 status', () => {
      const error = new AppError('Test error');

      expect(error.statusCode).toBe(500);
    });
  });

  describe('asyncHandler', () => {
    it('should catch async errors', async () => {
      const next = jest.fn();
      const handler = asyncHandler(async (req, res) => {
        throw new Error('Test error');
      });

      await handler({}, {}, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should pass through successful responses', async () => {
      const req = {};
      const res = { send: jest.fn() };
      const next = jest.fn();

      const handler = asyncHandler(async (req, res) => {
        res.send('success');
      });

      await handler(req, res, next);

      expect(res.send).toHaveBeenCalledWith('success');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('errorHandler', () => {
    it('should handle AppError', () => {
      const error = new AppError('Bad request', 400);
      const req = { path: '/test', method: 'GET' };
      const res = createMockResponse();
      const next = jest.fn();

      errorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Bad request' });
    });

    it('should handle duplicate key error (23505)', () => {
      const error = new Error('Duplicate key');
      error.code = '23505';
      const req = { path: '/test', method: 'GET' };
      const res = createMockResponse();

      errorHandler(error, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Resource already exists',
      });
    });

    it('should handle foreign key error (23503)', () => {
      const error = new Error('Foreign key violation');
      error.code = '23503';
      const req = { path: '/test', method: 'GET' };
      const res = createMockResponse();

      errorHandler(error, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid reference: parent resource not found',
      });
    });

    it('should return 500 for generic errors', () => {
      const error = new Error('Unexpected error');
      const req = { path: '/test', method: 'GET' };
      const res = createMockResponse();

      errorHandler(error, req, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
    });
  });
});
