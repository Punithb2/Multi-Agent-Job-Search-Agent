// Fonts available to PDF export, and how a font name read from a resume maps onto
// them. Several are metric-compatible stand-ins for common proprietary fonts
// (Carlito = Calibri, Caladea = Cambria, Tinos = Times New Roman, Arimo = Arial),
// so rebuilt text takes up the same space as it did in the original.
//
// WOFF (not WOFF2) on purpose: WOFF2 fonts embed with a broken text map, which
// makes copied or ATS-parsed text come out garbled.

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

/** Roboto ships inside pdfmake itself and needs no loading. */
export const DEFAULT_FONT = 'Roboto';

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
  return FONT_FILES.Arimo ? 'Arimo' : fallback;
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
