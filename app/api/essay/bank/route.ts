import 'server-only';
import { listEssayBank } from '@/lib/essay-bank';
import { essayBankFilterSchema, essayBankListSchema } from '@/lib/schemas/essay-bank';
import { parseInput, runApi, validateResult } from '@/lib/utils/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  return runApi(request, async () => {
    const params = new URL(request.url).searchParams;
    const filter = parseInput(essayBankFilterSchema, { type: params.get('type') ?? undefined, composition: params.get('composition') ?? undefined, year: params.has('year') ? Number(params.get('year')) : undefined });
    return { data: validateResult(essayBankListSchema, await listEssayBank(filter), 'INTERNAL_ERROR') };
  });
}
