import { DEFAULT_FONT, FONT_LINE_RATIOS, resolveFontKey } from './pdfFonts';
import { NO_LIGATURES, PAGE_WIDTHS, horizontalRule, inlineRuns, parseMarkdown, plainText } from './pdfMarkdown';

// Used when no style could be read from the uploaded resume (or for documents
// generated before styles were captured): a clean, ATS-friendly layout.
const DEFAULT_STYLE = {
  page_size: 'A4',
  margin: 50,
  body: { font: DEFAULT_FONT, size: 10.5, color: '#1f2a3d' },
  name: { font: DEFAULT_FONT, size: 21, bold: true, uppercase: false, align: 'left', color: '#16243d' },
  heading: { font: DEFAULT_FONT, size: 11.5, bold: true, uppercase: true, color: '#1f3a5f', rule: true, rule_color: '#c9d2e0' },
  accent: '#1f3a5f',
};

/** Merge a style read from the resume over the defaults, resolving fonts. */
export function resolveStyle(style) {
  const source = style || {};
  const body = { ...DEFAULT_STYLE.body, ...source.body };
  const name = { ...DEFAULT_STYLE.name, ...source.name };
  const heading = source.heading
    ? { ...DEFAULT_STYLE.heading, ...source.heading }
    : { ...DEFAULT_STYLE.heading, font: body.font };
  const hasStyle = Boolean(style);
  const bodyFontKey = hasStyle ? resolveFontKey(body.font) : DEFAULT_FONT;
  // Reproduce the original's measured spacing in whichever font stands in for it.
  const naturalRatio = FONT_LINE_RATIOS[bodyFontKey] || 1.17;
  const lineHeight = source.line_spacing
    ? Math.min(1.6, Math.max(0.9, source.line_spacing / naturalRatio))
    : 1.12;
  return {
    matched: hasStyle,
    pageSize: source.page_size === 'LETTER' ? 'LETTER' : 'A4',
    margin: Number(source.margin) || DEFAULT_STYLE.margin,
    accent: source.accent || (hasStyle ? null : DEFAULT_STYLE.accent),
    lineHeight,
    body: { ...body, fontKey: bodyFontKey, color: body.color || DEFAULT_STYLE.body.color },
    name: { ...name, fontKey: hasStyle ? resolveFontKey(name.font || body.font) : DEFAULT_FONT, color: name.color || body.color || DEFAULT_STYLE.name.color },
    heading: {
      ...heading,
      fontKey: hasStyle ? resolveFontKey(heading.font || body.font) : DEFAULT_FONT,
      color: heading.color || body.color || DEFAULT_STYLE.heading.color,
      ruleColor: heading.rule_color || heading.color || source.accent || '#9aa5b5',
    },
  };
}

/** Split "Role, Organization | Jan 2024 – Jun 2024" into its left and right parts. */
function splitEntry(text) {
  const index = text.lastIndexOf(' | ');
  if (index === -1) return [text, ''];
  return [text.slice(0, index).trim(), text.slice(index + 3).trim()];
}

export function buildResumeDocument({ markdown, style }) {
  const s = resolveStyle(style);
  const contentWidth = PAGE_WIDTHS[s.pageSize] - s.margin * 2;
  const muted = s.body.color;
  const content = [];
  let nameSeen = false;
  let sectionSeen = false;

  for (const node of parseMarkdown(markdown).children) {
    if (node.type === 'heading' && node.depth === 1 && !nameSeen) {
      nameSeen = true;
      const text = plainText(node).trim();
      content.push({
        text: s.name.uppercase ? text.toUpperCase() : text,
        font: s.name.fontKey,
        fontSize: s.name.size,
        bold: s.name.bold,
        color: s.name.color,
        alignment: s.name.align,
        lineHeight: 1,
        margin: [0, 0, 0, 2],
      });
      continue;
    }

    // Lines between the name and the first section are the contact details.
    if (nameSeen && !sectionSeen && node.type === 'paragraph') {
      content.push({
        text: inlineRuns(node.children, {}, s.accent || muted),
        color: muted,
        alignment: s.name.align,
        margin: [0, 0, 0, 2],
      });
      continue;
    }

    if (node.type === 'heading' && node.depth <= 2) {
      sectionSeen = true;
      const text = plainText(node).trim();
      const title = {
        text: s.heading.uppercase ? text.toUpperCase() : text,
        font: s.heading.fontKey,
        fontSize: s.heading.size,
        bold: s.heading.bold,
        color: s.heading.color,
        lineHeight: 1,
        margin: [0, 10, 0, s.heading.rule ? 0 : 3],
      };
      content.push(s.heading.rule
        ? { stack: [title, horizontalRule(contentWidth, s.heading.ruleColor, 0.9, [0, 2, 0, 5])], unbreakable: true }
        : title);
      continue;
    }

    if (node.type === 'heading') {
      const [left, right] = splitEntry(plainText(node).trim());
      content.push({
        columns: [
          { text: left, bold: true, width: '*' },
          ...(right ? [{ text: right, width: 'auto', alignment: 'right', italics: true, color: muted }] : []),
        ],
        columnGap: 12,
        margin: [0, 5, 0, 2],
      });
      continue;
    }

    if (node.type === 'paragraph') {
      content.push({ text: inlineRuns(node.children, {}, s.accent || muted), margin: [0, 0, 0, 4] });
      continue;
    }

    if (node.type === 'list') {
      const items = node.children.map((item) => ({
        text: (item.children || []).flatMap((child) => (child.type === 'paragraph' ? inlineRuns(child.children, {}, s.accent || muted) : [{ text: plainText(child) }])),
        margin: [0, 0, 0, 0.5],
      }));
      content.push({ ...(node.ordered ? { ol: items } : { ul: items }), margin: [0, 1, 0, 4] });
      continue;
    }

    if (node.type === 'thematicBreak') {
      content.push(horizontalRule(contentWidth, s.heading.ruleColor));
    }
  }

  return {
    document: {
      pageSize: s.pageSize,
      pageMargins: [s.margin, s.margin, s.margin, s.margin],
      content,
      defaultStyle: { font: s.body.fontKey, fontSize: s.body.size, lineHeight: s.lineHeight, color: s.body.color, fontFeatures: NO_LIGATURES },
    },
    fonts: [s.body.fontKey, s.name.fontKey, s.heading.fontKey],
    matched: s.matched,
  };
}
