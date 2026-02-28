const axios = require("axios");
const User = require("../models/User");
const Circle = require("../models/Circle");
const Post = require("../models/Post");
const { cleanupUserData } = require("../utils/memberCleanup");
const { AppError } = require("../utils/errorHandler");

// 1. 接收code，换openid，并 upsert 一条空 User 记录
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
    const session = response.data;

    if (session.errcode) {
      console.error('微信API返回错误:', session);
      return res.status(400).json({
        success: false,
        message: '微信登录失败: ' + session.errmsg
      });
    }

    const openid = session.openid;

    // upsert：第一次进入时建空User，后续进入直接跳过
    await User.findOneAndUpdate(
      { _id: openid },
      { $setOnInsert: { _id: openid } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`获取openID成功: ${openid}`);

    return res.status(200).json({
      success: true,
      message: '获取openid成功',
      data: { openid }
    });
  } catch (apiError) {
    console.error('微信API请求失败:', apiError);
    return res.status(500).json({
      success: false,
      message: '微信服务请求失败'
    });
  }
}

// 2. 接收openid，返回用户信息（User 必然存在，因为 get-openid 时已 upsert）
async function getUserInfo(req, res) {
  const { openid } = req.body;

  if (!openid) {
    return res.status(400).json({
      success: false,
      message: 'openid参数是必需的'
    });
  }

  try {
    const user = await User.findById(openid);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    return res.status(200).json({
      success: true,
      message: '获取用户信息成功',
      data: {
        user: {
          _id: user._id,
          username: user.username,
          avatar: user.avatar,
          isAdmin: user.isAdmin,
          isProfileComplete: !!(user.username && user.avatar)
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

// 3. 完善用户资料（首次填写 username 和 avatar）
async function completeProfile(req, res) {
  const { openid, username, avatar } = req.body;

  if (!openid || !username || !avatar) {
    return res.status(400).json({
      success: false,
      message: 'openid、username和avatar参数都是必需的'
    });
  }

  try {
    const user = await User.findById(openid);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    if (user.username && user.avatar) {
      return res.status(409).json({
        success: false,
        message: '用户资料已完善，请勿重复提交'
      });
    }

    user.username = username;
    user.avatar = avatar;
    await user.save();

    console.log(`用户资料完善成功: ${openid}`);

    return res.status(200).json({
      success: true,
      message: '用户资料完善成功',
      data: {
        user: {
          _id: user._id,
          username: user.username,
          avatar: user.avatar,
          isAdmin: user.isAdmin,
          isProfileComplete: true
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

// 4. 注销用户（删除用户及其所有相关数据）
async function deleteUser(req, res) {
  try {
    const userId = req.user._id;
    const user = req.user;

    // 保护主账号不被删除
    const PROTECTED_OPENID = 'o4Y5CvoRL1Oodi_q7jWWrsMyqMIo';
    if (user._id === PROTECTED_OPENID) {
      console.log(`阻止删除受保护的主账号: ${user.username} (${user._id})`);
      return res.status(403).json({
        success: false,
        message: '该账号为系统主账号，无法注销'
      });
    }

    console.log(`用户 ${user.username} (${userId}) 开始注销流程`);

    const summary = await cleanupUserData(userId, {
      deleteQiniuImages: true,
      deleteVirtualUsers: user.isAdmin
    });

    await User.findByIdAndDelete(userId);
    console.log(`用户 ${user.username} 注销成功`);

    return res.json({
      success: true,
      message: '账号注销成功，所有相关数据已清除',
      data: { summary }
    });
  } catch (error) {
    console.error('用户注销失败:', error);

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: '注销失败，请稍后重试'
    });
  }
}

module.exports = {
  getOpenid,
  getUserInfo,
  completeProfile,
  deleteUser
};
