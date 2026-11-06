import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({ ...base, test: { ...base.test, include: ['tests/*.eval.ts'], testTimeout: 600_000, hookTimeout: 60_000, maxWorkers: 1 } });
