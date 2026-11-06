/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['pdf-parse', '@napi-rs/canvas', 'pdfkit'],
  headers() {
    return [
      {
        source: '/pdf-worker/2.4.5/pdf.worker.mjs',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  outputFileTracingIncludes: {
    '/api/essay/report': ['./assets/fonts/NotoSansSC-Regular.otf', './assets/fonts/OFL.txt'],
    '/api/**': ['./data/exams/**/*.json', './data/essay-bank/english1/*.json', './data/essay-bank/english2/*.json'],
    // pdf-parse 动态加载 @napi-rs/canvas（渲染扫描页）与自身 pdf.worker.mjs（fake worker），
    // 文件追踪抓不到，需显式包含，否则 standalone/容器运行时 PDF 接口 500。
    '/api/exam/pdf': ['./node_modules/@napi-rs/canvas/**/*', './node_modules/.pnpm/@napi-rs+canvas*/**/*', './node_modules/.pnpm/pdf-parse@*/**/pdf.worker.mjs'],
    '/api/essay/pdf': ['./node_modules/@napi-rs/canvas/**/*', './node_modules/.pnpm/@napi-rs+canvas*/**/*', './node_modules/.pnpm/pdf-parse@*/**/pdf.worker.mjs'],
  },
  outputFileTracingExcludes: {
    '/*': ['./data/raw/**/*', './data/essay-bank/drafts/**/*', './data/essay-bank/reviews/**/*', './artifacts/**/*', './.env*', './.cloudflared/**/*', './.tools/**/*'],
  },
  // 仅 Docker 构建时开启，本地 next start 流程保持不变
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' } : {}),
};

export default nextConfig;
