/**
 * 查看真实微信用户注册时间
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../../models/User');

async function checkRealUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ 数据库连接成功\n');

    // 查询所有真实微信用户（openid 以 o4Y5Cv 开头）
    const realUsers = await User.find({
      _id: { $regex: /^o4Y5Cv/ }
    }).sort({ createdAt: 1 });

    console.log('=' .repeat(70));
    console.log('👥 真实微信用户注册时间详情');
    console.log('=' .repeat(70) + '\n');

    console.log(`总数: ${realUsers.length} 人\n`);

    realUsers.forEach((user, index) => {
      const createdAt = user.createdAt;
      const dateStr = createdAt.toISOString();
      const localDate = new Date(createdAt.getTime() + 8 * 60 * 60 * 1000);
      const localDateStr = localDate.toISOString().replace('T', ' ').substring(0, 19);
      
      // 计算距今天数
      const now = new Date();
      const diffTime = now - createdAt;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      console.log(`${index + 1}. ${user.username}`);
      console.log(`   ID: ${user._id}`);
      console.log(`   注册时间: ${localDateStr} (北京时间)`);
      console.log(`   距今: ${diffDays} 天`);
      console.log(`   管理员: ${user.isAdmin ? '是' : '否'}`);
      console.log('');
    });

    // 按月份统计
    console.log('=' .repeat(70));
    console.log('📅 按月份统计');
    console.log('=' .repeat(70) + '\n');

    const monthlyStats = {};
    realUsers.forEach(user => {
      const month = user.createdAt.toISOString().substring(0, 7); // YYYY-MM
      if (!monthlyStats[month]) {
        monthlyStats[month] = 0;
      }
      monthlyStats[month]++;
    });

    Object.keys(monthlyStats).sort().forEach(month => {
      console.log(`${month}: ${monthlyStats[month]} 人`);
    });

    // 最近注册
    console.log('\n' + '=' .repeat(70));
    console.log('🆕 最近注册的 5 个用户');
    console.log('=' .repeat(70) + '\n');

    const recentUsers = [...realUsers].reverse().slice(0, 5);
    recentUsers.forEach((user, index) => {
      const localDate = new Date(user.createdAt.getTime() + 8 * 60 * 60 * 1000);
      const localDateStr = localDate.toISOString().replace('T', ' ').substring(0, 19);
      const now = new Date();
      const diffDays = Math.floor((now - user.createdAt) / (1000 * 60 * 60 * 24));
      
      console.log(`${index + 1}. ${user.username} - ${localDateStr} (${diffDays} 天前)`);
    });

    console.log('\n✅ 查询完成！\n');

  } catch (error) {
    console.error('❌ 查询失败:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📀 数据库连接已关闭');
  }
}

checkRealUsers();








