const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true  // openid作为主键
  },
  username: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: ''
  },
  // 虚拟用户相关字段
  isVirtual: {
    type: Boolean,
    default: false
  },
  virtualOwner: {
    type: String,  // 引用其他用户的openid
    ref: 'User',
    default: null  // 只有虚拟用户才有这个字段
  },
  // 管理员标识
  isAdmin: {
    type: Boolean,
    default: false
  },
  // 发现朋友圈配额
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
    },
    hasPurchase: { 
      type: Boolean, 
      default: false 
    },
    customMessage: { 
      type: String, 
      default: '' 
    }
  }
}, {
  timestamps: true,
  _id: false  // 禁用自动ObjectId生成，使用自定义_id
});

// 虚拟用户相关方法
userSchema.methods.isOwnedBy = function(adminOpenid) {
  return this.virtualOwner && this.virtualOwner === adminOpenid;
};

// 检查用户是否具有管理员权限（简化版 - 所有虚拟用户都是管理员）
userSchema.methods.hasAdminPermission = async function() {
  // 简化逻辑：直接检查 isAdmin 字段，因为所有虚拟用户现在都是管理员
  if (this.isAdmin) {
    return { hasPermission: true, effectiveAdmin: this };
  }
  
  return { hasPermission: false, effectiveAdmin: null };
};

// 获取有效的管理员（简化版 - 所有虚拟用户都是管理员）
userSchema.methods.getEffectiveAdmin = async function() {
  // 简化逻辑：如果是管理员就返回自己（包括虚拟管理员）
  if (this.isAdmin) {
    return this;
  }
  
  return null;
};

// 检查并更新发现朋友圈配额
userSchema.methods.checkAndUpdateDiscoverQuota = function() {
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  
  // 如果不是今天，重置计数
  if (this.discoverQuota.lastDate !== today) {
    this.discoverQuota.count = 0;
    this.discoverQuota.lastDate = today;
  }
  
  // 计算当前限额（购物用户可以多刷）
  const currentLimit = this.discoverQuota.hasPurchase 
    ? this.discoverQuota.dailyLimit + 5  // 购物用户额外 5 次
    : this.discoverQuota.dailyLimit;
  
  // 检查是否超限
  if (this.discoverQuota.count >= currentLimit) {
    // 构建拒绝消息
    const defaultMessage = this.discoverQuota.hasPurchase
      ? `今日发现次数已用完（${currentLimit}/${currentLimit}），明天 00:00 重置`
      : `今日发现次数已用完（${currentLimit}/${currentLimit}），明天 00:00 重置。购物用户可获得 ${this.discoverQuota.dailyLimit + 5} 次机会哦~`;
    
    const message = this.discoverQuota.customMessage || defaultMessage;
    
    return {
      allowed: false,
      message,
      quota: {
        daily: currentLimit,
        used: this.discoverQuota.count,
        remaining: 0,
        resetAt: this._getNextDayStart(),
        hasPurchase: this.discoverQuota.hasPurchase
      }
    };
  }
  
  // 增加计数
  this.discoverQuota.count += 1;
  
  // 构建成功消息（带提示）
  const remaining = currentLimit - this.discoverQuota.count;
  let successMessage = '获取随机朋友圈成功';
  
  if (remaining === 0) {
    successMessage = '获取随机朋友圈成功，今日次数已用完';
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
      hasPurchase: this.discoverQuota.hasPurchase
    }
  };
};

// 获取下一天 00:00 的时间戳
userSchema.methods._getNextDayStart = function() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
};

// 添加索引以确保性能
userSchema.index({ _id: 1 }, { unique: true }); // openid主键索引
userSchema.index({ isAdmin: 1 }); // 管理员查询索引
userSchema.index({ virtualOwner: 1 }); // 虚拟用户所有者查询索引

// 静态方法：通过openid查找用户
userSchema.statics.findByOpenid = function(openid) {
  return this.findById(openid);
};

// 静态方法：批量通过openid查找用户
userSchema.statics.findByOpenids = function(openids) {
  return this.find({ _id: { $in: openids } });
};

module.exports = mongoose.model('User', userSchema); 