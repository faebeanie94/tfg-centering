const {
  validateSubmissionName,
  validateCardNumber,
  validateUUID,
  validateCardMetadata,
} = require('../../middleware/validation');

const createMockRequest = (body = {}, params = {}) => ({
  body,
  params,
});

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Validation Middleware', () => {
  let next;

  beforeEach(() => {
    next = jest.fn();
  });

  describe('validateSubmissionName', () => {
    it('should pass valid submission name', () => {
      const req = createMockRequest({ name: 'Valid Name' });
      const res = createMockResponse();

      validateSubmissionName(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject missing name', () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      validateSubmissionName(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject empty name', () => {
      const req = createMockRequest({ name: '   ' });
      const res = createMockResponse();

      validateSubmissionName(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject name > 255 chars', () => {
      const req = createMockRequest({ name: 'a'.repeat(256) });
      const res = createMockResponse();

      validateSubmissionName(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateCardNumber', () => {
    it('should pass valid card number', () => {
      const req = createMockRequest({ cardNumber: 1 });
      const res = createMockResponse();

      validateCardNumber(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject missing card number', () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      validateCardNumber(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject zero or negative card number', () => {
      const req = createMockRequest({ cardNumber: 0 });
      const res = createMockResponse();

      validateCardNumber(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateUUID', () => {
    it('should pass valid UUID', () => {
      const validUUID = '550e8400-e29b-41d4-a716-446655440000';
      const validator = validateUUID('id');
      const req = createMockRequest({}, { id: validUUID });
      const res = createMockResponse();

      validator(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject invalid UUID', () => {
      const validator = validateUUID('id');
      const req = createMockRequest({}, { id: 'invalid-uuid' });
      const res = createMockResponse();

      validator(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('validateCardMetadata', () => {
    it('should pass valid metadata', () => {
      const req = createMockRequest({
        metadata: {
          frontGrade: 'PSA 9',
          backGrade: 'PSA 8',
          condition: 'Mint',
          notes: 'Beautiful card',
        },
      });
      const res = createMockResponse();

      validateCardMetadata(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject front grade > 50 chars', () => {
      const req = createMockRequest({
        metadata: { frontGrade: 'a'.repeat(51) },
      });
      const res = createMockResponse();

      validateCardMetadata(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should reject notes > 5000 chars', () => {
      const req = createMockRequest({
        metadata: { notes: 'a'.repeat(5001) },
      });
      const res = createMockResponse();

      validateCardMetadata(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });
});
