// Kinds of tailored-resume lines that can be put back to the original wording in
// place. Headings, entry lines, and contact details are laid out differently from
// the original PDF text, so those are fixed in the editor instead.
export const REVERTIBLE_KINDS = new Set(['bullet', 'text']);

/** Index of an item's line in the markdown, or -1 if the resume was edited since. */
function findLine(lines, item) {
  if (lines[item.line] === item.raw) return item.line;
  return lines.indexOf(item.raw);
}

/**
 * The tailored markdown with one review fix applied: a reworded line put back to
 * the original wording, or a new line removed. Returns null if the line is gone.
 */
export function applyFix(markdown, item, fix) {
  const lines = markdown.split('\n');
  const index = findLine(lines, item);
  if (index === -1) return null;

  if (fix === 'remove') {
    lines.splice(index, 1);
    return lines.join('\n');
  }

  const raw = lines[index];
  const prefix = raw.match(/^\s*(?:[-*] |[•●▪◦‣∙]\s*)?/)[0];
  let text = item.original;
  // Keep a bold label such as "**Languages** — ..." when the original starts with it.
  const label = raw.slice(prefix.length).match(/^\*\*([^*]+)\*\*/);
  if (label && text.startsWith(label[1])) text = `**${label[1]}**${text.slice(label[1].length)}`;
  lines[index] = `${prefix}${text}`;
  return lines.join('\n');
}

/** Stable identity for a review item, for dismissing it from the list. */
export function changeKey(item) {
  return `${item.type}|${item.raw}|${item.original}`;
}
