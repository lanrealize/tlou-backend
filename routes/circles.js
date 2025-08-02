const express = require('express');
const { body, validationResult } = require('express-validator');
const Circle = require('../models/Circle');
const User = require('../models/User');
const { checkOpenid } = require('../middleware/openidAuth');
const { catchAsync, AppError } = require('../utils/errorHandler');
const Post = require('../models/Post'); // 需要引入Post模型

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
    isPublic: isPublic !== undefined ? isPublic : false
  });

  // 填充创建者信息
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
    members: req.user._id
  })
    .populate('creator', 'username avatar')
    .populate('members', 'username avatar')
    .sort({ createdAt: -1 })
    .lean(); // 返回普通对象，方便后续处理

  // 获取所有圈子的ID
  const circleIds = circles.map(c => c._id);

  // 批量查询每个圈子的最新一条post
  const posts = await Post.aggregate([
    { $match: { circle: { $in: circleIds } } },
    { $sort: { createdAt: -1 } },
    { $group: {
        _id: "$circle",
        post: { $first: "$$ROOT" }
      }
    }
  ]);

  // 构建 circleId => post 的映射
  const latestPostMap = {};
  for (const p of posts) {
    latestPostMap[p._id.toString()] = p.post;
  }

  // 合并到 circles
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

  // 检查是否已经是成员
  if (circle.isMember(req.user._id)) {
    throw new AppError('您已经是朋友圈成员', 400);
  }

  // 添加用户到朋友圈
  await Circle.findByIdAndUpdate(req.params.id, {
    $push: { members: req.user._id }
  });

  res.json({
    success: true,
    message: '成功加入朋友圈'
  });
}));

// 退出朋友圈
router.delete('/:id/leave', checkOpenid, catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id);

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 检查是否是成员
  if (!circle.isMember(req.user._id)) {
    throw new AppError('您不是此朋友圈的成员', 400);
  }

  // 创建者不能退出
  if (circle.creator.toString() === req.user._id.toString()) {
    throw new AppError('创建者不能退出朋友圈', 400);
  }

  // 从朋友圈移除用户
  await Circle.findByIdAndUpdate(req.params.id, {
    $pull: { members: req.user._id }
  });

  res.json({
    success: true,
    message: '已退出朋友圈'
  });
}));

// 更新朋友圈设置
router.patch('/:id/settings', checkOpenid, [
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

  const circle = await Circle.findById(req.params.id);

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 只有创建者可以修改设置
  if (circle.creator.toString() !== req.user._id.toString()) {
    throw new AppError('只有创建者可以修改朋友圈设置', 403);
  }

  // 构建更新对象，只包含传入的字段
  const updateFields = {};
  const allowedFields = ['name', 'isPublic', 'description', 'allowInvite', 'allowPost'];
  
  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      updateFields[field] = req.body[field];
    }
  });

  // 如果没有要更新的字段
  if (Object.keys(updateFields).length === 0) {
    throw new AppError('请提供要更新的字段', 400);
  }

  // 更新朋友圈
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

module.exports = router; 