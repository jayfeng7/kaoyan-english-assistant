import { ResultSection } from './ResultSection';
import { Markdown } from './Markdown';
import type { TextResultProps } from '@/types';
export function TextFallbackView({ text }: TextResultProps) { return <ResultSection title="分析结果"><p className="text-sm text-muted">本次结果以文本形式展示。</p><Markdown content={text} /></ResultSection>; }
