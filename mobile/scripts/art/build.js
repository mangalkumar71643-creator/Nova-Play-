#!/usr/bin/env node
/*
 * Draws the artwork of the games: every piece is a small module (scripts/art/<game>/<piece>.js) that returns SVG markup;
 * this script renders it in Chromium (so the SVG filters, lighting and blurs all work) and saves it as a WEBP in assets/.
 *
 *   node scripts/art/build.js                  every piece
 *   node scripts/art/build.js redbutton        one game
 *   node scripts/art/build.js redbutton/lcd    one piece
 *
 * A piece module exports { width, height, scale?, out, quality?, lossless?, svg() }:
 *   width/height  size of the drawing in its own units; scale: pixels per unit in the file (default 2);
 *   out           path of the WEBP relative to the mobile folder (the folder is made if needed).
 * Needs Playwright (Chromium) for Node and Pillow for Python, as the other art/sound scripts do.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'novaplay-art-'));

function pieces(filters) {
  const found = [];
  for (const game of fs.readdirSync(__dirname, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const file of fs.readdirSync(path.join(__dirname, game.name)).filter((f) => f.endsWith('.js') && !f.startsWith('_'))) {
      const id = `${game.name}/${file.replace(/\.js$/, '')}`;
      if (filters.length && !filters.some((f) => id === f || id.startsWith(f + '/'))) continue;
      found.push({ id, file: path.join(__dirname, game.name, file) });
    }
  }
  return found;
}

(async () => {
  const list = pieces(process.argv.slice(2));
  if (!list.length) throw new Error('no piece matches');
  const browser = await chromium.launch();
  const manifest = [];
  for (const { id, file } of list) {
    delete require.cache[require.resolve(file)];
    const exported = require(file);
    // A module can draw one piece, or several (an array of pieces, each with an _id).
    for (const piece of Array.isArray(exported) ? exported : [exported]) {
    const scale = piece.scale ?? 2;
    const context = await browser.newContext({ viewport: { width: Math.ceil(piece.width), height: Math.ceil(piece.height) }, deviceScaleFactor: scale });
    const page = await context.newPage();
    const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style>${piece.svg()}`;
    await page.setContent(html);
    await page.evaluate(() => document.fonts.ready);
    const png = path.join(TMP, id.replace('/', '_') + (piece._id ? '_' + piece._id : '') + '.png');
    await page.screenshot({ path: png, omitBackground: true, clip: { x: 0, y: 0, width: piece.width, height: piece.height } });
    await context.close();
    manifest.push({ id, png, out: path.join(ROOT, piece.out), quality: piece.quality ?? 90, lossless: !!piece.lossless });
    console.log('drew', id + (piece._id ? ':' + piece._id : ''));
    }
  }
  await browser.close();
  const m = path.join(TMP, 'manifest.json');
  fs.writeFileSync(m, JSON.stringify(manifest));
  execFileSync('python3', [path.join(__dirname, 'to_webp.py'), m], { stdio: 'inherit' });
  fs.rmSync(TMP, { recursive: true, force: true });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
