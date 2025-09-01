const { checkImageContent } = require('../services/imageCheck.service');
const { AppError } = require('../utils/errorHandler');
const { deleteQiniuFiles } = require('../utils/qiniuUtils');

/**
 * 图片内容检查中间件
 * 检查请求中的images字段，如果有违规内容则删除图片并返回错误
 */
async function checkImagesMiddleware(req, res, next) {
  try {
    const { images } = req.body;
    
    // 没有图片，直接通过
    if (!images || images.length === 0) {
      return next();
    }

    console.log('🔍 开始图片内容检查...');
    
    // 逐个检查图片
    for (const image of images) {
      const imageUrl = typeof image === 'string' ? image : image.url;
      
      if (!imageUrl) {
        throw new AppError('图片URL不能为空', 400);
      }

      try {
        const result = await checkImageContent(imageUrl);
        
        // 检查不通过 - 删除违规图片
        if (result.errcode !== 0) {
          console.log('🗑️ 检测到违规图片，开始删除:', imageUrl);
          setImmediate(() => deleteQiniuFiles(imageUrl)); // 异步删除，复用现有逻辑
          
          // 使用422状态码表示内容审核不通过，并明确标识
          const error = new AppError(`图片内容审核未通过: ${result.errmsg || '内容不符合规范'}`, 422);
          error.type = 'CONTENT_VIOLATION'; // 添加错误类型标识
          error.violationCode = result.errcode; // 微信违规码
          throw error;
        }
      } catch (error) {
        if (error instanceof AppError) {
          throw error;
        }
        
        // 处理其他错误
        if (error.message === '图片不存在') {
          throw new AppError('图片不存在或无法访问', 400);
        }
        if (error.message.includes('timeout')) {
          throw new AppError('图片下载超时，请稍后重试', 408);
        }
        
        console.error('图片内容检查失败:', error);
        throw new AppError('图片内容检查服务暂时不可用', 500);
      }
    }

    console.log('✅ 图片内容检查通过');
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  checkImagesMiddleware
};
