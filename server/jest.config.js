module.exports = {
  testEnvironment: 'node',
  testTimeout: 10000,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
