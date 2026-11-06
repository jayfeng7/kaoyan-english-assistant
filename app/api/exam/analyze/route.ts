import 'server-only';
import { getBankItem } from '@/lib/exam-bank';
import { examAnalyzeRequestSchema, examResultSchema } from '@/lib/schemas/exam';
import { buildExamPrompt } from '@/lib/prompts/exam';
import { generateStructured } from '@/lib/llm/structured';
import { countWords, parseInput, readJson, runApi } from '@/lib/utils/api';
import { AppError } from '@/lib/utils/errors';
import type { ExamPromptInput } from '@/types';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  return runApi(request, async (context) => {
    const input = parseInput(examAnalyzeRequestSchema, await readJson(request));
    let resolved: ExamPromptInput;
    if (input.source === 'bank') {
      const item = await getBankItem(input.bankId ?? '');
      if (item.type !== input.type) throw new AppError('INVALID_INPUT');
      const question = input.questionId ? item.questions.find((entry) => entry.id === input.questionId) : item.questions[0];
      if (!question) throw new AppError('INVALID_INPUT');
      resolved = { ...input, passage: item.passage, questionId: question.id, question: question.question, options: question.options, referenceAnswer: question.answer, referenceAnalysis: question.analysis };
    } else { resolved = { ...input, passage: input.passage ?? '' }; }
    context.wordCount = countWords(resolved.passage);
    // 全文翻译由服务端按 translate 归一化：false 时无论模型是否输出都丢弃；true 时必须为有效文本
    const schema = examResultSchema
      .transform((result) => ({ ...result, fullTranslation: input.translate ? result.fullTranslation : null }))
      .refine((result) => !input.translate || (typeof result.fullTranslation === 'string' && result.fullTranslation.trim().length > 0), '全文翻译必须符合translate参数');
    return generateStructured({ ...buildExamPrompt(resolved), signal: request.signal }, schema, context);
  }, 'llm');
}
