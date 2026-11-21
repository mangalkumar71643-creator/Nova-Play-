// The Home-screen tile of Jaguar Temple (the size of the other game icons): the jaguar warrior in front of the jungle, the sun stone and the name.
const fs = require('fs');
const path = require('path');
const L = require('./_lib');
const jaguar = require('./_jaguar')('j');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const img = (file) => 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'jaguar', file)).toString('base64');

module.exports = {
  width: 171,
  height: 175,
  scale: 2,
  out: 'assets/icons/jaguar-temple.webp',
  quality: 92,
  svg: () => L.svg(171, 175, `
  <g clip-path="url(#clip)">
    <image href="${img('scene.webp')}" x="-110" y="-30" width="412" height="300" preserveAspectRatio="xMidYMid slice"/>
    <rect width="171" height="175" fill="url(#shade)"/>
    <g transform="translate(86 82) scale(0.7) translate(-100 -108)">${jaguar.body}</g>
    <image href="${img('sym-sun.webp')}" x="108" y="6" width="58" height="58"/>
    <rect y="120" width="171" height="55" fill="url(#low)"/>
  </g>
  <rect x="1.5" y="1.5" width="168" height="172" rx="16" fill="none" stroke="url(#rim)" stroke-width="2.8"/>
  <text x="85.5" y="150" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="24" letter-spacing=".6" fill="url(#gold)" stroke="#3a2306" stroke-width="4.2" paint-order="stroke" filter="url(#tg)">JAGUAR</text>
  <text x="85.5" y="168" text-anchor="middle" font-family="Inter" font-weight="900" font-size="12" letter-spacing="6" fill="#f6ecc8" stroke="#1d3a12" stroke-width="3" paint-order="stroke">TEMPLE</text>
  <g filter="url(#drop)"><rect x="5" y="5" width="34" height="14" rx="7" fill="#27b45e" stroke="#c8ffd8" stroke-width=".9"/></g>
  <text x="22" y="15.2" text-anchor="middle" font-family="Inter" font-weight="900" font-size="8.4" fill="#fff">NEW</text>
`, `${jaguar.defs}
  <clipPath id="clip"><rect x="1.5" y="1.5" width="168" height="172" rx="16"/></clipPath>
  ${L.gradient('rim', [[0, '#ffe58f'], [0.5, '#e8a020'], [1, '#ffd85a']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gradient('gold', [[0, '#fff3a8'], [0.45, '#f5c242'], [0.75, '#d08a14'], [1, '#ffd85a']])}
  ${L.gradient('shade', [[0, '#00140a', 0.25], [0.5, '#00140a', 0], [1, '#00140a', 0.4]])}
  ${L.gradient('low', [[0, '#05200c', 0], [1, '#05200c', 0.85]])}
  ${L.bevel('tg', { rel: 1.2, depth: 2.4, shine: 0.7 })}
  ${L.dropShadow('drop', 2, 2, 0.6)}
`),
};
