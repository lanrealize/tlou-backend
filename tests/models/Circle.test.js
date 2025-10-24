const mongoose = require('mongoose');
const Circle = require('../../models/Circle');
const { createTestUser, createTestCircle } = require('../helpers/testUtils');

describe('Circle Model Test', () => {
  describe('Circle Schema', () => {
    test('should create a circle with valid data', async () => {
      const creator = await createTestUser();
      const circleData = {
        name: '测试朋友圈',
        creator: creator._id,
        members: [creator._id],
        isPublic: true
      };

      const circle = await Circle.create(circleData);

      expect(circle.name).toBe(circleData.name);
      expect(circle.creator.toString()).toBe(creator._id.toString());
      expect(circle.members).toHaveLength(1);
      expect(circle.members[0].toString()).toBe(creator._id.toString());
      expect(circle.isPublic).toBe(true);
      expect(circle._id).toBeDefined();
      expect(circle.createdAt).toBeDefined();
      expect(circle.updatedAt).toBeDefined();
    });

    test('should require name', async () => {
      const creator = await createTestUser();
      const circleData = {
        creator: creator._id,
        members: [creator._id]
      };

      try {
        await Circle.create(circleData);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.name).toBeDefined();
      }
    });

    test('should require creator', async () => {
      const circleData = {
        name: '测试朋友圈',
        members: []
      };

      try {
        await Circle.create(circleData);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.creator).toBeDefined();
      }
    });

    test('should set default isPublic to true', async () => {
      const creator = await createTestUser();
      const circleData = {
        name: '测试朋友圈',
        creator: creator._id,
        members: [creator._id]
      };

      const circle = await Circle.create(circleData);
      expect(circle.isPublic).toBe(true);
    });

    test('should set default stats', async () => {
      const creator = await createTestUser();
      const circleData = {
        name: '测试朋友圈',
        creator: creator._id,
        members: [creator._id]
      };

      const circle = await Circle.create(circleData);
      expect(circle.stats.totalPosts).toBe(0);
      expect(circle.stats.totalMembers).toBe(0);
    });

    test('should set default latestActivityTime', async () => {
      const creator = await createTestUser();
      const circleData = {
        name: '测试朋友圈',
        creator: creator._id,
        members: [creator._id]
      };

      const beforeCreate = new Date();
      const circle = await Circle.create(circleData);
      const afterCreate = new Date();

      expect(circle.latestActivityTime).toBeDefined();
      expect(circle.latestActivityTime instanceof Date).toBe(true);
      expect(circle.latestActivityTime.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      expect(circle.latestActivityTime.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
    });
  });

  describe('Circle Instance Methods', () => {
    test('should check if user is member correctly', async () => {
      const creator = await createTestUser();
      const member = await createTestUser();
      const nonMember = await createTestUser();

      const circle = await Circle.create({
        name: '测试朋友圈',
        creator: creator._id,
        members: [member._id],
        isPublic: true
      });

      // 创建者应该是成员
      expect(circle.isMember(creator._id)).toBe(true);
      
      // 明确添加的成员应该是成员
      expect(circle.isMember(member._id)).toBe(true);
      
      // 非成员不应该是成员
      expect(circle.isMember(nonMember._id)).toBe(false);
    });

    test('should update member stats correctly', async () => {
      const creator = await createTestUser();
      const member1 = await createTestUser();
      const member2 = await createTestUser();

      const circle = await Circle.create({
        name: '测试朋友圈',
        creator: creator._id,
        members: [member1._id, member2._id],
        isPublic: true
      });

      circle.updateMemberStats();
      expect(circle.stats.totalMembers).toBe(3); // creator + 2 members
    });

    test('should update activity time correctly', async () => {
      const creator = await createTestUser();
      const circle = await Circle.create({
        name: '测试朋友圈',
        creator: creator._id,
        members: [creator._id],
        isPublic: true
      });

      const originalActivityTime = circle.latestActivityTime;
      
      // 等待一小段时间确保时间差异
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

    test('should populate members correctly', async () => {
      const creator = await createTestUser();
      const member1 = await createTestUser();
      const member2 = await createTestUser();

      const circle = await Circle.create({
        name: '测试朋友圈',
        creator: creator._id,
        members: [member1._id, member2._id],
        isPublic: true
      });

      const populatedCircle = await Circle.findById(circle._id).populate('members');
      
      expect(populatedCircle.members).toHaveLength(2);
      expect(populatedCircle.members[0].username).toBe(member1.username);
      expect(populatedCircle.members[1].username).toBe(member2.username);
    });
  });
}); 