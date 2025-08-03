const express = require('express');
const { body, validationResult } = require('express-validator');
const Circle = require('../models/Circle');
const User = require('../models/User');
const { checkOpenid } = require('../middleware/openidAuth');
const { catchAsync, AppError } = require('../utils/errorHandler');
const Post = require('../models/Post'); // 需要引入Post模型
const { updateCircleActivity } = require('../utils/circleUtils'); // 添加朋友圈活动更新工具
const randomCircleController = require('../controllers/randomCircle.controller');

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
    latestActivityTime: new Date() // 创建时设置初始活动时间
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
  // 查询用户有任何角色的朋友圈（creator, member, applier, invitee）
  const circles = await Circle.find({
    $or: [
      { creator: req.user._id },        // 用户是创建者
      { members: req.user._id },        // 用户是成员  
      { appliers: req.user._id },       // 用户是申请者
      { invitees: req.user._id }        // 用户是被邀请者
    ]
  })
    .populate('creator', 'username avatar')
    .populate('members', 'username avatar')
    .populate('appliers', 'username avatar')
    .populate('invitees', 'username avatar')
    .sort({ latestActivityTime: -1 }) // 按最新活动时间排序
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

  // 更新朋友圈活动时间
  updateCircleActivity(req.params.id);

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

// 申请加入朋友圈
router.post('/:id/apply', checkOpenid, catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id);

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 检查朋友圈是否为公开
  if (!circle.isPublic) {
    throw new AppError('私密朋友圈不支持申请加入', 400);
  }

  // 检查是否已经是成员
  if (circle.isMember(req.user._id)) {
    throw new AppError('您已经是朋友圈成员', 400);
  }

  // 检查是否已经申请过
  if (circle.isApplier(req.user._id)) {
    throw new AppError('您已经提交过申请，请等待审核', 400);
  }

  // 添加到申请者列表
  await Circle.findByIdAndUpdate(req.params.id, {
    $push: { appliers: req.user._id }
  });

  res.json({
    success: true,
    message: '申请已提交，请等待朋友圈创建者审核'
  });
}));

// 同意申请（将申请者加入朋友圈）
router.post('/:id/approve/:userId', checkOpenid, catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id);

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 只有创建者可以处理申请
  if (!circle.isCreator(req.user._id)) {
    throw new AppError('只有朋友圈创建者可以处理申请', 403);
  }

  const applicantId = req.params.userId;

  // 检查用户是否在申请列表中
  if (!circle.isApplier(applicantId)) {
    throw new AppError('该用户未申请加入此朋友圈', 400);
  }

  // 检查用户是否已经是成员（防止重复操作）
  if (circle.isMember(applicantId)) {
    throw new AppError('该用户已经是朋友圈成员', 400);
  }

  // 将用户从申请者列表移动到成员列表
  await Circle.findByIdAndUpdate(req.params.id, {
    $pull: { appliers: applicantId },
    $push: { members: applicantId }
  });

  // 更新朋友圈活动时间
  updateCircleActivity(req.params.id);

  res.json({
    success: true,
    message: '已同意申请，用户成功加入朋友圈'
  });
}));

// 拒绝申请（从申请者列表中移除）
router.post('/:id/reject/:userId', checkOpenid, catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id);

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 只有创建者可以处理申请
  if (!circle.isCreator(req.user._id)) {
    throw new AppError('只有朋友圈创建者可以处理申请', 403);
  }

  const applicantId = req.params.userId;

  // 检查用户是否在申请列表中
  if (!circle.isApplier(applicantId)) {
    throw new AppError('该用户未申请加入此朋友圈', 400);
  }

  // 从申请者列表中移除用户
  await Circle.findByIdAndUpdate(req.params.id, {
    $pull: { appliers: applicantId }
  });

  res.json({
    success: true,
    message: '已拒绝申请'
  });
}));

