# 七牛云图片上传配置说明

## 环境变量配置

请在项目根目录创建 `.env` 文件，并添加以下配置：

```bash
# 数据库连接
MONGODB_URI=mongodb://localhost:27017/tlou

# 服务器端口
PORT=3000

# 七牛云配置（必需）
QINIU_ACCESS_KEY=your_qiniu_access_key
QINIU_SECRET_KEY=your_qiniu_secret_key
QINIU_BUCKET=your_bucket_name
QINIU_DOMAIN=https://your-domain.com

# 开发环境配置
NODE_ENV=development
```

## 功能特性

✅ **完全独立模块**：不影响现有功能  
✅ **多场景支持**：头像、朋友圈、聊天等  
✅ **智能路径生成**：自动按日期和用户分组  
✅ **安全Token管理**：动态生成，支持过期控制  

## API 接口

### 1. 健康检查
```
GET /api/qiniu/health
```

### 2. 获取配置信息
```
GET /api/qiniu/info
```

### 3. 获取上传Token
```
GET /api/qiniu/upload-token?pathType=avatar&userId=wx_123
```

### 4. 生成上传Token (POST)
```
POST /api/qiniu/upload-token
Content-Type: application/json

{
  "pathType": "moment",
  "userId": "wx_123",
  "expires": 3600
}
```

## 支持的路径类型

| 类型 | 路径格式 | 使用场景 |
|------|----------|----------|
| `avatar` | `avatars/{userId}/` | 用户头像 |
| `moment` | `moments/{userId}/{date}/` | 朋友圈图片 |
| `post` | `posts/{userId}/{date}/` | 帖子图片 |
| `chat` | `chats/{userId}/{date}/` | 聊天图片 |
| `other` | `images/{userId}/` | 其他图片 |
| `custom` | `custom/{userId}/` | 自定义用途 |

## 快速启动

1. **创建环境变量文件**
   ```bash
   # 在项目根目录创建 .env 文件，复制上面的配置
   ```

2. **启动服务器**
   ```bash
   npm run dev
   # 或
   npm start
   ```

3. **测试健康检查**
   ```bash
   curl http://localhost:3000/api/qiniu/health
   ```

4. **测试Token获取**
   ```bash
   curl "http://localhost:3000/api/qiniu/upload-token?pathType=avatar&userId=test123"
   ```

## 集成到前端

前端配置已自动更新，无需额外修改。重新运行小程序即可使用新的后端服务。

## 安全说明

⚠️ **重要**：请确保 `.env` 文件包含在 `.gitignore` 中，不要将敏感信息提交到版本控制系统。

## 故障排查

### 1. 服务启动失败
- 检查 `.env` 文件是否存在
- 确认七牛云配置参数是否正确

### 2. Token生成失败
- 检查七牛云AccessKey和SecretKey
- 确认存储空间名称是否正确

### 3. 前端连接失败
- 确认后端服务在端口3000运行
- 检查防火墙设置
- 确认API路径是否正确