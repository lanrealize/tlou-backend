const express = require('express');
const { body, validationResult } = require('express-validator');
const Circle = require('../models/Circle');
const User = require('../models/User');
const { checkOpenid } = require('../middleware/openidAuth');
const { requirePermission } = require('../middleware/circleAuth');
const { catchAsync, AppError } = require('../utils/errorHandler');
const Post = require('../models/Post');
const { updateCircleActivity } = require('../utils/circleUtils');
const randomCircleController = require('../controllers/randomCircle.controller');
const { cleanupUserInCircle, deletePostsWithImages } = require('../utils/memberCleanup');

const router = express.Router();

// 创建朋友圈
router.post('/', checkOpenid, [
  body('name')
    .notEmpty()
    .withMessage('朋友圈名称不能为空'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('公开状态必须是布尔值')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  const { name, isPublic } = req.body;

  const circle = await Circle.create({
    name,
    creator: req.user._id,
    members: [req.user._id],
    isPublic: isPublic !== undefined ? isPublic : false,
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
  const circles = await Circle.find({
    $or: [
      { creator: req.user._id },
      { members: req.user._id },
      { appliers: req.user._id }
    ]
  })
    .populate('creator', 'username avatar')
    .populate('members', 'username avatar')
    .populate('appliers', 'username avatar')
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

  const latestPostMap = {};
  for (const p of posts) {
    latestPostMap[p._id.toString()] = p.post;
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

// 加入朋友圈
router.post('/:id/join', checkOpenid, catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id);

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  if (circle.isMember(req.user._id)) {
    throw new AppError('您已经是朋友圈成员', 400);
  }

  await Circle.findByIdAndUpdate(req.params.id, {
    $push: { members: req.user._id }
  });

  updateCircleActivity(req.params.id);

  res.json({
    success: true,
    message: '成功加入朋友圈'
  });
}));

// 退出朋友圈
router.delete('/:id/leave', checkOpenid, requirePermission('circle', 'member'), catchAsync(async (req, res) => {
  // req.circle 已由中间件提供
  const circle = req.circle;

  // 创建者不能退出
  if (circle.isCreator(req.user._id)) {
    throw new AppError('创建者不能退出朋友圈', 400);
  }

  // 清理用户在朋友圈的所有痕迹（帖子、评论、点赞、七牛云图片）
  const cleanupStats = await cleanupUserInCircle(req.user._id, req.params.id, {
    deleteQiniuImages: true
  });

  // 从成员列表中移除用户
  await Circle.findByIdAndUpdate(req.params.id, {
    $pull: { members: req.user._id }
  });

  res.json({
    success: true,
    message: '已退出朋友圈',
    data: {
      cleaned: {
        posts: cleanupStats.deletedPosts,
        comments: cleanupStats.deletedComments,
        likes: cleanupStats.deletedLikes,
        replyReferences: cleanupStats.clearedReplyTo
      }
    }
  });
}));

// 删除朋友圈（创建者专用）
router.delete('/:id', checkOpenid, requirePermission('circle', 'creator'), catchAsync(async (req, res) => {
  // req.circle 已由中间件提供，权限已检查

  // 级联删除该朋友圈下的所有帖子（包括七牛云图片）
  await deletePostsWithImages({ circle: req.params.id }, true);

  // 删除朋友圈
  await Circle.findByIdAndDelete(req.params.id);

  res.json({
    success: true,
    message: '朋友圈已删除'
  });
}));

// 删除朋友圈成员（创建者专用）
router.delete('/:id/members/:userId', checkOpenid, requirePermission('circle', 'creator'), catchAsync(async (req, res) => {
  // req.circle 已由中间件提供，权限已检查
  const circle = req.circle;
  const memberToRemove = req.params.userId;

  // 检查被删除的用户是否是成员
  if (!circle.isMember(memberToRemove)) {
    throw new AppError('该用户不是朋友圈成员', 400);
  }

  // 创建者不能删除自己
  if (circle.isCreator(memberToRemove)) {
    throw new AppError('创建者不能删除自己', 400);
  }

  // 清理被删除成员在朋友圈的所有痕迹（帖子、评论、点赞、七牛云图片）
  const cleanupStats = await cleanupUserInCircle(memberToRemove, req.params.id, {
    deleteQiniuImages: true
  });

  // 从朋友圈移除指定成员
  await Circle.findByIdAndUpdate(req.params.id, {
    $pull: { members: memberToRemove }
  });

  updateCircleActivity(req.params.id);

  res.json({
    success: true,
    message: '成员已被移除',
    data: {
      cleaned: {
        posts: cleanupStats.deletedPosts,
        comments: cleanupStats.deletedComments,
        likes: cleanupStats.deletedLikes,
        replyReferences: cleanupStats.clearedReplyTo
      }
    }
  });
}));

// 更新朋友圈设置
router.patch('/:id/settings', checkOpenid, requirePermission('circle', 'creator'), [
  body('name')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('朋友圈名称长度应在1-50个字符之间'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('公开状态必须是布尔值'),
  body('description')
    .optional()
    .isString()
    .isLength({ max: 200 })
    .withMessage('朋友圈描述不能超过200个字符'),
  body('allowInvite')
    .optional()
    .isBoolean()
    .withMessage('邀请权限必须是布尔值'),
  body('allowPost')
    .optional()
    .isBoolean()
    .withMessage('发帖权限必须是布尔值')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  // req.circle 已由中间件提供，权限已检查

  const updateFields = {};
  const allowedFields = ['name', 'isPublic', 'description', 'allowInvite', 'allowPost'];
  
  allowedFields.forEach(field => {
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

// 申请加入朋友圈
router.post('/:id/apply', checkOpenid, catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id);

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  if (!circle.isPublic) {
    throw new AppError('私密朋友圈不支持申请加入', 400);
  }

  if (circle.isMember(req.user._id)) {
    throw new AppError('您已经是朋友圈成员', 400);
  }

  if (circle.isApplier(req.user._id)) {
    throw new AppError('您已经提交过申请，请等待审核', 400);
  }

  await Circle.findByIdAndUpdate(req.params.id, {
    $push: { appliers: req.user._id }
  });

  res.json({
    success: true,
    message: '申请已提交，请等待朋友圈创建者审核'
  });
}));

// 同意申请（将申请者加入朋友圈）
router.post('/:id/approve/:userId', checkOpenid, requirePermission('circle', 'creator'), catchAsync(async (req, res) => {
  // req.circle 已由中间件提供，权限已检查
  const circle = req.circle;
  const applicantId = req.params.userId;

  if (!circle.isApplier(applicantId)) {
    throw new AppError('该用户未申请加入此朋友圈', 400);
  }

  if (circle.isMember(applicantId)) {
    throw new AppError('该用户已经是朋友圈成员', 400);
  }

  await Circle.findByIdAndUpdate(req.params.id, {
    $pull: { appliers: applicantId },
    $push: { members: applicantId }
  });

  updateCircleActivity(req.params.id);

  res.json({
    success: true,
    message: '已同意申请，用户成功加入朋友圈'
  });
}));

// 拒绝申请（从申请者列表中移除）
router.post('/:id/reject/:userId', checkOpenid, requirePermission('circle', 'creator'), catchAsync(async (req, res) => {
  // req.circle 已由中间件提供，权限已检查
  const circle = req.circle;
  const applicantId = req.params.userId;

  if (!circle.isApplier(applicantId)) {
    throw new AppError('该用户未申请加入此朋友圈', 400);
  }

  await Circle.findByIdAndUpdate(req.params.id, {
    $pull: { appliers: applicantId }
  });

  res.json({
    success: true,
    message: '已拒绝申请'
  });
}));

// 获取申请者列表
router.get('/:id/appliers', checkOpenid, requirePermission('circle', 'creator'), catchAsync(async (req, res) => {
  // req.circle 已由中间件提供，权限已检查
  // 需要 populate appliers
  const circle = await Circle.findById(req.params.id).populate('appliers', 'username avatar');

  res.json({
    success: true,
    data: {
      appliers: circle.appliers
    }
  });
}));

// 获取单个朋友圈详情（支持公开朋友圈和邀请访问）
// ✅ 通用动态路由/:id必须放在最后，避免拦截具体路由
router.get('/:id', checkOpenid, requirePermission('circle', 'access'), catchAsync(async (req, res) => {
  // req.circle 已由中间件提供，权限已检查
  // 但需要 populate 来获取详细信息
  const userId = req.user._id;
  
  const circle = await Circle.findById(req.params.id)
    .populate('creator', 'username avatar')
    .populate('members', 'username avatar')
    .populate('appliers', 'username avatar');

  // 根据用户角色决定返回哪些信息
  let responseData;

  if (circle.isCreator(userId)) {
    // 创建者：返回完整管理信息
    responseData = {
      _id: circle._id,
      name: circle.name,
      description: circle.description || '',
      isPublic: circle.isPublic,
      creator: circle.creator,
      members: circle.members,
      appliers: circle.appliers,
      allowInvite: circle.allowInvite,
      allowPost: circle.allowPost,
      stats: circle.stats,
      createdAt: circle.createdAt,
      updatedAt: circle.updatedAt,
      latestActivityTime: circle.latestActivityTime
    };
  } else if (circle.isMember(userId)) {
    // 普通成员：返回成员信息，但不包含管理数据
    responseData = {
      _id: circle._id,
      name: circle.name,
      description: circle.description || '',
      isPublic: circle.isPublic,
      creator: circle.creator,
      members: circle.members,
      appliers: [],
      allowInvite: circle.allowInvite,
      allowPost: circle.allowPost,
      stats: circle.stats,
      createdAt: circle.createdAt,
      latestActivityTime: circle.latestActivityTime
    };
  } else if (circle.isApplier(userId)) {
    // 申请者：返回基本信息
    responseData = {
      _id: circle._id,
      name: circle.name,
      description: circle.description || '',
      isPublic: circle.isPublic,
      creator: circle.creator,
      members: circle.members,
      appliers: [],
      memberCount: circle.members ? circle.members.length : 0,
      createdAt: circle.createdAt,
      latestActivityTime: circle.latestActivityTime
    };
  } else {
    // 无关用户访问公开朋友圈
    responseData = {
      _id: circle._id,
      name: circle.name,
      description: circle.description || '',
      isPublic: circle.isPublic,
      creator: circle.creator,
      members: circle.members,
      memberCount: circle.members ? circle.members.length : 0,
      createdAt: circle.createdAt,
      latestActivityTime: circle.latestActivityTime
    };
  }

  res.json({
    success: true,
    data: { circle: responseData }
  });
}));

module.exports = router;
