// The symbols of reels 1-3 (92 x 76 units each, the size of a cell): the three gems in ornate gold tiles, the four gold
// letters with their small gems, and the WILD (the golden Garuda mask with WILD below it). Transparent outside the art.
const L = require('./_lib');

const W = 98;
const H = 76;
const MID = W / 2;

const piece = (id, build) => ({
  _id: id,
  width: W,
  height: H,
  scale: 3,
  out: `assets/garuda/sym-${id}.webp`,
  quality: 92,
  svg: () => {
    const g = build();
    return L.svg(W, H, g.body, L.goldDefs() + g.defs);
  },
});

/** A gem in its gold tile; the tile's field glows in the gem's colour. */
function gemTile(id, gem, colors) {
  const [, mid, , deep] = colors;
  return {
    defs: `${L.radial('gTileIn', [[0, mid, 0.55], [0.55, deep, 0.95], [1, '#120400']], { cx: 0.5, cy: 0.45, r: 0.75 })}${gem.defs}`,
    body: `<g filter="url(#gDrop)">${L.goldTile(3, 2, W - 6, H - 5, { r: 8, rim: 5.5 })}</g>
      <g filter="url(#gDrop)">${gem.body}</g>
      <path d="M13 9 L 31 9" stroke="#fff8d0" stroke-opacity="0.55" stroke-width="1.2" stroke-linecap="round"/>`,
  };
}

const ruby = () => gemTile('ruby', L.gemRound('ru', MID, 38, 26, L.GEMS.ruby), L.GEMS.ruby);
const sapphire = () => gemTile('sapphire', L.gemStep('sa', MID, 38, 27.5, L.GEMS.sapphire, 8, Math.PI / 8), L.GEMS.sapphire);
const emerald = () => gemTile('emerald', L.gemStep('em', MID, 38, 28, L.GEMS.emerald, 6, Math.PI / 6), L.GEMS.emerald);

/** The sandstone tile behind a letter: a carved stone block with a little grain. */
const stoneDefs = () => `${L.gradient('stone', [[0, '#e8cfa0'], [0.5, '#cfae78'], [1, '#a8824c']])}${L.stoneGrain('grain', { freq: 1.4, seed: 5, dark: 0.22 })}`;
const stoneTile = () => `<g filter="url(#gDrop)">
    <rect x="2.5" y="2" width="${W - 5}" height="${H - 5}" rx="5" fill="url(#stone)"/>
    <rect x="2.5" y="2" width="${W - 5}" height="${H - 5}" rx="5" fill="#000" filter="url(#grain)" opacity="0.9"/>
    <rect x="6" y="5.5" width="${W - 12}" height="${H - 12}" rx="3" fill="none" stroke="#7a5426" stroke-opacity="0.55" stroke-width="1.2"/>
    <rect x="3" y="2.5" width="${W - 6}" height="${H - 6}" rx="4.5" fill="none" stroke="#fff3d6" stroke-opacity="0.55" stroke-width="0.8"/>
  </g>`;

/** A gold serif letter with a small gem set in it. */
function letter(ch, gemColors, gx, gy, dx = 0) {
  const gem = L.cabochon('lg', gx, gy, 4.6, gemColors);
  return {
    defs: `${L.gradient('lt', [[0, '#fff7cf'], [0.25, '#ffd660'], [0.55, '#d6900e'], [0.8, '#8a4d04'], [1, '#e8b23a']])}${gem.defs}${stoneDefs()}`,
    body: `${stoneTile()}
      <g filter="url(#gDrop)">
        <g filter="url(#gBev)">
          <text x="${MID + dx}" y="64" text-anchor="middle" font-family="Liberation Serif" font-weight="700" font-size="66" fill="url(#lt)" stroke="#4a2602" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round">${ch}</text>
        </g>
        ${gem.body}
      </g>`,
  };
}
const A = () => letter('A', L.GEMS.ruby, MID, 47);
const K = () => letter('K', L.GEMS.amethyst, MID + 1.5, 36.5, 1);
const Q = () => letter('Q', L.GEMS.sapphire, MID, 37);
const J = () => letter('J', L.GEMS.emerald, MID + 6.5, 23, 2);

