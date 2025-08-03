const Circle = require('../models/Circle');
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
 * 性能优化特点：
 * 1. 使用索引优化的查询 { isPublic: true }
 * 2. 轻量级随机算法，避免大量数据加载
 * 3. 内存中维护访问历史，减少数据库查询
 * 4. 自动清理过期历史记录
 */
async function getRandomPublicCircle(req, res) {
  try {
    console.log('🎲 收到获取随机public朋友圈请求:', req.query);

    const {
      excludeVisited = 'true',
      resetHistory = 'false'
    } = req.query;

    const userId = req.user?._id?.toString();
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
            // 初始化新的访问历史
            userVisitHistory.set(userId, {
              visitedIds: new Set([randomCircle._id.toString()]),
              lastResetTime: new Date()
            });

            return res.json({
              success: true,
              message: '获取随机朋友圈成功（已重置访问历史）',
              data: {
                circle: randomCircle,
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
        creator: randomCircle.creator,
        members: randomCircle.members,
        memberCount: randomCircle.members ? randomCircle.members.length : 0,
        stats: randomCircle.stats,
        createdAt: randomCircle.createdAt,
        latestActivityTime: randomCircle.latestActivityTime
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
      visitedCount: userHistory ? userHistory.visitedIds.size : 0
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