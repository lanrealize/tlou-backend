# 部署文档

本文档说明如何将 tlou-backend 部署到生产服务器。

## 部署方式

本项目使用简单的Docker部署方式：
1. 在服务器上拉取最新代码
2. 使用Dockerfile构建镜像
3. 运行Docker容器
4. 清理旧容器和镜像

## 前置要求

### 本地环境
- **Windows**: 需要安装 OpenSSH 客户端（Windows 10 1809+ 自带）或使用 Git Bash
- **Linux/Mac**: 原生支持 SSH

### 服务器环境
- Ubuntu系统
- 已安装 Docker
- 已安装 Git
- 项目代码已克隆到服务器

## 配置

在首次使用前，需要修改部署脚本中的配置：

### 1. 修改服务器IP地址

编辑 `scripts/deploy.sh` 或 `scripts/deploy.ps1`，将 `SERVER_HOST` 修改为实际的服务器IP：

```bash
# deploy.sh 中
SERVER_HOST="${SERVER_HOST:-your-server-ip}"  # 改为实际IP，如: 123.456.789.0

# deploy.ps1 中
$SERVER_HOST = if ($env:SERVER_HOST) { $env:SERVER_HOST } else { "your-server-ip" }  # 改为实际IP
```

### 2. 确认项目目录

默认项目目录为 `/root/tlou-backend`，如果服务器上的目录不同，请修改：

```bash
# deploy.sh 中
PROJECT_DIR="${PROJECT_DIR:-/root/tlou-backend}"

# deploy.ps1 中
$PROJECT_DIR = if ($env:PROJECT_DIR) { $env:PROJECT_DIR } else { "/root/tlou-backend" }
```

### 3. 或使用环境变量

也可以通过环境变量配置，无需修改脚本：

**Windows (PowerShell):**
```powershell
$env:SERVER_HOST = "123.456.789.0"
$env:PROJECT_DIR = "/root/tlou-backend"
.\scripts\deploy.ps1
```

**Linux/Mac/Git Bash:**
```bash
export SERVER_HOST="123.456.789.0"
export PROJECT_DIR="/root/tlou-backend"
./scripts/deploy.sh
```

## 使用方法

### Windows 用户

#### 方法1: 使用PowerShell（推荐）
```powershell
cd D:\Codes\Cursor\tlou-backend
.\scripts\deploy.ps1
```

首次连接时需要手动输入密码: `laN316208`

#### 方法2: 使用Git Bash
```bash
cd /d/Codes/Cursor/tlou-backend
bash scripts/deploy.sh
```

### Linux/Mac 用户

```bash
cd /path/to/tlou-backend
bash scripts/deploy.sh
```

## 部署流程

脚本会自动执行以下步骤：

1. **连接服务器** - SSH连接到生产服务器
2. **拉取代码** - 执行 `git pull origin master` 获取最新代码
3. **构建镜像** - 使用 `docker build` 构建新的镜像
4. **停止旧容器** - 停止当前运行的容器
5. **删除旧容器** - 删除旧的容器实例
6. **启动新容器** - 运行新构建的容器，保持以下配置：
   - 容器名: `tlou-backend`
   - 端口映射: `3001:3001`
   - 重启策略: `unless-stopped`
7. **清理镜像** - 清理未使用的Docker镜像释放空间

## 验证部署

部署完成后，可以通过以下方式验证：

### 1. 检查容器状态
```bash
ssh root@your-server-ip "docker ps | grep tlou-backend"
```

应该看到类似输出：
```
xxxx  tlou-backend  "docker-entrypoint..."  X seconds ago  Up X seconds  0.0.0.0:3001->3001/tcp  tlou-backend
```

### 2. 查看容器日志
```bash
ssh root@your-server-ip "docker logs -f tlou-backend"
```

### 3. 测试健康检查
```bash
curl http://your-server-ip:3001/health
```

应该返回成功响应。

## 故障排查

### 问题1: SSH连接失败
- 检查服务器IP是否正确
- 检查网络连接和防火墙设置
- 确认SSH端口（默认22）是否开放

### 问题2: Docker构建失败
- 检查服务器上 `.env` 文件是否存在
- 查看Docker日志: `docker logs tlou-backend`
- 检查磁盘空间: `df -h`

### 问题3: 容器启动失败
- 检查端口3001是否被占用: `netstat -tunlp | grep 3001`
- 查看容器日志: `docker logs tlou-backend`
- 检查环境变量配置

### 问题4: 旧容器未清理
手动清理：
```bash
ssh root@your-server-ip
docker ps -a  # 查看所有容器
docker rm -f <container-id>  # 强制删除指定容器
docker image prune -f  # 清理悬空镜像
```

## 安全建议

⚠️ **注意**: 脚本中包含服务器密码，请注意安全：

1. **不要提交到公共仓库** - 确保 `.gitignore` 忽略部署脚本或使用环境变量
2. **使用SSH密钥** - 推荐使用SSH密钥认证代替密码：
   ```bash
   # 生成密钥
   ssh-keygen -t rsa -b 4096
   
   # 复制公钥到服务器
   ssh-copy-id root@your-server-ip
   ```
3. **限制文件权限** - Linux/Mac上设置脚本权限：
   ```bash
   chmod 700 scripts/deploy.sh
   ```

## 回滚

如果部署出现问题需要回滚：

```bash
ssh root@your-server-ip
cd /root/tlou-backend

# 回滚代码
git log --oneline -10  # 查看最近的提交
git reset --hard <commit-hash>  # 回滚到指定提交

# 重新构建和运行
docker build -t tlou-backend:latest .
docker stop tlou-backend
docker rm tlou-backend
docker run -d --name tlou-backend --restart unless-stopped -p 3001:3001 tlou-backend:latest
```

## 维护

- 定期清理Docker资源：`docker system prune -a`
- 定期备份数据和配置
- 监控服务器磁盘空间和内存使用

