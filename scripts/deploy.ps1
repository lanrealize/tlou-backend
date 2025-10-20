# 部署脚本 - 部署tlou-backend到生产服务器
# 使用方法: .\deploy.ps1

# ==================== 配置区域 ====================
$SERVER_HOST = if ($env:SERVER_HOST) { $env:SERVER_HOST } else { "your-server-ip" }  # 服务器IP地址，请修改为实际IP
$SERVER_USER = "root"
$SERVER_PASSWORD = "laN316208"
$SERVER_PORT = "22"
$PROJECT_DIR = if ($env:PROJECT_DIR) { $env:PROJECT_DIR } else { "/root/tlou-backend" }  # 服务器上项目目录，请根据实际情况修改
$CONTAINER_NAME = "tlou-backend"
$IMAGE_NAME = "tlou-backend"
$PORT_MAPPING = "3001:3001"
# ==================================================

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "开始部署 tlou-backend" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "服务器: $SERVER_HOST"
Write-Host "项目目录: $PROJECT_DIR"
Write-Host ""

# 创建部署脚本
$deployScript = @"
#!/bin/bash
set -e

PROJECT_DIR="$PROJECT_DIR"
CONTAINER_NAME="$CONTAINER_NAME"
IMAGE_NAME="$IMAGE_NAME"
PORT_MAPPING="$PORT_MAPPING"

echo "======================================"
echo "步骤 1/6: 拉取最新代码..."
echo "======================================"
cd \$PROJECT_DIR
echo "当前目录: \$(pwd)"
git pull origin master
echo "✓ 代码拉取完成"
echo ""

echo "======================================"
echo "步骤 2/6: 构建新的Docker镜像..."
echo "======================================"
docker build -t \$IMAGE_NAME:latest .
echo "✓ 镜像构建完成"
echo ""

echo "======================================"
echo "步骤 3/6: 停止旧容器..."
echo "======================================"
if docker ps -a | grep -q \$CONTAINER_NAME; then
    echo "停止容器: \$CONTAINER_NAME"
    docker stop \$CONTAINER_NAME || true
    echo "✓ 旧容器已停止"
else
    echo "未找到运行中的容器"
fi
echo ""

echo "======================================"
echo "步骤 4/6: 删除旧容器..."
echo "======================================"
if docker ps -a | grep -q \$CONTAINER_NAME; then
    echo "删除容器: \$CONTAINER_NAME"
    docker rm \$CONTAINER_NAME || true
    echo "✓ 旧容器已删除"
else
    echo "未找到需要删除的容器"
fi
echo ""

echo "======================================"
echo "步骤 5/6: 启动新容器..."
echo "======================================"
docker run -d --name \$CONTAINER_NAME --restart unless-stopped -p \$PORT_MAPPING \$IMAGE_NAME:latest
echo "✓ 新容器已启动"
echo ""
echo "容器状态:"
docker ps | grep \$CONTAINER_NAME
echo ""

echo "======================================"
echo "步骤 6/6: 清理未使用的镜像..."
echo "======================================"
docker image prune -f
echo "✓ 清理完成"
echo ""

echo "======================================"
echo "✓ 部署完成！"
echo "======================================"
echo ""
"@

# 执行部署
Write-Host "连接到服务器..." -ForegroundColor Yellow

try {
    # 使用Windows内置的ssh（Windows 10 1809+）
    $deployScript | ssh -o StrictHostKeyChecking=no -p $SERVER_PORT "$SERVER_USER@$SERVER_HOST" "bash -s"
    
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Green
    Write-Host "✓ 部署完成！" -ForegroundColor Green
    Write-Host "======================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "提示：首次连接可能需要手动输入密码: $SERVER_PASSWORD" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "检查容器日志:" -ForegroundColor Cyan
    Write-Host "  ssh $SERVER_USER@$SERVER_HOST 'docker logs -f $CONTAINER_NAME'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "检查容器状态:" -ForegroundColor Cyan
    Write-Host "  ssh $SERVER_USER@$SERVER_HOST 'docker ps'" -ForegroundColor Gray
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "错误: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "请确保:" -ForegroundColor Yellow
    Write-Host "1. 已安装OpenSSH客户端（Windows 10 1809+自带）" -ForegroundColor Yellow
    Write-Host "2. 服务器IP地址配置正确（当前: $SERVER_HOST）" -ForegroundColor Yellow
    Write-Host "3. 可以访问服务器（防火墙/网络连接正常）" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "或者使用Git Bash运行: bash scripts/deploy.sh" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}
