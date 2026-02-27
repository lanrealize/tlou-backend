const User = require('../models/User');
const TempUser = require('../models/TempUser');
const { AppError } = require('../utils/errorHandler');

// 验证openid的中间件（仅限已注册用户）
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

// 验证openid的中间件（兼容已注册用户和临时用户）
// req.user = User 或 TempUser 实例
// req.isTemp = true 表示临时用户
// options.autoCreate = true 时，openid 不存在则自动创建 TempUser（用于 random 等场景）
async function checkTempOpenid(req, res, next, options = {}) {
  try {
    const openid = req.body.openid || req.query.openid || req.headers['x-openid'];

    if (!openid) {
      return next(new AppError('缺少openid参数', 401));
    }

    // 先查已注册用户
    const user = await User.findById(openid);
    if (user) {
      req.user = user;
      req.isTemp = false;
      return next();
    }

    // 再查临时用户
    let tempUser = await TempUser.findById(openid);
    if (!tempUser) {
      if (options.autoCreate) {
        tempUser = await TempUser.create({ _id: openid });
      } else {
        return next(new AppError('用户不存在或openid无效', 401));
      }
    }

    req.user = tempUser;
    req.isTemp = true;
    return next();
  } catch (error) {
    console.error('验证openid失败:', error);
    next(new AppError('验证openid失败', 500));
  }
}

// 自动创建临时用户的版本（用于 random 等无需预注册的场景）
function checkTempOpenidAutoCreate(req, res, next) {
  return checkTempOpenid(req, res, next, { autoCreate: true });
}

module.exports = {
  checkOpenid,
  checkTempOpenid,
  checkTempOpenidAutoCreate
};