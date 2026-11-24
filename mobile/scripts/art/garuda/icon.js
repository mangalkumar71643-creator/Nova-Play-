// The Home-screen tile of Garuda Gold (the size of the other game icons): the golden Garuda in front of the temple at
// sunset, a ruby and a multiplier coin, the name in gold and a NEW badge. Build scene, hero, symbols and coins first.
const fs = require('fs');
const path = require('path');
const L = require('./_lib');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const img = (file) => 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'garuda', file + '.webp')).toString('base64');

module.exports = {
  width: 171,
  height: 175,
  scale: 2,
  out: 'assets/icons/garuda-gold.webp',
  quality: 92,
  svg: () =>
    L.svg(
      171,
      175,
      `
  <g clip-path="url(#clip)">
    <image href="${img('scene')}" x="-84" y="-14" width="340" height="248" preserveAspectRatio="none"/>
    <image href="${img('hero')}" x="-62" y="-2" width="296" height="215" preserveAspectRatio="none"/>
    <rect y="112" width="171" height="63" fill="url(#low)"/>
    <image href="${img('coin-x500')}" x="122" y="78" width="44" height="44"/>
    <image href="${img('sym-ruby')}" x="2" y="84" width="46" height="38"/>
  </g>
  <rect x="1.5" y="1.5" width="168" height="172" rx="16" fill="none" stroke="url(#rim)" stroke-width="2.8"/>
  <g filter="url(#gDrop)">
    <text x="85.5" y="146" text-anchor="middle" font-family="Liberation Serif" font-weight="700" font-size="27" letter-spacing="1.5" fill="url(#name)" stroke="#3a1202" stroke-width="4" paint-order="stroke" stroke-linejoin="round">GARUDA</text>
    <text x="85.5" y="168" text-anchor="middle" font-family="Liberation Serif" font-weight="700" font-size="19" letter-spacing="7" fill="url(#name)" stroke="#3a1202" stroke-width="3.4" paint-order="stroke" stroke-linejoin="round">GOLD</text>
  </g>
  <g transform="translate(8 8)">
    <rect width="40" height="17" rx="8.5" fill="url(#newBg)" stroke="#fff" stroke-width="1.2"/>
    <text x="20" y="12.6" text-anchor="middle" font-family="Inter" font-weight="900" font-size="10.5" letter-spacing="0.6" fill="#fff">NEW</text>
  </g>
`,
      `${L.goldDefs()}
  <clipPath id="clip"><rect x="0" y="0" width="171" height="175" rx="17"/></clipPath>
  ${L.gradient('low', [[0, '#2a0a10', 0], [0.4, '#2a0a10', 0.75], [1, '#140406', 0.95]])}
  ${L.gradient('rim', [[0, '#fff3c0'], [0.5, '#e0a020'], [1, '#8a5206']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gradient('name', [[0, '#fffbe0'], [0.35, '#ffe07a'], [0.7, '#f0a820'], [1, '#c87a08']])}
  ${L.gradient('newBg', [[0, '#2ad46a'], [1, '#0a8a3a']])}`
    ),
};
