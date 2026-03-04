const { quota, deductQuota, getQuotaSnapshot } = require('../../middleware/quotaMiddleware');
const { createTestUser, createMockRequest, createMockResponse, createMockNext } = require('../helpers/testUtils');
const User = require('../../models/User');

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

describe('quotaMiddleware', () => {
  let user;

  beforeEach(async () => {
    user = await createTestUser();
  });

  describe('quota() 检查中间件', () => {
    test('新用户首次发帖应通过（首日配额7次）', async () => {
      const req = createMockRequest({ user });
      const next = createMockNext();
      await quota('post')(req, createMockResponse(), next);
      expect(next).toHaveBeenCalledWith();
    });

    test('首日发帖第7次通过，第8次返回 429 quota_exceeded', async () => {
      // 设置已用6次，今天，firstUsedAt=今天
      await User.findByIdAndUpdate(user._id, {
        'quota.post.firstUsedAt': new Date(),
        'quota.post.todayCount': 6,
        'quota.post.lastDate': todayStr()
      });
      const updatedUser = await User.findById(user._id);

      // 第7次（刚好达到上限前一次）需要更新到6，检查第7次 = remaining=1，应通过
      const req = createMockRequest({ user: updatedUser });
      const next = createMockNext();
      await quota('post')(req, createMockResponse(), next);
      expect(next).toHaveBeenCalledWith();
    });

    test('首日配额用尽后返回 429 quota_exceeded', async () => {
      await User.findByIdAndUpdate(user._id, {
        'quota.post.firstUsedAt': new Date(),
        'quota.post.todayCount': 7,
        'quota.post.lastDate': todayStr()
      });
      const updatedUser = await User.findById(user._id);

      const next = createMockNext();
      await quota('post')(createMockRequest({ user: updatedUser }), createMockResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 429,
        reason: 'quota_exceeded',
        remaining: 0
      }));
    });

    test('次日配额为5次，超限返回 429', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await User.findByIdAndUpdate(user._id, {
        'quota.post.firstUsedAt': yesterday,      // 非今天 = 非首日
        'quota.post.todayCount': 5,
        'quota.post.lastDate': todayStr()
      });
      const updatedUser = await User.findById(user._id);

      const next = createMockNext();
      await quota('post')(createMockRequest({ user: updatedUser }), createMockResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 429,
        reason: 'quota_exceeded'
      }));
    });

    test('跨天后计数重置，应通过', async () => {
      await User.findByIdAndUpdate(user._id, {
        'quota.post.firstUsedAt': new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        'quota.post.todayCount': 999,         // 昨天已超限
        'quota.post.lastDate': '2000-01-01'   // 非今天，触发跨天重置
      });
      const updatedUser = await User.findById(user._id);

      const next = createMockNext();
      await quota('post')(createMockRequest({ user: updatedUser }), createMockResponse(), next);
      expect(next).toHaveBeenCalledWith();
    });

    test('isPremium 用户跳过配额检查', async () => {
      await User.findByIdAndUpdate(user._id, {
        isPremium: true,
        'quota.post.firstUsedAt': new Date(),
        'quota.post.todayCount': 999,
        'quota.post.lastDate': todayStr()
      });
      const updatedUser = await User.findById(user._id);

      const next = createMockNext();
      await quota('post')(createMockRequest({ user: updatedUser }), createMockResponse(), next);
      expect(next).toHaveBeenCalledWith();
    });

    test('评论首日配额为30次', async () => {
      await User.findByIdAndUpdate(user._id, {
        'quota.comment.firstUsedAt': new Date(),
        'quota.comment.todayCount': 30,
        'quota.comment.lastDate': todayStr()
      });
      const updatedUser = await User.findById(user._id);

      const next = createMockNext();
      await quota('comment')(createMockRequest({ user: updatedUser }), createMockResponse(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 429,
        reason: 'quota_exceeded'
      }));
    });
  });

  describe('deductQuota()', () => {
    test('首次调用应设置 firstUsedAt 并将计数置为1', async () => {
      await deductQuota(user._id, 'post');
      const updated = await User.findById(user._id);
      expect(updated.quota.post.firstUsedAt).not.toBeNull();
      expect(updated.quota.post.todayCount).toBe(1);
      expect(updated.quota.post.lastDate).toBe(todayStr());
    });

    test('同日多次扣减应累加', async () => {
      await deductQuota(user._id, 'post');
      await deductQuota(user._id, 'post');
      await deductQuota(user._id, 'post');
      const updated = await User.findById(user._id);
      expect(updated.quota.post.todayCount).toBe(3);
    });

    test('发帖和评论扣减互不影响', async () => {
      await deductQuota(user._id, 'post');
      await deductQuota(user._id, 'comment');
      await deductQuota(user._id, 'comment');
      const updated = await User.findById(user._id);
      expect(updated.quota.post.todayCount).toBe(1);
      expect(updated.quota.comment.todayCount).toBe(2);
    });
  });

  describe('getQuotaSnapshot()', () => {
    test('新用户快照 remaining 应为首日上限', async () => {
      const snapshot = getQuotaSnapshot(user, 'post');
      expect(snapshot.remaining).toBe(7);
      expect(snapshot.resetAt).toBeDefined();
    });

    test('扣减后 remaining 减少', async () => {
      await deductQuota(user._id, 'post');
      const updated = await User.findById(user._id);
      const snapshot = getQuotaSnapshot(updated, 'post');
      expect(snapshot.remaining).toBe(6);
    });

    test('resetAt 应是明天零点', () => {
      const snapshot = getQuotaSnapshot(user, 'post');
      const resetAt = new Date(snapshot.resetAt);
      const now = new Date();
      expect(resetAt.getTime()).toBeGreaterThan(now.getTime());
      // 不超过48小时
      expect(resetAt.getTime() - now.getTime()).toBeLessThan(48 * 60 * 60 * 1000);
    });
  });
});
