require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Circle = require('../models/Circle');
const Post = require('../models/Post');
const { deleteQiniuFiles } = require('../utils/qiniuUtils');

// 连接数据库
async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI 环境变量未设置');
    }
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ 数据库连接成功');
    console.log(`📡 连接地址: ${mongoUri.replace(/\/\/.*@/, '//****@')}`); // 隐藏密码
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    process.exit(1);
  }
}

// 清理孤儿数据
async function cleanupOrphanData() {
  console.log('🧹 开始清理孤儿数据...\n');

  const stats = {
    deletedCircles: 0,
    deletedPosts: 0,
    deletedImages: 0,
    clearedComments: 0,
    clearedLikes: 0
  };

  try {
    // 1. 获取所有存在的用户ID
    const existingUsers = await User.find({}, '_id');
    const existingUserIds = existingUsers.map(u => u._id);
    console.log(`📊 当前数据库中有 ${existingUserIds.length} 个用户:`);
    existingUserIds.forEach(id => console.log(`  - ${id}`));
    console.log('');

    // 2. 查找孤儿圈子（creator不存在的圈子）
    const orphanCircles = await Circle.find({
      creator: { $nin: existingUserIds }
    });

    console.log(`🔍 发现 ${orphanCircles.length} 个孤儿圈子:`);
    for (const circle of orphanCircles) {
      console.log(`  - 圈子: ${circle.name} (创建者: ${circle.creator})`);
    }

    if (orphanCircles.length > 0) {
      // 3. 删除孤儿圈子中的所有帖子并收集图片URL
      const orphanCircleIds = orphanCircles.map(c => c._id);
      const orphanPosts = await Post.find({ circle: { $in: orphanCircleIds } });
      
      console.log(`\n📝 这些孤儿圈子中有 ${orphanPosts.length} 个帖子`);
      
      // 收集图片URL
      const imageUrls = [];
      orphanPosts.forEach(post => {
        if (post.images && post.images.length > 0) {
          post.images.forEach(img => {
            const url = typeof img === 'string' ? img : img.url;
            if (url) imageUrls.push(url);
          });
        }
      });

      // 删除帖子
      const deletedPosts = await Post.deleteMany({ circle: { $in: orphanCircleIds } });
      stats.deletedPosts += deletedPosts.deletedCount;

      // 删除圈子
      const deletedCircles = await Circle.deleteMany({ _id: { $in: orphanCircleIds } });
      stats.deletedCircles += deletedCircles.deletedCount;

      // 异步删除七牛云图片
      if (imageUrls.length > 0) {
        console.log(`🖼️  准备删除 ${imageUrls.length} 张七牛云图片...`);
        stats.deletedImages = imageUrls.length;
        setImmediate(() => deleteQiniuFiles(imageUrls));
      }

      console.log(`✅ 已删除 ${stats.deletedCircles} 个孤儿圈子和 ${stats.deletedPosts} 个帖子`);
    }

    // 4. 清理剩余圈子中的孤儿成员
    const remainingCircles = await Circle.find({});
    console.log(`\n🔍 检查剩余 ${remainingCircles.length} 个圈子中的孤儿成员...`);

    for (const circle of remainingCircles) {
      let hasUpdates = false;

      // 清理members中的孤儿用户
      const validMembers = circle.members.filter(memberId => existingUserIds.includes(memberId));
      if (validMembers.length !== circle.members.length) {
        const removedMembers = circle.members.filter(memberId => !existingUserIds.includes(memberId));
        console.log(`  - 圈子 "${circle.name}": 移除 ${removedMembers.length} 个孤儿成员`);
        circle.members = validMembers;
        hasUpdates = true;
      }

      // 清理appliers中的孤儿用户
      const validAppliers = circle.appliers.filter(applierId => existingUserIds.includes(applierId));
      if (validAppliers.length !== circle.appliers.length) {
        const removedAppliers = circle.appliers.filter(applierId => !existingUserIds.includes(applierId));
        console.log(`  - 圈子 "${circle.name}": 移除 ${removedAppliers.length} 个孤儿申请者`);
        circle.appliers = validAppliers;
        hasUpdates = true;
      }

      if (hasUpdates) {
        circle.updateMemberStats();
        await circle.save();
      }
    }

    // 5. 清理帖子中的孤儿数据
    const allPosts = await Post.find({});
    console.log(`\n🔍 检查 ${allPosts.length} 个帖子中的孤儿数据...`);

    for (const post of allPosts) {
      let hasUpdates = false;

      // 清理likes中的孤儿用户
      const validLikes = post.likes.filter(userId => existingUserIds.includes(userId));
      if (validLikes.length !== post.likes.length) {
        const removedLikes = post.likes.length - validLikes.length;
        console.log(`  - 帖子: 移除 ${removedLikes} 个孤儿点赞`);
        post.likes = validLikes;
        stats.clearedLikes += removedLikes;
        hasUpdates = true;
      }

      // 清理comments中的孤儿用户
      const validComments = post.comments.filter(comment => existingUserIds.includes(comment.author));
      if (validComments.length !== post.comments.length) {
        const removedComments = post.comments.length - validComments.length;
        console.log(`  - 帖子: 移除 ${removedComments} 个孤儿评论`);
        post.comments = validComments;
        stats.clearedComments += removedComments;
        hasUpdates = true;
      }

      // 清理comments中的孤儿replyTo引用
      post.comments.forEach(comment => {
        if (comment.replyTo && !existingUserIds.includes(comment.replyTo)) {
          console.log(`  - 评论: 清除孤儿replyTo引用`);
          comment.replyTo = null;
          hasUpdates = true;
        }
      });

      if (hasUpdates) {
        await post.save();
      }
    }

    // 6. 查找孤儿帖子（作者不存在的帖子）
    const orphanPostsCount = await Post.countDocuments({
      author: { $nin: existingUserIds }
    });

    if (orphanPostsCount > 0) {
      console.log(`\n🔍 发现 ${orphanPostsCount} 个孤儿帖子`);
      
      // 收集孤儿帖子的图片
      const orphanPostsWithImages = await Post.find({
        author: { $nin: existingUserIds }
      }).select('images');
      
      const orphanImageUrls = [];
      orphanPostsWithImages.forEach(post => {
        if (post.images && post.images.length > 0) {
          post.images.forEach(img => {
            const url = typeof img === 'string' ? img : img.url;
            if (url) orphanImageUrls.push(url);
          });
        }
      });

      // 删除孤儿帖子
      const deletedOrphanPosts = await Post.deleteMany({
        author: { $nin: existingUserIds }
      });
      
      stats.deletedPosts += deletedOrphanPosts.deletedCount;

      // 异步删除图片
      if (orphanImageUrls.length > 0) {
        console.log(`🖼️  准备删除 ${orphanImageUrls.length} 张孤儿帖子的图片...`);
        stats.deletedImages += orphanImageUrls.length;
        setImmediate(() => deleteQiniuFiles(orphanImageUrls));
      }

      console.log(`✅ 已删除 ${deletedOrphanPosts.deletedCount} 个孤儿帖子`);
    }

    console.log('\n🎉 清理完成！统计结果:');
    console.log(`  - 删除孤儿圈子: ${stats.deletedCircles}`);
    console.log(`  - 删除孤儿帖子: ${stats.deletedPosts}`);
    console.log(`  - 清理孤儿评论: ${stats.clearedComments}`);
    console.log(`  - 清理孤儿点赞: ${stats.clearedLikes}`);
    console.log(`  - 删除图片数量: ${stats.deletedImages}`);

  } catch (error) {
    console.error('❌ 清理过程中出现错误:', error);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    await connectDB();
    await cleanupOrphanData();
    console.log('\n✅ 数据库清理完成，数据一致性已恢复！');
  } catch (error) {
    console.error('❌ 清理脚本执行失败:', error);
  } finally {
    await mongoose.connection.close();
    console.log('📀 数据库连接已关闭');
  }
}

// 执行脚本
main();
