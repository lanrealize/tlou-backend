const User = require('../models/User');

/**
 * 可选认证中间件
 * 如果提供了openid，则验证并加载用户信息
 * 如果没有提供openid，则允许请求继续，但req.user为undefined
 * 适用于既支持已登录用户也支持未登录用户的接口
 */
async function optionalAuth(req, res, next) {
  try {
    // 支持多种方式传递openid
    const openid = req.body.openid || req.query.openid || req.headers['x-openid'];
    
    // 如果没有提供openid，允许请求继续（作为未登录用户）
    if (!openid) {
      console.log('ℹ️ 未提供openid，作为未登录用户继续');
      req.user = undefined;
      return next();
    }

    // 如果提供了openid，尝试验证
    const user = await User.findOne({ openid });
    
    if (!user) {
      console.log('⚠️ 提供的openid无效，作为未登录用户继续');
      req.user = undefined;
      return next();
    }
    
    // 用户验证成功
    console.log('✅ 用户认证成功:', user._id);
    req.user = user;
    next();
  } catch (error) {
    console.error('可选认证中间件出错:', error);
    // 即使出错，也允许请求继续（作为未登录用户）
    req.user = undefined;
    next();
  }
}

module.exports = {
  optionalAuth
};

