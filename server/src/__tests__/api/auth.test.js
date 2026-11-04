const request = require('supertest');

const mockPool = { query: jest.fn(), on: jest.fn() };

jest.mock('pg', () => ({ Pool: jest.fn(() => mockPool) }));
jest.mock('../../services/db', () => ({
  initializeDatabase: jest.fn().mockResolvedValue(undefined),
}));

const PASSWORD = 'correct horse battery staple';
process.env.TEAM_PASSWORD = PASSWORD;

// The real app, so these tests cover how the routes are wired together.
const { app } = require('../../server');
const { failedLogins } = require('../../middleware/auth');

const sessionCookie = (res) => res.headers['set-cookie'][0].split(';')[0];

describe('API authentication', () => {
  beforeEach(() => {
    process.env.TEAM_PASSWORD = PASSWORD;
    failedLogins.clear();
    mockPool.query.mockResolvedValue({ rows: [] });
  });

  it.each([
    ['get', '/api/submissions'],
    ['post', '/api/submissions'],
    ['put', '/api/submissions/9f0c2f3e-7a57-4a0e-8d4e-2b1f3c4d5e6f'],
    ['delete', '/api/submissions/9f0c2f3e-7a57-4a0e-8d4e-2b1f3c4d5e6f'],
    ['get', '/api/submissions/9f0c2f3e-7a57-4a0e-8d4e-2b1f3c4d5e6f/export'],
    ['get', '/api/submissions/9f0c2f3e-7a57-4a0e-8d4e-2b1f3c4d5e6f/cards/1/image/front'],
  ])('rejects unauthenticated %s %s', async (method, path) => {
    const res = await request(app)[method](path);

    expect(res.status).toBe(401);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('rejects a request with an invalid session cookie', async () => {
    const res = await request(app)
      .get('/api/submissions')
      .set('Cookie', `tfg_session=${Date.now() + 60000}.${'0'.repeat(64)}`);

    expect(res.status).toBe(401);
  });

  it('rejects a wrong password without setting a cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'nope' });

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('lets a signed-in client reach the API', async () => {
    const login = await request(app).post('/api/auth/login').send({ password: PASSWORD });
    expect(login.status).toBe(204);
    expect(login.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(login.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);

    const res = await request(app).get('/api/submissions').set('Cookie', sessionCookie(login));

    expect(res.status).toBe(200);
  });

  it('sets a Secure cookie in production', async () => {
    process.env.NODE_ENV = 'production';
    try {
      const login = await request(app).post('/api/auth/login').send({ password: PASSWORD });
      expect(login.headers['set-cookie'][0]).toMatch(/Secure/);
    } finally {
      process.env.NODE_ENV = 'test';
    }
  });

  it('rejects an expired session', async () => {
    const login = await request(app).post('/api/auth/login').send({ password: PASSWORD });
    const realNow = Date.now;
    Date.now = () => realNow() + 31 * 24 * 60 * 60 * 1000;
    try {
      const res = await request(app).get('/api/submissions').set('Cookie', sessionCookie(login));
      expect(res.status).toBe(401);
    } finally {
      Date.now = realNow;
    }
  });

  it('signs everyone out when the password changes', async () => {
    const login = await request(app).post('/api/auth/login').send({ password: PASSWORD });
    process.env.TEAM_PASSWORD = 'a new password';

    const res = await request(app).get('/api/submissions').set('Cookie', sessionCookie(login));

    expect(res.status).toBe(401);
  });

  it('fails closed when no password is configured', async () => {
    const login = await request(app).post('/api/auth/login').send({ password: PASSWORD });
    delete process.env.TEAM_PASSWORD;

    const api = await request(app).get('/api/submissions').set('Cookie', sessionCookie(login));
    const retry = await request(app).post('/api/auth/login').send({ password: '' });

    expect(api.status).toBe(401);
    expect(retry.status).toBe(503);
  });

  it('locks out repeated failed logins, even with the right password', async () => {
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/login').send({ password: 'nope' });
    }

    const res = await request(app).post('/api/auth/login').send({ password: PASSWORD });

    expect(res.status).toBe(429);
  });

  it('sends no CORS headers', async () => {
    const res = await request(app)
      .get('/api/submissions')
      .set('Origin', 'https://evil.example.com');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps the health check public', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });
});
