const mongoose = require('mongoose');
const Circle = require('../../models/Circle');
const User = require('../../models/User');
const Post = require('../../models/Post');
const TempUser = require('../../models/TempUser');
const { createTestUser, createTestCircle, createTestPost } = require('../helpers/testUtils');
const randomCircleController = require('../../controllers/randomCircle.controller');

describe('随机Public朋友圈控制器测试', () => {
  let testUser1, testUser2, testUser3;
  let publicCircle1, publicCircle2, publicCircle3;
  let privateCircle1;
  let mockReq, mockRes;

  beforeEach(async () => {
    // 创建测试用户
    testUser1 = await createTestUser();
    testUser2 = await createTestUser();
    testUser3 = await createTestUser();

    // 创建公开朋友圈
    publicCircle1 = await createTestCircle({ 
      name: '公开朋友圈1', 
      isPublic: true 
    }, testUser1);
    
    publicCircle2 = await createTestCircle({ 
      name: '公开朋友圈2', 
      isPublic: true 
    }, testUser2);
    
    publicCircle3 = await createTestCircle({ 
      name: '公开朋友圈3', 
      isPublic: true 
    }, testUser3);

    // 创建私密朋友圈（应该不会被随机到）
    privateCircle1 = await createTestCircle({ 
      name: '私密朋友圈1', 
      isPublic: false 
    }, testUser1);

    // 为所有公开朋友圈创建带图片的帖子（支持新的过滤规则）
    await createTestPost({
      content: '公开朋友圈1的帖子',
      images: ['https://example.com/circle1.jpg']
    }, testUser1, publicCircle1);

    await createTestPost({
      content: '公开朋友圈2的帖子',
      images: ['https://example.com/circle2.jpg']
    }, testUser2, publicCircle2);

    await createTestPost({
      content: '公开朋友圈3的帖子',
      images: ['https://example.com/circle3.jpg']
    }, testUser3, publicCircle3);

    // 设置mock请求和响应对象
    mockReq = {
      user: testUser1,  // 保留以兼容旧测试
      query: {
        openid: testUser1._id  // 添加 openid 让 controller 能识别用户
      },
      headers: {},
      connection: {},
      socket: {}
    };

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getRandomPublicCircle', () => {
    test('应该成功获取随机public朋友圈', async () => {
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];
      
      expect(responseData.success).toBe(true);
      expect(responseData.message).toBe('获取随机朋友圈成功');
      expect(responseData.data.circle).toBeDefined();
      expect(responseData.data.circle._id).toBeDefined();
      expect(responseData.data.circle.name).toBeDefined();
      expect(responseData.data.circle.creator).toBeDefined();
      expect(responseData.data.randomInfo).toBeDefined();
      expect(responseData.data.randomInfo.totalAvailable).toBeGreaterThan(0);
      expect(responseData.data.randomInfo.visitedCount).toBeGreaterThanOrEqual(0);
    });

    test('随机获取的朋友圈应该是public的', async () => {
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const call = mockRes.json.mock.calls[mockRes.json.mock.calls.length - 1];
      const responseData = call[0];
      const circle = responseData.data.circle;
      
      // 验证返回的朋友圈确实是public的
      const dbCircle = await Circle.findById(circle._id);
      expect(dbCircle.isPublic).toBe(true);
    });

    test('应该返回正确的统计信息', async () => {
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      const call = mockRes.json.mock.calls[mockRes.json.mock.calls.length - 1];
      const responseData = call[0];
      const randomInfo = responseData.data.randomInfo;
      
      expect(randomInfo.totalAvailable).toBe(3); // 3个public朋友圈
      expect(randomInfo.visitedCount).toBe(1); // 第一次访问
      expect(randomInfo.isHistoryReset).toBe(false);
    });

    test('excludeVisited=false时应该允许重复访问', async () => {
      mockReq.query.excludeVisited = 'false';
      
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      // 两次请求都应该成功
      expect(mockRes.json).toHaveBeenCalledTimes(2);
      mockRes.json.mock.calls.forEach(call => {
        expect(call[0].success).toBe(true);
      });
    });

    test('resetHistory=true时应该重置访问历史', async () => {
      // 先访问一些朋友圈
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      // 带重置参数的请求
      mockReq.query.resetHistory = 'true';
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      const call = mockRes.json.mock.calls[mockRes.json.mock.calls.length - 1];
      const responseData = call[0];
      
      expect(responseData.success).toBe(true);
      expect(responseData.data.randomInfo.visitedCount).toBe(1); // 重置后只有1个
    });

    test('没有public朋友圈时应该返回成功但数据为空', async () => {
      // 删除所有public朋友圈
      await Circle.updateMany({ isPublic: true }, { isPublic: false });

      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(true);
      expect(responseData.message).toContain('暂无可用的公开朋友圈');
      expect(responseData.data.circle).toBeNull();
      expect(responseData.data.randomInfo.totalAvailable).toBe(0);
      expect(responseData.data.randomInfo.isHistoryReset).toBe(false);
      
      // 确保没有调用status方法设置错误状态码
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('未登录用户也应该能访问随机public朋友圈', async () => {
      mockReq.user = null; // 模拟未登录状态
      mockReq.query = {
        openid: 'temp_user_' + Date.now() // 使用临时 openid
      };

      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(true);
      expect(responseData.data.circle).toBeDefined();
      expect(responseData.data.quota).toBeDefined();
      expect(responseData.data.quota.isTemp).toBe(true);
      expect(responseData.data.randomInfo.visitedCount).toBe(0); // 未登录用户不会有访问历史统计
    });

    test('没有提供openid时应该返回错误', async () => {
      mockReq.query = {}; // 不提供 openid

      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(false);
      expect(responseData.code).toBe('OPENID_REQUIRED');
      expect(responseData.message).toContain('openid');
    });
  });



  describe('图片帖子过滤功能', () => {
    beforeEach(async () => {
      // 清理之前的帖子
      await Post.deleteMany({});
    });

    test('应该只返回有图片帖子的朋友圈', async () => {
      // 为 publicCircle1 创建带图片的帖子
      await createTestPost({
        content: '这是一个有图片的帖子',
        images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg']
      }, testUser1, publicCircle1);

      // 为 publicCircle2 创建没有图片的帖子
      await createTestPost({
        content: '这是一个没有图片的帖子',
        images: []
      }, testUser2, publicCircle2);

      // publicCircle3 没有帖子

      // 多次请求，验证只返回 publicCircle1
      const testRounds = 3; // 改为3次，避免超出配额
      for (let i = 0; i < testRounds; i++) {
        mockRes.json.mockClear();
        mockRes.status.mockClear();
        await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

        const call = mockRes.json.mock.calls[0];
        const responseData = call[0];

        expect(responseData.success).toBe(true);
        expect(responseData.data.circle).toBeDefined();
        expect(responseData.data.circle._id.toString()).toBe(publicCircle1._id.toString());
        expect(responseData.data.circle.latestPost).toBeDefined();
        expect(responseData.data.circle.latestPost.images).toBeDefined();
        expect(responseData.data.circle.latestPost.images.length).toBeGreaterThan(0);
      }
    });

    test('应该过滤没有帖子的朋友圈', async () => {
      // 只为 publicCircle1 和 publicCircle2 创建带图片的帖子
      await createTestPost({
        content: '朋友圈1的帖子',
        images: ['https://example.com/image1.jpg']
      }, testUser1, publicCircle1);

      await createTestPost({
        content: '朋友圈2的帖子',
        images: ['https://example.com/image2.jpg']
      }, testUser2, publicCircle2);

      // publicCircle3 没有帖子

      // 多次请求，验证不会返回 publicCircle3（限制在配额内）
      const testRounds = 3;
      const returnedCircleIds = new Set();
      
      for (let i = 0; i < testRounds; i++) {
        mockRes.json.mockClear();
        mockRes.status.mockClear();
        mockReq.query.excludeVisited = 'false'; // 允许重复访问
        
        await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

        const call = mockRes.json.mock.calls[0];
        const responseData = call[0];

        if (responseData.success && responseData.data.circle) {
          returnedCircleIds.add(responseData.data.circle._id.toString());
        }
      }

      // 应该只返回 publicCircle1 和 publicCircle2，不会返回 publicCircle3
      expect(returnedCircleIds.size).toBeGreaterThan(0);
      expect(returnedCircleIds.has(publicCircle3._id.toString())).toBe(false);
    });

    test('应该过滤帖子没有图片的朋友圈', async () => {
      // publicCircle1: 有图片的帖子
      await createTestPost({
        content: '有图片',
        images: ['https://example.com/image.jpg']
      }, testUser1, publicCircle1);

      // publicCircle2: 没有图片的帖子
      await createTestPost({
        content: '没有图片',
        images: []
      }, testUser2, publicCircle2);

      // publicCircle3: 没有帖子

      // 多次请求（限制在配额内）
      const testRounds = 3;
      for (let i = 0; i < testRounds; i++) {
        mockRes.json.mockClear();
        mockRes.status.mockClear();
        mockReq.query.excludeVisited = 'false';
        
        await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

        const call = mockRes.json.mock.calls[0];
        const responseData = call[0];

        expect(responseData.success).toBe(true);
        expect(responseData.data.circle).toBeDefined();
        // 只应该返回 publicCircle1
        expect(responseData.data.circle._id.toString()).toBe(publicCircle1._id.toString());
        expect(responseData.data.circle.latestPost.images.length).toBeGreaterThan(0);
      }
    });

    test('没有符合条件的朋友圈时应该返回空结果', async () => {
      // 所有朋友圈都没有带图片的帖子
      await createTestPost({
        content: '没有图片1',
        images: []
      }, testUser1, publicCircle1);

      await createTestPost({
        content: '没有图片2',
        images: []
      }, testUser2, publicCircle2);

      // publicCircle3 没有帖子

      mockRes.json.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(true);
      expect(responseData.message).toContain('暂无可用的公开朋友圈');
      expect(responseData.data.circle).toBeNull();
    });

    test('应该返回最新的帖子', async () => {
      // 为 publicCircle1 创建多个帖子
      const oldPost = await createTestPost({
        content: '旧帖子',
        images: ['https://example.com/old.jpg'],
        createdAt: new Date('2024-01-01')
      }, testUser1, publicCircle1);

      // 等待一小段时间确保时间戳不同
      await new Promise(resolve => setTimeout(resolve, 10));

      const newPost = await createTestPost({
        content: '新帖子',
        images: ['https://example.com/new.jpg']
      }, testUser1, publicCircle1);

      mockRes.json.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(true);
      expect(responseData.data.circle.latestPost).toBeDefined();
      // 应该返回最新的帖子
      expect(responseData.data.circle.latestPost._id.toString()).toBe(newPost._id.toString());
      expect(responseData.data.circle.latestPost.content).toBe('新帖子');
    });

    test('支持不同格式的图片数据', async () => {
      // 测试对象格式的图片
      await createTestPost({
        content: '对象格式图片',
        images: [
          { url: 'https://example.com/image1.jpg', width: 800, height: 600 },
          { url: 'https://example.com/image2.jpg', width: 1024, height: 768 }
        ]
      }, testUser1, publicCircle1);

      mockRes.json.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(true);
      expect(responseData.data.circle.latestPost.images.length).toBe(2);
    });
  });

  describe('配额限制测试', () => {
    test('应该正确返回配额信息', async () => {
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(true);
      expect(responseData.data.quota).toBeDefined();
      expect(responseData.data.quota.daily).toBe(3);
      expect(responseData.data.quota.used).toBe(1);
      expect(responseData.data.quota.remaining).toBe(2);
      expect(responseData.data.quota.resetAt).toBeDefined();
      expect(responseData.data.quota.hasPurchase).toBe(false);
    });

    test('应该在第4次请求时返回配额超限错误', async () => {
      // 前3次请求应该成功
      for (let i = 0; i < 3; i++) {
        mockRes.json.mockClear();
        mockRes.status.mockClear();
        await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

        const call = mockRes.json.mock.calls[0];
        const responseData = call[0];

        expect(responseData.success).toBe(true);
        expect(responseData.data.quota.used).toBe(i + 1);
        expect(responseData.data.quota.remaining).toBe(2 - i);
      }

      // 第4次请求应该失败
      mockRes.json.mockClear();
      mockRes.status.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(false);
      expect(responseData.code).toBe('QUOTA_EXCEEDED');
      expect(responseData.message).toContain('今日发现次数已用完');
      expect(responseData.data.quota.used).toBe(3);
      expect(responseData.data.quota.remaining).toBe(0);
    });

    test('购物用户应该有更多配额（8次）', async () => {
      // 设置用户为购物用户
      testUser1.discoverQuota.hasPurchase = true;
      await testUser1.save();

      // 前8次请求应该成功
      for (let i = 0; i < 8; i++) {
        mockRes.json.mockClear();
        mockRes.status.mockClear();
        await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

        const call = mockRes.json.mock.calls[0];
        const responseData = call[0];

        expect(responseData.success).toBe(true);
        expect(responseData.data.quota.daily).toBe(8);
        expect(responseData.data.quota.used).toBe(i + 1);
        expect(responseData.data.quota.remaining).toBe(7 - i);
        expect(responseData.data.quota.hasPurchase).toBe(true);
      }

      // 第9次请求应该失败
      mockRes.json.mockClear();
      mockRes.status.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(false);
      expect(responseData.code).toBe('QUOTA_EXCEEDED');
      expect(responseData.data.quota.used).toBe(8);
      expect(responseData.data.quota.remaining).toBe(0);
    });

    test('配额应该在新的一天自动重置', async () => {
      // 用完今天的配额
      for (let i = 0; i < 3; i++) {
        mockRes.json.mockClear();
        await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
      }

      // 验证配额已用完
      mockRes.json.mockClear();
      mockRes.status.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
      expect(mockRes.status).toHaveBeenCalledWith(429);

      // 模拟新的一天（修改用户的lastDate）
      const user = await User.findById(testUser1._id);
      user.discoverQuota.lastDate = '2026-02-11'; // 昨天的日期
      await user.save();

      // 新的一天应该可以再次请求
      mockRes.json.mockClear();
      mockRes.status.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(true);
      expect(responseData.data.quota.used).toBe(1);
      expect(responseData.data.quota.remaining).toBe(2);
    });

    test('未登录用户应该有配额限制（每天3次）', async () => {
      const tempOpenid = 'temp_user_' + Date.now();
      mockReq.query = { openid: tempOpenid };

      // 前3次请求应该成功
      for (let i = 0; i < 3; i++) {
        mockRes.json.mockClear();
        mockRes.status.mockClear();
        await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

        const call = mockRes.json.mock.calls[0];
        const responseData = call[0];

        expect(responseData.success).toBe(true);
        expect(responseData.data.quota).toBeDefined();
        expect(responseData.data.quota.isTemp).toBe(true);
        expect(responseData.data.quota.daily).toBe(3);
        expect(responseData.data.quota.used).toBe(i + 1);
        expect(responseData.data.quota.remaining).toBe(2 - i);
      }

      // 第4次请求应该失败
      mockRes.json.mockClear();
      mockRes.status.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(false);
      expect(responseData.code).toBe('QUOTA_EXCEEDED');
      expect(responseData.message).toContain('登录');
      expect(responseData.data.quota.isTemp).toBe(true);
    });

    test('应该在接近配额时给出友好提示', async () => {
      // 第1次请求
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
      let call = mockRes.json.mock.calls[0];
      let responseData = call[0];
      expect(responseData.message).toBe('获取随机朋友圈成功');

      // 第2次请求
      mockRes.json.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
      call = mockRes.json.mock.calls[0];
      responseData = call[0];
      expect(responseData.message).toContain('还剩最后 1 次机会');

      // 第3次请求
      mockRes.json.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
      call = mockRes.json.mock.calls[0];
      responseData = call[0];
      expect(responseData.message).toContain('今日次数已用完');
    });

    test('配额超限时应该包含引导购物的提示', async () => {
      // 用完配额
      for (let i = 0; i < 3; i++) {
        mockRes.json.mockClear();
        await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
      }

      // 第4次请求
      mockRes.json.mockClear();
      mockRes.status.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.message).toContain('购物用户');
      expect(responseData.message).toContain('8');
    });

    test('自定义配额消息应该生效', async () => {
      // 设置自定义消息
      testUser1.discoverQuota.customMessage = '您的VIP配额已用完，请联系客服';
      await testUser1.save();

      // 用完配额
      for (let i = 0; i < 3; i++) {
        mockRes.json.mockClear();
        await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
      }

      // 第4次请求应该返回自定义消息
      mockRes.json.mockClear();
      mockRes.status.mockClear();
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.message).toBe('您的VIP配额已用完，请联系客服');
    });
  });

  describe('性能测试', () => {
    test('连续多次请求应该稳定', async () => {
      // 先为所有朋友圈创建带图片的帖子
      await createTestPost({
        images: ['https://example.com/1.jpg']
      }, testUser1, publicCircle1);
      
      await createTestPost({
        images: ['https://example.com/2.jpg']
      }, testUser2, publicCircle2);
      
      await createTestPost({
        images: ['https://example.com/3.jpg']
      }, testUser3, publicCircle3);

      const requestCount = 3; // 限制在配额内
      const startTime = Date.now();
      
      let successCount = 0;

      for (let i = 0; i < requestCount; i++) {
        mockRes.json.mockClear();
        mockRes.status.mockClear();
        mockReq.query.excludeVisited = 'false';
        await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
        
        if (mockRes.json.mock.calls.length > 0) {
          const call = mockRes.json.mock.calls[0];
          if (call[0].success) {
            successCount++;
          }
        }
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // 平均每个请求应该在合理时间内完成
      expect(totalTime / requestCount).toBeLessThan(200);
      
      // 所有请求都应该成功
      expect(successCount).toBe(requestCount);
      
      console.log(`🚀 性能测试: ${requestCount}个随机朋友圈请求耗时 ${totalTime}ms，平均 ${totalTime/requestCount}ms/请求`);
    });

    test('重试机制性能测试', async () => {
      // 清理之前的帖子
      await Post.deleteMany({});
      
      // 创建一个符合条件的朋友圈和多个不符合条件的
      await createTestPost({
        images: ['https://example.com/valid.jpg']
      }, testUser1, publicCircle1);

      // publicCircle2 和 publicCircle3 没有符合条件的帖子
      await createTestPost({
        images: []
      }, testUser2, publicCircle2);

      const startTime = Date.now();
      mockRes.json.mockClear();
      
      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // 即使需要重试，也应该在合理时间内完成
      expect(responseTime).toBeLessThan(500);

      const call = mockRes.json.mock.calls[0];
      const responseData = call[0];

      expect(responseData.success).toBe(true);
      expect(responseData.data.circle._id.toString()).toBe(publicCircle1._id.toString());
      
      console.log(`🔄 重试机制测试: 耗时 ${responseTime}ms`);
    });
  });
});