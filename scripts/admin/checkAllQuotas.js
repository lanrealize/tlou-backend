/**
 * 查看所有用户的配额情况
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../../models/User');
const TempUser = require('../../models/TempUser');

async function checkAllQuotas() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ 数据库连接成功\n');

    // 获取中国时区的今天日期
    const now = new Date();
    const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const today = chinaTime.toISOString().split('T')[0];

    console.log(`📅 当前日期（中国时区）: ${today}\n`);

    // 查询所有真实用户
    const users = await User.find({});
    console.log(`👥 真实用户总数: ${users.length}\n`);

    if (users.length > 0) {
      console.log('=== 真实用户配额情况 ===\n');
      users.forEach(user => {
        const isToday = user.discoverQuota.lastDate === today;
        const currentLimit = user.discoverQuota.hasPurchase 
          ? user.discoverQuota.dailyLimit + 5 
          : user.discoverQuota.dailyLimit;
        const remaining = isToday ? currentLimit - user.discoverQuota.count : currentLimit;

        console.log(`用户: ${user.username} (${user._id})`);
        console.log(`  - 今日已用: ${isToday ? user.discoverQuota.count : 0}/${currentLimit}`);
        console.log(`  - 剩余次数: ${remaining}`);
        console.log(`  - 最后使用: ${user.discoverQuota.lastDate || '从未使用'}`);
        console.log(`  - 购物用户: ${user.discoverQuota.hasPurchase ? '是' : '否'}`);
        console.log(`  - 是否管理员: ${user.isAdmin ? '是' : '否'}`);
        console.log('');
      });
    }

    // 查询所有临时用户
    const tempUsers = await TempUser.find({});
    console.log(`\n👤 临时用户总数: ${tempUsers.length}\n`);

    if (tempUsers.length > 0) {
      console.log('=== 临时用户配额情况 ===\n');
      tempUsers.forEach(tempUser => {
        const isToday = tempUser.discoverQuota.lastDate === today;
        const currentLimit = tempUser.discoverQuota.dailyLimit;
        const remaining = isToday ? currentLimit - tempUser.discoverQuota.count : currentLimit;

        console.log(`临时用户: ${tempUser._id}`);
        console.log(`  - 今日已用: ${isToday ? tempUser.discoverQuota.count : 0}/${currentLimit}`);
        console.log(`  - 剩余次数: ${remaining}`);
        console.log(`  - 最后使用: ${tempUser.discoverQuota.lastDate || '从未使用'}`);
        console.log('');
      });
    }

    console.log('\n✅ 查询完成！\n');

  } catch (error) {
    console.error('❌ 查询失败:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📀 数据库连接已关闭');
  }
}

checkAllQuotas();