// 获取申请者列表
router.get('/:id/appliers', checkOpenid, catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id).populate('appliers', 'username avatar');

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 只有创建者可以查看申请列表
  if (!circle.isCreator(req.user._id)) {
    throw new AppError('只有朋友圈创建者可以查看申请列表', 403);
  }

  res.json({
    success: true,
    data: {
      appliers: circle.appliers
    }
  });
}));

// 邀请用户加入朋友圈
router.post('/:id/invite', checkOpenid, [
  body('userId')
    .notEmpty()
    .withMessage('用户ID不能为空')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  const circle = await Circle.findById(req.params.id);
  const { userId } = req.body;

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 检查权限：创建者或开启了成员邀请权限的成员可以邀请
  if (!circle.isCreator(req.user._id) && 
      (!circle.allowInvite || !circle.isMember(req.user._id))) {
    throw new AppError('您没有权限邀请用户', 403);
  }

  // 检查被邀请用户是否存在
  const invitedUser = await User.findById(userId);
  if (!invitedUser) {
    throw new AppError('被邀请用户不存在', 404);
  }

  // 检查用户是否已经有任何角色
  if (circle.hasAnyRole(userId)) {
    throw new AppError('该用户已经在朋友圈中或已被邀请/申请', 400);
  }

  // 添加到邀请列表
  await Circle.findByIdAndUpdate(req.params.id, {
    $push: { invitees: userId }
  });

  res.json({
    success: true,
    message: '邀请已发送'
  });
}));

// 取消邀请（将用户从invitee移除）
router.delete('/:id/invite/:userId', checkOpenid, catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id);
  const inviteeId = req.params.userId;

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 检查权限：只有创建者或邀请者可以取消邀请
  if (!circle.isCreator(req.user._id)) {
    throw new AppError('只有朋友圈创建者可以取消邀请', 403);
  }

  // 检查用户是否在邀请列表中
  if (!circle.isInvitee(inviteeId)) {
    throw new AppError('该用户未被邀请', 400);
  }

  // 从邀请列表中移除
  await Circle.findByIdAndUpdate(req.params.id, {
    $pull: { invitees: inviteeId }
  });

  res.json({
    success: true,
    message: '邀请已取消'
  });
}));

// 接受邀请（将用户从invitees移动到members中）
router.post('/:id/accept-invite', checkOpenid, catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id);

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 检查用户是否被邀请
  if (!circle.isInvitee(req.user._id)) {
    throw new AppError('您未被邀请加入此朋友圈', 400);
  }

  // 检查用户是否已经是成员（防止重复操作）
  if (circle.isMember(req.user._id)) {
    throw new AppError('您已经是朋友圈成员', 400);
  }

  // 将用户从邀请列表移动到成员列表
  await Circle.findByIdAndUpdate(req.params.id, {
    $pull: { invitees: req.user._id },
    $push: { members: req.user._id }
  });

  // 更新朋友圈活动时间
  updateCircleActivity(req.params.id);

  res.json({
    success: true,
    message: '成功加入朋友圈'
  });
}));

// 拒绝邀请（将用户从invitees中移除）
router.post('/:id/decline-invite', checkOpenid, catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id);

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 检查用户是否被邀请
  if (!circle.isInvitee(req.user._id)) {
    throw new AppError('您未被邀请加入此朋友圈', 400);
  }

  // 从邀请列表中移除
  await Circle.findByIdAndUpdate(req.params.id, {
    $pull: { invitees: req.user._id }
  });

  res.json({
    success: true,
    message: '已拒绝邀请'
  });
}));

// 获取邀请列表
router.get('/:id/invitees', checkOpenid, catchAsync(async (req, res) => {
  const circle = await Circle.findById(req.params.id).populate('invitees', 'username avatar');

  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 只有创建者可以查看邀请列表
  if (!circle.isCreator(req.user._id)) {
    throw new AppError('只有朋友圈创建者可以查看邀请列表', 403);
  }

  res.json({
    success: true,
    data: {
      invitees: circle.invitees
    }
  });
}));

