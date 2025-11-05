const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// 在所有测试开始前设置
beforeAll(async () => {
  try {
    // 启动内存数据库（增加启动超时时间）
    mongoServer = await MongoMemoryServer.create({
      instance: {
        launchTimeout: 30000 // 30秒启动超时
      }
    });
    const mongoUri = mongoServer.getUri();
    
    // 连接到测试数据库
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000, // 减少服务器选择超时
      socketTimeoutMS: 10000, // 减少socket超时
      maxPoolSize: 1, // 减少连接池大小
      minPoolSize: 0
    });
  } catch (error) {
    console.error('Failed to start MongoDB memory server:', error);
    throw error;
  }
});

// 每个测试后清理数据
afterEach(async () => {
  try {
    if (mongoose.connection.readyState === 1) { // 确保连接是活跃的
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany();
      }
    }
  } catch (error) {
    console.error('Failed to cleanup test data:', error);
  }
});

// 所有测试结束后清理
afterAll(async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (error) {
    console.error('Failed to cleanup test environment:', error);
  }
});

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.APP_ID = 'test_app_id';
process.env.APP_SECRET = 'test_app_secret'; 