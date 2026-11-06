import type { PageContainerProps } from '@/types';

export function PageContainer({ children, className = '', width = 'wide' }: PageContainerProps) {
  return <main id="main-content" className={`mx-auto min-h-[calc(100dvh-56px)] ${width === 'reading' ? 'max-w-4xl' : 'max-w-7xl'} px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:pt-8 lg:min-h-dvh lg:px-8 lg:pb-8 ${className}`}>{children}</main>;
}