// ========== 随机公开朋友圈接口 ==========
// ✅ 重要：具体路由必须在通用路由/:id之前定义！

// 获取随机public朋友圈
router.get('/random', checkOpenid, randomCircleController.getRandomPublicCircle);

// 获取单个朋友圈详情（支持公开朋友圈和邀请访问）
// ✅ 通用动态路由/:id必须放在最后，避免拦截具体路由
router.get('/:id', checkOpenid, catchAsync(async (req, res) => {
  const circleId = req.params.id;
  const userId = req.user?._id;

  // 1. 查询朋友圈基本信息，并填充相关用户数据
  const circle = await Circle.findById(circleId)
    .populate('creator', 'username avatar')           // 创建者信息
    .populate('members', 'username avatar')           // 成员信息  
    .populate('appliers', 'username avatar')          // 申请者信息
    .populate('invitees', 'username avatar');         // 被邀请者信息

  // 2. 检查朋友圈是否存在
  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 3. 权限检查：确定用户是否有权限查看此朋友圈
  const hasPermission = circle.isPublic ||                    // 公开朋友圈
                       (userId && circle.hasAnyRole(userId)); // 或者用户有任何角色

  if (!hasPermission) {
    throw new AppError('私密朋友圈，无权访问', 403);
  }

  // 4. 根据用户角色决定返回哪些信息
  let responseData;

  if (!userId) {
    // 4a. 未登录用户（只能访问公开朋友圈的基本信息）
    responseData = {
      _id: circle._id,
      name: circle.name,
      description: circle.description || '',
      isPublic: circle.isPublic,
      creator: circle.creator,
      memberCount: circle.members ? circle.members.length : 0,
      createdAt: circle.createdAt,
      latestActivityTime: circle.latestActivityTime
    };
  } else if (circle.isCreator(userId)) {
    // 4b. 创建者：返回完整管理信息
    responseData = {
      _id: circle._id,
      name: circle.name,
      description: circle.description || '',
      isPublic: circle.isPublic,
      creator: circle.creator,
      members: circle.members,
      appliers: circle.appliers,              // 创建者可以看到申请者
      invitees: circle.invitees,              // 创建者可以看到被邀请者
      allowInvite: circle.allowInvite,
      allowPost: circle.allowPost,
      stats: circle.stats,
      createdAt: circle.createdAt,
      updatedAt: circle.updatedAt,
      latestActivityTime: circle.latestActivityTime
    };
  } else if (circle.isMember(userId)) {
    // 4c. 普通成员：返回成员信息，但不包含管理数据
    responseData = {
      _id: circle._id,
      name: circle.name,
      description: circle.description || '',
      isPublic: circle.isPublic,
      creator: circle.creator,
      members: circle.members,
      appliers: [],                           // 普通成员看不到申请者
      invitees: [],                           // 普通成员看不到被邀请者
      allowInvite: circle.allowInvite,
      allowPost: circle.allowPost,
      stats: circle.stats,
      createdAt: circle.createdAt,
      latestActivityTime: circle.latestActivityTime
    };
  } else if (circle.isInvitee(userId) || circle.isApplier(userId)) {
    // 4d. 被邀请者或申请者：返回基本信息，让他们了解朋友圈
    responseData = {
      _id: circle._id,
      name: circle.name,
      description: circle.description || '',
      isPublic: circle.isPublic,
      creator: circle.creator,
      members: circle.members,                // 可以看到成员列表
      appliers: [],                          // 看不到其他申请者
      invitees: [],                          // 看不到其他被邀请者
      memberCount: circle.members ? circle.members.length : 0,
      createdAt: circle.createdAt,
      latestActivityTime: circle.latestActivityTime
    };
  } else {
    // 4e. 无关用户访问公开朋友圈
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

  // 5. 返回成功响应
  res.json({
    success: true,
    data: { circle: responseData }
  });
}));

module.exports = router; 