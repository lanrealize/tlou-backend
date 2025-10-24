const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');

// 验证openid的中间件
async function checkOpenid(req, res, next) {
  try {
    // 支持多种方式传递openid
    const openid = req.body.openid || req.query.openid || req.headers['x-openid'];
    
    if (!openid) {
      return next(new AppError('缺少openid参数', 401));
    }

    // 验证openid是否存在（现在openid就是主键_id）
    const user = await User.findById(openid);
    
    if (!user) {
      return next(new AppError('用户不存在或openid无效', 401));
    }
    
    req.user = user;  // 将用户信息添加到请求对象
    next();
  } catch (error) {
    console.error('验证openid失败:', error);
    next(new AppError('验证openid失败', 500));
  }
}

module.exports = {
  checkOpenid
}; 