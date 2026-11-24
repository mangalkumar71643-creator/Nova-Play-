// The reel housing of Garuda Gold (local units; the screen puts its top at y = 334 of the 412-wide machine):
//   frame        412 x 248  carved temple stone round the reels, gold trim, the steps below, transparent openings
//   reels-bg     294 x 228  the dark backing behind the three reels' tiles
//   mult-bg       76 x 228  the red, gold-patterned column of the multiplier reel
//   mult-window   82 x 52   the gold frame of the centre coin (the one that counts)
const L = require('./_lib');

const REELS = { x: 16, y: 8, w: 294, h: 228 };
const MULT = { x: 320, y: 8, w: 76, h: 228 };

/** A carved stone surface: the stone colour, grain and the block joints. */
const stoneDefs = () => `${L.gradient('stoneV', [[0, '#a8733e'], [0.5, '#7a4a22'], [1, '#4a2a10']])}
  ${L.gradient('stoneH', [[0, '#5a3214'], [0.5, '#9a6634'], [1, '#5a3214']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.stoneGrain('grain', { freq: 1.1, seed: 9, dark: 0.3 })}`;

const frame = {
  _id: 'frame',
  width: 412,
  height: 248,
  scale: 2.5,
  out: 'assets/garuda/frame.webp',
  quality: 88,
  svg: () => {
    const openR = `M${REELS.x} ${REELS.y} h ${REELS.w} v ${REELS.h} h ${-REELS.w} Z`;
    const openM = `M${MULT.x} ${MULT.y} h ${MULT.w} v ${MULT.h} h ${-MULT.w} Z`;
    return L.svg(
      412,
      248,
      `
  <!-- the stone of the housing, with the two openings cut out (even-odd) -->
  <path d="M0 0 H412 V248 H0 Z ${openR} ${openM}" fill-rule="evenodd" fill="url(#stoneV)"/>
  <g clip-path="url(#stoneOnly)"><rect width="412" height="248" fill="#000" filter="url(#grain)" opacity="0.55"/></g>
  <!-- the steps below the reels -->
  <rect x="0" y="236" width="412" height="12" fill="url(#steps)"/>
  <path d="M0 241 H412" stroke="#2a1406" stroke-opacity="0.6" stroke-width="1"/>
  <path d="M0 236.5 H412" stroke="#f0c080" stroke-opacity="0.35" stroke-width="1"/>
  <!-- carved pillars at the sides and between the reels and the multiplier reel -->
  ${[0, 396].map((x) => `<rect x="${x}" y="0" width="16" height="236" fill="url(#stoneH)"/><path d="M${x + 4} 6 V230 M${x + 12} 6 V230" stroke="#2a1406" stroke-opacity="0.45" stroke-width="1"/>`).join('')}
  <rect x="310" y="0" width="10" height="236" fill="url(#stoneH)"/>
  <!-- gold trim round both openings -->
  <g filter="url(#gBev)" fill="none" stroke="url(#gGoldD)">
    <rect x="${REELS.x - 2}" y="${REELS.y - 2}" width="${REELS.w + 4}" height="${REELS.h + 4}" rx="3" stroke-width="4"/>
    <rect x="${MULT.x - 2}" y="${MULT.y - 2}" width="${MULT.w + 4}" height="${MULT.h + 4}" rx="3" stroke-width="4"/>
  </g>
  <rect x="${REELS.x - 3.5}" y="${REELS.y - 3.5}" width="${REELS.w + 7}" height="${REELS.h + 7}" rx="4" fill="none" stroke="#2a1406" stroke-width="1"/>
  <rect x="${MULT.x - 3.5}" y="${MULT.y - 3.5}" width="${MULT.w + 7}" height="${MULT.h + 7}" rx="4" fill="none" stroke="#2a1406" stroke-width="1"/>
  <!-- small gold studs on the pillars -->
  <g filter="url(#gBev)" fill="url(#gGold)">${[30, 122, 214].map((y) => `<circle cx="8" cy="${y}" r="3"/><circle cx="404" cy="${y}" r="3"/><circle cx="315" cy="${y}" r="2.6"/>`).join('')}</g>
  <!-- the inner shade of the openings (the reels sit a little deep) -->
  <rect x="${REELS.x}" y="${REELS.y}" width="${REELS.w}" height="10" fill="url(#shadeTop)"/>
  <rect x="${REELS.x}" y="${REELS.y + REELS.h - 10}" width="${REELS.w}" height="10" fill="url(#shadeBottom)"/>
  <rect x="${MULT.x}" y="${MULT.y}" width="${MULT.w}" height="14" fill="url(#shadeTop)"/>
  <rect x="${MULT.x}" y="${MULT.y + MULT.h - 14}" width="${MULT.w}" height="14" fill="url(#shadeBottom)"/>
`,
      `${L.goldDefs()}${stoneDefs()}
  <clipPath id="stoneOnly"><path d="M0 0 H412 V248 H0 Z ${openR} ${openM}" clip-rule="evenodd"/></clipPath>
  ${L.gradient('steps', [[0, '#b07a42'], [0.45, '#7a4a22'], [0.5, '#5a3214'], [1, '#3a1e0a']])}
  ${L.gradient('shadeTop', [[0, '#000', 0.55], [1, '#000', 0]])}
  ${L.gradient('shadeBottom', [[0, '#000', 0], [1, '#000', 0.55]])}`
    );
  },
};

