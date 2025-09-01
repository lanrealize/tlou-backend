const qiniu = require('qiniu');

/**
 * 七牛云文件删除工具
 * 复用现有的删除逻辑
 */
async function deleteQiniuFiles(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) return;
  
  const accessKey = process.env.QINIU_ACCESS_KEY;
  const secretKey = process.env.QINIU_SECRET_KEY;
  
  if (!accessKey || !secretKey) {
    console.warn('⚠️ 七牛云密钥未配置，跳过文件删除');
    return;
  }

  const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
  const bucketManager = new qiniu.rs.BucketManager(mac);
  const bucket = process.env.QINIU_BUCKET || 'tlou';

  // 确保输入是数组
  const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];

  for (const url of urls) {
    try {
      const key = new URL(url).pathname.substring(1);
      bucketManager.delete(bucket, key, (err, respBody, respInfo) => {
        if (err) {
          console.error('❌ 文件删除失败:', key, err);
        } else if (respInfo.statusCode === 200) {
          console.log('✅ 文件删除成功:', key);
        }
      });
    } catch (error) {
      console.warn('⚠️ URL解析失败:', url);
    }
  }
}

module.exports = {
  deleteQiniuFiles
};
