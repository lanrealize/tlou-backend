const axios = require('axios');
const Token = require('../models/Token');

const WX_APPID = process.env.APP_ID;
const WX_SECRET = process.env.APP_SECRET;
const TOKEN_NAME = 'wx_access_token';

/**
 * 获取微信 Access Token
 * @returns {Promise<{token: string, expiresIn: number}>}
 */
async function getWxAccessToken() {
  try {
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=${WX_SECRET}`;
    const response = await axios.get(url);

    if (response.data.errcode) {
      throw new Error(`微信接口错误: ${response.data.errmsg}`);
    }

    return {
      token: response.data.access_token,
      expiresIn: response.data.expires_in
    };
  } catch (error) {
    console.error('获取微信Token失败:', error.message);
    throw error;
  }
}

/**
 * 从数据库获取 token
 * @returns {Promise<{token: string, expiresAt: Date}|null>}
 */
async function getTokenFromDB() {
  try {
    const tokenDoc = await Token.findOne({ name: TOKEN_NAME });
    if (!tokenDoc) return null;

    return {
      token: tokenDoc.value,
      expiresAt: tokenDoc.expiresAt
    };
  } catch (error) {
    console.error('从数据库获取Token失败:', error);
    return null;
  }
}

/**
 * 保存 token 到数据库
 * @param {string} token 
 * @param {number} expiresIn 过期时间（秒）
 * @returns {Promise<boolean>}
 */
async function saveTokenToDB(token, expiresIn) {
  try {
    // 计算过期时间（提前5分钟过期）
    const expiresAt = new Date(Date.now() + (expiresIn - 300) * 1000);

    // 更新或创建 token 记录
    await Token.findOneAndUpdate(
      { name: TOKEN_NAME },
      {
        value: token,
        expiresAt
      },
      { upsert: true, new: true }
    );

    return true;
  } catch (error) {
    console.error('保存Token到数据库失败:', error);
    return false;
  }
}

/**
 * 获取有效 token
 * @returns {Promise<string>}
 */
async function getValidToken() {
  try {
    // 1. 尝试从数据库获取 token
    const tokenData = await getTokenFromDB();

    // 2. 检查 token 是否有效
    if (tokenData && tokenData.expiresAt > new Date()) {
      return tokenData.token;
    }

    // 3. 获取新 token
    const { token, expiresIn } = await getWxAccessToken();

    // 4. 保存到数据库
    await saveTokenToDB(token, expiresIn);

    return token;
  } catch (error) {
    console.error('获取有效Token失败:', error);
    throw error;
  }
}

/**
 * 强制刷新 token
 * @returns {Promise<string>}
 */
async function refreshToken() {
  try {
    const { token, expiresIn } = await getWxAccessToken();
    await saveTokenToDB(token, expiresIn);
    console.log('强制更新微信Access Token成功');
    return token;
  } catch (error) {
    console.error('刷新Token失败:', error);
    throw error;
  }
}

module.exports = {
  getValidToken,
  refreshToken
};
