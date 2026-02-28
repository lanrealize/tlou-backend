const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  author: {
    type: String,  // openid
    ref: 'User',
    required: true
  },
  circle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Circle',
    required: true
  },
  content: {
    type: String,
    default: ''
  },
  images: {
    type: [mongoose.Schema.Types.Mixed],
    validate: {
      validator: function(arr) {
        if (!Array.isArray(arr)) return true; // 允许空值
        return arr.every(value => {
          // 支持字符串（旧格式）或对象（新格式）
          if (typeof value === 'string') {
            return true; // 兼容旧数据：字符串URL
          }
          if (typeof value === 'object' && value !== null) {
            // 新格式：包含url, width, height的对象
            return typeof value.url === 'string' && 
                   typeof value.width === 'number' && 
                   typeof value.height === 'number';
          }
          return false;
        });
      },
      message: 'images数组元素必须是字符串URL或包含{url, width, height}的对象'
    },
    default: []
  },
  reactions: [{
    user: { type: String, ref: 'User', required: true },
    type: { type: String, default: 'like' }
  }],
  // 图片的文字摘要，供 AI 历史上下文使用（避免每次带原图消耗 token）
  imageDescription: {
    type: String,
    default: ''
  },
  comments: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: mongoose.Types.ObjectId
    },
    author: {
      type: String,  // openid
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: true
    },
    replyTo: {
      type: String,  // openid
      ref: 'User',
      default: null
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// 添加复合索引：circle + createdAt（用于查询特定朋友圈的帖子）
postSchema.index({ circle: 1, createdAt: -1 });


module.exports = mongoose.model('Post', postSchema); 