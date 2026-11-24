// The golden Garuda (412 x 300 units, the frame of the scene, transparent): an original guardian of the temple with raised
// wings of gold feathers, a tall crown, a fierce bird face with a hooked beak, a strong gold body, arm bands and a jewelled belt.
const L = require('./_lib');

const W = 412;
const H = 300;
const CX = 206;

/** A feather in local coordinates: from its quill at (0,0) along +x, `len` long, `wid` wide, with a rounded tip. */
function featherPath(len, wid) {
  const w = wid / 2;
  return `M0 ${-w * 0.45} C ${len * 0.3} ${-w * 1.05}, ${len * 0.78} ${-w * 1.08}, ${len * 0.93} ${-w * 0.62} Q ${len * 1.03} 0 ${len * 0.93} ${w * 0.62} C ${len * 0.78} ${w * 1.08}, ${len * 0.3} ${w * 1.05}, 0 ${w * 0.45} Z`;
}

/** A fan of feathers from (ox, oy); angles in degrees above the horizontal, pointing right. */
function fan({ ox, oy, from, to, n, start, len, wid, fill, barbs = true }) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const ang = from + (to - from) * t;
    const l = typeof len === 'function' ? len(ang) : len;
    const rad = (ang * Math.PI) / 180;
    const x = ox + Math.cos(rad) * start;
    const y = oy - Math.sin(rad) * start;
    const barb = barbs
      ? [0.35, 0.55, 0.75].map((f) => `<path d="M${(l * f).toFixed(1)} 0 L ${(l * f + wid * 0.32).toFixed(1)} ${(-wid * 0.36).toFixed(1)} M${(l * f).toFixed(1)} 0 L ${(l * f + wid * 0.32).toFixed(1)} ${(wid * 0.36).toFixed(1)}"/>`).join('')
      : '';
    out += `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(-ang).toFixed(2)})">
      <path d="${featherPath(l, wid)}" fill="${fill}" stroke="#7a4306" stroke-width="0.9"/>
      <path d="M${(l * 0.05).toFixed(1)} 0 L ${(l * 0.9).toFixed(1)} 0" stroke="#7a4306" stroke-width="1" opacity="0.75"/>
      <g stroke="#8a5208" stroke-width="0.6" opacity="0.55">${barb}</g>
    </g>`;
  }
  return out;
}

// the right wing's layers (the left wing is the same, mirrored); the fan's origin hides behind the shoulder
const O = { ox: 238, oy: 138 };
const outline = (ang) => 118 + 58 * Math.sin((Math.PI * (ang + 32)) / 104);
const wingLayers = [
  { make: () => fan({ ...O, fill: 'url(#fBack)', from: -32, to: 72, n: 16, start: 24, len: outline, wid: 27 }) },
  { make: () => fan({ ...O, fill: 'url(#fMid)', from: -28, to: 70, n: 14, start: 20, len: (a) => outline(a) * 0.68, wid: 25 }) },
  { make: () => fan({ ...O, fill: 'url(#fFront)', from: -24, to: 68, n: 11, start: 16, len: (a) => outline(a) * 0.42, wid: 24, barbs: false }) },
  { make: () => fan({ ...O, fill: 'url(#fFront)', from: -16, to: 62, n: 8, start: 10, len: (a) => outline(a) * 0.24, wid: 22, barbs: false }) },
];
const mirror = (svg) => `<g transform="translate(${W} 0) scale(-1 1)">${svg}</g>`;

/** Both wings, layer by layer (the bevel is applied outside the mirror, so both wings are lit from the same side). */
function wings() {
  return wingLayers
    .map((layer, i) => `<g filter="url(#layerShade)"><g filter="url(#${i < 2 ? 'gBevSoft' : 'gBev'})">${layer.make()}${mirror(layer.make())}</g></g>`)
    .join('');
}

