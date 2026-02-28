const mongoose = require('mongoose');
const Post = require('../../models/Post');
const { createTestUser, createTestCircle, createTestPost } = require('../helpers/testUtils');

describe('Post Model Test', () => {
  describe('Post Schema', () => {
    test('should create a post with valid data', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const postData = {
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id,
        images: ['image1.jpg', 'image2.jpg'],
        comments: []
      };

      const post = await Post.create(postData);

      expect(post.content).toBe(postData.content);
      expect(post.author.toString()).toBe(author._id.toString());
      expect(post.circle.toString()).toBe(circle._id.toString());
      expect(post.images).toEqual(postData.images);
      expect(post.reactions).toEqual([]);
      expect(post.comments).toEqual([]);
      expect(post._id).toBeDefined();
      expect(post.createdAt).toBeDefined();
      expect(post.updatedAt).toBeDefined();
    });

    test('should require author', async () => {
      const circle = await createTestCircle();
      
      const postData = {
        content: '测试帖子内容',
        circle: circle._id,
        images: []
      };

      try {
        await Post.create(postData);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.author).toBeDefined();
      }
    });

    test('should require circle', async () => {
      const author = await createTestUser();
      
      const postData = {
        content: '测试帖子内容',
        author: author._id,
        images: []
      };

      try {
        await Post.create(postData);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.circle).toBeDefined();
      }
    });

    test('should set default content to empty string', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const postData = {
        author: author._id,
        circle: circle._id,
        images: []
      };

      const post = await Post.create(postData);
      expect(post.content).toBe('');
    });

    test('should set default images to empty array', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const postData = {
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id
      };

      const post = await Post.create(postData);
      expect(post.images).toEqual([]);
    });

    test('should set default reactions to empty array', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);

      const postData = {
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id
      };

      const post = await Post.create(postData);
      expect(post.reactions).toEqual([]);
    });

    test('should set default comments to empty array', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const postData = {
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id
      };

      const post = await Post.create(postData);
      expect(post.comments).toEqual([]);
    });
  });

  describe('Post Reactions', () => {
    test('should default reactions to empty array', async () => {
      const post = await createTestPost();
      expect(post.reactions).toEqual([]);
    });
  });

  describe('Post Comments', () => {
    test('should add comment to post', async () => {
      const author = await createTestUser();
      const commenter = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const post = await Post.create({
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id,
        comments: []
      });

      const comment = {
        _id: new mongoose.Types.ObjectId(),
        author: commenter._id,
        content: '测试评论',
        replyTo: null,
        createdAt: new Date()
      };

      post.comments.push(comment);
      await post.save();

      expect(post.comments).toHaveLength(1);
      expect(post.comments[0].content).toBe('测试评论');
      expect(post.comments[0].author.toString()).toBe(commenter._id.toString());
    });

    test('should add reply comment', async () => {
      const author = await createTestUser();
      const commenter = await createTestUser();
      const replier = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const post = await Post.create({
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id,
        comments: []
      });

      const comment = {
        _id: new mongoose.Types.ObjectId(),
        author: commenter._id,
        content: '测试评论',
        replyTo: null,
        createdAt: new Date()
      };

      const reply = {
        _id: new mongoose.Types.ObjectId(),
        author: replier._id,
        content: '回复评论',
        replyTo: commenter._id,
        createdAt: new Date()
      };

      post.comments.push(comment);
      post.comments.push(reply);
      await post.save();

      expect(post.comments).toHaveLength(2);
      expect(post.comments[1].replyTo.toString()).toBe(commenter._id.toString());
    });
  });

  describe('Post Population', () => {
    test('should populate author correctly', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      const post = await createTestPost({}, author, circle);

      const populatedPost = await Post.findById(post._id).populate('author');
      
      expect(populatedPost.author).toBeDefined();
      expect(populatedPost.author.username).toBe(author.username);
      expect(populatedPost.author._id).toBe(author._id);
    });

    test('should populate circle correctly', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      const post = await createTestPost({}, author, circle);

      const populatedPost = await Post.findById(post._id).populate('circle');
      
      expect(populatedPost.circle).toBeDefined();
      expect(populatedPost.circle.name).toBe(circle.name);
      expect(populatedPost.circle.creator.toString()).toBe(author._id.toString());
    });

  });

  describe('Post Indexes', () => {
    test('should have compound index on circle and createdAt', async () => {
      // 确保索引已创建
      await Post.createIndexes();
      
      const indexes = await Post.collection.getIndexes();
      
      // 查找复合索引 - 检查索引名称
      const compoundIndex = Object.entries(indexes).find(
        ([name, index]) => name === 'circle_1_createdAt_-1'
      );
      
      expect(compoundIndex).toBeDefined();
      expect(compoundIndex[1]).toEqual([
        ['circle', 1],
        ['createdAt', -1]
      ]);
    });
  });

  describe('Post JSON Serialization', () => {
    test('should include imageDescription field in JSON', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);

      const post = await Post.create({
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id,
        imageDescription: '一张美丽的日落照片'
      });

      const postJson = post.toJSON();

      expect(postJson.imageDescription).toBe('一张美丽的日落照片');
      expect(postJson._id).toBeDefined();
      expect(postJson.content).toBe('测试帖子内容');
    });
  });

  describe('Post Images Validation', () => {
    test('should accept string images (old format)', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const postData = {
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id,
        images: ['image1.jpg', 'image2.jpg']
      };

      const post = await Post.create(postData);
      expect(post.images).toEqual(['image1.jpg', 'image2.jpg']);
    });

    test('should accept object images with url, width, height (new format)', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const postData = {
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id,
        images: [
          { url: 'image1.jpg', width: 300, height: 200 },
          { url: 'image2.jpg', width: 400, height: 300 }
        ]
      };

      const post = await Post.create(postData);
      expect(post.images).toEqual([
        { url: 'image1.jpg', width: 300, height: 200 },
        { url: 'image2.jpg', width: 400, height: 300 }
      ]);
    });

    test('should accept mixed image formats', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const postData = {
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id,
        images: [
          'oldformat.jpg',
          { url: 'newformat.jpg', width: 320, height: 240 }
        ]
      };

      const post = await Post.create(postData);
      expect(post.images).toEqual([
        'oldformat.jpg',
        { url: 'newformat.jpg', width: 320, height: 240 }
      ]);
    });

    test('should reject object images missing required fields', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const postData = {
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id,
        images: [
          { url: 'image1.jpg' }  // 缺少width和height
        ]
      };

      try {
        await Post.create(postData);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.images).toBeDefined();
        expect(error.errors.images.message).toContain('images数组元素必须是字符串URL或包含{url, width, height}的对象');
      }
    });

    test('should reject object images with invalid types', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const postData = {
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id,
        images: [
          { url: 'image1.jpg', width: 'invalid', height: 200 }  // width不是数字
        ]
      };

      try {
        await Post.create(postData);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.images).toBeDefined();
        expect(error.errors.images.message).toContain('images数组元素必须是字符串URL或包含{url, width, height}的对象');
      }
    });

    test('should reject invalid image format', async () => {
      const author = await createTestUser();
      const circle = await createTestCircle({}, author);
      
      const postData = {
        content: '测试帖子内容',
        author: author._id,
        circle: circle._id,
        images: [123]  // 数字不是有效格式
      };

      try {
        await Post.create(postData);
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.errors.images).toBeDefined();
        expect(error.errors.images.message).toContain('images数组元素必须是字符串URL或包含{url, width, height}的对象');
      }
    });
  });
}); 