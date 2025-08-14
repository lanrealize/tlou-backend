const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

/**
 * 设置用户为管理员的脚本
 * 使用方法：node scripts/setAdmin.js [openid]
 */

async function setAdmin(openid) {
  try {
    // 连接数据库
    console.log('🔗 连接数据库...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ 数据库连接成功');

    // 查找用户
    console.log(`🔍 查找用户: ${openid}`);
    const user = await User.findOne({ openid });
    
    if (!user) {
      console.error('❌ 用户不存在，请先注册用户');
      process.exit(1);
    }

    // 检查是否已经是管理员
    if (user.isAdmin) {
      console.log('ℹ️  用户已经是管理员');
    } else {
      // 设置为管理员
      console.log('🔧 设置用户为管理员...');
      await User.findByIdAndUpdate(user._id, { isAdmin: true });
      console.log('✅ 成功设置为管理员');
    }

    // 显示用户信息
    const updatedUser = await User.findById(user._id);
    console.log('\n👤 用户信息:');
    console.log(`   ID: ${updatedUser._id}`);
    console.log(`   用户名: ${updatedUser.username}`);
    console.log(`   OpenID: ${updatedUser.openid}`);
    console.log(`   管理员: ${updatedUser.isAdmin ? '是' : '否'}`);
    console.log(`   虚拟用户: ${updatedUser.isVirtual ? '是' : '否'}`);
    console.log(`   创建时间: ${updatedUser.createdAt}`);

  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await mongoose.disconnect();
    console.log('\n🔐 数据库连接已关闭');
  }
}

// 获取命令行参数中的openid，如果没有则使用默认值
const targetOpenid = process.argv[2] || 'o4Y5CvoRL1Oodi_q7jWWrsMyqMIo';

console.log('🚀 开始设置管理员权限...');
console.log(`📝 目标OpenID: ${targetOpenid}`);
console.log('=' .repeat(50));

setAdmin(targetOpenid);