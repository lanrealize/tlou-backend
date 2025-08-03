const mongoose = require('mongoose');
const Circle = require('../models/Circle');
const Post = require('../models/Post');
require('dotenv').config();

async function deleteAllCircles() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('MongoDB连接成功');
    
    // 删除所有朋友圈前先显示当前朋友圈数量
    const circleCount = await Circle.countDocuments();
    console.log(`当前数据库中有 ${circleCount} 个朋友圈`);
    
    if (circleCount === 0) {
      console.log('数据库中没有朋友圈，无需删除');
      return;
    }
    
    // 统计相关的帖子数量
    const postCount = await Post.countDocuments();
    console.log(`当前数据库中有 ${postCount} 个帖子`);
    
    // 确认删除（在生产环境中建议添加更多确认步骤）
    console.log('准备删除所有朋友圈和相关帖子...');
    
    // 先删除所有相关的帖子
    const postResult = await Post.deleteMany({});
    console.log(`✅ 成功删除了 ${postResult.deletedCount} 个帖子`);
    
    // 删除所有朋友圈
    const circleResult = await Circle.deleteMany({});
    console.log(`✅ 成功删除了 ${circleResult.deletedCount} 个朋友圈`);
    
    // 验证删除结果
    const remainingCircles = await Circle.countDocuments();
    const remainingPosts = await Post.countDocuments();
    console.log(`数据库中剩余朋友圈数量: ${remainingCircles}`);
    console.log(`数据库中剩余帖子数量: ${remainingPosts}`);
    
  } catch (error) {
    console.error('❌ 删除朋友圈时发生错误:', error.message);
  } finally {
    // 关闭数据库连接
    await mongoose.connection.close();
    console.log('数据库连接已关闭');
    process.exit(0);
  }
}

// 添加确认提示
console.log('⚠️  警告: 这将删除数据库中的所有朋友圈和相关帖子！');
console.log('如果确定要继续，请在5秒内按 Ctrl+C 取消...');

setTimeout(() => {
  deleteAllCircles();
}, 5000);