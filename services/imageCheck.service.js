const axios = require('axios');
const fs = require('fs');
const path = require('path');
const request = require('request');
const wxToken = require('./wxToken.service');

/**
 * 图片内容检查（基于微信内容安全API）
 * 
 * 工作流程：
 * 1. 从七牛云获取压缩后的图片（不占用后端资源）
 * 2. 将压缩图片发送到微信API进行内容审核
 * 3. 如果文件过大(>1MB)，自动降级到更小的压缩级别重试
 * 
 * @param {string} imageUrl - 原始图片URL（七牛云地址）
 * @param {number} retryLevel - 内部使用的压缩级别 (0-2)
 * @returns {Promise<Object>} 微信API检查结果 {errcode, errmsg}
 */
async function checkImageContent(imageUrl, retryLevel = 0) {
  let tempFilePath = null;
  
  try {
    // 1. 根据重试级别选择七牛压缩参数
    //    完全依赖七牛云压缩，不在后端做任何处理
    const smallImageUrl = buildSmallImageUrl(imageUrl, retryLevel);
    
    // 2. 从七牛下载已压缩的图片
    tempFilePath = await downloadImage(smallImageUrl);
    
    // 3. 获取微信token
    const access_token = await wxToken.getValidToken();
    if (!access_token) {
      throw new Error('获取微信access_token失败');
    }

    // 4. 调用微信检查API
    const formData = { media: fs.createReadStream(tempFilePath) };
    const checkUrl = `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${access_token}`;

    return new Promise(async (resolve, reject) => {
      request.post({ url: checkUrl, formData }, async (err, response, body) => {
        // 清理临时文件
        if (tempFilePath) {
          try { await fs.promises.unlink(tempFilePath); } catch {}
        }

        if (err) {
          reject(err);
        } else {
          try {
            const result = JSON.parse(body);
            
            // 微信API错误码处理
            // 0: 检查通过
            // 87014: 图片内容违规（真正的违规）
            // 40006: 文件大小不符（太大）- 可以重试更小的分辨率
            // 其他: API调用错误（token、频率限制等）
            if (result.errcode === 0) {
              // 检查通过
              resolve(result);
            } else if (result.errcode === 87014) {
              // 图片内容违规
              resolve(result);
            } else if (result.errcode === 40006 && retryLevel < 2) {
              // 文件太大，自动降级到更小的七牛压缩参数
              console.log(`⚠️ 图片文件过大，自动使用更激进的压缩 (Level ${retryLevel + 1})...`);
              try {
                const retryResult = await checkImageContent(imageUrl, retryLevel + 1);
                resolve(retryResult);
              } catch (retryError) {
                reject(retryError);
              }
            } else {
              // 其他错误：token失效、频率限制等 - 这是API错误，不是图片违规
              const errorMsg = `微信图片检查API调用失败 [errcode: ${result.errcode}]: ${result.errmsg || '未知错误'}`;
              console.error('❌', errorMsg);
              reject(new Error(errorMsg));
            }
          } catch (parseError) {
            reject(new Error('解析微信API响应失败'));
          }
        }
      });
    });
  } catch (error) {
    // 清理临时文件
    if (tempFilePath) {
      try { await fs.promises.unlink(tempFilePath); } catch {}
    }
    throw error;
  }
}

/**
 * 构建七牛云压缩图片URL
 * 完全依赖七牛云的图片处理能力，不在后端做任何压缩
 * 
 * @param {string} imageUrl - 原始图片URL
 * @param {number} retryLevel - 压缩级别 (0-2)，级别越高压缩越激进
 * @returns {string} 带七牛压缩参数的URL
 */
function buildSmallImageUrl(imageUrl, retryLevel = 0) {
  try {
    const url = new URL(imageUrl);
    
    // 识别七牛云或绑定的CDN域名
    const isQiniuOrCDN = url.hostname.includes('qiniup.com') || 
                         url.hostname.includes('qiniu') || 
                         url.hostname.includes('clouddn.com') ||
                         url.hostname.includes('images.wltech-service.site');
    
    if (!isQiniuOrCDN) {
      // 不是七牛/CDN域名，返回原图
      return imageUrl;
    }
    
    // 三级压缩策略：平衡质量与文件大小
    const compressionLevels = [
      // Level 0: 标准压缩 (适用于大多数场景，约600-800KB)
      'imageView2/2/w/400/h/600/q/60/format/jpg/interlace/1|imageslim',
      
      // Level 1: 激进压缩 (用于特大图片，约300-500KB)
      'imageView2/2/w/280/h/420/q/45/format/jpg/interlace/1|imageslim',
      
      // Level 2: 最大压缩 (确保通过检查，约200-400KB)
      'imageView2/2/w/200/h/300/q/35/format/jpg/interlace/1|imageslim'
    ];
    
    const compressionParam = compressionLevels[retryLevel] || compressionLevels[compressionLevels.length - 1];
    
    // 智能拼接URL参数
    const separator = imageUrl.includes('?') ? '&' : '?';
    return imageUrl + separator + compressionParam;
    
  } catch (error) {
    console.error('构建七牛压缩URL失败:', error.message);
    return imageUrl;
  }
}

/**
 * 下载图片到临时文件
 */
async function downloadImage(imageUrl) {
  const tempDir = path.join(__dirname, '../temp');
  await fs.promises.mkdir(tempDir, { recursive: true });
  
  const fileName = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
  const filePath = path.join(tempDir, fileName);

  const response = await axios({
    method: 'GET',
    url: imageUrl,
    responseType: 'stream',
    timeout: 8000,
    maxContentLength: 2 * 1024 * 1024 // 2MB
  });
  
  const writer = fs.createWriteStream(filePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(filePath));
    writer.on('error', reject);
  });
}

module.exports = {
  checkImageContent
};
