const mongoose = require('mongoose');

const tempUserSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true  // openid作为主键
  },
  // 试用功能：允许临时用户创建一个朋友圈和发一个帖子
  trialCircleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Circle',
    default: null
  },
  trialPostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    default: null
  }
}, {
  timestamps: true,
  _id: false
});

// 自动清理30天前的记录
tempUserSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('TempUser', tempUserSchema);
