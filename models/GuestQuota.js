const mongoose = require('mongoose');

const guestQuotaSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  count: {
    type: Number,
    default: 0
  },
  lastDate: {
    type: String,
    default: ''
  },
  dailyLimit: {
    type: Number,
    default: 3
  }
}, {
  timestamps: true
});

// 检查并更新配额
guestQuotaSchema.methods.checkAndUpdateQuota = function() {
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  
  // 如果不是今天，重置计数
  if (this.lastDate !== today) {
    this.count = 0;
    this.lastDate = today;
  }
  
  // 检查是否超限
  if (this.count >= this.dailyLimit) {
    return {
      allowed: false,
      message: `今日发现次数已用完（${this.dailyLimit}/${this.dailyLimit}），明天 00:00 重置。登录后可获得更多次数~`,
      quota: {
        daily: this.dailyLimit,
        used: this.count,
        remaining: 0,
        resetAt: this._getNextDayStart(),
        isGuest: true
      }
    };
  }
  
  // 增加计数
  this.count += 1;
  
  // 构建成功消息
  const remaining = this.dailyLimit - this.count;
  let successMessage = '获取随机朋友圈成功';
  
  if (remaining === 0) {
    successMessage = '获取随机朋友圈成功，今日次数已用完。登录可获得更多次数~';
  } else if (remaining === 1) {
    successMessage = '获取随机朋友圈成功，今天还剩最后 1 次机会';
  }
  
  return {
    allowed: true,
    message: successMessage,
    quota: {
      daily: this.dailyLimit,
      used: this.count,
      remaining,
      resetAt: this._getNextDayStart(),
      isGuest: true
    }
  };
};

// 获取下一天 00:00 的时间戳
guestQuotaSchema.methods._getNextDayStart = function() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
};

// 自动清理30天前的记录
guestQuotaSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('GuestQuota', guestQuotaSchema);

