module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  collectCoverageFrom: [
    'routes/**/*.js',
    'controllers/**/*.js',
    'middleware/**/*.js',
    'utils/**/*.js',
    'models/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 10000, // 减少到10秒
  maxWorkers: '50%', // 使用50%的CPU核心进行并行测试
  forceExit: true, // 强制退出
  detectOpenHandles: true, // 检测未关闭的句柄
  verbose: false, // 关闭详细输出以提高速度
  bail: 5, // 在5个测试失败后停止
  maxConcurrency: 5 // 限制并发测试数量
}; 