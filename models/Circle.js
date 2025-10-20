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
  appliers: [{
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
  },
  // 最新活动时间
  latestActivityTime: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// 添加索引以优化public朋友圈的检索
circleSchema.index({ isPublic: 1 });
// 复合索引：公开状态 + 最新活动时间，用于高效查询活跃的public朋友圈
circleSchema.index({ isPublic: 1, latestActivityTime: -1 });
// 复合索引：公开状态 + 创建时间，用于查询最新的public朋友圈
circleSchema.index({ isPublic: 1, createdAt: -1 });

// 检查用户是否是成员
circleSchema.methods.isMember = function(userId) {
  return this.members.includes(userId) || this.creator.toString() === userId.toString();
};

// 检查用户是否已申请加入
circleSchema.methods.isApplier = function(userId) {
  return this.appliers.includes(userId);
};

// 检查用户是否是创建者
circleSchema.methods.isCreator = function(userId) {
  return this.creator.toString() === userId.toString();
};

// 检查用户是否有任何角色（creator, member, applier中的任意一种）
circleSchema.methods.hasAnyRole = function(userId) {
  return this.isCreator(userId) || 
         this.isMember(userId) || 
         this.isApplier(userId);
};

// 更新成员统计
circleSchema.methods.updateMemberStats = function() {
  this.stats.totalMembers = this.members.length + 1; // +1 for creator
};

// 更新最新活动时间
circleSchema.methods.updateActivityTime = function() {
  this.latestActivityTime = new Date();
  return this.save();
};

module.exports = mongoose.model('Circle', circleSchema); 