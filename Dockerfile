# ============================================================
# 阶段 1：构建前端
# ============================================================
FROM node:20-alpine AS frontend-build

WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ============================================================
# 阶段 2：安装后端依赖
# ============================================================
FROM node:20-alpine AS backend-build

WORKDIR /build/server
COPY server/package.json ./
RUN apk add --no-cache python3 make g++ sqlite-dev
RUN npm install --omit=dev

# ============================================================
# 阶段 3：生产运行镜像
# ============================================================
FROM node:20-alpine

# 安装 Nginx 和 Supervisor（用于同时运行 Nginx + Node）
RUN apk add --no-cache nginx supervisor

WORKDIR /app

# 复制前端构建产物
COPY --from=frontend-build /build/dist /app/dist

# 复制后端代码和依赖
COPY server/ /app/server/
COPY --from=backend-build /build/server/node_modules /app/server/node_modules

# 复制 Nginx 配置
COPY nginx.conf /etc/nginx/http.d/default.conf

# 创建数据目录（挂载点）
RUN mkdir -p /app/data

# Supervisor 配置：同时管理 Nginx + Node.js
RUN mkdir -p /etc/supervisor.d
RUN echo -e "[supervisord]\nnodaemon=true\nlogfile=/dev/null\nlogfile_maxbytes=0\n\n[program:nginx]\ncommand=nginx -g 'daemon off;'\nautorestart=true\nstdout_logfile=/dev/stdout\nstdout_logfile_maxbytes=0\nstderr_logfile=/dev/stderr\nstderr_logfile_maxbytes=0\n\n[program:api]\ncommand=node /app/server/index.js\ndirectory=/app/server\nautorestart=true\nenvironment=DB_PATH=/app/data/youhu.db,NODE_ENV=production\nstdout_logfile=/dev/stdout\nstdout_logfile_maxbytes=0\nstderr_logfile=/dev/stderr\nstderr_logfile_maxbytes=0" > /etc/supervisord.conf

EXPOSE 80

# Start only the runtime services so container restarts never reseed the mounted DB.
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
