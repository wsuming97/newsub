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
  echo "📂 检测到已有安装，强制同步最新代码..."
  cd "$INSTALL_DIR"
  git fetch --all
  git reset --hard origin/main
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
  CORS_ORIGIN="*"
  WEB_PORT="8080"
  
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
# 5. 最终验证
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
  echo "   后续更新代码: cd ${INSTALL_DIR} && git pull && $COMPOSE up -d --build"
  echo ""
else
  echo "⚠️  健康检查未通过，请检查日志："
  echo "   docker logs ${APP_NAME}"
fi
