const request = require('supertest');
const express = require('express');
const { createTestUser, createTestCircle, createTestPost } = require('../helpers/testUtils');
const { globalErrorHandler } = require('../../utils/errorHandler');

// 创建测试应用
const app = express();
app.use(express.json());

// 模拟路由
const circlesRoutes = require('../../routes/circles');
app.use('/api/circles', circlesRoutes);

// 添加错误处理中间件
app.use(globalErrorHandler);

describe('Circles Routes Test', () => {
  let testUser, testCircle;

  beforeEach(async () => {
    testUser = await createTestUser();
    testCircle = await createTestCircle({}, testUser);
  });

  describe('POST /api/circles', () => {
    test('should create circle with valid data', async () => {
      const circleData = {
        name: '测试朋友圈',
        isPublic: true,
        openid: testUser.openid
      };

      const response = await request(app)
        .post('/api/circles')
        .send(circleData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        message: '朋友圈创建成功',
        data: {
          circle: expect.objectContaining({
            name: '测试朋友圈',
            isPublic: true,
            creator: expect.objectContaining({
              _id: testUser._id.toString(),
              username: testUser.username
            }),
            members: [testUser._id.toString()]
          })
        }
      });
    });

    test('should return 400 when name is missing', async () => {
      const circleData = {
        isPublic: true,
        openid: testUser.openid
      };

      const response = await request(app)
        .post('/api/circles')
        .send(circleData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '输入验证失败: 朋友圈名称不能为空'
      });
    });

    test('should return 401 when openid is missing', async () => {
      const circleData = {
        name: '测试朋友圈',
        isPublic: true
      };

      const response = await request(app)
        .post('/api/circles')
        .send(circleData)
        .expect(401);

      expect(response.body).toEqual({
        status: 'fail',
        message: '缺少openid参数'
      });
    });

    test('should return 401 when openid is invalid', async () => {
      const circleData = {
        name: '测试朋友圈',
        isPublic: true,
        openid: 'invalid_openid'
      };

      const response = await request(app)
        .post('/api/circles')
        .send(circleData)
        .expect(401);

      expect(response.body).toEqual({
        status: 'fail',
        message: '用户不存在或openid无效'
      });
    });
  });

  describe('GET /api/circles/my', () => {
    test('should return user circles with latest posts', async () => {
      // 创建另一个朋友圈
      const anotherCircle = await createTestCircle({
        name: '另一个朋友圈'
      }, testUser);

      // 创建一些帖子
      await createTestPost({}, testUser, testCircle);
      await createTestPost({}, testUser, anotherCircle);

      const response = await request(app)
        .get('/api/circles/my')
        .query({ openid: testUser.openid })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          circles: expect.arrayContaining([
            expect.objectContaining({
              name: testCircle.name,
              creator: expect.objectContaining({
                username: testUser.username
              }),
              latestPost: expect.any(Object)
            }),
            expect.objectContaining({
              name: anotherCircle.name,
              creator: expect.objectContaining({
                username: testUser.username
              }),
              latestPost: expect.any(Object)
            })
          ])
        }
      });
    });

    test('should return empty array when user has no circles', async () => {
      const newUser = await createTestUser();

      const response = await request(app)
        .get('/api/circles/my')
        .query({ openid: newUser.openid })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          circles: []
        }
      });
    });

    test('should return 401 when openid is missing', async () => {
      const response = await request(app)
        .get('/api/circles/my')
        .expect(401);

      expect(response.body).toEqual({
        status: 'fail',
        message: '缺少openid参数'
      });
    });
  });

  describe('POST /api/circles/:id/join', () => {
    test('should allow user to join circle', async () => {
      const newUser = await createTestUser();
      const publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      });

      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/join`)
        .send({ openid: newUser.openid })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '成功加入朋友圈'
      });
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .post(`/api/circles/${fakeId}/join`)
        .send({ openid: testUser.openid })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });

    test('should return 400 when user is already member', async () => {
      const response = await request(app)
        .post(`/api/circles/${testCircle._id}/join`)
        .send({ openid: testUser.openid })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '您已经是朋友圈成员'
      });
    });

    test('should return 401 when openid is missing', async () => {
      const response = await request(app)
        .post(`/api/circles/${testCircle._id}/join`)
        .expect(401);

      expect(response.body).toEqual({
        status: 'fail',
        message: '缺少openid参数'
      });
    });
  });

  describe('DELETE /api/circles/:id/leave', () => {
    test('should allow member to leave circle', async () => {
      const member = await createTestUser();
      
      // 添加成员到朋友圈
      await testCircle.updateOne({
        $push: { members: member._id }
      });

      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/leave`)
        .send({ openid: member.openid })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '已退出朋友圈'
      });
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .delete(`/api/circles/${fakeId}/leave`)
        .send({ openid: testUser.openid })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });

    test('should return 400 when user is not member', async () => {
      const nonMember = await createTestUser();

      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/leave`)
        .send({ openid: nonMember.openid })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '您不是此朋友圈的成员'
      });
    });

    test('should return 400 when creator tries to leave', async () => {
      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/leave`)
        .send({ openid: testUser.openid })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '创建者不能退出朋友圈'
      });
    });

    test('should return 401 when openid is missing', async () => {
      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/leave`)
        .expect(401);

      expect(response.body).toEqual({
        status: 'fail',
        message: '缺少openid参数'
      });
    });
  });

  describe('PATCH /api/circles/:id/settings', () => {
    test('should update circle settings successfully', async () => {
      const settingsData = {
        name: '更新后的朋友圈',
        isPublic: false,
        description: '这是一个私密的朋友圈',
        allowInvite: false,
        allowPost: true,
        openid: testUser.openid
      };

      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send(settingsData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '朋友圈设置更新成功',
        data: {
          circle: expect.objectContaining({
            name: '更新后的朋友圈',
            isPublic: false,
            description: '这是一个私密的朋友圈',
            allowInvite: false,
            allowPost: true,
            creator: expect.objectContaining({
              _id: testUser._id.toString(),
              username: testUser.username
            })
          })
        }
      });
    });

    test('should update only provided fields', async () => {
      const settingsData = {
        isPublic: false,
        openid: testUser.openid
      };

      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send(settingsData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '朋友圈设置更新成功',
        data: {
          circle: expect.objectContaining({
            name: testCircle.name, // 原名称不变
            isPublic: false, // 更新的字段
            creator: expect.objectContaining({
              _id: testUser._id.toString()
            })
          })
        }
      });
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const settingsData = {
        isPublic: false,
        openid: testUser.openid
      };

      const response = await request(app)
        .patch(`/api/circles/${fakeId}/settings`)
        .send(settingsData)
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });

    test('should return 403 when non-creator tries to update settings', async () => {
      const member = await createTestUser();
      const settingsData = {
        isPublic: false,
        openid: member.openid
      };

      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send(settingsData)
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '只有创建者可以修改朋友圈设置'
      });
    });

    test('should return 400 when no fields provided', async () => {
      const settingsData = {
        openid: testUser.openid
      };

      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send(settingsData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '请提供要更新的字段'
      });
    });

    test('should return 400 when name is too long', async () => {
      const settingsData = {
        name: 'a'.repeat(51), // 超过50个字符
        openid: testUser.openid
      };

      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send(settingsData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '输入验证失败: 朋友圈名称长度应在1-50个字符之间'
      });
    });

    test('should return 400 when description is too long', async () => {
      const settingsData = {
        description: 'a'.repeat(201), // 超过200个字符
        openid: testUser.openid
      };

      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send(settingsData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '输入验证失败: 朋友圈描述不能超过200个字符'
      });
    });

    test('should return 401 when openid is missing', async () => {
      const settingsData = {
        isPublic: false
      };

      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send(settingsData)
        .expect(401);

      expect(response.body).toEqual({
        status: 'fail',
        message: '缺少openid参数'
      });
    });
  });
}); 