import { parseCoverLetter } from './pdfCoverLetter';
import { parseMarkdown, plainText } from './pdfMarkdown';
import { pdfFilename } from './pdf';
import { resolveStyle } from './pdfResume';

// Word export of the three documents. It shares the markdown parser, the style
// read from the uploaded resume, and the cover letter structure with the PDF
// export, so both formats say and look the same.
//
// Unlike the PDF, a Word file names fonts rather than embedding them, and the
// person opening it usually has the originals. So the resume's real font names are
// used here (Calibri, Source Sans Pro), not the metric-compatible stand-ins.

// docx is sizable, so like pdfmake it loads on first use.
let docxPromise = null;
function loadDocx() {
  if (!docxPromise) {
    docxPromise = import('docx').catch((error) => {
      docxPromise = null;
      throw error;
    });
  }
  return docxPromise;
}

const PAGE_TWIPS = { A4: { width: 11906, height: 16838 }, LETTER: { width: 12240, height: 15840 } };
const pt = (points) => Math.round(points * 20);        // twips
const halfPoints = (points) => Math.round(points * 2);  // docx font sizes
const hex = (color, fallback = '1F2A3D') => String(color || fallback).replace('#', '').toUpperCase();

/**
 * A font name as Word knows it, from the PostScript name inside a PDF:
 * "ABCDEF+SourceSansPro-Bold" -> "Source Sans Pro", "TimesNewRomanPSMT" -> "Times New Roman".
 */
export function wordFontName(pdfFontName, fallback = 'Calibri') {
  // Word's own PDFs write "Calibri,Bold"; most other tools write "Calibri-Bold".
  const bare = String(pdfFontName || '').split('+').pop().split(/[-,]/)[0].replace(/(PSMT|MT|Std)$/, '');
  if (!bare) return fallback;
  // LaTeX Computer Modern and similar have no Word equivalent installed by default.
  if (/^(CM[A-Z]{1,4}\d|LMRoman|SFRM)/i.test(bare)) return 'Cambria';
  return bare
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .trim() || fallback;
}

function runsFrom(docx, nodes, marks = {}) {
  const { TextRun, ExternalHyperlink } = docx;
  return nodes.flatMap((node) => {
    switch (node.type) {
      case 'text':
        // Consecutive markdown lines form one paragraph joined by newlines (the
        // headline and contact line, each skills line). Keep them as line breaks.
        return node.value.split('\n').map((part, index) => new TextRun({ text: part, ...(index > 0 ? { break: 1 } : {}), ...marks }));
      case 'strong':
        return runsFrom(docx, node.children, { ...marks, bold: true });
      case 'emphasis':
        return runsFrom(docx, node.children, { ...marks, italics: true });
      case 'inlineCode':
        return [new TextRun({ text: node.value, ...marks })];
      case 'break':
        return [new TextRun({ break: 1 })];
      case 'link':
        return [new ExternalHyperlink({ link: node.url, children: runsFrom(docx, node.children, { ...marks, style: 'Hyperlink' }) })];
      default:
        return node.children ? runsFrom(docx, node.children, marks) : [];
    }
  });
}

const isItalicLine = (node) => {
  const children = (node.children || []).filter((child) => !(child.type === 'text' && !child.value.trim()));
  return children.length === 1 && children[0].type === 'emphasis';
};

function sectionProperties(style) {
  const size = PAGE_TWIPS[style.pageSize] || PAGE_TWIPS.A4;
  const margin = pt(style.margin);
  return { page: { size, margin: { top: margin, bottom: margin, left: margin, right: margin } } };
}