const reelsBg = {
  _id: 'reels-bg',
  width: REELS.w,
  height: REELS.h,
  scale: 2.5,
  out: 'assets/garuda/reels-bg.webp',
  quality: 86,
  svg: () =>
    L.svg(
      REELS.w,
      REELS.h,
      `<rect width="${REELS.w}" height="${REELS.h}" fill="url(#back)"/>
  ${[98, 196].map((x) => `<rect x="${x - 1}" y="0" width="2" height="${REELS.h}" fill="#1a0a02" opacity="0.7"/>`).join('')}`,
      `${L.gradient('back', [[0, '#3a200c'], [0.5, '#24120a'], [1, '#3a200c']])}`
    ),
};

const multBg = {
  _id: 'mult-bg',
  width: MULT.w,
  height: MULT.h,
  scale: 2.5,
  out: 'assets/garuda/mult-bg.webp',
  quality: 86,
  svg: () => {
    // a gold lattice of lotus diamonds on deep red
    let pattern = '';
    for (let y = -10; y < MULT.h + 20; y += 22) {
      for (let x = (Math.round(y / 22) % 2) * 19 + 0; x < MULT.w + 20; x += 38) {
        pattern += `<path d="M${x} ${y - 8} L ${x + 6} ${y} L ${x} ${y + 8} L ${x - 6} ${y} Z" fill="none" stroke="#e8a830" stroke-opacity="0.32" stroke-width="1"/><circle cx="${x}" cy="${y}" r="1.4" fill="#ffd060" opacity="0.4"/>`;
      }
    }
    return L.svg(
      MULT.w,
      MULT.h,
      `<rect width="${MULT.w}" height="${MULT.h}" fill="url(#red)"/>
  ${pattern}
  <rect width="${MULT.w}" height="${MULT.h}" fill="url(#redSides)"/>`,
      `${L.gradient('red', [[0, '#7a0c18'], [0.5, '#a8182a'], [1, '#6a0a14']])}
  ${L.gradient('redSides', [[0, '#1a0004', 0.6], [0.25, '#1a0004', 0], [0.75, '#1a0004', 0], [1, '#1a0004', 0.6]], { x1: 0, y1: 0, x2: 1, y2: 0 })}`
    );
  },
};

const multWindow = {
  _id: 'mult-window',
  width: 82,
  height: 52,
  scale: 3,
  out: 'assets/garuda/mult-window.webp',
  quality: 90,
  svg: () =>
    L.svg(
      82,
      52,
      `<g filter="url(#gDrop)"><g filter="url(#gBev)">
    <path d="M4 4 H78 V48 H4 Z M8 8 V44 H74 V8 Z" fill-rule="evenodd" fill="url(#gGoldD)"/>
  </g></g>
  <path d="M8.5 8.5 H73.5 V43.5 H8.5 Z" fill="none" stroke="#5c3304" stroke-width="1"/>
  ${[[4, 4], [78, 4], [4, 48], [78, 48]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="url(#gGold)" filter="url(#gBev)"/>`).join('')}
  <path d="M0 26 L 5 22 L 5 30 Z" fill="url(#gGold)"/><path d="M82 26 L 77 22 L 77 30 Z" fill="url(#gGold)"/>`,
      L.goldDefs()
    ),
};

module.exports = [frame, reelsBg, multBg, multWindow];
