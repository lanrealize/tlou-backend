const axios = require('axios');
const { getValidToken } = require('./wxToken.service');

// 模板配置
const TEMPLATES = {
  like:    { id: 'ajP9Um5RwX_OOimtCh0F8Jzay6gaRchOgxH9HTxjZ9I', fields: (d) => ({ thing1: { value: d.postTitle }, thing2: { value: d.fromUsername } }) },
  comment: { id: 'xZs06-YwdNTKKLQU7lKyJrgsJpcZhHTBSmqPcyYt9pk', fields: (d) => ({ thing7: { value: d.circleName }, thing1: { value: d.content }, thing3: { value: d.fromUsername } }) },
  reply:   { id: 'h9Hx-qEUVnedm8qRbciafPK0WXTGAXK1aQ8AKm348jk', fields: (d) => ({ thing1: { value: d.postTitle }, thing4: { value: d.content }, name2: { value: d.fromUsername } }) },
  post:    { id: 'NLP6IOB1iYBXwGagqiCAKGJpG3zemgq6FLr_JC_1JCw',  fields: (d) => ({ name1: { value: d.fromUsername }, thing3: { value: d.content }, thing5: { value: d.circleName } }) },
};

/**
 * 向用户发送订阅消息
 * @param {string} toOpenid 接收者 openid
 * @param {'like'|'comment'|'reply'|'post'} type 通知类型
 * @param {object} data 模板数据
 * @returns {Promise<boolean>} 是否发送成功
 */
async function sendNotification(toOpenid, type, data) {
  const tpl = TEMPLATES[type];
  if (!tpl) return false;

  try {
    const token = await getValidToken();
    const res = await axios.post(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
      {
        touser: toOpenid,
        template_id: tpl.id,
        data: tpl.fields(data),
      }
    );

    if (res.data.errcode !== 0) {
      // 43101 = 用户未订阅或配额耗尽，属于正常情况，不报错
      if (res.data.errcode !== 43101) {
        console.error(`[notification] 推送失败 type=${type} openid=${toOpenid} errcode=${res.data.errcode} errmsg=${res.data.errmsg}`);
      }
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[notification] 推送异常 type=${type} openid=${toOpenid}`, err.message);
    return false;
  }
}

module.exports = { sendNotification, TEMPLATES };
