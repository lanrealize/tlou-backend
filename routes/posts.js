const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Post = require('../models/Post');
const Circle = require('../models/Circle');
const { checkOpenid } = require('../middleware/openidAuth');
const { catchAsync, AppError, globalErrorHandler } = require('../utils/errorHandler');
const User = require('../models/User'); // Added for comments
const mongoose = require('mongoose'); // Added for mongoose.Types.ObjectId

const router = express.Router();

// 创建帖子
router.post('/', checkOpenid, [
  body('circleId')
    .notEmpty()
    .withMessage('朋友圈ID不能为空')
    .isMongoId()
    .withMessage('无效的朋友圈ID'),
  body('content')
    .optional()
    .isString()
    .withMessage('内容必须是字符串'),
  body('images')
    .optional()
    .isArray()
    .withMessage('图片必须是数组格式')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  const { circleId, content, images } = req.body;

  // 检查朋友圈是否存在
  const circle = await Circle.findById(circleId);
  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  // 检查用户是否是朋友圈成员
  if (!circle.isMember(req.user._id)) {
    throw new AppError('您不是此朋友圈的成员', 403);
  }

  const post = await Post.create({
    author: req.user._id,
    circle: circleId,
    content,
    images: images || []
  });

  // 填充作者信息
  await post.populate('author', 'username avatar');

  res.status(201).json({
    success: true,
    message: '发布成功',
    data: { post }
  });
}));

// 获取朋友圈的帖子列表（批量查询优化版本）
router.get('/', checkOpenid, [
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

  const { circleId } = req.query;

  // 检查朋友圈是否存在且用户有权限访问
  const circle = await Circle.findById(circleId);
  if (!circle) {
    throw new AppError('朋友圈不存在', 404);
  }

  if (!circle.isPublic && !circle.isMember(req.user._id)) {
    throw new AppError('无权查看此朋友圈的帖子', 403);
  }

  // 获取该朋友圈的所有帖子
  const posts = await Post.find({ circle: circleId })
    .populate('author', 'username avatar')
    .sort({ createdAt: -1 });

  // 收集所有需要的用户ID
  const userIds = new Set();
  posts.forEach(post => {
    post.comments.forEach(comment => {
      userIds.add(comment.author.toString());
      if (comment.replyTo) {
        userIds.add(comment.replyTo.toString());
      }
    });
  });

  // 批量查询所有用户信息（只需要1次查询）
  const users = await User.find(
    { _id: { $in: Array.from(userIds) } }, 
    'username avatar'
  );
  
  // 创建用户信息映射表
  const userMap = new Map(users.map(user => [user._id.toString(), user]));

  // 填充用户信息
  const postsWithPopulatedComments = posts.map(post => {
    const postObj = post.toObject();
    
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
    data: { posts: postsWithPopulatedComments }
  });
}));

// 点赞/取消点赞（优化版本）
router.post('/:id/like', checkOpenid, catchAsync(async (req, res) => {
  const postId = req.params.id;
  const userId = req.user._id;

  // 先检查帖子是否存在并获取当前点赞状态
  const post = await Post.findById(postId, 'likes');
  if (!post) {
    throw new AppError('帖子不存在', 404);
  }

  const isLiked = post.likes.some(id => id.toString() === userId.toString());

  // 根据当前状态执行相反操作
  if (isLiked) {
    // 取消点赞
    await Post.findByIdAndUpdate(postId, {
      $pull: { likes: userId }
    });
  } else {
    // 点赞
    await Post.findByIdAndUpdate(postId, {
      $addToSet: { likes: userId }
    });
  }

  res.json({
    success: true,
    message: isLiked ? '取消点赞成功' : '点赞成功',
    data: { liked: !isLiked }
  });
}));

// 删除帖子（优化版本）
router.delete('/:id', checkOpenid, catchAsync(async (req, res) => {
  const postId = req.params.id;
  const userId = req.user._id;

  // 一次操作完成查询、权限检查和删除
  const result = await Post.findOneAndDelete({
    _id: postId,
    author: userId  // 只删除自己的帖子
  });

  if (!result) {
    throw new AppError('帖子不存在或无权限删除', 404);
  }

  res.json({
    success: true,
    message: '帖子删除成功'
  });
}));

// 添加评论
router.post('/:id/comments', checkOpenid, [
  body('content')
    .notEmpty()
    .withMessage('评论内容不能为空')
    .isLength({ max: 500 })
    .withMessage('评论内容不能超过500字'),
  body('replyToUserId')
    .optional()
    .isMongoId()
    .withMessage('无效的回复用户ID')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  const postId = req.params.id;
  const { content, replyToUserId } = req.body;
  const userId = req.user._id;

  // 检查帖子是否存在
  const post = await Post.findById(postId);
  if (!post) {
    throw new AppError('帖子不存在', 404);
  }

  // 如果是回复用户，检查用户是否存在
  if (replyToUserId) {
    const replyToUser = await User.findById(replyToUserId, 'username');
    if (!replyToUser) {
      throw new AppError('回复的用户不存在', 404);
    }
  }

  // 创建新评论对象
  const newComment = {
    _id: new mongoose.Types.ObjectId(),
    author: userId,
    content,
    replyTo: replyToUserId || null,
    createdAt: new Date()
  };

  // 使用原子操作添加评论
  await Post.updateOne(
    { _id: postId },
    { $push: { comments: newComment } }
  );

  res.status(201).json({
    success: true,
    message: '评论成功'
  });
}));

// 删除评论
router.delete('/:postId/comments/:commentId', checkOpenid, catchAsync(async (req, res) => {
  const { postId, commentId } = req.params;
  const userId = req.user._id;

  // 检查帖子是否存在
  const post = await Post.findById(postId);
  if (!post) {
    throw new AppError('帖子不存在', 404);
  }

  // 查找要删除的评论
  const comment = post.comments.id(commentId);
  if (!comment) {
    throw new AppError('评论不存在', 404);
  }

  // 检查权限：只能删除自己的评论
  if (comment.author.toString() !== userId.toString()) {
    throw new AppError('无权删除此评论', 403);
  }

  // 删除评论
  await Post.updateOne(
    { _id: postId },
    { $pull: { comments: { _id: commentId } } }
  );

  res.json({
    success: true,
    message: '评论删除成功'
  });
}));

module.exports = router; 