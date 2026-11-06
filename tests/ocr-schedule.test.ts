import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForOcrSlot } from '@/lib/ocr/schedule';
import type { OcrScheduleRuntime } from '@/types';
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10000); delete (globalThis as typeof globalThis & OcrScheduleRuntime).__kaoyanOcrSchedule; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); delete (globalThis as typeof globalThis & OcrScheduleRuntime).__kaoyanOcrSchedule; });
describe('process-wide OCR pacing', () => {
  it('starts at most one request per 600ms in FIFO order', async () => {
    const times: number[] = [];
    await waitForOcrSlot(); times.push(Date.now());
    const second = waitForOcrSlot().then(() => times.push(Date.now())); const third = waitForOcrSlot().then(() => times.push(Date.now()));
    await vi.advanceTimersByTimeAsync(599); expect(times).toEqual([10000]);
    await vi.advanceTimersByTimeAsync(1); await second; expect(times).toEqual([10000,10600]);
    await vi.advanceTimersByTimeAsync(600); await third; expect(times).toEqual([10000,10600,11200]);
  });
  it('removes a cancelled waiter without making the next caller wait for its unused slot', async () => {
    await waitForOcrSlot(); const controller = new AbortController(); const cancelled = waitForOcrSlot(controller.signal);
    const next = vi.fn(); const active = waitForOcrSlot().then(next); controller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: 'OCR_FAILED' }); await vi.advanceTimersByTimeAsync(600); await active; expect(next).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not schedule a cancelled caller or keep a timer for an empty queue', async () => {
    await expect(waitForOcrSlot(AbortSignal.abort())).rejects.toMatchObject({ code: 'OCR_FAILED' }); expect(vi.getTimerCount()).toBe(0);
    await waitForOcrSlot(); const controller = new AbortController(); const pending = waitForOcrSlot(controller.signal); controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'OCR_FAILED' }); expect(vi.getTimerCount()).toBe(0);
  });
  it('shares spacing across separately loaded route modules', async () => {
    await waitForOcrSlot(); vi.resetModules(); const otherRoute = await import('@/lib/ocr/schedule');
    const sent = vi.fn(); const pending = otherRoute.waitForOcrSlot().then(sent);
    await vi.advanceTimersByTimeAsync(599); expect(sent).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1); await pending; expect(sent).toHaveBeenCalledOnce();
  });
});
