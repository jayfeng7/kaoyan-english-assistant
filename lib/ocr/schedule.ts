import 'server-only';
import { AppError } from '@/lib/utils/errors';
import type { OcrScheduleEntry, OcrScheduleRuntime, OcrScheduleState } from '@/types';

// Process-wide, including distinct Next route bundles. Only transient waiters live here.
function state(): OcrScheduleState {
  const runtime = globalThis as typeof globalThis & OcrScheduleRuntime;
  return runtime.__kaoyanOcrSchedule ??= { nextStartAt: 0, queue: [] };
}
function pump(schedule: OcrScheduleState): void {
  if (schedule.timer !== undefined || !schedule.queue.length) return;
  const delay = Math.max(0, schedule.nextStartAt - Date.now());
  if (delay > 0) {
    schedule.timer = setTimeout(() => { schedule.timer = undefined; pump(schedule); }, delay);
    return;
  }
  const entry = schedule.queue.shift()!;
  entry.signal?.removeEventListener('abort', entry.cancel);
  if (entry.signal?.aborted) entry.reject(new AppError('OCR_FAILED'));
  else { schedule.nextStartAt = Date.now() + 600; entry.resolve(); }
  pump(schedule);
}
export function waitForOcrSlot(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new AppError('OCR_FAILED'));
  const schedule = state();
  return new Promise((resolve, reject) => {
    const entry: OcrScheduleEntry = { resolve, reject, signal, cancel: () => {
      const index = schedule.queue.indexOf(entry);
      if (index < 0) return;
      schedule.queue.splice(index, 1); signal?.removeEventListener('abort', entry.cancel);
      if (!schedule.queue.length && schedule.timer !== undefined) { clearTimeout(schedule.timer); schedule.timer = undefined; }
      reject(new AppError('OCR_FAILED'));
    } };
    schedule.queue.push(entry); signal?.addEventListener('abort', entry.cancel, { once: true });
    if (signal?.aborted) entry.cancel();
    pump(schedule);
  });
}
