// The name plate under the Garuda (412 x 48 units): a carved beam with gold rims, GARUDA GOLD in gold letters, and the
// NUDGE lamp at its right end (nudge-off / nudge-on, 100 x 36 units, lit when a nudge takes the multiplier reel up).
const L = require('./_lib');

const title = {
  _id: 'title',
  width: 412,
  height: 48,
  scale: 2.5,
  out: 'assets/garuda/title.webp',
  quality: 90,
  svg: () =>
    L.svg(
      412,
      48,
      `
  <rect x="0" y="3" width="412" height="42" fill="url(#beam)"/>
  <rect x="0" y="3" width="412" height="42" fill="#000" filter="url(#grain)" opacity="0.7"/>
  <g filter="url(#gBev)">
    <rect x="0" y="0" width="412" height="5" fill="url(#gGold)"/>
    <rect x="0" y="43" width="412" height="5" fill="url(#gGold)"/>
  </g>
  <path d="M0 5.5 H412 M0 42.5 H412" stroke="#3a1a04" stroke-width="1"/>
  <!-- the inset for the NUDGE lamp -->
  <rect x="302" y="8" width="104" height="32" rx="5" fill="#1a0a02"/>
  <rect x="302" y="8" width="104" height="32" rx="5" fill="none" stroke="url(#gGoldD)" stroke-width="2" filter="url(#gBev)"/>
  <!-- the name -->
  <g filter="url(#gDrop)">
    <g filter="url(#gBev)">
      <text x="150" y="35" text-anchor="middle" font-family="Liberation Serif" font-weight="700" font-size="29" letter-spacing="3" fill="url(#nameGold)" stroke="#3a1a02" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round">GARUDA GOLD</text>
    </g>
  </g>
  <!-- lotus ornaments at the ends of the name -->
  ${[14, 286].map((x) => `<g transform="translate(${x} 24)" filter="url(#gBev)"><path d="M0 -9 C 4 -4, 4 4, 0 9 C -4 4, -4 -4, 0 -9 Z" fill="url(#gGold)"/><path d="M-7 -4 C -2 -2, 0 2, 0 7 C -5 5, -8 1, -7 -4 Z" fill="url(#gGold)"/><path d="M7 -4 C 2 -2, 0 2, 0 7 C 5 5, 8 1, 7 -4 Z" fill="url(#gGold)"/></g>`).join('')}
`,
      `${L.goldDefs()}
  ${L.gradient('beam', [[0, '#6a3a18'], [0.5, '#3e200c'], [1, '#2a1406']])}
  ${L.gradient('nameGold', [[0, '#fffbe0'], [0.3, '#ffe27a'], [0.6, '#f0a820'], [1, '#c87a08']])}
  ${L.stoneGrain('grain', { freq: 1.2, seed: 4, dark: 0.3 })}`
    ),
};

const lamp = (on) => ({
  _id: on ? 'nudge-on' : 'nudge-off',
  width: 100,
  height: 36,
  scale: 3,
  out: `assets/garuda/${on ? 'nudge-on' : 'nudge-off'}.webp`,
  quality: 90,
  svg: () =>
    L.svg(
      100,
      36,
      `
  ${on ? '<rect x="0" y="0" width="100" height="36" rx="8" fill="url(#halo)"/>' : ''}
  <rect x="4" y="4" width="92" height="28" rx="5" fill="url(#${on ? 'lit' : 'dark'})"/>
  <rect x="4" y="4" width="92" height="28" rx="5" fill="none" stroke="${on ? '#ffe27a' : '#6a4a20'}" stroke-width="1.4"/>
  <text x="50" y="24" text-anchor="middle" font-family="Liberation Serif" font-weight="700" font-size="${on ? 14 : 16}" letter-spacing="${on ? 1.4 : 2.5}" fill="${on ? 'url(#litText)' : '#7a5a2a'}" stroke="${on ? '#4a0a6a' : '#1a0a02'}" stroke-width="${on ? 2.4 : 1.2}" paint-order="stroke" stroke-linejoin="round">NUDGE</text>
  ${on ? '<path d="M9 18 L 14 11 L 19 18 L 16 18 L 16 24 L 12 24 L 12 18 Z" fill="#fff3b0"/><path d="M81 18 L 86 11 L 91 18 L 88 18 L 88 24 L 84 24 L 84 18 Z" fill="#fff3b0"/>' : ''}
`,
      `${L.gradient('dark', [[0, '#2a1606'], [1, '#140a02']])}
  ${L.gradient('lit', [[0, '#c04aff'], [0.5, '#7a12d0'], [1, '#4a0890']])}
  ${L.gradient('litText', [[0, '#fffbe0'], [0.5, '#ffe27a'], [1, '#ffb020']])}
  ${L.radial('halo', [[0.5, '#e080ff', 0.6], [1, '#e080ff', 0]])}`
    ),
});

module.exports = [title, lamp(false), lamp(true)];
