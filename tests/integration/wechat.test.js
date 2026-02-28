const request = require('supertest');
const express = require('express');
const { createTestUser } = require('../helpers/testUtils');
const { globalErrorHandler } = require('../../utils/errorHandler');
const User = require('../../models/User');

const app = express();
app.use(express.json());

const wechatRoutes = require('../../routes/wechat');
app.use('/api/wechat', wechatRoutes);
app.use(globalErrorHandler);

jest.mock('axios');
const axios = require('axios');

describe('WeChat Integration Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/wechat/get-openid', () => {
    test('should return openid and create empty User on first visit', async () => {
      axios.get.mockResolvedValue({ data: { openid: 'test_openid_123', session_key: 'key' } });

      const response = await request(app)
        .post('/api/wechat/get-openid')
        .send({ code: 'test_code' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '获取openid成功',
        data: { openid: 'test_openid_123' }
      });

      // 验证 User 已被自动创建
      const user = await User.findById('test_openid_123');
      expect(user).not.toBeNull();
      expect(user.username).toBe('');
      expect(user.avatar).toBe('');
    });

    test('should be idempotent on repeated visits', async () => {
      axios.get.mockResolvedValue({ data: { openid: 'repeat_openid' } });

      await request(app).post('/api/wechat/get-openid').send({ code: 'code1' }).expect(200);
      await request(app).post('/api/wechat/get-openid').send({ code: 'code2' }).expect(200);

      const users = await User.find({ _id: 'repeat_openid' });
      expect(users.length).toBe(1);
    });

    test('should return error when code is missing', async () => {
      const response = await request(app)
        .post('/api/wechat/get-openid')
        .send({})
        .expect(400);

      expect(response.body).toEqual({ success: false, message: 'code参数是必需的' });
    });

    test('should handle WeChat API error', async () => {
      axios.get.mockResolvedValue({ data: { errcode: 40029, errmsg: 'invalid code' } });

      const response = await request(app)
        .post('/api/wechat/get-openid')
        .send({ code: 'invalid_code' })
        .expect(400);

      expect(response.body).toEqual({ success: false, message: '微信登录失败: invalid code' });
    });

    test('should handle network error', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/api/wechat/get-openid')
        .send({ code: 'test_code' })
        .expect(500);

      expect(response.body).toEqual({ success: false, message: '微信服务请求失败' });
    });
  });

  describe('POST /api/wechat/get-user-info', () => {
    test('should return user info with isProfileComplete=true', async () => {
      await createTestUser({
        _id: 'test_openid_123',
        username: 'test_user',
        avatar: 'https://example.com/avatar.jpg'
      });

      const response = await request(app)
        .post('/api/wechat/get-user-info')
        .send({ openid: 'test_openid_123' })
        .expect(200);

      expect(response.body).toEqual({
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
      await User.create({ _id: 'empty_profile_openid' });

      const response = await request(app)
        .post('/api/wechat/get-user-info')
        .send({ openid: 'empty_profile_openid' })
        .expect(200);

      expect(response.body.data.user.isProfileComplete).toBe(false);
      expect(response.body.data.user.username).toBe('');
    });

    test('should return 404 when user does not exist', async () => {
      const response = await request(app)
        .post('/api/wechat/get-user-info')
        .send({ openid: 'nonexistent_openid' })
        .expect(404);

      expect(response.body).toEqual({ success: false, message: '用户不存在' });
    });

    test('should return error when openid is missing', async () => {
      const response = await request(app)
        .post('/api/wechat/get-user-info')
        .send({})
        .expect(400);

      expect(response.body).toEqual({ success: false, message: 'openid参数是必需的' });
    });
  });

  describe('POST /api/wechat/complete-profile', () => {
    test('should complete profile successfully', async () => {
      await User.create({ _id: 'test_openid_456' });

      const response = await request(app)
        .post('/api/wechat/complete-profile')
        .send({
          openid: 'test_openid_456',
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '用户资料完善成功',
        data: {
          user: expect.objectContaining({
            _id: 'test_openid_456',
            username: 'new_user',
            avatar: 'https://example.com/avatar.jpg',
            isProfileComplete: true
          })
        }
      });
    });

    test('should return 409 when profile already complete', async () => {
      await createTestUser({
        _id: 'test_openid_789',
        username: 'existing_user',
        avatar: 'https://example.com/avatar.jpg'
      });

      const response = await request(app)
        .post('/api/wechat/complete-profile')
        .send({
          openid: 'test_openid_789',
          username: 'new_name',
          avatar: 'https://example.com/new.jpg'
        })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: '用户资料已完善，请勿重复提交'
      });
    });

    test('should return 400 when fields are missing', async () => {
      const response = await request(app)
        .post('/api/wechat/complete-profile')
        .send({ openid: 'test_openid_123', username: 'new_user' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'openid、username和avatar参数都是必需的'
      });
    });

    test('should handle complete onboarding flow', async () => {
      // 1. 第一次打开小程序，get-openid 自动建 User
      axios.get.mockResolvedValue({ data: { openid: 'flow_test_openid' } });

      const openidResponse = await request(app)
        .post('/api/wechat/get-openid')
        .send({ code: 'test_code' })
        .expect(200);

      expect(openidResponse.body.data.openid).toBe('flow_test_openid');

      // 2. 查用户信息，isProfileComplete=false，跳引导页
      const userInfoResponse = await request(app)
        .post('/api/wechat/get-user-info')
        .send({ openid: 'flow_test_openid' })
        .expect(200);

      expect(userInfoResponse.body.data.user.isProfileComplete).toBe(false);

      // 3. 用户填写头像和名字
      const completeResponse = await request(app)
        .post('/api/wechat/complete-profile')
        .send({
          openid: 'flow_test_openid',
          username: 'flow_test_user',
          avatar: 'https://example.com/flow-avatar.jpg'
        })
        .expect(200);

      expect(completeResponse.body.data.user.isProfileComplete).toBe(true);

      // 4. 再次查用户信息，isProfileComplete=true，进主页
      const userInfoResponse2 = await request(app)
        .post('/api/wechat/get-user-info')
        .send({ openid: 'flow_test_openid' })
        .expect(200);

      expect(userInfoResponse2.body.data.user.username).toBe('flow_test_user');
      expect(userInfoResponse2.body.data.user.isProfileComplete).toBe(true);
    });
  });
});