/** The body: torso, chest, abdomen, arms, belt and cloth. */
function body() {
  const torso = L.mirrored(CX, [
    [0, 116],
    [24, 117],
    [42, 122],
    [50, 132],
    [48, 150],
    [43, 170],
    [37, 192],
    [33, 212],
    [32, 230],
    [0, 232],
  ]);
  const pec = (sx) => `<path d="M${CX + sx * 2} 134 C ${CX + sx * 14} 127, ${CX + sx * 34} 128, ${CX + sx * 42} 140 C ${CX + sx * 44} 150, ${CX + sx * 36} 160, ${CX + sx * 20} 161 C ${CX + sx * 10} 161, ${CX + sx * 3} 156, ${CX + sx * 2} 150 Z" fill="url(#pec)"/>`;
  const arm = (sx) => {
    const s = (x) => CX + sx * x;
    return `<path d="M${s(42)} 124 C ${s(56)} 122, ${s(66)} 134, ${s(68)} 150 C ${s(70)} 166, ${s(68)} 182, ${s(64)} 198 C ${s(66)} 212, ${s(70)} 228, ${s(72)} 244 L ${s(58)} 246 C ${s(54)} 230, ${s(50)} 214, ${s(48)} 200 C ${s(46)} 184, ${s(44)} 166, ${s(40)} 150 Z" fill="url(#limb${sx > 0 ? 'R' : 'L'})"/>
      <path d="M${s(55)} 244 C ${s(53)} 254, ${s(55)} 264, ${s(62)} 266 L ${s(72)} 266 C ${s(78)} 264, ${s(80)} 254, ${s(77)} 246 C ${s(74)} 241, ${s(62)} 240, ${s(55)} 244 Z" fill="url(#limb${sx > 0 ? 'R' : 'L'})"/>
      <path d="M${s(55)} 248 C ${s(50)} 250, ${s(50)} 257, ${s(56)} 258 Z" fill="url(#limb${sx > 0 ? 'R' : 'L'})"/>`;
  };
  const armLines = (sx) => {
    const s = (x) => CX + sx * x;
    return `<path d="M${s(46)} 150 C ${s(54)} 160, ${s(60)} 168, ${s(64)} 186" /><path d="M${s(60)} 252 L ${s(60)} 265"/><path d="M${s(66)} 251 L ${s(66)} 266"/><path d="M${s(72)} 251 L ${s(72)} 265"/>`;
  };
  return `
    <g filter="url(#gBev)">
      ${arm(1)}${arm(-1)}
      <path d="${torso}" fill="url(#skin)"/>
    </g>
    <path d="${torso}" fill="url(#skinSides)"/>
    <g filter="url(#gBevSoft)">${pec(1)}${pec(-1)}</g>
    <g fill="none" stroke="#7a4306" stroke-linecap="round">
      <path d="M${CX} 136 L ${CX} 222" stroke-width="1.4" opacity="0.6"/>
      <path d="M${CX - 34} 158 C ${CX - 22} 166, ${CX - 8} 164, ${CX} 160 C ${CX + 8} 164, ${CX + 22} 166, ${CX + 34} 158" stroke-width="1.6" opacity="0.75"/>
      <path d="M${CX - 20} 180 Q ${CX - 10} 184 ${CX} 181 Q ${CX + 10} 184 ${CX + 20} 180" stroke-width="1.2" opacity="0.6"/>
      <path d="M${CX - 19} 197 Q ${CX - 10} 201 ${CX} 198 Q ${CX + 10} 201 ${CX + 19} 197" stroke-width="1.2" opacity="0.6"/>
      <path d="M${CX - 18} 212 Q ${CX - 10} 216 ${CX} 213 Q ${CX + 10} 216 ${CX + 18} 212" stroke-width="1.1" opacity="0.55"/>
      <path d="M${CX - 34} 170 C ${CX - 30} 190, ${CX - 26} 206, ${CX - 22} 222" stroke-width="1.1" opacity="0.5"/>
      <path d="M${CX + 34} 170 C ${CX + 30} 190, ${CX + 26} 206, ${CX + 22} 222" stroke-width="1.1" opacity="0.5"/>
      <g stroke-width="1" opacity="0.6">${armLines(1)}${armLines(-1)}</g>
    </g>
    <g fill="#fff4c0" opacity="0.35"><ellipse cx="${CX - 22}" cy="139" rx="12" ry="4" transform="rotate(-8 ${CX - 22} 139)"/><ellipse cx="${CX + 22}" cy="139" rx="12" ry="4" transform="rotate(8 ${CX + 22} 139)"/></g>
    <!-- arm bands and bracelets -->
    <g filter="url(#gBev)">
      <path d="M${CX + 44} 152 C ${CX + 52} 149, ${CX + 62} 149, ${CX + 69} 152 L ${CX + 69} 161 C ${CX + 62} 158, ${CX + 52} 158, ${CX + 45} 161 Z" fill="url(#gGoldDeep)"/>
      <path d="M${CX - 44} 152 C ${CX - 52} 149, ${CX - 62} 149, ${CX - 69} 152 L ${CX - 69} 161 C ${CX - 62} 158, ${CX - 52} 158, ${CX - 45} 161 Z" fill="url(#gGoldDeep)"/>
      <rect x="${CX + 55}" y="232" width="19" height="8" rx="3" fill="url(#gGoldDeep)"/>
      <rect x="${CX - 74}" y="232" width="19" height="8" rx="3" fill="url(#gGoldDeep)"/>
    </g>
    ${L.cabochon('ab1', CX + 57, 155, 3.6, L.GEMS.amethyst).body}${L.cabochon('ab2', CX - 57, 155, 3.6, L.GEMS.amethyst).body}
    ${L.cabochon('br1', CX + 64.5, 236, 2.8, L.GEMS.emerald).body}${L.cabochon('br2', CX - 64.5, 236, 2.8, L.GEMS.emerald).body}
    <!-- the belt and the cloth -->
    <g filter="url(#gBev)">
      <path d="M${CX - 38} 224 C ${CX - 12} 228, ${CX + 12} 228, ${CX + 38} 224 L ${CX + 40} 240 C ${CX + 12} 244, ${CX - 12} 244, ${CX - 40} 240 Z" fill="url(#gGoldDeep)"/>
      <path d="M${CX - 21} 242 L ${CX + 21} 242 L ${CX + 17} 300 L ${CX - 17} 300 Z" fill="url(#cloth)"/>
    </g>
    <g filter="url(#gBevSoft)">
      <path d="M${CX - 40} 240 C ${CX - 44} 262, ${CX - 46} 282, ${CX - 47} 300 L ${CX - 19} 300 L ${CX - 22} 242 Z" fill="url(#thigh)"/>
      <path d="M${CX + 40} 240 C ${CX + 44} 262, ${CX + 46} 282, ${CX + 47} 300 L ${CX + 19} 300 L ${CX + 22} 242 Z" fill="url(#thigh)"/>
    </g>
    <g stroke="#7a4306" stroke-width="0.9" fill="none" opacity="0.6"><path d="M${CX - 19} 256 L ${CX + 19} 256"/><path d="M${CX - 18} 270 L ${CX + 18} 270"/><path d="M${CX - 17} 284 L ${CX + 17} 284"/></g>
    ${L.cabochon('belt', CX, 233, 6.4, L.GEMS.emerald).body}
    ${L.cabochon('bl1', CX - 25, 232, 3.4, L.GEMS.sapphire).body}${L.cabochon('bl2', CX + 25, 232, 3.4, L.GEMS.sapphire).body}
    <path d="M${CX} 256 L ${CX + 7} 266 L ${CX} 276 L ${CX - 7} 266 Z" fill="url(#amethystCut)" stroke="#fff3c0" stroke-width="1.2"/>
    <path d="M${CX} 280 L ${CX + 6} 289 L ${CX} 298 L ${CX - 6} 289 Z" fill="url(#amethystCut)" stroke="#fff3c0" stroke-width="1.2"/>`;
}

