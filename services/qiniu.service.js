const qiniu = require('qiniu');

/**
 * 七牛云服务模块
 * 提供独立的图片上传Token生成和管理功能
 */

/**
 * 七牛云配置 - 从环境变量读取
 */
const QINIU_CONFIG = {
  accessKey: process.env.QINIU_ACCESS_KEY,
  secretKey: process.env.QINIU_SECRET_KEY,
  bucket: process.env.QINIU_BUCKET,
  domain: process.env.QINIU_DOMAIN
};

/**
 * 验证七牛云配置是否完整
 */
function validateQiniuConfig() {
  const requiredFields = ['accessKey', 'secretKey', 'bucket', 'domain'];
  const missingFields = [];
  
  requiredFields.forEach(field => {
    if (!QINIU_CONFIG[field]) {
      missingFields.push(field);
    }
  });
  
  if (missingFields.length > 0) {
    const envNameMap = {
      accessKey: 'QINIU_ACCESS_KEY',
      secretKey: 'QINIU_SECRET_KEY',
      bucket: 'QINIU_BUCKET',
      domain: 'QINIU_DOMAIN'
    };
    throw new Error(`七牛云配置不完整，缺少环境变量: ${missingFields.map(f => envNameMap[f]).join(', ')}`);
  }
  
  return true;
}

/**
 * 初始化七牛云MAC认证
 */
function initQiniuMac() {
  validateQiniuConfig();
  return new qiniu.auth.digest.Mac(QINIU_CONFIG.accessKey, QINIU_CONFIG.secretKey);
}

/**
 * 生成上传Token
 * @param {Object} options 上传选项
 * @param {string} options.pathType 路径类型: avatar|moment|post|chat|other|custom
 * @param {string} options.userId 用户ID
 * @param {number} options.expires Token过期时间（秒），默认3600秒
 * @param {number} options.fsizeLimit 文件大小限制（字节），默认10MB
 * @returns {Object} 包含uploadToken和相关信息的对象
 */
async function generateUploadToken(options = {}) {
  try {
    const {
      pathType = 'avatar',
      userId = 'anonymous',
      expires = 3600,
      fsizeLimit = 10 * 1024 * 1024 // 10MB
    } = options;

    console.log(`🔑 生成${pathType}上传Token，用户: ${userId}`);

    const mac = initQiniuMac();

    // 根据路径类型生成不同的上传策略
    const keyPrefix = generateKeyPrefix(pathType, userId);
    
    const putPolicy = new qiniu.rs.PutPolicy({
      scope: QINIU_CONFIG.bucket,
      expires: expires,
      fsizeLimit: fsizeLimit,
      returnBody: JSON.stringify({
        key: '$(key)',
        hash: '$(etag)',
        fsize: '$(fsize)',
        bucket: '$(bucket)',
        url: `${QINIU_CONFIG.domain}/$(key)`,
        pathType: pathType,
        userId: userId
      }),
      // 设置允许的文件类型（图片）
      mimeLimit: 'image/*'
    });

    const uploadToken = putPolicy.uploadToken(mac);

    return {
      success: true,
      data: {
        uploadToken: uploadToken,
        domain: QINIU_CONFIG.domain,
        bucket: QINIU_CONFIG.bucket,
        keyPrefix: keyPrefix,
        expires: expires,
        pathType: pathType,
        fsizeLimit: fsizeLimit,
        expiresAt: new Date(Date.now() + expires * 1000).toISOString()
      },
      message: 'Token生成成功'
    };

  } catch (error) {
    console.error('❌ 生成上传Token失败:', error);
    throw error;
  }
}

/**
 * 根据路径类型和用户ID生成文件路径前缀
 * @param {string} pathType 路径类型
 * @param {string} userId 用户ID
 * @returns {string} 路径前缀
 */
function generateKeyPrefix(pathType, userId) {
  const safeUserId = userId.replace(/[^\w-]/g, '');
  const today = new Date();
  const dateStr = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
  
  const prefixMap = {
    avatar: `avatars/${safeUserId}/`,
    moment: `moments/${safeUserId}/${dateStr}/`,
    post: `posts/${safeUserId}/${dateStr}/`,
    chat: `chats/${safeUserId}/${dateStr}/`,
    other: `images/${safeUserId}/`,
    custom: `custom/${safeUserId}/`
  };
  
  return prefixMap[pathType] || prefixMap.other;
}



/**
 * 获取七牛云配置信息（不包含敏感信息）
 * @returns {Object} 配置信息
 */
function getQiniuInfo() {
  try {
    validateQiniuConfig();
    
    return {
      success: true,
      data: {
        bucket: QINIU_CONFIG.bucket,
        domain: QINIU_CONFIG.domain,
        isConfigured: true
      }
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      data: {
        isConfigured: false
      }
    };
  }
}

module.exports = {
  generateUploadToken,
  getQiniuInfo,
  validateQiniuConfig
};