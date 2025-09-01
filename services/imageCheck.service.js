const axios = require('axios');
const fs = require('fs');
const path = require('path');
const request = require('request');
const wxToken = require('./wxToken.service');

/**
 * 简单的图片内容检查（从URL）
 */
async function checkImageContent(imageUrl) {
  let tempFilePath = null;
  
  try {
    // 1. 构建小图URL（七牛云）
    const smallImageUrl = buildSmallImageUrl(imageUrl);
    
    // 2. 下载小图
    tempFilePath = await downloadImage(smallImageUrl);
    
    // 3. 获取微信token
    const access_token = await wxToken.getValidToken();
    if (!access_token) {
      throw new Error('获取微信access_token失败');
    }

    // 4. 调用微信检查API
    const formData = { media: fs.createReadStream(tempFilePath) };
    const checkUrl = `https://api.weixin.qq.com/wxa/img_sec_check?access_token=${access_token}`;

    return new Promise((resolve, reject) => {
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
            resolve(result);
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
 * 构建七牛云小图URL
 */
function buildSmallImageUrl(imageUrl) {
  try {
    const url = new URL(imageUrl);
    // 如果是七牛云，添加小图参数
    if (url.hostname.includes('qiniup.com') || url.hostname.includes('qiniu')) {
      return imageUrl + '?imageView2/2/w/400/h/600/q/60';
    }
    return imageUrl;
  } catch (error) {
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
