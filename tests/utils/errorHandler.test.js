const { AppError, catchAsync, globalErrorHandler } = require('../../utils/errorHandler');

// 模拟请求对象
const createMockRequest = (data = {}) => {
  return {
    body: data.body || {},
    query: data.query || {},
    params: data.params || {},
    headers: data.headers || {},
    user: data.user || null,
    ...data
  };
};

// 模拟响应对象
const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

// 模拟next函数
const createMockNext = () => {
  return jest.fn();
};

describe('Error Handler Test', () => {
  describe('AppError', () => {
    test('should create AppError with correct properties', () => {
      const error = new AppError('Test error message', 400);

      expect(error.message).toBe('Test error message');
      expect(error.statusCode).toBe(400);
      expect(error.status).toBe('fail');
      expect(error.isOperational).toBe(true);
    });

    test('should set status to error for 5xx status codes', () => {
      const error = new AppError('Server error', 500);

      expect(error.status).toBe('error');
    });

    test('should set status to fail for 4xx status codes', () => {
      const error = new AppError('Client error', 400);

      expect(error.status).toBe('fail');
    });
  });

  describe('catchAsync', () => {
    test('should call the function and pass through successful result', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const wrappedFn = catchAsync(mockFn);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await wrappedFn(req, res, next);

      expect(mockFn).toHaveBeenCalledWith(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });

    test('should catch errors and pass to next', async () => {
      const testError = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(testError);
      const wrappedFn = catchAsync(mockFn);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await wrappedFn(req, res, next);

      expect(mockFn).toHaveBeenCalledWith(req, res, next);
      expect(next).toHaveBeenCalledWith(testError);
    });

    test('should handle AppError correctly', async () => {
      const appError = new AppError('App error', 400);
      const mockFn = jest.fn().mockRejectedValue(appError);
      const wrappedFn = catchAsync(mockFn);

      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      await wrappedFn(req, res, next);

      expect(next).toHaveBeenCalledWith(appError);
    });
  });

  describe('globalErrorHandler', () => {
    test('should handle AppError in development mode', () => {
      process.env.NODE_ENV = 'development';
      
      const appError = new AppError('Test error', 400);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      globalErrorHandler(appError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        error: appError,
        message: 'Test error',
        stack: appError.stack
      });
    });

    test('should handle AppError in production mode', () => {
      process.env.NODE_ENV = 'production';
      
      const appError = new AppError('Test error', 400);
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      globalErrorHandler(appError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        status: 'fail',
        message: 'Test error'
      });
    });

    test('should handle non-operational errors in production mode', () => {
      process.env.NODE_ENV = 'production';
      
      const regularError = new Error('Regular error');
      regularError.isOperational = false;
      
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      globalErrorHandler(regularError, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        message: 'Something went wrong!'
      });
    });

    test('should set default status code to 500', () => {
      process.env.NODE_ENV = 'development';
      
      const error = new Error('Test error');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      globalErrorHandler(error, req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
    });

    test('should set default status to error', () => {
      process.env.NODE_ENV = 'development';
      
      const error = new Error('Test error');
      const req = createMockRequest();
      const res = createMockResponse();
      const next = createMockNext();

      globalErrorHandler(error, req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error'
        })
      );
    });
  });
}); 