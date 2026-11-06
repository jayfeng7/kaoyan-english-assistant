#!/usr/bin/env node
/**
 * 生成可公开的源代码发行包。
 *
 * 只复制明确允许公开的文件，并从当前工作目录读取 .env.local 中的实际密钥值做泄露扫描。
 * 扫描结果只输出文件名，不输出密钥值。
 *
 * 用法：
 *   node scripts/build-open-source-release.mjs
 *   node scripts/build-open-source-release.mjs --output=dist/release
 *   node scripts/build-open-source-release.mjs --force
 */
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outputArg = args.find((arg) => arg.startsWith('--output='))?.slice('--output='.length);
const force = args.includes('--force');
const OUTPUT = path.resolve(ROOT, outputArg || 'dist/kaoyan-english-assistant-open-source');

const ROOT_FILES = [
  '.dockerignore', '.editorconfig', '.env.example', '.gitattributes', '.gitignore',
  '.npmrc', '.nvmrc', 'AGENTS.md', 'CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md',
  'Dockerfile', 'LICENSE', 'NOTICE.md', 'README.md', 'SECURITY.md', 'docker-compose.yml',
  'eslint.config.mjs', 'next-env.d.ts', 'next.config.mjs', 'package.json',
  'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'postcss.config.mjs', 'tailwind.config.ts',
  'tsconfig.json', 'vitest.config.ts', 'vitest.eval.config.ts',
];

const DIRECTORIES = ['app', 'assets', 'components', 'lib', 'types', 'tests', 'deploy', 'learning/rag', '.github'];
const PUBLIC_DOCS = [
  'ARCHITECTURE.md', 'DATA.md', 'DEPLOYMENT.md', 'EVALUATION_PLAN.md',
  'RAG_EXPERIMENTS.md', 'RAG_INTERVIEW.md', 'RAG_ROADMAP.md', 'RELEASING.md', 'STATUS.md', 'USAGE.md',
];
const PUBLIC_SCRIPTS = [
  'build-open-source-release.mjs', 'check-local-data.mjs', 'node-tool.mjs',
  'verify-deploy.mjs', 'windows-fs-compat.cjs',
];
const EXCLUDED_FILES = new Set([
  'tests/trial-release.test.ts',
  'tests/trial-runtime.test.ts',
]);

const FORBIDDEN_PATTERNS = [
  /^\.env(?!\.example$)/,
  /^\.cloudflared\//,
  /^artifacts\//,
  /^data\/raw\//,
  /^data\/evaluation\//,
  /^data\/essay-bank\/drafts\//,
  /^data\/essay-bank\/reviews\//,
  /^data\/exams\/[^/]+\/.+\.json$/,
  /^data\/essay-bank\/(english1|english2)\/.+\.json$/,
  /^public\/essay-materials\/(?!README\.md$|\.gitkeep$).+/,
  /^\.tools\//,
  /^node_modules\//,
  /^\.next\//,
  /^dist\//,
];

const SECRET_PATTERNS = [
  { name: 'OpenAI-style key', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'Google-style key', pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: 'Private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
];

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function assertInsideRoot(target) {
  const relativeTarget = path.relative(ROOT, target);
  if (!relativeTarget || relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    throw new Error('输出目录必须位于项目目录内，且不能是项目根目录。');
  }
}

async function copyOne(relativePath) {
  const source = path.join(ROOT, relativePath);
  if (!existsSync(source)) return false;
  const destination = path.join(OUTPUT, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  return true;
}

async function copyDirectory(relativeDirectory) {
  const sourceRoot = path.join(ROOT, relativeDirectory);
  if (!existsSync(sourceRoot)) return;
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`发行包不允许符号链接：${relativePath}`);
    if (entry.isDirectory()) {
      await copyDirectory(relativePath);
    } else if (entry.isFile() && !EXCLUDED_FILES.has(relativePath)) {
      await copyOne(relativePath);
    }
  }
}

async function listFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

function parseLocalSecrets() {
  const file = path.join(ROOT, '.env.local');
  if (!existsSync(file)) return [];
  const values = [];
  const text = requireText(file);
  for (const line of text.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z0-9_]*(?:KEY|SECRET|TOKEN)[A-Z0-9_]*)\s*=\s*(.+?)\s*$/u);
    if (!match) continue;
    const value = match[2].replace(/^['"]|['"]$/g, '').trim();
    if (value.length >= 12 && !/^(?:your|example|change|test|xxx)/iu.test(value)) values.push(value);
  }
  return values;
}

