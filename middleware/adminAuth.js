const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');

/**
 * 检查管理员权限的通用函数（简化版）
 * 简化逻辑：所有虚拟用户都是管理员
 * @param {string} openid - 用户的openid
 * @returns {Object} { hasPermission: boolean, user: User|null, effectiveAdmin: User|null }
 */
async function checkAdminPermission(openid) {
  try {
    const user = await User.findOne({ openid });
    
    if (!user) {
      return { hasPermission: false, user: null, effectiveAdmin: null };
    }
    
    // 简化逻辑：直接检查 isAdmin 字段
    if (user.isAdmin) {
      return { hasPermission: true, user, effectiveAdmin: user };
    }
    
    return { hasPermission: false, user, effectiveAdmin: null };
  } catch (error) {
    console.error('检查管理员权限失败:', error);
    return { hasPermission: false, user: null, effectiveAdmin: null };
  }
}

// 验证管理员权限的中间件
async function checkAdmin(req, res, next) {
  try {
    // 先验证基本的openid（复用现有中间件的结果）
    if (!req.user) {
      return next(new AppError('用户未认证', 401));
    }

    // 使用简化的权限检查逻辑
    const { hasPermission, user, effectiveAdmin } = await checkAdminPermission(req.user.openid);
    
    if (!hasPermission) {
      return next(new AppError('需要管理员权限', 403));
    }

    // 将有效的管理员信息附加到请求对象（现在就是用户自己）
    req.effectiveAdmin = effectiveAdmin;
    
    // 如果是虚拟用户，记录日志
    if (user.isVirtual) {
      console.log(`虚拟管理员 ${user.username} 执行管理员操作`);
    }

    next();
  } catch (error) {
    console.error('验证管理员权限失败:', error);
    next(new AppError('验证管理员权限失败', 500));
  }
}

module.exports = {
  checkAdmin,
  checkAdminPermission
};