/** The head: a collar of feathers, the bird face, the crown and the necklace. */
function head() {
  const collar = (y, n, r, len, wid) => {
    let out = '';
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const ang = -168 + 156 * t; // pointing down and out, all round the neck
      const rad = (ang * Math.PI) / 180;
      const x = CX + Math.cos(rad) * r * 1.25;
      const yy = y - Math.sin(rad) * r * 0.55;
      out += `<g transform="translate(${x.toFixed(2)} ${yy.toFixed(2)}) rotate(${(-ang).toFixed(2)})"><path d="${featherPath(len, wid)}" fill="url(#fFront)" stroke="#7a4306" stroke-width="0.8"/></g>`;
    }
    return out;
  };
  const face = L.mirrored(CX, [
    [0, 46],
    [15, 47],
    [24, 55],
    [27, 68],
    [25, 83],
    [18, 96],
    [9, 104],
    [0, 107],
  ]);
  const crest = (sx) =>
    [
      [22, 64, 30, 34],
      [24, 74, 30, 14],
      [23, 84, 26, -4],
    ]
      .map(([x, y, len, ang]) => `<g transform="translate(${CX + sx * x} ${y}) scale(${sx} 1) rotate(${-ang})"><path d="${featherPath(len, 13)}" fill="url(#fFront)" stroke="#7a4306" stroke-width="0.8"/><path d="M2 0 L ${len * 0.85} 0" stroke="#7a4306" stroke-width="0.8" opacity="0.7"/></g>`)
      .join('');
  const crown = `M${CX - 22} 52 L ${CX - 22} 42 L ${CX - 17} 36 L ${CX - 13} 38 L ${CX - 11} 26 L ${CX - 6} 21 L ${CX - 4} 9 L ${CX} -1 L ${CX + 4} 9 L ${CX + 6} 21 L ${CX + 11} 26 L ${CX + 13} 38 L ${CX + 17} 36 L ${CX + 22} 42 L ${CX + 22} 52 Z`;
  const beak = `M${CX - 9} 72 C ${CX - 9.5} 82, ${CX - 6} 92, ${CX - 3} 99 C ${CX - 1.8} 103, ${CX - 1} 107, ${CX + 0.6} 111 C ${CX + 2.4} 106, ${CX + 3.6} 101, ${CX + 4} 96 C ${CX + 6.5} 90, ${CX + 9.5} 81, ${CX + 9} 72 C ${CX + 5} 68.5, ${CX - 5} 68.5, ${CX - 9} 72 Z`;
  const eye = (x, flip) => `<g transform="translate(${x} 67) scale(${flip} 1)">
      <path d="M-10.5 1.6 C -5.5 -5, 5 -5.6, 9.5 -1.2 C 5.6 3.6, -4.8 5, -10.5 1.6 Z" fill="#2a0800"/>
      <path d="M-8.6 1.2 C -4.6 -3.4, 3.8 -4, 7.6 -1 C 4.4 2.4, -3.6 3.6, -8.6 1.2 Z" fill="url(#eyeGlow)"/>
      <circle cx="0.8" cy="-0.1" r="1.8" fill="#2a0300"/>
      <circle cx="-2" cy="-1.3" r="0.8" fill="#fff" opacity="0.9"/>
      <path d="M-12.5 -5 L 10.5 -9.4 L 11.4 -6 L -11.6 -2.2 Z" fill="url(#gGoldDeep)"/>
    </g>`;
  return `
    <g filter="url(#gBevSoft)">${collar(112, 15, 26, 30, 15)}${collar(118, 13, 20, 24, 14)}</g>
    <!-- the necklace over the collar -->
    <path d="M${CX - 34} 124 C ${CX - 24} 142, ${CX + 24} 142, ${CX + 34} 124" fill="none" stroke="url(#gGold)" stroke-width="5.6" stroke-dasharray="0.1 6.2" stroke-linecap="round" filter="url(#gBev)"/>
    <g filter="url(#gBev)"><path d="M${CX - 8} 138 L ${CX + 8} 138 L ${CX + 9} 150 L ${CX} 158 L ${CX - 9} 150 Z" fill="url(#gGold)"/></g>
    ${L.cabochon('pend', CX, 148, 4.6, L.GEMS.ruby).body}
    <g filter="url(#gBev)">
      ${crest(1)}${crest(-1)}
      <path d="${face}" fill="url(#gGold)"/>
      <path d="${crown}" fill="url(#gGold)"/>
      <path d="M${CX - 24} 48 C ${CX - 10} 45, ${CX + 10} 45, ${CX + 24} 48 L ${CX + 24} 56 C ${CX + 10} 53, ${CX - 10} 53, ${CX - 24} 56 Z" fill="url(#gGoldDeep)"/>
      <path d="M${CX - 20} 42 L ${CX + 20} 42" stroke="url(#gGoldDeep)" stroke-width="2.4"/>
      <path d="M${CX - 12} 29 L ${CX + 12} 29" stroke="url(#gGoldDeep)" stroke-width="2"/>
    </g>
    <g fill="none" stroke="#7a4306" stroke-width="1" opacity="0.6">
      <path d="M${CX - 19} 88 C ${CX - 12} 96, ${CX - 6} 100, ${CX} 101 C ${CX + 6} 100, ${CX + 12} 96, ${CX + 19} 88"/>
      <path d="M${CX - 23} 76 C ${CX - 17} 80, ${CX - 13} 80, ${CX - 10} 78"/><path d="M${CX + 23} 76 C ${CX + 17} 80, ${CX + 13} 80, ${CX + 10} 78"/>
    </g>
    ${eye(CX - 14, 1)}${eye(CX + 14, -1)}
    <g filter="url(#gBev)"><path d="${beak}" fill="url(#beak)"/></g>
    <path d="M${CX - 5} 76 C ${CX - 4} 86, ${CX - 2.5} 96, ${CX - 1} 104" stroke="#fff7d0" stroke-width="1.4" opacity="0.6" fill="none"/>
    <ellipse cx="${CX - 3.5}" cy="78" rx="1.3" ry="2.2" fill="#5a2a02" opacity="0.8"/><ellipse cx="${CX + 3.5}" cy="78" rx="1.3" ry="2.2" fill="#5a2a02" opacity="0.8"/>
    ${L.cabochon('cr1', CX, 33, 4.2, L.GEMS.ruby).body}${L.cabochon('cr2', CX - 13, 50.5, 2.6, L.GEMS.emerald).body}${L.cabochon('cr3', CX + 13, 50.5, 2.6, L.GEMS.emerald).body}
    ${L.cabochon('cr4', CX, 13, 2.2, L.GEMS.sapphire).body}${L.cabochon('cr5', CX - 17, 41.5, 2, L.GEMS.amethyst).body}${L.cabochon('cr6', CX + 17, 41.5, 2, L.GEMS.amethyst).body}`;
}

