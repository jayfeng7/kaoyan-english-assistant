import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDailyBudget, createRateLimiter, getDailyBudgetConfig, getRateLimitConfig } from '@/lib/utils/rate-limit';
import { clientIp } from '@/lib/utils/api';

describe('trusted client IP extraction', () => {
  it('prefers proxy-overwritten headers and falls back to the first forwarded value only when they are absent', () => {
    expect(clientIp(new Request('http://local', { headers: { 'x-real-ip': '203.0.113.9', 'cf-connecting-ip': '203.0.113.8', 'x-forwarded-for': '198.51.100.1, 203.0.113.9' } }))).toBe('203.0.113.9');
    expect(clientIp(new Request('http://local', { headers: { 'cf-connecting-ip': '203.0.113.8', 'x-forwarded-for': '198.51.100.1' } }))).toBe('203.0.113.8');
    expect(clientIp(new Request('http://local', { headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.9' } }))).toBe('198.51.100.1');
    expect(clientIp(new Request('http://local'))).toBe('local');
  });
});

describe('IP fixed-window limiter', () => {
  it('allows exactly the configured count and resets at the window boundary', () => {
    const limit = createRateLimiter({ max: 10, windowMs: 60_000 });
    for (let index = 0; index < 10; index++) expect(limit('ip-a', 1000).allowed).toBe(true);
    expect(limit('ip-a', 1000)).toMatchObject({ allowed: false, remaining: 0, resetAt: 61_000, retryAfter: 60 });
    expect(limit('ip-b', 1000).allowed).toBe(true);
    expect(limit('ip-a', 60_999).allowed).toBe(false);
    expect(limit('ip-a', 61_000)).toMatchObject({ allowed: true, remaining: 9, resetAt: 121_000 });
  });
  it('keeps LLM and OCR defaults distinct and validates optional numeric configuration', () => {
    expect(getRateLimitConfig('llm', {})).toEqual({ max: 10, windowMs: 60_000 });
    expect(getRateLimitConfig('ocr', {})).toEqual({ max: 30, windowMs: 60_000 });
    expect(getRateLimitConfig('ocr', { RATE_LIMIT_OCR_MAX: '3', RATE_LIMIT_OCR_WINDOW_MS: '500' })).toEqual({ max: 3, windowMs: 500 });
    expect(getRateLimitConfig('llm', { RATE_LIMIT_LLM_MAX: '-1', RATE_LIMIT_LLM_WINDOW_MS: 'NaN' })).toEqual({ max: 10, windowMs: 60_000 });
  });
});

describe('global rolling daily budget', () => {
  it('allows within budget, rejects past it with retryAfter, and slides the window', () => {
    const budget = createDailyBudget({ max: 2, windowMs: 86_400_000 });
    expect(budget(1000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(budget(2000)).toMatchObject({ allowed: true, remaining: 0 });
    expect(budget(3000)).toMatchObject({ allowed: false, retryAfter: Math.ceil((86_400_000 - 3000) / 1000) });
    // The rolling window only slides a full day after its start.
    expect(budget(86_399_999)).toMatchObject({ allowed: false });
    expect(budget(86_400_000)).toMatchObject({ allowed: true, remaining: 1 });
  });
  it('defaults differ per kind and zero disables the cap', () => {
    expect(getDailyBudgetConfig('llm', {})).toEqual({ max: 500, windowMs: 86_400_000 });
    expect(getDailyBudgetConfig('ocr', {})).toEqual({ max: 1200, windowMs: 86_400_000 });
    expect(getDailyBudgetConfig('llm', { RATE_LIMIT_LLM_DAILY_MAX: '7' }).max).toBe(7);
    expect(getDailyBudgetConfig('ocr', { RATE_LIMIT_OCR_DAILY_MAX: '-3' }).max).toBe(1200);
    const disabled = createDailyBudget({ max: 0, windowMs: 86_400_000 });
    for (let index = 0; index < 20; index++) expect(disabled(index * 1000)).toMatchObject({ allowed: true });
  });
  it('limitRequest rejects once the budget is exhausted even across different IPs', async () => {
    vi.resetModules();
    process.env.RATE_LIMIT_LLM_DAILY_MAX = '1';
    try {
      const { limitRequest, createApiContext } = await import('@/lib/utils/api');
      const request = (ip: string) => new Request('http://local', { headers: { 'x-real-ip': ip } });
      expect(() => limitRequest(request('198.51.100.1'), 'llm', createApiContext())).not.toThrow();
      expect(() => limitRequest(request('198.51.100.2'), 'llm', createApiContext())).toThrowError(expect.objectContaining({ code: 'RATE_LIMITED' }));
    } finally {
      delete process.env.RATE_LIMIT_LLM_DAILY_MAX;
      vi.resetModules();
    }
  });
});

afterEach(() => { vi.restoreAllMocks(); });
