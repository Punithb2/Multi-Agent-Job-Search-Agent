import { NO_LIGATURES, PAGE_WIDTHS, horizontalRule, inlineRuns, parseMarkdown, plainText } from './pdfMarkdown';
import { resolveStyle } from './pdfResume';

const SALUTATION = /^(dear|hello|hi|greetings|to whom)\b/i;
const CLOSING = /^(sincerely|yours sincerely|yours faithfully|yours truly|best regards|kind regards|warm regards|warmest regards|regards|respectfully|with gratitude|thank you|thanks|best|cheers)[,.!]?$/i;

const lines = (node) => plainText(node).split('\n').map((line) => line.trim()).filter(Boolean);

/**
 * Split a generated letter into letterhead, greeting, body, and sign-off.
 * Returns null when the letter does not follow the expected shape, so the caller
 * can fall back to a plain layout rather than mislabel parts of it.
 */
export function parseCoverLetter(markdown) {
  const blocks = parseMarkdown(markdown).children.filter((node) => plainText(node).trim());
  const salutationIndex = blocks.findIndex((node) => SALUTATION.test(plainText(node).trim()));
  if (salutationIndex === -1) return null;

  const header = blocks.slice(0, salutationIndex).flatMap(lines);
  let closingIndex = -1;
  for (let index = blocks.length - 1; index > salutationIndex; index -= 1) {
    if (CLOSING.test(lines(blocks[index])[0] || '')) { closingIndex = index; break; }
  }

  const salutationLines = lines(blocks[salutationIndex]);
  const closingLines = closingIndex === -1 ? [] : blocks.slice(closingIndex).flatMap(lines);
  const body = blocks.slice(salutationIndex + 1, closingIndex === -1 ? blocks.length : closingIndex);

  return {
    name: header[0] || '',
    contact: header.slice(1).flatMap((line) => line.split(/\s*[|•·]\s*/)).map((item) => item.trim()).filter(Boolean),
    salutation: salutationLines[0],
    // A greeting that ran straight into the first paragraph keeps that text.
    salutationRest: salutationLines.slice(1).join(' '),
    body,
    closing: closingLines[0] || '',
    signature: closingLines.slice(1),
  };
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function buildCoverLetterDocument({ markdown, style, job }) {
  const letter = parseCoverLetter(markdown);
  if (!letter) return null;

  const s = resolveStyle(style);
  const margin = Math.max(s.margin, 56);
  const contentWidth = PAGE_WIDTHS[s.pageSize] - margin * 2;
  // The letterhead rule echoes the resume: its accent colour, else its heading rule.
  const ruleColor = s.accent || s.heading.ruleColor;
  const bodySize = Math.min(11.5, Math.max(10.5, s.body.size + 0.5));
  const align = s.name.align;

  const content = [];
  if (letter.name) {
    content.push({
      text: s.name.uppercase ? letter.name.toUpperCase() : letter.name,
      font: s.name.fontKey,
      fontSize: Math.min(24, Math.max(18, s.name.size)),
      bold: s.name.bold,
      color: s.name.color,
      alignment: align,
    });
  }
  if (letter.contact.length) {
    content.push({ text: letter.contact.join('   |   '), fontSize: bodySize - 1.5, color: s.body.color, alignment: align, margin: [0, 4, 0, 0] });
  }
  content.push(horizontalRule(contentWidth, ruleColor, 1, [0, 10, 0, 20]));

  content.push({ text: formatDate(), margin: [0, 0, 0, 14] });

  const recipient = [job?.company, job?.location].filter(Boolean);
  if (recipient.length) {
    content.push({ stack: [{ text: 'Hiring Team', bold: true }, ...recipient.map((line) => ({ text: line }))], margin: [0, 0, 0, 14] });
  }
  if (job?.title) {
    content.push({ text: `Re: Application for ${job.title}`, bold: true, margin: [0, 0, 0, 14] });
  }

  content.push({ text: letter.salutation, margin: [0, 0, 0, 10] });
  if (letter.salutationRest) {
    content.push({ text: letter.salutationRest, alignment: 'justify', margin: [0, 0, 0, 10] });
  }
  for (const block of letter.body) {
    content.push({
      text: block.type === 'paragraph' ? inlineRuns(block.children, {}, ruleColor) : plainText(block),
      alignment: 'justify',
      margin: [0, 0, 0, 10],
    });
  }

  if (letter.closing) {
    content.push({ text: letter.closing, margin: [0, 8, 0, 0], unbreakable: true });
    const signer = letter.signature[0] || letter.name;
    if (signer) {
      content.push({ text: signer, bold: true, font: s.name.fontKey, margin: [0, 26, 0, 0] });
      for (const extra of letter.signature.slice(1)) content.push({ text: extra, color: s.body.color });
    }
  }

  return {
    document: {
      pageSize: s.pageSize,
      pageMargins: [margin, margin, margin, margin],
      content,
      defaultStyle: { font: s.body.fontKey, fontSize: bodySize, lineHeight: 1.38, color: s.body.color, fontFeatures: NO_LIGATURES },
    },
    fonts: [s.body.fontKey, s.name.fontKey],
    matched: s.matched,
  };
}
