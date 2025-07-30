const { login } = require('../../controllers/wechatAuth');
const { createTestUser, createMockRequest, createMockResponse } = require('../helpers/testUtils');
const User = require('../../models/User');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('WeChat Auth Controller Test', () => {
  describe('login', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should create new user when user does not exist', async () => {
      const mockSession = {
        openid: 'test_openid_123',
        session_key: 'test_session_key'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      const req = createMockRequest({
        body: { code: 'test_code' }
      });
      const res = createMockResponse();

      await login(req, res);

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('test_code')
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: '用户创建成功',
        data: {
          user: expect.objectContaining({
            openid: 'test_openid_123',
            username: expect.stringContaining('用户'),
            avatar: ''
          }),
          openid: 'test_openid_123'
        }
      });

      // 验证用户是否被创建
      const createdUser = await User.findOne({ openid: 'test_openid_123' });
      expect(createdUser).toBeDefined();
      expect(createdUser.username).toMatch(/^用户/);
    });

    test('should return existing user when user exists', async () => {
      const existingUser = await createTestUser({
        openid: 'test_openid_123',
        username: 'existing_user'
      });

      const mockSession = {
        openid: 'test_openid_123',
        session_key: 'test_session_key'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      const req = createMockRequest({
        body: { code: 'test_code' }
      });
      const res = createMockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.message).toBe('登录成功');
      expect(response.data.openid).toBe('test_openid_123');
      expect(response.data.user.openid).toBe('test_openid_123');
      expect(response.data.user.username).toBe('existing_user');
      expect(response.data.user.avatar).toBe("https://example.com/avatar.jpg");
      expect(response.data.user._id).toBeDefined();
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

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        message: '微信登录失败: invalid code'
      });
    });

    test('should handle axios request error', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      const req = createMockRequest({
        body: { code: 'test_code' }
      });
      const res = createMockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: '微信服务请求失败'
      });
    });

    test('should handle database error during user creation', async () => {
      const mockSession = {
        openid: 'test_openid_123',
        session_key: 'test_session_key'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      // 模拟数据库错误
      const originalCreate = User.create;
      User.create = jest.fn().mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({
        body: { code: 'test_code' }
      });
      const res = createMockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: '数据库操作失败'
      });

      // 恢复原始方法
      User.create = originalCreate;
    });

    test('should handle database error during user lookup', async () => {
      const mockSession = {
        openid: 'test_openid_123',
        session_key: 'test_session_key'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      // 模拟数据库错误
      const originalFindOne = User.findOne;
      User.findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({
        body: { code: 'test_code' }
      });
      const res = createMockResponse();

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: '数据库操作失败'
      });

      // 恢复原始方法
      User.findOne = originalFindOne;
    });

    test('should generate username with last 6 characters of openid', async () => {
      const mockSession = {
        openid: 'test_openid_123456',
        session_key: 'test_session_key'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      const req = createMockRequest({
        body: { code: 'test_code' }
      });
      const res = createMockResponse();

      await login(req, res);

      const createdUser = await User.findOne({ openid: 'test_openid_123456' });
      expect(createdUser.username).toBe('用户123456');
    });
  });
}); 