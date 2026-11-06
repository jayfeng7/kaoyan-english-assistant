import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStreamPublisher } from '@/lib/client/stream-publisher';

afterEach(() => vi.useRealTimers());
describe('stream rendering scheduler', () => {
  it('publishes the first token immediately and coalesces a burst without losing the newest text', () => {
    vi.useFakeTimers(); let text = 'a'; const received: string[] = [];
    const publisher = createStreamPublisher(() => received.push(text));
    publisher.schedule(); expect(received).toEqual(['a']);
    for (let index = 0; index < 100; index++) { text += 'b'; publisher.schedule(); }
    expect(received).toHaveLength(1); vi.advanceTimersByTime(40);
    expect(received).toEqual(['a', text]);
  });
  it('flushes the final partial text on done, interruption or stop and leaves no delayed update', () => {
    vi.useFakeTimers(); let text = 'first'; const received: string[] = [];
    const publisher = createStreamPublisher(() => received.push(text));
    publisher.schedule(); text = 'complete'; publisher.schedule(); publisher.flush();
    vi.runAllTimers(); expect(received).toEqual(['first', 'complete']);
  });
  it('cancels a queued update after disposal', () => {
    vi.useFakeTimers(); const publish = vi.fn(); const publisher = createStreamPublisher(publish);
    publisher.schedule(); publisher.schedule(); publisher.cancel(); vi.runAllTimers(); expect(publish).toHaveBeenCalledTimes(1);
  });
});
