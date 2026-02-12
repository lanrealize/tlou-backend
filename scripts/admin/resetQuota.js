require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../../models/User');
const TempUser = require('../../models/TempUser');

// 要重置配额的 openid
const TARGET_OPENID = 'o4Y5CvoRL1Oodi_q7jWWrsMyqMIo';

// 连接数据库
async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI 环境变量未设置');
    }
    
    await mongoose.connect(mongoUri);
    console.log('✅ 数据库连接成功');
  } catch (error) {
    console.error('❌ 数据库连接失败:', error);
    process.exit(1);
  }
}

// 重置配额
async function resetQuota() {
  console.log(`\n🔄 开始重置配额: ${TARGET_OPENID}\n`);

  try {
    // 先查找真实用户
    let user = await User.findById(TARGET_OPENID);
    if (user) {
      console.log('📊 重置前配额信息:');
      console.log(`  - 类型: 真实用户`);
      console.log(`  - 已使用: ${user.discoverQuota.count}/${user.discoverQuota.dailyLimit}`);
      console.log(`  - 最后使用日期: ${user.discoverQuota.lastDate || '无'}`);
      console.log(`  - 购物用户: ${user.discoverQuota.hasPurchase ? '是' : '否'}`);
      
      // 重置配额
      user.discoverQuota.count = 0;
      user.discoverQuota.lastDate = '';
      await user.save();
      
      console.log('\n✅ 真实用户配额已重置');
      console.log(`  - 剩余次数: ${user.discoverQuota.dailyLimit}/${user.discoverQuota.dailyLimit}`);
      return;
    }
    
    // 查找临时用户
    let tempUser = await TempUser.findById(TARGET_OPENID);
    if (tempUser) {
      console.log('📊 重置前配额信息:');
      console.log(`  - 类型: 临时用户`);
      console.log(`  - 已使用: ${tempUser.discoverQuota.count}/${tempUser.discoverQuota.dailyLimit}`);
      console.log(`  - 最后使用日期: ${tempUser.discoverQuota.lastDate || '无'}`);
      
      // 重置配额
      tempUser.discoverQuota.count = 0;
      tempUser.discoverQuota.lastDate = '';
      await tempUser.save();
      
      console.log('\n✅ 临时用户配额已重置');
      console.log(`  - 剩余次数: ${tempUser.discoverQuota.dailyLimit}/${tempUser.discoverQuota.dailyLimit}`);
      return;
    }
    
    // 用户不存在
    console.log('⚠️  用户不存在');
    console.log('提示: 用户可能还未使用过发现功能');
    
  } catch (error) {
    console.error('❌ 重置配额失败:', error);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    await connectDB();
    await resetQuota();
    console.log('\n✅ 操作完成！\n');
  } catch (error) {
    console.error('\n❌ 脚本执行失败:', error);
  } finally {
    await mongoose.connection.close();
    console.log('📀 数据库连接已关闭\n');
  }
}

// 执行脚本
main();

