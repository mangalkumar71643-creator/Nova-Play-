const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const jsDir = path.join(distDir, '_expo/static/js/web');
const jsFile = fs.readdirSync(jsDir).find((f) => f.endsWith('.js'));
if (!jsFile) throw new Error('No web JS bundle found in ' + jsDir);
const jsPath = path.join(jsDir, jsFile);

let js = fs.readFileSync(jsPath, 'utf8');

const assetRefs = [...new Set(js.match(/\/assets\/[^"'\s]+\.(ttf|png|jpg|jpeg|gif|otf|woff2?)/g) || [])];

const mime = {
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

for (const ref of assetRefs) {
  const filePath = path.join(distDir, ref);
  if (!fs.existsSync(filePath)) {
    console.warn('MISSING ASSET:', ref);
    continue;
  }
  const ext = path.extname(filePath);
  const data = fs.readFileSync(filePath);
  const dataUri = `data:${mime[ext] || 'application/octet-stream'};base64,${data.toString('base64')}`;
  js = js.split(ref).join(dataUri);
  console.log('inlined', ref, '->', (data.length / 1024).toFixed(1) + 'KB');
}

// Safety: escape any literal "</script" sequence so it can't break out of the inline <script> tag.
js = js.replace(/<\/script/gi, '<\\/script');

const htmlTemplate = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

const finalHtml = htmlTemplate
  .replace(/<link rel="icon"[^>]*>/, '')
  .replace(
    '<style id="expo-reset">',
    '<meta name="color-scheme" content="dark" />\n    <style id="expo-reset">\n      html, body { background: #170709; }'
  )
  .replace(/<script src="[^"]+" defer><\/script>/, () => `<script>${js}</script>`);

fs.writeFileSync(path.join(__dirname, 'novaplay-artifact.html'), finalHtml, 'utf8');
console.log('Wrote novaplay-artifact.html —', (finalHtml.length / 1024 / 1024).toFixed(2), 'MB');
