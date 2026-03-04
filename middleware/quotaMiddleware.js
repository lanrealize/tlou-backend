const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');

// 首日/次日配额
const LIMITS = {
  post:    { first: 7, daily: 5 },
  comment: { first: 30, daily: 20 }
};

// 返回今天的日期字符串 'YYYY-MM-DD'（UTC+8）
function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

// 判断 firstUsedAt 是否和今天同一天
function isSameDay(date) {
  if (!date) return false;
  return new Date(date).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) === todayStr();
}

/**
 * quota(type) —— 检查配额中间件工厂
 * 只检查，不扣减；扣减由 deductQuota(type) 在请求成功后执行。
 */
function quota(type) {
  const { first, daily } = LIMITS[type];

  return async (req, res, next) => {
    // TODO: 付费用户接入订单系统后，在此处检查有效订单，满足条件直接跳过配额限制
    if (req.user.isPremium) return next();

    const q = req.user.quota?.[type] ?? {};
    const today = todayStr();

    // 是否首日：firstUsedAt 存在且是今天
    const isFirstDay = isSameDay(q.firstUsedAt);
    // 是否跨天：lastDate 不是今天，重置计数
    const isNewDay = q.lastDate !== today;

    const currentCount = isNewDay ? 0 : (q.todayCount ?? 0);
    const limit = (!q.firstUsedAt || isFirstDay) ? first : daily;
    const remaining = Math.max(limit - currentCount, 0);

    if (remaining <= 0) {
      // 计算下次重置时间（次日 00:00 Asia/Shanghai）
      const resetAt = new Date(
        new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) + 'T00:00:00+08:00'
      );
      resetAt.setDate(resetAt.getDate() + 1);

      return next(new AppError('今日次数已用完', 429, {
        reason: 'quota_exceeded',
        remaining: 0,
        resetAt: resetAt.toISOString()
      }));
    }

    next();
  };
}

/**
 * deductQuota(type) —— 扣减配额，挂在 handler 成功响应之后
 * 异步写 DB，不阻塞响应。
 */
async function deductQuota(userId, type) {
  const today = todayStr();
  const prefix = `quota.${type}`;

  // 用原子 update 避免并发问题
  await User.findByIdAndUpdate(userId, [
    {
      $set: {
        [`${prefix}.firstUsedAt`]: {
          $cond: [{ $eq: [`$${prefix}.firstUsedAt`, null] }, new Date(), `$${prefix}.firstUsedAt`]
        },
        [`${prefix}.todayCount`]: {
          $cond: [
            { $eq: [`$${prefix}.lastDate`, today] },
            { $add: [`$${prefix}.todayCount`, 1] },
            1
          ]
        },
        [`${prefix}.lastDate`]: today
      }
    }
  ]);
}

/**
 * 读取当前用户某类型的配额快照（用于响应体附带）
 * 注意：此时 DB 已扣减，直接从最新 user 文档读。
 */
function getQuotaSnapshot(user, type) {
  const { first, daily } = LIMITS[type];
  const q = user.quota?.[type] ?? {};
  const today = todayStr();
  const isFirstDay = isSameDay(q.firstUsedAt);
  const isNewDay = q.lastDate !== today;
  const currentCount = isNewDay ? 0 : (q.todayCount ?? 0);
  const limit = (!q.firstUsedAt || isFirstDay) ? first : daily;

  const resetAt = new Date(
    new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) + 'T00:00:00+08:00'
  );
  resetAt.setDate(resetAt.getDate() + 1);

  return {
    remaining: Math.max(limit - currentCount, 0),
    resetAt: resetAt.toISOString()
  };
}

module.exports = { quota, deductQuota, getQuotaSnapshot };
