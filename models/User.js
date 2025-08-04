const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  openid: {
    type: String,
    required: true,
    unique: true
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
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null  // 只有虚拟用户才有这个字段
  },
  // 管理员标识
  isAdmin: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// 虚拟用户相关方法
userSchema.methods.isOwnedBy = function(adminId) {
  return this.virtualOwner && this.virtualOwner.toString() === adminId.toString();
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

module.exports = mongoose.model('User', userSchema); 