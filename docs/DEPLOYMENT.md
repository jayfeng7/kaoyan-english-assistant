# 部署指南

## 1. 选择部署方式

| 方式 | 适合 | 特点 |
|---|---|---|
| 本机生产模式 | 个人自用、临时试用 | 最简单；电脑关机即离线 |
| Docker + Caddy | VPS、长期在线 | 自动 HTTPS、环境一致；需要域名 |
| Cloudflare Tunnel | 家庭电脑/内网机器 | 不开放入站端口；可配固定域名 |
| 反向代理 + Node | 已有 Nginx/Caddy 的环境 | 灵活；需自行处理 SSE 与 TLS |

无论哪种方式，应用都是**无登录**的。公网暴露前请先看第 7 节。

## 2. 通用准备

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

`.env.local` 至少填写：

```dotenv
DEEPSEEK_API_KEY=你的服务端密钥
```

图片/扫描 PDF 还需要：

```dotenv
BAIDU_OCR_API_KEY=...
BAIDU_OCR_SECRET_KEY=...
```

可选题库按 [`DATA.md`](DATA.md) 放置。没有题库也能启动和使用自由输入功能。

## 3. 本机生产模式

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

默认监听 `0.0.0.0:3000`。如果只在本机使用，建议绑定回环地址：

```bash
pnpm exec next start --hostname 127.0.0.1 --port 3000
```

验证：

```bash
curl http://127.0.0.1:3000/api/health
node scripts/verify-deploy.mjs http://127.0.0.1:3000 --readonly --allow-empty-bank --allow-no-ocr
```

Windows 用户也可以使用项目中的 `scripts/start.bat` / `scripts/deploy.ps1`。这些脚本包含维护者本地 Cloudflare 工具路径和快速隧道逻辑，正式部署建议优先使用下面的 Docker 或标准 Tunnel 方式。

## 4. Docker + Caddy

### 4.1 准备

1. 将 `deploy/Caddyfile` 中的 `ky.example.com` 改成你的域名；
2. 域名 A/AAAA 记录指向服务器；
3. 服务器安全组只开放 `22`、`80`、`443`，不要暴露 `3000`；
4. `.env.local` 权限设为仅当前用户可读；
5. 国内服务器使用 80/443 通常需要完成 ICP 备案。

### 4.2 启动

```bash
cp .env.example .env.local
chmod 600 .env.local
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

Caddy 会自动申请 Let's Encrypt 证书。首次构建需要下载依赖，耗时取决于网络。

验证：

```bash
curl https://你的域名/api/health
node scripts/verify-deploy.mjs https://你的域名 --readonly --allow-empty-bank --allow-no-ocr
```

### 4.3 运维

```bash
docker compose logs -f app
docker compose restart app
git pull && docker compose up -d --build
docker stats
```

回滚：切换回上一个已验证的代码提交，再重新构建。生产环境建议给镜像打版本标签，不要只用 `latest`。

### 4.4 数据备份

应用不保存服务端用户历史，因此不需要数据库备份。需要备份：

- 代码版本；
- `.env.local`（安全保管）；
- 你自行导入的题库；
- 用户自己导出的历史 JSON。

## 5. Cloudflare Tunnel

### 5.1 快速隧道（临时地址）

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

适合临时演示。进程重启后地址会变化。

### 5.2 命名隧道（固定域名）

1. 在 Cloudflare Zero Trust 创建 Tunnel；
2. 安装连接器；
3. 添加 Public Hostname，指向 `http://127.0.0.1:3000`；
4. 在域名 DNS 中确认 CNAME 已由 Cloudflare 管理。

应用本身只监听回环地址，不需要开放入站端口。

### 5.3 注意

- 快速隧道不要把地址当长期服务地址传播。
- 不要提交 `.cloudflared/`、Token 文件或证书。
- 大文件上传速度受本机上行带宽和隧道影响。
- 公网实例仍建议加 Cloudflare Access。

## 6. 反向代理要求

如果使用 Nginx/Caddy：

### SSE

必须关闭响应缓冲，否则追问不是逐字显示。

Caddy：

```caddyfile
reverse_proxy app:3000 {
  flush_interval -1
}
```

Nginx：

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 360s;
```

### 客户端 IP

应用按以下顺序读取客户端 IP 做内存限流：

1. `X-Real-IP`
2. `CF-Connecting-IP`
3. `X-Forwarded-For` 的第一个值

代理必须**覆盖**客户端传入的头，而不是原样追加，否则可以伪造 IP 绕过限流。项目自带 Caddyfile 已覆盖 `X-Real-IP` 和 `X-Forwarded-For`。

### 安全头

应用已在 Next.js 层设置基础安全头；Caddyfile 额外设置 HSTS。若在 CDN 或网关层重复设置，保持值一致即可。

## 7. 访问控制（强烈建议）

项目无账号系统。公开地址一旦泄露，任何访问者都能调用模型并消耗额度。

推荐至少选一种：

- **Cloudflare Access**：给域名加邮箱/身份提供商策略；
- **反向代理 Basic Auth**：适合小范围；
- **VPN / 内网 / Tailscale**：不直接暴露公网；
- **供应商侧限额**：设置 DeepSeek 账户预算与告警。

注意：Basic Auth 和 Access 只保护入口，不改变应用内部无登录的事实。

## 8. 环境变量与密钥

- 密钥只放服务端 `.env.local` 或容器 secret，不写入镜像、仓库、Issue 或前端代码。
- 轮换密钥后需要重启应用进程；某些平台需要重建容器。
- 不要将 `.env.local` 复制进构建产物或公开候选目录。
- 日志中不应出现正文、图片、Token 或密钥。

## 9. 上线检查

- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 通过
- [ ] `/api/health` 返回 `success: true`
- [ ] 首页、作文、长难句、真题、聊天、历史、设置可打开
- [ ] SSE 逐字输出，不是一次性返回
- [ ] 图片/PDF 限制生效
- [ ] 无题库部署时页面有“暂无题目”提示
- [ ] 未配置 OCR 时提示可手动输入，不白屏
- [ ] 反向代理覆盖客户端 IP 头
- [ ] 公网入口有访问控制
- [ ] 已导出并安全保存一份 `.env.local`
- [ ] 已实际验证回滚方式

## 10. 排障

| 现象 | 排查 |
|---|---|
| 502 | 应用未启动、端口不对、健康检查失败 |
| 证书失败 | 80/443 未放行、DNS 未生效、备案问题 |
| 追问一次性出现 | 代理缓冲未关闭 |
| 上传慢 | 本机上行带宽、隧道、PDF 大小；扫描模式已改为只上传页面图片 |
| 健康接口 500 | 题库 JSON 损坏或权限错误；先检查 `data/` 结构 |
| 所有 AI 接口失败 | 供应商 Key、余额、模型名、基础 URL |
| OCR 失败 | 百度 Key/Secret、配额、图片格式与大小 |
| 限流异常 | 代理头未覆盖，所有请求被识别为同一 IP 或可伪造 |
