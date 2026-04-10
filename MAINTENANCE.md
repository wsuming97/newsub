# Youhu 数据自动化维护指南

本文档介绍了如何在 VPS 上配置和使用 Youhu 的数据自动化维护方案。该方案包括：
1. 本地 SQLite 数据库的定期备份（带滚动清理）。
2. 从苹果服务器抓取 34 个国家/地区的最新 App 价格。
3. 将最新价格同步到线上的 SQLite 数据库。

## 一、一键执行维护

我们编写了一个专门的 Bash 脚本（`scripts/maintain.sh`）来依次执行上述步骤，它必须**在 VPS 的项目根目录下（即包含 `docker-compose.yml` 的目录）**运行。

首先，请确保脚本具有执行权限：
```bash
chmod +x scripts/maintain.sh
```

### 运行选项

1. **默认运行**（备份文件保留 7 天）：
   ```bash
   ./scripts/maintain.sh
   ```
2. **自定义保留天数**（例如：备份文件保留 14 天）：
   ```bash
   ./scripts/maintain.sh 14
   ```

运行期间，脚本会在屏幕上打印进度（如：备份数据库、爬取数据、同步数据、清理超龄备份等）。

---

## 二、设置 Cron 定时自动化

为了让服务器每周自动更新数据，建议将其加入系统的 Cron 定时任务中。下面以**每周一凌晨 3 点**执行为例：

### 1. 查找你的项目绝对路径
首先要知道你把 Youhu 项目放在了哪里，通常可能是 `/root/youhu` 或 `/home/ubuntu/youhu`。
可用 `pwd` 命令确认。

### 2. 编辑 Cron 配置
执行以下命令打开定时任务编辑器：
```bash
crontab -e
```
*(如果首次运行提示选择编辑器，推荐选择 `nano` 或 `vim`)*

### 3. 添加定时任务
在文件最末尾添加以下这行（**注意将 `/path/to/youhu` 替换为你的真实路径**）：

```bash
0 3 * * 1 cd /path/to/youhu && ./scripts/maintain.sh >> ./data/maintain.log 2>&1
```

**参数说明**：
- `0 3 * * 1`：表示在每周的星期一 03:00 准时触发。
- `cd /path/to/youhu`：确保脚本在项目根目录下执行（非常重要，否则 Docker 找不到容器或数据卷映射错误）。
- `./scripts/maintain.sh`：执行维护流程，默认保留 7 天备份。
- `>> ./data/maintain.log 2>&1`：将每次维护的运行细节和错误日志输出到 `data/maintain.log` 文件中，方便你之后排查问题。

---

## 附：维护日志与数据位置

- **SQLite 数据持久化文件**：`data/youhu.db` (这是项目的生命线)
- **历史备份文件**：`data/backups/youhu.db.YYYYMMDD_HHMMSS`
- **自动化执行日志**：`data/maintain.log`
