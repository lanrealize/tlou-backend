# 项目结构

## 📁 根目录文件
```
tlou-backend/
├── package.json              # 项目配置和依赖
├── package-lock.json         # 依赖锁定文件
├── server.js                 # 服务器入口文件
├── jest.config.js           # Jest测试配置
├── .gitignore               # Git忽略文件
├── env.example              # 环境变量示例
└── README.md                # 项目说明文档
```

## 📁 核心目录
```
├── models/                  # 数据模型
│   ├── User.js             # 用户模型
│   ├── Circle.js           # 朋友圈模型
│   └── Post.js             # 帖子模型
│
├── routes/                  # API路由
│   ├── circles.js          # 朋友圈路由
│   ├── posts.js            # 帖子路由
│   └── wechat.js           # 微信认证路由
│
├── controllers/             # 控制器
│   └── wechatAuth.js       # 微信登录控制器
│
├── middleware/              # 中间件
│   └── openidAuth.js       # OpenID认证中间件
│
├── utils/                   # 工具函数
│   └── errorHandler.js     # 错误处理工具
│
├── docs/                    # 文档
│   └── WECHAT_AUTH.md      # 微信认证文档
│
├── examples/                # 使用示例
│   └── openid-auth-example.js  # 前端使用示例
│
└── tests/                   # 测试文件
    ├── setup.js            # 测试环境设置
    ├── README.md           # 测试文档
    ├── helpers/            # 测试工具
    │   └── testUtils.js   # 测试工具函数
    ├── models/             # 模型测试
    │   ├── User.test.js
    │   ├── Circle.test.js
    │   └── Post.test.js
    ├── routes/             # 路由测试
    │   ├── circles.test.js
    │   └── posts.test.js
    ├── middleware/         # 中间件测试
    │   └── openidAuth.test.js
    ├── controllers/        # 控制器测试
    │   └── wechatAuth.test.js
    ├── utils/              # 工具函数测试
    │   └── errorHandler.test.js
    └── integration/        # 集成测试
        └── wechat.test.js
```

## 🗂️ 已删除的临时文件
以下临时文件已被清理：
- `run-tests.bat` - 测试运行批处理文件
- `manual-test.js` - 手动测试检查器
- `install-deps.bat` - 依赖安装批处理文件
- `run-tests.ps1` - PowerShell测试脚本
- `check-env.bat` - 环境检查批处理文件
- `simple-test.js` - 简单测试文件
- `install-test-deps.js` - 测试依赖安装脚本
- `run-test.js` - 测试运行脚本

## ✅ 项目状态
- **核心功能**: 完整的微信朋友圈后端API
- **认证方式**: OpenID直接传递
- **数据库**: MongoDB + Mongoose
- **测试覆盖**: 111个测试用例
- **文档完整**: API文档和使用示例
- **代码质量**: 统一的错误处理和代码规范

## 🚀 运行项目
```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产模式
npm start

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage
``` 