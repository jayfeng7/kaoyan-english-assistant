import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const tools = {
  next: '../node_modules/next/dist/bin/next',
  tsc: '../node_modules/typescript/bin/tsc',
  vitest: '../node_modules/vitest/vitest.mjs',
};
const [name, ...args] = process.argv.slice(2);
if (!Object.hasOwn(tools, name)) throw new Error('Expected tool: next, tsc or vitest');
const env = { ...process.env };
if (process.platform === 'win32') {
  const compat = fileURLToPath(new URL('./windows-fs-compat.cjs', import.meta.url)).replaceAll('\\', '/');
  // NODE_OPTIONS also reaches compiler/test workers spawned by the selected tool.
  env.NODE_OPTIONS = [env.NODE_OPTIONS, `--require="${compat}"`].filter(Boolean).join(' ');
}
const child = spawn(process.execPath, [fileURLToPath(new URL(tools[name], import.meta.url)), ...args], { env, stdio: 'inherit', windowsHide: true });
child.on('error', () => { process.stderr.write(`Failed to start ${name}\n`); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(signal); });
