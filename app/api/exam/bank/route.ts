import 'server-only';
import { getBankList } from '@/lib/exam-bank';
import { examBankFilterSchema } from '@/lib/schemas/exam';
import { examBankListSchema } from '@/lib/schemas/api';
import { parseInput, runApi, validateResult } from '@/lib/utils/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  return runApi(request, async () => {
    const params = new URL(request.url).searchParams;
    const filter = parseInput(examBankFilterSchema, Object.fromEntries(['type', 'year', 'q'].flatMap((key) => params.has(key) ? [[key, params.get(key)]] : [])));
    return { data: validateResult(examBankListSchema, await getBankList(filter), 'INTERNAL_ERROR') };
  });
}
