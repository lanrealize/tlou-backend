const request = require('supertest');
const express = require('express');
const { createTestUser, createTestCircle, createTestPost } = require('../helpers/testUtils');
const { globalErrorHandler } = require('../../utils/errorHandler');

// Mock图片检查服务和七牛云工具
jest.mock('../../services/imageCheck.service', () => require('../__mocks__/imageCheck.service'));
jest.mock('../../utils/qiniuUtils', () => require('../__mocks__/qiniuUtils'));

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
        openid: testUser._id
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

    test('should create post with new image format (object with url, width, height)', async () => {
      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试帖子内容',
        images: [
          { url: 'https://tlou.images.wltech-service.site/image1.jpg', width: 300, height: 200 },
          { url: 'https://tlou.images.wltech-service.site/image2.jpg', width: 400, height: 300 }
        ],
        openid: testUser._id
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
              { url: 'https://tlou.images.wltech-service.site/image1.jpg', width: 300, height: 200 },
              { url: 'https://tlou.images.wltech-service.site/image2.jpg', width: 400, height: 300 }
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
          { url: 'https://tlou.images.wltech-service.site/newformat.jpg', width: 320, height: 240 }  // 新格式：对象
        ],
        openid: testUser._id
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
              { url: 'https://tlou.images.wltech-service.site/newformat.jpg', width: 320, height: 240 }
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
        openid: testUser._id
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
        openid: testUser._id
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '无效的朋友圈ID'
      });
    });

    test('should return 404 when circle does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const postData = {
        circleId: fakeId,
        content: '测试帖子内容',
        openid: testUser._id
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

    test('should return 422 with violation details when image content check fails', async () => {
      // Mock图片审核：第一张违规，第二张通过
      const { checkImageContent } = require('../../services/imageCheck.service');
      checkImageContent
        .mockResolvedValueOnce({
          errcode: 87014,
          errmsg: '内容含有违法违规内容'
        })
        .mockResolvedValueOnce({
          errcode: 0,
          errmsg: 'ok'
        });

      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试混合图片帖子',
        images: [
          'https://example.com/bad-image.jpg',
          'https://example.com/good-image.jpg'
        ],
        openid: testUser._id
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(422);

      // 验证响应包含详细的违规信息
      expect(response.body.status).toBe('fail');
      expect(response.body.message).toContain('检测到违规图片');
      expect(response.body.violationDetails).toBeDefined();
      expect(response.body.violationDetails.violatedImages).toHaveLength(1);
      expect(response.body.violationDetails.violatedImages[0]).toEqual({
        index: 1,
        url: 'https://example.com/bad-image.jpg',
        reason: '内容含有违法违规内容',
        code: 87014
      });
      expect(response.body.violationDetails.validImages).toHaveLength(1);
      expect(response.body.violationDetails.totalImages).toBe(2);
      expect(response.body.violationDetails.timeoutMinutes).toBe(10);

      // 验证违规图片立即删除函数被调用
      const { deleteQiniuFiles } = require('../../utils/qiniuUtils');
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(deleteQiniuFiles).toHaveBeenCalledWith('https://example.com/bad-image.jpg');
    });

    test('should create post successfully when all images pass content check', async () => {
      // Mock所有图片审核通过
      const { checkImageContent } = require('../../services/imageCheck.service');
      checkImageContent.mockResolvedValue({
        errcode: 0,
        errmsg: 'ok'
      });

      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试全部合规图片帖子',
        images: [
          'https://example.com/good-image1.jpg',
          'https://example.com/good-image2.jpg'
        ],
        openid: testUser._id
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(201);

      // 验证响应正常
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('发布成功');
      expect(response.body.data.post.images).toHaveLength(2);
      expect(response.body.violationDetails).toBeUndefined();
    });

    test('should return 403 when non-creator posts to circle', async () => {
      const nonCreator = await createTestUser();
      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试帖子内容',
        openid: nonCreator._id
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(403);

      expect(response.body.status).toBe('fail');
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

    test('should return 400 when image object is missing required fields', async () => {
      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试帖子内容',
        images: [
          { url: 'https://example.com/image.jpg' }  // 缺少width和height
        ],
        openid: testUser._id
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: expect.stringContaining('图片对象必须包含有效的width字段')
      });
    });

    test('should return 400 when image object has invalid url', async () => {
      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试帖子内容',
        images: [
          { url: '', width: 100, height: 100 }  // 空URL
        ],
        openid: testUser._id
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: '图片检查失败: 第1张图片URL为空'
      });
    });

    test('should return 400 when image object has negative dimensions', async () => {
      const postData = {
        circleId: testCircle._id.toString(),
        content: '测试帖子内容',
        images: [
          { url: 'https://example.com/image.jpg', width: -100, height: 100 }  // 负数宽度
        ],
        openid: testUser._id
      };

      const response = await request(app)
        .post('/api/posts')
        .send(postData)
        .expect(400);

      expect(response.body).toEqual({
        status: 'fail',
        message: expect.stringContaining('图片对象必须包含有效的width字段')
      });
    });
  });

  describe('GET /api/posts', () => {
    test('should require auth to view posts', async () => {
      const publicCircle = await createTestCircle({
        name: '公开朋友圈',
        isPublic: true
      }, testUser);

      await createTestPost({ content: '公开帖子1' }, testUser, publicCircle);

      // 不提供openid - 应该返回401
      const response = await request(app)
        .get('/api/posts')
        .query({ 
          circleId: publicCircle._id.toString()
        })
        .expect(401);

      expect(response.body.status).toBe('fail');
      expect(response.body.message).toBe('缺少openid参数');
    });

    test('should return posts for circle', async () => {
      // 创建更多帖子
      await createTestPost({ content: '帖子2' }, testUser, testCircle);
      await createTestPost({ content: '帖子3' }, testUser, testCircle);

      const response = await request(app)
        .get('/api/posts')
        .query({ 
          circleId: testCircle._id.toString(),
          openid: testUser._id 
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
        .query({ openid: testUser._id })
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
          openid: testUser._id 
        })
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '朋友圈不存在'
      });
    });

    test('should return 403 when non-creator views circle posts', async () => {
      const otherCircle = await createTestCircle({ name: '别人的圈子' });
      const nonCreator = await createTestUser();

      const response = await request(app)
        .get('/api/posts')
        .query({
          circleId: otherCircle._id.toString(),
          openid: nonCreator._id
        })
        .expect(403);

      expect(response.body.status).toBe('fail');
    });

    test('should return posts with reactions information', async () => {
      const response = await request(app)
        .get('/api/posts')
        .query({
          circleId: testCircle._id.toString(),
          openid: testUser._id
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      const post = response.body.data.posts[0];
      expect(post).toHaveProperty('reactions');
    });
  });

  describe('POST /api/posts/:id/react', () => {
    test('should react to post successfully', async () => {
      const response = await request(app)
        .post(`/api/posts/${testPost._id}/react`)
        .send({ openid: testUser._id })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.reacted).toBe(true);
    });

    test('should un-react when already reacted', async () => {
      // 先 react
      await request(app)
        .post(`/api/posts/${testPost._id}/react`)
        .send({ openid: testUser._id });

      // 再次 react → 取消
      const response = await request(app)
        .post(`/api/posts/${testPost._id}/react`)
        .send({ openid: testUser._id })
        .expect(200);

      expect(response.body.data.reacted).toBe(false);
    });

    test('should return 404 when post does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .post(`/api/posts/${fakeId}/react`)
        .send({ openid: testUser._id })
        .expect(404);

      expect(response.body.status).toBe('fail');
    });
  });

  describe('DELETE /api/posts/:id', () => {
    test('should delete own post successfully', async () => {
      const response = await request(app)
        .delete(`/api/posts/${testPost._id}`)
        .send({ openid: testUser._id })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: '帖子删除成功'
      });
    });

    test('should delete post with images and trigger qiniu cleanup', async () => {
      // 创建带有图片的测试帖子（混合格式）
      const postWithImages = await createTestPost({
        content: '带图片的帖子',
        images: [
          'https://tlou.images.wltech-service.site/test1.jpg',  // 旧格式
          { url: 'https://tlou.images.wltech-service.site/test2.jpg', width: 300, height: 200 }  // 新格式
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
        .send({ openid: testUser._id })
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

      // 验证七牛云删除函数被调用
      const { deleteQiniuFiles } = require('../../utils/qiniuUtils');
      expect(deleteQiniuFiles).toHaveBeenCalledWith([
        'https://tlou.images.wltech-service.site/test1.jpg',
        'https://tlou.images.wltech-service.site/test2.jpg'
      ]);
    });

    test('should return 404 when post does not exist', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      const response = await request(app)
        .delete(`/api/posts/${fakeId}`)
        .send({ openid: testUser._id })
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
        .send({ openid: testUser._id })
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
        openid: testUser._id
      };

      const response = await request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .send(commentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('评论成功');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.commentId).toBeDefined();
      expect(response.body.data._id).toBeDefined();
      
      // 验证commentId和_id是相同的ObjectId
      expect(response.body.data.commentId).toBe(response.body.data._id);
    });

    test('should add reply comment successfully', async () => {
      const replyToUser = await createTestUser();
      const commentData = {
        content: '回复评论',
        replyToUserOpenid: replyToUser._id,  // 直接使用openid
        openid: testUser._id
      };

      const response = await request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .send(commentData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('评论成功');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.commentId).toBeDefined();
      expect(response.body.data._id).toBeDefined();
      
      // 验证commentId和_id是相同的ObjectId
      expect(response.body.data.commentId).toBe(response.body.data._id);
    });

    test('should return 400 when content is missing', async () => {
      const commentData = {
        openid: testUser._id
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
        openid: testUser._id
      };

      const response = await request(app)
        .post(`/api/posts/${fakeId}/comments`)
        .send(commentData)
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '帖子不存在或无权限删除'
      });
    });

    test('should return 404 when replyToUserOpenid is invalid', async () => {
      const commentData = {
        content: '回复评论',
        replyToUserOpenid: 'invalid_user_openid',
        openid: testUser._id
      };

      const response = await request(app)
        .post(`/api/posts/${testPost._id}/comments`)
        .send(commentData)
        .expect(404);

      expect(response.body).toEqual({
        status: 'fail',
        message: '回复的用户不存在'
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
        .send({ openid: testUser._id })
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
        .send({ openid: testUser._id })
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
        .send({ openid: testUser._id })
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
        .send({ openid: testUser._id })
        .expect(403);

      expect(response.body).toEqual({
        status: 'fail',
        message: '无权删除此评论'
      });
    });
  });
});