function resumeDocument(docx, markdown, rawStyle) {
  const { Document, Paragraph, TextRun, Tab, TabStopType, BorderStyle, AlignmentType } = docx;
  const s = resolveStyle(rawStyle);
  const fonts = {
    body: wordFontName(rawStyle?.body?.font),
    name: wordFontName(rawStyle?.name?.font || rawStyle?.body?.font),
    heading: wordFontName(rawStyle?.heading?.font || rawStyle?.body?.font),
  };
  const contentWidth = (PAGE_TWIPS[s.pageSize] || PAGE_TWIPS.A4).width - pt(s.margin) * 2;
  const align = s.name.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;
  const muted = hex(s.body.color);
  const children = [];
  let nameSeen = false;
  let sectionSeen = false;

  for (const node of parseMarkdown(markdown).children) {
    if (node.type === 'heading' && node.depth === 1 && !nameSeen) {
      nameSeen = true;
      const text = plainText(node).trim();
      children.push(new Paragraph({
        alignment: align,
        spacing: { after: pt(2) },
        children: [new TextRun({ text: s.name.uppercase ? text.toUpperCase() : text, bold: s.name.bold, size: halfPoints(s.name.size), color: hex(s.name.color), font: fonts.name })],
      }));
      continue;
    }
    if (nameSeen && !sectionSeen && node.type === 'paragraph') {
      const headline = isItalicLine(node);
      children.push(new Paragraph({
        alignment: align,
        spacing: { after: pt(headline ? 2 : 4) },
        children: runsFrom(docx, node.children, { color: muted, ...(headline ? { size: halfPoints(s.body.size + 2) } : {}) }),
      }));
      continue;
    }
    if (node.type === 'heading' && node.depth <= 2) {
      sectionSeen = true;
      const text = plainText(node).trim();
      children.push(new Paragraph({
        spacing: { before: pt(9), after: pt(4) },
        keepNext: true,
        ...(s.heading.rule ? { border: { bottom: { style: BorderStyle.SINGLE, size: Math.round(s.heading.ruleWidth * 8), color: hex(s.heading.ruleColor, '000000'), space: 1 } } } : {}),
        children: [new TextRun({ text: s.heading.uppercase ? text.toUpperCase() : text, bold: s.heading.bold, size: halfPoints(s.heading.size), color: hex(s.heading.color), font: fonts.heading })],
      }));
      continue;
    }
    if (node.type === 'heading') {
      const text = plainText(node).trim();
      const split = text.indexOf(' | ');
      const left = split === -1 ? text : text.slice(0, split).trim();
      const right = split === -1 ? '' : text.slice(split + 3).trim();
      children.push(new Paragraph({
        spacing: { before: pt(5) },
        keepNext: true,
        tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
        children: [
          new TextRun({ text: left, bold: true }),
          ...(right ? [new TextRun({ children: [new Tab(), right], color: muted })] : []),
        ],
      }));
      continue;
    }
    if (node.type === 'paragraph') {
      children.push(new Paragraph({ spacing: { after: pt(isItalicLine(node) ? 1 : 4) }, children: runsFrom(docx, node.children) }));
      continue;
    }
    if (node.type === 'list') {
      for (const item of node.children) {
        const runs = (item.children || []).flatMap((child) => (child.type === 'paragraph' ? runsFrom(docx, child.children) : [new TextRun(plainText(child))]));
        children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: pt(1) }, children: runs }));
      }
    }
  }

  // Word's "single" spacing depends on each font's own metrics, so the multiplier
  // used for the PDF does not carry over. The measured spacing is given in points
  // as a minimum instead, which reproduces it without ever clipping text.
  const lineSpacing = rawStyle?.line_spacing
    ? { line: pt(rawStyle.line_spacing * s.body.size), lineRule: docx.LineRuleType.AT_LEAST }
    : { line: 240 };

  return new Document({
    styles: { default: { document: { run: { font: fonts.body, size: halfPoints(s.body.size), color: hex(s.body.color) }, paragraph: { spacing: lineSpacing } } } },
    sections: [{ properties: sectionProperties(s), children }],
  });
}

