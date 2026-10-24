import { fromMarkdown } from 'mdast-util-from-markdown';

/**
 * Autolink raw URLs, common professional profiles, and emails so that
 * markdown renderers, PDF exporters, and Word document generators can
 * create active, clickable hyperlinks.
 */
export function autolinkMarkdown(markdown) {
  const text = String(markdown || '');
  if (!text) return '';

  // 1. Temporarily protect existing Markdown links [text](url) and images ![alt](url)
  const placeholders = [];
  const protectedText = text.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (match, prefix, url, suffix) => {
    let cleanUrl = url.trim();
    if (!/^(https?:\/\/|mailto:|tel:|#)/i.test(cleanUrl)) {
      cleanUrl = cleanUrl.includes('@') ? `mailto:${cleanUrl}` : `https://${cleanUrl}`;
    }
    placeholders.push(`${prefix}${cleanUrl}${suffix}`);
    return `@@LINK_SLOT_${placeholders.length - 1}@@`;
  });

  // 2. Autolink full URLs: https://... or http://...
  const urlRegex = /\bhttps?:\/\/[^\s<>()]+[^\s<>()`.,;:!?|)]/gi;
  let linked = protectedText.replace(urlRegex, (url) => `[${url}](${url})`);

  // 3. Autolink common professional profiles and www domains without protocol:
  // e.g. linkedin.com/in/..., github.com/..., gitlab.com/..., leetcode.com/..., www....
  const domainRegex = /(?<![@/\w])((?:www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+|(?:linkedin\.com\/(?:in|pub)\/|github\.com\/|gitlab\.com\/|leetcode\.com\/|hackerrank\.com\/|kaggle\.com\/|behance\.net\/|medium\.com\/@[a-z0-9_.-]+)[a-z0-9_.-]+(?:\/[a-z0-9_.-]*)*)[^\s<>()`.,;:!?|]*)/gi;
  linked = linked.replace(domainRegex, (match) => {
    const trailingPunct = (match.match(/[.,;:!?)]+$/) || [''])[0];
    const clean = trailingPunct ? match.slice(0, -trailingPunct.length) : match;
    return `[${clean}](https://${clean})${trailingPunct}`;
  });

  // 4. Autolink email addresses
  const emailRegex = /(?<![a-z0-9._%+-])([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})(?![a-z0-9._%+-])/gi;
  linked = linked.replace(emailRegex, (email) => `[${email}](mailto:${email})`);

  // 5. Restore protected markdown links
  return linked.replace(/@@LINK_SLOT_(\d+)@@/g, (_, index) => placeholders[Number(index)]);
}

/**
 * Models sometimes copy "•" bullets from a PDF resume instead of writing "- ".
 * Markdown doesn't treat those as list items, so convert them. Also autolink
 * raw URLs, professional handles, and emails. Applied to both the on-screen
 * view and PDF export, so they always agree.
 */
export function normalizeMarkdown(markdown) {
  let text = String(markdown || '');
  // Clean company line under job experience if written with bullet or loose asterisks:
  // e.g. "- * [PyGenicArc 🔗](url) *" or "* [PyGenicArc 🔗](url) *" -> "*[PyGenicArc 🔗](url)*"
  text = text.replace(/^[ \t]*[•●▪◦‣∙\-*]?\s*\*?\s*(\[[^\]]+\]\([^)]+\))[ \t]*\*?[ \t]*$/gm, '*$1*');
  const bulletNormalized = text.replace(/^([ \t]*)[•●▪◦‣∙]\s*/gm, '$1- ');
  return autolinkMarkdown(bulletNormalized);
}

/** Parse generated markdown with the same parser the on-screen view uses. */
export function parseMarkdown(markdown) {
  return fromMarkdown(normalizeMarkdown(markdown));
}

const DATE_OR_TIMELINE_REGEX =
  /\b(?:19|20)\d{2}\b|\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b|\b(?:Present|Current|Ongoing|Issued|Expected)\b|\b\d{1,2}[/.-]\d{2,4}\b|\b(?:Spring|Summer|Fall|Autumn|Winter)\s+\d{4}\b/i;

const DEMO_OR_LINK_REGEX =
  /^\s*(?:\[[^\]]*\]|\b(?:DEMO|Demo|demo|Code|GitHub|Github|GitLab|Gitlab|Live|Repo|Repository|Preview|Link|Website|App|Docs|Paper)\b)/i;

/** Plain text of any markdown node, keeping soft line breaks. */
export function plainText(node) {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  if (node.type === 'break') return '\n';
  return (node.children || []).map(plainText).join('');
}

