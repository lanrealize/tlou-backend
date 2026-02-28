const request = require('supertest');
const express = require('express');
const { createTestUser } = require('../helpers/testUtils');
const { globalErrorHandler } = require('../../utils/errorHandler');
const TempUser = require('../../models/TempUser');
const Circle = require('../../models/Circle');
const Post = require('../../models/Post');

jest.mock('../../services/imageCheck.service', () => require('../__mocks__/imageCheck.service'));
jest.mock('../../utils/qiniuUtils', () => require('../__mocks__/qiniuUtils'));

const app = express();
app.use(express.json());
app.use('/api/public', require('../../routes/public'));
app.use(globalErrorHandler);

describe('Trial API Tests - POST /api/public/trial/circle & /api/public/trial/post', () => {
  let tempOpenid;

  beforeEach(async () => {
    tempOpenid = `temp_trial_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    await TempUser.deleteMany({ _id: { $regex: /^temp_trial_/ } });
  });

  // ========== 创建试用朋友圈 ==========

  describe('POST /api/public/trial/circle', () => {
    test('临时用户首次创建朋友圈应该成功', async () => {
      // 先创建 TempUser
      await TempUser.create({ _id: tempOpenid });

      const response = await request(app)
        .post('/api/public/trial/circle')
        .send({ openid: tempOpenid, name: '我的试用圈子' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.circle.name).toBe('我的试用圈子');
      expect(response.body.data.circle.creator).toBe(tempOpenid);

      // 验证 TempUser 记录了 trialCircleId
      const tempUser = await TempUser.findById(tempOpenid);
      expect(tempUser.trialCircleId).toBeDefined();
      expect(tempUser.trialCircleId.toString()).toBe(response.body.data.circle._id.toString());
    });

    test('已有试用朋友圈时再次创建应该报错', async () => {
      await TempUser.create({ _id: tempOpenid });

      // 第一次创建
      await request(app)
        .post('/api/public/trial/circle')
        .send({ openid: tempOpenid, name: '第一个圈子' })
        .expect(201);

      // 第二次创建应该失败
      const response = await request(app)
        .post('/api/public/trial/circle')
        .send({ openid: tempOpenid, name: '第二个圈子' })
        .expect(400);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toContain('只能创建一个');
    });

    test('已注册用户调用试用接口应该报错', async () => {
      const registeredUser = await createTestUser();

      const response = await request(app)
        .post('/api/public/trial/circle')
        .send({ openid: registeredUser._id, name: '正式用户的圈子' })
        .expect(400);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toContain('已注册用户');
    });

    test('openid 不在任何表中时自动创建 TempUser 并成功', async () => {
      // 全新的 openid，不预先创建 TempUser
      const brandNewOpenid = `temp_brand_new_${Date.now()}`;

      const response = await request(app)
        .post('/api/public/trial/circle')
        .send({ openid: brandNewOpenid, name: '全新用户的圈子' })
        .expect(201);

      expect(response.body.success).toBe(true);

      // 验证 TempUser 被自动创建
      const tempUser = await TempUser.findById(brandNewOpenid);
      expect(tempUser).not.toBeNull();
      expect(tempUser.trialCircleId).toBeDefined();
    });

    test('不传 name 时使用默认名称', async () => {
      await TempUser.create({ _id: tempOpenid });

      const response = await request(app)
        .post('/api/public/trial/circle')
        .send({ openid: tempOpenid })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.circle.name).toBe('我的朋友圈');
    });

    test('缺少 openid 应该返回 401', async () => {
      const response = await request(app)
        .post('/api/public/trial/circle')
        .send({ name: '圈子' })
        .expect(401);

      expect(response.body.status).toBe('fail');
    });

    test('创建的朋友圈有默认名称', async () => {
      await TempUser.create({ _id: tempOpenid });

      const response = await request(app)
        .post('/api/public/trial/circle')
        .send({ openid: tempOpenid })
        .expect(201);

      expect(response.body.data.circle.name).toBe('我的朋友圈');
    });
  });

  // ========== 发试用帖子 ==========

  describe('POST /api/public/trial/post', () => {
    let tempUser, trialCircle;

    beforeEach(async () => {
      // 创建临时用户并创建好试用朋友圈
      tempUser = await TempUser.create({ _id: tempOpenid });

      const circleRes = await request(app)
        .post('/api/public/trial/circle')
        .send({ openid: tempOpenid, name: '试用圈子' });

      trialCircle = circleRes.body.data.circle;

      // 重新加载 tempUser 以获取最新的 trialCircleId
      tempUser = await TempUser.findById(tempOpenid);
    });

    test('临时用户首次发帖应该成功', async () => {
      const response = await request(app)
        .post('/api/public/trial/post')
        .send({
          openid: tempOpenid,
          circleId: trialCircle._id,
          content: '这是我的第一个试用帖子',
          images: [{ url: 'https://example.com/img.jpg', width: 800, height: 600 }]
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.post.author).toBe(tempOpenid);
      expect(response.body.data.post.content).toBe('这是我的第一个试用帖子');

      // 验证 TempUser 记录了 trialPostId
      const updatedTempUser = await TempUser.findById(tempOpenid);
      expect(updatedTempUser.trialPostId).toBeDefined();
      expect(updatedTempUser.trialPostId.toString()).toBe(response.body.data.post._id.toString());
    });

    test('已发过试用帖子时再次发帖应该报错', async () => {
      // 第一次发帖
      await request(app)
        .post('/api/public/trial/post')
        .send({ openid: tempOpenid, circleId: trialCircle._id, content: '第一个帖子' })
        .expect(201);

      // 第二次发帖应该失败
      const response = await request(app)
        .post('/api/public/trial/post')
        .send({ openid: tempOpenid, circleId: trialCircle._id, content: '第二个帖子' })
        .expect(400);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toContain('只能发一个');
    });

    test('在非自己的试用朋友圈发帖应该报错', async () => {
      // 另一个临时用户的朋友圈
      const otherOpenid = `temp_other_${Date.now()}`;
      await TempUser.create({ _id: otherOpenid });
      const otherCircleRes = await request(app)
        .post('/api/public/trial/circle')
        .send({ openid: otherOpenid, name: '别人的圈子' });
      const otherCircle = otherCircleRes.body.data.circle;

      const response = await request(app)
        .post('/api/public/trial/post')
        .send({ openid: tempOpenid, circleId: otherCircle._id, content: '发到别人圈子' })
        .expect(403);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toContain('只能在自己的试用朋友圈');
    });

    test('还没有创建试用朋友圈就发帖应该报错', async () => {
      const freshOpenid = `temp_fresh_${Date.now()}`;
      await TempUser.create({ _id: freshOpenid });

      const someCircle = await Circle.create({
        name: '随便一个圈子',
        creator: tempOpenid,
        members: [tempOpenid]
      });

      const response = await request(app)
        .post('/api/public/trial/post')
        .send({ openid: freshOpenid, circleId: someCircle._id, content: '没圈子就发帖' })
        .expect(403);

      expect(response.body.status).toBe('fail');
    });

    test('已注册用户调用试用发帖接口应该报错', async () => {
      const registeredUser = await createTestUser();

      const response = await request(app)
        .post('/api/public/trial/post')
        .send({ openid: registeredUser._id, circleId: trialCircle._id, content: '正式用户发帖' })
        .expect(400);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toContain('已注册用户');
    });

    test('缺少 circleId 应该返回 400', async () => {
      const response = await request(app)
        .post('/api/public/trial/post')
        .send({ openid: tempOpenid, content: '没有圈子id' })
        .expect(400);

      expect(response.body.status).toBe('fail');
    });
  });

  // ========== 注册后数据自动归属 ==========

  describe('注册后试用数据自动归属正式用户', () => {
    test('注册后 Circle 和 Post 的 creator/author 与新用户 _id 一致', async () => {
      // 1. 临时用户创建圈子和帖子
      await TempUser.create({ _id: tempOpenid });

      const circleRes = await request(app)
        .post('/api/public/trial/circle')
        .send({ openid: tempOpenid, name: '试用圈子' });
      const circleId = circleRes.body.data.circle._id;

      await request(app)
        .post('/api/public/trial/post')
        .send({ openid: tempOpenid, circleId, content: '试用帖子' });

      // 2. 模拟注册（直接写 User 表，与 registerUser 逻辑一致）
      const User = require('../../models/User');
      await User.create({ _id: tempOpenid, username: '新用户', avatar: 'https://example.com/a.jpg' });
      await TempUser.findByIdAndDelete(tempOpenid);

      // 3. 验证圈子和帖子的关联字段不变，且现在能 populate 到用户信息
      const circle = await Circle.findById(circleId).populate('creator', 'username');
      expect(circle.creator._id).toBe(tempOpenid);
      expect(circle.creator.username).toBe('新用户'); // populate 成功

      const post = await Post.findOne({ circle: circleId }).populate('author', 'username');
      expect(post.author._id).toBe(tempOpenid);
      expect(post.author.username).toBe('新用户'); // populate 成功
    });
  });
});
