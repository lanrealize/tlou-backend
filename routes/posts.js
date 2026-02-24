const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Post = require('../models/Post');
const Circle = require('../models/Circle');
const { checkOpenid } = require('../middleware/openidAuth');
const { requirePermission } = require('../middleware/circleAuth');
const { checkImagesMiddleware, cancelImageDeletion } = require('../middleware/imageCheck');
const { catchAsync, AppError, globalErrorHandler } = require('../utils/errorHandler');
const User = require('../models/User');
const mongoose = require('mongoose');
const { updateCircleActivity } = require('../utils/circleUtils');
const { deleteQiniuFiles } = require('../utils/qiniuUtils');

const { sendNotification } = require('../services/notification.service');

const router = express.Router();

// 创建帖子
router.post('/', checkOpenid, checkImagesMiddleware, requirePermission('circle', 'member'), [
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
    .custom((images) => {
      if (!images) return true;
      
      for (const img of images) {
        if (typeof img === 'string') {
          continue;
        }
        if (typeof img === 'object' && img !== null) {
          if (typeof img.url !== 'string' || !img.url.trim()) {
            throw new Error('图片对象必须包含有效的url字段');
          }
          if (typeof img.width !== 'number' || img.width <= 0) {
            throw new Error('图片对象必须包含有效的width字段（正数）');
          }
          if (typeof img.height !== 'number' || img.height <= 0) {
            throw new Error('图片对象必须包含有效的height字段（正数）');
          }
        } else {
          throw new Error('图片元素必须是字符串URL或包含{url, width, height}的对象');
        }
      }
      return true;
    })
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  const { circleId, content, images } = req.body;

  // req.circle 已由中间件提供，权限已检查

  const post = await Post.create({
    author: req.user._id,
    circle: circleId,
    content,
    images: images || []
  });

  await post.populate('author', 'username avatar');

  updateCircleActivity(circleId);

  if (req.imageDeletionId) {
    cancelImageDeletion(req.imageDeletionId);
  }

  // 异步推送发帖通知给圈子其他成员
  setImmediate(async () => {
    const { TEMPLATES } = require('../services/notification.service');
    const circle = await Circle.findById(circleId, 'name members');
    if (!circle) return;

    const otherMemberIds = circle.members
      .map(m => m.toString())
      .filter(id => id !== req.user._id);

    if (otherMemberIds.length === 0) return;

    const members = await User.find(
      { _id: { $in: otherMemberIds }, subscribedTemplates: TEMPLATES.post.id },
      '_id'
    );

    for (const member of members) {
      sendNotification(member._id, 'post', {
        fromUsername: req.user.username,
        content: content?.slice(0, 20) || '分享了一条动态',
        circleName: circle.name,
      });
    }
  });

  res.status(201).json({
    success: true,
    message: '发布成功',
    data: { post }
  });
}));

// 获取朋友圈的帖子列表
router.get('/', checkOpenid, requirePermission('circle', 'access'), [
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

  // req.circle 已由中间件提供，权限已检查

  const posts = await Post.find({ circle: circleId })
    .populate('author', 'username avatar')
    .populate('likes', 'username avatar')
    .sort({ createdAt: -1 });

  const userIds = new Set();
  posts.forEach(post => {
    post.comments.forEach(comment => {
      userIds.add(comment.author.toString());
      if (comment.replyTo) {
        userIds.add(comment.replyTo.toString());
      }
    });
  });

  const users = await User.find(
    { _id: { $in: Array.from(userIds) } }, 
    'username avatar'
  );
  
  const userMap = new Map(users.map(user => [user._id.toString(), user]));

  const postsWithPopulatedComments = posts.map(post => {
    const postObj = post.toObject();
    
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
    data: { posts: postsWithPopulatedComments }
  });
}));

// 点赞/取消点赞（✅ 修复P0安全问题：增加权限检查）
router.post('/:id/like', checkOpenid, requirePermission('post', 'access'), catchAsync(async (req, res) => {
  const postId = req.params.id;
  const userId = req.user._id;

  // req.post 和 req.circle 已由中间件提供，权限已检查
  const post = req.post;

  const isLiked = post.likes.some(id => id.toString() === userId.toString());

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

    // 只在点赞时更新朋友圈活动时间
    updateCircleActivity(post.circle._id);

    // 异步推送通知给帖子作者（不通知自己）
    const authorId = post.author._id ? post.author._id.toString() : post.author.toString();
    if (authorId !== userId) {
      setImmediate(async () => {
        const author = await User.findById(authorId, 'subscribedTemplates');
        if (author?.subscribedTemplates?.includes(require('../services/notification.service').TEMPLATES.like.id)) {
          sendNotification(authorId, 'like', {
            postTitle: post.content?.slice(0, 20) || '帖子',
            fromUsername: req.user.username,
          });
        }
      });
    }
  }

  const updatedPost = await Post.findById(postId, 'likes')
    .populate('likes', 'username avatar');

  res.json({
    success: true,
    message: isLiked ? '取消点赞成功' : '点赞成功',
    data: { 
      liked: !isLiked,
      likedUsers: updatedPost.likes
    }
  });
}));

