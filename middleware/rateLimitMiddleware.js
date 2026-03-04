const { AppError } = require('../utils/errorHandler');

// 内存滑动窗口：{ userId: { post: [ts, ...], comment: [ts, ...] } }
const windows = new Map();

const LIMITS = {
  post:    { max: 3, windowMs: 60 * 1000 },
  comment: { max: 6, windowMs: 60 * 1000 }
};

// 每5分钟清理不活跃用户的过期数据
// .unref() 让此定时器不阻止进程/测试退出
setInterval(() => {
  const now = Date.now();
  for (const [userId, types] of windows) {
    for (const type of Object.keys(types)) {
      const windowMs = LIMITS[type]?.windowMs ?? 60000;
      types[type] = types[type].filter(ts => now - ts < windowMs);
    }
    if (Object.values(types).every(arr => arr.length === 0)) {
      windows.delete(userId);
    }
  }
}, 5 * 60 * 1000).unref();

function rateLimit(type) {
  const { max, windowMs } = LIMITS[type];

  return (req, res, next) => {
    // TODO: 付费用户接入订单系统后，在此处检查有效订单，满足条件可放宽或跳过限制
    if (req.user.isPremium) return next();

    const userId = req.user._id;
    const now = Date.now();

    if (!windows.has(userId)) windows.set(userId, { post: [], comment: [] });
    const userWindow = windows.get(userId);

    // 清理当前类型的过期时间戳
    userWindow[type] = userWindow[type].filter(ts => now - ts < windowMs);

    if (userWindow[type].length >= max) {
      // 找倒数第 max 个时间戳，计算冷却剩余秒数（偏保守：向上取整）
      const oldestInWindow = userWindow[type][0];
      const retryAfter = Math.ceil((oldestInWindow + windowMs - now) / 1000);

      return next(new AppError('操作过于频繁，请稍后再试', 429, {
        reason: 'rate_limited',
        retryAfter: Math.max(retryAfter, 1)
      }));
    }

    // 记录本次请求时间戳
    userWindow[type].push(now);
    next();
  };
}

module.exports = { rateLimit };
