#!/bin/bash

# 部署脚本 - 部署tlou-backend到生产服务器
# 使用方法: ./deploy.sh

set -e  # 遇到错误立即退出

# ==================== 配置区域 ====================
SERVER_HOST="${SERVER_HOST:-212.64.18.231}"  # 服务器IP地址
SERVER_USER="root"
SERVER_PASSWORD="laN316208"
SERVER_PORT="22"
PROJECT_DIR="${PROJECT_DIR:-/data/code/tlou/tlou-backend}"  # 服务器上项目目录
CONTAINER_NAME="tlou-backend"
IMAGE_NAME="tlou-backend"
PORT_MAPPING="3001:3001"
# ==================================================

echo "======================================"
echo "开始部署 tlou-backend"
echo "======================================"
echo "服务器: ${SERVER_HOST}"
echo "项目目录: ${PROJECT_DIR}"
echo ""
echo "提示: 只需输入一次密码"
echo ""

# 检查是否安装了sshpass（用于自动输入密码）
if ! command -v sshpass &> /dev/null; then
    SSH_CMD="ssh -p ${SERVER_PORT} ${SERVER_USER}@${SERVER_HOST}"
else
    SSH_CMD="sshpass -p '${SERVER_PASSWORD}' ssh -o StrictHostKeyChecking=no -p ${SERVER_PORT} ${SERVER_USER}@${SERVER_HOST}"
fi

# 一次性执行所有部署步骤（只需要一次密码）
$SSH_CMD << ENDSSH
set -e

echo "======================================"
echo "步骤 1/6: 拉取最新代码..."
echo "======================================"
cd ${PROJECT_DIR}
echo "当前目录: \$(pwd)"
echo "强制使用远程仓库代码，丢弃本地更改..."
git fetch origin master
git reset --hard origin/master
echo "✓ 代码强制同步完成"
echo ""

echo "======================================"
echo "步骤 2/6: 构建新的Docker镜像..."
echo "======================================"
docker build -t ${IMAGE_NAME}:latest .
echo "✓ 镜像构建完成"
echo ""

echo "======================================"
echo "步骤 3/6: 停止旧容器..."
echo "======================================"
if docker ps -a | grep -q ${CONTAINER_NAME}; then
    echo "停止容器: ${CONTAINER_NAME}"
    docker stop ${CONTAINER_NAME} || true
    echo "✓ 旧容器已停止"
else
    echo "未找到运行中的容器"
fi
echo ""

echo "======================================"
echo "步骤 4/6: 删除旧容器..."
echo "======================================"
if docker ps -a | grep -q ${CONTAINER_NAME}; then
    echo "删除容器: ${CONTAINER_NAME}"
    docker rm ${CONTAINER_NAME} || true
    echo "✓ 旧容器已删除"
else
    echo "未找到需要删除的容器"
fi
echo ""

echo "======================================"
echo "步骤 5/6: 启动新容器..."
echo "======================================"
docker run -d \
    --name ${CONTAINER_NAME} \
    --restart unless-stopped \
    -p ${PORT_MAPPING} \
    ${IMAGE_NAME}:latest
echo "✓ 新容器已启动"
echo ""
echo "容器状态:"
docker ps | grep ${CONTAINER_NAME} || echo "容器未找到"
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
ENDSSH

echo ""
echo "======================================"
echo "✓ 本地部署脚本执行完成"
echo "======================================"
echo ""
echo "检查容器日志:"
echo "  ssh ${SERVER_USER}@${SERVER_HOST} 'docker logs -f ${CONTAINER_NAME}'"
echo ""
echo "检查容器状态:"
echo "  ssh ${SERVER_USER}@${SERVER_HOST} 'docker ps | grep ${CONTAINER_NAME}'"
echo ""
