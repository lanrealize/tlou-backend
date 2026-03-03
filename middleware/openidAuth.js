const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');

// 验证openid的中间件（仅限已存在的User）
async function checkOpenid(req, res, next) {
  try {
    const openid = req.body.openid || req.query.openid || req.headers['x-openid'];
    console.log('[checkOpenid] path:', req.path, 'openid:', openid);

    if (!openid) {
      return next(new AppError('缺少openid参数', 401));
    }

    const user = await User.findByIdAndUpdate(
      openid,
      { $setOnInsert: { _id: openid } },
      { upsert: true, new: true }
    );

    req.user = user;
    next();
  } catch (error) {
    console.error('验证openid失败:', error);
    next(new AppError('验证openid失败', 500));
  }
}

module.exports = { checkOpenid };
