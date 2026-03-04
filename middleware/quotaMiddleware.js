const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');

const LIMITS = {
  post:    { first: 7, daily: 5 },
  comment: { first: 30, daily: 20 }
};

// 返回今天的日期字符串 'YYYY-MM-DD'（UTC+8）
function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

// 判断某个 Date 是否是今天（自然日，Asia/Shanghai）
function isToday(date) {
  if (!date) return false;
  return new Date(date).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) === todayStr();
}

// 根据 user.createdAt 和当日计数算出 limit 和 remaining
function calcQuota(user, type) {
  const { first, daily } = LIMITS[type];
  const q = user.quota?.[type] ?? {};
  const today = todayStr();

  const isFirstDay = isToday(user.createdAt);
  const limit = isFirstDay ? first : daily;
  const currentCount = q.lastDate === today ? (q.todayCount ?? 0) : 0;

  const resetAt = new Date(today + 'T00:00:00+08:00');
  resetAt.setDate(resetAt.getDate() + 1);

  return {
    limit,
    remaining: Math.max(limit - currentCount, 0),
    resetAt: resetAt.toISOString()
  };
}

/**
 * quota(type) —— 检查配额中间件工厂，只检查不扣减
 */
function quota(type) {
  return async (req, res, next) => {
    // TODO: 付费用户接入订单系统后，在此处检查有效订单，满足条件直接跳过配额限制
    if (req.user.isPremium) return next();

    const { remaining, resetAt } = calcQuota(req.user, type);

    if (remaining <= 0) {
      return next(new AppError('今日次数已用完', 429, {
        reason: 'quota_exceeded',
        remaining: 0,
        resetAt
      }));
    }

    next();
  };
}

/**
 * deductQuota(userId, type) —— 扣减配额，在请求成功后调用
 */
async function deductQuota(userId, type) {
  const today = todayStr();
  const prefix = `quota.${type}`;

  await User.findByIdAndUpdate(userId, [
    {
      $set: {
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
 * getQuotaSnapshot(user, type) —— 读取配额快照，用于附带到响应
 */
function getQuotaSnapshot(user, type) {
  const { remaining, resetAt } = calcQuota(user, type);
  return { remaining, resetAt };
}

/**
 * getFullQuotaSnapshot(user) —— 返回 post + comment 的完整快照
 */
function getFullQuotaSnapshot(user) {
  return {
    post: getQuotaSnapshot(user, 'post'),
    comment: getQuotaSnapshot(user, 'comment')
  };
}

module.exports = { quota, deductQuota, getQuotaSnapshot, getFullQuotaSnapshot };
