'use client';

// Publish the first token immediately, then coalesce bursts of SSE events.
// A timer also runs in background tabs; terminal events explicitly flush it.
export function createStreamPublisher(publish: () => void) {
  let first = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const flush = () => { cancel(); publish(); };
  const schedule = () => {
    if (first) { first = false; publish(); }
    else if (timer === undefined) timer = setTimeout(flush, 40);
  };
  return { schedule, flush, cancel };
}
