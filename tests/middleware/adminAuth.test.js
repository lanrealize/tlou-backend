const User = require('../../models/User');
const { checkAdmin } = require('../../middleware/adminAuth');
const { AppError } = require('../../utils/errorHandler');

describe('Admin Auth Middleware', () => {
  let testUser;
  let adminUser;

  beforeEach(async () => {
    // 创建普通用户
    testUser = await User.create({
      _id: 'test_openid_123',  // openid作为主键
      username: 'testuser',
      avatar: 'https://example.com/avatar.jpg',
      isAdmin: false
    });

    // 创建管理员用户
    adminUser = await User.create({
      _id: 'admin_openid_456',  // openid作为主键
      username: 'admin',
      avatar: 'https://example.com/admin-avatar.jpg',
      isAdmin: true
    });
  });

  describe('checkAdmin middleware', () => {
    test('should allow access for admin user', async () => {
      const req = { user: adminUser };
      const res = {};
      const next = jest.fn();

      await checkAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(next).not.toHaveBeenCalledWith(expect.any(AppError));
    });

    test('should deny access for non-admin user', async () => {
      const req = { user: testUser };
      const res = {};
      const next = jest.fn();

      await checkAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].message).toBe('需要管理员权限');
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });

    test('should deny access when user is not authenticated', async () => {
      const req = {}; // 没有user对象
      const res = {};
      const next = jest.fn();

      await checkAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      expect(next.mock.calls[0][0].message).toBe('用户未认证');
      expect(next.mock.calls[0][0].statusCode).toBe(401);
    });

    test('should handle errors gracefully', async () => {
      const req = { user: null }; // 设置null触发错误处理
      const res = {};
      const next = jest.fn();
      
      // 临时修改User对象以触发错误
      const originalIsAdmin = req.user?.isAdmin;
      delete req.user;

      await checkAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });
});