// Builds the PC copies: two self-contained pages that open straight from disk in Chrome or Edge,
// where full screen and the Xbox controller work. The shack's door leads to the yard's file and back.
//
//   npm install && npm run build:pc      → dist/valtoria-shack-pc.html, dist/valtoria-yard-pc.html
//
// Both carry their assets inside the page as data URLs (window.__ASSETS), so nothing is fetched from disk.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname, game = join(root, 'game'), out = join(root, 'dist');
const SHACK = 'valtoria-shack-pc.html', YARD = 'valtoria-yard-pc.html';
const MIME = { '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };
const files = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const dataURL = (p) => `data:${MIME[extname(p)]};base64,${readFileSync(p).toString('base64')}`;
const assets = (keep) => Object.fromEntries(files(join(game, 'assets')).map((p) => relative(join(game, 'assets'), p)).filter(keep).map((k) => [k, dataURL(join(game, 'assets', k))]));
// a script tag's contents must never close the tag early
const inline = (js) => js.replace(/<\/script/gi, '<\\/script');
mkdirSync(out, { recursive: true });

// the shack: the built page as it is, told where its assets and the yard are
{
  const page = readFileSync(join(game, 'index.html'), 'utf8');
  const head = `<script>window.__ASSETS = ${JSON.stringify(assets(() => true))}; window.__YARD_URL = ${JSON.stringify(YARD)};</script>\n`;
  const at = page.indexOf('<script>window.__MANIFEST');
  if (at < 0) throw new Error('index.html: no asset manifest to put the inlined assets before');
  writeFileSync(join(out, SHACK), page.slice(0, at) + head + page.slice(at));
}

// the yard: its module and Three.js bundled into one classic script, with the two dirt textures it loads
{
  const { outputFiles } = await build({ entryPoints: [join(game, 'yard', 'main.js')], bundle: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
  const page = readFileSync(join(game, 'yard.html'), 'utf8');
  const tag = '<script type="module" src="yard/main.js"></script>';
  if (!page.includes(tag)) throw new Error('yard.html: module script tag not found');
  const head = `<script>window.__ASSETS = ${JSON.stringify(assets((k) => k.startsWith('tex/dirt_') && !k.endsWith('_r.jpg')))}; window.__SHACK_URL = ${JSON.stringify(SHACK)};</script>\n`;
  writeFileSync(join(out, YARD), page.replace(tag, head + '<script>' + inline(outputFiles[0].text) + '</script>'));
}
for (const f of [SHACK, YARD]) console.log(`${f}  ${(statSync(join(out, f)).size / 1048576).toFixed(1)} MB`);
