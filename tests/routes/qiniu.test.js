const request = require('supertest');
const express = require('express');
const qiniuController = require('../../controllers/qiniu.controller');
const { globalErrorHandler } = require('../../utils/errorHandler');

// Mock 七牛云控制器
jest.mock('../../controllers/qiniu.controller');

// 创建测试应用
const app = express();
app.use(express.json());

// 模拟路由
const qiniuRoutes = require('../../routes/qiniu');
app.use('/api/qiniu', qiniuRoutes);

// 添加错误处理中间件
app.use(globalErrorHandler);

describe('Qiniu Routes Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/qiniu/upload-token', () => {
    test('should call generateUploadToken controller', async () => {
      qiniuController.generateUploadToken.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            uploadToken: 'mock_token',
            pathType: 'avatar'
          }
        });
      });

      const response = await request(app)
        .post('/api/qiniu/upload-token')
        .send({
          pathType: 'avatar',
          userId: 'user123',
          expires: 3600
        })
        .expect(200);

      expect(qiniuController.generateUploadToken).toHaveBeenCalledTimes(1);
      expect(response.body).toEqual({
        success: true,
        data: {
          uploadToken: 'mock_token',
          pathType: 'avatar'
        }
      });
    });

    test('should handle empty request body', async () => {
      qiniuController.generateUploadToken.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            uploadToken: 'mock_token',
            pathType: 'avatar',
            userId: 'anonymous'
          }
        });
      });

      const response = await request(app)
        .post('/api/qiniu/upload-token')
        .send({})
        .expect(200);

      expect(qiniuController.generateUploadToken).toHaveBeenCalledTimes(1);
      expect(response.body.data.userId).toBe('anonymous');
    });

    test('should handle controller errors', async () => {
      qiniuController.generateUploadToken.mockImplementation((req, res) => {
        res.status(400).json({
          success: false,
          message: '无效的路径类型',
          code: 'INVALID_PATH_TYPE'
        });
      });

      const response = await request(app)
        .post('/api/qiniu/upload-token')
        .send({
          pathType: 'invalid_type'
        })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        message: '无效的路径类型',
        code: 'INVALID_PATH_TYPE'
      });
    });

    test('should handle different path types', async () => {
      const pathTypes = ['avatar', 'moment', 'post', 'chat', 'other', 'custom'];

      for (const pathType of pathTypes) {
        qiniuController.generateUploadToken.mockImplementation((req, res) => {
          res.status(200).json({
            success: true,
            data: {
              uploadToken: 'mock_token',
              pathType: pathType
            }
          });
        });

        const response = await request(app)
          .post('/api/qiniu/upload-token')
          .send({
            pathType: pathType,
            userId: 'user123'
          })
          .expect(200);

        expect(response.body.data.pathType).toBe(pathType);
      }
    });
  });

  describe('GET /api/qiniu/upload-token', () => {
    test('should call getUploadToken controller', async () => {
      qiniuController.getUploadToken.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            uploadToken: 'mock_token',
            pathType: 'moment'
          }
        });
      });

      const response = await request(app)
        .get('/api/qiniu/upload-token')
        .query({
          pathType: 'moment',
          userId: 'user123',
          expires: '7200'
        })
        .expect(200);

      expect(qiniuController.getUploadToken).toHaveBeenCalledTimes(1);
      expect(response.body).toEqual({
        success: true,
        data: {
          uploadToken: 'mock_token',
          pathType: 'moment'
        }
      });
    });

    test('should handle request without query parameters', async () => {
      qiniuController.getUploadToken.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            uploadToken: 'mock_token',
            pathType: 'avatar',
            userId: 'anonymous'
          }
        });
      });

      const response = await request(app)
        .get('/api/qiniu/upload-token')
        .expect(200);

      expect(qiniuController.getUploadToken).toHaveBeenCalledTimes(1);
      expect(response.body.data.userId).toBe('anonymous');
    });

    test('should handle controller errors', async () => {
      qiniuController.getUploadToken.mockImplementation((req, res) => {
        res.status(500).json({
          success: false,
          message: '获取上传Token失败',
          code: 'TOKEN_GET_ERROR'
        });
      });

      const response = await request(app)
        .get('/api/qiniu/upload-token')
        .query({
          pathType: 'avatar'
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: '获取上传Token失败',
        code: 'TOKEN_GET_ERROR'
      });
    });
  });

  describe('GET /api/qiniu/info', () => {
    test('should call getQiniuInfo controller', async () => {
      qiniuController.getQiniuInfo.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          data: {
            bucket: 'test_bucket',
            domain: 'https://test.domain.com',
            isConfigured: true
          }
        });
      });

      const response = await request(app)
        .get('/api/qiniu/info')
        .expect(200);

      expect(qiniuController.getQiniuInfo).toHaveBeenCalledTimes(1);
      expect(response.body).toEqual({
        success: true,
        data: {
          bucket: 'test_bucket',
          domain: 'https://test.domain.com',
          isConfigured: true
        }
      });
    });

    test('should handle configuration errors', async () => {
      qiniuController.getQiniuInfo.mockImplementation((req, res) => {
        res.status(500).json({
          success: false,
          message: '获取配置信息失败',
          code: 'INFO_ERROR'
        });
      });

      const response = await request(app)
        .get('/api/qiniu/info')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        message: '获取配置信息失败',
        code: 'INFO_ERROR'
      });
    });
  });

  describe('GET /api/qiniu/health', () => {
    test('should call healthCheck controller and return healthy status', async () => {
      qiniuController.healthCheck.mockImplementation((req, res) => {
        res.status(200).json({
          success: true,
          message: '七牛云服务正常',
          data: {
            status: 'healthy',
            timestamp: '2024-01-01T12:00:00.000Z'
          }
        });
      });

      const response = await request(app)
        .get('/api/qiniu/health')
        .expect(200);

      expect(qiniuController.healthCheck).toHaveBeenCalledTimes(1);
      expect(response.body).toEqual({
        success: true,
        message: '七牛云服务正常',
        data: {
          status: 'healthy',
          timestamp: '2024-01-01T12:00:00.000Z'
        }
      });
    });

    test('should return unhealthy status when service is down', async () => {
      qiniuController.healthCheck.mockImplementation((req, res) => {
        res.status(503).json({
          success: false,
          message: '七牛云服务配置异常',
          data: {
            status: 'unhealthy',
            error: '配置缺失',
            timestamp: '2024-01-01T12:00:00.000Z'
          }
        });
      });

      const response = await request(app)
        .get('/api/qiniu/health')
        .expect(503);

      expect(qiniuController.healthCheck).toHaveBeenCalledTimes(1);
      expect(response.body.data.status).toBe('unhealthy');
    });
  });

  describe('Route Integration', () => {
    test('should handle requests to all qiniu endpoints', async () => {
      // Mock all controllers
      qiniuController.generateUploadToken.mockImplementation((req, res) => {
        res.status(200).json({ success: true, endpoint: 'generateUploadToken' });
      });
      qiniuController.getUploadToken.mockImplementation((req, res) => {
        res.status(200).json({ success: true, endpoint: 'getUploadToken' });
      });
      qiniuController.getQiniuInfo.mockImplementation((req, res) => {
        res.status(200).json({ success: true, endpoint: 'getQiniuInfo' });
      });
      qiniuController.healthCheck.mockImplementation((req, res) => {
        res.status(200).json({ success: true, endpoint: 'healthCheck' });
      });

      // Test all endpoints
      const endpoints = [
        { method: 'post', path: '/api/qiniu/upload-token', data: { pathType: 'avatar' } },
        { method: 'get', path: '/api/qiniu/upload-token', query: { pathType: 'avatar' } },
        { method: 'get', path: '/api/qiniu/info', query: {} },
        { method: 'get', path: '/api/qiniu/health', query: {} }
      ];

      for (const endpoint of endpoints) {
        let req = request(app)[endpoint.method](endpoint.path);
        
        if (endpoint.method === 'post' && endpoint.data) {
          req = req.send(endpoint.data);
        } else if (endpoint.query && Object.keys(endpoint.query).length > 0) {
          req = req.query(endpoint.query);
        }

        const response = await req.expect(200);
        expect(response.body.success).toBe(true);
      }

      // Verify all controllers were called
      expect(qiniuController.generateUploadToken).toHaveBeenCalledTimes(1);
      expect(qiniuController.getUploadToken).toHaveBeenCalledTimes(1);
      expect(qiniuController.getQiniuInfo).toHaveBeenCalledTimes(1);
      expect(qiniuController.healthCheck).toHaveBeenCalledTimes(1);
    });

    test('should handle 404 for non-existent routes', async () => {
      await request(app)
        .get('/api/qiniu/non-existent')
        .expect(404);
    });

    test('should handle invalid JSON in POST requests', async () => {
      await request(app)
        .post('/api/qiniu/upload-token')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400); // Express在接收到无效JSON时返回400
    });
  });
});