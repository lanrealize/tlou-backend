const mongoose = require('mongoose');
const { cleanupUserInCircle, getUserActivityStats } = require('../../utils/memberCleanup');
const { createTestUser, createTestCircle, createTestPost } = require('../helpers/testUtils');
const Post = require('../../models/Post');
const Circle = require('../../models/Circle');

describe('Member Cleanup Utils', () => {
  describe('cleanupUserInCircle', () => {
    test('should delete all posts by user in circle', async () => {
      const user = await createTestUser();
      const circle = await createTestCircle({}, user);
      
      // 创建用户的3个帖子
      await createTestPost({ content: '帖子1' }, user, circle);
      await createTestPost({ content: '帖子2' }, user, circle);
      await createTestPost({ content: '帖子3' }, user, circle);
      
      // 验证帖子已创建
      let posts = await Post.find({ author: user._id, circle: circle._id });
      expect(posts.length).toBe(3);
      
      // 执行清理
      const stats = await cleanupUserInCircle(user._id, circle._id);
      
      // 验证帖子已删除
      posts = await Post.find({ author: user._id, circle: circle._id });
      expect(posts.length).toBe(0);
      expect(stats.deletedPosts).toBe(3);
    });

    test('should remove all comments by user in circle', async () => {
      const user1 = await createTestUser({ username: 'user1', openid: 'openid1' });
      const user2 = await createTestUser({ username: 'user2', openid: 'openid2' });
      const circle = await createTestCircle({}, user1);
      
      // user1 发帖，user2 评论
      const post1 = await createTestPost({ content: '帖子1' }, user1, circle);
      const post2 = await createTestPost({ content: '帖子2' }, user1, circle);
      
      // 添加 user2 的评论
      await Post.findByIdAndUpdate(post1._id, {
        $push: {
          comments: {
            author: user2._id,
            content: '评论1'
          }
        }
      });
      
      await Post.findByIdAndUpdate(post2._id, {
        $push: {
          comments: {
            author: user2._id,
            content: '评论2'
          }
        }
      });
      
      // 验证评论已创建
      let postWithComments1 = await Post.findById(post1._id);
      let postWithComments2 = await Post.findById(post2._id);
      expect(postWithComments1.comments.length).toBe(1);
      expect(postWithComments2.comments.length).toBe(1);
      
      // 执行清理
      const stats = await cleanupUserInCircle(user2._id, circle._id);
      
      // 验证评论已删除
      postWithComments1 = await Post.findById(post1._id);
      postWithComments2 = await Post.findById(post2._id);
      expect(postWithComments1.comments.length).toBe(0);
      expect(postWithComments2.comments.length).toBe(0);
      expect(stats.deletedComments).toBeGreaterThan(0);
    });

    test('should update circle post statistics', async () => {
      const user = await createTestUser();
      const circle = await createTestCircle({}, user);
      
      // 创建2个帖子
      await createTestPost({ content: '帖子1' }, user, circle);
      await createTestPost({ content: '帖子2' }, user, circle);
      
      // 手动更新统计
      await Circle.findByIdAndUpdate(circle._id, {
        'stats.totalPosts': 2
      });
      
      // 执行清理
      await cleanupUserInCircle(user._id, circle._id);
      
      // 验证统计已更新
      const updatedCircle = await Circle.findById(circle._id);
      expect(updatedCircle.stats.totalPosts).toBe(0);
    });

    test('should handle cleanup of complex user activity', async () => {
      const user1 = await createTestUser({ username: 'user1', openid: 'openid1' });
      const user2 = await createTestUser({ username: 'user2', openid: 'openid2' });
      const circle = await createTestCircle({}, user1);
      
      // user2 发2个帖子
      await createTestPost({ content: 'user2的帖子1' }, user2, circle);
      await createTestPost({ content: 'user2的帖子2' }, user2, circle);
      
      // user1 发1个帖子，user2 评论
      const post1 = await createTestPost({ content: 'user1的帖子' }, user1, circle);
      await Post.findByIdAndUpdate(post1._id, {
        $push: { comments: { author: user2._id, content: 'user2的评论' } }
      });

      // 执行清理 user2
      const stats = await cleanupUserInCircle(user2._id, circle._id);

      // 验证：user2 的帖子被删除
      const user2Posts = await Post.find({ author: user2._id, circle: circle._id });
      expect(user2Posts.length).toBe(0);

      // 验证：user2 的评论被删除
      const post1After = await Post.findById(post1._id);
      expect(post1After.comments.length).toBe(0);

      // 验证统计
      expect(stats.deletedPosts).toBe(2);
      expect(stats.deletedComments).toBeGreaterThan(0);
    });

    test('should not affect other circles', async () => {
      const user = await createTestUser();
      const circle1 = await createTestCircle({ name: '朋友圈1' }, user);
      const circle2 = await createTestCircle({ name: '朋友圈2' }, user);
      
      // 在两个朋友圈都发帖
      await createTestPost({ content: '圈1帖子' }, user, circle1);
      await createTestPost({ content: '圈2帖子' }, user, circle2);
      
      // 只清理 circle1
      await cleanupUserInCircle(user._id, circle1._id);
      
      // 验证：circle1 的帖子被删除
      const circle1Posts = await Post.find({ author: user._id, circle: circle1._id });
      expect(circle1Posts.length).toBe(0);
      
      // 验证：circle2 的帖子未被影响
      const circle2Posts = await Post.find({ author: user._id, circle: circle2._id });
      expect(circle2Posts.length).toBe(1);
    });

    test('should return zero stats when user has no activity', async () => {
      const user = await createTestUser();
      const circle = await createTestCircle({}, user);
      
      const stats = await cleanupUserInCircle(user._id, circle._id);
      
      expect(stats.deletedPosts).toBe(0);
      expect(stats.deletedComments).toBe(0);
      expect(stats.clearedReplyTo).toBe(0);
    });

    test('should clear replyTo references when user leaves', async () => {
      const user1 = await createTestUser({ username: 'user1', openid: 'openid1' });
      const user2 = await createTestUser({ username: 'user2', openid: 'openid2' });
      const user3 = await createTestUser({ username: 'user3', openid: 'openid3' });
      const circle = await createTestCircle({}, user1);
      
      // user1 发帖
      const post = await createTestPost({ content: 'user1的帖子' }, user1, circle);
      
      // user2 发了一条评论
      await Post.findByIdAndUpdate(post._id, {
        $push: {
          comments: {
            _id: new mongoose.Types.ObjectId(),
            author: user2._id, 
            content: 'user2的评论',
            replyTo: null
          }
        }
      });
      
      // user3 回复 user2 的评论
      await Post.findByIdAndUpdate(post._id, {
        $push: {
          comments: {
            _id: new mongoose.Types.ObjectId(),
            author: user3._id, 
            content: '回复user2',
            replyTo: user2._id  // 指向 user2
          }
        }
      });
      
      // 验证初始状态
      let postBefore = await Post.findById(post._id);
      expect(postBefore.comments.length).toBe(2);
      const replyComment = postBefore.comments.find(
        c => c.author.toString() === user3._id.toString()
      );
      expect(replyComment.replyTo.toString()).toBe(user2._id.toString());
      
      // user2 退出朋友圈
      const stats = await cleanupUserInCircle(user2._id, circle._id);
      
      // 验证：user2 的评论被删除
      let postAfter = await Post.findById(post._id);
      const user2Comments = postAfter.comments.filter(
        c => c.author.toString() === user2._id.toString()
      );
      expect(user2Comments.length).toBe(0);
      
      // 验证：user3 的评论保留，但 replyTo 被清除
      const user3Comment = postAfter.comments.find(
        c => c.author.toString() === user3._id.toString()
      );
      expect(user3Comment).toBeDefined();
      expect(user3Comment.replyTo).toBeNull();
      
      // 验证统计
      expect(stats.deletedComments).toBe(1); // user2 的评论
      expect(stats.clearedReplyTo).toBe(1);   // user3 评论中的 replyTo
    });

    test('should clear multiple replyTo references', async () => {
      const user1 = await createTestUser({ username: 'user1', openid: 'openid1' });
      const user2 = await createTestUser({ username: 'user2', openid: 'openid2' });
      const user3 = await createTestUser({ username: 'user3', openid: 'openid3' });
      const user4 = await createTestUser({ username: 'user4', openid: 'openid4' });
      const circle = await createTestCircle({}, user1);
      
      // user1 发两个帖子
      const post1 = await createTestPost({ content: '帖子1' }, user1, circle);
      const post2 = await createTestPost({ content: '帖子2' }, user1, circle);
      
      // 多个用户回复 user2
      await Post.findByIdAndUpdate(post1._id, {
        $push: {
          comments: {
            $each: [
              { _id: new mongoose.Types.ObjectId(), author: user3._id, content: '回复user2', replyTo: user2._id },
              { _id: new mongoose.Types.ObjectId(), author: user4._id, content: '也回复user2', replyTo: user2._id }
            ]
          }
        }
      });
      
      await Post.findByIdAndUpdate(post2._id, {
        $push: {
          comments: { _id: new mongoose.Types.ObjectId(), author: user3._id, content: '再次回复user2', replyTo: user2._id }
        }
      });
      
      // user2 退出
      const stats = await cleanupUserInCircle(user2._id, circle._id);
      
      // 验证所有 replyTo 都被清除
      const post1After = await Post.findById(post1._id);
      const post2After = await Post.findById(post2._id);
      
      post1After.comments.forEach(comment => {
        expect(comment.replyTo).toBeNull();
      });
      
      post2After.comments.forEach(comment => {
        expect(comment.replyTo).toBeNull();
      });
      
      expect(stats.clearedReplyTo).toBe(3); // 总共3个 replyTo 被清除
    });
  });

  describe('getUserActivityStats', () => {
    test('should return correct activity statistics', async () => {
      const user1 = await createTestUser({ username: 'user1', openid: 'openid1' });
      const user2 = await createTestUser({ username: 'user2', openid: 'openid2' });
      const circle = await createTestCircle({}, user1);
      
      // user2 发2个帖子
      await createTestPost({ content: '帖子1' }, user2, circle);
      await createTestPost({ content: '帖子2' }, user2, circle);
      
      // user1 发帖，user2 评论
      const post1 = await createTestPost({ content: 'user1帖子' }, user1, circle);
      await Post.findByIdAndUpdate(post1._id, {
        $push: { comments: { author: user2._id, content: '评论' } }
      });

      const stats = await getUserActivityStats(user2._id, circle._id);

      expect(stats.postsCount).toBe(2);
      expect(stats.commentsCount).toBe(1);
    });

    test('should return zero stats for user with no activity', async () => {
      const user = await createTestUser();
      const circle = await createTestCircle({}, user);
      
      const stats = await getUserActivityStats(user._id, circle._id);
      
      expect(stats.postsCount).toBe(0);
      expect(stats.commentsCount).toBe(0);
    });

    test('should only count activity in specified circle', async () => {
      const user = await createTestUser();
      const circle1 = await createTestCircle({ name: '朋友圈1' }, user);
      const circle2 = await createTestCircle({ name: '朋友圈2' }, user);
      
      // 在 circle1 发帖
      await createTestPost({ content: '圈1帖子' }, user, circle1);
      
      // 在 circle2 发帖
      await createTestPost({ content: '圈2帖子' }, user, circle2);
      
      const stats = await getUserActivityStats(user._id, circle1._id);
      
      expect(stats.postsCount).toBe(1);
    });

    test('should correctly count multiple comments from same user', async () => {
      const user1 = await createTestUser({ username: 'user1', openid: 'openid1' });
      const user2 = await createTestUser({ username: 'user2', openid: 'openid2' });
      const circle = await createTestCircle({}, user1);
      
      const post = await createTestPost({}, user1, circle);
      
      // user2 发多条评论
      await Post.findByIdAndUpdate(post._id, {
        $push: {
          comments: {
            $each: [
              { author: user2._id, content: '评论1' },
              { author: user2._id, content: '评论2' },
              { author: user2._id, content: '评论3' }
            ]
          }
        }
      });
      
      const stats = await getUserActivityStats(user2._id, circle._id);
      
      expect(stats.commentsCount).toBe(3);
    });
  });
});

