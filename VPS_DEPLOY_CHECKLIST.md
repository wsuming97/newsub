# Youhu VPS 发布清单

## 1. 发布前检查

- 已确认当前版本是“实时抓取 + JSON 持久化缓存”，不是 SQLite 灌库版本
- 已完成一次本地前端构建验证：`npm run build -- --configLoader native`
- 已确认后端语法通过：`node --check server/index.js`
- 已确认服务器开放目标端口，例如 `8080`，或已准备好宿主机反代后的 `80/443`
- 已准备正式域名对应的 `CORS_ORIGIN`
- 已确认项目根目录下的 `data/` 会作为持久化缓存目录挂载到容器 `/app/data`

## 2. 首次部署

1. 将项目代码上传到 VPS
2. 在项目根目录创建 `.env`：

```env
CORS_ORIGIN=https://你的域名,https://www.你的域名
WEB_PORT=8080
```

3. 启动服务：

```bash
docker compose up -d --build
```

4. 检查容器状态和日志：

```bash
docker compose ps
docker compose logs -f
```

## 3. 首次部署验收

先验接口，再验页面，不要只看首页能不能打开。

```bash
curl http://127.0.0.1:8080/api/health
curl http://127.0.0.1:8080/api/apps
```

如改过端口，把 `8080` 替换成你的 `WEB_PORT`。

通过标准：

- `/api/health` 返回 `success: true`
- `/api/apps` 返回数组
- 首页可正常加载
- 任意一个详情页可正常打开

## 4. 缓存持久化验收

访问几个详情页后，再检查宿主机和容器目录：

```bash
ls -lah /opt/youhu/data
docker exec youhu ls -lah /app/data
```

正确结果应该包括：

- `app_cache.json`
- `rates_cache.json`

然后再次重建容器验证缓存是否仍在：

```bash
docker compose up -d --build
ls -lah /opt/youhu/data
docker exec youhu ls -lah /app/data
```

通过标准：

- 宿主机 `data/` 下缓存文件仍存在
- 容器 `/app/data` 中也能看到同样的缓存文件

## 5. 页面人工抽查

- 首页能正常显示推荐应用
- 详情页首次打开会显示抓取中状态
- 缓存过期但仍在容忍期内时，会显示“静默刷新”提示，而不是白屏硬等
- 分享卡片和价格展示正常

建议至少抽查：

- 一个首次打开的冷门应用
- 一个已缓存的热门应用

## 6. 更新发布

```bash
git fetch --all
git reset --hard origin/main
docker compose up -d --build
```

更新后再次执行：

```bash
docker compose ps
curl http://127.0.0.1:8080/api/health
ls -lah /opt/youhu/data
```

确认：

- 容器状态正常
- `/api/health` 通过
- 缓存文件仍在

## 7. 域名与反代

推荐由宿主机 Nginx 或 Caddy 统一处理域名和 HTTPS：

```text
https://你的域名
  -> 宿主机 Nginx / Caddy
    -> 127.0.0.1:8080
      -> youhu 容器
```

同时确保 `.env` 中的 `CORS_ORIGIN` 与正式域名一致。

## 8. 回滚策略

当前架构没有价格数据库，回滚重点是：

- 回滚代码版本
- 保留 `data/` 目录中的 JSON 缓存文件

最小回滚步骤：

```bash
git reset --hard <上一个稳定提交>
docker compose up -d --build
```

如需先备份缓存目录：

```bash
cp -r data data.bak.$(date +%F-%H%M%S)
```

## 9. 常见故障排查

- 首页能打开但接口失败：先看 `/api/health`
- 详情页首次特别慢：先确认是否为缓存未命中的首次抓取
- 重建后缓存丢失：检查 `docker-compose.yml` 是否仍包含 `./data:/app/data`
- 容器里有缓存、宿主机没有：说明卷挂载未生效
- 域名可访问但 API 被拦：检查 `.env` 里的 `CORS_ORIGIN`
