/**
 * 修复损坏的 appliers 数据
 * 
 * 问题：某些 Circle 的 appliers 字段存储了错误的对象格式
 * 解决：清空这些损坏的 appliers 数据
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function fixBrokenAppliers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ 数据库连接成功\n');

    // 直接使用原生 MongoDB 操作
    const db = mongoose.connection.db;
    const circlesCollection = db.collection('circles');

    // 查找所有有 appliers 的文档
    const circles = await circlesCollection.find({ 
      appliers: { $exists: true, $ne: [] } 
    }).toArray();

    console.log(`📊 找到 ${circles.length} 个有申请者的朋友圈\n`);

    let fixedCount = 0;

    for (const circle of circles) {
      let needsFix = false;
      const fixedAppliers = [];

      for (const applier of circle.appliers) {
        // 检查是否是正确格式：{ userId: string, appliedAt: Date }
        if (applier.userId && typeof applier.userId === 'string' && applier.appliedAt) {
          // 正确格式，保留
          fixedAppliers.push(applier);
        } else {
          // 损坏的格式，标记需要修复
          needsFix = true;
          console.log(`🔧 发现损坏数据在朋友圈: ${circle.name}`);
          console.log(`   损坏的 applier:`, JSON.stringify(applier).substring(0, 100));
        }
      }

      if (needsFix) {
        // 更新为修复后的数据
        await circlesCollection.updateOne(
          { _id: circle._id },
          { $set: { appliers: fixedAppliers } }
        );
        console.log(`   ✅ 已修复，保留 ${fixedAppliers.length} 个有效申请者\n`);
        fixedCount++;
      }
    }

    console.log('\n📈 修复统计:');
    console.log(`   - 已修复: ${fixedCount} 个朋友圈`);
    console.log(`   - 正常: ${circles.length - fixedCount} 个朋友圈`);
    console.log('\n✅ 修复完成！\n');

  } catch (error) {
    console.error('❌ 修复失败:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📀 数据库连接已关闭');
  }
}

fixBrokenAppliers();





