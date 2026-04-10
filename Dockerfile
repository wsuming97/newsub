# ============================================================
# Stage 1: build frontend
# ============================================================
FROM node:20-alpine AS frontend-build

WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# ============================================================
# Stage 2: install backend dependencies
# ============================================================
FROM node:20-alpine AS backend-build

WORKDIR /build/server
COPY server/package.json ./
RUN npm install --omit=dev

# ============================================================
# Stage 3: runtime image
# ============================================================
FROM node:20-alpine

RUN apk add --no-cache nginx supervisor

WORKDIR /app
ENV CACHE_DIR=/app/data

# Frontend build output
COPY --from=frontend-build /build/dist /app/dist

# Backend code and dependencies
COPY server/ /app/server/
COPY --from=backend-build /build/server/node_modules /app/server/node_modules

# Nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Persistent cache directory
RUN mkdir -p /app/data

# Supervisor config: run Nginx + Node API together
RUN mkdir -p /etc/supervisor.d
RUN echo -e "[supervisord]\nnodaemon=true\nlogfile=/dev/null\nlogfile_maxbytes=0\n\n[program:nginx]\ncommand=nginx -g 'daemon off;'\nautorestart=true\nstdout_logfile=/dev/stdout\nstdout_logfile_maxbytes=0\nstderr_logfile=/dev/stderr\nstderr_logfile_maxbytes=0\n\n[program:api]\ncommand=node /app/server/index.js\ndirectory=/app/server\nautorestart=true\nenvironment=NODE_ENV=production,CACHE_DIR=/app/data\nstdout_logfile=/dev/stdout\nstdout_logfile_maxbytes=0\nstderr_logfile=/dev/stderr\nstderr_logfile_maxbytes=0" > /etc/supervisord.conf

EXPOSE 80

# Runtime only; cache persistence is handled by /app/data volume
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
