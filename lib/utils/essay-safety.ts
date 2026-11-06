import { AppError } from './errors';
import type { EssayCorrectRequest, EssayInputEvidence } from '@/types';

export const ESSAY_REVIEW_MESSAGE = '识别文字或页面完整性尚未核实，暂不评分。请补齐全文，并对照原图校对正文、移除教师批注。';
export const FEEDBACK_DIMENSIONS = ['内容切题', '结构段落', '语法错误', '词汇表达', '格式与署名', '字数', '卷面书写'] as const;

// Recognition confidence is not evidence that the page is complete or that teacher ink is student text.
// These are provenance checks, never spelling correction or score calibration.
export function essayReviewReason(input: Pick<EssayCorrectRequest, 'essay' | 'inputEvidence'>): string | undefined {
  if (/\[\?\]|☰/u.test(input.essay)) return '正文仍有无法辨认的片段，不能把识别噪声当作学生错误扣分。';
  const evidence = input.inputEvidence;
  if (!evidence) return undefined; // Pasted/typed text and historical text-only clients retain their contract.
  if (evidence.pageCompleteness === 'partial') return '当前仅提供残页或裁切内容，无法判断完整字数与结构，也不能给出完整评分。';
  if (evidence.pageCompleteness !== 'full') return '尚未确认图片包含整篇作文及续页，无法判断完整字数与结构。';
  if (!evidence.reviewed) return '图片识别文字尚未对照原图核对，无法区分识别错误、教师批注与学生原文错误。';
  if (evidence.bodyStatus === 'review') return '尚未确定作文正文范围，请先选出学生原文，移除题面和批注。';
  return undefined;
}

export function uploadEvidence(pages: { ocr?: { confidence: number; lowConfidenceWords: unknown[] } }[], reviewed: boolean, pageCompleteness: EssayInputEvidence['pageCompleteness'], bodyStatus: EssayInputEvidence['bodyStatus']): EssayInputEvidence | undefined {
  const ocr = pages.flatMap(page => page.ocr ? [page.ocr] : []);
  if (!ocr.length) return undefined;
  return { origin: 'ocr', reviewed, pageCompleteness, bodyStatus, confidence: Math.min(...ocr.map(result => result.confidence)), uncertainSegments: ocr.reduce((n, result) => n + result.lowConfidenceWords.length, 0) };
}

export interface LimitedEssayAssessment {
  transcript: string;
  task_identification: { exam_year: null; paper: string | null; section: string | null; topic_keywords: string[]; basis: 'user_supplied_not_image_identification' | 'unavailable' };
  score: null;
  feedback: Record<string, string>;
  confidence: number;
  limitations: string[];
  suggestions: string[];
  source: string;
  copyright: string;
}

export function limitedEssayAssessment(input: EssayCorrectRequest, reason: string): LimitedEssayAssessment {
  return {
    transcript: input.essay,
    task_identification: { exam_year: null, paper: input.type === 'english1' ? '英语一' : '英语二', section: input.composition === 'small' ? '小作文' : '大作文', topic_keywords: [], basis: 'user_supplied_not_image_identification' },
    score: null,
    feedback: Object.fromEntries(FEEDBACK_DIMENSIONS.map(key => [key, key === '字数' || key === '结构段落' ? '无法根据未经核实的识别文字判断整篇字数或结构。' : '当前证据不足，暂不判断是否存在问题，也不将识别错误归因于学生。'])),
    confidence: 0.35,
    limitations: [reason, '此处仅收到识别文字及上传核对状态，不能独立确认原图字迹、批注归属或页面边缘是否裁切。'],
    suggestions: ['补充包含开头、结尾和全部续页的清晰图片。', '逐字对照原图校对正文，删去题面和教师批注，保留学生原有表达。'],
    source: input.inputEvidence ? '用户上传材料的识别文字；卷种与题型来自用户填写，未自动识别年份。' : '用户提供的文字；未独立核验原始图片。',
    copyright: '上传材料的第三方版权归原作者，限授权学习使用；结果为练习辅助，不代表官方评分。',
  };
}

export class EssayReviewRequiredError extends AppError {
  readonly assessment: LimitedEssayAssessment;
  constructor(input: EssayCorrectRequest, reason: string) {
    super('ESSAY_REVIEW_REQUIRED');
    this.assessment = limitedEssayAssessment(input, reason);
  }
}

export function unreadableHandwritingAssessment(): LimitedEssayAssessment {
  return {
    transcript: '', task_identification: { exam_year: null, paper: null, section: null, topic_keywords: [], basis: 'unavailable' }, score: null,
    feedback: Object.fromEntries(FEEDBACK_DIMENSIONS.map(key => [key, '未能可靠识别原文，无法判断，暂不提供批改结论。'])),
    confidence: 0,
    limitations: ['手写识别失败或未返回可用文字，无法可靠转写。', '无法判断完整字数与结构、卷种题型或给出完整评分。'],
    suggestions: ['补拍方向正确、字迹清晰且包含整页的照片，补齐所有续页。', '若仍无法识别，请对照原图手动录入学生原文，移除题面和教师批注。'],
    source: '用户上传材料；本次未取得可用识别文字。', copyright: '上传材料的第三方版权归原作者，限授权学习使用；不代表官方评分。',
  };
}
