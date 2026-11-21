// What the reels turn over: dark carved stone with a sun circle in every cell. 368 x 312 units: three columns of 122.67 and three rows of 104.
const L = require('./_lib');

const cell = (cx, cy) => `<g opacity=".5" fill="none" stroke="#7a6652" stroke-width="2.4">
  <circle cx="${cx}" cy="${cy}" r="34"/><circle cx="${cx}" cy="${cy}" r="24" stroke-opacity=".7"/>
  ${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<path d="M${(cx + Math.cos(a) * 40).toFixed(1)} ${(cy + Math.sin(a) * 40).toFixed(1)} L ${(cx + Math.cos(a) * 47).toFixed(1)} ${(cy + Math.sin(a) * 47).toFixed(1)}"/>`; }).join('')}
</g>`;

module.exports = {
  width: 368,
  height: 312,
  scale: 2,
  out: 'assets/jaguar/reels-bg.webp',
  quality: 82,
  svg: () => L.svg(368, 312, `
  <rect width="368" height="312" fill="url(#base)"/>
  <rect width="368" height="312" filter="url(#gr)" opacity=".7"/>
  ${[0, 1, 2].map((c) => [0, 1, 2].map((r) => cell(61.33 + c * 122.67, 52 + r * 104)).join('')).join('')}
  <!-- the dividers -->
  ${[122.67, 245.33].map((x) => `<rect x="${x - 2}" y="0" width="4" height="312" fill="#000" opacity=".45"/><rect x="${x + 2}" y="0" width="1.6" height="312" fill="#fff" opacity=".12"/>`).join('')}
  <rect width="368" height="312" fill="url(#vig)"/>
`, `
  ${L.gradient('base', [[0, '#4d433b'], [0.5, '#3a322c'], [1, '#2a241f']])}
  ${L.stoneGrain('gr', { freq: 0.55, seed: 21, dark: 0.45 })}
  ${L.radial('vig', [[0.6, '#000', 0], [1, '#000', 0.5]], { cx: 0.5, cy: 0.5, r: 0.8 })}
`),
};
