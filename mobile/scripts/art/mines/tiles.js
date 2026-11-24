// The pieces of the Mines board (each the size of a tile, 100 x 74 units): the closed tile (a glossy sapphire block with a
// gold rim and a star set in it), the same tile picked for Auto Game, the open well, the cut diamond, the bomb and the blast
// behind a bomb that was hit. Transparent outside the art.
const L = require('../garuda/_lib');

const W = 100;
const H = 74;

const piece = (id, build, { w = W, h = H } = {}) => ({
  _id: id,
  width: w,
  height: h,
  scale: 3,
  out: `assets/mines/${id}.webp`,
  quality: 90,
  svg: () => {
    const g = build();
    return L.svg(w, h, g.body, L.goldDefs() + g.defs);
  },
});

/** A four-point star (the emblem on a closed tile). */
const star = (cx, cy, r, fill) =>
  `<path d="M${cx} ${cy - r} C ${cx + r * 0.16} ${cy - r * 0.16}, ${cx + r * 0.16} ${cy - r * 0.16}, ${cx + r} ${cy} C ${cx + r * 0.16} ${cy + r * 0.16}, ${cx + r * 0.16} ${cy + r * 0.16}, ${cx} ${cy + r} C ${cx - r * 0.16} ${cy + r * 0.16}, ${cx - r * 0.16} ${cy + r * 0.16}, ${cx - r} ${cy} C ${cx - r * 0.16} ${cy - r * 0.16}, ${cx - r * 0.16} ${cy - r * 0.16}, ${cx} ${cy - r} Z" fill="${fill}"/>`;

function closed(selected) {
  const face = selected ? 'faceSel' : 'face';
  return {
    defs: `${L.gradient('face', [[0, '#4f9bff'], [0.45, '#1c5fd6'], [1, '#0b2f86']])}
      ${L.gradient('faceSel', [[0, '#ffe680'], [0.45, '#f0a820'], [1, '#a8620c']])}
      ${L.gradient('side', [[0, '#0a2a72'], [1, '#04123a']])}
      ${L.radial('starGlow', [[0, selected ? '#fff3c0' : '#bfe0ff', 0.9], [1, selected ? '#fff3c0' : '#bfe0ff', 0]])}`,
    body: `<g filter="url(#gDrop)">
      <rect x="3" y="6" width="94" height="65" rx="11" fill="url(#side)"/>
      <g filter="url(#gBev)"><rect x="3" y="3" width="94" height="62" rx="11" fill="url(#gGoldD)"/></g>
      <rect x="6.5" y="6.5" width="87" height="55" rx="8.5" fill="url(#${face})"/>
      <rect x="6.5" y="6.5" width="87" height="55" rx="8.5" fill="none" stroke="#02123a" stroke-opacity="0.5" stroke-width="1"/>
      <path d="M10 10 H 90 Q 90 30 50 30 Q 10 30 10 10 Z" fill="#fff" opacity="0.16"/>
      <circle cx="50" cy="34" r="17" fill="url(#starGlow)"/>
      <g filter="url(#gBev)">${star(50, 34, 11, 'url(#gGold)')}</g>
    </g>`,
  };
}

const open = () => ({
  defs: `${L.gradient('well', [[0, '#020a24'], [0.6, '#071a4a'], [1, '#0d2a6a']])}`,
  body: `<rect x="3" y="3" width="94" height="68" rx="11" fill="url(#gGoldDeep)" opacity="0.85"/>
    <rect x="6" y="6" width="88" height="62" rx="8.5" fill="url(#well)"/>
    <rect x="6" y="6" width="88" height="14" rx="8.5" fill="#000" opacity="0.35"/>
    <rect x="6" y="6" width="88" height="62" rx="8.5" fill="none" stroke="#5c8cd8" stroke-opacity="0.35" stroke-width="1"/>`,
});

/** The cut diamond: a brilliant seen from the top, ice blue and white, with a sparkle. */
const gem = () => {
  const d = L.gemRound('dia', 50, 37, 25, ['#ffffff', '#7fe8ff', '#1aa6d8', '#06456a', '#c8f6ff']);
  return {
    defs: `${d.defs}${L.radial('gemHalo', [[0, '#9ff0ff', 0.75], [1, '#9ff0ff', 0]])}`,
    body: `<ellipse cx="50" cy="37" rx="42" ry="34" fill="url(#gemHalo)"/>
      <g filter="url(#gDrop)">${d.body}</g>
      ${star(76, 15, 7, '#ffffff')}${star(24, 58, 4.5, '#ffffff')}`,
  };
};

/** The bomb: a glossy black ball, a metal cap, a curling fuse with a spark. */
const bomb = () => ({
  defs: `${L.radial('ball', [[0, '#6a6f86'], [0.35, '#2a2d3a'], [1, '#050508']], { cx: 0.36, cy: 0.32, r: 0.8 })}
    ${L.gradient('cap', [[0, '#e8ecf4'], [0.5, '#8a92a6'], [1, '#3a4050']])}
    ${L.radial('spark', [[0, '#ffffff'], [0.3, '#ffe060'], [0.65, '#ff7a10', 0.8], [1, '#ff4a00', 0]])}`,
  body: `<g filter="url(#gDrop)">
      <circle cx="47" cy="42" r="23" fill="url(#ball)"/>
      <ellipse cx="39" cy="33" rx="8" ry="5" fill="#fff" opacity="0.35" transform="rotate(-30 39 33)"/>
      <g transform="rotate(35 47 42)"><rect x="41" y="13" width="12" height="9" rx="2" fill="url(#cap)"/></g>
      <path d="M58 18 C 62 10, 68 9, 70 14 C 72 19, 77 16, 78 11" fill="none" stroke="#c8a46a" stroke-width="2.4" stroke-linecap="round"/>
    </g>
    <circle cx="79" cy="10" r="8" fill="url(#spark)"/>
    ${star(79, 10, 6, '#fff7c0')}`,
});

/** The blast behind a bomb that was hit. */
const blast = () => {
  let rays = '';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r1 = i % 2 ? 26 : 36;
    rays += `${i ? 'L' : 'M'}${(50 + Math.cos(a) * r1).toFixed(1)} ${(37 + Math.sin(a) * r1 * 0.78).toFixed(1)} L ${(50 + Math.cos(a + Math.PI / 14) * 14).toFixed(1)} ${(37 + Math.sin(a + Math.PI / 14) * 11).toFixed(1)} `;
  }
  return {
    defs: `${L.radial('fire', [[0, '#fff6b0'], [0.35, '#ffb020'], [0.7, '#ff3a10'], [1, '#a80000', 0.2]])}`,
    body: `<rect x="3" y="3" width="94" height="68" rx="11" fill="#5a0010"/><rect x="6" y="6" width="88" height="62" rx="8.5" fill="#a8001c"/><path d="${rays}Z" fill="url(#fire)"/>`,
  };
};

module.exports = [
  piece('tile', () => closed(false)),
  piece('tile-selected', () => closed(true)),
  piece('tile-open', open),
  piece('gem', gem),
  piece('bomb', bomb),
  piece('blast', blast),
];
