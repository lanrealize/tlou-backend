const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true  // openid作为主键
  },
  username: {
    type: String,
    default: ''
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
  // AI 用户标识
  isAI: {
    type: Boolean,
    default: false
  },
  // 订阅消息：记录用户已订阅的模板（前端上报 accept 后写入）
  subscribedTemplates: {
    type: [String],
    default: []
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