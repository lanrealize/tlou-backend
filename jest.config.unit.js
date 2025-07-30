module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/tests/models/**/*.test.js',
    '**/tests/utils/**/*.test.js',
    '**/tests/middleware/**/*.test.js'
  ],
  collectCoverageFrom: [
    'models/**/*.js',
    'utils/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 5000, // 5秒超时
  maxWorkers: '75%', // 使用75%的CPU核心
  forceExit: true,
  detectOpenHandles: true,
  verbose: false,
  bail: 3
}; 