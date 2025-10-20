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
 * 获取随机public朋友圈
 * GET /api/circles/random
 * 
 * 查询参数:
 * - excludeVisited: boolean，是否排除已访问的朋友圈（默认true）
 * - resetHistory: boolean，是否重置访问历史（默认false）
 * 
 * 返回数据包含:
 * - circle: 朋友圈基本信息
 * - latestPost: 该朋友圈的最新帖子（如果有的话）
 * - randomInfo: 随机选择相关统计信息
 * 
 * 性能优化特点：
 * 1. 使用索引优化的查询 { isPublic: true }
 * 2. 轻量级随机算法，避免大量数据加载
 * 3. 内存中维护访问历史，减少数据库查询
 * 4. 自动清理过期历史记录
 * 5. 🆕 一次请求同时获取朋友圈和最新帖子，减少网络往返
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
      const user = await User.findOne({ openid });
      if (user) {
        userId = user._id.toString();
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

    // 首先查询符合条件的朋友圈总数
    const totalCount = await Circle.countDocuments(query);

    if (totalCount === 0) {
      // 如果没有可用的朋友圈，检查是否是因为全部访问过了
      if (shouldExcludeVisited && userId && userHistory) {
        const totalPublicCount = await Circle.countDocuments({ isPublic: true });
        
        if (totalPublicCount > 0) {
          // 有public朋友圈但全部访问过了，重置历史记录并重新随机
          userVisitHistory.delete(userId);
          console.log('♻️  所有public朋友圈已访问完毕，重置历史记录');
          
          // 重新查询
          const newRandomIndex = Math.floor(Math.random() * totalPublicCount);
          const randomCircle = await Circle.findOne({ isPublic: true })
            .skip(newRandomIndex)
            .populate('creator', 'username avatar')
            .lean();

          if (randomCircle) {
            // 🆕 查询该朋友圈的最新帖子
            let latestPost = null;
            try {
              latestPost = await Post.findOne({ circle: randomCircle._id })
                .populate('author', 'username avatar')
                .sort({ createdAt: -1 })
                .lean();
            } catch (error) {
              console.warn('⚠️ 查询最新帖子失败:', error.message);
            }

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
                  latestPost: latestPost  // 🆕 添加最新帖子
                },
                isHistoryReset: true,
                totalAvailable: totalPublicCount,
                visitedCount: 1
              }
            });
          }
        }
      }

      // ✅ 不抛错误，返回空结果
      return res.json({
        success: true,
        message: '暂无可用的公开朋友圈',
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

    // 生成随机索引
    const randomIndex = Math.floor(Math.random() * totalCount);

    // 查询随机朋友圈
    const randomCircle = await Circle.findOne(query)
      .skip(randomIndex)
      .populate('creator', 'username avatar')
      .populate('members', 'username avatar')
      .lean();

    if (!randomCircle) {
      throw new AppError('获取随机朋友圈失败', 500);
    }

    // 🆕 查询该朋友圈的最新帖子
    let latestPost = null;
    try {
      latestPost = await Post.findOne({ circle: randomCircle._id })
        .populate('author', 'username avatar')
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
      console.warn('⚠️ 查询最新帖子失败:', error.message);
      // 不抛出错误，继续返回朋友圈信息，只是没有最新帖子
    }

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
        totalVisited: userHistory.visitedIds.size,
        totalAvailable: totalCount
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
        latestPost: latestPost  // 🆕 添加最新帖子
      },
      randomInfo: {
        totalAvailable: totalCount,
        visitedCount: userHistory ? userHistory.visitedIds.size : 0,
        isHistoryReset: false
      }
    };

    console.log('✅ 随机朋友圈获取成功:', {
      circleId: randomCircle._id,
      circleName: randomCircle.name,
      totalAvailable: totalCount,
      visitedCount: userHistory ? userHistory.visitedIds.size : 0,
      hasLatestPost: !!latestPost
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