// 删除帖子
router.delete('/:id', checkOpenid, requirePermission('post', 'author'), catchAsync(async (req, res) => {
  const postId = req.params.id;

  // req.post 已由中间件提供，权限已检查（只有作者可以删除）
  const post = req.post;

  // 异步删除七牛云文件
  if (post.images && post.images.length > 0) {
    const imageUrls = post.images.map(img => {
      if (typeof img === 'string') {
        return img;
      }
      return img.url;
    });
    setImmediate(() => deleteQiniuFiles(imageUrls));
  }

  await Post.findByIdAndDelete(postId);

  res.json({
    success: true,
    message: '帖子删除成功'
  });
}));

// 添加评论（✅ 修复P0安全问题：增加权限检查）
router.post('/:id/comments', checkOpenid, requirePermission('post', 'access'), [
  body('content')
    .notEmpty()
    .withMessage('评论内容不能为空')
    .isLength({ max: 500 })
    .withMessage('评论内容不能超过500字'),
  body('replyToUserOpenid')
    .optional()
    .notEmpty()
    .withMessage('无效的回复用户openid')
], catchAsync(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new AppError('输入验证失败: ' + errors.array().map(e => e.msg).join(', '), 400);
  }

  const postId = req.params.id;
  const { content, replyToUserOpenid } = req.body;
  const userId = req.user._id;

  // req.post 和 req.circle 已由中间件提供，权限已检查
  const post = req.post;

  if (replyToUserOpenid) {
    const replyToUser = await User.findById(replyToUserOpenid, 'username');
    if (!replyToUser) {
      throw new AppError('回复的用户不存在', 404);
    }
  }

  const newComment = {
    _id: new mongoose.Types.ObjectId(),
    author: userId,
    content,
    replyTo: replyToUserOpenid || null,
    createdAt: new Date()
  };

  await Post.updateOne(
    { _id: postId },
    { $push: { comments: newComment } }
  );

  updateCircleActivity(post.circle._id);

  // 异步推送通知（不通知自己）
  const authorId = post.author._id ? post.author._id.toString() : post.author.toString();
  setImmediate(async () => {
    const circle = await require('../models/Circle').findById(post.circle._id, 'name');
    const circleName = circle?.name || '朋友圈';
    const contentPreview = content.slice(0, 20);

    if (replyToUserOpenid && replyToUserOpenid !== userId) {
      // 回复评论：通知被回复的人
      const replyTarget = await User.findById(replyToUserOpenid, 'subscribedTemplates');
      if (replyTarget?.subscribedTemplates?.includes(require('../services/notification.service').TEMPLATES.reply.id)) {
        sendNotification(replyToUserOpenid, 'reply', {
          postTitle: post.content?.slice(0, 20) || '帖子',
          content: contentPreview,
          fromUsername: req.user.username,
        });
      }
    } else if (!replyToUserOpenid && authorId !== userId) {
      // 普通评论：通知帖子作者
      const author = await User.findById(authorId, 'subscribedTemplates');
      if (author?.subscribedTemplates?.includes(require('../services/notification.service').TEMPLATES.comment.id)) {
        sendNotification(authorId, 'comment', {
          circleName,
          content: contentPreview,
          fromUsername: req.user.username,
        });
      }
    }
  });

  res.status(201).json({
    success: true,
    message: '评论成功',
    data: {
      commentId: newComment._id,
      _id: newComment._id
    }
  });
}));

// 删除评论
router.delete('/:postId/comments/:commentId', checkOpenid, catchAsync(async (req, res) => {
  const { postId, commentId } = req.params;
  const userId = req.user._id;

  const post = await Post.findById(postId);
  if (!post) {
    throw new AppError('帖子不存在', 404);
  }

  const comment = post.comments.id(commentId);
  if (!comment) {
    throw new AppError('评论不存在', 404);
  }

  // 只能删除自己的评论
  if (comment.author.toString() !== userId.toString()) {
    throw new AppError('无权删除此评论', 403);
  }

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
