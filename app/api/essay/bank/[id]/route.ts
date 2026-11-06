import 'server-only';
import { getEssayBankItem } from '@/lib/essay-bank';
import { essayBankItemSchema } from '@/lib/schemas/essay-bank';
import { runApi, validateResult } from '@/lib/utils/api';
import type { BankRouteContext } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: BankRouteContext): Promise<Response> {
  return runApi(request, async () => {
    const { id } = await context.params;
    return { data: validateResult(essayBankItemSchema, await getEssayBankItem(id), 'INTERNAL_ERROR') };
  });
}
