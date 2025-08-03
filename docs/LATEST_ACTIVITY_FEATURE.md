# 朋友圈最新活动功能实现

## 功能描述
为朋友圈添加最新活动时间跟踪功能，前端可以根据此字段获取用户最近有活动的朋友圈。

## 数据结构改动

### Circle 模型新增字段
```javascript
latestActivityTime: {
  type: Date,
  default: Date.now
}
```

## 触发活动时间更新的操作

✅ **会更新 latestActivityTime：**
- 发布帖子
- 点赞帖子（不包括取消点赞）
- 添加评论（不包括删除评论）
- 加入朋友圈
- 同意申请加入朋友圈

❌ **不会更新 latestActivityTime：**
- 取消点赞
- 删除帖子
- 删除评论
- 退出朋友圈
- 拒绝申请

## 代码改动说明

### 1. 模型层 (models/Circle.js)
- 添加 `latestActivityTime` 字段
- 添加 `updateActivityTime()` 实例方法

### 2. 工具函数 (utils/circleUtils.js)
- 新增 `updateCircleActivity()` 函数，统一处理活动时间更新
- 使用静默错误处理，不影响主业务流程

### 3. 路由层改动

#### routes/posts.js
- 发帖时更新活动时间
- 点赞时更新活动时间（取消点赞不更新）
- 添加评论时更新活动时间

#### routes/circles.js
- 创建朋友圈时初始化活动时间
- 加入朋友圈时更新活动时间
- 同意申请时更新活动时间
- 获取朋友圈列表按 `latestActivityTime` 排序

## API 变化

### GET /circles/my
**返回数据排序变化：**
- 原来：按 `createdAt` 降序排序
- 现在：按 `latestActivityTime` 降序排序

## 测试建议

1. **功能测试：**
   - 发帖后检查朋友圈 `latestActivityTime` 是否更新
   - 点赞后检查活动时间更新，取消点赞后时间不变
   - 评论后检查活动时间更新
   - 加入朋友圈后检查活动时间更新

2. **排序测试：**
   - 创建多个朋友圈
   - 在不同朋友圈进行活动
   - 验证 GET /circles/my 返回的排序正确

3. **边界测试：**
   - 删除操作不影响活动时间
   - 权限校验仍然有效

## 兼容性
- 对现有数据结构完全兼容
- 现有 API 功能不受影响
- 只是排序逻辑改变，不影响前端解析

## 性能考虑
- 活动时间更新使用异步操作，不阻塞主业务
- 使用静默错误处理，提高系统稳定性
- 更新操作使用 `findByIdAndUpdate`，性能较优