/** The WILD: the golden Garuda mask (crown, fierce eyes, hooked beak, flaring feathers) and the word WILD. */
function wild() {
  const cx = MID;
  // the feathers that flare from the sides of the face (right side; mirrored for the left)
  const feather = (x0, y0, len, ang, wdt) => {
    const a = (ang * Math.PI) / 180;
    const tip = [x0 + Math.cos(a) * len, y0 - Math.sin(a) * len];
    const nx = -Math.sin(a) * wdt, ny = -Math.cos(a) * wdt;
    return `M${x0} ${y0} Q ${x0 + Math.cos(a) * len * 0.5 + nx} ${y0 - Math.sin(a) * len * 0.5 + ny} ${tip[0]} ${tip[1]} Q ${x0 + Math.cos(a) * len * 0.45 - nx * 0.4} ${y0 - Math.sin(a) * len * 0.45 - ny * 0.4} ${x0} ${y0 + 3} Z`;
  };
  const side = [
    feather(62, 30, 26, 38, 5),
    feather(63, 38, 28, 18, 5.5),
    feather(63, 46, 26, -2, 5),
    feather(61, 52, 20, -22, 4.5),
  ];
  const mirror = (d) => `<path d="${d}" transform="translate(${cx * 2} 0) scale(-1 1)"/>`;
  const head = L.mirrored(cx, [
    [0, 17],
    [10, 18],
    [17, 24],
    [19, 34],
    [17, 45],
    [12, 54],
    [5, 60],
    [0, 62],
  ]);
  const crown = `M${cx - 15} 22 L ${cx - 15} 15 L ${cx - 11} 11 L ${cx - 7} 14 L ${cx - 4} 5 L ${cx} 0.8 L ${cx + 4} 5 L ${cx + 7} 14 L ${cx + 11} 11 L ${cx + 15} 15 L ${cx + 15} 22 Z`;
  const beak = `M${cx - 7} 33 C ${cx - 7} 40, ${cx - 4} 47, ${cx - 2.4} 52 C ${cx - 1.6} 55, ${cx - 0.6} 58, ${cx} 60 C ${cx + 0.6} 58, ${cx + 1.6} 55, ${cx + 2.4} 52 C ${cx + 4} 47, ${cx + 7} 40, ${cx + 7} 33 C ${cx + 4} 30.5, ${cx - 4} 30.5, ${cx - 7} 33 Z`;
  const eye = (x, flip) => `<g transform="translate(${x} 33) scale(${flip} 1)">
      <path d="M-7 1 C -4 -3.5, 3 -4, 6.5 -1 C 4 2.5, -3 3.5, -7 1 Z" fill="#2a0800"/>
      <path d="M-5.6 0.8 C -3 -2.2, 2.5 -2.6, 5 -0.8 C 3 1.6, -2.4 2.4, -5.6 0.8 Z" fill="url(#eyeGlow)"/>
      <circle cx="0.6" cy="-0.1" r="1.2" fill="#2a0300"/>
      <path d="M-8.5 -3.5 L 7 -6.5 L 7.5 -4.4 L -8 -1.6 Z" fill="url(#gGoldDeep)"/>
    </g>`;
  return {
    defs: `${L.radial('eyeGlow', [[0, '#fff3a0'], [0.45, '#ff9a10'], [1, '#d81e00']])}
      ${L.gradient('wildRed', [[0, '#ff8a7a'], [0.4, '#ff1f2e'], [0.75, '#b0000f'], [1, '#6a0008']])}
      ${L.radial('wildHalo', [[0, '#ffdc6a', 0.55], [1, '#ffdc6a', 0]])}
      ${L.radial('wildField', [[0, '#d8202a'], [0.6, '#7a0610'], [1, '#2a0004']], { cx: 0.5, cy: 0.42, r: 0.75 })}`,
    body: `<g filter="url(#gDrop)">${L.goldTile(2.5, 2, W - 5, H - 5, { r: 8, rim: 4, inner: 'url(#wildField)' })}</g>
      <ellipse cx="${cx}" cy="36" rx="40" ry="30" fill="url(#wildHalo)"/>
      <g filter="url(#gDrop)">
        <g filter="url(#gBev)" fill="url(#gGoldD)">
          ${side.map((d) => `<path d="${d}"/>`).join('')}
          ${side.map(mirror).join('')}
        </g>
        <g fill="none" stroke="#7a4304" stroke-width="0.8" opacity="0.8">${side.map((d) => `<path d="${d}"/>`).join('')}${side.map((d) => mirror(d).replace('<path ', '<path fill="none" ')).join('')}</g>
        <g filter="url(#gBev)">
          <path d="${head}" fill="url(#gGold)"/>
          <path d="${crown}" fill="url(#gGold)"/>
          <rect x="${cx - 16}" y="20" width="32" height="5" rx="1.5" fill="url(#gGoldDeep)"/>
        </g>
        <path d="M${cx - 13} 46 C ${cx - 8} 52, ${cx - 4} 55, ${cx} 56 C ${cx + 4} 55, ${cx + 8} 52, ${cx + 13} 46" fill="none" stroke="#7a4304" stroke-width="1" opacity="0.7"/>
        ${eye(cx - 9.5, 1)}${eye(cx + 9.5, -1)}
        <g filter="url(#gBev)"><path d="${beak}" fill="url(#gGold)"/></g>
        <path d="M${cx} 35 L ${cx} 58" stroke="#7a4304" stroke-width="0.7" opacity="0.6"/>
        ${L.cabochon('wg1', cx, 17, 2.6, L.GEMS.ruby).body}${L.cabochon('wg2', cx - 9, 22.5, 1.8, L.GEMS.emerald).body}${L.cabochon('wg3', cx + 9, 22.5, 1.8, L.GEMS.emerald).body}
      </g>
      <g filter="url(#gDrop)">
        <text x="${cx}" y="74" text-anchor="middle" font-family="Liberation Serif" font-weight="700" font-size="21" letter-spacing="1.5" fill="url(#wildRed)" stroke="url(#gGold)" stroke-width="3.4" paint-order="stroke" stroke-linejoin="round">WILD</text>
      </g>`,
  };
}
// the gems on the crown need their gradients
const wildPiece = () => {
  const w = wild();
  return { defs: w.defs + L.cabochon('wg1', 0, 0, 1, L.GEMS.ruby).defs + L.cabochon('wg2', 0, 0, 1, L.GEMS.emerald).defs + L.cabochon('wg3', 0, 0, 1, L.GEMS.emerald).defs, body: w.body };
};

module.exports = [
  piece('ruby', ruby),
  piece('sapphire', sapphire),
  piece('emerald', emerald),
  piece('a', A),
  piece('k', K),
  piece('q', Q),
  piece('j', J),
  piece('wild', wildPiece),
];
