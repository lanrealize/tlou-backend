const Post = require('../models/Post');
const Circle = require('../models/Circle');
const { deleteQiniuFiles } = require('./qiniuUtils');

/**
 * 删除帖子并同时删除七牛云图片的辅助函数
 * @param {Object} query - MongoDB 查询条件
 * @param {Boolean} deleteImages - 是否删除七牛云图片
 * @returns {Number} 删除的帖子数量
 */
async function deletePostsWithImages(query, deleteImages = false) {
  if (!deleteImages) {
    const result = await Post.deleteMany(query);
    return result.deletedCount;
  }

  // 先查询帖子获取图片URL
  const postsToDelete = await Post.find(query).select('images').lean();
  
  // 收集图片URL
  const imageUrls = [];
  postsToDelete.forEach(post => {
    if (post.images && post.images.length > 0) {
      post.images.forEach(img => {
        const url = typeof img === 'string' ? img : img.url;
        if (url) imageUrls.push(url);
      });
    }
  });
  
  // 删除帖子
  const result = await Post.deleteMany(query);
  
  // 异步删除七牛云图片（不阻塞流程）
  if (imageUrls.length > 0) {
    console.log(`准备删除 ${imageUrls.length} 张七牛云图片`);
    setImmediate(() => deleteQiniuFiles(imageUrls));
  }
  
  return result.deletedCount;
}

/**
 * 清理用户在朋友圈的所有痕迹
 * 包括：用户的帖子、评论、点赞、以及指向该用户的回复引用
 * 
 * @param {String} userOpenid - 用户openid
 * @param {ObjectId} circleId - 朋友圈ID
 * @param {Object} options - 可选配置
 * @param {Boolean} options.deleteQiniuImages - 是否删除七牛云图片（默认 false）
 * @returns {Object} 清理统计信息
 */
async function cleanupUserInCircle(userOpenid, circleId, options = {}) {
  const { deleteQiniuImages = false } = options;
  
  const stats = {
    deletedPosts: 0,
    deletedComments: 0,
    deletedLikes: 0,
    clearedReplyTo: 0
  };

  try {
    // 1. 删除用户在该朋友圈的所有帖子（可选：同时删除七牛云图片）
    stats.deletedPosts = await deletePostsWithImages(
      { author: userOpenid, circle: circleId },
      deleteQiniuImages
    );

    // 2. 删除用户在该朋友圈其他帖子下的所有评论
    const deleteCommentsResult = await Post.updateMany(
      { circle: circleId },
      {
        $pull: {
          comments: { author: userOpenid }
        }
      }
    );
    stats.deletedComments = deleteCommentsResult.modifiedCount;

    // 3. 移除用户在该朋友圈所有帖子的点赞
    const deleteLikesResult = await Post.updateMany(
      { circle: circleId },
      {
        $pull: {
          likes: userOpenid
        }
      }
    );
    stats.deletedLikes = deleteLikesResult.modifiedCount;

    // 4. 清除其他评论中指向该用户的 replyTo 引用
    // 找到所有包含指向该用户的 replyTo 的帖子
    const postsWithReplyTo = await Post.find({
      circle: circleId,
      'comments.replyTo': userOpenid
    });

    // 逐个更新帖子，将 replyTo 设为 null
    let clearedCount = 0;
    for (const post of postsWithReplyTo) {
      // 直接修改评论文档的 replyTo 字段
      post.comments.forEach(comment => {
        if (comment.replyTo && comment.replyTo === userOpenid) {
          comment.replyTo = null;
          clearedCount++;
        }
      });
      
      await post.save();
    }
    stats.clearedReplyTo = clearedCount;

    // 5. 更新朋友圈的帖子统计
    const remainingPostsCount = await Post.countDocuments({ circle: circleId });
    await Circle.findByIdAndUpdate(circleId, {
      'stats.totalPosts': remainingPostsCount
    });

    return stats;
  } catch (error) {
    console.error('清理用户数据时出错:', error);
    throw error;
  }
}

/**
 * 检查用户在朋友圈的活动统计
 * 用于显示退出前的确认信息
 * 
 * @param {ObjectId} userId - 用户ID
 * @param {ObjectId} circleId - 朋友圈ID
 * @returns {Object} 用户活动统计
 */
