const qiniuController = require('../../controllers/qiniu.controller');
const qiniuService = require('../../services/qiniu.service');
const { createMockRequest, createMockResponse } = require('../helpers/testUtils');

// Mock 七牛云服务
jest.mock('../../services/qiniu.service');

describe('Qiniu Controller Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateUploadToken', () => {
    test('should generate upload token successfully with valid data', async () => {
      const mockResult = {
        success: true,
        data: {
          uploadToken: 'mock_token',
          domain: 'https://test.domain.com',
          bucket: 'test_bucket',
          keyPrefix: 'avatars/user123/',
          expires: 3600,
          pathType: 'avatar',
          fsizeLimit: 10485760,
          expiresAt: '2024-01-01T12:00:00.000Z'
        },
        message: 'Token生成成功'
      };

      qiniuService.generateUploadToken.mockResolvedValue(mockResult);

      const req = createMockRequest({
        body: {
          pathType: 'avatar',
          userId: 'user123',
          expires: 3600
        }
      });
      const res = createMockResponse();

      await qiniuController.generateUploadToken(req, res);

      expect(qiniuService.generateUploadToken).toHaveBeenCalledWith({
        pathType: 'avatar',
        userId: 'user123',
        expires: 3600
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    test('should use default values when optional fields are missing', async () => {
      const mockResult = {
        success: true,
        data: {
          uploadToken: 'mock_token',
          pathType: 'avatar',
          userId: 'anonymous'
        }
      };

      qiniuService.generateUploadToken.mockResolvedValue(mockResult);

      const req = createMockRequest({
        body: {}
      });
      const res = createMockResponse();

      await qiniuController.generateUploadToken(req, res);

      expect(qiniuService.generateUploadToken).toHaveBeenCalledWith({
        pathType: 'avatar',
        userId: 'anonymous',
        expires: 3600
      });
    });

    test('should get userId from query if not in body', async () => {
      const mockResult = {
        success: true,
        data: { uploadToken: 'mock_token' }
      };

      qiniuService.generateUploadToken.mockResolvedValue(mockResult);

      const req = createMockRequest({
        query: { userId: 'query_user' },
        body: { pathType: 'moment' }
      });
      const res = createMockResponse();

      await qiniuController.generateUploadToken(req, res);

      expect(qiniuService.generateUploadToken).toHaveBeenCalledWith({
        pathType: 'moment',
        userId: 'query_user',
        expires: 3600
      });
    });

    test('should return error for invalid pathType', async () => {
      const req = createMockRequest({
        body: {
          pathType: 'invalid_type',
          userId: 'user123'
        }
      });
      const res = createMockResponse();

      await qiniuController.generateUploadToken(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '无效的路径类型。支持的类型: avatar, moment, post, chat, other, custom',
        code: 'INVALID_PATH_TYPE'
      });
      expect(qiniuService.generateUploadToken).not.toHaveBeenCalled();
    });

    test('should return error for invalid expires time (too short)', async () => {
      const req = createMockRequest({
        body: {
          pathType: 'avatar',
          userId: 'user123',
          expires: 30 // 少于60秒
        }
      });
      const res = createMockResponse();

      await qiniuController.generateUploadToken(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token过期时间应在60-7200秒之间',
        code: 'INVALID_EXPIRES'
      });
    });

    test('should return error for invalid expires time (too long)', async () => {
      const req = createMockRequest({
        body: {
          pathType: 'avatar',
          userId: 'user123',
          expires: 10000 // 超过7200秒
        }
      });
      const res = createMockResponse();

      await qiniuController.generateUploadToken(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token过期时间应在60-7200秒之间',
        code: 'INVALID_EXPIRES'
      });
    });

    test('should handle service errors', async () => {
      const serviceError = new Error('七牛云配置错误');
      qiniuService.generateUploadToken.mockRejectedValue(serviceError);

      const req = createMockRequest({
        body: {
          pathType: 'avatar',
          userId: 'user123'
        }
      });
      const res = createMockResponse();

      await qiniuController.generateUploadToken(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '七牛云配置错误',
        code: 'TOKEN_GENERATION_ERROR'
      });
    });
  });

  describe('getUploadToken', () => {
    test('should get upload token successfully with GET request', async () => {
      const mockResult = {
        success: true,
        data: {
          uploadToken: 'mock_token',
          pathType: 'moment'
        }
      };

      qiniuService.generateUploadToken.mockResolvedValue(mockResult);

      const req = createMockRequest({
        query: {
          pathType: 'moment',
          userId: 'user123',
          expires: '7200'
        }
      });
      const res = createMockResponse();

      await qiniuController.getUploadToken(req, res);

      expect(qiniuService.generateUploadToken).toHaveBeenCalledWith({
        pathType: 'moment',
        userId: 'user123',
        expires: 7200
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    test('should use default values for GET request', async () => {
      const mockResult = {
        success: true,
        data: { uploadToken: 'mock_token' }
      };

      qiniuService.generateUploadToken.mockResolvedValue(mockResult);

      const req = createMockRequest({
        query: {}
      });
      const res = createMockResponse();

      await qiniuController.getUploadToken(req, res);

      expect(qiniuService.generateUploadToken).toHaveBeenCalledWith({
        pathType: 'avatar',
        userId: 'anonymous',
        expires: 3600
      });
    });

    test('should handle service errors in GET request', async () => {
      const serviceError = new Error('服务错误');
      qiniuService.generateUploadToken.mockRejectedValue(serviceError);

      const req = createMockRequest({
        query: {
          pathType: 'avatar',
          userId: 'user123'
        }
      });
      const res = createMockResponse();

      await qiniuController.getUploadToken(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '服务错误',
        code: 'TOKEN_GET_ERROR'
      });
    });
  });

  describe('getQiniuInfo', () => {
    test('should return qiniu info successfully', () => {
      const mockResult = {
        success: true,
        data: {
          bucket: 'test_bucket',
          domain: 'https://test.domain.com',
          isConfigured: true
        }
      };

      qiniuService.getQiniuInfo.mockReturnValue(mockResult);

      const req = createMockRequest();
      const res = createMockResponse();

      qiniuController.getQiniuInfo(req, res);

      expect(qiniuService.getQiniuInfo).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockResult);
    });

    test('should handle service errors', () => {
      const serviceError = new Error('配置读取失败');
      qiniuService.getQiniuInfo.mockImplementation(() => {
        throw serviceError;
      });

      const req = createMockRequest();
      const res = createMockResponse();

      qiniuController.getQiniuInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '配置读取失败',
        code: 'INFO_ERROR'
      });
    });
  });

  describe('healthCheck', () => {
    test('should return healthy status when config is valid', () => {
      qiniuService.validateQiniuConfig.mockImplementation(() => true);

      const req = createMockRequest();
      const res = createMockResponse();

      qiniuController.healthCheck(req, res);

      expect(qiniuService.validateQiniuConfig).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: '七牛云服务正常',
        data: {
          status: 'healthy',
          timestamp: expect.any(String)
        }
      });
    });

    test('should return unhealthy status when config is invalid', () => {
      const configError = new Error('配置缺失');
      qiniuService.validateQiniuConfig.mockImplementation(() => {
        throw configError;
      });

      const req = createMockRequest();
      const res = createMockResponse();

      qiniuController.healthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '七牛云服务配置异常',
        data: {
          status: 'unhealthy',
          error: '配置缺失',
          timestamp: expect.any(String)
        }
      });
    });
  });
});