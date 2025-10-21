const Post = require('../models/Post');
const Circle = require('../models/Circle');

/**
 * 清理用户在朋友圈的所有痕迹
 * 包括：用户的帖子、评论、点赞、以及指向该用户的回复引用
 * 
 * @param {ObjectId} userId - 用户ID
 * @param {ObjectId} circleId - 朋友圈ID
 * @returns {Object} 清理统计信息
 */
async function cleanupUserInCircle(userId, circleId) {
  const userIdStr = userId.toString();
  
  const stats = {
    deletedPosts: 0,
    deletedComments: 0,
    deletedLikes: 0,
    clearedReplyTo: 0
  };

  try {
    // 1. 删除用户在该朋友圈的所有帖子
    const deletePostsResult = await Post.deleteMany({
      author: userId,
      circle: circleId
    });
    stats.deletedPosts = deletePostsResult.deletedCount;

    // 2. 删除用户在该朋友圈其他帖子下的所有评论
    const deleteCommentsResult = await Post.updateMany(
      { circle: circleId },
      {
        $pull: {
          comments: { author: userId }
        }
      }
    );
    stats.deletedComments = deleteCommentsResult.modifiedCount;

    // 3. 移除用户在该朋友圈所有帖子的点赞
    const deleteLikesResult = await Post.updateMany(
      { circle: circleId },
      {
        $pull: {
          likes: userId
        }
      }
    );
    stats.deletedLikes = deleteLikesResult.modifiedCount;

    // 4. 清除其他评论中指向该用户的 replyTo 引用
    // 找到所有包含指向该用户的 replyTo 的帖子
    const postsWithReplyTo = await Post.find({
      circle: circleId,
      'comments.replyTo': userId
    });

    // 逐个更新帖子，将 replyTo 设为 null
    let clearedCount = 0;
    for (const post of postsWithReplyTo) {
      // 直接修改评论文档的 replyTo 字段
      post.comments.forEach(comment => {
        if (comment.replyTo && comment.replyTo.toString() === userIdStr) {
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

module.exports = {
  cleanupUserInCircle,
  getUserActivityStats
};

