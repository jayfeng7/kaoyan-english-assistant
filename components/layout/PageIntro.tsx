import type { PageIntroProps } from '@/types';

export function PageIntro({ eyebrow, title, description, children, compact }: PageIntroProps) {
  return <div className={compact ? 'mb-5 space-y-2' : 'mb-6 space-y-2 sm:mb-8'}>{!compact && <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent/80">{eyebrow}</p>}<h1 className={`${compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'} font-semibold leading-tight`}>{title}</h1><p className="max-w-2xl text-sm leading-7 text-muted">{description}</p>{children}</div>;
}
