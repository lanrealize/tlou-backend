const express = require('express');
const router = express.Router();
const { getOpenid, getUserInfo, registerUser } = require('../controllers/wechatAuth');
const { catchAsync } = require('../utils/errorHandler');

// 1. 接收code，返回openid
router.post('/get-openid', catchAsync(getOpenid));

// 2. 接收openid，查找用户信息
router.post('/get-user-info', catchAsync(getUserInfo));

// 3. 注册新用户
router.post('/register', catchAsync(registerUser));

module.exports = router; 