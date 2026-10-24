import { DEFAULT_FONT, FONT_LINE_RATIOS, resolveFontKey } from './pdfFonts';
import { NO_LIGATURES, PAGE_WIDTHS, horizontalRule, inlineRuns, parseMarkdown, plainText, splitHeadingChildren } from './pdfMarkdown';

// Used when no style could be read from the uploaded resume (or for documents
// generated before styles were captured): a clean, ATS-friendly layout.
const DEFAULT_STYLE = {
  page_size: 'A4',
  margin: 50,
  body: { font: DEFAULT_FONT, size: 10.5, color: '#1f2a3d', align: 'justify' },
  name: { font: DEFAULT_FONT, size: 21, bold: true, uppercase: false, align: 'left', color: '#16243d' },
  heading: { font: DEFAULT_FONT, size: 11.5, bold: true, uppercase: true, color: '#1f3a5f', rule: true, rule_color: '#c9d2e0' },
  accent: '#1f3a5f',
};

/** Merge a style read from the resume over the defaults, resolving fonts. */
export function resolveStyle(style) {
  const source = style || {};
  const body = { ...DEFAULT_STYLE.body, ...source.body };
  const bodyAlign = source.body?.align || DEFAULT_STYLE.body.align || 'justify';
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
  const isOriginalLinkColor = Boolean(source.link?.color);
  const linkColor = source.link?.color || source.accent || '#2563eb';
  const linkUnderline = Boolean(source.link?.underline);

  return {
    matched: hasStyle,
    pageSize: source.page_size === 'LETTER' ? 'LETTER' : 'A4',
    margin: Number(source.margin) || DEFAULT_STYLE.margin,
    accent: source.accent || (hasStyle ? null : DEFAULT_STYLE.accent),
    link: {
      color: linkColor,
      underline: linkUnderline,
      isColored: true,
    },
    lineHeight,
    body: { ...body, fontKey: bodyFontKey, color: body.color || DEFAULT_STYLE.body.color, align: bodyAlign },
    name: { ...name, fontKey: hasStyle ? resolveFontKey(name.font || body.font) : DEFAULT_FONT, color: name.color || body.color || DEFAULT_STYLE.name.color },
    heading: {
      ...heading,
      fontKey: hasStyle ? resolveFontKey(heading.font || body.font) : DEFAULT_FONT,
      color: heading.color || body.color || DEFAULT_STYLE.heading.color,
      ruleColor: heading.rule_color || heading.color || source.accent || '#9aa5b5',
      ruleWidth: Math.min(2.5, Math.max(0.5, Number(heading.rule_width) || 0.9)),
    },
  };
}


/** A paragraph that is nothing but one italic span, e.g. "*Headline*". */
function isItalicLine(node) {
  const children = (node.children || []).filter((child) => !(child.type === 'text' && !child.value.trim()));
  return children.length === 1 && children[0].type === 'emphasis';
}

/** Check if paragraph is a labeled skill line (e.g. "**Languages:** Python"). */
function isSkillsLine(node) {
  const firstChild = (node.children || [])[0];
  if (!firstChild) return false;
  if (firstChild.type === 'strong') {
    const text = plainText(firstChild);
    return text.includes(':') || text.endsWith(':');
  }
  return false;
}

// Progressively tighter layouts, used when the tailored resume runs longer than
// the original: first the gaps between blocks shrink, then the text itself.
export const DENSITY_LEVELS = [
  { gap: 1, fontDelta: 0, lineHeight: 1 },
  { gap: 0.7, fontDelta: 0, lineHeight: 0.97 },
  { gap: 0.55, fontDelta: -0.5, lineHeight: 0.95 },
  { gap: 0.45, fontDelta: -1, lineHeight: 0.93 },
];

export function buildResumeDocument({ markdown, style, density = 0 }) {
  const s = resolveStyle(style);
  const level = DENSITY_LEVELS[Math.min(density, DENSITY_LEVELS.length - 1)];
  const g = (points) => Math.round(points * level.gap * 10) / 10;
  const bodySize = Math.max(8.5, s.body.size + level.fontDelta);
  const headingSize = Math.max(bodySize, s.heading.size + level.fontDelta);
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

    // Lines between the name and the first section: an italic headline, then
    // the contact details.
    if (nameSeen && !sectionSeen && node.type === 'paragraph') {
      const headline = isItalicLine(node);
      content.push({
        text: inlineRuns(node.children, {}, { ...s.link, color: muted, underline: false }),
        color: muted,
        alignment: s.name.align,
        fontSize: headline ? bodySize + 2 : Math.min(bodySize, 9.5),
        margin: [0, headline ? g(1) : 0, 0, headline ? g(4) : g(2)],
      });
      continue;
    }

    if (node.type === 'heading' && node.depth <= 2) {
      sectionSeen = true;
      const text = plainText(node).trim();
      const title = {
        text: s.heading.uppercase ? text.toUpperCase() : text,
        font: s.heading.fontKey,
        fontSize: headingSize,
        bold: s.heading.bold,
        color: s.heading.color,
        lineHeight: 1,
        margin: [0, g(8), 0, s.heading.rule ? 0 : g(3)],
      };
      content.push(s.heading.rule
        ? { stack: [title, horizontalRule(contentWidth, s.heading.ruleColor, s.heading.ruleWidth, [0, 2, 0, g(4)])], unbreakable: true }
        : title);
      continue;
    }

    if (node.type === 'heading') {
      const { left, rightNodes, hasRight } = splitHeadingChildren(node.children);
      content.push(
        hasRight
          ? {
              columns: [
                { text: inlineRuns(left, { bold: true }, s.link), width: '*' },
                { text: inlineRuns(rightNodes, {}, s.link), width: 'auto', alignment: 'right', color: muted },
              ],
              columnGap: 12,
              margin: [0, g(5), 0, 0],
            }
          : {
              text: inlineRuns(left, { bold: true }, s.link),
              margin: [0, g(5), 0, 0],
            }
      );
      continue;
    }

    if (node.type === 'paragraph') {
      // The italic second line of an entry (role, degree) sits tight under it.
      const secondLine = isItalicLine(node);
      const isSkill = isSkillsLine(node);
      const shouldJustify = !secondLine && !isSkill && (s.body.align !== 'left');
      content.push({
        text: inlineRuns(node.children, {}, s.link),
        alignment: shouldJustify ? 'justify' : 'left',
        margin: [0, 0, 0, secondLine ? g(1) : g(4)],
      });
      continue;
    }

    if (node.type === 'list') {
      const isJustified = s.body.align !== 'left';
      const items = node.children.map((item) => ({
        text: (item.children || []).flatMap((child) => (child.type === 'paragraph' ? inlineRuns(child.children, {}, s.link) : [{ text: plainText(child) }])),
        alignment: isJustified ? 'justify' : 'left',
        margin: [0, 0, 0, g(0.5)],
      }));
      content.push({ ...(node.ordered ? { ol: items } : { ul: items }), margin: [0, g(1), 0, g(4)] });
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
      defaultStyle: { font: s.body.fontKey, fontSize: bodySize, lineHeight: s.lineHeight * level.lineHeight, color: s.body.color, fontFeatures: NO_LIGATURES },
      styles: {
        link: {
          color: s.link.color,
          ...(s.link.underline ? { decoration: 'underline' } : {}),
        },
      },
    },
    fonts: [s.body.fontKey, s.name.fontKey, s.heading.fontKey],
    matched: s.matched,
    targetPages: Number(style?.pages) || null,
    density,
  };
}
