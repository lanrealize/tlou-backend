const mongoose = require('mongoose');
require('dotenv').config();

/**
 * 数据库状态检查脚本
 * 用于分析当前数据结构，为迁移做准备
 */

async function checkDatabaseState() {
  try {
    console.log('🔍 检查数据库当前状态...');
    
    // 连接数据库
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ 数据库连接成功');

    const db = mongoose.connection.db;
    
    // 检查集合列表
    console.log('\n📋 数据库集合列表:');
    const collections = await db.listCollections().toArray();
    collections.forEach(col => {
      console.log(`  - ${col.name}`);
    });

    // 检查用户集合结构
    if (collections.find(col => col.name === 'users')) {
      console.log('\n👤 Users集合分析:');
      const usersSample = await db.collection('users').find({}).limit(3).toArray();
      const usersCount = await db.collection('users').countDocuments();
      
      console.log(`  总用户数: ${usersCount}`);
      console.log(`  样本数据结构:`);
      
      if (usersSample.length > 0) {
        const firstUser = usersSample[0];
        console.log(`    _id类型: ${typeof firstUser._id} (${firstUser._id?.constructor?.name || 'unknown'})`);
        console.log(`    字段列表: ${Object.keys(firstUser).join(', ')}`);
        
        // 检查是否有openid字段
        const hasOpenidField = usersSample.some(user => user.hasOwnProperty('openid'));
        const hasStringId = usersSample.some(user => typeof user._id === 'string');
        
        console.log(`    是否有openid字段: ${hasOpenidField}`);
        console.log(`    是否有字符串_id: ${hasStringId}`);
        
        // 显示样本数据
        usersSample.forEach((user, index) => {
          console.log(`    样本${index + 1}: _id=${user._id}, username=${user.username}, openid=${user.openid || '无'}`);
        });
      }
    }

    // 检查朋友圈集合
    if (collections.find(col => col.name === 'circles')) {
      console.log('\n🔵 Circles集合分析:');
      const circlesSample = await db.collection('circles').find({}).limit(2).toArray();
      const circlesCount = await db.collection('circles').countDocuments();
      
      console.log(`  总朋友圈数: ${circlesCount}`);
      
      if (circlesSample.length > 0) {
        const firstCircle = circlesSample[0];
        console.log(`    creator类型: ${typeof firstCircle.creator} (${firstCircle.creator?.constructor?.name || 'unknown'})`);
        console.log(`    members类型: ${Array.isArray(firstCircle.members) ? `Array[${firstCircle.members?.length}]` : typeof firstCircle.members}`);
        
        // 检查引用类型
        if (firstCircle.members && firstCircle.members.length > 0) {
          console.log(`    members[0]类型: ${typeof firstCircle.members[0]} (${firstCircle.members[0]?.constructor?.name || 'unknown'})`);
        }
        
        circlesSample.forEach((circle, index) => {
          console.log(`    样本${index + 1}: name=${circle.name}, creator=${circle.creator}, members=${circle.members?.length || 0}`);
        });
      }
    }

    // 检查帖子集合
    if (collections.find(col => col.name === 'posts')) {
      console.log('\n📝 Posts集合分析:');
      const postsSample = await db.collection('posts').find({}).limit(2).toArray();
      const postsCount = await db.collection('posts').countDocuments();
      
      console.log(`  总帖子数: ${postsCount}`);
      
      if (postsSample.length > 0) {
        const firstPost = postsSample[0];
        console.log(`    author类型: ${typeof firstPost.author} (${firstPost.author?.constructor?.name || 'unknown'})`);
        console.log(`    likes类型: ${Array.isArray(firstPost.likes) ? `Array[${firstPost.likes?.length}]` : typeof firstPost.likes}`);
        
        if (firstPost.comments && firstPost.comments.length > 0) {
          const firstComment = firstPost.comments[0];
          console.log(`    comment.author类型: ${typeof firstComment.author} (${firstComment.author?.constructor?.name || 'unknown'})`);
        }
        
        postsSample.forEach((post, index) => {
          console.log(`    样本${index + 1}: content=${post.content?.substring(0, 50)}..., author=${post.author}, likes=${post.likes?.length || 0}`);
        });
      }
    }

    console.log('\n📊 迁移需求分析:');
    
    // 分析是否需要迁移
    const users = await db.collection('users').find({}).limit(10).toArray();
    
    if (users.length === 0) {
      console.log('⚠️  数据库中没有用户数据，无需迁移');
      return;
    }
    
    const hasOldStructure = users.some(user => 
      user._id && typeof user._id === 'object' && user._id.constructor.name === 'ObjectId'
    );
    
    const hasNewStructure = users.some(user => 
      user._id && typeof user._id === 'string' && user._id.startsWith('o')
    );
    
    const hasOpenidField = users.some(user => user.hasOwnProperty('openid'));
    
    console.log(`  是否存在旧结构(ObjectId): ${hasOldStructure}`);
    console.log(`  是否存在新结构(String): ${hasNewStructure}`);
    console.log(`  是否有openid字段: ${hasOpenidField}`);
    
    if (hasOldStructure && hasOpenidField) {
      console.log('✅ 数据库需要迁移：从ObjectId到openid主键');
      console.log('💡 建议执行: node scripts/migrateData.js');
    } else if (hasNewStructure && !hasOpenidField) {
      console.log('✅ 数据库已经迁移完成');
    } else {
      console.log('⚠️  数据库状态混合，需要手动检查');
    }

  } catch (error) {
    console.error('❌ 检查失败:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔐 数据库连接已关闭');
  }
}

// 运行检查
if (require.main === module) {
  checkDatabaseState();
}

module.exports = { checkDatabaseState };
