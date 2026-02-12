/**
 * 数据迁移脚本：将 appliers 从字符串数组迁移到对象数组
 * 
 * 旧格式：appliers: ['openid1', 'openid2']
 * 新格式：appliers: [{ userId: 'openid1', appliedAt: Date }, { userId: 'openid2', appliedAt: Date }]
 * 
 * 使用方法：
 * node scripts/migrations/migrateAppliers.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Circle = require('../../models/Circle');

async function migrateAppliers() {
  try {
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ 数据库连接成功\n');

    // 查找所有有申请者的朋友圈
    const circles = await Circle.find({ appliers: { $exists: true, $ne: [] } }).lean();
    
    console.log(`📊 找到 ${circles.length} 个有申请者的朋友圈\n`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const circle of circles) {
      console.log(`\n检查朋友圈: ${circle.name}`);
      
      const firstApplier = circle.appliers[0];
      
      // 检查是否已经是正确的新格式（有 userId 字段且是字符串）
      if (firstApplier.userId && typeof firstApplier.userId === 'string') {
        console.log(`⏭️  跳过 ${circle.name} (已是正确格式)`);
        skippedCount++;
        continue;
      }

      // 检查是否是损坏的格式（有数字键 0-27）
      const keys = Object.keys(firstApplier);
      const hasNumericKeys = keys.some(k => !isNaN(k));
      
      if (hasNumericKeys) {
        console.log(`🔧 修复 ${circle.name} (损坏的格式)...`);
        
        // 重建为正确格式
        const newAppliers = circle.appliers.map(applier => {
          // 从数字键对象中提取字符串
          const numKeys = Object.keys(applier).filter(k => !isNaN(k)).sort((a, b) => Number(a) - Number(b));
          const userIdStr = numKeys.map(k => applier[k]).join('');
          return {
            userId: userIdStr,
            appliedAt: new Date() // 使用当前时间
          };
        });

        await Circle.updateOne(
          { _id: circle._id },
          { $set: { appliers: newAppliers } }
        );

        console.log(`   ✅ 已修复 ${newAppliers.length} 个申请者`);
        migratedCount++;
        continue;
      }

      // 检查是否是旧格式（字符串）
      if (typeof firstApplier === 'string') {
        console.log(`🔄 迁移 ${circle.name}...`);
        
        const newAppliers = circle.appliers.map(openid => ({
          userId: openid,
          appliedAt: new Date()
        }));

        await Circle.updateOne(
          { _id: circle._id },
          { $set: { appliers: newAppliers } }
        );

        console.log(`   ✅ 已迁移 ${newAppliers.length} 个申请者`);
        migratedCount++;
      }
    }

    console.log('\n📈 迁移统计:');
    console.log(`   - 已迁移: ${migratedCount} 个朋友圈`);
    console.log(`   - 已跳过: ${skippedCount} 个朋友圈`);
    console.log('\n✅ 迁移完成！\n');

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('📀 数据库连接已关闭');
  }
}

// 执行迁移
migrateAppliers();

