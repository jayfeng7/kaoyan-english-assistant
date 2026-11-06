import type { TailwindConfig } from './types';

const config: TailwindConfig = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--accent-soft) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Arial', 'Microsoft YaHei', 'PingFang SC', 'sans-serif'],
        serif: ['Georgia', 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', 'serif'],
      },
      boxShadow: { card: '0 4px 24px rgb(27 48 68 / 0.035)' },
    },
  },
  plugins: [],
};

export default config;
