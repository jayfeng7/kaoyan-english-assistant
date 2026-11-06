import { describe, expect, it } from 'vitest';
import { advanceChatScroll } from '@/lib/client/chat-scroll';

describe('stream scroll intent', () => {
  it('does not let a queued bottom event cancel explicit review intent', () => {
    const paused = { following: false, reviewMoved: false, top: 1000 };
    const queued = advanceChatScroll(paused, 1000, true);
    expect(queued.following).toBe(false);
    const reviewed = advanceChatScroll(queued, 0, false);
    expect(reviewed).toEqual({ following: false, reviewMoved: true, top: 0 });
    expect(advanceChatScroll(reviewed, 0, false).following).toBe(false);
  });
  it('resumes after actually scrolling back to the end', () => {
    expect(advanceChatScroll({ following: false, reviewMoved: true, top: 0 }, 1200, true)).toEqual({ following: true, reviewMoved: false, top: 1200 });
  });
  it('keeps following when a resize clamps the scroll position at the new end', () => {
    expect(advanceChatScroll({ following: true, reviewMoved: false, top: 1000 }, 800, true).following).toBe(true);
  });
});
