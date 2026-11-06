import { ResultSection } from '@/components/ui/ResultSection';
import type { TextResultProps } from '@/types';
export function ImprovedEssay({ text }: TextResultProps) { return <ResultSection title="改进版作文"><p className="whitespace-pre-wrap font-serif leading-9">{text}</p></ResultSection>; }
