const express = require('express');
const router = express.Router();
const { getOpenid, getUserInfo, registerUser, deleteUser } = require('../controllers/wechatAuth');
const { checkOpenid } = require('../middleware/openidAuth');
const { catchAsync } = require('../utils/errorHandler');

// 1. 接收code，返回openid
router.post('/get-openid', catchAsync(getOpenid));

// 2. 接收openid，查找用户信息
router.post('/get-user-info', catchAsync(getUserInfo));

// 3. 注册新用户
router.post('/register', catchAsync(registerUser));

// 4. 注销用户（需要认证）
router.delete('/delete-account', checkOpenid, catchAsync(deleteUser));

module.exports = router; 