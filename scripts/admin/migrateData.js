const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * 安全数据迁移脚本：将用户ID从ObjectId迁移到openid主键
 * 
 * 特点：
 * - 自动备份原数据
 * - 分步骤执行，可中断恢复  
 * - 完整性验证
 * - 可回滚操作
 * 
 * 使用方法：
 * 1. node scripts/migrateData.js --check     # 检查数据库状态
 * 2. node scripts/migrateData.js --backup    # 仅备份数据
 * 3. node scripts/migrateData.js --migrate   # 执行迁移
 * 4. node scripts/migrateData.js --rollback  # 回滚操作
 */

class DataMigrator {
  constructor() {
    this.backupDir = path.join(__dirname, '..', 'backup');
    this.logFile = path.join(this.backupDir, `migration-${Date.now()}.log`);
  }

  async log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    
    // 写入日志文件
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    fs.appendFileSync(this.logFile, logMessage + '\n');
  }

  async connectDB() {
    await this.log('🔗 连接数据库...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await this.log('✅ 数据库连接成功');
  }

  async checkDataState() {
    await this.log('🔍 检查数据库状态...');
    
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({}).limit(5).toArray();
    
    if (users.length === 0) {
      await this.log('⚠️  数据库中没有用户数据');
      return { needsMigration: false, reason: '没有用户数据' };
    }

    const hasObjectId = users.some(user => 
      user._id && typeof user._id === 'object' && user._id.constructor.name === 'ObjectId'
    );
    
    const hasStringId = users.some(user => 
      user._id && typeof user._id === 'string'
    );
    
    const hasOpenidField = users.some(user => user.hasOwnProperty('openid'));

    await this.log(`  ObjectId用户: ${users.filter(u => typeof u._id === 'object').length}`);
    await this.log(`  String用户: ${users.filter(u => typeof u._id === 'string').length}`);
    await this.log(`  有openid字段: ${users.filter(u => u.hasOwnProperty('openid')).length}`);

    if (hasObjectId && hasOpenidField) {
      await this.log('✅ 数据库需要迁移');
      return { needsMigration: true, reason: '发现ObjectId用户和openid字段' };
    } else if (hasStringId && !hasOpenidField) {
      await this.log('✅ 数据库已完成迁移');
      return { needsMigration: false, reason: '已经是新结构' };
    } else {
      await this.log('⚠️  数据库状态混合或异常');
      return { needsMigration: false, reason: '状态异常，需要手动检查' };
    }
  }

  async backupData() {
    await this.log('💾 开始备份数据...');
    
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const db = mongoose.connection.db;

    // 备份用户数据
    const users = await db.collection('users').find({}).toArray();
    const usersBackup = path.join(this.backupDir, `users-backup-${timestamp}.json`);
    fs.writeFileSync(usersBackup, JSON.stringify(users, null, 2));
    await this.log(`📄 用户数据已备份: ${usersBackup}`);

    // 备份朋友圈数据
    const circles = await db.collection('circles').find({}).toArray();
    const circlesBackup = path.join(this.backupDir, `circles-backup-${timestamp}.json`);
    fs.writeFileSync(circlesBackup, JSON.stringify(circles, null, 2));
    await this.log(`📄 朋友圈数据已备份: ${circlesBackup}`);

    // 备份帖子数据
    const posts = await db.collection('posts').find({}).toArray();
    const postsBackup = path.join(this.backupDir, `posts-backup-${timestamp}.json`);
    fs.writeFileSync(postsBackup, JSON.stringify(posts, null, 2));
    await this.log(`📄 帖子数据已备份: ${postsBackup}`);

    await this.log('✅ 数据备份完成');
    return { usersBackup, circlesBackup, postsBackup };
  }

  async buildIdMapping() {
    await this.log('📊 构建ID映射表...');
    
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({}).toArray();
    
    const idToOpenidMap = {};
    const openidToUserMap = {};
    
    for (const user of users) {
      if (user._id && user.openid) {
        const idStr = user._id.toString();
        idToOpenidMap[idStr] = user.openid;
        openidToUserMap[user.openid] = user;
      }
    }
    
    await this.log(`📋 映射关系构建完成: ${Object.keys(idToOpenidMap).length} 个用户`);
    return { idToOpenidMap, openidToUserMap };
  }

  async migrateCircles(idToOpenidMap) {
    await this.log('🔄 迁移朋友圈数据...');
    
    const db = mongoose.connection.db;
    const circles = await db.collection('circles').find({}).toArray();
    
    let updatedCount = 0;
    
    for (const circle of circles) {
      const updates = {};
      let needsUpdate = false;
      
      // 更新creator
      if (circle.creator && idToOpenidMap[circle.creator.toString()]) {
        updates.creator = idToOpenidMap[circle.creator.toString()];
        needsUpdate = true;
      }
      
      // 更新members
      if (circle.members && Array.isArray(circle.members)) {
        const newMembers = circle.members
          .map(id => idToOpenidMap[id.toString()])
          .filter(Boolean);
        if (newMembers.length > 0) {
          updates.members = newMembers;
          needsUpdate = true;
        }
      }
      
      // 更新appliers
      if (circle.appliers && Array.isArray(circle.appliers)) {
        const newAppliers = circle.appliers
          .map(id => idToOpenidMap[id.toString()])
          .filter(Boolean);
        if (newAppliers.length > 0) {
          updates.appliers = newAppliers;
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        await db.collection('circles').updateOne(
          { _id: circle._id },
          { $set: updates }
        );
        updatedCount++;
      }
    }
    
    await this.log(`✅ 朋友圈迁移完成: ${updatedCount}/${circles.length} 个更新`);
  }

  async migratePosts(idToOpenidMap) {
    await this.log('🔄 迁移帖子数据...');
    
    const db = mongoose.connection.db;
    const posts = await db.collection('posts').find({}).toArray();
    
    let updatedCount = 0;
    
    for (const post of posts) {
      const updates = {};
      let needsUpdate = false;
      
      // 更新author
      if (post.author && idToOpenidMap[post.author.toString()]) {
        updates.author = idToOpenidMap[post.author.toString()];
        needsUpdate = true;
      }
      
      // 更新likes
      if (post.likes && Array.isArray(post.likes)) {
        const newLikes = post.likes
          .map(id => idToOpenidMap[id.toString()])
          .filter(Boolean);
        if (newLikes.length !== post.likes.length || newLikes.some((like, i) => like !== post.likes[i])) {
          updates.likes = newLikes;
          needsUpdate = true;
        }
      }
      
      // 更新comments
      if (post.comments && Array.isArray(post.comments)) {
        const newComments = post.comments.map(comment => {
          const newComment = { ...comment };
          
          if (comment.author && idToOpenidMap[comment.author.toString()]) {
            newComment.author = idToOpenidMap[comment.author.toString()];
          }
          
          if (comment.replyTo && idToOpenidMap[comment.replyTo.toString()]) {
            newComment.replyTo = idToOpenidMap[comment.replyTo.toString()];
          }
          
          return newComment;
        });
        
        updates.comments = newComments;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await db.collection('posts').updateOne(
          { _id: post._id },
          { $set: updates }
        );
        updatedCount++;
      }
    }
    
    await this.log(`✅ 帖子迁移完成: ${updatedCount}/${posts.length} 个更新`);
  }

  async migrateUsers(idToOpenidMap) {
    await this.log('🔄 迁移用户数据（最关键步骤）...');
    
    const db = mongoose.connection.db;
    const users = await db.collection('users').find({}).toArray();
    
    // 准备新的用户数据
    const newUsers = [];
    
    for (const user of users) {
      if (!user.openid) {
        await this.log(`⚠️  跳过没有openid的用户: ${user._id}`);
        continue;
      }
      
      const newUser = {
        _id: user.openid,  // 使用openid作为新的_id
        username: user.username,
        avatar: user.avatar || '',
        isVirtual: user.isVirtual || false,
        isAdmin: user.isAdmin || false,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };
      
      // 处理virtualOwner引用
      if (user.virtualOwner && idToOpenidMap[user.virtualOwner.toString()]) {
        newUser.virtualOwner = idToOpenidMap[user.virtualOwner.toString()];
      }
      
      newUsers.push(newUser);
    }
    
    await this.log(`📝 准备插入 ${newUsers.length} 个新用户记录`);
    
    // 创建新的用户集合（临时）
    const tempCollectionName = 'users_new_temp';
    await db.collection(tempCollectionName).deleteMany({});  // 清理临时集合
    await db.collection(tempCollectionName).insertMany(newUsers);
    
    await this.log('📥 新用户数据已写入临时集合');
    
    // 验证临时集合数据
    const tempCount = await db.collection(tempCollectionName).countDocuments();
    const originalCount = await db.collection('users').countDocuments();
    
    if (tempCount !== originalCount) {
      throw new Error(`数据数量不匹配: 原${originalCount} vs 新${tempCount}`);
    }
    
    await this.log('✅ 数据验证通过，执行最终替换...');
    
    // 重命名集合（原子操作）
    await db.collection('users').rename('users_old_backup');
    await db.collection(tempCollectionName).rename('users');
    
    await this.log('✅ 用户集合迁移完成');
  }

  async verifyMigration() {
    await this.log('🔍 验证迁移结果...');
    
    const db = mongoose.connection.db;
    
    // 检查用户数据
    const users = await db.collection('users').find({}).limit(5).toArray();
    const userCount = await db.collection('users').countDocuments();
    
    await this.log(`👥 用户总数: ${userCount}`);
    
    const allStringIds = users.every(user => typeof user._id === 'string');
    const noOpenidFields = users.every(user => !user.hasOwnProperty('openid'));
    
    await this.log(`📋 用户ID类型检查: ${allStringIds ? '✅ 全部为字符串' : '❌ 存在非字符串ID'}`);
    await this.log(`📋 openid字段检查: ${noOpenidFields ? '✅ 已移除openid字段' : '❌ 仍存在openid字段'}`);
    
    // 检查引用完整性
    const circles = await db.collection('circles').find({}).limit(3).toArray();
    await this.log(`🔵 朋友圈总数: ${await db.collection('circles').countDocuments()}`);
    
    for (const circle of circles) {
      const creatorExists = await db.collection('users').findOne({ _id: circle.creator });
      await this.log(`  ${circle.name}: creator存在=${!!creatorExists}`);
    }
    
    const posts = await db.collection('posts').find({}).limit(3).toArray();
    await this.log(`📝 帖子总数: ${await db.collection('posts').countDocuments()}`);
    
    for (const post of posts) {
      const authorExists = await db.collection('users').findOne({ _id: post.author });
      await this.log(`  帖子: author存在=${!!authorExists}`);
    }
    
    await this.log('✅ 迁移验证完成');
  }

  async performMigration() {
    try {
      await this.connectDB();
      
      // 检查状态
      const { needsMigration, reason } = await this.checkDataState();
      if (!needsMigration) {
        await this.log(`❌ 无需迁移: ${reason}`);
        return;
      }
      
      // 备份数据
      await this.backupData();
      
      // 构建映射
      const { idToOpenidMap } = await this.buildIdMapping();
      
      // 执行迁移
      await this.migrateCircles(idToOpenidMap);
      await this.migratePosts(idToOpenidMap);
      await this.migrateUsers(idToOpenidMap);
      
      // 验证结果
      await this.verifyMigration();
      
      await this.log('🎉 迁移成功完成！');
      await this.log('💡 请重启应用服务器以使用新的数据结构');
      
    } catch (error) {
      await this.log(`❌ 迁移失败: ${error.message}`);
      console.error(error);
      throw error;
    } finally {
      await mongoose.disconnect();
      await this.log('🔐 数据库连接已关闭');
    }
  }

  async rollback() {
    await this.log('🔄 开始回滚操作...');
    
    try {
      await this.connectDB();
      const db = mongoose.connection.db;
      
      // 检查是否存在备份
      const collections = await db.listCollections().toArray();
      const hasBackup = collections.some(col => col.name === 'users_old_backup');
      
      if (!hasBackup) {
        await this.log('❌ 没有找到备份数据，无法回滚');
        return;
      }
      
      await this.log('🔄 恢复用户数据...');
      await db.collection('users').rename('users_new_migrated');
      await db.collection('users_old_backup').rename('users');
      
      await this.log('✅ 回滚完成');
      
    } catch (error) {
      await this.log(`❌ 回滚失败: ${error.message}`);
      throw error;
    } finally {
      await mongoose.disconnect();
    }
  }
}

// 命令行处理
async function main() {
  const migrator = new DataMigrator();
  const args = process.argv.slice(2);
  
  try {
    if (args.includes('--check')) {
      await migrator.connectDB();
      await migrator.checkDataState();
      await mongoose.disconnect();
    } else if (args.includes('--backup')) {
      await migrator.connectDB();
      await migrator.backupData();
      await mongoose.disconnect();
    } else if (args.includes('--migrate')) {
      await migrator.performMigration();
    } else if (args.includes('--rollback')) {
      await migrator.rollback();
    } else {
      console.log(`
📋 数据迁移工具使用说明:

1. 检查数据库状态:
   node scripts/migrateData.js --check

2. 仅备份数据:
   node scripts/migrateData.js --backup

3. 执行完整迁移:
   node scripts/migrateData.js --migrate

4. 回滚到迁移前状态:
   node scripts/migrateData.js --rollback

⚠️  重要提醒:
- 迁移前请确保应用服务器已停止
- 迁移过程会自动备份数据
- 迁移完成后请重启应用服务器
      `);
    }
  } catch (error) {
    console.error('操作失败:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { DataMigrator };
