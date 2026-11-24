// The coins of the multiplier reel (48 x 48 units each): a lotus rosette in the colour of the coin's tier round a gold disc
// with its multiplier, and the NUDGE coin. Transparent outside the coin.
const L = require('./_lib');

const S = 48;
const C = 24;

const TIERS = {
  bronze: ['#ffd9a8', '#c8782e', '#7a3e0c', '#3a1a02', '#e9a060'],
  green: L.GEMS.emerald,
  blue: L.GEMS.sapphire,
  red: L.GEMS.ruby,
  purple: L.GEMS.amethyst,
  royal: ['#fffbe0', '#ffc83a', '#c27a08', '#5a1a40', '#ffe680'],
};

function petals(n, r1, r2, w) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const [bx, by] = L.pt(C, C, r1, a);
    const [tx, ty] = L.pt(C, C, r2, a);
    const [lx, ly] = L.pt(C, C, (r1 + r2) / 2, a - w);
    const [rx, ry] = L.pt(C, C, (r1 + r2) / 2, a + w);
    d += `M${bx.toFixed(2)} ${by.toFixed(2)} Q ${lx.toFixed(2)} ${ly.toFixed(2)} ${tx.toFixed(2)} ${ty.toFixed(2)} Q ${rx.toFixed(2)} ${ry.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)} Z `;
  }
  return d;
}

function coin(id, label, tier, { size = 15, glow = false, sub = null } = {}) {
  const [lt, mid, dk, deep] = TIERS[tier];
  return {
    _id: id,
    width: S,
    height: S,
    scale: 3,
    out: `assets/garuda/coin-${id}.webp`,
    quality: 92,
    svg: () =>
      L.svg(
        S,
        S,
        `${glow ? `<circle cx="${C}" cy="${C}" r="24" fill="url(#halo)"/>` : ''}
        <g filter="url(#gDrop)">
          <g filter="url(#gBevSoft)">
            <path d="${petals(16, 14, 23, 0.2)}" fill="url(#pet)"/>
            <path d="${petals(16, 13, 20.5, 0.17)}" transform="rotate(11.25 ${C} ${C})" fill="url(#pet2)"/>
          </g>
          <g filter="url(#gBev)">
            <circle cx="${C}" cy="${C}" r="16" fill="url(#gGoldD)"/>
          </g>
          <circle cx="${C}" cy="${C}" r="13.2" fill="url(#field)"/>
          <circle cx="${C}" cy="${C}" r="13.2" fill="none" stroke="#5c3304" stroke-width="0.8"/>
          <circle cx="${C}" cy="${C}" r="15.6" fill="none" stroke="#fff6c8" stroke-opacity="0.55" stroke-width="0.5"/>
          <text x="${C}" y="${C + size * 0.36 + (sub ? -2 : 0)}" text-anchor="middle" font-family="Liberation Serif" font-style="italic" font-weight="700" font-size="${size}" letter-spacing="-0.4" fill="url(#num)" stroke="#3a1a02" stroke-width="1.7" paint-order="stroke" stroke-linejoin="round">${label}</text>
          ${sub ? `<text x="${C}" y="${C + 9.5}" text-anchor="middle" font-family="Liberation Serif" font-weight="700" font-size="5.6" letter-spacing="0.6" fill="#ffe9a8" stroke="#3a1a02" stroke-width="1" paint-order="stroke">${sub}</text>` : ''}
        </g>`,
        `${L.goldDefs()}
        ${L.radial('pet', [[0.55, lt], [0.8, mid], [1, dk]], { cx: 0.5, cy: 0.5, r: 0.5 })}
        ${L.radial('pet2', [[0.5, mid], [1, deep]], { cx: 0.5, cy: 0.5, r: 0.5 })}
        ${L.radial('field', [[0, mid, 0.9], [0.7, dk], [1, deep]], { cx: 0.45, cy: 0.38, r: 0.7 })}
        ${L.gradient('num', [[0, '#fffbe0'], [0.35, '#ffe07a'], [0.7, '#f0a820'], [1, '#c87a08']])}
        ${L.radial('halo', [[0.55, '#ffe680', 0.75], [1, '#ffe680', 0]])}`
      ),
  };
}

module.exports = [
  coin('x1', '1x', 'bronze', { size: 16 }),
  coin('x2', '2x', 'green', { size: 16 }),
  coin('x3', '3x', 'green', { size: 16 }),
  coin('x5', '5x', 'blue', { size: 16 }),
  coin('x10', '10x', 'blue', { size: 13.5 }),
  coin('x15', '15x', 'red', { size: 13.5 }),
  coin('x20', '20x', 'red', { size: 13.5 }),
  coin('x25', '25x', 'red', { size: 13.5 }),
  coin('x50', '50x', 'purple', { size: 13.5, glow: true }),
  coin('x100', '100x', 'purple', { size: 11, glow: true }),
  coin('x500', '500x', 'royal', { size: 11, glow: true }),
  coin('nudge', '⇧', 'purple', { size: 15, glow: true, sub: 'NUDGE' }),
];
