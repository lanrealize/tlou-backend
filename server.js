const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { globalErrorHandler } = require('./utils/errorHandler'); // 添加这行
require('dotenv').config();

const app = express();

// 中间件
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 限流配置 (临时禁用以便开发)
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 100
// });
// app.use(limiter);



// 路由
app.use('/api/wechat', require('./routes/wechat'));
app.use('/api/circles', require('./routes/circles'));
app.use('/api/posts', require('./routes/posts'));

// 公开API路由 (无需认证，用于推广)
app.use('/api/public', require('./routes/public'));

// 管理员路由 (虚拟用户管理)
app.use('/api/admin', require('./routes/admin'));

// 七牛云图片上传路由 (独立模块)
app.use('/api/qiniu', require('./routes/qiniu'));

app.use('/api/notifications', require('./routes/notifications'));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: '服务器运行正常' });
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

// 全局错误处理中间件（使用 globalErrorHandler）
app.use(globalErrorHandler);

// 连接数据库
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('MongoDB连接成功');
})
.catch((err) => {
  console.error('MongoDB连接失败:', err);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
}); 