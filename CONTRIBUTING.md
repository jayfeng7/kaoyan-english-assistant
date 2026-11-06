# 贡献指南

感谢参与。这个项目是学习辅助工具，优先保证**可验证、可回滚、隐私最小化**，而不是堆功能。

## 1. 先确认范围

以下方向默认不做，提出前请先开 Issue 对齐：

- 登录、注册、账号体系、权限；
- 支付、会员、计费；
- 多租户、服务端数据库、云存储；
- 深色模式；
- 未经授权的真题、解析、配图或学生材料入库；
- 在未确认边界前引入 RAG、Agent Runtime 或新模型框架。

## 2. 开发环境

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

需要 Node.js >= 22.12 和 pnpm 11.25。

## 3. 修改前

- 先读 `docs/ARCHITECTURE.md`、`docs/DATA.md` 和相关源码；
- 对行为变更先开 Issue 描述问题、预期和验证方式；
- 保留用户已有未提交改动，不要擅自格式化整个仓库；
- 不修改 `PROJECT_SPEC.md` 已定死的产品边界；
- 不在测试和示例中加入真实学生材料或真题原文。

## 4. 代码约定

- TypeScript strict；禁止 `any`；
- 服务端模块使用 `server-only`；
- 请求、响应和 LLM 结果都经 Zod 校验；
- 只有服务端读取环境变量，客户端不得读取密钥；
- 日志只允许请求 ID、耗时、供应商、字数、错误码等元信息；
- 组件 PascalCase，函数/文件 camelCase，常量 UPPER_SNAKE；
- 保留现有失败处理：不静默吞错、不伪造结果、不覆盖用户草稿。

## 5. 测试

提交前至少运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

有本地题库时：

```powershell
$env:REQUIRE_FULL_CORPUS='1'; pnpm test
pnpm data:check
```

- 新增 API 行为需要请求/响应和错误分支测试；
- 新增客户端交互需要可测试的状态逻辑；
- 修复缺陷时先写能失败的回归测试（可行时）；
- mock 结果不能冒充真实供应商、教师评分或真机验收。

## 6. 数据与隐私

- 不提交 `.env.local`、Token、证书、运行日志、学生作文或教师材料；
- 不提交真题 JSON、作文配图、原始 Word/PDF、草稿和评审记录；
- 需要演示时使用原创合成内容，并在文件名和文档中标注；
- 公开 Issue/PR 中的截图必须打码并移除个人信息。

## 7. 提交与 PR

- 一次提交解决一个问题，提交信息说明“做了什么、为什么”；
- PR 描述包含：问题、方案、验证命令、未覆盖项、风险；
- 不绕过 hooks，不强制推送主分支；
- 涉及模型 Prompt、分制、数据结构、部署方式的变化，必须说明兼容性和回滚方式；
- 不以“测试通过”代替人工教学质量验收。

## 8. 安全

漏洞、密钥泄露、越权或供应链问题请按 `SECURITY.md` 私下报告，不要公开提交 Issue。
