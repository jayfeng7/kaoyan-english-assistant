import 'server-only';
import { getProviders } from '@/lib/llm/providers';
import { getBankCount } from '@/lib/exam-bank';
import { healthDataSchema } from '@/lib/schemas/api';
import { validateResult } from '@/lib/utils/api';
import type { HealthData } from '@/types';

export async function getHealthData(): Promise<HealthData> {
  return validateResult(healthDataSchema, {
    status: 'ok', providers: getProviders().map((provider) => provider.id),
    ocr: Boolean(process.env.BAIDU_OCR_API_KEY?.trim() && process.env.BAIDU_OCR_SECRET_KEY?.trim()),
    examBankCount: await getBankCount(), time: Date.now(),
  }, 'INTERNAL_ERROR');
}
