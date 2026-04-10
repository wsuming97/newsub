#!/bin/sh
# ============================================================
# Youhu 数据自动维护脚本
# 功能：备份数据库 → 爬取最新价格 → 灌库 → 清理过期备份
#
# 用法（容器外执行）：
#   chmod +x scripts/maintain.sh
#   ./scripts/maintain.sh              # 默认保留 7 天备份
#   ./scripts/maintain.sh 14           # 保留 14 天备份
#   CONTAINER=youhu ./scripts/maintain.sh
#
# Cron 示例（每周一凌晨 3 点执行）：
#   0 3 * * 1 cd /path/to/youhu && ./scripts/maintain.sh >> ./data/maintain.log 2>&1
# ============================================================

set -e

# === 配置 ===
CONTAINER="${CONTAINER:-youhu}"           # Docker 容器名
DATA_DIR="./data"                         # 宿主机数据目录
BACKUP_DIR="./data/backups"               # 备份存放目录
KEEP_DAYS="${1:-7}"                        # 备份保留天数（默认 7 天）
DB_FILE="youhu.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo ""
echo "========================================"
echo "  Youhu 数据维护  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# === Step 1: 备份当前数据库 ===
echo "📦 [1/4] 备份数据库..."
mkdir -p "$BACKUP_DIR"

if [ -f "$DATA_DIR/$DB_FILE" ]; then
  cp "$DATA_DIR/$DB_FILE" "$BACKUP_DIR/${DB_FILE}.${TIMESTAMP}"
  BACKUP_SIZE=$(du -h "$BACKUP_DIR/${DB_FILE}.${TIMESTAMP}" | cut -f1)
  echo "   ✅ 已备份 → backups/${DB_FILE}.${TIMESTAMP} (${BACKUP_SIZE})"
else
  echo "   ⚠️  数据库文件不存在，跳过备份（首次运行？）"
fi

# === Step 2: 爬取最新价格 ===
echo ""
echo "🌍 [2/4] 爬取 34 国最新价格（预计 5-10 分钟）..."
docker exec "$CONTAINER" sh -c "cd /app/server && node generate_apps.js"
echo "   ✅ 价格爬取完成"

# === Step 3: 灌库 ===
echo ""
echo "💾 [3/4] 同步数据到 SQLite..."
docker exec "$CONTAINER" sh -c "cd /app/server && node seed.js --force"
echo "   ✅ 数据库更新完成"

# === Step 4: 清理过期备份 ===
echo ""
echo "🧹 [4/4] 清理 ${KEEP_DAYS} 天前的备份..."
DELETED=0
if [ -d "$BACKUP_DIR" ]; then
  for f in "$BACKUP_DIR"/${DB_FILE}.*; do
    [ -f "$f" ] || continue
    # 计算文件年龄（天）
    FILE_AGE=$(( ($(date +%s) - $(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null)) / 86400 ))
    if [ "$FILE_AGE" -gt "$KEEP_DAYS" ]; then
      rm "$f"
      DELETED=$((DELETED + 1))
    fi
  done
fi
echo "   ✅ 已删除 ${DELETED} 个过期备份"

# === 完成 ===
echo ""
echo "========================================"
echo "  ✅ 维护完成  $(date '+%Y-%m-%d %H:%M:%S')"

# 统计当前备份
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/${DB_FILE}.* 2>/dev/null | wc -l)
BACKUP_TOTAL=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo "  📊 当前备份：${BACKUP_COUNT} 个，共 ${BACKUP_TOTAL:-0}"
echo "  📊 保留策略：${KEEP_DAYS} 天"
echo "========================================"
echo ""