const gemDefs = () =>
  [
    ['ab1', 'amethyst'], ['ab2', 'amethyst'], ['br1', 'emerald'], ['br2', 'emerald'], ['belt', 'emerald'], ['bl1', 'sapphire'], ['bl2', 'sapphire'],
    ['pend', 'ruby'], ['cr1', 'ruby'], ['cr2', 'emerald'], ['cr3', 'emerald'], ['cr4', 'sapphire'], ['cr5', 'amethyst'], ['cr6', 'amethyst'],
  ]
    .map(([id, g]) => L.cabochon(id, 0, 0, 1, L.GEMS[g]).defs)
    .join('');

module.exports = {
  width: W,
  height: H,
  scale: 2.5,
  out: 'assets/garuda/hero.webp',
  quality: 88,
  svg: () =>
    L.svg(
      W,
      H,
      `
  <ellipse cx="${CX}" cy="140" rx="205" ry="150" fill="url(#aura)"/>
  <g filter="url(#heroShadow)">
    ${wings()}
    ${body()}
    ${head()}
  </g>
  ${[[206, -1, 7], [112, 46, 6], [300, 46, 6], [60, 120, 5], [352, 120, 5], [150, 128, 4], [262, 128, 4], [232, 236, 4]]
    .map(([x, y, r]) => `<path d="M${x} ${y - r} L ${x + r * 0.22} ${y - r * 0.22} L ${x + r} ${y} L ${x + r * 0.22} ${y + r * 0.22} L ${x} ${y + r} L ${x - r * 0.22} ${y + r * 0.22} L ${x - r} ${y} L ${x - r * 0.22} ${y - r * 0.22} Z" fill="#fffbe0" opacity="0.95" filter="url(#glint)"/>`)
    .join('')}
`,
      `${L.goldDefs()}${gemDefs()}
  ${L.radial('aura', [[0, '#ffe9a0', 0.6], [0.45, '#ffc050', 0.25], [1, '#ff9a30', 0]])}
  ${L.gradient('fBack', [[0, '#6a3804'], [0.45, '#a8680e'], [0.85, '#dc9a24'], [1, '#f0bc48']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('fMid', [[0, '#9a5a0a'], [0.5, '#e6a62a'], [0.9, '#ffd660'], [1, '#ffe48a']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('fFront', [[0, '#c8821a'], [0.5, '#f8c84a'], [1, '#ffe48c']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('skin', [[0, '#ffe07a'], [0.45, '#eeae30'], [1, '#b06a10']])}
  ${L.gradient('skinSides', [[0, '#7a4306', 0.55], [0.22, '#7a4306', 0], [0.78, '#7a4306', 0], [1, '#7a4306', 0.55]], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.radial('pec', [[0, '#ffefaa'], [0.6, '#f2b43c'], [1, '#c07a14']], { cx: 0.45, cy: 0.3, r: 0.85 })}
  ${L.gradient('limbR', [[0, '#ffe590'], [0.45, '#eaa628'], [1, '#93540a']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('limbL', [[0, '#93540a'], [0.55, '#eaa628'], [1, '#ffe590']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('thigh', [[0, '#f6c450'], [1, '#9a5a0c']])}
  ${L.gradient('cloth', [[0, '#f8cc58'], [1, '#a8620c']])}
  ${L.gradient('beak', [[0, '#fff2b0'], [0.4, '#f6c13e'], [1, '#a8620c']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('amethystCut', [[0, '#f0c4ff'], [0.5, '#9a2ae8'], [1, '#4a0890']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.radial('eyeGlow', [[0, '#fff6b0'], [0.45, '#ff9a10'], [1, '#e01e00']])}
  <filter id="glint" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="0.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="layerShade" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#3a1800" flood-opacity="0.55"/></filter>
  <filter id="heroShadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#2a0a00" flood-opacity="0.55"/></filter>`
    ),
};
