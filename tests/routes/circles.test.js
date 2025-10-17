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

  describe('DELETE /api/circles/:id/members/:userId', () => {
    test('should allow creator to remove member', async () => {
      const member = await createTestUser();
      
      // 添加成员到朋友圈
      await testCircle.updateOne({
        $push: { members: member._id }
      });

      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/members/${member._id}`)
        .send({ openid: testUser.openid })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '成员已被移除'
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
        .send({ openid: testUser.openid })
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
        .send({ openid: nonCreator.openid })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '只有朋友圈创建者可以删除成员'
      });
    });

    test('should return 400 when user is not a member', async () => {
      const nonMember = await createTestUser();

      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/members/${nonMember._id}`)
        .send({ openid: testUser.openid })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '该用户不是朋友圈成员'
      });
    });

    test('should return 400 when creator tries to remove themselves', async () => {
      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}/members/${testUser._id}`)
        .send({ openid: testUser.openid })
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

  describe('POST /api/circles/:id/apply', () => {
    test('should allow user to apply to join public circle', async () => {
      const applicant = await createTestUser();
      const publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, testUser); // testUser是创建者，applicant来申请

      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/apply`)
        .send({ openid: applicant.openid })
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
        .send({ openid: applicant.openid })
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
        .send({ openid: applicant.openid })
        .expect(200);

      // 第二次申请
      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/apply`)
        .send({ openid: applicant.openid })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '您已经提交过申请，请等待审核'
      });
    });

    test('should not allow members to apply', async () => {
      const response = await request(app)
        .post(`/api/circles/${testCircle._id}/apply`)
        .send({ openid: testUser.openid })
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
        .send({ openid: applicant.openid })
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
        .send({ openid: testUser.openid })
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
        .send({ openid: nonCreator.openid })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '只有朋友圈创建者可以处理申请'
      });
    });

    test('should return 400 when user is not in appliers list', async () => {
      const nonApplicant = await createTestUser();

      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/approve/${nonApplicant._id}`)
        .send({ openid: testUser.openid })
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
        .send({ openid: testUser.openid })
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
        .send({ openid: testUser.openid })
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
        .send({ openid: nonCreator.openid })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '只有朋友圈创建者可以处理申请'
      });
    });

    test('should return 400 when user is not in appliers list', async () => {
      const nonApplicant = await createTestUser();

      const response = await request(app)
        .post(`/api/circles/${publicCircle._id}/reject/${nonApplicant._id}`)
        .send({ openid: testUser.openid })
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
        .query({ openid: testUser.openid })
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
        .query({ openid: nonCreator.openid })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '只有朋友圈创建者可以查看申请列表'
      });
    });

    test('should return empty array when no appliers', async () => {
      const emptyCircle = await createTestCircle({
        name: '无申请者朋友圈',
        isPublic: true
      }, testUser); // 确保testUser是创建者

      const response = await request(app)
        .get(`/api/circles/${emptyCircle._id}/appliers`)
        .query({ openid: testUser.openid })
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
        .query({ openid: testUser.openid })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });
  });

  // 新增邀请功能测试
  describe('Invite Feature Tests', () => {
    describe('POST /api/circles/:id/invite', () => {
      test('should allow creator to invite user', async () => {
        const inviteeUser = await createTestUser();

        const response = await request(app)
          .post(`/api/circles/${testCircle._id}/invite`)
          .send({ 
            userId: inviteeUser._id.toString(),
            openid: testUser.openid 
          })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: '邀请已发送'
        });
      });

      test('should allow member to invite user when allowInvite is true', async () => {
        const member = await createTestUser();
        const inviteeUser = await createTestUser();

        // 设置朋友圈允许成员邀请
        await testCircle.updateOne({ allowInvite: true });
        
        // 添加成员到朋友圈
        await testCircle.updateOne({ $push: { members: member._id } });

        const response = await request(app)
          .post(`/api/circles/${testCircle._id}/invite`)
          .send({ 
            userId: inviteeUser._id.toString(),
            openid: member.openid 
          })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: '邀请已发送'
        });
      });

      test('should not allow member to invite when allowInvite is false', async () => {
        const member = await createTestUser();
        const inviteeUser = await createTestUser();

        // 设置朋友圈不允许成员邀请
        await testCircle.updateOne({ allowInvite: false });
        
        // 添加成员到朋友圈
        await testCircle.updateOne({ $push: { members: member._id } });

        const response = await request(app)
          .post(`/api/circles/${testCircle._id}/invite`)
          .send({ 
            userId: inviteeUser._id.toString(),
            openid: member.openid 
          })
          .expect(403);

        expect(response.body).toEqual({
          status: 'fail',
          message: '您没有权限邀请用户'
        });
      });

      test('should not allow non-member to invite user', async () => {
        const nonMember = await createTestUser();
        const inviteeUser = await createTestUser();

        const response = await request(app)
          .post(`/api/circles/${testCircle._id}/invite`)
          .send({ 
            userId: inviteeUser._id.toString(),
            openid: nonMember.openid 
          })
          .expect(403);

        expect(response.body).toEqual({
          status: 'fail',
          message: '您没有权限邀请用户'
        });
      });

      test('should not allow inviting user who already has a role', async () => {
        // 尝试邀请已经是成员的用户
        const response = await request(app)
          .post(`/api/circles/${testCircle._id}/invite`)
          .send({ 
            userId: testUser._id.toString(), // testUser是创建者
            openid: testUser.openid 
          })
          .expect(400);

        expect(response.body).toEqual({
          status: 'fail',
          message: '该用户已经在朋友圈中或已被邀请/申请'
        });
      });

      test('should not allow inviting non-existent user', async () => {
        const fakeUserId = '507f1f77bcf86cd799439011';

        const response = await request(app)
          .post(`/api/circles/${testCircle._id}/invite`)
          .send({ 
            userId: fakeUserId,
            openid: testUser.openid 
          })
          .expect(404);

        expect(response.body).toEqual({
          status: 'fail',
          message: '被邀请用户不存在'
        });
      });

      test('should return 400 when userId is missing', async () => {
        const response = await request(app)
          .post(`/api/circles/${testCircle._id}/invite`)
          .send({ openid: testUser.openid })
          .expect(400);

        expect(response.body).toEqual({
          status: 'fail',
          message: '输入验证失败: 用户ID不能为空'
        });
      });
    });

    describe('DELETE /api/circles/:id/invite/:userId', () => {
      let inviteeUser;

      beforeEach(async () => {
        inviteeUser = await createTestUser();
        // 添加被邀请者到朋友圈
        await testCircle.updateOne({ $push: { invitees: inviteeUser._id } });
      });

      test('should allow creator to cancel invitation', async () => {
        const response = await request(app)
          .delete(`/api/circles/${testCircle._id}/invite/${inviteeUser._id}`)
          .send({ openid: testUser.openid })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: '邀请已取消'
        });
      });

      test('should not allow non-creator to cancel invitation', async () => {
        const nonCreator = await createTestUser();

        const response = await request(app)
          .delete(`/api/circles/${testCircle._id}/invite/${inviteeUser._id}`)
          .send({ openid: nonCreator.openid })
          .expect(403);

        expect(response.body).toEqual({
          status: 'fail',
          message: '只有朋友圈创建者可以取消邀请'
        });
      });

      test('should return 400 when user is not in invitees list', async () => {
        const nonInvitee = await createTestUser();

        const response = await request(app)
          .delete(`/api/circles/${testCircle._id}/invite/${nonInvitee._id}`)
          .send({ openid: testUser.openid })
          .expect(400);

        expect(response.body).toEqual({
          status: 'fail',
          message: '该用户未被邀请'
        });
      });
    });

    describe('POST /api/circles/:id/accept-invite', () => {
      let inviteeUser;

      beforeEach(async () => {
        inviteeUser = await createTestUser();
        // 添加被邀请者到朋友圈
        await testCircle.updateOne({ $push: { invitees: inviteeUser._id } });
      });

      test('should allow invitee to accept invitation', async () => {
        const response = await request(app)
          .post(`/api/circles/${testCircle._id}/accept-invite`)
          .send({ openid: inviteeUser.openid })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: '成功加入朋友圈'
        });
      });

      test('should not allow non-invitee to accept invitation', async () => {
        const nonInvitee = await createTestUser();

        const response = await request(app)
          .post(`/api/circles/${testCircle._id}/accept-invite`)
          .send({ openid: nonInvitee.openid })
          .expect(400);

        expect(response.body).toEqual({
          status: 'fail',
          message: '您未被邀请加入此朋友圈'
        });
      });
    });

    describe('POST /api/circles/:id/decline-invite', () => {
      let inviteeUser;

      beforeEach(async () => {
        inviteeUser = await createTestUser();
        // 添加被邀请者到朋友圈
        await testCircle.updateOne({ $push: { invitees: inviteeUser._id } });
      });

      test('should allow invitee to decline invitation', async () => {
        const response = await request(app)
          .post(`/api/circles/${testCircle._id}/decline-invite`)
          .send({ openid: inviteeUser.openid })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          message: '已拒绝邀请'
        });
      });

      test('should not allow non-invitee to decline invitation', async () => {
        const nonInvitee = await createTestUser();

        const response = await request(app)
          .post(`/api/circles/${testCircle._id}/decline-invite`)
          .send({ openid: nonInvitee.openid })
          .expect(400);

        expect(response.body).toEqual({
          status: 'fail',
          message: '您未被邀请加入此朋友圈'
        });
      });
    });

    describe('GET /api/circles/:id/invitees', () => {
      let invitee1, invitee2;

      beforeEach(async () => {
        invitee1 = await createTestUser();
        invitee2 = await createTestUser();
        // 添加被邀请者到朋友圈
        await testCircle.updateOne({
          $push: { invitees: [invitee1._id, invitee2._id] }
        });
      });

      test('should allow creator to view invitees list', async () => {
        const response = await request(app)
          .get(`/api/circles/${testCircle._id}/invitees`)
          .query({ openid: testUser.openid })
          .expect(200);

        expect(response.body).toEqual({
          success: true,
          data: {
            invitees: expect.arrayContaining([
              expect.objectContaining({
                _id: invitee1._id.toString(),
                username: invitee1.username
              }),
              expect.objectContaining({
                _id: invitee2._id.toString(),
                username: invitee2.username
              })
            ])
          }
        });
      });

      test('should not allow non-creator to view invitees list', async () => {
        const nonCreator = await createTestUser();

        const response = await request(app)
          .get(`/api/circles/${testCircle._id}/invitees`)
          .query({ openid: nonCreator.openid })
          .expect(403);

        expect(response.body).toEqual({
          status: 'fail',
          message: '只有朋友圈创建者可以查看邀请列表'
        });
      });
    });
  });

  // 更新 /my 接口测试以适配新的用户状态管理
  describe('GET /api/circles/my - Updated for New User Role Management', () => {
    test('should return circles where user has any role (creator, member, applier, invitee)', async () => {
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
      
      const inviteeCircle = await createTestCircle({
        name: '被邀请者朋友圈'
      }, otherUser);
      await inviteeCircle.updateOne({ $push: { invitees: testUser._id } });

      const response = await request(app)
        .get('/api/circles/my')
        .query({ openid: testUser.openid })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.circles).toHaveLength(4);
      
      const circleNames = response.body.data.circles.map(c => c.name);
      expect(circleNames).toContain(creatorCircle.name); // 创建者
      expect(circleNames).toContain(memberCircle.name);  // 成员
      expect(circleNames).toContain(applierCircle.name); // 申请者
      expect(circleNames).toContain(inviteeCircle.name); // 被邀请者
    });

    test('should not return circles where user has no role', async () => {
      const otherUser = await createTestUser();
      
      // 创建一个与testUser无关的朋友圈
      await createTestCircle({
        name: '无关朋友圈'
      }, otherUser);

      const response = await request(app)
        .get('/api/circles/my')
        .query({ openid: testUser.openid })
        .expect(200);

      expect(response.body.success).toBe(true);
      const circleNames = response.body.data.circles.map(c => c.name);
      expect(circleNames).not.toContain('无关朋友圈');
    });
  });
}); 