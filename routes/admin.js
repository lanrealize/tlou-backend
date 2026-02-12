const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { checkOpenid } = require('../middleware/openidAuth');
const { checkAdmin } = require('../middleware/adminAuth');
const { 
  createVirtualUser, 
  getVirtualUsers, 
  deleteVirtualUser,
  updateVirtualUser 
} = require('../controllers/virtualUser.controller');
const { catchAsync, AppError } = require('../utils/errorHandler');
const User = require('../models/User');
const TempUser = require('../models/TempUser');

// 所有管理员路由都需要先验证openid，再验证管理员权限
router.use(checkOpenid);
router.use(checkAdmin);

// 创建虚拟用户
router.post('/virtual-users', [
  body('username')
    .notEmpty()
    .withMessage('用户名不能为空')
    .isLength({ min: 1, max: 20 })
    .withMessage('用户名长度必须在1-20字符之间'),
  body('avatar')
    .notEmpty()
    .withMessage('头像不能为空')
    .isURL()
    .withMessage('头像必须是有效的URL')
], catchAsync(createVirtualUser));

// 获取虚拟用户列表
router.get('/virtual-users', catchAsync(getVirtualUsers));

// 更新虚拟用户
router.put('/virtual-users/:userOpenid', [
  param('userOpenid')
    .notEmpty()
    .withMessage('用户openid不能为空'),
  body('username')
    .optional()
    .isLength({ min: 1, max: 20 })
    .withMessage('用户名长度必须在1-20字符之间'),
  body('avatar')
    .optional()
    .isURL()
    .withMessage('头像必须是有效的URL')
], catchAsync(updateVirtualUser));

// 删除虚拟用户
router.delete('/virtual-users/:userOpenid', [
  param('userOpenid')
    .notEmpty()
    .withMessage('用户openid不能为空')
], catchAsync(deleteVirtualUser));

// 重置用户配额
router.post('/reset-quota/:openid', [
  param('openid')
    .notEmpty()
    .withMessage('openid不能为空')
], catchAsync(async (req, res) => {
  const { openid } = req.params;
  
  // 先查找真实用户
  let user = await User.findById(openid);
  if (user) {
    // 重置真实用户配额
    user.discoverQuota.count = 0;
    user.discoverQuota.lastDate = '';
    await user.save();
    
    return res.json({
      success: true,
      message: '真实用户配额已重置',
      data: {
        openid,
        userType: 'User',
        quota: user.discoverQuota
      }
    });
  }
  
  // 查找临时用户
  let tempUser = await TempUser.findById(openid);
  if (tempUser) {
    // 重置临时用户配额
    tempUser.discoverQuota.count = 0;
    tempUser.discoverQuota.lastDate = '';
    await tempUser.save();
    
    return res.json({
      success: true,
      message: '临时用户配额已重置',
      data: {
        openid,
        userType: 'TempUser',
        quota: tempUser.discoverQuota
      }
    });
  }
  
  // 用户不存在
  throw new AppError('用户不存在', 404);
}));

module.exports = router;