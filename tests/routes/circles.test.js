const request = require('supertest');
const express = require('express');
const { createTestUser, createTestCircle, createTestPost } = require('../helpers/testUtils');
const { globalErrorHandler } = require('../../utils/errorHandler');
const Circle = require('../../models/Circle');
const Post = require('../../models/Post');

const app = express();
app.use(express.json());

const circlesRoutes = require('../../routes/circles');
app.use('/api/circles', circlesRoutes);
app.use(globalErrorHandler);

describe('Circles Routes Test', () => {
  let testUser, testCircle;

  beforeEach(async () => {
    testUser = await createTestUser();
    testCircle = await createTestCircle({}, testUser);
  });

  describe('POST /api/circles', () => {
    test('should create circle with valid data', async () => {
      const response = await request(app)
        .post('/api/circles')
        .send({ name: '测试朋友圈', openid: testUser._id })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.circle.name).toBe('测试朋友圈');
      expect(response.body.data.circle.creator._id).toBe(testUser._id.toString());
    });

    test('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post('/api/circles')
        .send({ openid: testUser._id })
        .expect(400);

      expect(response.body.status).toBe('fail');
    });

    test('should return 401 when openid is missing', async () => {
      const response = await request(app)
        .post('/api/circles')
        .send({ name: '测试朋友圈' })
        .expect(401);

      expect(response.body.status).toBe('fail');
    });

    test('should return 401 when openid is invalid', async () => {
      const response = await request(app)
        .post('/api/circles')
        .send({ name: '测试朋友圈', openid: 'invalid_openid' })
        .expect(401);

      expect(response.body.status).toBe('fail');
    });
  });

  describe('GET /api/circles/my', () => {
    test('should return user circles with latest posts', async () => {
      const anotherCircle = await createTestCircle({ name: '另一个朋友圈' }, testUser);
      await createTestPost({}, testUser, testCircle);
      await createTestPost({}, testUser, anotherCircle);

      const response = await request(app)
        .get('/api/circles/my')
        .query({ openid: testUser._id })
        .expect(200);

      expect(response.body.success).toBe(true);
      const names = response.body.data.circles.map(c => c.name);
      expect(names).toContain(testCircle.name);
      expect(names).toContain(anotherCircle.name);
    });

    test('should return empty array when user has no circles', async () => {
      const newUser = await createTestUser();

      const response = await request(app)
        .get('/api/circles/my')
        .query({ openid: newUser._id })
        .expect(200);

      expect(response.body.data.circles).toHaveLength(0);
    });

    test('should return 401 when openid is missing', async () => {
      const response = await request(app)
        .get('/api/circles/my')
        .expect(401);

      expect(response.body.status).toBe('fail');
    });
  });

  describe('DELETE /api/circles/:id', () => {
    test('should allow creator to delete circle', async () => {
      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}`)
        .send({ openid: testUser._id })
        .expect(200);

      expect(response.body).toEqual({ success: true, message: '朋友圈已删除' });

      const deletedCircle = await Circle.findById(testCircle._id);
      expect(deletedCircle).toBeNull();
    });

    test('should cascade delete all posts in the circle', async () => {
      const circle = await Circle.create({ name: '级联删除测试', creator: testUser._id });
      const post1 = await Post.create({ content: '帖子1', author: testUser._id, circle: circle._id });
      const post2 = await Post.create({ content: '帖子2', author: testUser._id, circle: circle._id });

      await request(app)
        .delete(`/api/circles/${circle._id}`)
        .send({ openid: testUser._id })
        .expect(200);

      expect(await Post.findById(post1._id)).toBeNull();
      expect(await Post.findById(post2._id)).toBeNull();
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .delete(`/api/circles/${fakeId}`)
        .send({ openid: testUser._id })
        .expect(404);

      expect(response.body.status).toBe('fail');
    });

    test('should return 403 when non-creator tries to delete circle', async () => {
      const nonCreator = await createTestUser();

      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}`)
        .send({ openid: nonCreator._id })
        .expect(403);

      expect(response.body.status).toBe('fail');
    });

    test('should return 401 when openid is missing', async () => {
      const response = await request(app)
        .delete(`/api/circles/${testCircle._id}`)
        .expect(401);

      expect(response.body.status).toBe('fail');
    });
  });

  describe('PATCH /api/circles/:id/settings', () => {
    test('should update circle settings successfully', async () => {
      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send({ openid: testUser._id, name: '新名字', description: '新描述' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.circle.name).toBe('新名字');
      expect(response.body.data.circle.description).toBe('新描述');
    });

    test('should return 400 when no fields provided', async () => {
      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send({ openid: testUser._id })
        .expect(400);

      expect(response.body.status).toBe('fail');
    });

    test('should return 403 when non-creator tries to update settings', async () => {
      const nonCreator = await createTestUser();

      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send({ openid: nonCreator._id, name: '新名字' })
        .expect(403);

      expect(response.body.status).toBe('fail');
    });

    test('should return 400 when name is too long', async () => {
      const response = await request(app)
        .patch(`/api/circles/${testCircle._id}/settings`)
        .send({ openid: testUser._id, name: 'a'.repeat(51) })
        .expect(400);

      expect(response.body.status).toBe('fail');
    });
  });

  describe('GET /api/circles/:id', () => {
    test('should return circle detail for owner', async () => {
      const response = await request(app)
        .get(`/api/circles/${testCircle._id}`)
        .query({ openid: testUser._id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.circle._id).toBe(testCircle._id.toString());
      expect(response.body.data.circle.currentUserStatus.isOwner).toBe(true);
    });

    test('should return 403 when non-creator accesses circle', async () => {
      const otherUser = await createTestUser();

      const response = await request(app)
        .get(`/api/circles/${testCircle._id}`)
        .query({ openid: otherUser._id })
        .expect(403);

      expect(response.body.status).toBe('fail');
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .get(`/api/circles/${fakeId}`)
        .query({ openid: testUser._id })
        .expect(404);

      expect(response.body.status).toBe('fail');
    });

    test('should return 401 when openid is missing', async () => {
      const response = await request(app)
        .get(`/api/circles/${testCircle._id}`)
        .expect(401);

      expect(response.body.status).toBe('fail');
    });
  });
});
