'use client';

import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { MarkdownProps } from '@/types';

export default function SafeMarkdown({ content }: MarkdownProps) {
  return <ReactMarkdown skipHtml rehypePlugins={[rehypeSanitize]} components={{
    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    img: () => null,
  }}>{content}</ReactMarkdown>;
}
