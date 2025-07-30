const express = require('express');
const router = express.Router();
const { login } = require('../controllers/wechatAuth');
const { checkOpenid } = require('../middleware/openidAuth');
const { catchAsync, AppError } = require('../utils/errorHandler');
const User = require('../models/User');

// 微信小程序登录
router.post('/login', login);

// 需要认证的路由组
router.use('/protected', checkOpenid);

// 示例：获取用户信息（需要认证）
router.get('/protected/user-info', catchAsync(async (req, res) => {
  res.json({
    success: true,
    message: '获取用户信息成功',
    data: {
      user: {
        _id: req.user._id,
        openid: req.user.openid,
        username: req.user.username,
        avatar: req.user.avatar
      }
    }
  });
}));

// 示例：更新用户信息（需要认证）
router.put('/protected/user-info', catchAsync(async (req, res) => {
  const { username, avatar } = req.body;
  
  const updatedUser = await User.findByIdAndUpdate(req.user._id, {
    username: username || req.user.username,
    avatar: avatar || req.user.avatar
  }, { new: true });
  
  if (!updatedUser) {
    throw new AppError('用户不存在', 404);
  }
  
  res.json({
    success: true,
    message: '用户信息更新成功',
    data: {
      user: {
        _id: updatedUser._id,
        openid: updatedUser.openid,
        username: updatedUser.username,
        avatar: updatedUser.avatar
      }
    }
  });
}));

module.exports = router; 