const mongoose = require('mongoose');

const circleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 50
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isPublic: {
    type: Boolean,
    default: true
  },
  description: {
    type: String,
    maxlength: 200,
    default: ''
  },
  // 权限设置
  allowInvite: {
    type: Boolean,
    default: true  // 是否允许成员邀请其他人
  },
  allowPost: {
    type: Boolean,
    default: true  // 是否允许成员发帖
  },
  // 统计信息
  stats: {
    totalPosts: { type: Number, default: 0 },
    totalMembers: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// 检查用户是否是成员
circleSchema.methods.isMember = function(userId) {
  return this.members.includes(userId) || this.creator.toString() === userId.toString();
};

// 更新成员统计
circleSchema.methods.updateMemberStats = function() {
  this.stats.totalMembers = this.members.length + 1; // +1 for creator
};

module.exports = mongoose.model('Circle', circleSchema); 