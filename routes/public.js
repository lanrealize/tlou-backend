const express = require('express');
const { query, validationResult } = require('express-validator');
const Circle = require('../models/Circle');
const Post = require('../models/Post');
const User = require('../models/User');
const { catchAsync, AppError } = require('../utils/errorHandler');
const randomCircleController = require('../controllers/randomCircle.controller');

const router = express.Router();

/**
 * 公开API路由
 * 这些接口无需认证，允许未登录用户访问公开内容
 * 用于推广和吸引新用户注册
 */

// ========== 获取随机公开朋友圈 ==========
/**
 * GET /api/public/circles/random
 * 
 * 功能：随机推荐公开朋友圈
 * 认证：无需认证（但支持可选的 openid 参数）
 * 
 * 查询参数：
 * - openid（可选）：如果提供，会记录访问历史避免重复推荐
 * - excludeVisited（可选）：是否排除已访问的（默认 true，需要 openid）
 * - resetHistory（可选）：是否重置访问历史（默认 false，需要 openid）
 * 
 * 说明：
 * - 未登录用户：每次随机返回，不记录历史
 * - 已登录用户：记录访问历史，避免重复推荐
 */
router.get('/circles/random', randomCircleController.getRandomPublicCircle);

// ========== 获取朋友圈详情 ==========
/**
 * GET /api/public/circles/:id?invite=ABC123
 * 
 * 功能：获取朋友圈的基本信息
 * 认证：无需认证
 * 
 * 访问规则：
 * - 公开朋友圈：无需额外参数，直接访问
 * - 私有朋友圈：需要正确的 invite 邀请码
 * 
 * 查询参数：
 * - invite（可选）：6位邀请码，用于访问私有朋友圈
 * 
 * 返回数据：朋友圈基本信息（不包含敏感数据如申请者列表）
 */
router.get('/circles/:id', catchAsync(async (req, res) => {
  const { id } = req.params;
  const { invite } = req.query;

  // 查询朋友圈（不使用lean，因为需要调用实例方法）
  const circle = await Circle.findById(id)
    .populate('creator', 'username avatar')
    .populate('members', 'username avatar');

  // 检查朋友圈是否存在
  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 优雅的权限检查：公开朋友圈 或 有效邀请码
  const canAccess = circle.isPublic || circle.isValidInviteCode(invite);
  
  if (!canAccess) {
    const errorMsg = invite 
      ? '邀请码无效，请检查邀请链接是否正确'
      : '此为私密朋友圈，需要邀请码才能访问';
    throw new AppError(errorMsg, 403);
  }

  // 返回基础信息（不包含敏感数据）
  const responseData = {
    _id: circle._id,
    name: circle.name,
    description: circle.description || '',
    isPublic: circle.isPublic,
    creator: circle.creator,
    members: circle.members,
    memberCount: circle.members ? circle.members.length : 0,
    stats: circle.stats,
    createdAt: circle.createdAt,
    latestActivityTime: circle.latestActivityTime,
    currentUserStatus: null,  // 未登录用户
    accessMethod: circle.isPublic ? 'public' : 'invite'  // 标记访问方式
  };

  res.json({
    success: true,
    data: { circle: responseData }
  });
}));

// ========== 获取朋友圈的帖子列表 ==========
/**
 * GET /api/public/posts?circleId=xxx&page=1&limit=10&invite=ABC123
 * 
 * 功能：获取朋友圈的帖子列表
 * 认证：无需认证
 * 
 * 访问规则：
 * - 公开朋友圈：无需额外参数，直接访问
 * - 私有朋友圈：需要正确的 invite 邀请码
 * 
 * 查询参数：
 * - circleId: 朋友圈ID（必填）
 * - page: 页码，默认1
 * - limit: 每页数量，默认10，最大50
 * - invite（可选）：6位邀请码，用于访问私有朋友圈帖子
 * 
 * 返回数据：帖子列表，包含作者、点赞、评论等信息
 */
router.get('/posts', [
  query('circleId')
    .notEmpty()
    .withMessage('朋友圈ID不能为空')
    .isMongoId()
    .withMessage('无效的朋友圈ID')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  const { circleId, page = 1, limit = 10, invite } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit), 50); // 最大50条

  // 检查朋友圈是否存在
  const circle = await Circle.findById(circleId);
  
  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 优雅的权限检查：公开朋友圈 或 有效邀请码
  const canAccess = circle.isPublic || circle.isValidInviteCode(invite);
  
  if (!canAccess) {
    const errorMsg = invite 
      ? '邀请码无效，无法查看此朋友圈的帖子'
      : '此为私密朋友圈，需要邀请码才能查看帖子';
    throw new AppError(errorMsg, 403);
  }

  // 查询帖子总数
  const total = await Post.countDocuments({ circle: circleId });

  // 获取帖子列表（带分页）
  const posts = await Post.find({ circle: circleId })
    .populate('author', 'username avatar')
    .populate('likes', 'username avatar')
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum)
    .lean();

  // 收集所有需要的用户ID（用于评论）
  const userIds = new Set();
  posts.forEach(post => {
    if (post.comments && post.comments.length > 0) {
      post.comments.forEach(comment => {
        userIds.add(comment.author.toString());
        if (comment.replyTo) {
          userIds.add(comment.replyTo.toString());
        }
      });
    }
  });

  // 批量查询所有用户信息
  const users = await User.find(
    { _id: { $in: Array.from(userIds) } },
    'username avatar'
  );

  // 创建用户信息映射表
  const userMap = new Map(users.map(user => [user._id.toString(), user]));

  // 填充评论的用户信息
  const postsWithPopulatedComments = posts.map(post => {
    const postObj = { ...post };
    
    // 添加 likedUsers 字段，保持向后兼容
    postObj.likedUsers = postObj.likes || [];
    
    if (postObj.comments && postObj.comments.length > 0) {
      postObj.comments = postObj.comments.map(comment => ({
        ...comment,
        author: userMap.get(comment.author.toString()) || {
          _id: comment.author,
          username: '未知用户',
          avatar: ''
        },
        replyTo: comment.replyTo ? {
          _id: comment.replyTo,
          username: userMap.get(comment.replyTo.toString())?.username || '未知用户'
        } : null
      }));
    }
    
    return postObj;
  });

  res.json({
    success: true,
    data: {
      posts: postsWithPopulatedComments,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    }
  });
}));

module.exports = router;

