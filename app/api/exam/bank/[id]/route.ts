import 'server-only';
import { getBankItem } from '@/lib/exam-bank';
import { examBankItemSchema } from '@/lib/schemas/exam';
import { runApi, validateResult } from '@/lib/utils/api';
import type { BankRouteContext } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: BankRouteContext): Promise<Response> {
  return runApi(request, async () => {
    const { id } = await context.params;
    return { data: validateResult(examBankItemSchema, await getBankItem(id), 'INTERNAL_ERROR') };
  });
}
