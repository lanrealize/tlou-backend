const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');

// 验证openid的中间件（仅限已存在的User）
async function checkOpenid(req, res, next) {
  try {
    const openid = req.body.openid || req.query.openid || req.headers['x-openid'];

    if (!openid) {
      return next(new AppError('缺少openid参数', 401));
    }

    const user = await User.findById(openid);

    if (!user) {
      return next(new AppError('用户不存在或openid无效', 401));
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('验证openid失败:', error);
    next(new AppError('验证openid失败', 500));
  }
}

module.exports = { checkOpenid };
