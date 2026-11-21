// A carved stone tile behind a symbol (blue, red or gold), full cell size 220 x 220.
const L = require('./_lib');

module.exports = (id, [light, mid, dark], seed = 3) => ({
  defs: `${L.gradient(id + 'G', [[0, light], [0.5, mid], [1, dark]], { x1: 0, y1: 0, x2: 1, y2: 1 })}
    ${L.bevel(id + 'Bev', { rel: 2, depth: 4.5, shine: 0.7, shade: 0.45 })}
    ${L.stoneGrain(id + 'Grain', { freq: 0.8, seed })}`,
  body: `<g filter="url(#${id}Bev)">
      <rect x="4" y="4" width="212" height="212" rx="12" fill="url(#${id}G)"/>
      <rect x="13" y="13" width="194" height="194" rx="8" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="3"/>
    </g>
    <rect x="4" y="4" width="212" height="212" rx="12" filter="url(#${id}Grain)" opacity=".55"/>
    <rect x="14.5" y="14.5" width="191" height="191" rx="6.5" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="1.6"/>`,
});
