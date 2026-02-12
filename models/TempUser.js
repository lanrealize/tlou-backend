const mongoose = require('mongoose');

const tempUserSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true  // openid作为主键
  },
  discoverQuota: {
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
  }
}, {
  timestamps: true,
  _id: false
});

// 检查并更新发现朋友圈配额
tempUserSchema.methods.checkAndUpdateDiscoverQuota = function() {
  // 使用中国时区（UTC+8）获取今天的日期
  const now = new Date();
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = chinaTime.toISOString().split('T')[0]; // 'YYYY-MM-DD'
  
  // 如果不是今天，重置计数
  if (this.discoverQuota.lastDate !== today) {
    this.discoverQuota.count = 0;
    this.discoverQuota.lastDate = today;
  }
  
  const currentLimit = this.discoverQuota.dailyLimit;
  
  // 检查是否超限
  if (this.discoverQuota.count >= currentLimit) {
    return {
      allowed: false,
      message: `今日发现次数已用完（${currentLimit}/${currentLimit}），明天 00:00 重置。登录后可获得更多次数~`,
      quota: {
        daily: currentLimit,
        used: this.discoverQuota.count,
        remaining: 0,
        resetAt: this._getNextDayStart(),
        isTemp: true
      }
    };
  }
  
  // 增加计数
  this.discoverQuota.count += 1;
  
  // 构建成功消息
  const remaining = currentLimit - this.discoverQuota.count;
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
      daily: currentLimit,
      used: this.discoverQuota.count,
      remaining,
      resetAt: this._getNextDayStart(),
      isTemp: true
    }
  };
};

// 获取下一天 00:00 的时间戳（中国时区）
tempUserSchema.methods._getNextDayStart = function() {
  const now = new Date();
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const tomorrow = new Date(chinaTime);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  return tomorrow.toISOString();
};

// 自动清理30天前的记录
tempUserSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('TempUser', tempUserSchema);

