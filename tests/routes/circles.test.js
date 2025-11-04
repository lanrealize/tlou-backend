const request = require('supertest');
const express = require('express');
const { createTestUser, createTestCircle, createTestPost } = require('../helpers/testUtils');
const { globalErrorHandler } = require('../../utils/errorHandler');
const Circle = require('../../models/Circle');
const Post = require('../../models/Post');

// 创建测试应用
const app = express();
app.use(express.json());

// 模拟路由
const circlesRoutes = require('../../routes/circles');
const publicRoutes = require('../../routes/public');
app.use('/api/circles', circlesRoutes);
app.use('/api/public', publicRoutes);

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
        openid: testUser._id
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
        openid: testUser._id
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
        .query({ openid: testUser._id })
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
        .query({ openid: newUser._id })
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
        .send({ openid: newUser._id })
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
        .send({ openid: testUser._id })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });

    test('should return 400 when user is already member', async () => {
      const response = await request(app)
        .post(`/api/circles/${testCircle._id}/join`)
        .send({ openid: testUser._id })
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
        .send({ openid: member._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '已退出朋友圈',
        data: {
          cleaned: {
            posts: expect.any(Number),
            comments: expect.any(Number),
            likes: expect.any(Number),
            replyReferences: expect.any(Number)
          }
        }
      });
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .delete(`/api/circles/${fakeId}/leave`)
        .send({ openid: testUser._id })
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
        .send({ openid: nonMember._id })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '您不是此朋友圈的成员'
      });
    });

    test('should return 400 when creator tries to leave', async () => {
      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/leave`)
        .send({ openid: testUser._id })
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

  describe('DELETE /api/circles/:id', () => {
    test('should allow creator to delete circle', async () => {
      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}`)
        .send({ openid: testUser._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '朋友圈已删除'
      });

      // 验证朋友圈确实被删除
      const deletedCircle = await Circle.findById(testCircle._id);
      expect(deletedCircle).toBeNull();
    });

    test('should cascade delete all posts in the circle', async () => {
      // 创建一个新朋友圈和几个帖子
      const circle = await Circle.create({
        name: '测试删除朋友圈',
        creator: testUser._id,
        members: [testUser._id]
      });

      const post1 = await Post.create({
        content: '测试帖子1',
        author: testUser._id,
        circle: circle._id
      });

      const post2 = await Post.create({
        content: '测试帖子2',
        author: testUser._id,
        circle: circle._id
      });

      // 删除朋友圈
      const response = await request(app)
        .delete(`/api/circles/${circle._id}`)
        .send({ openid: testUser._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '朋友圈已删除'
      });

      // 验证帖子也被删除
      const deletedPost1 = await Post.findById(post1._id);
      const deletedPost2 = await Post.findById(post2._id);
      expect(deletedPost1).toBeNull();
      expect(deletedPost2).toBeNull();
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .delete(`/api/circles/${fakeId}`)
        .send({ openid: testUser._id })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });

    test('should return 403 when non-creator tries to delete circle', async () => {
      const nonCreator = await createTestUser();

      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}`)
        .send({ openid: nonCreator._id })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '只有朋友圈创建者可以执行此操作'
      });
    });

    test('should return 401 when openid is missing', async () => {
      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}`)
        .expect(401);

      expect(response.body).toEqual({
        status: 'fail',
        message: '缺少openid参数'
      });
    });
  });

  describe('DELETE /api/circles/:id/members/:userId', () => {
    test('should allow creator to remove member', async () => {
      const member = await createTestUser();
      
      // 添加成员到朋友圈
      await testCircle.updateOne({
        $push: { members: member._id }
      });

      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/members/${member._id}`)
        .send({ openid: testUser._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '成员已被移除',
        data: {
          cleaned: {
            posts: expect.any(Number),
            comments: expect.any(Number),
            likes: expect.any(Number),
            replyReferences: expect.any(Number)
          }
        }
      });

      // 验证成员确实被移除
      const updatedCircle = await testCircle.constructor.findById(testCircle._id);
      expect(updatedCircle.members).not.toContain(member._id);
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const member = await createTestUser();

      const response = await request(app)
        .delete(`/api/circles/${fakeId}/members/${member._id}`)
        .send({ openid: testUser._id })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });

    test('should return 403 when non-creator tries to remove member', async () => {
      const member = await createTestUser();
      const nonCreator = await createTestUser();
      
      // 添加成员到朋友圈
      await testCircle.updateOne({
        $push: { members: [member._id, nonCreator._id] }
      });

      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/members/${member._id}`)
        .send({ openid: nonCreator._id })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '只有朋友圈创建者可以执行此操作'
      });
    });

    test('should return 400 when user is not a member', async () => {
      const nonMember = await createTestUser();

      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/members/${nonMember._id}`)
        .send({ openid: testUser._id })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '该用户不是朋友圈成员'
      });
    });

    test('should return 400 when creator tries to remove themselves', async () => {
      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/members/${testUser._id}`)
        .send({ openid: testUser._id })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '创建者不能删除自己'
      });
    });

    test('should return 401 when openid is missing', async () => {
      const member = await createTestUser();
      
      // 添加成员到朋友圈
      await testCircle.updateOne({
        $push: { members: member._id }
      });

      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/members/${member._id}`)
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
        openid: testUser._id
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
        openid: testUser._id
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
        openid: testUser._id
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
        openid: member._id
      };

      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send(settingsData)
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '只有朋友圈创建者可以执行此操作'
      });
    });

    test('should return 400 when no fields provided', async () => {
      const settingsData = {
        openid: testUser._id
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
        openid: testUser._id
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
        openid: testUser._id
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

  describe('POST /api/circles/:id/apply', () => {
    test('should allow user to apply to join public circle', async () => {
      const applicant = await createTestUser();
      const publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, testUser); // testUser是创建者，applicant来申请

      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/apply`)
        .send({ openid: applicant._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '申请已提交，请等待朋友圈创建者审核'
      });
    });

    test('should not allow application to private circle', async () => {
      const applicant = await createTestUser();
      const privateCircle = await createTestCircle({
        name: '私密朋友圈',
        isPublic: false
      }, testUser); // testUser是创建者

      const response = await request(app)
        .post(`/api/circles/${privateCircle._id}/apply`)
        .send({ openid: applicant._id })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '私密朋友圈不支持申请加入'
      });
    });

    test('should not allow duplicate applications', async () => {
      const applicant = await createTestUser();
      const publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, testUser); // testUser是创建者

      // 第一次申请
      await request(app)
        .post(`/api/circles/${publicCircle._id}/apply`)
        .send({ openid: applicant._id })
        .expect(200);

      // 第二次申请
      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/apply`)
        .send({ openid: applicant._id })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '您已经提交过申请，请等待审核'
      });
    });

    test('should not allow members to apply', async () => {
      const response = await request(app)
        .post(`/api/circles/${testCircle._id}/apply`)
        .send({ openid: testUser._id })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '您已经是朋友圈成员'
      });
    });

    test('should return 404 when circle does not exist', async () => {
      const applicant = await createTestUser();
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .post(`/api/circles/${fakeId}/apply`)
        .send({ openid: applicant._id })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });
  });

  describe('POST /api/circles/:id/approve/:userId', () => {
    let applicant, publicCircle;

    beforeEach(async () => {
      applicant = await createTestUser();
      publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, testUser); // 确保testUser是创建者
      
      // 添加申请者
      await publicCircle.updateOne({
        $push: { appliers: applicant._id }
      });
    });

    test('should allow creator to approve application', async () => {
      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/approve/${applicant._id}`)
        .send({ openid: testUser._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '已同意申请，用户成功加入朋友圈'
      });
    });

    test('should not allow non-creator to approve application', async () => {
      const nonCreator = await createTestUser();

      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/approve/${applicant._id}`)
        .send({ openid: nonCreator._id })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '只有朋友圈创建者可以执行此操作'
      });
    });

    test('should return 400 when user is not in appliers list', async () => {
      const nonApplicant = await createTestUser();

      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/approve/${nonApplicant._id}`)
        .send({ openid: testUser._id })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '该用户未申请加入此朋友圈'
      });
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .post(`/api/circles/${fakeId}/approve/${applicant._id}`)
        .send({ openid: testUser._id })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });
  });

  describe('POST /api/circles/:id/reject/:userId', () => {
    let applicant, publicCircle;

    beforeEach(async () => {
      applicant = await createTestUser();
      publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, testUser); // 确保testUser是创建者
      
      // 添加申请者
      await publicCircle.updateOne({
        $push: { appliers: applicant._id }
      });
    });

    test('should allow creator to reject application', async () => {
      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/reject/${applicant._id}`)
        .send({ openid: testUser._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '已拒绝申请'
      });
    });

    test('should not allow non-creator to reject application', async () => {
      const nonCreator = await createTestUser();

      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/reject/${applicant._id}`)
        .send({ openid: nonCreator._id })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '只有朋友圈创建者可以执行此操作'
      });
    });

    test('should return 400 when user is not in appliers list', async () => {
      const nonApplicant = await createTestUser();

      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/reject/${nonApplicant._id}`)
        .send({ openid: testUser._id })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '该用户未申请加入此朋友圈'
      });
    });
  });

  describe('GET /api/circles/:id/appliers', () => {
    let applicant1, applicant2, publicCircle;

    beforeEach(async () => {
      applicant1 = await createTestUser();
      applicant2 = await createTestUser();
      publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, testUser); // 确保testUser是创建者
      
      // 添加申请者
      await publicCircle.updateOne({
        $push: { 
          appliers: [applicant1._id, applicant2._id] 
        }
      });
    });

    test('should allow creator to view appliers list', async () => {
      const response = await request(app)
        .get(`/api/circles/${publicCircle._id}/appliers`)
        .query({ openid: testUser._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          appliers: expect.arrayContaining([
            expect.objectContaining({
              _id: applicant1._id.toString(),
              username: applicant1.username
            }),
            expect.objectContaining({
              _id: applicant2._id.toString(),
              username: applicant2.username
            })
          ])
        }
      });
    });

    test('should not allow non-creator to view appliers list', async () => {
      const nonCreator = await createTestUser();

      const response = await request(app)
        .get(`/api/circles/${publicCircle._id}/appliers`)
        .query({ openid: nonCreator._id })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '只有朋友圈创建者可以执行此操作'
      });
    });

    test('should return empty array when no appliers', async () => {
      const emptyCircle = await createTestCircle({
        name: '无申请者朋友圈',
        isPublic: true
      }, testUser); // 确保testUser是创建者

      const response = await request(app)
        .get(`/api/circles/${emptyCircle._id}/appliers`)
        .query({ openid: testUser._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          appliers: []
        }
      });
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .get(`/api/circles/${fakeId}/appliers`)
        .query({ openid: testUser._id })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });
  });

  describe('GET /api/circles/:id - View Single Circle (requires auth)', () => {
    test('should require openid to view circles', async () => {
      const publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, testUser);

      // 不提供openid - 应该返回401
      const response = await request(app)
        .get(`/api/circles/${publicCircle._id}`)
        .expect(401);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('缺少openid参数');
    });

    test('should return circle with currentUserStatus for owner', async () => {
      // 创建新的用户和朋友圈确保关系正确
      const owner = await createTestUser();
      const circle = await createTestCircle({ name: '测试朋友圈' }, owner);

      const response = await request(app)
        .get(`/api/circles/${circle._id}`)
        .query({ openid: owner._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          circle: expect.objectContaining({
            _id: circle._id.toString(),
            name: circle.name,
            creator: expect.any(Object),
            members: expect.any(Array),
            currentUserStatus: {
              isMember: true,
              hasApplied: false,
              isOwner: true
            }
          })
        }
      });

      // 确保appliers字段不存在
      expect(response.body.data.circle.appliers).toBeUndefined();
    });

    test('should return circle with currentUserStatus for member', async () => {
      // 创建新的用户和朋友圈，然后添加成员
      const owner = await createTestUser();
      const member = await createTestUser();
      const circle = await createTestCircle({ name: '测试朋友圈' }, owner);
      await circle.updateOne({ $push: { members: member._id } });

      const response = await request(app)
        .get(`/api/circles/${circle._id}`)
        .query({ openid: member._id })
        .expect(200);

      expect(response.body.data.circle.currentUserStatus).toEqual({
        isMember: true,
        hasApplied: false,
        isOwner: false
      });

      // 确保appliers字段不存在
      expect(response.body.data.circle.appliers).toBeUndefined();
    });

    test('should return circle with currentUserStatus for applier', async () => {
      // 创建新的用户和朋友圈，然后添加申请者
      const owner = await createTestUser();
      const applicant = await createTestUser();
      const publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, owner);
      await publicCircle.updateOne({ $push: { appliers: applicant._id } });

      const response = await request(app)
        .get(`/api/circles/${publicCircle._id}`)
        .query({ openid: applicant._id })
        .expect(200);

      expect(response.body.data.circle.currentUserStatus).toEqual({
        isMember: false,
        hasApplied: true,
        isOwner: false
      });

      // 确保appliers字段不存在
      expect(response.body.data.circle.appliers).toBeUndefined();
    });

    test('should return circle with currentUserStatus for non-member of public circle', async () => {
      // 创建新的用户和朋友圈，局外人访问
      const owner = await createTestUser();
      const outsider = await createTestUser();
      const publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, owner);

      const response = await request(app)
        .get(`/api/circles/${publicCircle._id}`)
        .query({ openid: outsider._id })
        .expect(200);

      expect(response.body.data.circle.currentUserStatus).toEqual({
        isMember: false,
        hasApplied: false,
        isOwner: false
      });

      // 确保appliers字段不存在
      expect(response.body.data.circle.appliers).toBeUndefined();
    });
  });

  describe('GET /api/public/circles/:id - Public Circle API (no auth required)', () => {
    test('should allow anyone to view public circles without auth', async () => {
      // 创建新的用户和公开朋友圈
      const owner = await createTestUser();
      const publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, owner);

      // 不提供openid - 使用公开API
      const response = await request(app)
        .get(`/api/public/circles/${publicCircle._id}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          circle: expect.objectContaining({
            _id: publicCircle._id.toString(),
            name: '公开朋友圈',
            isPublic: true,
            creator: expect.any(Object),
            members: expect.any(Array),
            currentUserStatus: null  // 未登录用户
          })
        }
      });

      // 确保appliers字段不存在
      expect(response.body.data.circle.appliers).toBeUndefined();
    });

    test('should not allow access to private circles via public API', async () => {
      // 创建新的用户和私密朋友圈
      const owner = await createTestUser();
      const privateCircle = await createTestCircle({
        name: '私密朋友圈',
        isPublic: false
      }, owner);

      // 尝试通过公开API访问私密朋友圈
      const response = await request(app)
        .get(`/api/public/circles/${privateCircle._id}`)
        .expect(403);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('此为私密朋友圈，需要邀请码才能访问');
    });

    test('should return 404 for non-existent circles', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .get(`/api/public/circles/${fakeId}`)
        .expect(404);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('朋友圈不存在');
    });
  });

  describe('GET /api/public/circles/random - Random Public Circle (for promotion)', () => {
    beforeEach(async () => {
      // 清理所有公开朋友圈，确保测试隔离
      await Circle.deleteMany({ isPublic: true });
    });

    test('should allow guest users (without openid) to get random public circles', async () => {
      // 创建几个公开朋友圈
      await createTestCircle({
        name: '公开朋友圈1',
        isPublic: true
      }, testUser);
      
      await createTestCircle({
        name: '公开朋友圈2',
        isPublic: true
      }, testUser);

      // 不提供openid
      const response = await request(app)
        .get('/api/public/circles/random')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.circle).toBeDefined();
      expect(response.body.data.circle._id).toBeDefined();
      expect(response.body.data.circle.name).toBeDefined();
      expect(response.body.data.circle.isPublic).toBe(true);
      expect(response.body.data.circle.creator).toBeDefined();
      expect(response.body.data.circle.creator.username).toBeDefined();
      expect(response.body.data.randomInfo).toBeDefined();
    });

    test('should allow logged-in users to get random public circles', async () => {
      // 创建一个公开朋友圈
      await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, testUser);

      // 提供openid
      const response = await request(app)
        .get('/api/public/circles/random')
        .query({ openid: testUser._id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.circle).toBeDefined();
      expect(response.body.data.circle.isPublic).toBe(true);
    });

    test('should return empty result when no public circles exist', async () => {
      // 确保没有公开朋友圈
      await Circle.deleteMany({ isPublic: true });
      
      const response = await request(app)
        .get('/api/public/circles/random')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '暂无可用的公开朋友圈',
        data: {
          circle: null,
          randomInfo: {
            totalAvailable: 0,
            visitedCount: 0,
            isHistoryReset: false
          }
        }
      });
    });
  });

  // 测试获取邀请码接口
  describe('GET /api/circles/:id/invite-code - Member Invite Permission', () => {
    let circleOwner, circleMember, nonMember;
    let testCircleWithInvite, testCircleWithoutInvite;

    beforeEach(async () => {
      // 创建三个测试用户
      circleOwner = await createTestUser();
      circleMember = await createTestUser();
      nonMember = await createTestUser();

      // 创建朋友圈：allowInvite=true
      testCircleWithInvite = await createTestCircle({
        name: '允许成员分享的朋友圈',
        allowInvite: true
      }, circleOwner);
      await Circle.findByIdAndUpdate(testCircleWithInvite._id, {
        $push: { members: circleMember._id }
      });

      // 创建朋友圈：allowInvite=false
      testCircleWithoutInvite = await createTestCircle({
        name: '不允许成员分享的朋友圈',
        allowInvite: false
      }, circleOwner);
      await Circle.findByIdAndUpdate(testCircleWithoutInvite._id, {
        $push: { members: circleMember._id }
      });
    });

    test('should allow creator to get invite code', async () => {
      const response = await request(app)
        .get(`/api/circles/${testCircleWithInvite._id}/invite-code`)
        .query({ openid: circleOwner._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          inviteCode: expect.any(String),
          isPublic: expect.any(Boolean)
        }
      });
      expect(response.body.data.inviteCode).toHaveLength(6);
    });

    test('should allow member to get invite code when allowInvite=true', async () => {
      const response = await request(app)
        .get(`/api/circles/${testCircleWithInvite._id}/invite-code`)
        .query({ openid: circleMember._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          inviteCode: expect.any(String),
          isPublic: expect.any(Boolean)
        }
      });
      expect(response.body.data.inviteCode).toHaveLength(6);
    });

    test('should reject member when allowInvite=false', async () => {
      const response = await request(app)
        .get(`/api/circles/${testCircleWithoutInvite._id}/invite-code`)
        .query({ openid: circleMember._id })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈主人未开启成员分享功能'
      });
    });

    test('should reject non-member from getting invite code', async () => {
      const response = await request(app)
        .get(`/api/circles/${testCircleWithInvite._id}/invite-code`)
        .query({ openid: nonMember._id })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '您不是此朋友圈的成员'
      });
    });

    test('should allow creator to get invite code even when allowInvite=false', async () => {
      const response = await request(app)
        .get(`/api/circles/${testCircleWithoutInvite._id}/invite-code`)
        .query({ openid: circleOwner._id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.inviteCode).toBeDefined();
    });

    test('Bug修复测试: allowInvite从false改为true后成员应该能获取邀请码', async () => {
      // 1. 创建朋友圈，allowInvite=false
      const circle = await createTestCircle({
        name: 'Bug测试朋友圈',
        allowInvite: false
      }, circleOwner);
      await Circle.findByIdAndUpdate(circle._id, {
        $push: { members: circleMember._id }
      });

      // 2. 成员尝试获取邀请码，应该失败
      await request(app)
        .get(`/api/circles/${circle._id}/invite-code`)
        .query({ openid: circleMember._id })
        .expect(403);

      // 3. 圈主修改设置，allowInvite=true
      await request(app)
        .patch(`/api/circles/${circle._id}/settings`)
        .send({
          allowInvite: true,
          openid: circleOwner._id
        })
        .expect(200);

      // 4. 成员再次尝试获取邀请码，应该成功
      const response = await request(app)
        .get(`/api/circles/${circle._id}/invite-code`)
        .query({ openid: circleMember._id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.inviteCode).toBeDefined();
      expect(response.body.data.inviteCode).toHaveLength(6);
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeCircleId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .get(`/api/circles/${fakeCircleId}/invite-code`)
        .query({ openid: circleOwner._id })
        .expect(404);

      expect(response.body.status).toBe('fail');
    });

    test('should return 400 when circle ID is invalid', async () => {
      const response = await request(app)
        .get('/api/circles/invalid-id/invite-code')
        .query({ openid: circleOwner._id })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '无效的朋友圈ID'
      });
    });
  });

  // 更新 /my 接口测试以适配新的用户状态管理
  describe('GET /api/circles/my - Updated for New User Role Management', () => {
    test('should return circles where user has any role (creator, member, applier)', async () => {
      const otherUser = await createTestUser();
      
      // 创建不同类型的朋友圈
      const creatorCircle = testCircle; // testUser是创建者
      
      const memberCircle = await createTestCircle({
        name: '成员朋友圈'
      }, otherUser);
      await memberCircle.updateOne({ $push: { members: testUser._id } });
      
      const applierCircle = await createTestCircle({
        name: '申请者朋友圈',
        isPublic: true
      }, otherUser);
      await applierCircle.updateOne({ $push: { appliers: testUser._id } });

      const response = await request(app)
        .get('/api/circles/my')
        .query({ openid: testUser._id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.circles).toHaveLength(3);
      
      const circleNames = response.body.data.circles.map(c => c.name);
      expect(circleNames).toContain(creatorCircle.name); // 创建者
      expect(circleNames).toContain(memberCircle.name);  // 成员
      expect(circleNames).toContain(applierCircle.name); // 申请者
    });

    test('should not return circles where user has no role', async () => {
      const otherUser = await createTestUser();
      
      // 创建一个与testUser无关的朋友圈
      await createTestCircle({
        name: '无关朋友圈'
      }, otherUser);

      const response = await request(app)
        .get('/api/circles/my')
        .query({ openid: testUser._id })
        .expect(200);

      expect(response.body.success).toBe(true);
      const circleNames = response.body.data.circles.map(c => c.name);
      expect(circleNames).not.toContain('无关朋友圈');
    });
  });
}); 