// Reflow OCR line endings without correcting, deleting or dehyphenating words.
// Blank lines and letter/notice conventions remain paragraph boundaries.
export function essayParagraphs(text: string): string[] {
  const paragraphs: string[] = []; let current: string[] = [];
  const flush = () => { if (current.length) paragraphs.push(current.join(' ')); current = []; };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const standalone = /^(?:Dear\b.*[,，:]|(?:Yours|Sincerely|Best regards|Kind regards)\b.*|(?:Li|Zhang) Ming[,.]?|Notice|Announcement|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s]+\d.*)$/i.test(line);
    if (standalone) { flush(); paragraphs.push(line); } else current.push(line);
  }
  flush(); return paragraphs;
}

export function reflowEssay(text: string): string { return essayParagraphs(text).join('\n\n'); }
