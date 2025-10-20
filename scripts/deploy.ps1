# 部署脚本 - 部署tlou-backend到生产服务器
# 使用方法: .\deploy.ps1

# ==================== 配置区域 ====================
$SERVER_HOST = if ($env:SERVER_HOST) { $env:SERVER_HOST } else { "212.64.18.231" }
$SERVER_USER = "root"
$SERVER_PASSWORD = "laN316208"
$SERVER_PORT = "22"
$PROJECT_DIR = if ($env:PROJECT_DIR) { $env:PROJECT_DIR } else { "/data/code/tlou/tlou-backend" }
$CONTAINER_NAME = "tlou-backend"
$IMAGE_NAME = "tlou-backend"
$PORT_MAPPING = "3001:3001"
# ==================================================

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Deploy tlou-backend to server" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Server: $SERVER_HOST"
Write-Host "Project Dir: $PROJECT_DIR"
Write-Host ""

# 部署脚本内容
$deployScript = @"
#!/bin/bash
set -e

PROJECT_DIR="$PROJECT_DIR"
CONTAINER_NAME="$CONTAINER_NAME"
IMAGE_NAME="$IMAGE_NAME"
PORT_MAPPING="$PORT_MAPPING"

echo "======================================"
echo "Step 1/6: Pull latest code..."
echo "======================================"
cd \$PROJECT_DIR
echo "Current directory: \$(pwd)"
git pull origin master
echo "Done"
echo ""

echo "======================================"
echo "Step 2/6: Build Docker image..."
echo "======================================"
docker build -t \$IMAGE_NAME:latest .
echo "Done"
echo ""

echo "======================================"
echo "Step 3/6: Stop old container..."
echo "======================================"
if docker ps -a | grep -q \$CONTAINER_NAME; then
    echo "Stopping container: \$CONTAINER_NAME"
    docker stop \$CONTAINER_NAME || true
    echo "Done"
else
    echo "No running container found"
fi
echo ""

echo "======================================"
echo "Step 4/6: Remove old container..."
echo "======================================"
if docker ps -a | grep -q \$CONTAINER_NAME; then
    echo "Removing container: \$CONTAINER_NAME"
    docker rm \$CONTAINER_NAME || true
    echo "Done"
else
    echo "No container to remove"
fi
echo ""

echo "======================================"
echo "Step 5/6: Start new container..."
echo "======================================"
docker run -d --name \$CONTAINER_NAME --restart unless-stopped -p \$PORT_MAPPING \$IMAGE_NAME:latest
echo "Done"
echo ""
echo "Container status:"
docker ps | grep \$CONTAINER_NAME
echo ""

echo "======================================"
echo "Step 6/6: Cleanup unused images..."
echo "======================================"
docker image prune -f
echo "Done"
echo ""

echo "======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
"@

# 执行部署
Write-Host "Connecting to server..." -ForegroundColor Yellow

try {
    # 转换Windows换行符为Unix换行符
    $deployScriptUnix = $deployScript -replace "`r`n", "`n"
    $deployScriptUnix | ssh -o StrictHostKeyChecking=no -p $SERVER_PORT "$SERVER_USER@$SERVER_HOST" "bash -s"
    
    Write-Host ""
    Write-Host "======================================" -ForegroundColor Green
    Write-Host "Deployment Complete!" -ForegroundColor Green
    Write-Host "======================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Password (if prompted): $SERVER_PASSWORD" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Check logs:" -ForegroundColor Cyan
    Write-Host "  ssh $SERVER_USER@$SERVER_HOST 'docker logs -f $CONTAINER_NAME'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Check status:" -ForegroundColor Cyan
    Write-Host "  ssh $SERVER_USER@$SERVER_HOST 'docker ps'" -ForegroundColor Gray
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please check:" -ForegroundColor Yellow
    Write-Host "1. OpenSSH client installed (built-in on Windows 10 1809+)" -ForegroundColor Yellow
    Write-Host "2. Server IP is correct (current: $SERVER_HOST)" -ForegroundColor Yellow
    Write-Host "3. Server is accessible (firewall/network)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternative: use Git Bash to run bash scripts/deploy.sh" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}
