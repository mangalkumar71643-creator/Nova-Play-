// The Home-screen tile of Ring Gauntlet (the size of the other game icons): the three rings in their colours round the sentinel, and the name.
const L = require('./_lib');

const arcPath = (cx, cy, r, a0, a1) => {
  const p = (a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

module.exports = {
  width: 171,
  height: 175,
  scale: 2,
  out: 'assets/icons/ring-gauntlet.webp',
  quality: 92,
  svg: () => {
    const g = L.sentinel('s', 'MIDDLE', 'ready');
    const cx = 85.5, cy = 76;
    let rings = '';
    // three tracks of segments (8, 6 and 4), the first ones lit like a climb in progress
    const tracks = [
      { r: 63, n: 8, c: L.RING.OUTER, lit: 2 },
      { r: 49, n: 6, c: L.RING.MIDDLE, lit: 3 },
      { r: 36, n: 4, c: L.RING.INNER, lit: 1 },
    ];
    for (const t of tracks) {
      const step = 360 / t.n;
      for (let i = 0; i < t.n; i++) {
        const on = i < t.lit;
        const a0 = i * step + 3.2, a1 = (i + 1) * step - 3.2;
        rings += `<path d="${arcPath(cx, cy, t.r, a0, a1)}" fill="none" stroke="${on ? t.c.main : '#2d2f39'}" stroke-width="9" stroke-linecap="butt"${on ? ' filter="url(#lit)"' : ''}/>`;
        if (on) rings += `<path d="${arcPath(cx, cy, t.r - 2.2, a0 + 1, a1 - 1)}" fill="none" stroke="${t.c.light}" stroke-opacity="0.55" stroke-width="1.6"/>`;
      }
    }
    return L.svg(171, 175, `
  <g clip-path="url(#clip)">
    <rect width="171" height="175" fill="url(#bg)"/>
    <circle cx="${cx}" cy="${cy}" r="76" fill="url(#halo)"/>
    ${rings}
    <g transform="translate(${cx - 26} ${cy - 26}) scale(${52 / 120})">${g.body}</g>
    <rect y="118" width="171" height="57" fill="url(#low)"/>
  </g>
  <rect x="1.5" y="1.5" width="168" height="172" rx="16" fill="none" stroke="url(#rim)" stroke-width="2.8"/>
  <text x="85.5" y="150" text-anchor="middle" font-family="Inter" font-weight="900" font-size="25" letter-spacing="1" fill="#fff" stroke="#000" stroke-width="4.2" paint-order="stroke">RING</text>
  <text x="85.5" y="167" text-anchor="middle" font-family="Inter" font-weight="900" font-size="13.5" letter-spacing="3.4" fill="url(#hot)" stroke="#000" stroke-width="3.2" paint-order="stroke">GAUNTLET</text>
  <g filter="url(#drop)"><rect x="5" y="5" width="34" height="14" rx="7" fill="#27b45e" stroke="#c8ffd8" stroke-width=".9"/></g>
  <text x="22" y="15.2" text-anchor="middle" font-family="Inter" font-weight="900" font-size="8.4" fill="#fff">NEW</text>
`, `${g.defs}
  <clipPath id="clip"><rect x="1.5" y="1.5" width="168" height="172" rx="16"/></clipPath>
  ${L.gradient('rim', [[0, '#ff9fc4'], [0.5, '#e0356f'], [1, '#ff8fb8']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gradient('bg', [[0, '#26262e'], [1, '#0b0b0e']])}
  ${L.radial('halo', [[0, '#5a5b6a', 0.5], [1, '#2a2b33', 0]])}
  ${L.gradient('low', [[0, '#000', 0], [1, '#000', 0.88]])}
  ${L.gradient('hot', [[0, '#ffd1e3'], [0.5, '#ff5c9d'], [1, '#d6155f']])}
  <filter id="lit" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="0" stdDeviation="2" flood-color="#fff" flood-opacity="0.5"/></filter>
  ${L.dropShadow('drop', 2, 2, 0.6)}
`);
  },
};
