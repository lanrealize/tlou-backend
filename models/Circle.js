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
  description: {
    type: String,
    maxlength: 200,
    default: ''
  },
  // AI 人设配置（占位，后续填充）
  aiPersona: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  // 统计信息
  stats: {
    totalPosts: { type: Number, default: 0 }
  },
  // 最新活动时间
  latestActivityTime: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// 检查用户是否是创建者
circleSchema.methods.isCreator = function(userOpenid) {
  const creatorId = this.creator && typeof this.creator === 'object' ? this.creator._id : this.creator;
  return creatorId === userOpenid;
};

// 更新最新活动时间
circleSchema.methods.updateActivityTime = function() {
  this.latestActivityTime = new Date();
  return this.save();
};

module.exports = mongoose.model('Circle', circleSchema);
