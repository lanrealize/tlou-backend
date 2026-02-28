const express = require('express');
const { body, validationResult } = require('express-validator');
const Circle = require('../models/Circle');
const User = require('../models/User');
const { checkOpenid } = require('../middleware/openidAuth');
const { requirePermission } = require('../middleware/circleAuth');
const { catchAsync, AppError } = require('../utils/errorHandler');
const Post = require('../models/Post');
const { updateCircleActivity } = require('../utils/circleUtils');
const { deletePostsWithImages } = require('../utils/memberCleanup');

const router = express.Router();

// 创建朋友圈
router.post('/', checkOpenid, [
  body('name')
    .notEmpty()
    .withMessage('朋友圈名称不能为空')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  const { name, description } = req.body;

  const circle = await Circle.create({
    name,
    description: description || '',
    creator: req.user._id,
    latestActivityTime: new Date()
  });

  await circle.populate('creator', 'username avatar');

  res.status(201).json({
    success: true,
    message: '朋友圈创建成功',
    data: { circle }
  });
}));

// 获取用户的朋友圈列表
router.get('/my', checkOpenid, catchAsync(async (req, res) => {
  const circles = await Circle.find({ creator: req.user._id })
    .populate('creator', 'username avatar')
    .sort({ latestActivityTime: -1 })
    .lean();

  const circleIds = circles.map(c => c._id);

  const posts = await Post.aggregate([
    { $match: { circle: { $in: circleIds } } },
    { $sort: { createdAt: -1 } },
    { $group: {
        _id: "$circle",
        post: { $first: "$$ROOT" }
      }
    }
  ]);

  const authorIds = posts.map(p => p.post.author).filter(Boolean);
  const users = await User.find({ _id: { $in: authorIds } }, 'username avatar');
  const userMap = new Map(users.map(user => [user._id.toString(), user]));

  const latestPostMap = {};
  for (const p of posts) {
    const post = p.post;
    if (post.author) {
      post.author = userMap.get(post.author.toString()) || {
        _id: post.author,
        username: '未知用户',
        avatar: ''
      };
    }
    latestPostMap[p._id.toString()] = post;
  }

  const result = circles.map(circle => ({
    ...circle,
    latestPost: latestPostMap[circle._id.toString()] || null
  }));

  res.json({
    success: true,
    data: { circles: result }
  });
}));

// 删除朋友圈（创建者专用）
router.delete('/:id', checkOpenid, requirePermission('circle', 'creator'), catchAsync(async (req, res) => {
  await deletePostsWithImages({ circle: req.params.id }, true);
  await Circle.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: '朋友圈已删除'
  });
}));

// 更新朋友圈设置
router.patch('/:id/settings', checkOpenid, requirePermission('circle', 'creator'), [
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('朋友圈名称长度应在1-50个字符之间'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('朋友圈描述不能超过200个字符')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  const updateFields = {};
  ['name', 'description'].forEach(field => {
    if (req.body[field] !== undefined) {
      updateFields[field] = req.body[field];
    }
  });

  if (Object.keys(updateFields).length === 0) {
    throw new AppError('请提供要更新的字段', 400);
  }

  const updatedCircle = await Circle.findByIdAndUpdate(
    req.params.id,
    updateFields,
    { new: true, runValidators: true }
  ).populate('creator', 'username avatar');

  res.json({
    success: true,
    message: '朋友圈设置更新成功',
    data: { circle: updatedCircle }
  });
}));

// 获取单个朋友圈详情
// ✅ 通用动态路由/:id必须放在最后，避免拦截具体路由
router.get('/:id', checkOpenid, requirePermission('circle', 'access'), catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id)
    .populate('creator', 'username avatar');

  const currentUserStatus = {
    isOwner: circle.isCreator(req.user._id)
  };

  const responseData = {
    _id: circle._id,
    name: circle.name,
    description: circle.description || '',
    creator: circle.creator,
    aiPersona: circle.aiPersona,
    stats: circle.stats,
    createdAt: circle.createdAt,
    updatedAt: circle.updatedAt,
    latestActivityTime: circle.latestActivityTime,
    currentUserStatus
  };

  res.json({
    success: true,
    data: { circle: responseData }
  });
}));

module.exports = router;
