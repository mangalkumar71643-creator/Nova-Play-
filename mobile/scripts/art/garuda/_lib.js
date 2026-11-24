// Shared pieces for the Garuda Gold art: the gold, stone and bevel of the Jaguar Temple library, plus cut gems, ornate gold
// tiles, gold lettering and the Garuda's feathers.
const L = require('../jaguar/_lib');

/** Gold for big surfaces (top-lit), and a darker antique gold for the deep parts. */
const GOLD_V = [[0, '#fff4c0'], [0.18, '#ffd968'], [0.45, '#e9a521'], [0.72, '#a8640c'], [1, '#f2c04a']];
const GOLD_DEEP = [[0, '#f0b640'], [0.5, '#9a5a0a'], [1, '#5c3304']];

/** Gem colours: light, mid, dark, deepest, glow. */
const GEMS = {
  ruby: ['#ffb3bf', '#ff2a48', '#b0001e', '#4d000c', '#ff5a72'],
  sapphire: ['#b8d4ff', '#2f7bff', '#0a3cb4', '#03154d', '#6aa6ff'],
  emerald: ['#b8ffd0', '#18d36a', '#04883a', '#013d18', '#5affa0'],
  amethyst: ['#f0c4ff', '#b34dff', '#6a12b8', '#2c0352', '#d48cff'],
};

const pt = (cx, cy, r, a) => [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
const poly = (pts) => 'M' + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L') + ' Z';

/** A round brilliant gem seen from the top: table, star facets, kites and girdle facets in light and dark shades. */
function gemRound(id, cx, cy, r, colors) {
  const [lt, mid, dk, deep, glow] = colors;
  const n = 8;
  const table = [], girdle = [], kite = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    table.push(pt(cx, cy, r * 0.5, a));
    kite.push(pt(cx, cy, r * 0.82, a - Math.PI / n));
  }
  for (let i = 0; i < n * 2; i++) girdle.push(pt(cx, cy, r, (i / (n * 2)) * Math.PI * 2));
  let facets = '';
  const shade = (i, k) => {
    // light from the top left: facets facing it are lighter
    const a = (i / k) * Math.PI * 2;
    const f = 0.5 + 0.5 * Math.cos(a + Math.PI * 0.25);
    return f;
  };
  // girdle facets (outer ring): 16 triangles from kite points to girdle points
  for (let i = 0; i < n * 2; i++) {
    const k = kite[Math.floor(i / 2) % n];
    const k2 = kite[(Math.floor(i / 2) + (i % 2)) % n];
    const g1 = girdle[i], g2 = girdle[(i + 1) % (n * 2)];
    const f = shade(i + 0.5, n * 2);
    facets += `<path d="${poly([i % 2 ? k2 : k, g1, g2])}" fill="${f > 0.55 ? mid : dk}" opacity="${(0.75 + f * 0.25).toFixed(2)}"/>`;
  }
  // star facets between the table and the kites
  for (let i = 0; i < n; i++) {
    const t1 = table[i], t2 = table[(i + 1) % n], k = kite[(i + 1) % n];
    const f = shade(i + 1, n);
    facets += `<path d="${poly([t1, k, t2])}" fill="${f > 0.5 ? lt : mid}" opacity="${(0.55 + f * 0.45).toFixed(2)}"/>`;
    const k1 = kite[i];
    facets += `<path d="${poly([t1, k1, girdle[(i * 2) % 16], k])}" fill="${f > 0.6 ? mid : dk}" opacity="0.35"/>`;
  }
  return {
    defs: `${L.radial(`${id}Body`, [[0, glow], [0.55, mid], [1, deep]], { cx: 0.42, cy: 0.38, r: 0.7 })}
      ${L.radial(`${id}Table`, [[0, '#ffffff', 0.85], [0.35, lt, 0.75], [1, mid, 0.2]], { cx: 0.35, cy: 0.3, r: 0.85 })}`,
    body: `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}Body)"/>
      ${facets}
      <path d="${poly(table)}" fill="url(#${id}Table)"/>
      <path d="${poly(table)}" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="${r * 0.025}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${deep}" stroke-width="${r * 0.05}"/>
      <path d="M${cx - r * 0.55} ${cy - r * 0.18} Q ${cx - r * 0.4} ${cy - r * 0.55} ${cx - r * 0.05} ${cy - r * 0.62}" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="${r * 0.07}" stroke-linecap="round"/>
      <circle cx="${cx + r * 0.34}" cy="${cy + r * 0.3}" r="${r * 0.06}" fill="#fff" opacity="0.7"/>`,
  };
}

