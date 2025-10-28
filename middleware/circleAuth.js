const Circle = require('../models/Circle');
const Post = require('../models/Post');
const { AppError } = require('../utils/errorHandler');
const mongoose = require('mongoose');

/**
 * 统一权限检查中间件工厂函数
 * 
 * @param {string} resourceType - 资源类型：'circle' | 'post'
 * @param {string} permission - 权限类型：'creator' | 'member' | 'access' | 'author'
 * @param {object} options - 可选配置
 * @returns {Function} Express 中间件函数
 * 
 * 使用示例：
 * router.delete('/:id', checkOpenid, requirePermission('circle', 'creator'), ...)
 */
function requirePermission(resourceType, permission, options = {}) {
  return async (req, res, next) => {
    try {
      const userId = req.user._id;

      if (resourceType === 'circle') {
        // Circle 资源权限检查
        const circleId = req.params.id || req.query.circleId || req.body.circleId;
        
        if (!circleId) {
          return next(new AppError('朋友圈ID不能为空', 400));
        }

        // 验证ID格式
        if (!mongoose.Types.ObjectId.isValid(circleId)) {
          return next(new AppError('无效的朋友圈ID', 400));
        }

        // 查询 Circle（只查询一次）
        const circle = await Circle.findById(circleId);
        
        if (!circle) {
          return next(new AppError('朋友圈不存在', 404));
        }

        // 缓存到 req，避免重复查询
        req.circle = circle;

        // 根据权限类型进行检查
        let hasPermission = false;

        switch (permission) {
          case 'creator':
            // 只有创建者
            hasPermission = circle.isCreator(userId);
            if (!hasPermission) {
              return next(new AppError('只有朋友圈创建者可以执行此操作', 403));
            }
            break;

          case 'member':
            // 必须是成员（包括创建者）
            hasPermission = circle.isMember(userId);
            if (!hasPermission) {
              // 根据HTTP方法返回不同的状态码
              const statusCode = req.method === 'DELETE' ? 400 : 403;
              return next(new AppError('您不是此朋友圈的成员', statusCode));
            }
            break;

          case 'access':
            // 可以访问（公开 或 有任何角色 或 有效邀请码）
            const { inviteCode } = req.query;
            hasPermission = circle.isPublic || 
                           circle.hasAnyRole(userId) || 
                           circle.isValidInviteCode(inviteCode);
            if (!hasPermission) {
              // 根据context返回不同的错误消息
              if (inviteCode) {
                return next(new AppError('邀请码无效或已过期', 403));
              }
              const errorMsg = req.query.circleId ? '无权查看此朋友圈的帖子' : '私密朋友圈，无权访问';
              return next(new AppError(errorMsg, 403));
            }
            break;

          default:
            return next(new AppError('未知的权限类型', 500));
        }

        next();

      } else if (resourceType === 'post') {
        // Post 资源权限检查
        const postId = req.params.id || req.params.postId;
        
        if (!postId) {
          return next(new AppError('帖子ID不能为空', 400));
        }

        // 验证ID格式
        if (!mongoose.Types.ObjectId.isValid(postId)) {
          return next(new AppError('无效的帖子ID', 400));
        }

        // 查询 Post 并 populate circle
        const post = await Post.findById(postId).populate('circle');
        
        if (!post) {
          // 为了安全，不泄露帖子是否存在
          return next(new AppError('帖子不存在或无权限删除', 404));
        }

        // 缓存到 req
        req.post = post;
        req.circle = post.circle;

        // 根据权限类型进行检查
        let hasPermission = false;

        switch (permission) {
          case 'author':
            // 只有作者本人
            hasPermission = post.author.toString() === userId.toString();
            if (!hasPermission) {
              // 对于删除操作，为了安全返回404，隐藏帖子的存在
              return next(new AppError('帖子不存在或无权限删除', 404));
            }
            break;

          case 'access':
            // 可以访问帖子（必须有权访问帖子所在的朋友圈）
            if (!post.circle) {
              return next(new AppError('帖子所属朋友圈不存在', 404));
            }
            const postInviteCode = req.query.inviteCode;
            hasPermission = post.circle.isPublic || 
                           post.circle.hasAnyRole(userId) || 
                           post.circle.isValidInviteCode(postInviteCode);
            if (!hasPermission) {
              return next(new AppError('无权访问此帖子', 403));
            }
            break;

          default:
            return next(new AppError('未知的权限类型', 500));
        }

        next();

      } else {
        return next(new AppError('未知的资源类型', 500));
      }

    } catch (error) {
      next(error);
    }
  };
}

/**
 * 批量权限检查（用于需要检查多个权限的场景）
 * 
 * @param {Array} checks - 权限检查数组
 * @returns {Function} Express 中间件函数
 * 
 * 使用示例：
 * requireMultiplePermissions([
 *   { resource: 'circle', permission: 'member' },
 *   { resource: 'post', permission: 'author' }
 * ])
 */
function requireMultiplePermissions(checks) {
  return async (req, res, next) => {
    try {
      for (const check of checks) {
        await new Promise((resolve, reject) => {
          requirePermission(check.resource, check.permission)(req, res, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  requirePermission,
  requireMultiplePermissions
};

