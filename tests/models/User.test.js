const mongoose = require('mongoose');
const User = require('../../models/User');
const { createTestUser } = require('../helpers/testUtils');

describe('User Model Test', () => {
  describe('User Schema', () => {
    test('should create a user with valid data', async () => {
      const userData = {
        _id: 'test_openid_123',  // openid作为主键
        username: 'testuser',
        avatar: 'https://example.com/avatar.jpg'
      };

      const user = await User.create(userData);

      expect(user.username).toBe(userData.username);
      expect(user._id).toBe(userData._id);  // _id就是openid
      expect(user.avatar).toBe(userData.avatar);
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    test('should require username', async () => {
      const userData = {
        _id: 'test_openid_123'  // openid作为主键，但缺少username
      };

      try {
        await User.create(userData);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.username).toBeDefined();
      }
    });

    test('should require openid', async () => {
      const userData = {
        username: 'testuser'
      };

      try {
        await User.create(userData);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors._id).toBeDefined();
      }
    });

    test('should have unique openid (_id)', async () => {
      const userData = {
        _id: 'test_openid_123',  // openid作为主键
        username: 'testuser'
      };

      await User.create(userData);

      try {
        const duplicateData = {
          _id: 'test_openid_123',  // 相同的openid
          username: 'different_user'
        };
        await User.create(duplicateData);
        fail('Should have thrown duplicate key error');
      } catch (error) {
        expect(error.code).toBe(11000);
      }
    });

    test('should set default avatar to empty string', async () => {
      const userData = {
        _id: 'test_openid_default_avatar',
        username: 'testuser_default'
      };

      const user = await User.create(userData);
      expect(user.avatar).toBe('');
    });

    test('should validate required _id field', async () => {
      const userData = {
        _id: 'test_openid_avatar_test',
        username: 'testuser'
      };

      const user = await User.create(userData);
      expect(user._id).toBe('test_openid_avatar_test');
      expect(user.avatar).toBe('');
    });
  });

  describe('User Instance Methods', () => {
    test('should return correct JSON representation', async () => {
      const user = await createTestUser();
      const userJson = user.toJSON();

      expect(userJson._id).toBeDefined();
      expect(userJson.username).toBe(user.username);
      expect(userJson._id).toBe(user._id);
      expect(userJson.avatar).toBe(user.avatar);
      expect(userJson.createdAt).toBeDefined();
      expect(userJson.updatedAt).toBeDefined();
    });
  });
}); 