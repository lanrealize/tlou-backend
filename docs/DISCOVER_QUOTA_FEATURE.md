# 发现朋友圈配额功能

## 功能概述

为"发现有趣朋友圈"功能添加每日配额限制，防止用户过度刷新，同时为购物用户提供更多配额作为激励。

## 配额规则

### 默认配额
- **普通用户**：每天 3 次
- **购物用户**：每天 8 次（3 + 5 额外次数）
- **未登录用户**：无限制（但无法记录访问历史）

### 重置时间
- 每天 00:00 自动重置
- 按自然日计算

## 数据模型

### User 模型扩展

```javascript
discoverQuota: {
  count: Number,           // 今日已使用次数
  lastDate: String,        // 最后使用日期 'YYYY-MM-DD'
  dailyLimit: Number,      // 每日基础限额（默认3）
  hasPurchase: Boolean,    // 是否有购物记录
  customMessage: String    // 自定义配额超限提示（可选）
}
```

## API 响应

### 成功响应（有配额信息）

```json
{
  "success": true,
  "message": "获取随机朋友圈成功，今天还剩最后 1 次机会",
  "data": {
    "circle": { ... },
    "randomInfo": { ... },
    "quota": {
      "daily": 3,
      "used": 2,
      "remaining": 1,
      "resetAt": "2026-02-13T00:00:00.000Z",
      "hasPurchase": false
    }
  }
}
```

### 配额超限响应

```http
HTTP 429 Too Many Requests
```

```json
{
  "success": false,
  "code": "QUOTA_EXCEEDED",
  "message": "今日发现次数已用完（3/3），明天 00:00 重置。购物用户可获得 8 次机会哦~",
  "data": {
    "quota": {
      "daily": 3,
      "used": 3,
      "remaining": 0,
      "resetAt": "2026-02-13T00:00:00.000Z",
      "hasPurchase": false
    }
  }
}
```

## 友好提示

系统会根据剩余次数自动调整提示文案：

- **剩余 2+ 次**：`"获取随机朋友圈成功"`
- **剩余 1 次**：`"获取随机朋友圈成功，今天还剩最后 1 次机会"`
- **剩余 0 次**：`"获取随机朋友圈成功，今日次数已用完"`
- **超限（普通用户）**：`"今日发现次数已用完（3/3），明天 00:00 重置。购物用户可获得 8 次机会哦~"`
- **超限（购物用户）**：`"今日发现次数已用完（8/8），明天 00:00 重置"`

## 自定义配额消息

管理员可以为特定用户设置自定义配额超限消息：

```javascript
user.discoverQuota.customMessage = '您的VIP配额已用完，请联系客服升级';
await user.save();
```

## 扩展性设计

### 未来可扩展功能

1. **会员等级系统**
   - VIP用户：每天 20 次
   - SVIP用户：无限制

2. **购物记录验证**
   ```javascript
   // 验证购物记录后提升配额
   if (await verifyPurchaseHistory(userId)) {
     user.discoverQuota.hasPurchase = true;
     await user.save();
   }
   ```

3. **临时配额提升**
   ```javascript
   // 活动期间临时提升配额
   user.discoverQuota.dailyLimit = 10;
   user.discoverQuota.customMessage = '活动期间特别福利！';
   ```

4. **配额消费记录**
   - 可以添加独立的 `QuotaLog` 模型记录详细使用历史
   - 用于数据分析和用户行为研究

## 性能优化

1. **零额外查询**：配额检查与用户查询合并，不增加数据库负担
2. **自动重置**：通过日期对比自动重置，无需定时任务
3. **内存高效**：配额数据直接存储在 User 模型中，无需额外表

## 测试覆盖

- ✅ 基础配额限制测试
- ✅ 购物用户配额测试
- ✅ 配额自动重置测试
- ✅ 未登录用户测试
- ✅ 友好提示测试
- ✅ 自定义消息测试

运行测试：
```bash
npm test -- tests/controllers/randomCircle.test.js
```

## 前端集成建议

### 处理配额信息

```javascript
// 显示剩余次数
if (response.data.quota) {
  const { remaining, daily } = response.data.quota;
  showQuotaInfo(`今日剩余 ${remaining}/${daily} 次`);
}
```

### 处理配额超限

```javascript
if (response.code === 'QUOTA_EXCEEDED') {
  showQuotaExceededDialog({
    message: response.message,
    resetAt: response.data.quota.resetAt,
    hasPurchase: response.data.quota.hasPurchase
  });
  
  // 如果不是购物用户，显示购物引导
  if (!response.data.quota.hasPurchase) {
    showPurchasePromotion();
  }
}
```

## 注意事项

1. **时区处理**：服务器使用 UTC 时间，前端需要转换为本地时间显示
2. **状态码**：配额超限使用 `429 Too Many Requests`，前端需要特殊处理
3. **未登录用户**：`quota` 字段为 `null`，前端需要判空处理
4. **自定义消息**：优先显示 `customMessage`，为运营活动预留灵活性

