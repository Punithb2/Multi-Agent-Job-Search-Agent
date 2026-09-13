import { buildCoverLetterDocument } from './pdfCoverLetter';
import { DEFAULT_FONT, ensureFonts } from './pdfFonts';
import { NO_LIGATURES, horizontalRule, inlineRuns, parseMarkdown } from './pdfMarkdown';
import { buildResumeDocument } from './pdfResume';

const DOCUMENT_TITLES = {
  skill_gap: 'Skill Gap Analysis',
  resume_tailor: 'Tailored Resume',
  cover_letter: 'Cover Letter',
};

const INK = '#1f2a3d';
const MUTED = '#6b778c';
const ACCENT = '#4d46db';
const CONTENT_WIDTH = 483; // A4 width minus 56pt margins either side

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

function listItemContent(item) {
  const blocks = (item.children || []).flatMap(blockContent);
  if (blocks.length === 1 && blocks[0].text) return { ...blocks[0], margin: [0, 0, 0, 2] };
  return { stack: blocks, margin: [0, 0, 0, 2] };
}

/** Block markdown nodes → pdfmake content, for general documents. */
function blockContent(node) {
  switch (node.type) {
    case 'heading': {
      const style = node.depth === 1 ? 'h1' : node.depth === 2 ? 'h2' : 'h3';
      return [{ text: inlineRuns(node.children, {}, ACCENT), style }];
    }
    case 'paragraph':
      return [{ text: inlineRuns(node.children, {}, ACCENT), style: 'paragraph' }];
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
      return [horizontalRule(CONTENT_WIDTH, '#d6dbe6')];
    case 'html': {
      const text = node.value.replace(/<[^>]+>/g, '').trim();
      return text ? [{ text, style: 'paragraph' }] : [];
    }
    default:
      return node.children ? node.children.flatMap(blockContent) : [];
  }
}

/** Convert a generated markdown document into general pdfmake content. */
export function markdownToPdfContent(markdown) {
  return parseMarkdown(markdown).children.flatMap(blockContent);
}

function slug(value) {
  return String(value || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function pdfFilename(action, job) {
  const parts = [slug(DOCUMENT_TITLES[action] || 'Document'), slug(job?.company), slug(job?.title)].filter(Boolean);
  return `${parts.join('-')}.pdf`;
}

/** General layout: the skill gap analysis, and any letter that can't be parsed. */
function buildGeneralDocument({ markdown, action, job }) {
  const header = action === 'skill_gap'
    ? [
        { text: DOCUMENT_TITLES.skill_gap.toUpperCase(), fontSize: 8, bold: true, color: ACCENT, characterSpacing: 1.2 },
        { text: [job?.title, job?.company].filter(Boolean).join(' at '), fontSize: 15, bold: true, margin: [0, 4, 0, 2] },
        { text: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), fontSize: 9, color: MUTED },
        horizontalRule(CONTENT_WIDTH, '#d6dbe6', 0.6, [0, 10, 0, 12]),
      ]
    : [];
  return {
    document: {
      pageSize: 'A4',
      pageMargins: [56, 56, 56, 56],
      content: [...header, ...markdownToPdfContent(markdown)],
      defaultStyle: { font: DEFAULT_FONT, fontSize: 10.5, lineHeight: 1.3, color: INK, fontFeatures: NO_LIGATURES },
      styles: {
        h1: { fontSize: 17, bold: true, margin: [0, 0, 0, 6] },
        h2: { fontSize: 12.5, bold: true, color: ACCENT, margin: [0, 12, 0, 4] },
        h3: { fontSize: 11, bold: true, margin: [0, 9, 0, 3] },
        paragraph: { margin: [0, 0, 0, 7] },
        code: { fontSize: 9.5, background: '#f4f6fb', margin: [0, 0, 0, 8] },
      },
    },
    fonts: [DEFAULT_FONT],
    matched: false,
  };
}

/**
 * Pick the layout for a document. The resume and cover letter use the styling
 * read from the candidate's uploaded resume when it is available.
 */
export function buildPdfDocument({ markdown, action, job, style }) {
  let built = null;
  if (action === 'resume_tailor') built = buildResumeDocument({ markdown, style, job });
  if (action === 'cover_letter') built = buildCoverLetterDocument({ markdown, style, job });
  built = built || buildGeneralDocument({ markdown, action, job });
  built.document.info = { title: `${DOCUMENT_TITLES[action] || 'Document'}${job?.title ? ` - ${job.title}` : ''}` };
  return built;
}

/** Build and download one generated document as a text-based PDF. */
export async function downloadMaterialPdf({ markdown, action, job, style }) {
  const pdfMake = await loadPdfMake();
  const { document, fonts } = buildPdfDocument({ markdown, action, job, style });
  await ensureFonts(pdfMake, fonts);
  await pdfMake.createPdf(document).download(pdfFilename(action, job));
}
