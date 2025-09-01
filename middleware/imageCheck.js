const { checkImageContent } = require('../services/imageCheck.service');
const { AppError } = require('../utils/errorHandler');
const { deleteQiniuFiles } = require('../utils/qiniuUtils');

// 存储待删除的图片timeout任务
const pendingDeletions = new Map();

/**
 * 图片内容检查中间件
 * 检查所有图片，如果有违规则立即删除违规图片，并设置10分钟后删除所有图片的timeout
 */
async function checkImagesMiddleware(req, res, next) {
  try {
    const { images } = req.body;
    
    // 没有图片，直接通过
    if (!images || images.length === 0) {
      return next();
    }

    console.log('🔍 开始图片内容检查...', `共${images.length}张图片`);
    
    const validImages = []; // 合规图片
    const violatedImages = []; // 违规图片信息
    const checkErrors = []; // 检查过程中的错误
    
    // 检查所有图片
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const imageUrl = typeof image === 'string' ? image : image.url;
      
      if (!imageUrl) {
        checkErrors.push(`第${i + 1}张图片URL为空`);
        continue;
      }

      try {
        const result = await checkImageContent(imageUrl);
        
        // 检查通过
        if (result.errcode === 0) {
          validImages.push(image);
          console.log(`✅ 图片${i + 1}检查通过:`, imageUrl.substring(0, 50) + '...');
        } else {
          // 检查不通过 - 记录违规图片并立即删除
          console.log(`❌ 图片${i + 1}违规:`, imageUrl.substring(0, 50) + '...', result.errmsg);
          violatedImages.push({
            index: i + 1,
            url: imageUrl,
            reason: result.errmsg || '内容不符合规范',
            code: result.errcode
          });
          
          // 立即删除违规图片
          setImmediate(() => deleteQiniuFiles(imageUrl));
        }
      } catch (error) {
        // 处理检查过程中的错误
        if (error.message === '图片不存在') {
          checkErrors.push(`第${i + 1}张图片不存在或无法访问`);
        } else if (error.message.includes('timeout')) {
          checkErrors.push(`第${i + 1}张图片下载超时`);
        } else {
          console.error(`图片${i + 1}内容检查失败:`, error);
          checkErrors.push(`第${i + 1}张图片检查失败: ${error.message}`);
        }
      }
    }

    // 如果有检查错误，返回错误
    if (checkErrors.length > 0) {
      throw new AppError(`图片检查失败: ${checkErrors.join(', ')}`, 400);
    }

    // 如果有违规图片，设置延迟删除并返回错误
    if (violatedImages.length > 0) {
      // 生成唯一的删除任务ID
      const deletionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 设置10分钟后删除所有图片的timeout
      const timeoutId = setTimeout(() => {
        console.log('⏰ 执行延迟删除，删除所有图片:', images.length, '张');
        const allImageUrls = images.map(img => typeof img === 'string' ? img : img.url);
        deleteQiniuFiles(allImageUrls);
        pendingDeletions.delete(deletionId);
      }, 10 * 60 * 1000); // 10分钟

      // 存储删除任务信息
      pendingDeletions.set(deletionId, {
        timeoutId,
        images: images,
        createdAt: new Date()
      });

      // 将删除任务ID添加到请求对象，供后续取消使用
      req.imageDeletionId = deletionId;

      console.log(`⚠️ 检测到${violatedImages.length}张违规图片，已立即删除。设置10分钟后删除所有${images.length}张图片`);
      
      // 返回422错误，包含详细的违规信息
      const error = new AppError('检测到违规图片，请移除后重新发布', 422);
      error.type = 'CONTENT_VIOLATION';
      error.violatedImages = violatedImages;
      error.validImages = validImages;
      error.totalImages = images.length;
      error.deletionId = deletionId;
      throw error;
    }

    console.log(`✅ 图片内容检查完成，${validImages.length}张图片全部通过审核`);
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * 取消待删除的图片删除任务
 * 在帖子成功发布时调用，避免删除已使用的图片
 */
function cancelImageDeletion(deletionId) {
  if (deletionId && pendingDeletions.has(deletionId)) {
    const deletion = pendingDeletions.get(deletionId);
    clearTimeout(deletion.timeoutId);
    pendingDeletions.delete(deletionId);
    console.log('✅ 已取消图片延迟删除任务:', deletionId);
    return true;
  }
  return false;
}

module.exports = {
  checkImagesMiddleware,
  cancelImageDeletion
};
