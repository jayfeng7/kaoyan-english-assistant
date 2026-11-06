import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspace, patchEssay, patchExam, applySettings, forgetDeletedHistory } from '@/lib/client/workspace';
import { DEFAULT_SETTINGS } from '@/lib/storage/db';
import { makeEssayData } from './fixtures';
beforeEach(() => { useWorkspace.setState(useWorkspace.getInitialState(), true); });
describe('draft-safe settings hydration', () => {
  it('applies defaults to empty drafts', () => { applySettings({ ...DEFAULT_SETTINGS, essayType: 'english2', composition: 'small', defaultFullTranslation: true }); expect(useWorkspace.getState().essay).toMatchObject({ type: 'english2', composition: 'small' }); expect(useWorkspace.getState().exam).toMatchObject({ type: 'english2', translate: true }); });
  it('does not overwrite edited or restored work when settings finish loading', () => { patchEssay({ essay: 'Unsaved work.', type: 'english1', record: makeEssayData() }); patchExam({ passage: 'Unsaved reading.', type: 'english1' }); applySettings({ ...DEFAULT_SETTINGS, essayType: 'english2', composition: 'small' }); expect(useWorkspace.getState().essay).toMatchObject({ type: 'english1', essay: 'Unsaved work.', record: makeEssayData() }); expect(useWorkspace.getState().exam).toMatchObject({ type: 'english1', passage: 'Unsaved reading.' }); });
  it('does not override an active bank selection or upload while hydrating settings', () => {
    patchEssay({ source: 'bank' }); applySettings({ ...DEFAULT_SETTINGS, essayType: 'english2' }); expect(useWorkspace.getState().essay.type).toBe('english1');
    patchEssay({ source: 'custom', promptReview: { pages: [{ number: 1, method: 'text', text: 'Uploaded task.' }], confirmed: false } }); applySettings({ ...DEFAULT_SETTINGS, essayType: 'english2' }); expect(useWorkspace.getState().essay.type).toBe('english1');
  });
  it('removes only deleted record references and retains the input draft', () => {
    patchEssay({ essay: 'Keep my draft.', record: makeEssayData() });
    forgetDeletedHistory({ type: 'sentence' }); expect(useWorkspace.getState().essay.record).toBeDefined();
    forgetDeletedHistory({ id: makeEssayData().id }); expect(useWorkspace.getState().essay.record).toBeUndefined();
    expect(useWorkspace.getState().essay.essay).toBe('Keep my draft.');
  });
});