function requireText(file) {
  // Only used for the small local env file; its contents are never printed.
  return readFileSync(file, 'utf8');
}

async function scanSecrets(files) {
  const configured = parseLocalSecrets();
  const findings = [];
  for (const file of files) {
    const relativePath = path.relative(OUTPUT, file).split(path.sep).join('/');
    const info = await stat(file);
    if (info.size > 2 * 1024 * 1024) continue;
    const buffer = await readFile(file);
    if (buffer.includes(0)) continue;
    const text = buffer.toString('utf8');
    for (const value of configured) {
      if (text.includes(value)) findings.push(`${relativePath} (配置值)`);
    }
    for (const { name, pattern } of SECRET_PATTERNS) {
      if (new RegExp(pattern.source, pattern.flags).test(text)) findings.push(`${relativePath} (${name})`);
    }
  }
  return findings;
}

async function main() {
  assertInsideRoot(OUTPUT);
  if (existsSync(OUTPUT)) {
    if (!force) throw new Error(`输出目录已存在：${path.relative(ROOT, OUTPUT)}。如需覆盖请加 --force。`);
    await rm(OUTPUT, { recursive: true, force: true });
  }
  await mkdir(OUTPUT, { recursive: true });

  let copied = 0;
  for (const file of ROOT_FILES) if (await copyOne(file)) copied++;
  for (const directory of DIRECTORIES) await copyDirectory(directory);
  for (const file of PUBLIC_DOCS) await copyOne(`docs/${file}`);
  for (const file of PUBLIC_SCRIPTS) await copyOne(`scripts/${file}`);

  // 空题库占位：无第三方内容也能构建和启动。
  for (const directory of [
    'data/exams/english1', 'data/exams/english2',
    'data/essay-bank/english1', 'data/essay-bank/english2',
    'public/essay-materials',
  ]) {
    await mkdir(path.join(OUTPUT, directory), { recursive: true });
    await writeFile(path.join(OUTPUT, directory, '.gitkeep'), '');
  }
  await copyOne('data/README.md');
  await copyOne('data/exams/README.md');
  await copyOne('data/essay-bank/README.md');
  await copyOne('public/essay-materials/README.md');
  await copyOne('public/.gitkeep');
  // 固定版本 PDF worker 及其 Apache-2.0 许可证必须随包分发：扫描 PDF 功能依赖，
  // 测试校验字节与许可证；不依赖第三方 CDN。
  await copyOne('public/pdf-worker/2.4.5/pdf.worker.mjs');
  await copyOne('public/pdf-worker/2.4.5/LICENSE');

  const files = await listFiles(OUTPUT);
  const forbidden = [];
  for (const file of files) {
    const relativePath = path.relative(OUTPUT, file).split(path.sep).join('/');
    if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(relativePath))) forbidden.push(relativePath);
  }
  if (forbidden.length) throw new Error(`发行包含禁止文件：\n${forbidden.join('\n')}`);

  const secrets = await scanSecrets(files);
  if (secrets.length) throw new Error(`疑似密钥泄露，发行已中止：\n${secrets.join('\n')}`);

  const manifest = [];
  for (const file of files.sort()) {
    const relativePath = path.relative(OUTPUT, file).split(path.sep).join('/');
    const data = await readFile(file);
    manifest.push({ path: relativePath, bytes: data.byteLength, sha256: createHash('sha256').update(data).digest('hex') });
  }
  await writeFile(path.join(OUTPUT, 'RELEASE_MANIFEST.json'), `${JSON.stringify({
    name: 'kaoyan-english-assistant',
    version: JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version,
    generatedAt: new Date().toISOString(),
    fileCount: manifest.length,
    files: manifest,
  }, null, 2)}\n`);

  console.log(`发行包已生成：${path.relative(ROOT, OUTPUT)}`);
  console.log(`文件数：${manifest.length + 1}`);
  console.log('已排除题库、配图、原始资料、草稿、评审记录、运行证据、环境文件和隧道凭据。');
  console.log('密钥扫描：通过（未发现配置值或常见密钥格式）。');
  console.log('下一步：进入发行目录，执行 pnpm install --frozen-lockfile、lint、typecheck、test、build。');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '发行包生成失败。');
  process.exitCode = 1;
});
