import { describe, expect, it, vi } from 'vitest';
import { waitForClientOperation } from '@/lib/client/wait';

describe('cancellable client waiting', () => {
  it('keeps results and errors while removing the cancellation listener', async () => {
    const controller = new AbortController(); const remove = vi.spyOn(controller.signal, 'removeEventListener');
    await expect(waitForClientOperation(Promise.resolve(42), controller.signal)).resolves.toBe(42);
    const error = new Error('private test detail');
    await expect(waitForClientOperation(Promise.reject(error), controller.signal)).rejects.toBe(error);
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it('stops waiting for a non-cooperative promise and safely consumes its late failure', async () => {
    const controller = new AbortController(); let fail: ((error: Error) => void) | undefined;
    const underlying = new Promise<never>((_resolve, reject) => { fail = reject; });
    const task = waitForClientOperation(underlying, controller.signal);
    const failed = expect(task).rejects.toThrow('请求已停止或超时，输入内容已保留');
    controller.abort(); await failed;
    fail?.(new Error('private late error')); await underlying.catch(() => undefined);
  });
  it('does not publish a result after cancellation, including an already cancelled signal', async () => {
    await expect(waitForClientOperation(Promise.resolve('late'), AbortSignal.abort())).rejects.toThrow('请求已停止或超时');
    await expect(waitForClientOperation(Promise.reject(new Error('private error')), AbortSignal.abort())).rejects.toThrow('请求已停止或超时');
  });
});
