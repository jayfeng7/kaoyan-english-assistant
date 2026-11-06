import { ResultSection } from '@/components/ui/ResultSection';
import { Badge } from '@/components/ui/Badge';
import type { QuestionAnalysisProps } from '@/types';
export function QuestionAnalysis({ value }: QuestionAnalysisProps) { return <ResultSection title="题目定位与思路"><div className="flex flex-wrap gap-2"><Badge>{value.questionType}</Badge><Badge tone="accent">参考答案：{value.answer}</Badge></div><h3 className="font-semibold">原文定位</h3><p className="whitespace-pre-wrap">{value.locating}</p><h3 className="font-semibold">解题思路</h3><p className="whitespace-pre-wrap">{value.reasoning}</p></ResultSection>; }
