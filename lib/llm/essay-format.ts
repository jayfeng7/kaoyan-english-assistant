import 'server-only';
import { repairJson } from '@/lib/utils/json-repair';
import type { JsonRepairResult } from '@/types';

// Repair only unescaped quotation marks inside response values. Keys, numbers,
// arrays and missing fields are never invented; the full exam schema still applies.
export function repairEssayJson(text: string): JsonRepairResult {
  const original = repairJson(text);
  if (original.success) return original;
  let output = ''; let quoted = false; let escaped = false; let key = false; let previous = '';
  const stack: string[] = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!;
    if (quoted) {
      if (escaped) { output += char; escaped = false; continue; }
      if (char === '\\') { output += char; escaped = true; continue; }
      if (char === '"') {
        const rest = text.slice(index + 1).trimStart();
        const boundary = !rest || /^[}\]]/u.test(rest) || (rest.startsWith(',') && (stack.at(-1) === '[' || /^,\s*"(?:\\.|[^"\\])*"\s*:/u.test(rest)));
        if (key || boundary) { quoted = false; previous = '"'; }
        else { output += '\\"'; continue; }
      }
      output += char; continue;
    }
    if (char === '"') { quoted = true; key = stack.at(-1) === '{' && (previous === '{' || previous === ','); }
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') stack.pop();
    if (!/\s/u.test(char)) previous = char;
    output += char;
  }
  return output !== text ? repairJson(output) : original;
}
