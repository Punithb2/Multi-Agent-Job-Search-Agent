// Temporary: render PDFs with the real layout builders, loaded through Vite so
// import.meta.glob works. Deleted after testing.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const [inputPath, outDir] = process.argv.slice(2);
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
const require = createRequire(import.meta.url);
const pdfmake = require('pdfmake');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { buildPdfDocument, pdfFilename } = await server.ssrLoadModule('/src/lib/pdf.js');

const packages = { Tinos: 'tinos', Arimo: 'arimo', Carlito: 'carlito', Caladea: 'caladea', Lato: 'lato', OpenSans: 'open-sans', Merriweather: 'merriweather', EBGaramond: 'eb-garamond', SourceSans3: 'source-sans-3', Montserrat: 'montserrat', Poppins: 'poppins', OldStandard: 'old-standard-tt' };
const fonts = { Roboto: { normal: 'node_modules/pdfmake/build/fonts/Roboto/Roboto-Regular.ttf', bold: 'node_modules/pdfmake/build/fonts/Roboto/Roboto-Medium.ttf', italics: 'node_modules/pdfmake/build/fonts/Roboto/Roboto-Italic.ttf', bolditalics: 'node_modules/pdfmake/build/fonts/Roboto/Roboto-MediumItalic.ttf' } };
for (const [key, pkg] of Object.entries(packages)) {
  const file = (variant) => `node_modules/@fontsource/${pkg}/files/${pkg}-latin-${variant}.woff`;
  fonts[key] = { normal: file('400-normal'), bold: file('700-normal'), italics: file('400-italic'), bolditalics: key === 'OldStandard' ? file('700-normal') : file('700-italic') };
}
pdfmake.addFonts(fonts);

const cases = [
  ['resume_tailor', 'A'], ['resume_tailor', 'B'], ['resume_tailor', 'C'], ['resume_tailor', null],
  ['cover_letter', 'A'], ['cover_letter', 'B'], ['cover_letter', null],
];
for (const [action, styleKey] of cases) {
  const style = styleKey ? input.styles[styleKey] : null;
  const markdown = action === 'resume_tailor' ? input.resume : input.letter;
  const built = buildPdfDocument({ markdown, action, job: input.job, style });
  const buffer = await pdfmake.createPdf(built.document).getBuffer();
  const name = `${styleKey || 'default'}-${pdfFilename(action, input.job)}`;
  writeFileSync(`${outDir}/${name}`, buffer);
  console.log(`${name.padEnd(64)} fonts=${[...new Set(built.fonts)].join(',').padEnd(16)} matched=${built.matched} ${buffer.length}B`);
}
await server.close();
