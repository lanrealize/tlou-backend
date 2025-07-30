// 微信小程序前端使用示例

// 1. 登录流程
function login() {
  wx.login({
    success: (res) => {
      if (res.code) {
        console.log('获取到临时code:', res.code);
        
        // 发送code到后端换取openid
        wx.request({
          url: 'http://localhost:3000/api/wechat/login',
          method: 'POST',
          data: { code: res.code },
          success: (response) => {
            if (response.data.success) {
              const { openid, user } = response.data.data;
              console.log('登录成功，openid:', openid);
              console.log('用户信息:', user);
              
              // 保存到本地存储
              wx.setStorageSync('openid', openid);
              wx.setStorageSync('userInfo', user);
              
              // 登录成功后的处理
              onLoginSuccess();
            } else {
              console.error('登录失败:', response.data.message);
            }
          },
          fail: (error) => {
            console.error('请求失败:', error);
          }
        });
      } else {
        console.error('获取code失败');
      }
    }
  });
}

// 2. 获取用户信息（需要认证）
function getUserInfo() {
  const openid = wx.getStorageSync('openid');
  
  if (!openid) {
    console.error('请先登录');
    return;
  }
  
  // 方式1：在请求体中传递openid
  wx.request({
    url: 'http://localhost:3000/api/wechat/protected/user-info',
    method: 'GET',
    data: { openid: openid },
    success: (response) => {
      if (response.data.success) {
        console.log('用户信息:', response.data.data.user);
      } else {
        console.error('获取用户信息失败:', response.data.message);
      }
    }
  });
  
  // 方式2：在URL参数中传递openid
  wx.request({
    url: `http://localhost:3000/api/wechat/protected/user-info?openid=${openid}`,
    method: 'GET',
    success: (response) => {
      console.log('用户信息:', response.data.data.user);
    }
  });
  
  // 方式3：在请求头中传递openid
  wx.request({
    url: 'http://localhost:3000/api/wechat/protected/user-info',
    method: 'GET',
    header: { 'x-openid': openid },
    success: (response) => {
      console.log('用户信息:', response.data.data.user);
    }
  });
}

// 3. 获取朋友圈列表
function getMyCircles() {
  const openid = wx.getStorageSync('openid');
  
  wx.request({
    url: 'http://localhost:3000/api/circles/my',
    method: 'GET',
    data: { openid: openid },
    success: (response) => {
      if (response.data.success) {
        console.log('朋友圈列表:', response.data.data.circles);
      } else {
        console.error('获取朋友圈失败:', response.data.message);
      }
    }
  });
}

// 4. 创建朋友圈
function createCircle() {
  const openid = wx.getStorageSync('openid');
  
  wx.request({
    url: 'http://localhost:3000/api/circles',
    method: 'POST',
    data: {
      openid: openid,
      name: '我的朋友圈',
      isPublic: true
    },
    success: (response) => {
      if (response.data.success) {
        console.log('朋友圈创建成功:', response.data.data.circle);
      } else {
        console.error('创建朋友圈失败:', response.data.message);
      }
    }
  });
}

// 5. 更新用户信息
function updateUserInfo() {
  const openid = wx.getStorageSync('openid');
  
  wx.request({
    url: 'http://localhost:3000/api/wechat/protected/user-info',
    method: 'PUT',
    data: {
      openid: openid,
      username: '新用户名',
      avatar: 'https://example.com/new-avatar.jpg'
    },
    success: (response) => {
      if (response.data.success) {
        console.log('用户信息更新成功:', response.data.data.user);
        // 更新本地存储
        wx.setStorageSync('userInfo', response.data.data.user);
      } else {
        console.error('更新用户信息失败:', response.data.message);
      }
    }
  });
}

// 6. 检查登录状态
function checkLoginStatus() {
  const openid = wx.getStorageSync('openid');
  const userInfo = wx.getStorageSync('userInfo');
  
  if (openid && userInfo) {
    console.log('已登录，用户信息:', userInfo);
    return true;
  } else {
    console.log('未登录');
    return false;
  }
}

// 7. 退出登录
function logout() {
  wx.removeStorageSync('openid');
  wx.removeStorageSync('userInfo');
  console.log('已退出登录');
}

// 登录成功后的处理
function onLoginSuccess() {
  console.log('登录成功，可以开始使用其他功能');
  // 可以在这里跳转到主页面或执行其他操作
}

// 使用示例
function example() {
  // 检查登录状态
  if (!checkLoginStatus()) {
    // 未登录，执行登录
    login();
  } else {
    // 已登录，获取用户信息
    getUserInfo();
    getMyCircles();
  }
}

// 导出函数供其他页面使用
module.exports = {
  login,
  getUserInfo,
  getMyCircles,
  createCircle,
  updateUserInfo,
  checkLoginStatus,
  logout,
  example
}; 