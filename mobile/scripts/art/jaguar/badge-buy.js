// The red BUY BONUS badge that hangs on the staff. 92 x 92 units.
const L = require('./_lib');

module.exports = {
  width: 92,
  height: 92,
  scale: 2.5,
  out: 'assets/jaguar/badge-buy.webp',
  quality: 90,
  svg: () => L.svg(92, 92, `
  <g transform="rotate(-9 46 46)" filter="url(#drop)">
    <circle cx="46" cy="46" r="41" fill="#fff"/>
    <circle cx="46" cy="46" r="38" fill="url(#red)"/>
    <ellipse cx="34" cy="22" rx="22" ry="9" transform="rotate(-22 34 22)" fill="#fff" opacity=".35"/>
    <text x="46" y="42" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="22" fill="#fff" stroke="#7a0a10" stroke-width="3" paint-order="stroke">BUY</text>
    <text x="46" y="66" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="19" fill="#ffe36a" stroke="#7a0a10" stroke-width="3" paint-order="stroke">BONUS</text>
  </g>
`, `${L.radial('red', [[0, '#ff6a5a'], [0.6, '#d8222a'], [1, '#8a0a14']], { cx: 0.4, cy: 0.3, r: 0.85 })}${L.dropShadow('drop', 3, 3, 0.55)}`),
};
