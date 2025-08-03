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

module.exports = mongoose.model('User', userSchema); 