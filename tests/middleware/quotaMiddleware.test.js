const { quota, deductQuota, getQuotaSnapshot, getFullQuotaSnapshot } = require('../../middleware/quotaMiddleware');
const { createTestUser, createMockRequest, createMockResponse, createMockNext } = require('../helpers/testUtils');
const User = require('../../models/User');

function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

async function createTodayUser() {
  return createTestUser(); // createdAt 默认是现在，即今天
}

async function createOldUser() {
  const user = await createTestUser();
  // 直接操作底层集合绕过 timestamps 保护，把 createdAt 改为昨天
  await User.collection.updateOne(
    { _id: user._id },
    { $set: { createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
  );
  return User.findById(user._id);
}

describe('quotaMiddleware', () => {
  describe('quota() 检查中间件', () => {
    test('今天注册的用户享受首日配额7次，未超限应通过', async () => {
      const user = await createTodayUser();
      const next = createMockNext();
      await quota('post')(createMockRequest({ user }), createMockResponse(), next);
      expect(next).toHaveBeenCalledWith();
    });

    test('今天注册已用7次，返回 429 quota_exceeded', async () => {
      const user = await createTodayUser();
      await User.findByIdAndUpdate(user._id, {
        'quota.post.todayCount': 7,
        'quota.post.lastDate': todayStr()
      });
      const updated = await User.findById(user._id);
      const next = createMockNext();
      await quota('post')(createMockRequest({ user: updated }), createMockResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 429,
        reason: 'quota_exceeded',
        remaining: 0
      }));
    });

    test('非首日用户配额为5次，超限返回 429', async () => {
      const user = await createOldUser();
      await User.findByIdAndUpdate(user._id, {
        'quota.post.todayCount': 5,
        'quota.post.lastDate': todayStr()
      });
      const updated = await User.findById(user._id);
      const next = createMockNext();
      await quota('post')(createMockRequest({ user: updated }), createMockResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 429,
        reason: 'quota_exceeded'
      }));
    });

    test('跨天后计数重置，应通过', async () => {
      const user = await createOldUser();
      await User.findByIdAndUpdate(user._id, {
        'quota.post.todayCount': 999,
        'quota.post.lastDate': '2000-01-01' // 非今天
      });
      const updated = await User.findById(user._id);
      const next = createMockNext();
      await quota('post')(createMockRequest({ user: updated }), createMockResponse(), next);
      expect(next).toHaveBeenCalledWith();
    });

    test('isPremium 用户跳过配额检查', async () => {
      const user = await createOldUser();
      await User.findByIdAndUpdate(user._id, {
        isPremium: true,
        'quota.post.todayCount': 999,
        'quota.post.lastDate': todayStr()
      });
      const updated = await User.findById(user._id);
      const next = createMockNext();
      await quota('post')(createMockRequest({ user: updated }), createMockResponse(), next);
      expect(next).toHaveBeenCalledWith();
    });

    test('评论首日配额为30次', async () => {
      const user = await createTodayUser();
      await User.findByIdAndUpdate(user._id, {
        'quota.comment.todayCount': 30,
        'quota.comment.lastDate': todayStr()
      });
      const updated = await User.findById(user._id);
      const next = createMockNext();
      await quota('comment')(createMockRequest({ user: updated }), createMockResponse(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 429,
        reason: 'quota_exceeded'
      }));
    });

    test('评论非首日配额为20次', async () => {
      const user = await createOldUser();
      await User.findByIdAndUpdate(user._id, {
        'quota.comment.todayCount': 20,
        'quota.comment.lastDate': todayStr()
      });
      const updated = await User.findById(user._id);
      const next = createMockNext();
      await quota('comment')(createMockRequest({ user: updated }), createMockResponse(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 429,
        reason: 'quota_exceeded'
      }));
    });
  });

  describe('deductQuota()', () => {
    test('首次调用将计数置为1，lastDate 设为今天', async () => {
      const user = await createTodayUser();
      await deductQuota(user._id, 'post');
      const updated = await User.findById(user._id);
      expect(updated.quota.post.todayCount).toBe(1);
      expect(updated.quota.post.lastDate).toBe(todayStr());
    });

    test('同日多次扣减累加', async () => {
      const user = await createTodayUser();
      await deductQuota(user._id, 'post');
      await deductQuota(user._id, 'post');
      await deductQuota(user._id, 'post');
      const updated = await User.findById(user._id);
      expect(updated.quota.post.todayCount).toBe(3);
    });

    test('发帖和评论扣减互不影响', async () => {
      const user = await createTodayUser();
      await deductQuota(user._id, 'post');
      await deductQuota(user._id, 'comment');
      await deductQuota(user._id, 'comment');
      const updated = await User.findById(user._id);
      expect(updated.quota.post.todayCount).toBe(1);
      expect(updated.quota.comment.todayCount).toBe(2);
    });
  });

  describe('getQuotaSnapshot()', () => {
    test('今天注册的新用户 remaining 为首日上限7', async () => {
      const user = await createTodayUser();
      const snapshot = getQuotaSnapshot(user, 'post');
      expect(snapshot.remaining).toBe(7);
      expect(snapshot.resetAt).toBeDefined();
    });

    test('非首日新用户 remaining 为次日上限5', async () => {
      const user = await createOldUser();
      const snapshot = getQuotaSnapshot(user, 'post');
      expect(snapshot.remaining).toBe(5);
    });

    test('扣减后 remaining 相应减少', async () => {
      const user = await createTodayUser();
      await deductQuota(user._id, 'post');
      const updated = await User.findById(user._id);
      expect(getQuotaSnapshot(updated, 'post').remaining).toBe(6);
    });

    test('resetAt 是明天零点之后', () => {
      const user = { createdAt: new Date(), quota: {} };
      const { resetAt } = getQuotaSnapshot(user, 'post');
      expect(new Date(resetAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('getFullQuotaSnapshot()', () => {
    test('同时返回 post 和 comment 快照', async () => {
      const user = await createTodayUser();
      const snapshot = getFullQuotaSnapshot(user);
      expect(snapshot).toHaveProperty('post.remaining');
      expect(snapshot).toHaveProperty('post.resetAt');
      expect(snapshot).toHaveProperty('comment.remaining');
      expect(snapshot).toHaveProperty('comment.resetAt');
    });
  });
});
