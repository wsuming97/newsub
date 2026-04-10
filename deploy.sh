#!/usr/bin/env bash
# ============================================================
# Youhu 一键部署脚本（当前架构版）
# 适配：实时抓取 + JSON 持久化缓存 + Docker Compose
# 用法：
#   bash deploy.sh
# 或：
#   curl -fsSL <raw_url> | bash
# ============================================================

set -Eeuo pipefail

APP_NAME="youhu"
REPO_URL="${REPO_URL:-https://github.com/wsuming97/newsub.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/youhu}"
DEFAULT_WEB_PORT="${WEB_PORT:-8080}"

info() { echo "[INFO] $*"; }
success() { echo "[OK]   $*"; }
warn() { echo "[WARN] $*"; }
error() { echo "[ERR]  $*" >&2; }

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    return 1
  fi
}

ensure_docker() {
  if require_cmd docker; then
    success "Docker 已安装: $(docker --version)"
    return 0
  fi

  warn "Docker 未安装，开始自动安装..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  success "Docker 安装完成"
}

ensure_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
    success "Docker Compose 已就绪"
    return 0
  fi

  if require_cmd docker-compose; then
    COMPOSE_CMD="docker-compose"
    success "docker-compose 已就绪"
    return 0
  fi

  warn "未检测到 Compose，尝试安装 compose 插件..."
  apt-get update -qq
  apt-get install -y -qq docker-compose-plugin

  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
    success "Docker Compose 安装完成"
    return 0
  fi

  error "Compose 安装失败，请手动检查 Docker 环境"
  exit 1
}

sync_repo() {
  mkdir -p "$(dirname "$INSTALL_DIR")"

  if [ -d "$INSTALL_DIR/.git" ]; then
    info "检测到已有仓库，开始同步最新代码..."
    cd "$INSTALL_DIR"
    git fetch --all
    git reset --hard origin/main
  else
    info "克隆仓库到 $INSTALL_DIR ..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi

  success "代码同步完成"
}

ensure_data_dir() {
  mkdir -p "$INSTALL_DIR/data"
  success "已确保持久化目录存在: $INSTALL_DIR/data"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

load_existing_env() {
  local env_file="$1"
  EXISTING_WEB_PORT=""
  EXISTING_CORS_ORIGIN=""

  if [ -f "$env_file" ]; then
    EXISTING_WEB_PORT="$(grep '^WEB_PORT=' "$env_file" | head -n1 | cut -d= -f2- || true)"
    EXISTING_CORS_ORIGIN="$(grep '^CORS_ORIGIN=' "$env_file" | head -n1 | cut -d= -f2- || true)"
  fi
}

prompt_env_values() {
  local env_file="$1"
  load_existing_env "$env_file"

  local current_web_port="${EXISTING_WEB_PORT:-$DEFAULT_WEB_PORT}"
  local current_cors_origin="${EXISTING_CORS_ORIGIN:-}"

  echo
  info "准备写入部署环境变量"

  if [ -t 0 ]; then
    read -r -p "请输入正式域名来源 CORS_ORIGIN（如 https://example.com,https://www.example.com）${current_cors_origin:+ [$current_cors_origin]}: " input_cors
    read -r -p "请输入外部访问端口 WEB_PORT${current_web_port:+ [$current_web_port]}: " input_port

    CORS_ORIGIN_VALUE="${input_cors:-$current_cors_origin}"
    WEB_PORT_VALUE="${input_port:-$current_web_port}"
  else
    CORS_ORIGIN_VALUE="${CORS_ORIGIN:-$current_cors_origin}"
    WEB_PORT_VALUE="${WEB_PORT:-$current_web_port}"
  fi

  if [ -z "${WEB_PORT_VALUE:-}" ]; then
    WEB_PORT_VALUE="$DEFAULT_WEB_PORT"
  fi

  if [ -z "${CORS_ORIGIN_VALUE:-}" ]; then
    error "CORS_ORIGIN 不能为空。请重新运行脚本并输入正式域名，或先导出环境变量："
    error "export CORS_ORIGIN='https://你的域名,https://www.你的域名'"
    exit 1
  fi

  cp "$env_file" "${env_file}.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
  : > "$env_file"
  set_env_value "$env_file" "CORS_ORIGIN" "$CORS_ORIGIN_VALUE"
  set_env_value "$env_file" "WEB_PORT" "$WEB_PORT_VALUE"

  export WEB_PORT="$WEB_PORT_VALUE"
  export CORS_ORIGIN="$CORS_ORIGIN_VALUE"

  success ".env 已更新"
  echo "      CORS_ORIGIN=$CORS_ORIGIN_VALUE"
  echo "      WEB_PORT=$WEB_PORT_VALUE"
}

build_and_up() {
  info "开始构建并启动容器..."
  $COMPOSE_CMD up -d --build
  success "容器启动命令执行完成"
}

wait_for_health() {
  local port="$1"
  local max_wait="${2:-60}"

  info "等待健康检查就绪..."
  for _ in $(seq 1 "$max_wait"); do
    if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
      success "健康检查通过"
      return 0
    fi
    sleep 1
  done

  error "健康检查超时，请执行以下命令排查："
  error "cd $INSTALL_DIR && $COMPOSE_CMD logs -f"
  exit 1
}

verify_cache_mount() {
  local cache_file="$INSTALL_DIR/data/app_cache.json"
  echo
  info "持久化缓存目录检查："
  if [ -d "$INSTALL_DIR/data" ]; then
    success "宿主机 data 目录存在: $INSTALL_DIR/data"
  else
    warn "宿主机 data 目录不存在，请手动检查挂载"
  fi

  if [ -f "$cache_file" ]; then
    success "已检测到缓存文件: $cache_file"
  else
    warn "当前尚未检测到 app_cache.json。首次访问几个详情页后应自动生成。"
    warn "验证命令："
    warn "  ls -lah $INSTALL_DIR/data"
    warn "  docker exec $APP_NAME ls -lah /app/data"
  fi
}

print_summary() {
  local port="$1"
  local host_ip
  host_ip="$(hostname -I 2>/dev/null | awk '{print $1}')"

  echo
  echo "=================================================="
  echo "Youhu 部署完成"
  echo "=================================================="
  echo "项目目录: $INSTALL_DIR"
  echo "访问地址: http://${host_ip:-127.0.0.1}:${port}"
  echo "健康检查: http://127.0.0.1:${port}/api/health"
  echo
  echo "后续更新命令："
  echo "  cd $INSTALL_DIR"
  echo "  git fetch --all && git reset --hard origin/main"
  echo "  $COMPOSE_CMD up -d --build"
  echo
  echo "缓存持久化自检："
  echo "  ls -lah $INSTALL_DIR/data"
  echo "  docker exec $APP_NAME ls -lah /app/data"
  echo "  curl http://127.0.0.1:${port}/api/app/6448311069 >/dev/null"
  echo "  sleep 3 && ls -lah $INSTALL_DIR/data"
  echo
}

main() {
  echo
  echo "=================================================="
  echo "Youhu 一键部署脚本（当前架构版）"
  echo "=================================================="
  echo

  ensure_docker
  ensure_compose
  sync_repo
  ensure_data_dir

  local env_file="$INSTALL_DIR/.env"
  touch "$env_file"
  prompt_env_values "$env_file"

  build_and_up
  wait_for_health "${WEB_PORT}"
  verify_cache_mount
  print_summary "${WEB_PORT}"
}

main "$@"
