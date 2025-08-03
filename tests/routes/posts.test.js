const request = require('supertest');
const express = require('express');
const { createTestUser, createTestCircle, createTestPost } = require('../helpers/testUtils');
const { globalErrorHandler } = require('../../utils/errorHandler');

// 创建测试应用
const app = express();
app.use(express.json());

// 模拟路由
const postsRoutes = require('../../routes/posts');
app.use('/api/posts', postsRoutes);

// 添加错误处理中间件
app.use(globalErrorHandler);

describe('Posts Routes Test', () => {
  let testUser, testCircle, testPost;

  beforeEach(async () => {
    testUser = await createTestUser();
    testCircle = await createTestCircle({}, testUser);
    testPost = await createTestPost({}, testUser, testCircle);
  });

  describe('POST /api/posts', () => {
    test('should create post with valid data', async () => {
      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试帖子内容',
        images: ['image1.jpg', 'image2.jpg'],
        openid: testUser.openid
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        message: '发布成功',
        data: {
          post: expect.objectContaining({
            content: '测试帖子内容',
            images: ['image1.jpg', 'image2.jpg'],
            author: expect.objectContaining({
              username: testUser.username
            })
          })
        }
      });
    });

    test('should create post with new image format (object with url)', async () => {
      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试帖子内容',
        images: [
          { url: 'https://tlou.images.wltech-service.site/image1.jpg', name: 'image1.jpg' },
          { url: 'https://tlou.images.wltech-service.site/image2.jpg', name: 'image2.jpg' }
        ],
        openid: testUser.openid
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        message: '发布成功',
        data: {
          post: expect.objectContaining({
            content: '测试帖子内容',
            images: [
              'https://tlou.images.wltech-service.site/image1.jpg',
              'https://tlou.images.wltech-service.site/image2.jpg'
            ],
            author: expect.objectContaining({
              username: testUser.username
            })
          })
        }
      });
    });

    test('should create post with mixed image formats', async () => {
      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试帖子内容',
        images: [
          'oldformat.jpg',  // 旧格式：直接URL字符串
          { url: 'https://tlou.images.wltech-service.site/newformat.jpg', name: 'newformat.jpg' }  // 新格式：对象
        ],
        openid: testUser.openid
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        message: '发布成功',
        data: {
          post: expect.objectContaining({
            content: '测试帖子内容',
            images: [
              'oldformat.jpg',
              'https://tlou.images.wltech-service.site/newformat.jpg'
            ],
            author: expect.objectContaining({
              username: testUser.username
            })
          })
        }
      });
    });

    test('should return 400 when circleId is missing', async () => {
      const postData = {
        content: '测试帖子内容',
        openid: testUser.openid
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: expect.stringContaining('朋友圈ID不能为空')
      });
    });

    test('should return 400 when circleId is invalid', async () => {
      const postData = {
        circleId: 'invalid_id',
        content: '测试帖子内容',
        openid: testUser.openid
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '输入验证失败: 无效的朋友圈ID'
      });
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const postData = {
        circleId: fakeId,
        content: '测试帖子内容',
        openid: testUser.openid
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });

    test('should return 403 when user is not circle member', async () => {
      const nonMember = await createTestUser();
      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试帖子内容',
        openid: nonMember.openid
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '您不是此朋友圈的成员'
      });
    });

    test('should return 401 when openid is missing', async () => {
      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试帖子内容'
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(401);

      expect(response.body).toEqual({
        status: 'fail',
        message: '缺少openid参数'
      });
    });
  });

  describe('GET /api/posts', () => {
    test('should return posts for circle', async () => {
      // 创建更多帖子
      await createTestPost({ content: '帖子2' }, testUser, testCircle);
      await createTestPost({ content: '帖子3' }, testUser, testCircle);

      const response = await request(app)
        .get('/api/posts')
        .query({ 
          circleId: testCircle._id.toString(),
          openid: testUser.openid 
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          posts: expect.arrayContaining([
            expect.objectContaining({
              content: expect.any(String),
              author: expect.objectContaining({
                username: testUser.username
              }),
              comments: expect.any(Array)
            })
          ])
        }
      });
    });

    test('should return 400 when circleId is missing', async () => {
      const response = await request(app)
        .get('/api/posts')
        .query({ openid: testUser.openid })
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: expect.stringContaining('朋友圈ID不能为空')
      });
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .get('/api/posts')
        .query({ 
          circleId: fakeId,
          openid: testUser.openid 
        })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });

    test('should return 403 when user has no access to private circle', async () => {
      const privateCircle = await createTestCircle({
        name: '私密朋友圈',
        isPublic: false
      });
      const nonMember = await createTestUser();

      const response = await request(app)
        .get('/api/posts')
        .query({ 
          circleId: privateCircle._id.toString(),
          openid: nonMember.openid 
        })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '无权查看此朋友圈的帖子'
      });
    });
  });

  describe('POST /api/posts/:id/like', () => {
    test('should like post successfully', async () => {
      const response = await request(app)
        .post(`/api/posts/${testPost._id}/like`)
        .send({ openid: testUser.openid })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '点赞成功',
        data: { liked: true }
      });
    });

    test('should unlike post when already liked', async () => {
      // 先点赞
      await testPost.updateOne({
        $addToSet: { likes: testUser._id }
      });

      const response = await request(app)
        .post(`/api/posts/${testPost._id}/like`)
        .send({ openid: testUser.openid })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '取消点赞成功',
        data: { liked: false }
      });
    });

    test('should return 404 when post does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .post(`/api/posts/${fakeId}/like`)
        .send({ openid: testUser.openid })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '帖子不存在'
      });
    });
  });

  describe('DELETE /api/posts/:id', () => {
    test('should delete own post successfully', async () => {
      const response = await request(app)
        .delete(`/api/posts/${testPost._id}`)
        .send({ openid: testUser.openid })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '帖子删除成功'
      });
    });

    test('should delete post with images and trigger qiniu cleanup', async () => {
      // 创建带有图片的测试帖子
      const postWithImages = await createTestPost({
        content: '带图片的帖子',
        images: [
          'https://tlou.images.wltech-service.site/test1.jpg',
          'https://tlou.images.wltech-service.site/test2.jpg'
        ]
      }, testUser, testCircle);

      // 模拟控制台日志以验证七牛云删除被调用
      const originalConsoleLog = console.log;
      const originalConsoleWarn = console.warn;
      const originalConsoleError = console.error;
      const mockLogs = [];

      console.log = (...args) => {
        mockLogs.push({ type: 'log', args });
        originalConsoleLog(...args);
      };
      console.warn = (...args) => {
        mockLogs.push({ type: 'warn', args });
        originalConsoleWarn(...args);
      };
      console.error = (...args) => {
        mockLogs.push({ type: 'error', args });
        originalConsoleError(...args);
      };

      const response = await request(app)
        .delete(`/api/posts/${postWithImages._id}`)
        .send({ openid: testUser.openid })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '帖子删除成功'
      });

      // 等待一小段时间让异步操作完成
      await new Promise(resolve => setTimeout(resolve, 100));

      // 恢复原始console方法
      console.log = originalConsoleLog;
      console.warn = originalConsoleWarn;
      console.error = originalConsoleError;

      // 验证七牛云删除相关的日志被记录（成功或失败都可以，取决于环境配置）
      const hasQiniuLogs = mockLogs.some(log => 
        log.args.some(arg => 
          typeof arg === 'string' && 
          (arg.includes('文件删除') || arg.includes('七牛云密钥'))
        )
      );
      expect(hasQiniuLogs).toBe(true);
    });

    test('should return 404 when post does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .delete(`/api/posts/${fakeId}`)
        .send({ openid: testUser.openid })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '帖子不存在或无权限删除'
      });
    });

    test('should return 404 when trying to delete others post', async () => {
      const otherUser = await createTestUser();
      const otherPost = await createTestPost({}, otherUser, testCircle);

      const response = await request(app)
        .delete(`/api/posts/${otherPost._id}`)
        .send({ openid: testUser.openid })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '帖子不存在或无权限删除'
      });
    });
  });

  describe('POST /api/posts/:id/comments', () => {
    test('should add comment successfully', async () => {
      const commentData = {
        content: '测试评论',
        openid: testUser.openid
      };

      const response = await request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .send(commentData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        message: '评论成功'
      });
    });

    test('should add reply comment successfully', async () => {
      const replyToUser = await createTestUser();
      const commentData = {
        content: '回复评论',
        replyToUserId: replyToUser._id.toString(),
        openid: testUser.openid
      };

      const response = await request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .send(commentData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        message: '评论成功'
      });
    });

    test('should return 400 when content is missing', async () => {
      const commentData = {
        openid: testUser.openid
      };

      const response = await request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .send(commentData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '输入验证失败: 评论内容不能为空'
      });
    });

    test('should return 404 when post does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const commentData = {
        content: '测试评论',
        openid: testUser.openid
      };

      const response = await request(app)
        .post(`/api/posts/${fakeId}/comments`)
        .send(commentData)
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '帖子不存在'
      });
    });

    test('should return 404 when replyToUserId is invalid', async () => {
      const commentData = {
        content: '回复评论',
        replyToUserId: 'invalid_user_id',
        openid: testUser.openid
      };

      const response = await request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .send(commentData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '输入验证失败: 无效的回复用户ID'
      });
    });
  });

  describe('DELETE /api/posts/:postId/comments/:commentId', () => {
    test('should delete own comment successfully', async () => {
      const mongoose = require('mongoose');
      // 添加评论
      const comment = {
        _id: new mongoose.Types.ObjectId(),
        author: testUser._id,
        content: '测试评论',
        replyTo: null,
        createdAt: new Date()
      };

      await testPost.updateOne({
        $push: { comments: comment }
      });

      const response = await request(app)
        .delete(`/api/posts/${testPost._id}/comments/${comment._id}`)
        .send({ openid: testUser.openid })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '评论删除成功'
      });
    });

    test('should return 404 when post does not exist', async () => {
      const fakePostId = '507f1f77bcf86cd799439011';
      const fakeCommentId = '507f1f77bcf86cd799439012';

      const response = await request(app)
        .delete(`/api/posts/${fakePostId}/comments/${fakeCommentId}`)
        .send({ openid: testUser.openid })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '帖子不存在'
      });
    });

    test('should return 404 when comment does not exist', async () => {
      const fakeCommentId = '507f1f77bcf86cd799439012';

      const response = await request(app)
        .delete(`/api/posts/${testPost._id}/comments/${fakeCommentId}`)
        .send({ openid: testUser.openid })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '评论不存在'
      });
    });

    test('should return 403 when trying to delete others comment', async () => {
      const mongoose = require('mongoose');
      const otherUser = await createTestUser();
      const comment = {
        _id: new mongoose.Types.ObjectId(),
        author: otherUser._id,
        content: '其他人的评论',
        replyTo: null,
        createdAt: new Date()
      };

      await testPost.updateOne({
        $push: { comments: comment }
      });

      const response = await request(app)
        .delete(`/api/posts/${testPost._id}/comments/${comment._id}`)
        .send({ openid: testUser.openid })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '无权删除此评论'
      });
    });
  });
}); 