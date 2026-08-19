module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
  testPathIgnorePatterns: ['src/__tests__/setup.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/__tests__/**',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
