const Circle = require('../models/Circle');
const Post = require('../models/Post');
const User = require('../models/User');
const { catchAsync, AppError } = require('../utils/errorHandler');

/**
 * 随机public朋友圈控制器
 * 处理获取随机公开朋友圈的API请求
 */

// 用于存储用户访问过的朋友圈ID，实现防重复机制
// 结构: { userId: { visitedIds: Set, lastResetTime: Date } }
const userVisitHistory = new Map();

// 历史记录清理间隔（24小时）
const HISTORY_RESET_INTERVAL = 24 * 60 * 60 * 1000;

/**
 * 清理过期的访问历史记录
 */
function cleanupExpiredHistory() {
  const now = Date.now();
  for (const [userId, history] of userVisitHistory.entries()) {
    if (now - history.lastResetTime.getTime() > HISTORY_RESET_INTERVAL) {
      userVisitHistory.delete(userId);
    }
  }
}

/**
 * 检查帖子是否有图片
 * @param {Object} post - 帖子对象
 * @returns {boolean} - 是否有图片
 */
function hasImages(post) {
  if (!post || !post.images || !Array.isArray(post.images)) {
    return false;
  }
  return post.images.length > 0;
}

/**
 * 查找符合条件的随机朋友圈（有帖子且第一个帖子有图片）
 * @param {Object} query - 查询条件
 * @param {number} maxAttempts - 最大尝试次数
 * @returns {Object|null} - { circle, latestPost } 或 null
 */
async function findValidRandomCircle(query, maxAttempts = 10) {
  const totalCount = await Circle.countDocuments(query);
  
  if (totalCount === 0) {
    return null;
  }

  const excludeIds = new Set();
  
  for (let attempt = 0; attempt < maxAttempts && excludeIds.size < totalCount; attempt++) {
    // 构建当前查询（排除已检查过的不合格朋友圈）
    const currentQuery = excludeIds.size > 0 
      ? { ...query, _id: { ...query._id, $nin: [...(query._id?.$nin || []), ...Array.from(excludeIds)] } }
      : query;
    
    const availableCount = await Circle.countDocuments(currentQuery);
    
    if (availableCount === 0) {
      break; // 没有更多可尝试的朋友圈
    }
    
    // 生成随机索引
    const randomIndex = Math.floor(Math.random() * availableCount);
    
    // 查询随机朋友圈
    const circle = await Circle.findOne(currentQuery)
      .sort({ _id: 1 })  // 添加稳定排序，避免skip返回重复结果
      .skip(randomIndex)
      .populate('creator', 'username avatar')
      .populate('members', 'username avatar')
      .lean();
    
    if (!circle) {
      continue;
    }
    
    // 查询该朋友圈的最新帖子
    const latestPost = await Post.findOne({ circle: circle._id })
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .lean();
    
    // 检查是否符合条件：有帖子且帖子有图片
    if (latestPost && hasImages(latestPost)) {
      console.log(`✅ 找到符合条件的朋友圈 (尝试 ${attempt + 1}/${maxAttempts}):`, {
        circleId: circle._id,
        circleName: circle.name,
        hasPost: !!latestPost,
        imageCount: latestPost.images.length
      });
      return { circle, latestPost };
    }
    
    // 不符合条件，记录并继续尝试
    console.log(`⚠️ 朋友圈不符合条件 (尝试 ${attempt + 1}/${maxAttempts}):`, {
      circleId: circle._id,
      circleName: circle.name,
      hasPost: !!latestPost,
      hasImages: latestPost ? hasImages(latestPost) : false
    });
    
    excludeIds.add(circle._id.toString());
  }
  
  console.log(`❌ 未找到符合条件的朋友圈 (已尝试 ${excludeIds.size} 个)`);
  return null;
}

/**
 * 获取随机public朋友圈
 * GET /api/circles/random
 * 
 * 查询参数:
 * - excludeVisited: boolean，是否排除已访问的朋友圈（默认true）
 * - resetHistory: boolean，是否重置访问历史（默认false）
 * 
 * 返回数据包含:
 * - circle: 朋友圈基本信息
 * - latestPost: 该朋友圈的最新帖子（保证有图片）
 * - randomInfo: 随机选择相关统计信息
 * 
 * 推荐规则：
 * 1. ✅ 只推荐有帖子的朋友圈
 * 2. ✅ 只推荐第一个帖子有图片的朋友圈
 * 3. 自动重试，确保返回符合条件的朋友圈
 * 
 * 性能优化特点：
 * 1. 使用索引优化的查询 { isPublic: true }
 * 2. 轻量级随机算法，避免大量数据加载
 * 3. 内存中维护访问历史，减少数据库查询
 * 4. 自动清理过期历史记录
 * 5. 智能重试机制，避免无限循环
 */
