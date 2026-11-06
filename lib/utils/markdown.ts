export function toPlainText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_#~>]/g, '').replace(/\s+/g, ' ').trim();
}
