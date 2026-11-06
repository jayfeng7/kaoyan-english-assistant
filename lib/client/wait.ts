'use client';
import { ClientFailure } from './api';

// Stop waiting without assuming the underlying browser/library promise is cancellable.
// Both settlement handlers remain attached so a late rejection is still consumed.
export function waitForClientOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const clean = () => signal.removeEventListener('abort', cancel);
    const cancel = () => { clean(); reject(new ClientFailure('请求已停止或超时，输入内容已保留')); };
    operation.then(value => {
      clean();
      if (signal.aborted) cancel(); else resolve(value);
    }, error => {
      clean();
      if (signal.aborted) cancel(); else reject(error);
    });
    if (signal.aborted) cancel(); else signal.addEventListener('abort', cancel, { once: true });
  });
}
