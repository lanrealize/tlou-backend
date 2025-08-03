const { updateCircleActivity } = require('../../utils/circleUtils');
const Circle = require('../../models/Circle');
const { createTestUser, createTestCircle } = require('../helpers/testUtils');

describe('Circle Utils Test', () => {
  describe('updateCircleActivity', () => {
    test('should update circle activity time', async () => {
      const creator = await createTestUser();
      const circle = await createTestCircle({}, creator);
      
      const originalActivityTime = circle.latestActivityTime;
      
      // 等待一小段时间确保时间差异
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await updateCircleActivity(circle._id);
      
      const updatedCircle = await Circle.findById(circle._id);
      expect(updatedCircle.latestActivityTime.getTime()).toBeGreaterThan(originalActivityTime.getTime());
    });

    test('should handle invalid circle id gracefully', async () => {
      // 使用无效的ID，应该不抛出错误
      const invalidId = '507f1f77bcf86cd799439011';
      
      // 这应该不抛出错误（静默处理）
      await expect(updateCircleActivity(invalidId)).resolves.toBeUndefined();
    });

    test('should handle null circle id gracefully', async () => {
      // 应该不抛出错误（静默处理）
      await expect(updateCircleActivity(null)).resolves.toBeUndefined();
    });
  });
});