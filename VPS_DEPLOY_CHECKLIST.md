# Youhu VPS 发布清单

## 1. 发布前检查

- 本地已准备好要挂载到服务器的 `data/youhu.db`
- 已确认镜像启动时不会自动执行 `seed.js`
- 已完成一次前端构建验证：`npm run build -- --configLoader native`
- 已确认后端语法通过：`node --check server/index.js`、`node --check server/db.js`
- 已确认服务器开放目标端口，例如 `8080` 或反向代理后的 `80/443`
- 如需改端口，已提前设置 `WEB_PORT`
- 已准备 `ADMIN_TOKEN`
- 已准备 `CORS_ORIGIN`，例如 `https://youhu.example.com`

## 2. 首次部署

1. 将仓库代码上传到 VPS
2. 如果你已有数据库，把它放到服务器项目目录下的 `data/youhu.db`
3. 如果服务器上是空 `data/`，先初始化一次：

```bash
docker compose run --rm youhu sh -lc "cd /app/server && DB_PATH=/app/data/youhu.db node seed.js"
```

4. 设置生产环境变量后启动服务：

```bash
export ADMIN_TOKEN='请替换成强随机字符串'
export CORS_ORIGIN='https://你的域名'
docker compose up -d --build
```

5. 检查容器状态和日志：

```bash
docker compose ps
docker compose logs -f
```

## 3. 首次部署验收

先验接口，再验页面，不要只看首页能不能打开。

```bash
curl http://127.0.0.1:8080/api/health
curl http://127.0.0.1:8080/api/apps
npm run smoke:deploy -- http://127.0.0.1:8080
```

如果改过端口，把 `8080` 替换成你的 `WEB_PORT`。

通过标准：

- `/api/health` 返回 `success: true`
- `/api/health.counts` 中 `apps/plans/prices` 都是合理数字
- `/api/apps` 返回数组
- `scripts/smoke-check.mjs` 三项全部 `PASS`

## 4. 页面人工抽查

- 首页可正常加载应用列表
- 详情页可正常打开
- 带估算价的应用显示“估算参考价”，不再显示“最低价格”
- 同名套餐不会再展示 `(1)(2)(3)` 后缀
- “重新加载”按钮文案正确

建议至少抽查：

- 一个真实订阅价应用
- 一个估算参考价应用

## 5. 更新发布

```bash
docker compose up -d --build
```

更新后再次执行：

```bash
docker compose ps
npm run smoke:deploy -- http://127.0.0.1:8080
```

并确认：

- 容器重启后旧数据仍在
- `apps/plans/prices` 数量没有异常归零

## 6. 数据更新

如果要更新数据库内容，不要通过重启容器来触发；应显式执行数据更新流程。

```bash
cd server
node generate_apps.js
node seed.js --force
```

如果只是首次初始化空库，优先走 Docker 内的一次性初始化：

```bash
docker compose run --rm youhu sh -lc "cd /app/server && DB_PATH=/app/data/youhu.db node seed.js"
```

## 7. 回滚策略

- 发布前先备份 `data/youhu.db`
- 新镜像异常时，回滚到上一版代码并保留当前数据库卷
- 如果数据库本身损坏，使用备份库覆盖恢复

最小备份命令示例：

```bash
cp data/youhu.db data/youhu.db.bak.$(date +%F-%H%M%S)
```

## 8. 常见故障排查

- 首页能开但接口失败：优先看 `/api/health`
- 重启后数据变少：先确认是否错误执行了 `seed.js`
- 详情页仍不显示估算标记：检查 `/api/apps/:id` 返回是否带 `is_estimated`
- 容器起不来：检查 `docker compose logs -f`
