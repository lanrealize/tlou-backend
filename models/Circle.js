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
  const userIdStr = userId.toString();
  
  // 检查是否是创建者
  const creatorId = this.creator._id ? this.creator._id.toString() : this.creator.toString();
  if (creatorId === userIdStr) {
    return true;
  }
  
  // 检查是否在成员列表中（兼容 populate 和未 populate 两种情况）
  return this.members.some(member => {
    const memberId = member._id ? member._id.toString() : member.toString();
    return memberId === userIdStr;
  });
};

// 检查用户是否已申请加入
circleSchema.methods.isApplier = function(userId) {
  const userIdStr = userId.toString();
  
  // 兼容 populate 和未 populate 两种情况
  return this.appliers.some(applier => {
    const applierId = applier._id ? applier._id.toString() : applier.toString();
    return applierId === userIdStr;
  });
};

// 检查用户是否是创建者
circleSchema.methods.isCreator = function(userId) {
  const userIdStr = userId.toString();
  // 兼容 populate 和未 populate 两种情况
  const creatorId = this.creator._id ? this.creator._id.toString() : this.creator.toString();
  return creatorId === userIdStr;
};

// 检查用户是否有任何角色（creator, member, applier中的任意一种）
// 优化：避免重复检查 creator
circleSchema.methods.hasAnyRole = function(userId) {
  const userIdStr = userId.toString();
  
  // 1. 先检查 creator（最快，单次比较）
  const creatorId = this.creator._id ? this.creator._id.toString() : this.creator.toString();
  if (creatorId === userIdStr) {
    return true;
  }
  
  // 2. 检查 members（需要遍历数组）
  const isMember = this.members.some(member => {
    const memberId = member._id ? member._id.toString() : member.toString();
    return memberId === userIdStr;
  });
  if (isMember) {
    return true;
  }
  
  // 3. 最后检查 appliers（需要遍历数组）
  return this.appliers.some(applier => {
    const applierId = applier._id ? applier._id.toString() : applier.toString();
    return applierId === userIdStr;
  });
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