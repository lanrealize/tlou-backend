const { rateLimit } = require('../../middleware/rateLimitMiddleware');
const { createMockRequest, createMockResponse, createMockNext } = require('../helpers/testUtils');

function makeUser(id = 'test_user_rl', isPremium = false) {
  return { _id: id, isPremium };
}

function makeReq(userId, isPremium = false) {
  return createMockRequest({ user: makeUser(userId, isPremium) });
}

describe('rateLimitMiddleware', () => {
  // 每个 test 用不同 userId，避免内存窗口互相干扰
  let uid;
  beforeEach(() => {
    uid = `rl_user_${Date.now()}_${Math.random()}`;
  });

  describe('发帖限制 (3次/分钟)', () => {
    test('前3次应全部通过', () => {
      const mw = rateLimit('post');
      for (let i = 0; i < 3; i++) {
        const next = createMockNext();
        mw(makeReq(uid), createMockResponse(), next);
        expect(next).toHaveBeenCalledWith(); // 无参调用 = 通过
      }
    });

    test('第4次应返回 429 rate_limited', () => {
      const mw = rateLimit('post');
      for (let i = 0; i < 3; i++) {
        mw(makeReq(uid), createMockResponse(), createMockNext());
      }
      const next = createMockNext();
      mw(makeReq(uid), createMockResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 429,
        reason: 'rate_limited'
      }));
    });

    test('超限响应应包含 retryAfter 且 >= 1', () => {
      const mw = rateLimit('post');
      for (let i = 0; i < 3; i++) {
        mw(makeReq(uid), createMockResponse(), createMockNext());
      }
      const next = createMockNext();
      mw(makeReq(uid), createMockResponse(), next);

      const err = next.mock.calls[0][0];
      expect(err.retryAfter).toBeGreaterThanOrEqual(1);
      expect(err.retryAfter).toBeLessThanOrEqual(60);
    });
  });

  describe('评论限制 (6次/分钟)', () => {
    test('前6次应全部通过', () => {
      const mw = rateLimit('comment');
      for (let i = 0; i < 6; i++) {
        const next = createMockNext();
        mw(makeReq(uid), createMockResponse(), next);
        expect(next).toHaveBeenCalledWith();
      }
    });

    test('第7次应返回 429 rate_limited', () => {
      const mw = rateLimit('comment');
      for (let i = 0; i < 6; i++) {
        mw(makeReq(uid), createMockResponse(), createMockNext());
      }
      const next = createMockNext();
      mw(makeReq(uid), createMockResponse(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 429,
        reason: 'rate_limited'
      }));
    });
  });

  describe('发帖和评论独立计数', () => {
    test('发帖达限后评论仍可通过', () => {
      const postMw = rateLimit('post');
      const commentMw = rateLimit('comment');

      for (let i = 0; i < 3; i++) {
        postMw(makeReq(uid), createMockResponse(), createMockNext());
      }

      const next = createMockNext();
      commentMw(makeReq(uid), createMockResponse(), next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('isPremium 用户跳过限制', () => {
    test('premium 用户无论发多少次都通过', () => {
      const mw = rateLimit('post');
      for (let i = 0; i < 10; i++) {
        const next = createMockNext();
        mw(makeReq(uid, true), createMockResponse(), next);
        expect(next).toHaveBeenCalledWith();
      }
    });
  });
});
