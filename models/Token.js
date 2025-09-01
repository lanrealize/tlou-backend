const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  value: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  }
}, {
  timestamps: true
});

// 添加索引以便快速查询过期token
tokenSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Token', tokenSchema);
