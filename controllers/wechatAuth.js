const axios = require("axios");
const User = require("../models/User");
const Circle = require("../models/Circle");
const Post = require("../models/Post");
const { cleanupUserInCircle, deletePostsWithImages } = require("../utils/memberCleanup");
const { AppError } = require("../utils/errorHandler");

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
          avatar: user.avatar,
          isAdmin: user.isAdmin
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
          avatar: newUser.avatar,
          isAdmin: newUser.isAdmin
        }
      }
    });
  } catch (dbError) {
    console.error('数据库操作失败:', dbError);
    
    // 处理唯一性约束错误
    if (dbError.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'openid已存在'
      });
    }
    
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
    const PROTECTED_OPENID = 'o4Y5CvoRL1Oodi_q7jWWrsMyqMIo'; // 孙鹏远的账号
    if (user.openid === PROTECTED_OPENID) {
      console.log(`🛡️  阻止删除受保护的主账号: ${user.username} (${user.openid})`);
      return res.status(403).json({
        success: false,
        message: '该账号为系统主账号，无法注销'
      });
    }

    console.log(`用户 ${user.username} (${userId}) 开始注销流程`);

    // 统计数据
    const summary = {
      deletedCircles: 0,
      leftCircles: 0,
      deletedPosts: 0,
      deletedComments: 0,
      removedLikes: 0,
      deletedVirtualUsers: 0
    };

    // 1. 获取用户创建的所有圈子
    const createdCircles = await Circle.find({ creator: userId });
    summary.deletedCircles = createdCircles.length;

    // 2. 获取用户所在的所有圈子（包括作为成员或申请者）
    const memberCircles = await Circle.find({
      $or: [
        { members: userId },
        { appliers: userId }
      ]
    });
    summary.leftCircles = memberCircles.length;

    // 3. 删除用户创建的所有圈子（及其所有帖子和图片）
    if (createdCircles.length > 0) {
      const createdCircleIds = createdCircles.map(c => c._id);
      
      // 使用辅助函数删除帖子并清理七牛云图片
      const deletedCount = await deletePostsWithImages(
        { circle: { $in: createdCircleIds } },
        true // 删除七牛云图片
      );
      summary.deletedPosts += deletedCount;
      
      // 删除圈子
      await Circle.deleteMany({ _id: { $in: createdCircleIds } });
      console.log(`删除了用户创建的 ${createdCircles.length} 个圈子及其 ${deletedCount} 个帖子`);
    }

    // 4. 对于用户是成员/申请者的圈子，调用 cleanupUserInCircle 清理
    for (const circle of memberCircles) {
      // 使用 deleteQiniuImages: true 自动删除七牛云图片
      const cleanupStats = await cleanupUserInCircle(userId, circle._id, { 
        deleteQiniuImages: true 
      });
      
      summary.deletedPosts += cleanupStats.deletedPosts;
      summary.deletedComments += cleanupStats.deletedComments;
      summary.removedLikes += cleanupStats.deletedLikes;
      
      // 从圈子的成员列表和申请列表中移除用户
      await Circle.findByIdAndUpdate(circle._id, {
        $pull: { 
          members: userId,
          appliers: userId
        }
      });
      
      // 更新成员统计
      const updatedCircle = await Circle.findById(circle._id);
      if (updatedCircle) {
        updatedCircle.updateMemberStats();
        await updatedCircle.save();
      }
    }

    console.log(`从 ${memberCircles.length} 个圈子中清理了用户数据`);

    // 5. 如果用户是管理员，删除其创建的虚拟用户
    if (user.isAdmin) {
      const deletedVirtualUsers = await User.deleteMany({ 
        virtualOwner: userId,
        isVirtual: true 
      });
      summary.deletedVirtualUsers = deletedVirtualUsers.deletedCount;
      console.log(`删除了用户创建的 ${deletedVirtualUsers.deletedCount} 个虚拟用户`);
    }

    // 6. 删除用户本身
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
  registerUser,
  deleteUser
}; 