/**
 * Split a heading's inline nodes (e.g. "### Job | 2024 | City") at the appropriate " | "
 * separator so date/location metadata can be right-aligned while keeping the role/project
 * title on the left.
 *
 * Project demo links (e.g. "### Project Name | [DEMO](url)") or repository badges must
 * stay inline with the title on the left and NOT be pushed to the far right margin.
 *
 * Returns { left: Array<node>, rightNodes: Array<node>, right: string, hasRight: boolean }.
 */
export function splitHeadingChildren(children = []) {
  const splitCandidates = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === 'text' && child.value.includes(' | ')) {
      let searchPos = 0;
      while (true) {
        const idx = child.value.indexOf(' | ', searchPos);
        if (idx === -1) break;

        const immediateAfter = child.value.slice(idx + 3);
        const nextNodes = children.slice(i + 1);
        const remainingText = [
          immediateAfter,
          ...nextNodes.map(plainText),
        ].join('').trim();

        const firstToken = immediateAfter.trim() || (nextNodes[0] ? plainText(nextNodes[0]).trim() : '');
        const isNextNodeLink = !immediateAfter.trim() && nextNodes[0] && nextNodes[0].type === 'link';
        const isDemo = isNextNodeLink || DEMO_OR_LINK_REGEX.test(firstToken);
        const hasDate = DATE_OR_TIMELINE_REGEX.test(remainingText);

        splitCandidates.push({
          nodeIndex: i,
          charIndex: idx,
          remainingText,
          isDemo,
          hasDate,
        });

        searchPos = idx + 3;
      }
    }
  }

  // Only split off into the right column if the right-hand segment represents
  // a date / timeline / location metadata block and is NOT a project demo link.
  const valid = splitCandidates.filter((c) => !c.isDemo && c.hasDate);
  const chosen = valid.length > 0 ? valid[0] : null;

  if (!chosen) {
    return { left: children, right: '', rightNodes: [], hasRight: false };
  }

  const left = [];
  const rightNodes = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (i < chosen.nodeIndex) {
      left.push(child);
    } else if (i === chosen.nodeIndex) {
      const before = child.value.slice(0, chosen.charIndex);
      const after = child.value.slice(chosen.charIndex + 3);
      if (before) left.push({ ...child, value: before });
      if (after) rightNodes.push({ ...child, value: after });
    } else {
      rightNodes.push(child);
    }
  }

  const right = rightNodes.map(plainText).join('').trim();
  return { left, right, rightNodes, hasRight: Boolean(right) };
}

/** Inline markdown nodes → pdfmake text runs. */
export function inlineRuns(nodes = [], marks = {}, linkStyle = '#1f2a3d') {
  const linkOpts = typeof linkStyle === 'string' ? { color: linkStyle } : (linkStyle || {});
  const linkColor = linkOpts.color || '#1f2a3d';
  const linkUnderline = Boolean(linkOpts.underline);

  return nodes.flatMap((node) => {
    switch (node.type) {
      case 'text': {
        const val = String(node.value || '');
        if (/[↗🔗]/u.test(val)) {
          const parts = [];
          const regex = /([↗🔗])/gu;
          let lastIdx = 0;
          let match;
          while ((match = regex.exec(val)) !== null) {
            if (match.index > lastIdx) {
              parts.push({ text: val.slice(lastIdx, match.index), ...marks });
            }
            parts.push({ text: match[1], font: 'ResumeIcons', ...marks });
            lastIdx = regex.lastIndex;
          }
          if (lastIdx < val.length) {
            parts.push({ text: val.slice(lastIdx), ...marks });
          }
          return parts;
        }
        return [{ text: val, ...marks }];
      }
      case 'strong':
        return inlineRuns(node.children, { ...marks, bold: true }, linkStyle);
      case 'emphasis':
        return inlineRuns(node.children, { ...marks, italics: true }, linkStyle);
      case 'delete':
        return inlineRuns(node.children, { ...marks, decoration: 'lineThrough' }, linkStyle);
      case 'inlineCode':
        return [{ text: node.value, ...marks }];
      case 'link':
        return inlineRuns(
          node.children,
          {
            ...marks,
            color: linkColor,
            link: node.url,
            ...(linkUnderline ? { decoration: 'underline' } : {}),
          },
          linkStyle
        );
      case 'break':
        return [{ text: '\n' }];
      case 'image':
        return node.alt ? [{ text: node.alt, ...marks }] : [];
      case 'html':
        return [{ text: node.value.replace(/<[^>]+>/g, ''), ...marks }];
      default:
        return node.children ? inlineRuns(node.children, marks, linkStyle) : [];
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
