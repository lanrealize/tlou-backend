const { checkOpenid } = require('../../middleware/openidAuth');
const { createTestUser, createMockRequest, createMockResponse, createMockNext } = require('../helpers/testUtils');
const { AppError } = require('../../utils/errorHandler');

describe('OpenID Auth Middleware Test', () => {
  describe('checkOpenid', () => {
    test('should pass with valid openid in body', async () => {
      const user = await createTestUser();
      const req = createMockRequest({
        body: { openid: user._id }
      });
      const res = createMockResponse();
      const next = createMockNext();

      await checkOpenid(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBeDefined();
      expect(req.user._id.toString()).toBe(user._id.toString());
      expect(req.user._id).toBe(user._id);
    });

    test('should pass with valid openid in query', async () => {
      const user = await createTestUser();
      const req = createMockRequest({
        query: { openid: user._id }
      });
      const res = createMockResponse();
      const next = createMockNext();

      await checkOpenid(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBeDefined();
      expect(req.user._id.toString()).toBe(user._id.toString());
    });

    test('should pass with valid openid in headers', async () => {
      const user = await createTestUser();
      const req = createMockRequest({
        headers: { 'x-openid': user._id }
      });
      const res = createMockResponse();
      const next = createMockNext();

      await checkOpenid(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBeDefined();
      expect(req.user._id.toString()).toBe(user._id.toString());
    });

    test('should throw error when no openid provided', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();
      const next = createMockNext();

      await checkOpenid(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.message).toBe('缺少openid参数');
      expect(error.statusCode).toBe(401);
    });

    test('should throw error when openid is empty string', async () => {
      const req = createMockRequest({
        body: { openid: '' }
      });
      const res = createMockResponse();
      const next = createMockNext();

      await checkOpenid(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.message).toBe('缺少openid参数');
      expect(error.statusCode).toBe(401);
    });

    test('should throw error when user not found', async () => {
      const req = createMockRequest({
        body: { openid: 'non_existent_openid' }
      });
      const res = createMockResponse();
      const next = createMockNext();

      await checkOpenid(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.message).toBe('用户不存在或openid无效');
      expect(error.statusCode).toBe(401);
    });

    test('should prioritize body over query and headers', async () => {
      const user = await createTestUser();
      const req = createMockRequest({
        body: { openid: user._id },
        query: { openid: 'wrong_openid' },
        headers: { 'x-openid': 'wrong_openid' }
      });
      const res = createMockResponse();
      const next = createMockNext();

      await checkOpenid(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBeDefined();
      expect(req.user._id).toBe(user._id);
    });

    test('should prioritize query over headers when body is empty', async () => {
      const user = await createTestUser();
      const req = createMockRequest({
        body: {},
        query: { openid: user._id },
        headers: { 'x-openid': 'wrong_openid' }
      });
      const res = createMockResponse();
      const next = createMockNext();

      await checkOpenid(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.user).toBeDefined();
      expect(req.user._id).toBe(user._id);
    });

    test('should handle database errors gracefully', async () => {
      // 模拟数据库错误
      const originalFindOne = require('../../models/User').findOne;
      require('../../models/User').findOne = jest.fn().mockRejectedValue(new Error('Database error'));

      const req = createMockRequest({
        body: { openid: 'test_openid' }
      });
      const res = createMockResponse();
      const next = createMockNext();

      await checkOpenid(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.message).toBe('验证openid失败');
      expect(error.statusCode).toBe(500);

      // 恢复原始方法
      require('../../models/User').findOne = originalFindOne;
    });
  });
}); 