const Circle = require('../models/Circle');

/**
 * 更新朋友圈的最新活动时间
 * @param {String} circleId - 朋友圈ID
 * @returns {Promise} 
 */
async function updateCircleActivity(circleId) {
  try {
    await Circle.findByIdAndUpdate(circleId, {
      latestActivityTime: new Date()
    });
  } catch (error) {
    // 静默处理错误，不影响主要业务流程
    console.error('更新朋友圈活动时间失败:', error);
  }
}

module.exports = {
  updateCircleActivity
};