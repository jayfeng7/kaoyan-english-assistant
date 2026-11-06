import type { ErrorCode } from '@/types';

const MESSAGES: Record<ErrorCode, string> = {
  ESSAY_REVIEW_REQUIRED: '识别文字或页面完整性尚未核实，暂不评分。请补齐全文，并对照原图校对正文、移除教师批注。',
  INVALID_INPUT: '输入内容有误，请检查后重试', FILE_TOO_LARGE: '文件过大，请压缩后重试',
  UNSUPPORTED_FILE_TYPE: '文件类型不支持，请选择 JPG、PNG、WebP 图片或 PDF', RATE_LIMITED: '请求过于频繁，请稍后重试',
  PDF_PARSE_FAILED: '该 PDF 已加密或无法解析，请粘贴文字或从题库选择', OCR_FAILED: '识别暂时失败，请重试或手动输入',
  ALL_PROVIDERS_FAILED: '服务暂时不可用，请稍后重试', JSON_PARSE_FAILED: '分析结果暂时无法解析，请重试',
  EXAM_BANK_NOT_FOUND: '未找到该真题，请重新选择或粘贴文章', INTERNAL_ERROR: '服务暂时出现问题，请稍后重试',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) { super(MESSAGES[code]); this.name = 'AppError'; this.code = code; }
}
