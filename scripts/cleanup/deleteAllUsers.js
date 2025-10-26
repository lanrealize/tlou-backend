const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function deleteAllUsers() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('MongoDB连接成功');
    
    // 删除所有用户前先显示当前用户数量
    const userCount = await User.countDocuments();
    console.log(`当前数据库中有 ${userCount} 个用户`);
    
    if (userCount === 0) {
      console.log('数据库中没有用户，无需删除');
      return;
    }
    
    // 确认删除（在生产环境中建议添加更多确认步骤）
    console.log('准备删除所有用户...');
    
    // 删除所有用户
    const result = await User.deleteMany({});
    
    console.log(`✅ 成功删除了 ${result.deletedCount} 个用户`);
    
    // 验证删除结果
    const remainingUsers = await User.countDocuments();
    console.log(`数据库中剩余用户数量: ${remainingUsers}`);
    
  } catch (error) {
    console.error('❌ 删除用户时发生错误:', error.message);
  } finally {
    // 关闭数据库连接
    await mongoose.connection.close();
    console.log('数据库连接已关闭');
    process.exit(0);
  }
}

// 添加确认提示
console.log('⚠️  警告: 这将删除数据库中的所有用户！');
console.log('如果确定要继续，请在5秒内按 Ctrl+C 取消...');

setTimeout(() => {
  deleteAllUsers();
}, 5000);