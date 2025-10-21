const { checkAvatarMiddleware, checkImagesMiddleware } = require('../../middleware/imageCheck');
const { checkImageContent } = require('../../services/imageCheck.service');
const { deleteQiniuFiles } = require('../../utils/qiniuUtils');
const { createMockRequest, createMockResponse } = require('../helpers/testUtils');

// Mock 服务
jest.mock('../../services/imageCheck.service');
jest.mock('../../utils/qiniuUtils');

describe('Image Check Middleware Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // 清除所有定时器
    jest.clearAllTimers();
  });

  describe('checkAvatarMiddleware', () => {
    test('should pass when avatar content is safe', async () => {
      const avatarUrl = 'https://tlou.images.wltech-service.site/test-avatar.jpg';
      
      // Mock 检查通过
      checkImageContent.mockResolvedValue({ errcode: 0 });

      const req = createMockRequest({
        body: { avatar: avatarUrl }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkAvatarMiddleware(req, res, next);

      expect(checkImageContent).toHaveBeenCalledWith(avatarUrl);
      expect(next).toHaveBeenCalledWith();
      expect(deleteQiniuFiles).not.toHaveBeenCalled();
    });

    test('should skip check when avatar is not provided', async () => {
      const req = createMockRequest({
        body: {}
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkAvatarMiddleware(req, res, next);

      expect(checkImageContent).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    test('should reject and delete when avatar content violates policy', async () => {
      const avatarUrl = 'https://tlou.images.wltech-service.site/bad-avatar.jpg';
      
      // Mock 检查失败（违规）
      checkImageContent.mockResolvedValue({ 
        errcode: 87014, 
        errmsg: '图片内容违规' 
      });

      const req = createMockRequest({
        body: { avatar: avatarUrl }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkAvatarMiddleware(req, res, next);

      expect(checkImageContent).toHaveBeenCalledWith(avatarUrl);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '头像内容违规，请更换后重试',
          statusCode: 422,
          type: 'CONTENT_VIOLATION',
          violatedImages: expect.arrayContaining([
            expect.objectContaining({
              url: avatarUrl,
              reason: '图片内容违规',
              code: 87014
            })
          ])
        })
      );
      
      // 等待 setImmediate 执行
      await new Promise(resolve => setImmediate(resolve));
      expect(deleteQiniuFiles).toHaveBeenCalledWith(avatarUrl);
    });

    test('should handle image not found error', async () => {
      const avatarUrl = 'https://tlou.images.wltech-service.site/not-exist.jpg';
      
      // Mock 图片不存在错误
      checkImageContent.mockRejectedValue(new Error('图片不存在'));

      const req = createMockRequest({
        body: { avatar: avatarUrl }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkAvatarMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '头像不存在或无法访问',
          statusCode: 400
        })
      );
    });

    test('should handle timeout error', async () => {
      const avatarUrl = 'https://tlou.images.wltech-service.site/slow.jpg';
      
      // Mock 超时错误
      checkImageContent.mockRejectedValue(new Error('Request timeout'));

      const req = createMockRequest({
        body: { avatar: avatarUrl }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkAvatarMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '头像下载超时',
          statusCode: 400
        })
      );
    });

    test('should handle file too large error (40006)', async () => {
      const avatarUrl = 'https://tlou.images.wltech-service.site/huge.jpg';
      
      // Mock 文件过大错误
      checkImageContent.mockRejectedValue(
        new Error('微信图片检查API调用失败 [40006]: file too large')
      );

      const req = createMockRequest({
        body: { avatar: avatarUrl }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkAvatarMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '头像文件异常大，无法完成检查。建议使用其他图片',
          statusCode: 400
        })
      );
    });

    test('should handle rate limit error (45009)', async () => {
      const avatarUrl = 'https://tlou.images.wltech-service.site/test.jpg';
      
      // Mock API频率限制错误
      checkImageContent.mockRejectedValue(
        new Error('微信图片检查API调用失败 [45009]: api limit')
      );

      const req = createMockRequest({
        body: { avatar: avatarUrl }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkAvatarMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '系统繁忙，请稍后再试',
          statusCode: 400
        })
      );
    });

    test('should handle access token error (40001)', async () => {
      const avatarUrl = 'https://tlou.images.wltech-service.site/test.jpg';
      
      // Mock Token错误
      checkImageContent.mockRejectedValue(
        new Error('微信图片检查API调用失败 [40001]: invalid token')
      );

      const req = createMockRequest({
        body: { avatar: avatarUrl }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkAvatarMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: '图片检查服务异常，请联系管理员',
          statusCode: 400
        })
      );
    });

    test('should support object format avatar with url property', async () => {
      const avatarUrl = 'https://tlou.images.wltech-service.site/test-avatar.jpg';
      
      // Mock 检查通过
      checkImageContent.mockResolvedValue({ errcode: 0 });

      const req = createMockRequest({
        body: { 
          avatar: { 
            url: avatarUrl,
            width: 200,
            height: 200
          } 
        }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkAvatarMiddleware(req, res, next);

      expect(checkImageContent).toHaveBeenCalledWith(avatarUrl);
      expect(next).toHaveBeenCalledWith();
    });

    test('should skip check for empty avatar string', async () => {
      // 空字符串会被跳过，由路由验证器来处理
      const req = createMockRequest({
        body: { avatar: '' }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkAvatarMiddleware(req, res, next);

      expect(checkImageContent).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('checkImagesMiddleware - legacy tests still work', () => {
    test('should pass when all images are safe', async () => {
      const images = [
        'https://tlou.images.wltech-service.site/img1.jpg',
        'https://tlou.images.wltech-service.site/img2.jpg'
      ];
      
      // Mock 检查通过
      checkImageContent.mockResolvedValue({ errcode: 0 });

      const req = createMockRequest({
        body: { images }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkImagesMiddleware(req, res, next);

      expect(checkImageContent).toHaveBeenCalledTimes(2);
      expect(next).toHaveBeenCalledWith();
    });

    test('should skip check when images array is empty', async () => {
      const req = createMockRequest({
        body: { images: [] }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await checkImagesMiddleware(req, res, next);

      expect(checkImageContent).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });
  });
});

