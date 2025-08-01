const qiniuService = require('../services/qiniu.service');

/**
 * 七牛云控制器
 * 处理图片上传相关的API请求
 */

/**
 * 生成上传Token
 * POST /api/qiniu/upload-token
 * @param {Object} req.body - 请求体
 * @param {string} req.body.pathType - 路径类型: avatar|moment|post|chat|other|custom
 * @param {string} req.body.userId - 用户ID（可选，默认从query获取）
 * @param {number} req.body.expires - Token过期时间（可选，默认3600秒）
 */
async function generateUploadToken(req, res) {
  try {
    console.log('🔑 收到生成上传Token请求:', req.body);

    const {
      pathType = 'avatar',
      userId = req.query.userId || req.body.userId || 'anonymous',
      expires = 3600
    } = req.body;

    // 参数验证
    const validPathTypes = ['avatar', 'moment', 'post', 'chat', 'other', 'custom'];
    if (!validPathTypes.includes(pathType)) {
      return res.status(400).json({
        success: false,
        message: `无效的路径类型。支持的类型: ${validPathTypes.join(', ')}`,
        code: 'INVALID_PATH_TYPE'
      });
    }

    if (expires < 60 || expires > 7200) {
      return res.status(400).json({
        success: false,
        message: 'Token过期时间应在60-7200秒之间',
        code: 'INVALID_EXPIRES'
      });
    }

    // 调用服务生成Token
    const result = await qiniuService.generateUploadToken({
      pathType,
      userId,
      expires
    });

    console.log('✅ Token生成成功:', { pathType, userId, expires });

    res.status(200).json(result);

  } catch (error) {
    console.error('❌ 生成上传Token失败:', error);
    
    res.status(500).json({
      success: false,
      message: error.message || '生成上传Token失败',
      code: 'TOKEN_GENERATION_ERROR'
    });
  }
}

/**
 * 获取上传Token（GET方式，兼容旧版本）
 * GET /api/qiniu/upload-token?pathType=avatar&userId=xxx
 */
async function getUploadToken(req, res) {
  try {
    const {
      pathType = 'avatar',
      userId = 'anonymous',
      expires = 3600
    } = req.query;

    console.log('🔑 收到GET方式Token请求:', req.query);

    const result = await qiniuService.generateUploadToken({
      pathType,
      userId,
      expires: parseInt(expires)
    });

    console.log('✅ Token生成成功 (GET):', { pathType, userId });

    res.status(200).json(result);

  } catch (error) {
    console.error('❌ 获取上传Token失败:', error);
    
    res.status(500).json({
      success: false,
      message: error.message || '获取上传Token失败',
      code: 'TOKEN_GET_ERROR'
    });
  }
}



/**
 * 获取七牛云配置信息
 * GET /api/qiniu/info
 */
function getQiniuInfo(req, res) {
  try {
    const result = qiniuService.getQiniuInfo();
    
    console.log('📋 返回七牛云配置信息');
    
    res.status(200).json(result);

  } catch (error) {
    console.error('❌ 获取七牛云信息失败:', error);
    
    res.status(500).json({
      success: false,
      message: error.message || '获取配置信息失败',
      code: 'INFO_ERROR'
    });
  }
}

/**
 * 健康检查
 * GET /api/qiniu/health
 */
function healthCheck(req, res) {
  try {
    qiniuService.validateQiniuConfig();
    
    res.status(200).json({
      success: true,
      message: '七牛云服务正常',
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      message: '七牛云服务配置异常',
      data: {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    });
  }
}

module.exports = {
  generateUploadToken,
  getUploadToken,
  getQiniuInfo,
  healthCheck
};