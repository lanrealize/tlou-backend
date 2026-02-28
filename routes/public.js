const express = require('express');
const { body, validationResult } = require('express-validator');
const Circle = require('../models/Circle');
const Post = require('../models/Post');
const TempUser = require('../models/TempUser');
const { catchAsync, AppError } = require('../utils/errorHandler');
const { checkTempOpenidAutoCreate } = require('../middleware/openidAuth');
const { updateCircleActivity } = require('../utils/circleUtils');

const router = express.Router();

// ========== 临时用户试用：创建朋友圈 ==========
/**
 * POST /api/public/trial/circle
 *
 * 允许未注册用户（只有openid）创建一个朋友圈（每个openid限一次）
 * 注册后朋友圈自动归属正式用户，无需迁移
 */
router.post('/trial/circle', checkTempOpenidAutoCreate, [
  body('name').optional().isString()
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  const openid = req.user._id;

  // 已注册用户走正常流程，不需要试用通道
  if (!req.isTemp) {
    throw new AppError('已注册用户请使用正式接口创建朋友圈', 400);
  }

  // 检查是否已创建过试用朋友圈
  if (req.user.trialCircleId) {
    throw new AppError('每个账号只能创建一个试用朋友圈', 400);
  }

  const { name } = req.body;

  const circle = await Circle.create({
    name: name || '我的朋友圈',
    creator: openid,
    latestActivityTime: new Date()
  });

  // 记录到 TempUser
  await TempUser.findByIdAndUpdate(openid, { trialCircleId: circle._id });

  res.status(201).json({
    success: true,
    message: '试用朋友圈创建成功',
    data: { circle }
  });
}));

// ========== 临时用户试用：发帖 ==========
/**
 * POST /api/public/trial/post
 *
 * 允许未注册用户在自己的试用朋友圈发一个帖子（每个openid限一次）
 * 注册后帖子自动归属正式用户，无需迁移
 */
router.post('/trial/post', checkTempOpenidAutoCreate, [
  body('circleId').notEmpty().isMongoId().withMessage('无效的朋友圈ID'),
  body('content').optional().isString()
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  const openid = req.user._id;

  if (!req.isTemp) {
    throw new AppError('已注册用户请使用正式接口发帖', 400);
  }

  const { circleId, content, images } = req.body;

  // 检查是否已发过试用帖子
  if (req.user.trialPostId) {
    throw new AppError('每个账号只能发一个试用帖子', 400);
  }

  // 只能在自己的试用朋友圈发帖
  if (!req.user.trialCircleId || req.user.trialCircleId.toString() !== circleId) {
    throw new AppError('只能在自己的试用朋友圈发帖', 403);
  }

  const post = await Post.create({
    author: openid,
    circle: circleId,
    content: content || '',
    images: images || []
  });

  // 记录到 TempUser
  await TempUser.findByIdAndUpdate(openid, { trialPostId: post._id });

  updateCircleActivity(circleId);

  res.status(201).json({
    success: true,
    message: '试用帖子发布成功',
    data: { post }
  });
}));

module.exports = router;
