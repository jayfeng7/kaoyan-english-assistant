import 'server-only';
import { extractPdfText } from '@/lib/pdf/extract';
import { runApi, countWords } from '@/lib/utils/api';
import { AppError } from '@/lib/utils/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return runApi(request, async (context) => {
    const form = await request.formData().catch(() => { throw new AppError('INVALID_INPUT'); });
    const file = form.get('file');
    if (!(file instanceof File)) throw new AppError('INVALID_INPUT');
    const data = await extractPdfText(file);
    context.wordCount = countWords(data.text);
    return { data };
  });
}
