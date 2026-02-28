const Circle = require('../../models/Circle');
const { createTestUser, createTestCircle } = require('../helpers/testUtils');

describe('Circle Model Test', () => {
  describe('Circle Schema', () => {
    test('should create a circle with valid data', async () => {
      const creator = await createTestUser();
      const circle = await Circle.create({ name: '测试朋友圈', creator: creator._id });

      expect(circle.name).toBe('测试朋友圈');
      expect(circle.creator.toString()).toBe(creator._id.toString());
      expect(circle._id).toBeDefined();
      expect(circle.createdAt).toBeDefined();
      expect(circle.updatedAt).toBeDefined();
    });

    test('should require name', async () => {
      const creator = await createTestUser();
      try {
        await Circle.create({ creator: creator._id });
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.name).toBeDefined();
      }
    });

    test('should require creator', async () => {
      try {
        await Circle.create({ name: '测试朋友圈' });
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.creator).toBeDefined();
      }
    });

    test('should set default stats', async () => {
      const creator = await createTestUser();
      const circle = await Circle.create({ name: '测试朋友圈', creator: creator._id });
      expect(circle.stats.totalPosts).toBe(0);
    });

    test('should set default latestActivityTime', async () => {
      const creator = await createTestUser();
      const beforeCreate = new Date();
      const circle = await Circle.create({ name: '测试朋友圈', creator: creator._id });
      const afterCreate = new Date();

      expect(circle.latestActivityTime).toBeDefined();
      expect(circle.latestActivityTime instanceof Date).toBe(true);
      expect(circle.latestActivityTime.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(circle.latestActivityTime.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });

    test('should store aiPersona as null by default', async () => {
      const creator = await createTestUser();
      const circle = await Circle.create({ name: '测试朋友圈', creator: creator._id });
      expect(circle.aiPersona).toBeNull();
    });
  });

  describe('Circle Instance Methods', () => {
    test('should check if user is creator correctly', async () => {
      const creator = await createTestUser();
      const other = await createTestUser();
      const circle = await Circle.create({ name: '测试朋友圈', creator: creator._id });

      expect(circle.isCreator(creator._id)).toBe(true);
      expect(circle.isCreator(other._id)).toBe(false);
    });

    test('should update activity time correctly', async () => {
      const creator = await createTestUser();
      const circle = await Circle.create({ name: '测试朋友圈', creator: creator._id });

      const originalActivityTime = circle.latestActivityTime;
      await new Promise(resolve => setTimeout(resolve, 10));
      await circle.updateActivityTime();

      expect(circle.latestActivityTime.getTime()).toBeGreaterThan(originalActivityTime.getTime());
    });
  });

  describe('Circle Population', () => {
    test('should populate creator correctly', async () => {
      const creator = await createTestUser();
      const circle = await createTestCircle({}, creator);

      const populatedCircle = await Circle.findById(circle._id).populate('creator');

      expect(populatedCircle.creator).toBeDefined();
      expect(populatedCircle.creator.username).toBe(creator.username);
      expect(populatedCircle.creator._id).toBe(creator._id);
    });
  });
});
