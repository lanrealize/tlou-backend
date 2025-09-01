// Mock图片检查服务用于测试
const checkImageContent = jest.fn().mockResolvedValue({
  errcode: 0,
  errmsg: 'ok'
});

module.exports = {
  checkImageContent
};
