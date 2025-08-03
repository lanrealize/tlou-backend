const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');

// 验证管理员权限的中间件
async function checkAdmin(req, res, next) {
  try {
    // 先验证基本的openid（复用现有中间件的结果）
    if (!req.user) {
      return next(new AppError('用户未认证', 401));
    }

    // 检查是否是管理员
    if (!req.user.isAdmin) {
      return next(new AppError('需要管理员权限', 403));
    }

    next();
  } catch (error) {
    console.error('验证管理员权限失败:', error);
    next(new AppError('验证管理员权限失败', 500));
  }
}

module.exports = {
  checkAdmin
};