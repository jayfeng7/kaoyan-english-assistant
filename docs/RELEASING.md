# 开源发行指南

## 1. 核心原则

**不要把当前开发工作目录直接推到公开仓库。**

原因：

- 工作目录包含历年真题、作文配图、个人域名、运行记录和验收证据；
- 其中部分内容可能受第三方版权保护；
- 旧 Git 历史可能已经包含这些内容，后来加入 `.gitignore` 不会删除历史；
- `.env.local`、`.cloudflared/` 和 `artifacts/` 不应出现在公开仓库。

先生成干净发行目录。首次公开时初始化独立 Git 历史，后续发布从公开仓库的最新主分支继续提交。

## 2. 生成发行包

```bash
pnpm release:source
```

默认输出：

```text
dist/kaoyan-english-assistant-open-source/
```

指定输出目录：

```bash
node scripts/build-open-source-release.mjs --output=dist/my-release
```

覆盖已有目录：

```bash
node scripts/build-open-source-release.mjs --force
```

脚本会：

- 只复制允许公开的代码、配置、测试、部署文件和文档；
- 排除真题 JSON、作文配图、原始资料、草稿、评审记录、artifacts、`.env*`、隧道凭据、个人运维脚本说明；
- 创建空题库目录和说明，保证无题库也能构建；
- 扫描常见密钥格式和当前 `.env.local` 中的实际值；
- 检查禁止路径；
- 生成 `RELEASE_MANIFEST.json`，记录文件数量、大小与 SHA-256。

如果扫描发现疑似密钥，脚本会以非零退出码失败，并且**不会输出密钥值**。

## 3. 在干净目录验证

```bash
cd dist/kaoyan-english-assistant-open-source
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

预期：

- 测试通过；由于没有题库，完整语料测试显示 skipped；
- 构建成功；
- Docker 构建成功（如果本机有 Docker）；
- 启动后首页和自由输入功能可用，题库提示暂无内容。

启动验证：

```bash
cp .env.example .env.local
# 填入测试用 Key
pnpm start
```

另开终端：

```bash
node scripts/verify-deploy.mjs http://127.0.0.1:3000 --readonly --allow-empty-bank --allow-no-ocr
```

## 4. 初始化公开仓库

```bash
cd dist/kaoyan-english-assistant-open-source
git init
git add .
git status
git commit -m "chore: initial open-source release"
git branch -M main
git remote add origin <你的仓库地址>
git push -u origin main
```

已有公开仓库时，从公开 `main` 建立发行分支或工作树。核对新生成的清单，只同步本次范围内的文件，并检查暂存差异。完成干净安装和构建后，快进更新 `main`。用公开提交打标签，保留旧提交供版本对照和回退。

推送前再次确认：

- `git status` 中没有 `.env.local`；
- 没有 `data/**/*.json` 真题；
- 没有 `public/essay-materials/*.jpg`；
- 没有个人域名、Token、运行日志；
- `RELEASE_MANIFEST.json` 与当前文件一致。

## 5. 许可证选择

当前仓库默认：

- 源代码：MIT；
- 第三方内容与真题：不授权，见 `NOTICE.md`；
- PDF worker：Apache-2.0，保留原始许可。

如果你希望改用 Apache-2.0、AGPL 或其他许可证，必须在发布前：

1. 修改 `LICENSE`；
2. 更新 `package.json` 的 `license` 字段；
3. 更新 README 和 NOTICE；
4. 确认所有贡献者同意；
5. 重新生成发行包。

不要在没有确认权利的情况下把真题资料纳入代码许可证。

## 6. GitHub 仓库设置

建议开启：

- Branch protection：要求 CI 通过后才能合并；
- Dependabot alerts 与 security updates；
- Private vulnerability reporting；
- Secret scanning 与 push protection；
- Issues / Discussions 按需开启；
- Actions 默认只读 `GITHUB_TOKEN`。

CI 位于 `.github/workflows/ci.yml`，会在 Windows 上执行 lint、类型检查、测试和构建，并在 Linux 构建 Docker 镜像。

## 7. 发布版本

1. 更新 `CHANGELOG.md`；
2. 更新 `package.json` 版本；
3. 运行全部检查；
4. 打 Git tag，例如 `v0.1.0`；
5. 在 GitHub Release 中写明：
   - 代码与内容的许可边界；
   - 不包含真题；
   - 已知质量限制；
   - 需要的环境变量；
   - 部署方式；
   - 任何未完成的人工验收。

## 8. 公开 Demo 的额外要求

如果提供在线 Demo：

- 使用独立 API Key 和独立供应商额度；
- 设置供应商侧日预算与告警；
- 加访问控制或邀请码；
- 不保存用户正文；
- 明确标注“AI 分数仅供参考”；
- 不把真实学生材料作为演示数据；
- 准备随时下线入口的步骤。

## 9. 发布检查表

- [ ] 发行包不含题库、配图、原始资料、草稿与评审记录
- [ ] 不含 `.env*`、Token、证书、日志
- [ ] 不含个人域名、用户名、绝对路径
- [ ] 密钥扫描通过
- [ ] `RELEASE_MANIFEST.json` 已生成
- [ ] 干净目录安装、lint、类型、测试、构建通过
- [ ] Docker 构建通过
- [ ] 无题库启动与只读自检通过
- [ ] LICENSE / NOTICE / README 一致
- [ ] CI 与安全策略已启用
- [ ] 公开仓库使用全新 Git 历史
- [ ] 版本号、CHANGELOG、Release Note 一致
