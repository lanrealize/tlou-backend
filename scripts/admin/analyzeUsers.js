/**
 * 分析用户活跃情况
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../../models/User');
const TempUser = require('../../models/TempUser');
const Circle = require('../../models/Circle');

async function analyzeUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ 数据库连接成功\n');

    // 获取所有用户
    const users = await User.find({});
    const tempUsers = await TempUser.find({});
    
    console.log('=' .repeat(60));
    console.log('📊 用户总览');
    console.log('=' .repeat(60));
    console.log(`真实用户总数: ${users.length}`);
    console.log(`临时用户总数: ${tempUsers.length}`);
    console.log(`总用户数: ${users.length + tempUsers.length}\n`);

    // 分析真实用户
    console.log('=' .repeat(60));
    console.log('👥 真实用户详细分析');
    console.log('=' .repeat(60) + '\n');

    let activeUsers = 0;
    let testUsers = 0;
    let virtualUsers = 0;
    let realWechatUsers = 0;
    let usersWithCircles = 0;
    let usersWithApplications = 0;
    let usersUsedDiscover = 0;

    for (const user of users) {
      const isTest = user._id.startsWith('test_');
      const isVirtual = user._id.startsWith('virtual_');
      const isRealWechat = user._id.startsWith('o4Y5Cv');
      
      if (isTest) testUsers++;
      if (isVirtual) virtualUsers++;
      if (isRealWechat) realWechatUsers++;

      // 查询该用户发布的朋友圈
      const circleCount = await Circle.countDocuments({ userId: user._id });
      if (circleCount > 0) usersWithCircles++;

      // 查询该用户申请过的朋友圈
      const appliedCircles = await Circle.countDocuments({ 
        'appliers.userId': user._id 
      });
      if (appliedCircles > 0) usersWithApplications++;

      // 检查是否使用过发现功能
      if (user.discoverQuota.lastDate) usersUsedDiscover++;

      // 判断是否活跃用户（发布过朋友圈或申请过朋友圈）
      const isActive = circleCount > 0 || appliedCircles > 0;
      if (isActive) activeUsers++;

      // 显示活跃用户详情
      if (isActive) {
        console.log(`用户: ${user.username} (${user._id})`);
        console.log(`  类型: ${isTest ? '测试用户' : isVirtual ? '虚拟用户' : '真实微信用户'}`);
        console.log(`  管理员: ${user.isAdmin ? '是' : '否'}`);
        console.log(`  发布朋友圈: ${circleCount} 条`);
        console.log(`  申请朋友圈: ${appliedCircles} 次`);
        console.log(`  使用发现功能: ${user.discoverQuota.lastDate ? `是 (最后使用: ${user.discoverQuota.lastDate})` : '否'}`);
        console.log(`  注册时间: ${user.createdAt ? user.createdAt.toISOString().split('T')[0] : '未知'}`);
        console.log('');
      }
    }

    // 统计非活跃用户
    console.log('=' .repeat(60));
    console.log('😴 非活跃用户（未发布也未申请朋友圈）');
    console.log('=' .repeat(60) + '\n');

    for (const user of users) {
      const circleCount = await Circle.countDocuments({ userId: user._id });
      const appliedCircles = await Circle.countDocuments({ 
        'appliers.userId': user._id 
      });
      
      if (circleCount === 0 && appliedCircles === 0) {
        const isTest = user._id.startsWith('test_');
        const isVirtual = user._id.startsWith('virtual_');
        
        console.log(`用户: ${user.username} (${user._id})`);
        console.log(`  类型: ${isTest ? '测试用户' : isVirtual ? '虚拟用户' : '真实微信用户'}`);
        console.log(`  注册时间: ${user.createdAt ? user.createdAt.toISOString().split('T')[0] : '未知'}`);
        console.log('');
      }
    }

    // 统计朋友圈数据
    console.log('=' .repeat(60));
    console.log('📝 朋友圈数据统计');
    console.log('=' .repeat(60) + '\n');

    const totalCircles = await Circle.countDocuments({});
    const circlesWithAppliers = await Circle.countDocuments({ 
      'appliers.0': { $exists: true } 
    });
    
    console.log(`朋友圈总数: ${totalCircles}`);
    console.log(`有人申请的朋友圈: ${circlesWithAppliers}`);
    console.log(`无人申请的朋友圈: ${totalCircles - circlesWithAppliers}\n`);

    // 按用户统计朋友圈
    const circlesByUser = await Circle.aggregate([
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('各用户发布的朋友圈数量:');
    for (const item of circlesByUser) {
      const user = await User.findById(item._id);
      if (user) {
        console.log(`  ${user.username}: ${item.count} 条`);
      }
    }

    // 总结
    console.log('\n' + '=' .repeat(60));
    console.log('📈 活跃度总结');
    console.log('=' .repeat(60) + '\n');

    console.log(`真实微信用户: ${realWechatUsers} 人`);
    console.log(`虚拟用户（管理员创建）: ${virtualUsers} 人`);
    console.log(`测试用户: ${testUsers} 人`);
    console.log('');
    console.log(`活跃用户（发布或申请过朋友圈）: ${activeUsers} 人 (${(activeUsers/users.length*100).toFixed(1)}%)`);
    console.log(`  - 发布过朋友圈: ${usersWithCircles} 人`);
    console.log(`  - 申请过朋友圈: ${usersWithApplications} 人`);
    console.log(`  - 使用过发现功能: ${usersUsedDiscover} 人`);
    console.log('');
    console.log(`非活跃用户: ${users.length - activeUsers} 人 (${((users.length - activeUsers)/users.length*100).toFixed(1)}%)`);

    // 真实用户活跃度
    const realActiveUsers = users.filter(u => {
      const isRealWechat = u._id.startsWith('o4Y5Cv');
      return isRealWechat;
    });

    let realActiveCount = 0;
    for (const user of realActiveUsers) {
      const circleCount = await Circle.countDocuments({ userId: user._id });
      const appliedCircles = await Circle.countDocuments({ 
        'appliers.userId': user._id 
      });
      if (circleCount > 0 || appliedCircles > 0) realActiveCount++;
    }

    console.log('\n🎯 真实微信用户活跃度:');
    console.log(`  总数: ${realActiveUsers.length} 人`);
    console.log(`  活跃: ${realActiveCount} 人 (${realActiveUsers.length > 0 ? (realActiveCount/realActiveUsers.length*100).toFixed(1) : 0}%)`);
    console.log(`  非活跃: ${realActiveUsers.length - realActiveCount} 人`);

    console.log('\n✅ 分析完成！\n');

  } catch (error) {
    console.error('❌ 分析失败:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📀 数据库连接已关闭');
  }
}

analyzeUsers();




