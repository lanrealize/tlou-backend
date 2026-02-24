const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { checkOpenid } = require('../middleware/openidAuth');
const { catchAsync, AppError } = require('../utils/errorHandler');
const { TEMPLATES } = require('../services/notification.service');

const VALID_TEMPLATE_IDS = new Set(Object.values(TEMPLATES).map(t => t.id));

// POST /api/notifications/subscribe
// 前端在用户 accept 订阅后调用，上报订阅结果
// body: { subscribeResult: { [templateId]: 'accept' | 'reject' | 'ban' } }
router.post('/subscribe', checkOpenid, catchAsync(async (req, res) => {
  const { subscribeResult } = req.body;

  if (!subscribeResult || typeof subscribeResult !== 'object') {
    throw new AppError('缺少 subscribeResult', 400);
  }

  const accepted = Object.entries(subscribeResult)
    .filter(([id, status]) => status === 'accept' && VALID_TEMPLATE_IDS.has(id))
    .map(([id]) => id);

  const rejected = Object.entries(subscribeResult)
    .filter(([id, status]) => status !== 'accept' && VALID_TEMPLATE_IDS.has(id))
    .map(([id]) => id);

  await User.findByIdAndUpdate(req.user._id, {
    $addToSet: { subscribedTemplates: { $each: accepted } },
    $pullAll: { subscribedTemplates: rejected },
  });

  res.json({ success: true });
}));

module.exports = router;
