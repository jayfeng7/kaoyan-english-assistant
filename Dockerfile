# syntax=docker/dockerfile:1
# 考研英语 AI 助手 · 生产镜像（Next.js standalone）
# 构建：docker build -t kaoyan-english:latest .
# 运行：见 docker-compose.yml（密钥通过 env_file 注入，不打进镜像）

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
ENV NEXT_TELEMETRY_DISABLED=1
ENV BUILD_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=Asia/Shanghai
LABEL org.opencontainers.image.title="kaoyan-english-assistant" \
      org.opencontainers.image.description="AI-assisted study workspace for the Chinese postgraduate entrance English exam" \
      org.opencontainers.image.licenses="MIT"
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Next standalone does not include public assets automatically.
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Optional read-only question banks are copied when present; clean releases keep empty placeholders.
COPY --from=builder --chown=nextjs:nodejs /app/data/exams ./data/exams
COPY --from=builder --chown=nextjs:nodejs /app/data/essay-bank ./data/essay-bank
# @napi-rs/canvas 的平台二进制由 pdf-parse 运行时动态 require，文件追踪无法覆盖；
# 补一个顶层链接，使 canvas 的 js-binding 在 standalone 布局内可解析（真实文件由追踪包含提供）。
RUN ln -s "$(ls -d /app/node_modules/.pnpm/@napi-rs+canvas-linux-x64-musl@*/node_modules/@napi-rs/canvas-linux-x64-musl 2>/dev/null | head -n 1)" /app/node_modules/@napi-rs/canvas-linux-x64-musl
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