/** A step-cut gem with `sides` sides (6 hexagon, 8 octagon): rings that get lighter towards the light, and a bright table. */
function gemStep(id, cx, cy, r, colors, sides, rot = 0) {
  const [lt, mid, dk, deep, glow] = colors;
  const ring = (rr) => Array.from({ length: sides }, (_, i) => pt(cx, cy, rr, (i / sides) * Math.PI * 2 + rot));
  const rings = [1, 0.84, 0.68, 0.5].map((f) => ring(r * f));
  let out = `<path d="${poly(rings[0])}" fill="${deep}"/>`;
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < sides; i++) {
      const a = ((i + 0.5) / sides) * Math.PI * 2 + rot;
      const f = 0.5 + 0.5 * Math.cos(a + Math.PI * 0.3);
      const col = k === 0 ? (f > 0.5 ? mid : dk) : k === 1 ? (f > 0.45 ? lt : mid) : f > 0.4 ? glow : dk;
      const p = [rings[k][i], rings[k][(i + 1) % sides], rings[k + 1][(i + 1) % sides], rings[k + 1][i]];
      out += `<path d="${poly(p)}" fill="${col}" opacity="${(0.55 + f * 0.45).toFixed(2)}"/>`;
    }
  }
  return {
    defs: `${L.radial(`${id}Tab`, [[0, '#ffffff', 0.9], [0.4, lt, 0.85], [1, mid]], { cx: 0.35, cy: 0.3, r: 0.9 })}`,
    body: `${out}
      <path d="${poly(rings[3])}" fill="url(#${id}Tab)"/>
      <path d="${poly(rings[3])}" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="${r * 0.03}"/>
      <path d="${poly(rings[0])}" fill="none" stroke="${deep}" stroke-width="${r * 0.05}" stroke-linejoin="round"/>
      <path d="M${rings[2][sides - 1][0]} ${rings[2][sides - 1][1]} L ${rings[2][0][0]} ${rings[2][0][1]}" stroke="#fff" stroke-opacity="0.9" stroke-width="${r * 0.06}" stroke-linecap="round"/>
      <circle cx="${cx - r * 0.18}" cy="${cy - r * 0.2}" r="${r * 0.07}" fill="#fff" opacity="0.85"/>`,
  };
}

/** A small round cabochon gem (for jewellery and letters). */
const cabochon = (id, cx, cy, r, colors) => ({
  defs: L.radial(`${id}`, [[0, colors[0]], [0.45, colors[1]], [1, colors[3]]], { cx: 0.38, cy: 0.32, r: 0.75 }),
  body: `<circle cx="${cx}" cy="${cy}" r="${r + r * 0.28}" fill="url(#gGoldRim)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/><ellipse cx="${cx - r * 0.3}" cy="${cy - r * 0.35}" rx="${r * 0.32}" ry="${r * 0.2}" fill="#fff" opacity="0.75" transform="rotate(-30 ${cx - r * 0.3} ${cy - r * 0.35})"/>`,
});

/** Common gold defs every piece can use. */
const goldDefs = () => `${L.gradient('gGold', GOLD_V)}${L.gradient('gGoldD', GOLD_V, { x1: 0, y1: 0, x2: 1, y2: 1 })}${L.gradient('gGoldDeep', GOLD_DEEP)}
  ${L.gradient('gGoldRim', [[0, '#fff2b0'], [0.5, '#d89a20'], [1, '#7a4806']])}
  ${L.bevel('gBev', { rel: 1.6, depth: 3.2, shine: 0.9, exp: 24 })}${L.bevel('gBevSoft', { rel: 2.4, depth: 2.4, shine: 0.6, exp: 30, shade: 0.35 })}
  ${L.dropShadow('gDrop', 2.5, 2.2, 0.55)}${L.dropShadow('gDropBig', 5, 5, 0.6)}`;

/** An ornate gold tile (w x h) with rounded corners, a raised rim, scrolls in the corners and a darker inner field. */
function goldTile(x, y, w, h, { r = 7, rim = 5, inner = 'url(#gTileIn)' } = {}) {
  const curl = (cx, cy, sx, sy) =>
    `<path transform="translate(${cx} ${cy}) scale(${sx} ${sy})" d="M0 0 C 6 0, 9 3, 9 8 C 9 12, 5 14, 2.5 12 C 0.5 10.5, 1.5 7.5, 4 8.2" fill="none" stroke="url(#gGold)" stroke-width="2.2" stroke-linecap="round"/>`;
  return `
    <g filter="url(#gBev)">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#gGoldD)"/>
    </g>
    <rect x="${x + rim}" y="${y + rim}" width="${w - rim * 2}" height="${h - rim * 2}" rx="${Math.max(2, r - rim / 2)}" fill="${inner}"/>
    <rect x="${x + rim}" y="${y + rim}" width="${w - rim * 2}" height="${h - rim * 2}" rx="${Math.max(2, r - rim / 2)}" fill="none" stroke="#5c3304" stroke-opacity="0.75" stroke-width="1.2"/>
    <rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="${r - 1}" fill="none" stroke="#fff6c8" stroke-opacity="0.6" stroke-width="0.8"/>
    <g filter="url(#gBev)">
      ${curl(x + rim + 2, y + rim + 2, 1, 1)}${curl(x + w - rim - 2, y + rim + 2, -1, 1)}${curl(x + rim + 2, y + h - rim - 2, 1, -1)}${curl(x + w - rim - 2, y + h - rim - 2, -1, -1)}
    </g>`;
}

module.exports = { ...L, GOLD_V, GOLD_DEEP, GEMS, pt, poly, gemRound, gemStep, cabochon, goldDefs, goldTile };
