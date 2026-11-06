'use client';
import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '@/lib/storage/db';
import type { AppSettings, EssayDraft, ExamDraft, SentenceDraft, WorkspaceState, HistoryType, HistorySelection } from '@/types';

export const useWorkspace = create<WorkspaceState>(() => ({ ready: false, settings: { ...DEFAULT_SETTINGS }, homeInput: '', essay: { type: 'english1', composition: 'big', prompt: '', essay: '', ocrText: '', ocrConfirmed: false }, sentence: { sentence: '' }, exam: { type: 'english1', source: 'bank', bankId: '', questionId: '', passage: '', pdfPassage: '', question: '', optionsText: '', userAnswer: '', translate: false }, chat: undefined, chatInput: '' }));
export function patchEssay(patch: Partial<EssayDraft>): void { useWorkspace.setState((state) => ({ essay: { ...state.essay, ...patch } })); }
export function patchSentence(patch: Partial<SentenceDraft>): void { useWorkspace.setState((state) => ({ sentence: { ...state.sentence, ...patch } })); }
export function patchExam(patch: Partial<ExamDraft>): void { useWorkspace.setState((state) => ({ exam: { ...state.exam, ...patch } })); }
export function forgetDeletedHistory(filter: HistorySelection = {}): void {
  const matches = (type: HistoryType, id?: string) => Boolean(id) && (!filter.id || filter.id === id) && (!filter.type || filter.type === type);
  useWorkspace.setState((state) => ({
    essay: matches('essay', state.essay.record?.id) ? { ...state.essay, record: undefined } : state.essay,
    sentence: matches('sentence', state.sentence.record?.id) ? { ...state.sentence, record: undefined } : state.sentence,
    exam: matches('exam', state.exam.record?.id) ? { ...state.exam, record: undefined } : state.exam,
    chat: matches('chat', state.chat?.id) ? undefined : state.chat,
  }));
}
export function applySettings(settings: AppSettings): void { useWorkspace.setState((state) => ({ settings, essay: !state.essay.record && !state.essay.essay && !state.essay.prompt && !state.essay.ocrResult && !state.essay.promptReview && !state.essay.essayReview && state.essay.source !== 'bank' ? { ...state.essay, type: settings.essayType, composition: settings.composition } : state.essay, exam: !state.exam.record && !state.exam.passage && !state.exam.pdfPassage && !state.exam.bankId ? { ...state.exam, type: settings.essayType, translate: settings.defaultFullTranslation } : state.exam })); }
