import { ResultSection } from '@/components/ui/ResultSection';
import type { TextResultProps } from '@/types';
export function ModelEssay({ text }: TextResultProps) { return <ResultSection title="参考范文"><p className="whitespace-pre-wrap font-serif leading-9">{text}</p></ResultSection>; }
