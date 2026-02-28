const { getOpenid, getUserInfo, completeProfile } = require('../../controllers/wechatAuth');
const { createTestUser, createMockRequest, createMockResponse } = require('../helpers/testUtils');
const User = require('../../models/User');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('WeChat Auth Controller Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOpenid', () => {
    test('should return openid and upsert User successfully', async () => {
      const mockSession = {
        openid: 'test_openid_123',
        session_key: 'test_session_key'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      const req = createMockRequest({ body: { code: 'test_code' } });
      const res = createMockResponse();

      await getOpenid(req, res);

      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('test_code'));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: '获取openid成功',
        data: { openid: 'test_openid_123' }
      });

      // 验证 User 已被 upsert
      const user = await User.findById('test_openid_123');
      expect(user).not.toBeNull();
      expect(user.username).toBe('');
      expect(user.avatar).toBe('');
    });

    test('should be idempotent when called multiple times with same openid', async () => {
      const mockSession = { openid: 'test_openid_idempotent' };
      axios.get.mockResolvedValue({ data: mockSession });

      const req = createMockRequest({ body: { code: 'test_code' } });
      const res = createMockResponse();

      // 第一次调用
      await getOpenid(req, res);
      // 第二次调用（模拟用户重新打开小程序）
      await getOpenid(req, res);

      const users = await User.find({ _id: 'test_openid_idempotent' });
      expect(users.length).toBe(1);
    });

    test('should return error when code is missing', async () => {
      const req = createMockRequest({ body: {} });
      const res = createMockResponse();

      await getOpenid(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'code参数是必需的'
      });
    });

    test('should handle WeChat API error', async () => {
      axios.get.mockResolvedValue({ data: { errcode: 40029, errmsg: 'invalid code' } });

      const req = createMockRequest({ body: { code: 'invalid_code' } });
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

      const req = createMockRequest({ body: { code: 'test_code' } });
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
    test('should return user info with isProfileComplete=true for complete profile', async () => {
      await createTestUser({
        _id: 'test_openid_123',
        username: 'test_user',
        avatar: 'https://example.com/avatar.jpg'
      });

      const req = createMockRequest({ body: { openid: 'test_openid_123' } });
      const res = createMockResponse();

      await getUserInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: '获取用户信息成功',
        data: {
          user: {
            _id: 'test_openid_123',
            username: 'test_user',
            avatar: 'https://example.com/avatar.jpg',
            isAdmin: false,
            isProfileComplete: true
          }
        }
      });
    });

    test('should return isProfileComplete=false for empty profile', async () => {
      // 模拟 getOpenid upsert 出来的空 User
      await User.create({ _id: 'test_openid_empty' });

      const req = createMockRequest({ body: { openid: 'test_openid_empty' } });
      const res = createMockResponse();

      await getUserInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const response = res.json.mock.calls[0][0];
      expect(response.data.user.isProfileComplete).toBe(false);
      expect(response.data.user.username).toBe('');
    });

    test('should return 404 when user does not exist', async () => {
      const req = createMockRequest({ body: { openid: 'nonexistent_openid' } });
      const res = createMockResponse();

      await getUserInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '用户不存在'
      });
    });

    test('should return error when openid is missing', async () => {
      const req = createMockRequest({ body: {} });
      const res = createMockResponse();

      await getUserInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'openid参数是必需的'
      });
    });
  });

  describe('completeProfile', () => {
    test('should complete profile successfully', async () => {
      await User.create({ _id: 'test_openid_456' });

      const req = createMockRequest({
        body: {
          openid: 'test_openid_456',
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        }
      });
      const res = createMockResponse();

      await completeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const response = res.json.mock.calls[0][0];
      expect(response.success).toBe(true);
      expect(response.message).toBe('用户资料完善成功');
      expect(response.data.user.username).toBe('new_user');
      expect(response.data.user.isProfileComplete).toBe(true);

      const updatedUser = await User.findById('test_openid_456');
      expect(updatedUser.username).toBe('new_user');
      expect(updatedUser.avatar).toBe('https://example.com/avatar.jpg');
    });

    test('should return 409 when profile already complete', async () => {
      await createTestUser({
        _id: 'test_openid_789',
        username: 'existing_user',
        avatar: 'https://example.com/avatar.jpg'
      });

      const req = createMockRequest({
        body: {
          openid: 'test_openid_789',
          username: 'new_name',
          avatar: 'https://example.com/new.jpg'
        }
      });
      const res = createMockResponse();

      await completeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '用户资料已完善，请勿重复提交'
      });
    });

    test('should return 404 when user does not exist', async () => {
      const req = createMockRequest({
        body: {
          openid: 'nonexistent_openid',
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        }
      });
      const res = createMockResponse();

      await completeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '用户不存在'
      });
    });

    test('should return 400 when username is missing', async () => {
      const req = createMockRequest({
        body: { openid: 'test_openid_123', avatar: 'https://example.com/avatar.jpg' }
      });
      const res = createMockResponse();

      await completeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'openid、username和avatar参数都是必需的'
      });
    });

    test('should return 400 when avatar is missing', async () => {
      const req = createMockRequest({
        body: { openid: 'test_openid_123', username: 'new_user' }
      });
      const res = createMockResponse();

      await completeProfile(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'openid、username和avatar参数都是必需的'
      });
    });
  });
});
