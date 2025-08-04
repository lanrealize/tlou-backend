const User = require('../models/User');
const { AppError } = require('../utils/errorHandler');
const { v4: uuidv4 } = require('uuid');

// 生成虚拟openid
function generateVirtualOpenid() {
  return `virtual_${uuidv4().replace(/-/g, '')}`;
}

// 创建虚拟用户
async function createVirtualUser(req, res) {
  const { username, avatar, description } = req.body;
  
  try {
    if (!username || !avatar) {
      return res.status(400).json({
        success: false,
        message: 'username和avatar参数都是必需的'
      });
    }

    // 获取有效的管理员（真实管理员或虚拟用户的创建者）
    const effectiveAdmin = req.effectiveAdmin || req.user;

    // 生成虚拟openid
    let virtualOpenid;
    let isUnique = false;
    
    // 确保生成的虚拟openid唯一
    while (!isUnique) {
      virtualOpenid = generateVirtualOpenid();
      const existing = await User.findOne({ openid: virtualOpenid });
      if (!existing) {
        isUnique = true;
      }
    }

    // 创建虚拟用户，使用有效管理员作为拥有者
    // 所有虚拟用户都设为管理员，简化权限判断逻辑
    const virtualUser = await User.create({
      username,
      openid: virtualOpenid,
      avatar,
      isVirtual: true,
      isAdmin: true,  // 虚拟用户直接设为管理员
      virtualOwner: effectiveAdmin._id  // 使用有效管理员作为虚拟用户的拥有者
    });

    console.log(`${req.user.isVirtual ? '虚拟用户' : '管理员'} ${req.user.username} 创建虚拟用户成功: ${username} (有效管理员: ${effectiveAdmin.username})`);
    
    res.status(201).json({
      success: true,
      message: '虚拟用户创建成功',
      data: {
        user: {
          _id: virtualUser._id,
          username: virtualUser.username,
          openid: virtualUser.openid,
          avatar: virtualUser.avatar,
          isVirtual: virtualUser.isVirtual,
          isAdmin: virtualUser.isAdmin,
          createdAt: virtualUser.createdAt
        }
      }
    });
  } catch (error) {
    console.error('创建虚拟用户失败:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: '用户名已存在'
      });
    }
    
    res.status(500).json({
      success: false,
      message: '创建虚拟用户失败'
    });
  }
}

// 获取管理员的虚拟用户列表
async function getVirtualUsers(req, res) {
  try {
    // 获取有效的管理员（真实管理员或虚拟用户的创建者）
    const effectiveAdmin = req.effectiveAdmin || req.user;
    
    const virtualUsers = await User.find({
      virtualOwner: effectiveAdmin._id,
      isVirtual: true
    }).select('_id username openid avatar isAdmin createdAt').sort({ createdAt: -1 });

    res.json({
      success: true,
      message: '获取虚拟用户列表成功',
      data: {
        users: virtualUsers,
        total: virtualUsers.length,
        effectiveAdmin: {
          _id: effectiveAdmin._id,
          username: effectiveAdmin.username,
          isCurrentUserVirtual: req.user.isVirtual || false
        }
      }
    });
  } catch (error) {
    console.error('获取虚拟用户列表失败:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: '获取虚拟用户列表失败'
    });
  }
}

// 删除虚拟用户
async function deleteVirtualUser(req, res) {
  const { userId } = req.params;
  
  try {
    // 获取有效的管理员（真实管理员或虚拟用户的创建者）
    const effectiveAdmin = req.effectiveAdmin || req.user;
    
    const virtualUser = await User.findOne({
      _id: userId,
      virtualOwner: effectiveAdmin._id,
      isVirtual: true
    });

    if (!virtualUser) {
      return res.status(404).json({
        success: false,
        message: '虚拟用户不存在或无权限删除'
      });
    }

    await User.findByIdAndDelete(userId);
    
    console.log(`${req.user.isVirtual ? '虚拟用户' : '管理员'} ${req.user.username} 删除虚拟用户: ${virtualUser.username} (有效管理员: ${effectiveAdmin.username})`);
    
    res.json({
      success: true,
      message: '虚拟用户删除成功'
    });
  } catch (error) {
    console.error('删除虚拟用户失败:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: '删除虚拟用户失败'
    });
  }
}

// 更新虚拟用户信息
async function updateVirtualUser(req, res) {
  const { userId } = req.params;
  const { username, avatar } = req.body;
  
  try {
    // 获取有效的管理员（真实管理员或虚拟用户的创建者）
    const effectiveAdmin = req.effectiveAdmin || req.user;
    
    const virtualUser = await User.findOne({
      _id: userId,
      virtualOwner: effectiveAdmin._id,
      isVirtual: true
    });

    if (!virtualUser) {
      return res.status(404).json({
        success: false,
        message: '虚拟用户不存在或无权限修改'
      });
    }

    // 更新用户信息
    const updateData = {};
    if (username) updateData.username = username;
    if (avatar) updateData.avatar = avatar;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('_id username openid avatar isAdmin createdAt updatedAt');
    
    console.log(`${req.user.isVirtual ? '虚拟用户' : '管理员'} ${req.user.username} 更新虚拟用户: ${updatedUser.username} (有效管理员: ${effectiveAdmin.username})`);
    
    res.json({
      success: true,
      message: '虚拟用户更新成功',
      data: {
        user: updatedUser
      }
    });
  } catch (error) {
    console.error('更新虚拟用户失败:', error);
    
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: '用户名已存在'
      });
    }
    
    res.status(500).json({
      success: false,
      message: '更新虚拟用户失败'
    });
  }
}

module.exports = {
  createVirtualUser,
  getVirtualUsers,
  deleteVirtualUser,
  updateVirtualUser
};