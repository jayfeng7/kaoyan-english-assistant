import { essayParagraphs } from '@/lib/utils/essay-layout';

export function EssayProse({ text }: { text: string }) {
  return <div className="essay-prose">{essayParagraphs(text).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>;
}
