import 'server-only';
import type { JsonRepairResult } from '@/types';

function simpleRepair(input: string): string {
  let output = ''; let quoted = false; let escaped = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (char === undefined) break;
    if (quoted) {
      output += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; output += char; continue; }
    if (char === ',' && /^\s*[}\]]/.test(input.slice(index + 1))) continue;
    output += char;
    if (char === '{' || char === ',') {
      const key = /^(\s*)([A-Za-z_$][\w$-]*)(\s*:)/.exec(input.slice(index + 1));
      if (key) { output += `${key[1]}"${key[2]}"${key[3]}`; index += key[0].length; }
    }
  }
  return output;
}

// 模型偶尔在字符串值里输出真实换行/制表符，JSON.parse 会整份失败；此处只做确定性的转义修复。
function escapeControlChars(input: string): string {
  let output = ''; let quoted = false; let escaped = false;
  for (const char of input) {
    if (quoted) {
      if (escaped) { output += char; escaped = false; continue; }
      if (char === '\\') { output += char; escaped = true; continue; }
      if (char === '"') { quoted = false; output += char; continue; }
      if (char === '\n') { output += '\\n'; continue; }
      if (char === '\r') { output += '\\r'; continue; }
      if (char === '\t') { output += '\\t'; continue; }
      output += char; continue;
    }
    if (char === '"') quoted = true;
    output += char;
  }
  return output;
}

// Some completions append a closing brace after an already complete root.
// Only discard delimiter-only suffixes; never truncate another value or field.
function trimExtraClosers(input: string): string | undefined {
  const stack: string[] = []; let quoted = false; let escaped = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      const expected = char === '}' ? '{' : '[';
      if (stack.pop() !== expected) return undefined;
      if (stack.length === 0) {
        const suffix = input.slice(index + 1);
        return /^[\s}\]]*$/u.test(suffix) ? input.slice(0, index + 1) : undefined;
      }
    }
  }
  return undefined;
}

export function repairJson(text: string): JsonRepairResult {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const first = cleaned.indexOf('{'); const last = cleaned.lastIndexOf('}');
  if (first < 0 || last < first) return { success: false, text };
  const candidate = cleaned.slice(first, last + 1);
  const trimmed = trimExtraClosers(candidate);
  const candidates = trimmed && trimmed !== candidate ? [candidate, trimmed] : [candidate];
  for (const value of candidates) for (const attempt of [value, escapeControlChars(value), simpleRepair(value), simpleRepair(escapeControlChars(value))]) {
    try {
      const data: unknown = JSON.parse(attempt);
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) return { success: true, data };
    } catch { /* Only deterministic JSON repair is allowed; never evaluate generated code. */ }
  }
  return { success: false, text };
}
