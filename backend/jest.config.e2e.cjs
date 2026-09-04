const baseConfig = require('./jest.config.cjs');

module.exports = {
  ...baseConfig,
  maxWorkers: 1,
  setupFiles: ['<rootDir>/test/setup-e2e.ts'],
  testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
};
