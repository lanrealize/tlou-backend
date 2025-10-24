const mongoose = require('mongoose');
const User = require('../../models/User');
const Circle = require('../../models/Circle');
const Post = require('../../models/Post');

// 生成测试用户
const createTestUser = async (userData = {}) => {
  const defaultUser = {
    _id: userData._id || `test_openid_${Date.now()}`,  // openid作为主键
    username: `testuser_${Date.now()}`,
    avatar: 'https://example.com/avatar.jpg',
    ...userData
  };
  
  // 移除重复的_id，避免覆盖
  if (userData._id) {
    delete defaultUser._id;
    defaultUser._id = userData._id;
  }
  
  return await User.create(defaultUser);
};

// 生成测试朋友圈
const createTestCircle = async (circleData = {}, creator = null) => {
  if (!creator) {
    creator = await createTestUser();
  }
  
  const defaultCircle = {
    name: `测试朋友圈_${Date.now()}`,
    creator: creator._id,
    members: [creator._id],
    isPublic: true,
    ...circleData
  };
  
  return await Circle.create(defaultCircle);
};

// 生成测试帖子
const createTestPost = async (postData = {}, author = null, circle = null) => {
  if (!author) {
    author = await createTestUser();
  }
  if (!circle) {
    circle = await createTestCircle({}, author);
  }
  
  const defaultPost = {
    content: `测试帖子内容_${Date.now()}`,
    author: author._id,
    circle: circle._id,
    images: [],
    likes: [],
    comments: [],
    ...postData
  };
  
  return await Post.create(defaultPost);
};

// 模拟请求对象
const createMockRequest = (data = {}) => {
  return {
    body: data.body || {},
    query: data.query || {},
    params: data.params || {},
    headers: data.headers || {},
    user: data.user || null,
    ...data
  };
};

// 模拟响应对象
const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

// 模拟next函数
const createMockNext = () => {
  return jest.fn();
};

// 生成有效的ObjectId
const generateObjectId = () => {
  return new mongoose.Types.ObjectId();
};

// 清理测试数据
const cleanupTestData = async () => {
  await User.deleteMany({});
  await Circle.deleteMany({});
  await Post.deleteMany({});
};

module.exports = {
  createTestUser,
  createTestCircle,
  createTestPost,
  createMockRequest,
  createMockResponse,
  createMockNext,
  generateObjectId,
  cleanupTestData
}; 