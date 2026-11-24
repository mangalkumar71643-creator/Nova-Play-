// The buttons of Garuda Gold: the big spin button (a gold disc with a circling arrow round a ruby, in a bronze ring),
// its lit state, the small round bronze buttons (the app draws their icons) and the EX switch (off / on).
const L = require('./_lib');

/** The circling arrow of the spin button: a thick arc with an arrow head. */
function arrow(cx, cy, r, w) {
  const a0 = (-40 * Math.PI) / 180;
  const a1 = (250 * Math.PI) / 180;
  const p = (a, rr) => [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  const [x0, y0] = p(a0, r);
  const [x1, y1] = p(a1, r);
  const [hx, hy] = p(a1, r);
  const tip = p(a1 + 0.42, r);
  const hIn = p(a1, r - w * 1.15);
  const hOut = p(a1, r + w * 1.15);
  return `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="url(#arrowGold)" stroke-width="${w}" stroke-linecap="round"/>
    <path d="M${hIn[0].toFixed(2)} ${hIn[1].toFixed(2)} L ${tip[0].toFixed(2)} ${tip[1].toFixed(2)} L ${hOut[0].toFixed(2)} ${hOut[1].toFixed(2)} Z" fill="url(#arrowGold)"/>
    <circle cx="${hx.toFixed(2)}" cy="${hy.toFixed(2)}" r="0.1" fill="none"/>`;
}

function spin(lit) {
  return {
    _id: lit ? 'spin-lit' : 'spin',
    width: 100,
    height: 100,
    scale: 3,
    out: `assets/garuda/${lit ? 'spin-lit' : 'spin'}.webp`,
    quality: 92,
    svg: () =>
      L.svg(
        100,
        100,
        `
  ${lit ? '<circle cx="50" cy="50" r="50" fill="url(#halo)"/>' : ''}
  <g filter="url(#gDropBig)">
    <g filter="url(#gBev)">
      <circle cx="50" cy="50" r="45" fill="url(#bronze)"/>
      ${Array.from({ length: 24 }, (_, i) => `<rect x="48.6" y="5.5" width="2.8" height="5" rx="1" fill="url(#gGold)" transform="rotate(${i * 15} 50 50)"/>`).join('')}
    </g>
    <circle cx="50" cy="50" r="36" fill="url(#${lit ? 'faceLit' : 'face'})"/>
    <circle cx="50" cy="50" r="36" fill="none" stroke="#5c3304" stroke-width="1.4"/>
    <g filter="url(#gBev)">${arrow(50, 50, 24, 7)}</g>
    ${L.gemRound('sg', 50, 50, 9.5, L.GEMS.ruby).body}
    <ellipse cx="40" cy="30" rx="16" ry="7" fill="#fff" opacity="${lit ? 0.35 : 0.22}" transform="rotate(-25 40 30)"/>
  </g>
`,
        `${L.goldDefs()}${L.gemRound('sg', 0, 0, 1, L.GEMS.ruby).defs}
  ${L.radial('bronze', [[0.7, '#c88a4a'], [0.9, '#7a4a1e'], [1, '#3a1e08']])}
  ${L.radial('face', [[0, '#5a2a0a'], [0.7, '#2a1204'], [1, '#160802']], { cx: 0.45, cy: 0.4, r: 0.7 })}
  ${L.radial('faceLit', [[0, '#a85a12'], [0.7, '#5a2604'], [1, '#2a1002']], { cx: 0.45, cy: 0.4, r: 0.7 })}
  ${L.gradient('arrowGold', [[0, '#fffbe0'], [0.35, '#ffd660'], [0.75, '#e09a18'], [1, '#a8620c']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.radial('halo', [[0.6, '#ffd860', 0.75], [1, '#ffd860', 0]])}`
      ),
  };
}

function small(on) {
  return {
    _id: on ? 'btn-on' : 'btn',
    width: 56,
    height: 56,
    scale: 3,
    out: `assets/garuda/${on ? 'btn-on' : 'btn'}.webp`,
    quality: 90,
    svg: () =>
      L.svg(
        56,
        56,
        `<g filter="url(#gDrop)">
    <g filter="url(#gBev)"><circle cx="28" cy="28" r="25" fill="url(#gGoldD)"/></g>
    <circle cx="28" cy="28" r="21" fill="url(#${on ? 'lit' : 'body'})"/>
    <circle cx="28" cy="28" r="21" fill="none" stroke="#3a1a04" stroke-width="1.2"/>
    <ellipse cx="22" cy="17" rx="10" ry="4.5" fill="#fff" opacity="0.18" transform="rotate(-25 22 17)"/>
  </g>`,
        `${L.goldDefs()}
  ${L.radial('body', [[0, '#7a4a22'], [0.75, '#3e200a'], [1, '#2a1406']], { cx: 0.45, cy: 0.38, r: 0.75 })}
  ${L.radial('lit', [[0, '#ffe27a'], [0.6, '#f0a820'], [1, '#a8620c']], { cx: 0.45, cy: 0.38, r: 0.75 })}`
      ),
  };
}

function ex(on) {
  return {
    _id: on ? 'ex-on' : 'ex-off',
    width: 72,
    height: 44,
    scale: 3,
    out: `assets/garuda/${on ? 'ex-on' : 'ex-off'}.webp`,
    quality: 90,
    svg: () =>
      L.svg(
        72,
        44,
        `${on ? '<rect x="0" y="0" width="72" height="44" rx="22" fill="url(#halo)"/>' : ''}
  <g filter="url(#gDrop)">
    <g filter="url(#gBev)"><rect x="4" y="5" width="64" height="34" rx="17" fill="url(#gGoldD)"/></g>
    <rect x="7.5" y="8.5" width="57" height="27" rx="13.5" fill="url(#${on ? 'lit' : 'body'})"/>
    <text x="31" y="29.5" text-anchor="middle" font-family="Liberation Serif" font-style="italic" font-weight="700" font-size="21" fill="url(#txt)" stroke="${on ? '#5a1a00' : '#1a0a02'}" stroke-width="2.4" paint-order="stroke" stroke-linejoin="round">EX</text>
    <path d="M47 23 L 53 14 L 59 23 L 55.5 23 L 55.5 30 L 50.5 30 L 50.5 23 Z" fill="${on ? '#fff3b0' : '#c89a40'}" stroke="${on ? '#5a1a00' : '#1a0a02'}" stroke-width="1.2"/>
  </g>`,
        `${L.goldDefs()}
  ${L.gradient('body', [[0, '#5a3214'], [1, '#2a1406']])}
  ${L.gradient('lit', [[0, '#ff9a2a'], [0.5, '#e0500a'], [1, '#a82a00']])}
  ${L.gradient('txt', [[0, '#fffbe0'], [0.45, '#ffe07a'], [1, '#f0a820']])}
  ${L.radial('halo', [[0.55, '#ffb040', 0.7], [1, '#ffb040', 0]])}`
      ),
  };
}

module.exports = [spin(false), spin(true), small(false), small(true), ex(false), ex(true)];
