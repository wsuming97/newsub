#!/bin/bash
# ============================================================
# Youhu 一键部署脚本
# 用法: curl -sL <raw_url> | bash
# 或者: bash deploy.sh
# ============================================================
set -e

APP_NAME="youhu"
REPO_URL="https://github.com/wsuming97/newsub.git"
INSTALL_DIR="/opt/youhu"
LOG_FILE="/var/log/youhu-update.log"

echo ""
echo "🚀 Youhu 全球订阅比价引擎 — 一键部署"
echo "========================================="
echo ""

# ——————————————————————————————————————————————
# 1. 检查 Docker
# ——————————————————————————————————————————————
if ! command -v docker &>/dev/null; then
  echo "📦 Docker 未安装，正在安装..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker 安装完成"
else
  echo "✅ Docker 已就绪 ($(docker --version | cut -d' ' -f3))"
fi

# 检查 docker compose
if docker compose version &>/dev/null; then
  COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
  COMPOSE="docker-compose"
else
  echo "📦 安装 Docker Compose 插件..."
  apt-get update -qq && apt-get install -y -qq docker-compose-plugin 2>/dev/null || true
  COMPOSE="docker compose"
fi
echo "✅ Compose 已就绪"

# ——————————————————————————————————————————————
# 2. 拉取代码
# ——————————————————————————————————————————————
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "📂 检测到已有安装，拉取最新代码..."
  cd "$INSTALL_DIR"
  git pull origin main
else
  echo "📥 克隆仓库到 $INSTALL_DIR ..."
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# ——————————————————————————————————————————————
# 3. 环境变量配置
# ——————————————————————————————————————————————
if [ ! -f .env ]; then
  echo ""
  echo "⚙️  首次部署，配置环境变量..."
  
  # 自动生成随机 token
  ADMIN_TOKEN=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
  
  read -p "   管理员 Token [自动生成: ${ADMIN_TOKEN:0:8}...]: " input_token
  ADMIN_TOKEN="${input_token:-$ADMIN_TOKEN}"
  
  read -p "   前端域名 (如 https://sub.example.com，留空则允许所有): " input_origin
  CORS_ORIGIN="${input_origin:-*}"
  
  read -p "   Web 端口 [8080]: " input_port
  WEB_PORT="${input_port:-8080}"
  
  cat > .env << EOF
ADMIN_TOKEN=${ADMIN_TOKEN}
CORS_ORIGIN=${CORS_ORIGIN}
WEB_PORT=${WEB_PORT}
EOF
  
  echo "✅ 环境变量已写入 .env"
  echo "   ⚠️  请妥善保管 ADMIN_TOKEN: ${ADMIN_TOKEN}"
else
  echo "✅ .env 已存在，跳过配置"
  source .env
  WEB_PORT="${WEB_PORT:-8080}"
fi

# ——————————————————————————————————————————————
# 4. 构建并启动容器
# ——————————————————————————————————————————————
echo ""
echo "🔨 构建 Docker 镜像并启动..."
$COMPOSE down 2>/dev/null || true
$COMPOSE up -d --build

# 等待容器就绪
echo "⏳ 等待服务启动..."
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:${WEB_PORT}/api/health" > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# ——————————————————————————————————————————————
# 5. 首次灌库（仅数据库为空时）
# ——————————————————————————————————————————————
APP_COUNT=$(curl -sf "http://127.0.0.1:${WEB_PORT}/api/health" 2>/dev/null | grep -o '"apps":[0-9]*' | grep -o '[0-9]*' || echo "0")

if [ "$APP_COUNT" = "0" ] || [ -z "$APP_COUNT" ]; then
  echo "📦 数据库为空，执行首次数据导入..."
  docker exec "$APP_NAME" node /app/server/seed.js --force
  echo "✅ 数据导入完成"
else
  echo "✅ 数据库已有 ${APP_COUNT} 款应用，跳过灌库"
fi

# ——————————————————————————————————————————————
# 6. 配置定时更新（cron）
# ——————————————————————————————————————————————
CRON_CMD="0 3 */2 * * docker exec $APP_NAME node /app/server/updater.js >> $LOG_FILE 2>&1"
if crontab -l 2>/dev/null | grep -q "updater.js"; then
  echo "✅ 定时更新任务已存在"
else
  (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
  echo "✅ 已配置定时更新（每 48 小时凌晨 3 点）"
fi

# ——————————————————————————————————————————————
# 7. 最终验证
# ——————————————————————————————————————————————
echo ""
echo "🏥 健康检查..."
HEALTH=$(curl -sf "http://127.0.0.1:${WEB_PORT}/api/health" 2>/dev/null || echo "FAIL")

if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo ""
  echo "========================================="
  echo "🎉 部署完成！"
  echo "========================================="
  echo ""
  echo "   📍 站点地址:  http://$(hostname -I | awk '{print $1}'):${WEB_PORT}"
  echo "   📍 健康检查:  http://127.0.0.1:${WEB_PORT}/api/health"
  echo "   🔑 管理Token: 见 ${INSTALL_DIR}/.env"
  echo "   📋 定时更新:  每 48h 自动巡查"
  echo "   📝 更新日志:  ${LOG_FILE}"
  echo ""
  echo "   后续更新代码: cd ${INSTALL_DIR} && git pull && $COMPOSE up -d --build"
  echo "   手动刷价格:   docker exec ${APP_NAME} node /app/server/updater.js"
  echo ""
else
  echo "⚠️  健康检查未通过，请检查日志："
  echo "   docker logs ${APP_NAME}"
fi
