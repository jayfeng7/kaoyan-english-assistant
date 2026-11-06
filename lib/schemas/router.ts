import { z } from 'zod';
import { boundedText, historyTypeSchema } from './common';
import type { RouteRequest, RouterResult, Schema } from '@/types';
export const routeRequestSchema = z.object({ input: boundedText(8000) }) satisfies Schema<RouteRequest>;
export const routerResultSchema = z.object({ agent: historyTypeSchema, confidence: z.number().finite().min(0).max(1), reason: z.string().min(1) }) satisfies Schema<RouterResult>;
