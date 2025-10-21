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

// Mock imageCheck service
jest.mock('../../services/imageCheck.service');
const { checkImageContent } = require('../../services/imageCheck.service');

describe('WeChat Integration Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 默认 mock 图片检查通过
    checkImageContent.mockResolvedValue({ errcode: 0 });
  });

  describe('POST /api/wechat/get-openid', () => {
    test('should return openid successfully with valid code', async () => {
      const mockSession = {
        openid: 'test_openid_123',
        session_key: 'test_session_key'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      const response = await request(app)
        .post('/api/wechat/get-openid')
        .send({ code: 'test_code' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '获取openid成功',
        data: {
          openid: 'test_openid_123'
        }
      });
    });

    test('should return error when code is missing', async () => {
      const response = await request(app)
        .post('/api/wechat/get-openid')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
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

      const response = await request(app)
        .post('/api/wechat/get-openid')
        .send({ code: 'invalid_code' })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: '微信登录失败: invalid code'
      });
    });

    test('should handle network error', async () => {
      axios.get.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/api/wechat/get-openid')
        .send({ code: 'test_code' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: '微信服务请求失败'
      });
    });
  });

  describe('POST /api/wechat/get-user-info', () => {
    test('should return user info when user exists', async () => {
      const existingUser = await createTestUser({
        openid: 'test_openid_123',
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
            _id: existingUser._id.toString(),
            openid: 'test_openid_123',
            username: 'test_user',
            avatar: 'https://example.com/avatar.jpg',
            isAdmin: false
          }
        }
      });
    });

    test('should return null when user does not exist', async () => {
      const response = await request(app)
        .post('/api/wechat/get-user-info')
        .send({ openid: 'nonexistent_openid' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '用户不存在',
        data: null
      });
    });

    test('should return error when openid is missing', async () => {
      const response = await request(app)
        .post('/api/wechat/get-user-info')
        .send({})
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'openid参数是必需的'
      });
    });
  });

  describe('POST /api/wechat/register', () => {
    test('should create new user successfully', async () => {
      const response = await request(app)
        .post('/api/wechat/register')
        .send({
          openid: 'test_openid_123',
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        })
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        message: '用户注册成功',
        data: {
          user: expect.objectContaining({
            openid: 'test_openid_123',
            username: 'new_user',
            avatar: 'https://example.com/avatar.jpg'
          })
        }
      });
    });

    test('should return error when openid is missing', async () => {
      const response = await request(app)
        .post('/api/wechat/register')
        .send({
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'openid、username和avatar参数都是必需的'
      });
    });

    test('should return error when username is missing', async () => {
      const response = await request(app)
        .post('/api/wechat/register')
        .send({
          openid: 'test_openid_123',
          avatar: 'https://example.com/avatar.jpg'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'openid、username和avatar参数都是必需的'
      });
    });

    test('should return error when avatar is missing', async () => {
      const response = await request(app)
        .post('/api/wechat/register')
        .send({
          openid: 'test_openid_123',
          username: 'new_user'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: 'openid、username和avatar参数都是必需的'
      });
    });

    test('should return error when user already exists', async () => {
      await createTestUser({
        openid: 'test_openid_123',
        username: 'existing_user'
      });

      const response = await request(app)
        .post('/api/wechat/register')
        .send({
          openid: 'test_openid_123',
          username: 'new_user',
          avatar: 'https://example.com/avatar.jpg'
        })
        .expect(409);

      expect(response.body).toEqual({
        success: false,
        message: '用户已存在'
      });
    });

    test('should handle complete registration flow', async () => {
      // 先测试获取openid
      const mockSession = {
        openid: 'flow_test_openid',
        session_key: 'test_session_key'
      };

      axios.get.mockResolvedValue({ data: mockSession });

      const openidResponse = await request(app)
        .post('/api/wechat/get-openid')
        .send({ code: 'test_code' })
        .expect(200);

      expect(openidResponse.body.data.openid).toBe('flow_test_openid');

      // 检查用户是否存在
      const userInfoResponse = await request(app)
        .post('/api/wechat/get-user-info')
        .send({ openid: 'flow_test_openid' })
        .expect(200);

      expect(userInfoResponse.body.data).toBeNull();

      // 注册用户
      const registerResponse = await request(app)
        .post('/api/wechat/register')
        .send({
          openid: 'flow_test_openid',
          username: 'flow_test_user',
          avatar: 'https://example.com/flow-avatar.jpg'
        })
        .expect(201);

      expect(registerResponse.body.data.user.openid).toBe('flow_test_openid');

      // 再次检查用户信息，应该存在了
      const userInfoResponse2 = await request(app)
        .post('/api/wechat/get-user-info')
        .send({ openid: 'flow_test_openid' })
        .expect(200);

      expect(userInfoResponse2.body.data.user.username).toBe('flow_test_user');
    });
  });

  describe('POST /api/wechat/register - Avatar Content Check', () => {
    test('should successfully register with safe avatar', async () => {
      // Mock 头像检查通过
      checkImageContent.mockResolvedValue({ errcode: 0 });

      const response = await request(app)
        .post('/api/wechat/register')
        .send({
          openid: 'avatar_test_openid_1',
          username: 'avatar_test_user',
          avatar: 'https://tlou.images.wltech-service.site/safe-avatar.jpg'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('用户注册成功');
      expect(checkImageContent).toHaveBeenCalledWith('https://tlou.images.wltech-service.site/safe-avatar.jpg');
    });

    test('should reject registration when avatar content violates policy', async () => {
      // Mock 头像检查失败（违规）
      checkImageContent.mockResolvedValue({ 
        errcode: 87014, 
        errmsg: '图片含有违法违规内容' 
      });

      const response = await request(app)
        .post('/api/wechat/register')
        .send({
          openid: 'avatar_test_openid_2',
          username: 'test_user_2',
          avatar: 'https://tlou.images.wltech-service.site/bad-avatar.jpg'
        })
        .expect(422);

      expect(response.body.message).toBe('头像内容违规，请更换后重试');
      expect(response.body.status).toBe('fail');
      expect(response.body.violationDetails.violatedImages).toEqual([
        expect.objectContaining({
          url: 'https://tlou.images.wltech-service.site/bad-avatar.jpg',
          reason: '图片含有违法违规内容',
          code: 87014
        })
      ]);

      expect(checkImageContent).toHaveBeenCalledWith('https://tlou.images.wltech-service.site/bad-avatar.jpg');
    });

    test('should reject when avatar image not found', async () => {
      // Mock 图片不存在
      checkImageContent.mockRejectedValue(new Error('图片不存在'));

      const response = await request(app)
        .post('/api/wechat/register')
        .send({
          openid: 'avatar_test_openid_3',
          username: 'test_user_3',
          avatar: 'https://tlou.images.wltech-service.site/not-exist.jpg'
        })
        .expect(400);

      expect(response.body.message).toBe('头像不存在或无法访问');
      expect(response.body.status).toBe('fail');
    });

    test('should handle avatar check timeout gracefully', async () => {
      // Mock 检查超时
      checkImageContent.mockRejectedValue(new Error('Request timeout'));

      const response = await request(app)
        .post('/api/wechat/register')
        .send({
          openid: 'avatar_test_openid_4',
          username: 'test_user_4',
          avatar: 'https://tlou.images.wltech-service.site/slow-avatar.jpg'
        })
        .expect(400);

      expect(response.body.message).toBe('头像下载超时');
      expect(response.body.status).toBe('fail');
    });

    test('should skip avatar check when avatar is empty (validation will catch)', async () => {
      // 这个测试验证当没有头像时，中间件会跳过检查
      // 但参数验证会捕获这个问题
      const response = await request(app)
        .post('/api/wechat/register')
        .send({
          openid: 'avatar_test_openid_5',
          username: 'test_user_5'
          // 没有 avatar 字段
        })
        .expect(400);

      expect(response.body.message).toBe('openid、username和avatar参数都是必需的');
      expect(checkImageContent).not.toHaveBeenCalled();
    });
  });
}); 