// The Home-screen tile of Turbo Sevens (the size of the other game icons): three 7s in front of the curtain, the gold bonus reel medallion and the name.
const fs = require('fs');
const path = require('path');
const L = require('./_lib');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const img = (file) => 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'turbosevens', file + '.webp')).toString('base64');

module.exports = {
  width: 171,
  height: 175,
  scale: 2,
  out: 'assets/icons/turbo-sevens.webp',
  quality: 92,
  svg: () => L.svg(171, 175, `
  <g clip-path="url(#clip)">
    <rect width="171" height="175" fill="url(#bg)"/>
    ${Array.from({ length: 9 }, (_, i) => `<rect x="${i * 19.5}" y="0" width="19.5" height="175" fill="url(#fold)" opacity="${i % 2 ? 0.5 : 0.28}"/>`).join('')}
    <circle cx="85.5" cy="70" r="74" fill="url(#halo)"/>
    <rect x="6" y="38" width="159" height="76" rx="10" fill="url(#reel)" stroke="#2a2b34" stroke-width="3"/>
    <rect x="6" y="38" width="159" height="76" rx="10" fill="url(#shade)"/>
    <image href="${img('sym-red7')}" x="10" y="42" width="66" height="66"/>
    <image href="${img('sym-flame7')}" x="53" y="38" width="72" height="72"/>
    <image href="${img('sym-gold7')}" x="100" y="42" width="66" height="66"/>
    <path d="M6 76 L166 76" stroke="#ffc21c" stroke-width="1.6" opacity="0.8"/>
    <rect y="116" width="171" height="59" fill="url(#low)"/>
  </g>
  <rect x="1.5" y="1.5" width="168" height="172" rx="16" fill="none" stroke="url(#rim)" stroke-width="2.8"/>
  <text x="85.5" y="148" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="25" letter-spacing=".6" fill="url(#gold)" stroke="#4a0610" stroke-width="4.4" paint-order="stroke" stroke-linejoin="round">TURBO</text>
  <text x="85.5" y="168" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="22" letter-spacing="3" fill="url(#fire)" stroke="#4a0610" stroke-width="4" paint-order="stroke" stroke-linejoin="round">777</text>
  <g filter="url(#drop)"><rect x="5" y="5" width="34" height="14" rx="7" fill="#27b45e" stroke="#c8ffd8" stroke-width=".9"/></g>
  <text x="22" y="15.2" text-anchor="middle" font-family="Inter" font-weight="900" font-size="8.4" fill="#fff">NEW</text>
`, `
  <clipPath id="clip"><rect x="1.5" y="1.5" width="168" height="172" rx="16"/></clipPath>
  ${L.gradient('rim', [[0, '#ffe58f'], [0.5, '#e8a020'], [1, '#ffd85a']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gradient('bg', [[0, '#6a0c1c'], [0.5, '#3a0610'], [1, '#0c0204']])}
  ${L.gradient('fold', [[0, '#000', 0.55], [0.5, '#ff6a6a', 0.14], [1, '#000', 0.55]], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.radial('halo', [[0, '#ffb04a', 0.45], [1, '#ff4a2a', 0]])}
  ${L.gradient('reel', [[0, '#8c8fa0'], [0.2, '#ffffff'], [0.8, '#ffffff'], [1, '#8a8d9c']])}
  ${L.gradient('shade', [[0, '#05060a', 0.5], [0.3, '#05060a', 0], [0.7, '#05060a', 0], [1, '#05060a', 0.5]])}
  ${L.gradient('low', [[0, '#000', 0], [1, '#000', 0.9]])}
  ${L.gradient('gold', [[0, '#fffbe0'], [0.5, '#ffe27a'], [1, '#ffb01a']])}
  ${L.gradient('fire', [[0, '#fff3a0'], [0.4, '#ffa51c'], [0.75, '#ff4a12'], [1, '#d0000e']])}
  ${L.dropShadow('drop', 2, 2, 0.6)}
`),
};
