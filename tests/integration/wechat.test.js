const request = require('supertest');
const express = require('express');
const { createTestUser } = require('../helpers/testUtils');
const { globalErrorHandler } = require('../../utils/errorHandler');

// 创建测试应用
const app = express();
app.use(express.json());

// 模拟路由
const wechatRoutes = require('../../routes/wechat');
app.use('/api/wechat', wechatRoutes);

// 添加错误处理中间件
app.use(globalErrorHandler);

// Mock axios for WeChat API
jest.mock('axios');
const axios = require('axios');

describe('WeChat Integration Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/wechat/login', () => {
    test('should create new user and return success response', async () => {
      const mockSession = {
        openid: 'test_openid_123',
        session_key: 'test_session_key'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      const response = await request(app)
        .post('/api/wechat/login')
        .send({ code: 'test_code' })
        .expect(201);

      expect(response.body).toEqual({
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

      const response = await request(app)
        .post('/api/wechat/login')
        .send({ code: 'test_code' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '登录成功',
        data: {
          user: {
            _id: existingUser._id.toString(),
            openid: 'test_openid_123',
            username: 'existing_user',
            avatar: expect.any(String)
          },
          openid: 'test_openid_123'
        }
      });
    });

    test('should handle WeChat API error', async () => {
      const mockSession = {
        errcode: 40029,
        errmsg: 'invalid code'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      const response = await request(app)
        .post('/api/wechat/login')
        .send({ code: 'invalid_code' })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '微信登录失败: invalid code'
      });
    }, 30000);

    test('should handle network error', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/api/wechat/login')
        .send({ code: 'test_code' })
        .expect(500);

      expect(response.body).toEqual({
        status: 'error',
        message: '微信服务请求失败'
      });
    }, 30000);
  });

  describe('GET /api/wechat/protected/user-info', () => {
    test('should return user info with valid openid', async () => {
      const user = await createTestUser();

      const response = await request(app)
        .get('/api/wechat/protected/user-info')
        .set('x-openid', user.openid)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '获取用户信息成功',
        data: {
          user: {
            _id: user._id.toString(),
            openid: user.openid,
            username: user.username,
            avatar: user.avatar
          }
        }
      });
    });

    test('should return 401 when no openid provided', async () => {
      const response = await request(app)
        .get('/api/wechat/protected/user-info')
        .expect(401);

      expect(response.body).toEqual({
        status: 'fail',
        message: '缺少openid参数'
      });
    });

    test('should return 401 when invalid openid provided', async () => {
      const response = await request(app)
        .get('/api/wechat/protected/user-info')
        .set('x-openid', 'invalid_openid')
        .expect(401);

      expect(response.body).toEqual({
        status: 'fail',
        message: '用户不存在或openid无效'
      });
    });
  });
}); 