const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
  nbsp: ' ',
};

/**
 * Turns provider text that may carry HTML (older TVmaze summaries) into plain
 * text. Render the result as text, never with v-html: it may contain `<`.
 */
export function toPlainText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/<br\s*\/?>|<\/p>/gi, '\n')
    .replace(/<\/?[a-z!][^>]*>/gi, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] !== '#') return HTML_ENTITIES[code.toLowerCase()] ?? entity;
      const point = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isInteger(point) && point > 0 && point <= 0x10FFFF ? String.fromCodePoint(point) : entity;
    })
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}
