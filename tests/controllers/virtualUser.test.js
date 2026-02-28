const User = require('../../models/User');
const Circle = require('../../models/Circle');
const Post = require('../../models/Post');
const { 
  createVirtualUser, 
  getVirtualUsers, 
  deleteVirtualUser,
  updateVirtualUser 
} = require('../../controllers/virtualUser.controller');

// Mock express validation middleware
jest.mock('express-validator', () => ({
  validationResult: jest.fn(() => ({
    isEmpty: () => true,
    array: () => []
  }))
}));

// Mock UUID generation for faster tests
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'a1b2c3d4-e5f6-7890-1234-567890abcdef')
}));

describe('Virtual User Controller', () => {
  let adminUser;
  let testUser;
  let virtualUser;

  beforeEach(async () => {
    // 创建管理员用户
    adminUser = await User.create({
      _id: 'admin_openid_456',  // openid作为主键
      username: 'admin',
      avatar: 'https://example.com/admin-avatar.jpg',
      isAdmin: true
    });

    // 创建普通用户
    testUser = await User.create({
      _id: 'test_openid_123',  // openid作为主键
      username: 'testuser',
      avatar: 'https://example.com/avatar.jpg',
      isAdmin: false
    });
  });

  describe('createVirtualUser', () => {
    test('should create virtual user successfully', async () => {
      const req = {
        user: adminUser,
        body: {
          username: '虚拟小美',
          avatar: 'https://example.com/virtual-avatar.jpg'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await createVirtualUser(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: '虚拟用户创建成功',
          data: expect.objectContaining({
            user: expect.objectContaining({
              username: '虚拟小美',
              avatar: 'https://example.com/virtual-avatar.jpg',
              isVirtual: true
            })
          })
        })
      );

      // 验证openid格式
      const call = res.json.mock.calls[0][0];
      expect(call.data.user._id).toMatch(/^virtual_[a-f0-9]{32}$/);
    });

    test('should validate required fields', async () => {
      const req = {
        user: adminUser,
        body: {
          username: '虚拟小美'
          // 缺少avatar
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await createVirtualUser(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'username和avatar参数都是必需的'
      });
    });

    test('should handle duplicate username', async () => {
      // 先创建一个虚拟用户
      await User.create({
        _id: 'virtual_123456789012345678901234567890ab',  // openid作为主键
        username: '虚拟小美',
        avatar: 'https://example.com/avatar1.jpg',
        isVirtual: true,
        virtualOwner: adminUser._id
      });

      const req = {
        user: adminUser,
        body: {
          username: '虚拟小美',
          avatar: 'https://example.com/avatar2.jpg'
        }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await createVirtualUser(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '用户名已存在'
      });
    });
  });

  describe('getVirtualUsers', () => {
    beforeEach(async () => {
      // 创建虚拟用户
      virtualUser = await User.create({
        _id: 'virtual_123456789012345678901234567890ab',  // openid作为主键
        username: '虚拟小美',
        avatar: 'https://example.com/virtual-avatar.jpg',
        isVirtual: true,
        virtualOwner: adminUser._id
      });
    });

    test('should get virtual users list', async () => {
      const req = { user: adminUser };
      const res = { 
        status: jest.fn().mockReturnThis(),
        json: jest.fn() 
      };

      await getVirtualUsers(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: '获取虚拟用户列表成功',
        data: {
          users: expect.arrayContaining([
            expect.objectContaining({
              username: '虚拟小美',
              _id: virtualUser._id,  // _id就是openid
              avatar: virtualUser.avatar
            })
          ]),
          total: 1,
          effectiveAdmin: expect.objectContaining({
            _id: adminUser._id,
            username: adminUser.username,
            isCurrentUserVirtual: false
          })
        }
      });
    });

    test('should return empty list when no virtual users', async () => {
      // 删除虚拟用户
      await User.findByIdAndDelete(virtualUser._id);

      const req = { user: adminUser };
      const res = { 
        status: jest.fn().mockReturnThis(),
        json: jest.fn() 
      };

      await getVirtualUsers(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: '获取虚拟用户列表成功',
        data: {
          users: [],
          total: 0,
          effectiveAdmin: expect.objectContaining({
            _id: adminUser._id,
            username: adminUser.username,
            isCurrentUserVirtual: false
          })
        }
      });
    });
  });

  describe('updateVirtualUser', () => {
    beforeEach(async () => {
      virtualUser = await User.create({
        _id: 'virtual_123456789012345678901234567890ab',  // openid作为主键
        username: '虚拟小美',
        avatar: 'https://example.com/virtual-avatar.jpg',
        isVirtual: true,
        virtualOwner: adminUser._id
      });
    });

    test('should update virtual user successfully', async () => {
      const req = {
        user: adminUser,
        params: { userOpenid: virtualUser._id },  // 使用userOpenid参数
        body: {
          username: '虚拟小丽',
          avatar: 'https://example.com/new-avatar.jpg'
        }
      };

      const res = { 
        status: jest.fn().mockReturnThis(),
        json: jest.fn() 
      };

      await updateVirtualUser(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: '虚拟用户更新成功',
        data: {
          user: expect.objectContaining({
            username: '虚拟小丽',
            avatar: 'https://example.com/new-avatar.jpg'
          })
        }
      });

      // 验证数据库中的更新
      const updatedUser = await User.findById(virtualUser._id);
      expect(updatedUser.username).toBe('虚拟小丽');
      expect(updatedUser.avatar).toBe('https://example.com/new-avatar.jpg');
    });

    test('should return 404 for non-existent virtual user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      
      const req = {
        user: adminUser,
        params: { userId: fakeId },
        body: { username: '新名字' }
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await updateVirtualUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '虚拟用户不存在或无权限修改'
      });
    });
  });

  describe('deleteVirtualUser', () => {
    beforeEach(async () => {
      virtualUser = await User.create({
        _id: 'virtual_123456789012345678901234567890ab',  // openid作为主键
        username: '虚拟小美',
        avatar: 'https://example.com/virtual-avatar.jpg',
        isVirtual: true,
        virtualOwner: adminUser._id
      });
    });

    test('should delete virtual user successfully', async () => {
      const req = {
        user: adminUser,
        params: { userOpenid: virtualUser._id }
      };

      const res = { 
        status: jest.fn().mockReturnThis(),
        json: jest.fn() 
      };

      await deleteVirtualUser(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: '虚拟用户删除成功，所有相关数据已清除',
          data: expect.objectContaining({
            summary: expect.any(Object)
          })
        })
      );

      // 验证用户已被删除
      const deletedUser = await User.findById(virtualUser._id);
      expect(deletedUser).toBeNull();
    });

    test('should delete virtual user and cleanup all related data', async () => {
      // 创建虚拟用户创建的圈子
      const createdCircle = await Circle.create({
        name: '虚拟用户的圈子',
        creator: virtualUser._id,
        members: [adminUser._id],
        isPublic: false
      });

      // 创建其他用户的圈子，虚拟用户作为成员
      const otherCircle = await Circle.create({
        name: '其他用户的圈子',
        creator: adminUser._id,
        members: [virtualUser._id],
        isPublic: false
      });

      // 在虚拟用户创建的圈子中创建帖子
      const postInCreatedCircle = await Post.create({
        author: adminUser._id,
        circle: createdCircle._id,
        content: '管理员在虚拟用户圈子的帖子',
        images: []
      });

      // 在其他圈子中创建虚拟用户的帖子
      const postByVirtualUser = await Post.create({
        author: virtualUser._id,
        circle: otherCircle._id,
        content: '虚拟用户的帖子',
        images: []
      });

      // 先创建其他人的帖子
      const otherPost = await Post.create({
        author: adminUser._id,
        circle: otherCircle._id,
        content: '管理员的帖子',
        likes: [virtualUser._id],
        images: []
      });
      
      // 使用updateOne添加评论，避免ObjectId问题
      await Post.updateOne(
        { _id: otherPost._id },
        {
          $push: {
            comments: {
              author: virtualUser._id,
              content: '虚拟用户的评论'
            }
          }
        }
      );

      const req = {
        user: adminUser,
        params: { userOpenid: virtualUser._id }
      };

      const res = { 
        status: jest.fn().mockReturnThis(),
        json: jest.fn() 
      };

      await deleteVirtualUser(req, res);

      // 验证响应
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: '虚拟用户删除成功，所有相关数据已清除',
          data: expect.objectContaining({
            summary: expect.objectContaining({
              deletedCircles: 1
            })
          })
        })
      );

      // 验证虚拟用户已被删除
      const deletedUser = await User.findById(virtualUser._id);
      expect(deletedUser).toBeNull();

      // 验证虚拟用户创建的圈子已被删除
      const deletedCircle = await Circle.findById(createdCircle._id);
      expect(deletedCircle).toBeNull();

      // 验证虚拟用户创建的圈子中的帖子已被删除
      const deletedPost = await Post.findById(postInCreatedCircle._id);
      expect(deletedPost).toBeNull();
    });

    test('should return 404 for non-existent virtual user', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      
      const req = {
        user: adminUser,
        params: { userOpenid: fakeId }  // 修正参数名
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await deleteVirtualUser(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: '虚拟用户不存在或无权限删除'
      });
    });
  });
});