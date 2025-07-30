const axios = require("axios");
const User = require("../models/User");
const { AppError } = require("../utils/errorHandler");

async function login(req, res) {
  const url =
    "https://api.weixin.qq.com/sns/jscode2session?appid=" +
    process.env.APP_ID +
    "&secret=" +
    process.env.APP_SECRET +
    "&js_code=" +
    req.body.code +
    "&grant_type=authorization_code";

  try {
    const response = await axios.get(url);
    console.log(`获取openID成功`);
    const session = response.data;
    
    if (session.errcode) {
      console.error('微信API返回错误:', session);
      return res.status(400).json({
        status: 'fail',
        message: '微信登录失败: ' + session.errmsg
      });
    }

    const wxUser = { openID: session.openid };
    
    try {
      const user = await User.findOne({ openid: wxUser.openID });
      
      if (user == null) {
        // 创建新用户
        const newUser = await User.create({ 
          openid: wxUser.openID,
          username: `用户${wxUser.openID.slice(-6)}`, // 生成默认用户名
          avatar: '' // 默认空头像
        });
        
        console.log(`创建用户成功`);
        
        return res.status(201).json({ 
          success: true,
          message: '用户创建成功',
          data: {
            user: {
              _id: newUser._id,
              openid: newUser.openid,
              username: newUser.username,
              avatar: newUser.avatar
            },
            openid: newUser.openid  // 直接返回openid
          }
        });
      } else {
        // 用户已存在
        return res.status(200).json({
          success: true,
          message: '登录成功',
          data: {
            user: {
              _id: user._id,
              openid: user.openid,
              username: user.username,
              avatar: user.avatar
            },
            openid: user.openid  // 直接返回openid
          }
        });
        console.log(`登录成功`);
      }
    } catch (dbError) {
      console.error('数据库操作失败:', dbError);
      return res.status(500).json({
        status: 'error',
        message: '数据库操作失败'
      });
    }
  } catch (apiError) {
    console.error('微信API请求失败:', apiError);
    return res.status(500).json({
      status: 'error',
      message: '微信服务请求失败'
    });
  }
}

module.exports = {
  login: login
}; 