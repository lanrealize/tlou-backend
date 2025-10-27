#!/bin/bash

# 查看后端日志脚本 - 分析delete-account API的500错误
# 使用方法: ./check-logs.sh

set -e

# ==================== 配置区域 ====================
SERVER_HOST="${SERVER_HOST:-212.64.18.231}"
SERVER_USER="root"
SERVER_PASSWORD="laN316208"
SERVER_PORT="22"
CONTAINER_NAME="tlou-backend"
# ==================================================

echo "======================================"
echo "连接到服务器查看后端日志"
echo "======================================"
echo "服务器: ${SERVER_HOST}"
echo "容器: ${CONTAINER_NAME}"
echo ""

# 检查是否安装了sshpass
if ! command -v sshpass &> /dev/null; then
    SSH_CMD="ssh -p ${SERVER_PORT} ${SERVER_USER}@${SERVER_HOST}"
    echo "注意: 未安装sshpass，需要手动输入密码"
else
    SSH_CMD="sshpass -p '${SERVER_PASSWORD}' ssh -o StrictHostKeyChecking=no -p ${SERVER_PORT} ${SERVER_USER}@${SERVER_HOST}"
fi

echo "======================================"
echo "1. 检查容器状态"
echo "======================================"
$SSH_CMD "docker ps | grep ${CONTAINER_NAME} || echo '容器未运行'"
echo ""

echo "======================================"
echo "2. 查看最近的容器日志（最后50行）"
echo "======================================"
$SSH_CMD "docker logs --tail 50 ${CONTAINER_NAME}"
echo ""

echo "======================================"
echo "3. 搜索delete-account相关的错误日志"
echo "======================================"
echo "查找delete-account API调用记录..."
$SSH_CMD "docker logs ${CONTAINER_NAME} 2>&1 | grep -i 'delete.*account\|delete.*user\|注销' | tail -20 || echo '未找到delete-account相关日志'"
echo ""

echo "======================================"
echo "4. 搜索500错误日志"
echo "======================================"
echo "查找500错误记录..."
$SSH_CMD "docker logs ${CONTAINER_NAME} 2>&1 | grep -i 'error\|500\|fail\|错误\|失败' | tail -20 || echo '未找到错误日志'"
echo ""

echo "======================================"
echo "5. 搜索openid相关的错误"
echo "======================================"
echo "查找openid验证相关的错误..."
$SSH_CMD "docker logs ${CONTAINER_NAME} 2>&1 | grep -i 'openid\|test_1761572750477' | tail -10 || echo '未找到openid相关日志'"
echo ""

echo "======================================"
echo "6. 检查数据库连接状态"
echo "======================================"
echo "查找数据库连接相关日志..."
$SSH_CMD "docker logs ${CONTAINER_NAME} 2>&1 | grep -i 'mongo\|database\|connection\|数据库' | tail -10 || echo '未找到数据库相关日志'"
echo ""

echo "======================================"
echo "7. 实时监控日志（按Ctrl+C退出）"
echo "======================================"
echo "开始实时监控日志，请在另一个终端重新调用delete-account API..."
echo "curl命令:"
echo "curl -X DELETE https://www.wltech-service.site/api/tlou/wechat/delete-account \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -H \"x-openid: test_1761572750477_f4hbwky94\""
echo ""
echo "按Enter开始监控日志，或Ctrl+C退出..."
read -p ""

echo "开始实时监控..."
$SSH_CMD "docker logs -f ${CONTAINER_NAME}"
