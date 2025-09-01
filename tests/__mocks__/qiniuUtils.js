// Mock七牛云删除工具用于测试
const deleteQiniuFiles = jest.fn().mockResolvedValue();

module.exports = {
  deleteQiniuFiles
};
