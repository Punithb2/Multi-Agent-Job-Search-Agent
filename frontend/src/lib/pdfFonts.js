// Fonts available to PDF export, and how a font name read from a resume maps onto
// them. Several are metric-compatible stand-ins for common proprietary fonts
// (Carlito = Calibri, Caladea = Cambria, Tinos = Times New Roman, Arimo = Arial),
// so rebuilt text takes up the same space as it did in the original.
//
// WOFF (not WOFF2) on purpose: WOFF2 fonts embed with a broken text map, which
// makes copied or ATS-parsed text come out garbled.

export const RESUME_ICONS_BASE64 =
  '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';

const fontUrls = import.meta.glob('/node_modules/@fontsource/*/files/*-latin-{400,700}-{normal,italic}.woff', {
  query: '?url',
  import: 'default',
  eager: true,
});

const PACKAGE_KEYS = {
  tinos: 'Tinos',
  arimo: 'Arimo',
  carlito: 'Carlito',
  caladea: 'Caladea',
  lato: 'Lato',
  'open-sans': 'OpenSans',
  merriweather: 'Merriweather',
  'eb-garamond': 'EBGaramond',
  'source-sans-3': 'SourceSans3',
  montserrat: 'Montserrat',
  poppins: 'Poppins',
  'old-standard-tt': 'OldStandard',
};

/** { Tinos: { normal: url, bold: url, italics: url, bolditalics: url }, ... } */
export const FONT_FILES = (() => {
  const files = {};
  for (const [path, url] of Object.entries(fontUrls)) {
    const match = path.match(/@fontsource\/([^/]+)\/files\/.+-latin-(400|700)-(normal|italic)\.woff$/);
    const key = match && PACKAGE_KEYS[match[1]];
    if (!key) continue;
    const variant = { '400-normal': 'normal', '700-normal': 'bold', '400-italic': 'italics', '700-italic': 'bolditalics' }[`${match[2]}-${match[3]}`];
    files[key] = { ...files[key], [variant]: url };
  }
  return files;
})();

export const DEFAULT_FONT = 'SourceSans3';

// Each font's natural line height as a multiple of its size, (ascent - descent)
// / unitsPerEm, measured with fontkit (the engine pdfmake uses). pdfmake's
// lineHeight multiplies this, so reproducing a resume's measured spacing needs
// it: identical spacing is lineHeight 1.0 in Tinos but about 0.78 in Source Sans 3.
export const FONT_LINE_RATIOS = {
  Roboto: 1.172, Tinos: 1.107, Arimo: 1.117, Carlito: 1.221, Caladea: 1.15, Lato: 1.2, OpenSans: 1.362,
  Merriweather: 1.257, EBGaramond: 1.305, SourceSans3: 1.424, Montserrat: 1.219, Poppins: 1.4, OldStandard: 1,
};

const FONT_MATCHERS = [
  ['Carlito', /calibri|carlito/],
  ['Caladea', /cambria|caladea/],
  ['Tinos', /times|tinos|liberationserif|nimbusrom/],
  ['Arimo', /arial|helvetica|arimo|liberationsans|nimbussans/],
  ['OpenSans', /opensans/],
  ['SourceSans3', /sourcesans/],
  ['Montserrat', /montserrat/],
  ['Poppins', /poppins/],
  ['Lato', /lato/],
  ['Merriweather', /merriweather|georgia/],
  ['EBGaramond', /garamond|palatino|bookantiqua|minion/],
  // LaTeX's Computer Modern / Latin Modern (common in Overleaf resumes).
  ['OldStandard', /^(cm[a-z]{1,4}\d|lmroman|latinmodern|computermodern|sfrm|cmu)/],
  ['Roboto', /roboto/],
];

/** Closest available font for a font name found in a PDF, e.g. "ABCDEF+Calibri-Bold". */
export function resolveFontKey(fontName, fallback = DEFAULT_FONT) {
  const name = String(fontName || '').split('+').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!name) return fallback;
  for (const [key, pattern] of FONT_MATCHERS) {
    if (pattern.test(name) && (key === 'Roboto' || FONT_FILES[key])) return key;
  }
  // Unknown font: keep its broad character (serif or sans).
  if (/serif/.test(name) && !/sans/.test(name)) return FONT_FILES.Tinos ? 'Tinos' : fallback;
  if (/roman|book|antiqua|mincho|song|times/.test(name)) return FONT_FILES.Tinos ? 'Tinos' : fallback;
  return FONT_FILES.SourceSans3 ? 'SourceSans3' : (FONT_FILES.Arimo ? 'Arimo' : fallback);
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

const loadedFonts = new Set([DEFAULT_FONT]);

/** Fetch any fonts a document needs and register them with pdfmake. */
export async function ensureFonts(pdfMake, keys) {
  if (!loadedFonts.has('ResumeIcons')) {
    const fileName = 'resume-icons.woff';
    pdfMake.addVirtualFileSystem({ [fileName]: RESUME_ICONS_BASE64 });
    pdfMake.addFonts({
      ResumeIcons: {
        normal: fileName,
        bold: fileName,
        italics: fileName,
        bolditalics: fileName,
      },
    });
    loadedFonts.add('ResumeIcons');
  }

  const missing = [...new Set(keys)].filter((key) => !loadedFonts.has(key) && FONT_FILES[key]);
  await Promise.all(missing.map(async (key) => {
    const files = FONT_FILES[key];
    // Some families ship without a bold italic cut; bold stands in for it.
    const variants = { normal: files.normal, bold: files.bold || files.normal, italics: files.italics || files.normal, bolditalics: files.bolditalics || files.bold || files.normal };
    const vfs = {};
    const fonts = {};
    await Promise.all(Object.entries(variants).map(async ([variant, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Font ${key} (${variant}) failed to load`);
      const fileName = `${key}-${variant}.woff`;
      vfs[fileName] = toBase64(await response.arrayBuffer());
      fonts[variant] = fileName;
    }));
    pdfMake.addVirtualFileSystem(vfs);
    pdfMake.addFonts({ [key]: fonts });
    loadedFonts.add(key);
  }));
}
