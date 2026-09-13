import { fromMarkdown } from 'mdast-util-from-markdown';

const DOCUMENT_TITLES = {
  skill_gap: 'Skill Gap Analysis',
  resume_tailor: 'Tailored Resume',
  cover_letter: 'Cover Letter',
};

const INK = '#1f2a3d';
const MUTED = '#6b778c';
const ACCENT = '#4d46db';

// pdfmake and its embedded fonts are large, so they load only on the first
// download instead of shipping in the main bundle.
let pdfMakePromise = null;
function loadPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
      .then(([pdfMakeModule, fontsModule]) => {
        const pdfMake = pdfMakeModule.default || pdfMakeModule;
        pdfMake.addVirtualFileSystem(fontsModule.default || fontsModule);
        return pdfMake;
      })
      .catch((error) => {
        pdfMakePromise = null; // allow a retry after a failed chunk load
        throw error;
      });
  }
  return pdfMakePromise;
}

/** Inline markdown nodes → pdfmake text runs. */
function inlineRuns(nodes = [], marks = {}) {
  return nodes.flatMap((node) => {
    switch (node.type) {
      case 'text':
        return [{ text: node.value, ...marks }];
      case 'strong':
        return inlineRuns(node.children, { ...marks, bold: true });
      case 'emphasis':
        return inlineRuns(node.children, { ...marks, italics: true });
      case 'delete':
        return inlineRuns(node.children, { ...marks, decoration: 'lineThrough' });
      case 'inlineCode':
        return [{ text: node.value, ...marks, background: '#f0efff' }];
      case 'link':
        return inlineRuns(node.children, { ...marks, color: ACCENT, link: node.url });
      case 'break':
        return [{ text: '\n' }];
      case 'image':
        return node.alt ? [{ text: node.alt, ...marks }] : [];
      case 'html':
        return [{ text: node.value.replace(/<[^>]+>/g, ''), ...marks }];
      default:
        return node.children ? inlineRuns(node.children, marks) : [];
    }
  });
}

function listItemContent(item) {
  const blocks = (item.children || []).flatMap(blockContent);
  if (blocks.length === 1 && blocks[0].text) return { ...blocks[0], margin: [0, 0, 0, 2] };
  return { stack: blocks, margin: [0, 0, 0, 2] };
}

/** Block markdown nodes → pdfmake content nodes. */
function blockContent(node) {
  switch (node.type) {
    case 'heading': {
      const style = node.depth === 1 ? 'h1' : node.depth === 2 ? 'h2' : 'h3';
      return [{ text: inlineRuns(node.children), style }];
    }
    case 'paragraph':
      return [{ text: inlineRuns(node.children), style: 'paragraph' }];
    case 'list': {
      const items = node.children.map(listItemContent);
      const list = node.ordered ? { ol: items, start: node.start || 1 } : { ul: items };
      return [{ ...list, margin: [0, 0, 0, 8] }];
    }
    case 'blockquote':
      return [{ stack: node.children.flatMap(blockContent), margin: [12, 0, 0, 8], color: MUTED, italics: true }];
    case 'code':
      return [{ text: node.value, style: 'code', preserveLeadingSpaces: true }];
    case 'thematicBreak':
      return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 0.6, lineColor: '#d6dbe6' }], margin: [0, 6, 0, 10] }];
    case 'html': {
      const text = node.value.replace(/<[^>]+>/g, '').trim();
      return text ? [{ text, style: 'paragraph' }] : [];
    }
    default:
      return node.children ? node.children.flatMap(blockContent) : [];
  }
}

/** Convert a generated markdown document into pdfmake content. */
export function markdownToPdfContent(markdown) {
  const tree = fromMarkdown(markdown || '');
  return tree.children.flatMap(blockContent);
}

function slug(value) {
  return String(value || '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function pdfFilename(action, job) {
  const parts = [slug(DOCUMENT_TITLES[action] || 'Document'), slug(job?.company), slug(job?.title)].filter(Boolean);
  return `${parts.join('-')}.pdf`;
}

export function buildPdfDocument({ markdown, action, job }) {
  const body = markdownToPdfContent(markdown);
  // The resume and cover letter are meant to be sent as-is, so they carry no
  // branding. The analysis is a working document, so it names the job.
  const header = action === 'skill_gap'
    ? [
        { text: DOCUMENT_TITLES.skill_gap.toUpperCase(), fontSize: 8, bold: true, color: ACCENT, characterSpacing: 1.2 },
        { text: [job?.title, job?.company].filter(Boolean).join(' at '), fontSize: 15, bold: true, margin: [0, 4, 0, 2] },
        { text: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), fontSize: 9, color: MUTED },
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 0.6, lineColor: '#d6dbe6' }], margin: [0, 10, 0, 12] },
      ]
    : [];

  return {
    pageSize: 'A4',
    pageMargins: [56, 56, 56, 56],
    info: { title: `${DOCUMENT_TITLES[action] || 'Document'}${job?.title ? ` - ${job.title}` : ''}` },
    content: [...header, ...body],
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.3, color: INK },
    styles: {
      h1: { fontSize: 17, bold: true, margin: [0, 0, 0, 6] },
      h2: { fontSize: 12.5, bold: true, color: ACCENT, margin: [0, 12, 0, 4] },
      h3: { fontSize: 11, bold: true, margin: [0, 9, 0, 3] },
      paragraph: { margin: [0, 0, 0, 7] },
      code: { fontSize: 9.5, background: '#f4f6fb', margin: [0, 0, 0, 8] },
    },
  };
}

/** Build and download one generated document as a text-based PDF. */
export async function downloadMaterialPdf({ markdown, action, job }) {
  const pdfMake = await loadPdfMake();
  await pdfMake.createPdf(buildPdfDocument({ markdown, action, job })).download(pdfFilename(action, job));
}
