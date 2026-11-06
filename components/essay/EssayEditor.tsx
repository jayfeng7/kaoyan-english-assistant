'use client';
import { Textarea } from '@/components/ui/Textarea';
import { reflowEssay } from '@/lib/utils/essay-layout';

export function EssayEditor({ label, value, disabled, characterLimit = 8000, onTextChange }: { label: string; value: string; disabled?: boolean; characterLimit?: number; onTextChange: (value: string) => void }) {
  return <Textarea label={label} value={value} disabled={disabled} characterLimit={characterLimit} rows={8} className="essay-editor" onChange={event => onTextChange(event.target.value)} onPaste={event => {
    const pasted = event.clipboardData.getData('text/plain');
    if (!/[\r\n]/.test(pasted)) return;
    event.preventDefault(); const field = event.currentTarget;
    const inserted = reflowEssay(pasted); const start = field.selectionStart;
    onTextChange(value.slice(0, start) + inserted + value.slice(field.selectionEnd));
    requestAnimationFrame(() => { if (field.isConnected) field.setSelectionRange(start + inserted.length, start + inserted.length); });
  }} />;
}
