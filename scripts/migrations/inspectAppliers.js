/**
 * 查看 appliers 数据的实际内容
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function inspectAppliers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ 数据库连接成功\n');

    const db = mongoose.connection.db;
    const circlesCollection = db.collection('circles');

    const circles = await circlesCollection.find({ 
      appliers: { $exists: true, $ne: [] } 
    }).toArray();

    console.log(`📊 找到 ${circles.length} 个有申请者的朋友圈\n`);

    for (const circle of circles) {
      console.log(`\n朋友圈: ${circle.name}`);
      console.log(`appliers 数量: ${circle.appliers.length}`);
      console.log(`appliers 原始数据:`);
      console.log(JSON.stringify(circle.appliers, null, 2));
    }

  } catch (error) {
    console.error('❌ 查询失败:', error);
  } finally {
    await mongoose.connection.close();
  }
}

inspectAppliers();









