const mongoose = require('mongoose');
const Circle = require('../../models/Circle');
const User = require('../../models/User');
const { createTestUser, createTestCircle } = require('../helpers/testUtils');
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

    // 设置mock请求和响应对象
    mockReq = {
      user: testUser1,  // 保留以兼容旧测试
      query: {
        openid: testUser1.openid  // 添加 openid 让 controller 能识别用户
      }
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

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: '暂无可用的公开朋友圈',
          data: expect.objectContaining({
            circle: null,
            randomInfo: expect.objectContaining({
              totalAvailable: 0,
              visitedCount: expect.any(Number),
              isHistoryReset: false
            })
          })
        })
      );
      // 确保没有调用status方法设置错误状态码
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('未登录用户也应该能访问随机public朋友圈', async () => {
      mockReq.user = null; // 模拟未登录状态
      mockReq.query = {}; // 移除 openid，模拟未登录

      await randomCircleController.getRandomPublicCircle(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            circle: expect.any(Object),
            randomInfo: expect.objectContaining({
              visitedCount: 0 // 未登录用户不会有访问历史统计
            })
          })
        })
      );
    });
  });



  describe('性能测试', () => {
    test('连续多次请求应该稳定', async () => {
      const requestCount = 10;
      const startTime = Date.now();

      for (let i = 0; i < requestCount; i++) {
        await randomCircleController.getRandomPublicCircle(mockReq, mockRes);
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // 平均每个请求应该在合理时间内完成（假设每个请求不超过100ms）
      expect(totalTime / requestCount).toBeLessThan(100);
      
      // 所有请求都应该成功
      expect(mockRes.json).toHaveBeenCalledTimes(requestCount);
      
      console.log(`🚀 性能测试: ${requestCount}个随机朋友圈请求耗时 ${totalTime}ms，平均 ${totalTime/requestCount}ms/请求`);
    });
  });
});