async function getRandomPublicCircle(req, res) {
  try {
    console.log('🎲 收到获取随机public朋友圈请求:', req.query);

    const {
      excludeVisited = 'true',
      resetHistory = 'false'
    } = req.query || {};

    // 从请求中获取 openid（支持可选认证）
    const openid = req.body?.openid || req.query?.openid || req.headers?.['x-openid'];
    let userId;
  if (openid) {
    const user = await User.findById(openid);
    if (user) {
      userId = user._id;  // _id就是openid
      console.log('✅ 用户已认证（openid）:', userId);
    } else {
      console.log('⚠️ 提供的openid无效，作为未登录用户继续');
    }
  } else {
    console.log('ℹ️ 未提供openid，作为未登录用户继续');
  }

    const shouldExcludeVisited = excludeVisited === 'true';
    const shouldResetHistory = resetHistory === 'true';

    // 定期清理过期历史记录
    cleanupExpiredHistory();

    // 处理重置历史记录的请求
    if (shouldResetHistory && userId) {
      userVisitHistory.delete(userId);
      console.log('🔄 已重置用户访问历史:', userId);
    }

    // 构建查询条件
    let query = { isPublic: true };
    let userHistory = null;

    // 如果需要排除已访问的朋友圈且用户已登录
    if (shouldExcludeVisited && userId) {
      userHistory = userVisitHistory.get(userId);
      
      if (userHistory && userHistory.visitedIds.size > 0) {
        // 排除已访问的朋友圈
        query._id = { $nin: Array.from(userHistory.visitedIds) };
      }
    }

    // 查找符合条件的随机朋友圈（有帖子且第一个帖子有图片）
    let result = await findValidRandomCircle(query);

    // 如果没找到符合条件的朋友圈
    if (!result) {
      // 检查是否是因为全部访问过了
      if (shouldExcludeVisited && userId && userHistory) {
        // 重置历史记录，重新尝试
        userVisitHistory.delete(userId);
        console.log('♻️  所有符合条件的朋友圈已访问完毕，重置历史记录并重试');
        
        result = await findValidRandomCircle({ isPublic: true });
        
        if (result) {
          const { circle: randomCircle, latestPost } = result;
          
          // 初始化新的访问历史
          userVisitHistory.set(userId, {
            visitedIds: new Set([randomCircle._id.toString()]),
            lastResetTime: new Date()
          });

          return res.json({
            success: true,
            message: '获取随机朋友圈成功（已重置访问历史）',
            data: {
              circle: {
                ...randomCircle,
                latestPost: latestPost
              },
              isHistoryReset: true,
              totalAvailable: await Circle.countDocuments({ isPublic: true }),
              visitedCount: 1
            }
          });
        }
      }

      // 确实没有符合条件的朋友圈
      return res.json({
        success: true,
        message: '暂无可用的公开朋友圈（所有朋友圈都没有图片帖子）',
        data: {
          circle: null,
          randomInfo: {
            totalAvailable: 0,
            visitedCount: userHistory ? userHistory.visitedIds.size : 0,
            isHistoryReset: false
          }
        }
      });
    }

    const { circle: randomCircle, latestPost } = result;

    // 更新用户访问历史
    if (shouldExcludeVisited && userId) {
      if (!userHistory) {
        userHistory = {
          visitedIds: new Set(),
          lastResetTime: new Date()
        };
        userVisitHistory.set(userId, userHistory);
      }
      
      userHistory.visitedIds.add(randomCircle._id.toString());
      
      console.log(`📝 用户 ${userId} 访问历史更新:`, {
        currentCircle: randomCircle._id.toString(),
        totalVisited: userHistory.visitedIds.size
      });
    }

    // 构建响应数据
    const responseData = {
      circle: {
        _id: randomCircle._id,
        name: randomCircle.name,
        description: randomCircle.description || '',
        isPublic: randomCircle.isPublic,
        creator: randomCircle.creator,
        members: randomCircle.members,
        memberCount: randomCircle.members ? randomCircle.members.length : 0,
        stats: randomCircle.stats,
        createdAt: randomCircle.createdAt,
        latestActivityTime: randomCircle.latestActivityTime,
        latestPost: latestPost
      },
      randomInfo: {
        totalAvailable: await Circle.countDocuments(query),
        visitedCount: userHistory ? userHistory.visitedIds.size : 0,
        isHistoryReset: false
      }
    };

    console.log('✅ 随机朋友圈获取成功:', {
      circleId: randomCircle._id,
      circleName: randomCircle.name,
      visitedCount: userHistory ? userHistory.visitedIds.size : 0,
      hasLatestPost: !!latestPost,
      imageCount: latestPost.images.length
    });

    res.json({
      success: true,
      message: '获取随机朋友圈成功',
      data: responseData
    });

  } catch (error) {
    console.error('❌ 获取随机public朋友圈失败:', error);
    
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || '获取随机朋友圈失败',
      code: 'RANDOM_CIRCLE_ERROR'
    });
  }
}

module.exports = {
  getRandomPublicCircle
};