async function getUserActivityStats(userId, circleId) {
  const stats = {
    postsCount: 0,
    commentsCount: 0,
    likesCount: 0
  };

  try {
    // 统计用户的帖子数
    stats.postsCount = await Post.countDocuments({
      author: userId,
      circle: circleId
    });

    // 统计用户的评论数
    const postsWithComments = await Post.find(
      { 
        circle: circleId,
        'comments.author': userId
      },
      { comments: 1 }
    );
    
    stats.commentsCount = postsWithComments.reduce((count, post) => {
      return count + post.comments.filter(
        comment => comment.author.toString() === userId.toString()
      ).length;
    }, 0);

    // 统计用户的点赞数
    stats.likesCount = await Post.countDocuments({
      circle: circleId,
      likes: userId
    });

    return stats;
  } catch (error) {
    console.error('获取用户活动统计时出错:', error);
    throw error;
  }
}

/**
 * 完整清理用户的所有数据
 * 包括：创建的圈子、参与的圈子、帖子、评论、点赞等
 * 
 * @param {String} userId - 用户openid
 * @param {Object} options - 可选配置
 * @param {Boolean} options.deleteQiniuImages - 是否删除七牛云图片（默认 true）
 * @param {Boolean} options.deleteVirtualUsers - 是否删除创建的虚拟用户（默认 false）
 * @returns {Object} 清理统计信息
 */
async function cleanupUserData(userId, options = {}) {
  const { deleteQiniuImages = true, deleteVirtualUsers = false } = options;
  
  const stats = {
    deletedCircles: 0,
    leftCircles: 0,
    deletedPosts: 0,
    deletedComments: 0,
    removedLikes: 0,
    deletedVirtualUsers: 0
  };

  try {
    // 1. 获取用户创建的所有圈子
    const createdCircles = await Circle.find({ creator: userId });
    stats.deletedCircles = createdCircles.length;

    // 2. 获取用户所在的所有圈子（包括作为成员或申请者）
    // 注意：members 和 appliers 是字符串数组，需要使用 $in 或直接匹配
    const memberCircles = await Circle.find({
      $or: [
        { members: { $in: [userId] } },
        { appliers: { $in: [userId] } }
      ]
    });
    stats.leftCircles = memberCircles.length;

    // 3. 删除用户创建的所有圈子（及其所有帖子和图片）
    if (createdCircles.length > 0) {
      const createdCircleIds = createdCircles.map(c => c._id);
      
      // 使用辅助函数删除帖子并清理七牛云图片
      const deletedCount = await deletePostsWithImages(
        { circle: { $in: createdCircleIds } },
        deleteQiniuImages
      );
      stats.deletedPosts += deletedCount;
      
      // 删除圈子
      await Circle.deleteMany({ _id: { $in: createdCircleIds } });
      console.log(`删除了用户创建的 ${createdCircles.length} 个圈子及其 ${deletedCount} 个帖子`);
    }

    // 4. 对于用户是成员/申请者的圈子，调用 cleanupUserInCircle 清理
    for (const circle of memberCircles) {
      // 使用 deleteQiniuImages 配置
      const cleanupStats = await cleanupUserInCircle(userId, circle._id, { 
        deleteQiniuImages 
      });
      
      stats.deletedPosts += cleanupStats.deletedPosts;
      stats.deletedComments += cleanupStats.deletedComments;
      stats.removedLikes += cleanupStats.deletedLikes;
      
      // 从圈子的成员列表和申请列表中移除用户
      await Circle.findByIdAndUpdate(circle._id, {
        $pull: { 
          members: userId,
          appliers: userId
        }
      });
      
      // 更新成员统计
      const updatedCircle = await Circle.findById(circle._id);
      if (updatedCircle) {
        updatedCircle.updateMemberStats();
        await updatedCircle.save();
      }
    }

    console.log(`从 ${memberCircles.length} 个圈子中清理了用户数据`);

    // 5. 如果需要，删除用户创建的虚拟用户
    if (deleteVirtualUsers) {
      const User = require('../models/User');
      const deletedVirtualUsers = await User.deleteMany({ 
        virtualOwner: userId,
        isVirtual: true 
      });
      stats.deletedVirtualUsers = deletedVirtualUsers.deletedCount;
      console.log(`删除了用户创建的 ${deletedVirtualUsers.deletedCount} 个虚拟用户`);
    }

    return stats;
  } catch (error) {
    console.error('清理用户数据时出错:', error);
    throw error;
  }
}

module.exports = {
  cleanupUserInCircle,
  getUserActivityStats,
  deletePostsWithImages,
  cleanupUserData
};

