# Backend Testing

## Setup

Install test dependencies:
```bash
npm install
```

## Running Tests

Run all tests:
```bash
npm test
```

Watch mode (re-runs on file changes):
```bash
npm run test:watch
```

## Test Coverage

Tests are organized by module:

### API Tests (`src/__tests__/api/`)
- **submissions.test.js** - Submission CRUD endpoints
  - POST / - Create submission
  - GET / - List submissions
  - GET /:id - Get submission
  - PUT /:id - Update submission
  - DELETE /:id - Delete submission

- **cards.test.js** - Card endpoints
  - POST /:submissionId/cards - Upload card with images
  - GET /:submissionId/cards - List cards
  - GET /:submissionId/cards/:cardNumber - Get card
  - PUT /:submissionId/cards/:cardNumber - Update card metadata
  - DELETE /:submissionId/cards/:cardNumber - Delete card

### Middleware Tests (`src/__tests__/middleware/`)
- **validation.test.js** - Input validation
  - Submission name validation
  - Card number validation
  - UUID validation
  - Card metadata validation

- **errorHandler.test.js** - Error handling
  - AppError class
  - Async handler wrapper
  - Database error mapping
  - HTTP status codes

## Test Structure

Each test file:
1. Mocks database queries
2. Mocks external services (S3, localStorage)
3. Tests happy path
4. Tests error cases
5. Validates HTTP status codes
6. Validates response format

## Mocking

Tests use Jest mocks for:
- Database pool (pg)
- S3 service
- Local storage service

This allows tests to run without external dependencies.

## Adding New Tests

When adding new endpoints:
1. Create test file in appropriate `src/__tests__/` directory
2. Mock database and services
3. Test happy path
4. Test validation failures
5. Test not found cases
6. Test error handling

Example:
```javascript
it('should handle specific case', async () => {
  mockPool.query.mockResolvedValueOnce({ rows: [...] });
  
  const res = await request(app)
    .get('/endpoint')
    .expect(200)
    .expect(res => {
      expect(res.body).toEqual(...);
    });
});
```
