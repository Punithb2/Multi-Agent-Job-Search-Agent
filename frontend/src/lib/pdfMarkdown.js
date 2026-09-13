import { fromMarkdown } from 'mdast-util-from-markdown';

/** Parse generated markdown with the same parser the on-screen view uses. */
export function parseMarkdown(markdown) {
  return fromMarkdown(markdown || '');
}

/** Plain text of any markdown node, keeping soft line breaks. */
export function plainText(node) {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  if (node.type === 'break') return '\n';
  return (node.children || []).map(plainText).join('');
}

/** Inline markdown nodes → pdfmake text runs. */
export function inlineRuns(nodes = [], marks = {}, linkColor = '#4d46db') {
  return nodes.flatMap((node) => {
    switch (node.type) {
      case 'text':
        return [{ text: node.value, ...marks }];
      case 'strong':
        return inlineRuns(node.children, { ...marks, bold: true }, linkColor);
      case 'emphasis':
        return inlineRuns(node.children, { ...marks, italics: true }, linkColor);
      case 'delete':
        return inlineRuns(node.children, { ...marks, decoration: 'lineThrough' }, linkColor);
      case 'inlineCode':
        return [{ text: node.value, ...marks }];
      case 'link':
        return inlineRuns(node.children, { ...marks, color: linkColor, link: node.url }, linkColor);
      case 'break':
        return [{ text: '\n' }];
      case 'image':
        return node.alt ? [{ text: node.alt, ...marks }] : [];
      case 'html':
        return [{ text: node.value.replace(/<[^>]+>/g, ''), ...marks }];
      default:
        return node.children ? inlineRuns(node.children, marks, linkColor) : [];
    }
  });
}

export function horizontalRule(width, color, lineWidth = 0.6, margin = [0, 6, 0, 10]) {
  return { canvas: [{ type: 'line', x1: 0, y1: 0, x2: width, y2: 0, lineWidth, lineColor: color }], margin };
}

export const PAGE_WIDTHS = { A4: 595.28, LETTER: 612 };

// Fonts such as Carlito and Lato join letter pairs like "ti" and "ft" into one
// ligature glyph. It looks right, but the PDF's text layer then maps that glyph
// back to a single letter, so copied or ATS-parsed text reads "Applicaton" and
// "Sofware". Switching ligatures off keeps every letter extractable, and kerning
// stays on.
export const NO_LIGATURES = { liga: false, clig: false, dlig: false, hlig: false };
