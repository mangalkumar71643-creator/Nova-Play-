// The Jaguar Wild: the warrior's face on a gold stone tile. The multiplier (x2, x3, x5) is written on top by the app.
const L = require('./_lib');
const jaguar = require('./_jaguar')('j');
const tile = require('./_tile')('t', ['#ffe58f', '#e9a62a', '#8a4f0c'], 5);

module.exports = {
  width: 220,
  height: 220,
  scale: 2,
  out: 'assets/jaguar/sym-wild.webp',
  quality: 90,
  svg: () => L.svg(220, 220, `
  ${tile.body}
  <g transform="translate(110 118) scale(0.84) translate(-100 -108)">${jaguar.body}</g>
  <g fill="url(#goldC)" filter="url(#cb)">
    ${[[24, 24], [196, 24], [24, 196], [196, 196]].map(([x, y]) => `<path d="M${x - 10} ${y} L ${x} ${y - 10} L ${x + 10} ${y} L ${x} ${y + 10} Z"/>`).join('')}
  </g>
  <rect x="8" y="8" width="204" height="204" rx="10" fill="none" stroke="#fff6c8" stroke-opacity=".55" stroke-width="1.6"/>
`, `${tile.defs}${jaguar.defs}${L.gold('goldC')}${L.bevel('cb', { rel: 1.4, depth: 2.4 })}`),
};
