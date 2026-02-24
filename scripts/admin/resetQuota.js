const path = require('path');
// 从项目根目录加载 .env 文件
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../../models/User');
const TempUser = require('../../models/TempUser');

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

// 重置所有用户的配额
async function resetAllQuotas() {
  console.log(`\n🔄 开始重置所有用户的配额\n`);

  try {
    // 重置所有真实用户
    const users = await User.find({});
    console.log(`📊 找到 ${users.length} 个真实用户\n`);

    let userResetCount = 0;
    for (const user of users) {
      const hadQuota = user.discoverQuota.count > 0;
      
      if (hadQuota) {
        console.log(`重置用户: ${user.username} (${user._id})`);
        console.log(`  - 重置前: ${user.discoverQuota.count}/${user.discoverQuota.dailyLimit}`);
      }
      
      // 重置配额
      user.discoverQuota.count = 0;
      user.discoverQuota.lastDate = '';
      await user.save();
      
      if (hadQuota) {
        console.log(`  - 重置后: 0/${user.discoverQuota.dailyLimit}\n`);
        userResetCount++;
      }
    }
    
    console.log(`✅ 真实用户配额重置完成: ${userResetCount}/${users.length} 个用户有配额被重置\n`);
    
    // 重置所有临时用户
    const tempUsers = await TempUser.find({});
    console.log(`📊 找到 ${tempUsers.length} 个临时用户\n`);
    
    let tempUserResetCount = 0;
    for (const tempUser of tempUsers) {
      const hadQuota = tempUser.discoverQuota.count > 0;
      
      if (hadQuota) {
        console.log(`重置临时用户: ${tempUser._id}`);
        console.log(`  - 重置前: ${tempUser.discoverQuota.count}/${tempUser.discoverQuota.dailyLimit}`);
      }
      
      // 重置配额
      tempUser.discoverQuota.count = 0;
      tempUser.discoverQuota.lastDate = '';
      await tempUser.save();
      
      if (hadQuota) {
        console.log(`  - 重置后: 0/${tempUser.discoverQuota.dailyLimit}\n`);
        tempUserResetCount++;
      }
    }
    
    console.log(`✅ 临时用户配额重置完成: ${tempUserResetCount}/${tempUsers.length} 个临时用户有配额被重置\n`);
    
    console.log('📈 总计:');
    console.log(`  - 真实用户: ${userResetCount} 个被重置`);
    console.log(`  - 临时用户: ${tempUserResetCount} 个被重置`);
    console.log(`  - 总计: ${userResetCount + tempUserResetCount} 个用户配额已重置`);
    
  } catch (error) {
    console.error('❌ 重置配额失败:', error);
    throw error;
  }
}

// 主函数
async function main() {
  try {
    await connectDB();
    await resetAllQuotas();
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

