import 'server-only';
import { AppError } from './errors';
import type { DailyBudgetConfig, RateLimitBucket, RateLimitConfig, RateLimitKind, RateLimitResult, ServerEnvironment } from '@/types';

function positiveInteger(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
}

export function getRateLimitConfig(kind: RateLimitKind, env: ServerEnvironment = process.env): RateLimitConfig {
  const prefix = kind === 'llm' ? 'RATE_LIMIT_LLM' : 'RATE_LIMIT_OCR';
  return { max: positiveInteger(env[`${prefix}_MAX`], kind === 'llm' ? 10 : 30), windowMs: positiveInteger(env[`${prefix}_WINDOW_MS`], 60_000) };
}

export function getDailyBudgetConfig(kind: RateLimitKind, env: ServerEnvironment = process.env): DailyBudgetConfig {
  const prefix = kind === 'llm' ? 'RATE_LIMIT_LLM' : 'RATE_LIMIT_OCR';
  // Total cap across all callers for a rolling 24h window; 0 disables. In-memory like
  // the per-IP limiter: per process, reset on restart, not shared between replicas.
  return { max: nonNegativeInteger(env[`${prefix}_DAILY_MAX`], kind === 'llm' ? 500 : 1200), windowMs: 86_400_000 };
}

export function createDailyBudget(config: DailyBudgetConfig) {
  let windowStart = 0; let count = 0;
  return (now = Date.now()): RateLimitResult => {
    if (config.max <= 0) return { allowed: true, remaining: Number.MAX_SAFE_INTEGER, resetAt: now + config.windowMs, retryAfter: 0 };
    if (now - windowStart >= config.windowMs) { windowStart = now; count = 0; }
    const allowed = count < config.max;
    if (allowed) count++;
    return { allowed, remaining: Math.max(0, config.max - count), resetAt: windowStart + config.windowMs, retryAfter: allowed ? 0 : Math.max(1, Math.ceil((windowStart + config.windowMs - now) / 1000)) };
  };
}

export function createRateLimiter(config: RateLimitConfig) {
  const buckets = new Map<string, RateLimitBucket>();
  return (ip: string, now = Date.now()): RateLimitResult => {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
    const bucket = buckets.get(ip) ?? { count: 0, resetAt: now + config.windowMs };
    const allowed = bucket.count < config.max;
    if (allowed) bucket.count++;
    buckets.set(ip, bucket);
    return { allowed, remaining: Math.max(0, config.max - bucket.count), resetAt: bucket.resetAt, retryAfter: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  };
}

const limiters: Partial<Record<RateLimitKind, ReturnType<typeof createRateLimiter>>> = {};
export function checkRateLimit(ip: string, kind: RateLimitKind): RateLimitResult {
  const limiter = limiters[kind] ??= createRateLimiter(getRateLimitConfig(kind));
  return limiter(ip);
}
export function enforceRateLimit(ip: string, kind: RateLimitKind): RateLimitResult {
  const result = checkRateLimit(ip, kind);
  if (!result.allowed) throw new AppError('RATE_LIMITED');
  return result;
}

const budgets: Partial<Record<RateLimitKind, ReturnType<typeof createDailyBudget>>> = {};
export function checkDailyBudget(kind: RateLimitKind, now = Date.now()): RateLimitResult {
  return (budgets[kind] ??= createDailyBudget(getDailyBudgetConfig(kind)))(now);
}
