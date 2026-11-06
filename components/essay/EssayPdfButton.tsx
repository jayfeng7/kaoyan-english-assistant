'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { EssayData } from '@/types';

export function EssayPdfButton({ record, disabled }: { record: EssayData; disabled: boolean }) {
  const [exporting, setExporting] = useState(false); const { notify } = useToast();
  async function download() {
    if (exporting || disabled) return;
    setExporting(true);
    try {
      // Omit raw OCR, conversation and provider metadata; export the saved report only.
      const { ocrResult: _ocr, followUps: _followUps, provider: _provider, ...snapshot } = record;
      void _ocr; void _followUps; void _provider;
      const response = await fetch('/api/essay/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ record: snapshot }), signal: AbortSignal.timeout(60_000) });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('application/pdf')) throw new Error('PDF_EXPORT_FAILED');
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = '作文批改报告.pdf';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { notify('PDF 导出失败，请重试。', 'error'); }
    finally { setExporting(false); }
  }
  return <Button variant="ghost" className="gap-1.5 px-2 sm:px-3" aria-label="导出批改报告 PDF" disabled={disabled} loading={exporting} onClick={() => { void download(); }}><Download aria-hidden="true" className="h-4 w-4" /><span>导出 PDF</span></Button>;
}
