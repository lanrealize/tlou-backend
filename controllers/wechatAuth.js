const axios = require("axios");
const User = require("../models/User");

// 1. 接收code，返回openid
async function getOpenid(req, res) {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'code参数是必需的'
    });
  }

  const url =
    "https://api.weixin.qq.com/sns/jscode2session?appid=" +
    process.env.APP_ID +
    "&secret=" +
    process.env.APP_SECRET +
    "&js_code=" +
    code +
    "&grant_type=authorization_code";

  try {
    const response = await axios.get(url);
    console.log(`获取openID成功`);
    const session = response.data;
    
    if (session.errcode) {
      console.error('微信API返回错误:', session);
      return res.status(400).json({
        success: false,
        message: '微信登录失败: ' + session.errmsg
      });
    }

    return res.status(200).json({
      success: true,
      message: '获取openid成功',
      data: {
        openid: session.openid
      }
    });
  } catch (apiError) {
    console.error('微信API请求失败:', apiError);
    return res.status(500).json({
      success: false,
      message: '微信服务请求失败'
    });
  }
}

// 2. 接收openid，查找用户信息
async function getUserInfo(req, res) {
  const { openid } = req.body;
  
  if (!openid) {
    return res.status(400).json({
      success: false,
      message: 'openid参数是必需的'
    });
  }

  try {
    const user = await User.findOne({ openid });
    
    if (!user) {
      return res.status(200).json({
        success: true,
        message: '用户不存在',
        data: null
      });
    }

    return res.status(200).json({
      success: true,
      message: '获取用户信息成功',
      data: {
        user: {
          _id: user._id,
          openid: user.openid,
          username: user.username,
          avatar: user.avatar
        }
      }
    });
  } catch (dbError) {
    console.error('数据库操作失败:', dbError);
    return res.status(500).json({
      success: false,
      message: '数据库操作失败'
    });
  }
}

// 3. 注册接口，创建新用户
async function registerUser(req, res) {
  const { openid, username, avatar } = req.body;
  
  // 检查必需参数
  if (!openid || !username || !avatar) {
    return res.status(400).json({
      success: false,
      message: 'openid、username和avatar参数都是必需的'
    });
  }

  try {
    // 检查用户是否已存在
    const existingUser = await User.findOne({ openid });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: '用户已存在'
      });
    }

    // 创建新用户
    const newUser = await User.create({
      openid,
      username,
      avatar
    });

    console.log(`创建用户成功: ${openid}`);
    
    return res.status(201).json({
      success: true,
      message: '用户注册成功',
      data: {
        user: {
          _id: newUser._id,
          openid: newUser.openid,
          username: newUser.username,
          avatar: newUser.avatar
        }
      }
    });
  } catch (dbError) {
    console.error('数据库操作失败:', dbError);
    
    // 处理唯一性约束错误
    if (dbError.code === 11000) {
      return res.status(409).json({
        success: false,
        message: '用户名或openid已存在'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: '数据库操作失败'
    });
  }
}

module.exports = {
  getOpenid,
  getUserInfo,
  registerUser
}; 