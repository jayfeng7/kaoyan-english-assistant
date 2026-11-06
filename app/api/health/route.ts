import 'server-only';
import { getHealthData } from '@/lib/health';
import { runApi } from '@/lib/utils/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request): Promise<Response> {
  return runApi(request, async () => ({ data: await getHealthData() }));
}
