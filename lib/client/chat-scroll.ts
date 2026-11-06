'use client';
import type { ChatScrollState } from '@/types';

export function advanceChatScroll(state: ChatScrollState, top: number, atEnd: boolean): ChatScrollState {
  // A queued programmatic scroll at the old bottom must not undo explicit pause.
  if (atEnd && (state.following || state.reviewMoved)) return { following: true, reviewMoved: false, top };
  if (top < state.top - 1) return { following: false, reviewMoved: true, top };
  return { ...state, top };
}