function coverLetterDocument(docx, markdown, rawStyle, job) {
  const letter = parseCoverLetter(markdown);
  if (!letter) return null;
  const { Document, Paragraph, TextRun, BorderStyle, AlignmentType } = docx;
  const s = resolveStyle(rawStyle);
  const bodyFont = wordFontName(rawStyle?.body?.font);
  const nameFont = wordFontName(rawStyle?.name?.font || rawStyle?.body?.font);
  const align = s.name.align === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;
  const ruleColor = hex(s.accent || s.heading.ruleColor, '000000');
  const bodySize = Math.min(11.5, Math.max(10.5, s.body.size + 0.5));
  const gap = (after) => ({ spacing: { after: pt(after) } });
  const children = [];

  if (letter.name) {
    children.push(new Paragraph({ alignment: align, children: [new TextRun({ text: s.name.uppercase ? letter.name.toUpperCase() : letter.name, bold: s.name.bold, size: halfPoints(Math.min(24, Math.max(18, s.name.size))), color: hex(s.name.color), font: nameFont })] }));
  }
  children.push(new Paragraph({
    alignment: align,
    spacing: { before: pt(4), after: pt(20) },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ruleColor, space: 8 } },
    children: [new TextRun({ text: letter.contact.join('   |   '), size: halfPoints(bodySize - 1.5) })],
  }));
  children.push(new Paragraph({ ...gap(14), text: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }));

  const recipient = [job?.company, job?.location].filter(Boolean);
  if (recipient.length) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'Hiring Team', bold: true })] }));
    recipient.forEach((line, index) => children.push(new Paragraph({ ...(index === recipient.length - 1 ? gap(14) : {}), text: line })));
  }
  if (job?.title) children.push(new Paragraph({ ...gap(14), children: [new TextRun({ text: `Re: Application for ${job.title}`, bold: true })] }));

  children.push(new Paragraph({ ...gap(10), text: letter.salutation }));
  if (letter.salutationRest) children.push(new Paragraph({ ...gap(10), text: letter.salutationRest }));
  for (const block of letter.body) {
    children.push(new Paragraph({ ...gap(10), children: block.type === 'paragraph' ? runsFrom(docx, block.children) : [new TextRun(plainText(block))] }));
  }
  if (letter.closing) {
    children.push(new Paragraph({ spacing: { before: pt(8), after: pt(26) }, text: letter.closing }));
    const signer = letter.signature[0] || letter.name;
    if (signer) children.push(new Paragraph({ children: [new TextRun({ text: signer, bold: true, font: nameFont })] }));
    letter.signature.slice(1).forEach((line) => children.push(new Paragraph({ text: line })));
  }

  return new Document({
    styles: { default: { document: { run: { font: bodyFont, size: halfPoints(bodySize), color: hex(s.body.color) }, paragraph: { spacing: { line: 300 } } } } },
    sections: [{ properties: sectionProperties({ ...s, margin: Math.max(s.margin, 56) }), children }],
  });
}

function generalDocument(docx, markdown, job, action) {
  const { Document, Paragraph, TextRun, HeadingLevel } = docx;
  const children = [];
  if (action === 'skill_gap') {
    children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: 'Skill Gap Analysis' })] }));
    if (job?.title) children.push(new Paragraph({ spacing: { after: pt(10) }, children: [new TextRun({ text: [job.title, job.company].filter(Boolean).join(' at '), bold: true })] }));
  }
  const levels = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3 };
  for (const node of parseMarkdown(markdown).children) {
    if (node.type === 'heading') children.push(new Paragraph({ heading: levels[node.depth] || HeadingLevel.HEADING_3, children: runsFrom(docx, node.children) }));
    else if (node.type === 'paragraph') children.push(new Paragraph({ spacing: { after: pt(6) }, children: runsFrom(docx, node.children) }));
    else if (node.type === 'list') {
      node.children.forEach((item, index) => {
        const runs = (item.children || []).flatMap((child) => (child.type === 'paragraph' ? runsFrom(docx, child.children) : [new TextRun(plainText(child))]));
        children.push(new Paragraph(node.ordered
          ? { spacing: { after: pt(2) }, children: [new TextRun(`${(node.start || 1) + index}. `), ...runs] }
          : { bullet: { level: 0 }, spacing: { after: pt(2) }, children: runs }));
      });
    } else if (node.type === 'blockquote') {
      children.push(new Paragraph({ indent: { left: pt(14) }, children: [new TextRun({ text: plainText(node), italics: true })] }));
    }
  }
  return new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ properties: sectionProperties({ pageSize: 'A4', margin: 56 }), children }],
  });
}

/** Build the Word document for one generated document. Exported for testing. */
export async function buildWordDocument({ markdown, action, job, style }) {
  const docx = await loadDocx();
  let document = null;
  if (action === 'resume_tailor') document = resumeDocument(docx, markdown, style);
  if (action === 'cover_letter') document = coverLetterDocument(docx, markdown, style, job);
  return { docx, document: document || generalDocument(docx, markdown, job, action) };
}

/** Build and download one generated document as a .docx file. */
export async function downloadMaterialDocx({ markdown, action, job, style }) {
  const { docx, document } = await buildWordDocument({ markdown, action, job, style });
  const blob = await docx.Packer.toBlob(document);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = pdfFilename(action, job).replace(/\.pdf$/, '.docx');
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
