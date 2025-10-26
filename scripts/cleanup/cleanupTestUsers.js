require('dotenv').config();
const mongoose = require('mongoose');
const { cleanupUserData } = require('../../utils/memberCleanup');
const User = require('../../models/User');

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

// 清理所有test开头的用户
async function cleanupTestUsers() {
  console.log('🧹 开始清理test开头的用户...\n');

  const summary = {
    deletedUsers: 0,
    totalCleaned: {
      deletedCircles: 0,
      leftCircles: 0,
      deletedPosts: 0,
      deletedComments: 0,
      removedLikes: 0,
      deletedVirtualUsers: 0
    }
  };

  try {
    // 1. 查找所有test开头的用户
    const testUsers = await User.find({
      _id: { $regex: /^test_/, $options: 'i' }
    });

    if (testUsers.length === 0) {
      console.log('✅ 没有找到test开头的用户');
      return summary;
    }

    console.log(`🔍 找到 ${testUsers.length} 个test开头的用户:`);
    testUsers.forEach(user => {
      console.log(`  - ${user._id} (${user.username}) ${user.isVirtual ? '[虚拟用户]' : ''} ${user.isAdmin ? '[管理员]' : ''}`);
    });

    // 2. 逐个清理每个test用户
    for (const user of testUsers) {
      console.log(`\n🗑️  开始清理用户: ${user.username} (${user._id})`);
      
      try {
        // 使用通用清理函数清理所有相关数据
        const userCleanupStats = await cleanupUserData(user._id, {
          deleteQiniuImages: true,
          deleteVirtualUsers: user.isAdmin  // 只有管理员才删除创建的虚拟用户
        });

        // 累计统计
        summary.totalCleaned.deletedCircles += userCleanupStats.deletedCircles;
        summary.totalCleaned.leftCircles += userCleanupStats.leftCircles;
        summary.totalCleaned.deletedPosts += userCleanupStats.deletedPosts;
        summary.totalCleaned.deletedComments += userCleanupStats.deletedComments;
        summary.totalCleaned.removedLikes += userCleanupStats.removedLikes;
        summary.totalCleaned.deletedVirtualUsers += userCleanupStats.deletedVirtualUsers;

        // 删除用户本身
        await User.findByIdAndDelete(user._id);
        summary.deletedUsers++;

        console.log(`✅ 用户 ${user.username} 清理完成，统计:`, userCleanupStats);
        
      } catch (error) {
        console.error(`❌ 清理用户 ${user.username} 时出错:`, error);
        continue;
      }
    }

    console.log('\n🎉 所有test用户清理完成！总体统计:');
    console.log(`  - 删除test用户数量: ${summary.deletedUsers}`);
    console.log(`  - 删除圈子数量: ${summary.totalCleaned.deletedCircles}`);
    console.log(`  - 清理帖子数量: ${summary.totalCleaned.deletedPosts}`);
    console.log(`  - 清理评论数量: ${summary.totalCleaned.deletedComments}`);
    console.log(`  - 清理点赞数量: ${summary.totalCleaned.removedLikes}`);
    console.log(`  - 删除虚拟用户数量: ${summary.totalCleaned.deletedVirtualUsers}`);

    // 3. 检查清理后的用户状态
    const remainingUsers = await User.find({}, '_id username isVirtual isAdmin');
    console.log(`\n📊 剩余用户 (${remainingUsers.length} 个):`);
    remainingUsers.forEach(user => {
      console.log(`  - ${user._id} (${user.username}) ${user.isVirtual ? '[虚拟用户]' : ''} ${user.isAdmin ? '[管理员]' : ''}`);
    });

    return summary;

  } catch (error) {
    console.error('❌ 清理过程中出现错误:', error);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    await connectDB();
    
    // 确认操作
    console.log('⚠️  警告：此操作将删除所有test开头的用户及其相关数据（圈子、帖子、评论、点赞等）');
    console.log('🔄 开始执行清理...\n');
    
    const summary = await cleanupTestUsers();
    
    console.log('\n✅ test用户清理完成！数据库已清理干净！');
    
  } catch (error) {
    console.error('❌ 清理脚本执行失败:', error);
  } finally {
    await mongoose.connection.close();
    console.log('📀 数据库连接已关闭');
  }
}

// 执行脚本
main();
