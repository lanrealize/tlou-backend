const express = require('express');
const router = express.Router();
const qiniuController = require('../controllers/qiniu.controller');

/**
 * 七牛云图片上传相关路由
 * 基础路径: /api/qiniu
 */

// 生成上传Token (POST方式)
router.post('/upload-token', qiniuController.generateUploadToken);

// 获取上传Token (GET方式，兼容性)
router.get('/upload-token', qiniuController.getUploadToken);



// 获取七牛云配置信息
router.get('/info', qiniuController.getQiniuInfo);

// 健康检查
router.get('/health', qiniuController.healthCheck);

module.exports = router;