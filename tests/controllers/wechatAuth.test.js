const { getOpenid, getUserInfo, registerUser } = require('../../controllers/wechatAuth');
const { createTestUser, createMockRequest, createMockResponse } = require('../helpers/testUtils');
const User = require('../../models/User');
const TempUser = require('../../models/TempUser');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('WeChat Auth Controller Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOpenid', () => {
    test('should return openid successfully with valid code', async () => {
      const mockSession = {
        openid: 'test_openid_123',
        session_key: 'test_session_key'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      const req = createMockRequest({
        body: { code: 'test_code' }
      });
      const res = createMockResponse();

      await getOpenid(req, res);

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('test_code')
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: '获取openid成功',
        data: {
          openid: 'test_openid_123'
        }
      });
    });

    test('should return error when code is missing', async () => {
      const req = createMockRequest({
        body: {}
      });
      const res = createMockResponse();

      await getOpenid(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'code参数是必需的'
      });
    });

    test('should handle WeChat API error', async () => {
      const mockSession = {
        errcode: 40029,
        errmsg: 'invalid code'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      const req = createMockRequest({
        body: { code: 'invalid_code' }
      });
      const res = createMockResponse();

      await getOpenid(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '微信登录失败: invalid code'
      });
    });

    test('should handle network error', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      const req = createMockRequest({
        body: { code: 'test_code' }
      });
      const res = createMockResponse();

      await getOpenid(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '微信服务请求失败'
      });
    });
  });

  describe('getUserInfo', () => {
    test('should return user info when user exists', async () => {
      const existingUser = await createTestUser({
        _id: 'test_openid_123',  // openid作为主键
        username: 'test_user',
        avatar: 'https://example.com/avatar.jpg'
      });

      const req = createMockRequest({
        body: { openid: 'test_openid_123' }
      });
      const res = createMockResponse();

      await getUserInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: '获取用户信息成功',
        data: {
          user: {
            _id: 'test_openid_123',  // _id就是openid
            username: 'test_user',
            avatar: 'https://example.com/avatar.jpg',
            isAdmin: false
          }
        }
      });
    });

    test('should return null when user does not exist', async () => {
      const req = createMockRequest({
        body: { openid: 'nonexistent_openid' }
      });
      const res = createMockResponse();

      await getUserInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: '用户不存在',
        data: null
      });
    });

    test('should return error when openid is missing', async () => {
      const req = createMockRequest({
        body: {}
      });
      const res = createMockResponse();

      await getUserInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'openid参数是必需的'
      });
    });

    test('should handle database error', async () => {
      const originalFindOne = User.findOne;
      User.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({
        body: { openid: 'test_openid_123' }
      });
      const res = createMockResponse();

      await getUserInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '数据库操作失败'
      });

      // 恢复原始方法
      User.findOne = originalFindOne;
    });
  });

  describe('registerUser', () => {
    test('should create new user successfully', async () => {
      const req = createMockRequest({
        body: {
          openid: 'test_openid_123',
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        }
      });
      const res = createMockResponse();

      await registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.message).toBe('用户注册成功');
      expect(response.data.user._id).toBe('test_openid_123');
      expect(response.data.user.username).toBe('new_user');
      expect(response.data.user.avatar).toBe('https://example.com/avatar.jpg');
      expect(response.data.user.isAdmin).toBe(false);

      // 验证用户是否被创建
      const createdUser = await User.findById('test_openid_123');
      expect(createdUser).toBeDefined();
      expect(createdUser.username).toBe('new_user');
    });

    test('should delete TempUser when registering', async () => {
      // 先创建一个临时用户
      const tempUser = await TempUser.create({
        _id: 'test_openid_456',
        discoverQuota: {
          count: 2,
          lastDate: '2026-02-12',
          dailyLimit: 3
        }
      });

      // 验证临时用户存在
      let foundTempUser = await TempUser.findById('test_openid_456');
      expect(foundTempUser).toBeDefined();

      // 注册真实用户
      const req = createMockRequest({
        body: {
          openid: 'test_openid_456',
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        }
      });
      const res = createMockResponse();

      await registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(201);

      // 验证真实用户被创建
      const createdUser = await User.findById('test_openid_456');
      expect(createdUser).toBeDefined();

      // 验证临时用户被删除
      foundTempUser = await TempUser.findById('test_openid_456');
      expect(foundTempUser).toBeNull();
    });

    test('should return error when openid is missing', async () => {
      const req = createMockRequest({
        body: {
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        }
      });
      const res = createMockResponse();

      await registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'openid、username和avatar参数都是必需的'
      });
    });

    test('should return error when username is missing', async () => {
      const req = createMockRequest({
        body: {
          openid: 'test_openid_123',
          avatar: 'https://example.com/avatar.jpg'
        }
      });
      const res = createMockResponse();

      await registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'openid、username和avatar参数都是必需的'
      });
    });

    test('should return error when avatar is missing', async () => {
      const req = createMockRequest({
        body: {
          openid: 'test_openid_123',
          username: 'new_user'
        }
      });
      const res = createMockResponse();

      await registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'openid、username和avatar参数都是必需的'
      });
    });

    test('should return error when user already exists', async () => {
      await createTestUser({
        _id: 'test_openid_123',  // openid作为主键
        username: 'existing_user'
      });

      const req = createMockRequest({
        body: {
          openid: 'test_openid_123',
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        }
      });
      const res = createMockResponse();

      await registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '用户已存在'
      });
    });

    test('should handle database error', async () => {
      const originalFindOne = User.findOne;
      const originalCreate = User.create;
      User.findOne = jest.fn().mockResolvedValue(null);
      User.create = jest.fn().mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({
        body: {
          openid: 'test_openid_123',
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        }
      });
      const res = createMockResponse();

      await registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '数据库操作失败'
      });

      // 恢复原始方法
      User.findOne = originalFindOne;
      User.create = originalCreate;
    });

    test('should handle unique constraint error', async () => {
      const originalFindOne = User.findOne;
      const originalCreate = User.create;
      User.findOne = jest.fn().mockResolvedValue(null);
      const duplicateError = new Error('Duplicate key error');
      duplicateError.code = 11000;
      User.create = jest.fn().mockRejectedValue(duplicateError);

      const req = createMockRequest({
        body: {
          openid: 'test_openid_123',
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        }
      });
      const res = createMockResponse();

      await registerUser(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'openid已存在'
      });

      // 恢复原始方法
      User.findOne = originalFindOne;
      User.create = originalCreate;
    });
  });
}); 