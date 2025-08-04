const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

/**
 * 将所有虚拟用户设置为管理员的脚本
 * 使用方法：node scripts/setVirtualUsersAdmin.js
 */

async function setVirtualUsersAdmin() {
  try {
    // 连接数据库
    console.log('🔗 连接数据库...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ 数据库连接成功');

    // 查找所有虚拟用户
    console.log('🔍 查找所有虚拟用户...');
    const virtualUsers = await User.find({ 
      isVirtual: true,
      isAdmin: false  // 只查找还不是管理员的虚拟用户
    });
    
    console.log(`📊 找到 ${virtualUsers.length} 个需要更新的虚拟用户`);

    if (virtualUsers.length === 0) {
      console.log('ℹ️  所有虚拟用户都已经是管理员，无需更新');
      return;
    }

    // 显示将要更新的用户列表
    console.log('\n📋 将要更新的虚拟用户列表:');
    virtualUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.username} (${user.openid})`);
    });

    // 批量更新虚拟用户为管理员
    console.log('\n🔧 批量更新虚拟用户为管理员...');
    const updateResult = await User.updateMany(
      { 
        isVirtual: true,
        isAdmin: false 
      },
      { 
        isAdmin: true 
      }
    );

    console.log(`✅ 成功更新 ${updateResult.modifiedCount} 个虚拟用户为管理员`);

    // 验证更新结果
    console.log('\n🔍 验证更新结果...');
    const updatedVirtualUsers = await User.find({ isVirtual: true });
    const adminVirtualUsers = updatedVirtualUsers.filter(user => user.isAdmin);
    
    console.log('\n📊 更新后统计:');
    console.log(`   总虚拟用户数: ${updatedVirtualUsers.length}`);
    console.log(`   管理员虚拟用户数: ${adminVirtualUsers.length}`);
    console.log(`   非管理员虚拟用户数: ${updatedVirtualUsers.length - adminVirtualUsers.length}`);

    if (updatedVirtualUsers.length > 0) {
      console.log('\n👥 所有虚拟用户列表:');
      updatedVirtualUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.username} - 管理员: ${user.isAdmin ? '是' : '否'} (${user.openid})`);
      });
    }

  } catch (error) {
    console.error('❌ 操作失败:', error.message);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await mongoose.disconnect();
    console.log('\n🔐 数据库连接已关闭');
  }
}

console.log('🚀 开始将虚拟用户设置为管理员...');
console.log('=' .repeat(50));

setVirtualUsersAdmin();