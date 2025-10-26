# Scripts 目录结构

本目录包含了项目的各种脚本，按功能分类组织。

## 📁 目录结构

```
scripts/
├── admin/              # 管理员和数据迁移相关
├── cleanup/            # 数据清理相关
├── deploy/             # 部署相关
└── README.md           # 本说明文件
```

## 🔧 Admin (管理员脚本)

管理员权限设置和数据迁移脚本：

- **`migrateData.js`** - 数据迁移脚本，用于版本升级时的数据格式转换
- **`migrateToOpenidPrimary.js`** - 迁移到openid作为主键的脚本  
- **`setAdmin.js`** - 设置用户为管理员
- **`setVirtualUsersAdmin.js`** - 批量设置虚拟用户为管理员

### 使用方法
```bash
# 设置管理员
node scripts/admin/setAdmin.js <openid>

# 设置虚拟用户管理员权限
node scripts/admin/setVirtualUsersAdmin.js
```

## 🧹 Cleanup (清理脚本)

数据库清理和维护脚本：

- **`checkDatabaseState.js`** - 检查数据库状态和数据一致性
- **`cleanupOrphanData.js`** - 清理孤儿数据（已删除用户的残余数据）
- **`cleanupTestUsers.js`** - 清理所有test开头的测试用户 ⭐ **新增**
- **`deleteAllCircles.js`** - 删除所有朋友圈（慎用）
- **`deleteAllUsers.js`** - 删除所有用户（慎用）

### 使用方法
```bash
# 检查数据库状态
node scripts/cleanup/checkDatabaseState.js

# 清理孤儿数据
node scripts/cleanup/cleanupOrphanData.js

# 清理test用户（推荐测试后使用）
node scripts/cleanup/cleanupTestUsers.js

# ⚠️ 危险操作 - 清空所有数据
node scripts/cleanup/deleteAllCircles.js
node scripts/cleanup/deleteAllUsers.js
```

## 🚀 Deploy (部署脚本)

项目部署相关脚本：

- **`deploy.sh`** - Linux/MacOS 部署脚本
- **`deploy.ps1`** - Windows PowerShell 部署脚本

### 使用方法
```bash
# Linux/MacOS
chmod +x scripts/deploy/deploy.sh
./scripts/deploy/deploy.sh

# Windows PowerShell
.\scripts\deploy\deploy.ps1
```

## ⚠️ 重要提示

1. **生产环境慎用**：所有清理脚本都会直接操作生产数据库，请确保在测试环境验证无误后再在生产环境使用。

2. **备份数据**：执行任何清理操作前，建议先备份重要数据。

3. **环境变量**：确保 `.env` 文件中的 `MONGODB_URI` 配置正确。

4. **权限检查**：部分脚本需要管理员权限或特定环境变量。

## 🎯 最新更新

### v2.0 (2025-10-26)
- ✅ 重新组织scripts目录结构
- ✅ 新增 `cleanupTestUsers.js` 脚本
- ✅ 修复虚拟用户删除时的数据清理问题
- ✅ 所有清理脚本现在使用统一的 `cleanupUserData` 函数

### 清理效果
刚刚的清理操作结果：
- ✅ 删除了 2 个test用户
- ✅ 当前数据库只剩3个用户（1个主管理员 + 2个虚拟用户）
- ✅ 数据库状态干净，适合前端测试
