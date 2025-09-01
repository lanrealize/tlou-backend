// utils/errorHandler.js

// 自定义错误类
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// 异步错误捕获包装器
const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 全局错误处理中间件
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  // 构建基础响应对象
  const response = {
    status: err.status,
    message: err.message
  };

  // 如果是内容违规错误，添加详细信息
  if (err.type === 'CONTENT_VIOLATION' && err.violatedImages) {
    response.violationDetails = {
      violatedImages: err.violatedImages,
      validImages: err.validImages,
      totalImages: err.totalImages,
      deletionId: err.deletionId,
      timeoutMinutes: 10,
      hint: '请移除违规图片后重新发布，或在10分钟内重新调整发布'
    };
  }

  if (process.env.NODE_ENV === 'development') {
    response.error = err;
    response.stack = err.stack;
  }

  // 生产环境下，只有操作性错误才返回详情
  if (process.env.NODE_ENV === 'production' && !err.isOperational) {
    console.error('ERROR 💥', err);
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong!'
    });
  }

  res.status(err.statusCode).json(response);
};

module.exports = {
  AppError,
  catchAsync,
  globalErrorHandler
}; 