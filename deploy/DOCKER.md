# Docker 部署到云服务器

面向：把本站放到一台 7×24 在线的 VPS 上，用域名 + HTTPS 长期对外。
适用：电脑不能常开、或要给十几人用。1–5 人自用仍建议「家里电脑 + Cloudflare 命名隧道」，更省事。

> 国内服务器 + 域名走 80/443 **必须先完成 ICP 备案**；香港/海外服务器免备案，但国内访问延迟略高。

## 0. 服务器要求

| 项 | 建议 |
|---|---|
| 配置 | 2 核 2G 起（Next 构建吃内存，2G 建议加 2G swap） |
| 系统 | Ubuntu 22.04 / 24.04 LTS |
| 磁盘 | 20G 起（镜像约 300–400MB） |
| 网络 | 安全组放行 22、80、443；**不要**放行 3000/3102 |

## 1. 装 Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 重新登录生效
docker compose version
```

国内服务器拉取镜像慢时，在 `/etc/docker/daemon.json` 配镜像加速：

```json
{
  "registry-mirrors": ["https://docker.m.daocloud.io", "https://dockerproxy.com"]
}
```

改完 `sudo systemctl restart docker`。

## 2. 放代码

```bash
git clone <你的仓库地址> kaoyan-english && cd kaoyan-english
# 或者本机 scp -r 上传整个项目目录（不含 node_modules/.next/.env.local）
```

## 3. 配密钥

```bash
cp .env.example .env.local
vim .env.local        # 填 DEEPSEEK_API_KEY，按需填百度 OCR
chmod 600 .env.local
```

密钥只在容器运行时通过 `env_file` 注入，不会写进镜像；`.dockerignore` 已排除 `.env*`。

## 4. 改域名

编辑 `deploy/Caddyfile`，把 `ky.example.com` 换成你的域名，并把域名 A 记录指向服务器公网 IP。

## 5. 启动

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

首次构建约 3–6 分钟。Caddy 会自动申请 Let's Encrypt 证书（需要 80 端口可达）。

验证：

```bash
curl https://ky.example.com/api/health
# {"success":true,"data":{"status":"ok","providers":["deepseek"],"ocr":true,"examBankCount":156,...}}
```

## 6. 日常运维

```bash
docker compose logs -f app          # 看日志（已限 10MB × 3 轮转）
docker compose restart app          # 重启应用
git pull && docker compose up -d --build   # 更新代码并重建
docker stats                        # 看 CPU/内存
```

回滚：`git checkout <上一个提交>` 后重新 `up -d --build`；镜像名固定为 `kaoyan-english:latest`，也可以给每次发布打 tag。

备份：本站无服务端用户数据（历史在各用户浏览器），**不需要备份数据库**；需要备份的只有 `.env.local` 和代码。

## 7. 安全清单

- 防火墙/安全组只开 22、80、443，应用端口 3000 只在容器网络内。
- SSH 用密钥登录，禁用密码（`PasswordAuthentication no`）。
- `.env.local` 权限 600；不要提交到 Git。
- 容器以非 root 用户 `nextjs` 运行，`no-new-privileges` 已开启。
- 接口自带限流（LLM 10 次/分钟、OCR 30 次/分钟），公网暴露时能挡住刷额度。
- 无登录是既定设计：域名不要公开传播；需要收回访问就停容器或换域名。

## 8. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 构建时 `Killed` / OOM | 2G 内存不够。加 swap：`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`；或本地构建后推镜像 |
| 证书申请失败 | 80 端口没放行、域名未解析到本机、或国内未备案。`docker compose logs caddy` 看详情 |
| 502 | app 容器没起来或健康检查失败：`docker compose logs app` |
| 追问不是逐字出现 | 反代缓冲。Caddyfile 已设 `flush_interval -1`；若换成 Nginx，需 `proxy_buffering off` |
| 审核/备案页面被拦 | 国内服务器未备案，先完成备案 |
| 时间不对 | compose 已设 `TZ=Asia/Shanghai`；宿主也建议 `timedatectl set-timezone Asia/Shanghai` |

## 9. 不用 Docker 的等价做法

```bash
# Node 22 + pnpm
pnpm install --frozen-lockfile
pnpm build
PORT=3000 HOSTNAME=127.0.0.1 node .next/standalone/server.js
# 再用 systemd 守护 + Caddy/Nginx 反代
```

Docker 的价值主要是：环境一致、升级只重建镜像、不用在宿主装 Node/pnpm。
