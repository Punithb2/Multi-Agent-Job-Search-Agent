// Kinds of tailored-resume lines that can be put back to the original wording in
// place. Headings, entry lines, and contact details are laid out differently from
// the original PDF text, so those are fixed in the editor instead.
export const REVERTIBLE_KINDS = new Set(['bullet', 'text']);

const clean = (s) => (s || '').replace(/\r/g, '').trim();
const stripBullet = (s) => clean(s).replace(/^[•●▪◦‣∙\-*]\s*/, '').trim();

/** Index of an item's line in the markdown, or -1 if the line cannot be found. */
function findLine(lines, item) {
  if (!item) return -1;
  const targetRaw = clean(item.raw);
  const targetTailored = stripBullet(item.tailored || item.raw);

  // 1. Check exact expected line index first
  if (typeof item.line === 'number' && item.line >= 0 && item.line < lines.length) {
    if (clean(lines[item.line]) === targetRaw) return item.line;
    if (targetTailored && stripBullet(lines[item.line]) === targetTailored) return item.line;
  }

  // 2. Search anywhere by clean raw content
  if (targetRaw) {
    const idx = lines.findIndex((l) => clean(l) === targetRaw);
    if (idx !== -1) return idx;
  }

  // 3. Search anywhere by plain bullet/unit text
  if (targetTailored) {
    const idx = lines.findIndex((l) => stripBullet(l) === targetTailored);
    if (idx !== -1) return idx;
  }

  // 4. Search by substring prefix (for long bullets where minor edits occurred)
  if (targetTailored && targetTailored.length > 20) {
    const prefix = targetTailored.slice(0, 30);
    const idx = lines.findIndex((l) => stripBullet(l).startsWith(prefix));
    if (idx !== -1) return idx;
  }

  return -1;
}

/**
 * The tailored markdown with one review fix applied: a reworded line put back to
 * the original wording, or a new line removed. Returns null if the line is gone.
 */
export function applyFix(markdown, item, fix) {
  const normalized = (markdown || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const index = findLine(lines, item);
  if (index === -1) return null;

  if (fix === 'remove') {
    lines.splice(index, 1);
    return lines.join('\n');
  }

  const raw = clean(lines[index]);
  const prefixMatch = raw.match(/^\s*(?:[-*] |[•●▪◦‣∙]\s*)?/);
  const prefix = (prefixMatch && prefixMatch[0]) || (item.kind === 'bullet' ? '- ' : '');
  let text = clean(item.original).replace(/^[•●▪◦‣∙\-*]\s*/, '').trim();

  // Keep a bold label such as "**Languages** — ..." when the raw line starts with one
  const label = raw.slice(prefix.length).match(/^\*\*([^*]+)\*\*/);
  if (label && text.startsWith(label[1])) {
    text = `**${label[1]}**${text.slice(label[1].length)}`;
  }
  lines[index] = `${prefix}${text}`;
  return lines.join('\n');
}

/** Stable identity for a review item, for dismissing it from the list. */
export function changeKey(item) {
  return `${item.type}|${clean(item.raw)}|${clean(item.original)}`;
}
