const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { checkOpenid } = require('../middleware/openidAuth');
const { checkAdmin } = require('../middleware/adminAuth');
const { checkAvatarMiddleware } = require('../middleware/imageCheck');
const { 
  createVirtualUser, 
  getVirtualUsers, 
  deleteVirtualUser,
  updateVirtualUser 
} = require('../controllers/virtualUser.controller');
const { catchAsync } = require('../utils/errorHandler');

// 所有管理员路由都需要先验证openid，再验证管理员权限
router.use(checkOpenid);
router.use(checkAdmin);

// 创建虚拟用户（添加头像内容检测）
router.post('/virtual-users', 
  checkAvatarMiddleware,
  [
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
  ], 
  catchAsync(createVirtualUser)
);

// 获取虚拟用户列表
router.get('/virtual-users', catchAsync(getVirtualUsers));

// 更新虚拟用户（添加头像内容检测）
router.put('/virtual-users/:userId', 
  checkAvatarMiddleware,
  [
    param('userId')
      .isMongoId()
      .withMessage('无效的用户ID'),
    body('username')
      .optional()
      .isLength({ min: 1, max: 20 })
      .withMessage('用户名长度必须在1-20字符之间'),
    body('avatar')
      .optional()
      .isURL()
      .withMessage('头像必须是有效的URL')
  ], 
  catchAsync(updateVirtualUser)
);

// 删除虚拟用户
router.delete('/virtual-users/:userId', [
  param('userId')
    .isMongoId()
    .withMessage('无效的用户ID')
], catchAsync(deleteVirtualUser));

module.exports = router;