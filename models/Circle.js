const mongoose = require('mongoose');

const circleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 50
  },
  creator: {
    type: String,  // openid
    ref: 'User',
    required: true
  },
  members: [{
    type: String,  // openid数组
    ref: 'User'
  }],
  appliers: [{
    userId: {
      type: String,
      ref: 'User',
      required: true
    },
    appliedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isPublic: {
    type: Boolean,
    default: true
  },
  enableShareAnimation: {
    type: Boolean,
    default: true  // 默认启用分享动画
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
  },
  // 简单邀请码 - 所有朋友圈都有，公开朋友圈虽然不需要也会生成（保持一致性）
  inviteCode: {
    type: String,
    default: null,  // 创建时自动生成
    index: true     // 为查询优化添加索引
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
circleSchema.methods.isMember = function(userOpenid) {
  // 获取creator的ID（处理populate情况）
  const creatorId = typeof this.creator === 'object' ? this.creator._id : this.creator;
  
  // 检查是否是创建者
  if (creatorId === userOpenid) {
    return true;
  }
  
  // 检查是否在成员列表中（处理populate情况）
  return this.members.some(member => {
    const memberId = typeof member === 'object' ? member._id : member;
    return memberId === userOpenid;
  });
};

// 检查用户是否已申请加入
circleSchema.methods.isApplier = function(userOpenid) {
  return this.appliers.some(applier => {
    // 新格式：{ userId, appliedAt }
    if (applier.userId) {
      const applierId = typeof applier.userId === 'object' ? applier.userId._id : applier.userId;
      return applierId === userOpenid;
    }
    // 兼容旧格式：直接是字符串（数据迁移期间）
    const applierId = typeof applier === 'object' ? applier._id : applier;
    return applierId === userOpenid;
  });
};

// 检查用户是否是创建者  
circleSchema.methods.isCreator = function(userOpenid) {
  // 获取creator的ID（处理populate情况）
  const creatorId = typeof this.creator === 'object' ? this.creator._id : this.creator;
  return creatorId === userOpenid;
};

// 检查用户是否有任何角色（creator, member, applier中的任意一种）
circleSchema.methods.hasAnyRole = function(userOpenid) {
  // 直接使用已有的方法，现在非常简洁
  return this.isCreator(userOpenid) || 
         this.isMember(userOpenid) || 
         this.isApplier(userOpenid);
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

// 生成简单邀请码（基于圈子ID的确定性生成）
circleSchema.methods.generateInviteCode = function() {
  const crypto = require('crypto');
  // 基于圈子ID生成6位邀请码，确保同一个圈子总是生成相同的邀请码
  const hash = crypto.createHash('md5').update(this._id.toString()).digest('hex');
  return hash.substring(0, 6).toUpperCase();
};

// 验证邀请码是否有效
circleSchema.methods.isValidInviteCode = function(code) {
  if (!code || this.isPublic) return false;
  return code === this.inviteCode;
};

// 预处理中间件：为所有朋友圈自动生成邀请码
circleSchema.pre('save', function(next) {
  if (!this.inviteCode) {
    this.inviteCode = this.generateInviteCode();
  }
  next();
});

module.exports = mongoose.model('Circle', circleSchema); 