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
      { $pull: { comments: { author: userOpenid } } }
    );
    stats.deletedComments = deleteCommentsResult.modifiedCount;

    // 3. 清除其他评论中指向该用户的 replyTo 引用
    const postsWithReplyTo = await Post.find({
      circle: circleId,
      'comments.replyTo': userOpenid
    });

    let clearedCount = 0;
    for (const post of postsWithReplyTo) {
      post.comments.forEach(comment => {
        if (comment.replyTo && comment.replyTo === userOpenid) {
          comment.replyTo = null;
          clearedCount++;
        }
      });
      await post.save();
    }
    stats.clearedReplyTo = clearedCount;

    // 4. 更新朋友圈的帖子统计
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
    commentsCount: 0
  };

  try {
    stats.postsCount = await Post.countDocuments({
      author: userId,
      circle: circleId
    });

    const postsWithComments = await Post.find(
      { circle: circleId, 'comments.author': userId },
      { comments: 1 }
    );

    stats.commentsCount = postsWithComments.reduce((count, post) => {
      return count + post.comments.filter(
        comment => comment.author.toString() === userId.toString()
      ).length;
    }, 0);

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
  const { deleteQiniuImages = true } = options;

  const stats = {
    deletedCircles: 0,
    deletedPosts: 0,
    deletedComments: 0
  };

  try {
    // 1. 获取用户创建的所有圈子
    const createdCircles = await Circle.find({ creator: userId });
    stats.deletedCircles = createdCircles.length;

    // 2. 删除用户创建的所有圈子（及其所有帖子和图片）
    if (createdCircles.length > 0) {
      const createdCircleIds = createdCircles.map(c => c._id);

      const deletedCount = await deletePostsWithImages(
        { circle: { $in: createdCircleIds } },
        deleteQiniuImages
      );
      stats.deletedPosts += deletedCount;

      await Circle.deleteMany({ _id: { $in: createdCircleIds } });
      console.log(`删除了用户创建的 ${createdCircles.length} 个圈子及其 ${deletedCount} 个帖子`);
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

