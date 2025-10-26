const mongoose = require('mongoose');
const User = require('../models/User');
const Circle = require('../models/Circle');
const Post = require('../models/Post');

require('dotenv').config();

/**
 * 数据迁移脚本：将所有用户ID从ObjectId迁移到openid作为主键
 * 
 * 警告：这是一个破坏性操作，请务必先备份数据库！
 * 
 * 使用方法：node scripts/migrateToOpenidPrimary.js
 */

async function migrateToOpenidPrimary() {
  try {
    console.log('🚀 开始数据迁移：ObjectId -> openid 主键');
    console.log('⚠️  这是一个破坏性操作，请确保已经备份数据库！');
    
    // 连接数据库
    console.log('🔗 连接数据库...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ 数据库连接成功');

    // 步骤1：收集所有用户的ObjectId和openid映射
    console.log('\n📊 步骤1: 收集用户ID映射...');
    const users = await User.find({}, '_id openid username').lean();
    console.log(`找到 ${users.length} 个用户`);
    
    // 创建ObjectId到openid的映射
    const idToOpenidMap = {};
    const openidToUserMap = {};
    
    for (const user of users) {
      idToOpenidMap[user._id.toString()] = user.openid;
      openidToUserMap[user.openid] = user;
    }

    console.log('✅ ID映射收集完成');

    // 步骤2：更新Circle集合中的用户引用
    console.log('\n🔄 步骤2: 更新Circle集合...');
    const circles = await Circle.find({}).lean();
    console.log(`找到 ${circles.length} 个朋友圈`);

    for (const circle of circles) {
      const updates = {};
      
      // 更新creator
      if (circle.creator && idToOpenidMap[circle.creator.toString()]) {
        updates.creator = idToOpenidMap[circle.creator.toString()];
      }
      
      // 更新members数组
      if (circle.members && circle.members.length > 0) {
        updates.members = circle.members
          .map(id => idToOpenidMap[id.toString()])
          .filter(Boolean);
      }
      
      // 更新appliers数组
      if (circle.appliers && circle.appliers.length > 0) {
        updates.appliers = circle.appliers
          .map(id => idToOpenidMap[id.toString()])
          .filter(Boolean);
      }

      if (Object.keys(updates).length > 0) {
        await Circle.findByIdAndUpdate(circle._id, updates);
      }
    }

    console.log('✅ Circle集合更新完成');

    // 步骤3：更新Post集合中的用户引用
    console.log('\n🔄 步骤3: 更新Post集合...');
    const posts = await Post.find({}).lean();
    console.log(`找到 ${posts.length} 个帖子`);

    for (const post of posts) {
      const updates = {};
      
      // 更新author
      if (post.author && idToOpenidMap[post.author.toString()]) {
        updates.author = idToOpenidMap[post.author.toString()];
      }
      
      // 更新likes数组
      if (post.likes && post.likes.length > 0) {
        updates.likes = post.likes
          .map(id => idToOpenidMap[id.toString()])
          .filter(Boolean);
      }
      
      // 更新comments中的author和replyTo
      if (post.comments && post.comments.length > 0) {
        updates.comments = post.comments.map(comment => {
          const updatedComment = { ...comment };
          
          if (comment.author && idToOpenidMap[comment.author.toString()]) {
            updatedComment.author = idToOpenidMap[comment.author.toString()];
          }
          
          if (comment.replyTo && idToOpenidMap[comment.replyTo.toString()]) {
            updatedComment.replyTo = idToOpenidMap[comment.replyTo.toString()];
          }
          
          return updatedComment;
        });
      }

      if (Object.keys(updates).length > 0) {
        await Post.findByIdAndUpdate(post._id, updates);
      }
    }

    console.log('✅ Post集合更新完成');

    // 步骤4：为User集合准备新的数据结构
    console.log('\n🔄 步骤4: 重建User集合...');
    
    // 创建临时集合存储新的用户数据
    const tempUsers = [];
    
    for (const user of users) {
      const newUser = {
        _id: user.openid,  // 使用openid作为主键
        username: user.username,
        avatar: user.avatar || '',
        isVirtual: user.isVirtual || false,
        virtualOwner: user.virtualOwner ? idToOpenidMap[user.virtualOwner.toString()] : null,
        isAdmin: user.isAdmin || false,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };
      
      tempUsers.push(newUser);
    }

    // 删除旧的User集合（危险操作！）
    console.log('⚠️  删除旧的User集合...');
    await mongoose.connection.db.collection('users').drop();
    
    // 插入新的用户数据
    console.log('📥 插入新的用户数据...');
    await mongoose.connection.db.collection('users').insertMany(tempUsers);

    console.log('✅ User集合重建完成');

    // 步骤5：验证数据完整性
    console.log('\n🔍 步骤5: 验证数据完整性...');
    
    const newUserCount = await User.countDocuments();
    console.log(`新User集合用户数量: ${newUserCount}`);
    
    const circleCount = await Circle.countDocuments();
    console.log(`Circle集合数量: ${circleCount}`);
    
    const postCount = await Post.countDocuments();
    console.log(`Post集合数量: ${postCount}`);

    // 随机验证几个用户的引用
    const sampleCircles = await Circle.find({}).limit(3).populate('creator members appliers');
    console.log('样本朋友圈验证:');
    sampleCircles.forEach(circle => {
      console.log(`  - ${circle.name}: creator=${circle.creator?._id}, members=${circle.members?.length}`);
    });

    console.log('\n🎉 数据迁移完成！');
    console.log('📝 请立即更新代码中的模型定义以匹配新的数据结构');

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    console.error('💡 请检查数据库连接和权限设置');
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await mongoose.disconnect();
    console.log('\n🔐 数据库连接已关闭');
  }
}

// 运行迁移
if (require.main === module) {
  migrateToOpenidPrimary();
}

module.exports = { migrateToOpenidPrimary };
