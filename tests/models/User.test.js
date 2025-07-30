const mongoose = require('mongoose');
const User = require('../../models/User');
const { createTestUser } = require('../helpers/testUtils');

describe('User Model Test', () => {
  describe('User Schema', () => {
    test('should create a user with valid data', async () => {
      const userData = {
        username: 'testuser',
        openid: 'test_openid_123',
        avatar: 'https://example.com/avatar.jpg'
      };

      const user = await User.create(userData);

      expect(user.username).toBe(userData.username);
      expect(user.openid).toBe(userData.openid);
      expect(user.avatar).toBe(userData.avatar);
      expect(user._id).toBeDefined();
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    test('should require username', async () => {
      const userData = {
        openid: 'test_openid_123'
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
        expect(error.errors.openid).toBeDefined();
      }
    });

    test('should have unique username', async () => {
      const userData = {
        username: 'testuser',
        openid: 'test_openid_123'
      };

      await User.create(userData);

      try {
        await User.create(userData);
        fail('Should have thrown duplicate key error');
      } catch (error) {
        expect(error.code).toBe(11000);
      }
    });

    test('should have unique openid', async () => {
      const userData = {
        username: 'testuser1',
        openid: 'test_openid_123'
      };

      await User.create(userData);

      const duplicateUserData = {
        username: 'testuser2',
        openid: 'test_openid_123'
      };

      try {
        await User.create(duplicateUserData);
        fail('Should have thrown duplicate key error');
      } catch (error) {
        expect(error.code).toBe(11000);
      }
    });

    test('should set default avatar to empty string', async () => {
      const userData = {
        username: 'testuser',
        openid: 'test_openid_123'
      };

      const user = await User.create(userData);
      expect(user.avatar).toBe('');
    });
  });

  describe('User Instance Methods', () => {
    test('should return correct JSON representation', async () => {
      const user = await createTestUser();
      const userJson = user.toJSON();

      expect(userJson._id).toBeDefined();
      expect(userJson.username).toBe(user.username);
      expect(userJson.openid).toBe(user.openid);
      expect(userJson.avatar).toBe(user.avatar);
      expect(userJson.createdAt).toBeDefined();
      expect(userJson.updatedAt).toBeDefined();
    });
  });
}); 