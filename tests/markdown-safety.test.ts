import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SafeMarkdown from '@/components/ui/SafeMarkdown';
import { Markdown } from '@/components/ui/Markdown';

describe('deferred markdown safety', () => {
  it('escapes content while the formatter is loading', () => {
    const html = renderToStaticMarkup(createElement(Markdown, { content: '<script>alert(1)</script>正文' }));
    expect(html).not.toContain('<script>'); expect(html).toContain('正文');
  });
  it('keeps sanitization, safe links and blocked remote images after loading', () => {
    const html = renderToStaticMarkup(createElement(SafeMarkdown, { content: '<script>alert(1)</script>\n\n[bad](javascript:alert)\n\n![image](https://example.com/a.png)\n\n[good](https://example.com)' }));
    expect(html).not.toContain('<script'); expect(html).not.toContain('javascript:'); expect(html).not.toContain('<img'); expect(html).toContain('rel="noopener noreferrer"');
  });
});
