# 微信小程序登录功能（OpenID认证方案）

## 概述

本项目已集成微信小程序登录功能，使用**直接传递openid**的认证方案，简单直接，适合快速开发。

## 环境配置

在 `.env` 文件中添加以下配置：

```env
# 微信小程序配置
APP_ID=your_wechat_app_id_here
APP_SECRET=your_wechat_app_secret_here
```

## API 接口

### 1. 微信登录

**接口地址：** `POST /api/wechat/login`

**请求参数：**
```json
{
  "code": "微信小程序登录时获取的code"
}
```

**响应示例：**

新用户注册：
```json
{
  "success": true,
  "message": "用户创建成功",
  "data": {
    "user": {
      "_id": "64f8a1b2c3d4e5f678901234",
      "openid": "wx_openid_123456",
      "username": "用户123456",
      "avatar": ""
    },
    "openid": "wx_openid_123456"
  }
}
```

老用户登录：
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "user": {
      "_id": "64f8a1b2c3d4e5f678901234",
      "openid": "wx_openid_123456",
      "username": "用户123456",
      "avatar": "https://example.com/avatar.jpg"
    },
    "openid": "wx_openid_123456"
  }
}
```

### 2. 获取用户信息（需要认证）

**接口地址：** `GET /api/wechat/protected/user-info`

**请求方式：**
- **方式1：** 在请求体中传递openid
- **方式2：** 在URL参数中传递openid
- **方式3：** 在请求头中传递openid

**请求示例：**
```javascript
// 方式1：请求体
wx.request({
  url: 'http://your-api/api/wechat/protected/user-info',
  method: 'GET',
  data: { openid: 'user_openid' }
});

// 方式2：URL参数
wx.request({
  url: 'http://your-api/api/wechat/protected/user-info?openid=user_openid',
  method: 'GET'
});

// 方式3：请求头
wx.request({
  url: 'http://your-api/api/wechat/protected/user-info',
  method: 'GET',
  header: { 'x-openid': 'user_openid' }
});
```

**响应示例：**
```json
{
  "success": true,
  "message": "获取用户信息成功",
  "data": {
    "user": {
      "_id": "64f8a1b2c3d4e5f678901234",
      "openid": "wx_openid_123456",
      "username": "用户123456",
      "avatar": "https://example.com/avatar.jpg"
    }
  }
}
```

### 3. 朋友圈相关接口

**获取朋友圈列表：**
```javascript
wx.request({
  url: 'http://your-api/api/circles/my',
  method: 'GET',
  data: { openid: 'user_openid' }
});
```

**创建朋友圈：**
```javascript
wx.request({
  url: 'http://your-api/api/circles',
  method: 'POST',
  data: { 
    openid: 'user_openid',
    name: '我的朋友圈',
    isPublic: true
  }
});
```

## 使用流程

### 1. 前端调用流程

```javascript
// 1. 获取微信登录code
wx.login({
  success: (res) => {
    if (res.code) {
      // 2. 发送code到后端
      wx.request({
        url: 'http://your-api/api/wechat/login',
        method: 'POST',
        data: {
          code: res.code
        },
        success: (response) => {
          // 3. 保存openid和用户信息
          const { openid, user } = response.data.data;
          wx.setStorageSync('openid', openid);
          wx.setStorageSync('userInfo', user);
        }
      });
    }
  }
});
```

### 2. 后续请求认证

```javascript
// 在需要认证的请求中添加openid
wx.request({
  url: 'http://your-api/api/circles/my',
  method: 'GET',
  data: { 
    openid: wx.getStorageSync('openid') 
  },
  success: (response) => {
    console.log(response.data);
  }
});
```

## 错误处理

### 常见错误码

- `400`: 微信登录失败（code无效或过期）
- `401`: 缺少openid参数或openid无效
- `500`: 服务器内部错误

### 错误响应格式

```json
{
  "success": false,
  "message": "错误描述信息"
}
```

## 安全说明

1. **OpenID安全**: OpenID是微信用户的唯一标识，请妥善保管
2. **HTTPS**: 生产环境请使用HTTPS协议
3. **环境变量**: 请确保APP_SECRET等敏感信息不要提交到代码仓库

## 依赖安装

确保已安装所需依赖：

```bash
npm install axios
```

## 方案优势

### ✅ 优点：
- **简单直接**：无需复杂的token管理
- **快速开发**：适合原型和简单项目
- **易于理解**：逻辑清晰，调试方便
- **无额外依赖**：不需要JWT库

### ⚠️ 缺点：
- **安全性较低**：openid容易被拦截
- **性能影响**：每次请求都要查询数据库
- **不适合大规模**：不适合高并发场景

## 注意事项

1. 微信小程序的APP_ID和APP_SECRET需要在微信公众平台获取
2. 确保服务器能够访问微信API（https://api.weixin.qq.com）
3. 建议在生产环境中使用HTTPS协议
4. 此方案适合快速开发和原型验证，生产环境建议使用JWT方案 