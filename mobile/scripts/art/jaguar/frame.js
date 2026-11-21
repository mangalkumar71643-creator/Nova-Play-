// The sandstone frame round the reels: a carved band on top, thick sides and a ledge below. 412 x 372 units; the window is (22, 36) to (390, 348).
const L = require('./_lib');

const key = (x0, y, w, n) => Array.from({ length: n }, (_, i) => {
  const x = x0 + i * (w / n);
  const s = w / n;
  return `<path d="M${x + 2} ${y + s - 2} V ${y + 2} H ${x + s - 2} V ${y + s - 6} H ${x + 6} V ${y + 6} H ${x + s - 10}" fill="none" stroke="#3b2414" stroke-width="2.6" stroke-opacity=".75" stroke-linejoin="miter"/>`;
}).join('');

module.exports = {
  width: 412,
  height: 372,
  scale: 2,
  out: 'assets/jaguar/frame.webp',
  quality: 78,
  svg: () => L.svg(412, 372, `
  <g filter="url(#drop)">
    <g filter="url(#bev)">
      <path fill-rule="evenodd" d="M0 0 H 412 V 372 H 0 Z M22 36 H 390 V 348 H 22 Z" fill="url(#sand)"/>
    </g>
    <path fill-rule="evenodd" d="M0 0 H 412 V 372 H 0 Z M22 36 H 390 V 348 H 22 Z" fill="url(#grain)" filter="url(#gr)" opacity=".5"/>
  </g>
  <!-- carved top band -->
  <rect x="10" y="6" width="392" height="24" rx="3" fill="#000" opacity=".14"/>
  ${key(14, 8, 384, 24)}
  <!-- side carvings -->
  ${[0, 1].map((side) => Array.from({ length: 8 }, (_, i) => `<rect x="${side ? 396 : 4}" y="${44 + i * 38}" width="12" height="28" rx="2" fill="#000" opacity=".16"/><rect x="${side ? 398 : 6}" y="${47 + i * 38}" width="8" height="22" rx="1.5" fill="#fff" opacity=".13"/>`).join('')).join('')}
  <!-- inner lip -->
  <path d="M22 36 H 390 V 348 H 22 Z" fill="none" stroke="#2a180c" stroke-width="5" stroke-opacity=".75"/>
  <path d="M23.5 37.5 H 388.5" stroke="#000" stroke-opacity=".5" stroke-width="4"/>
  <path d="M24 346 H 388" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
  <!-- the ledge -->
  <rect x="0" y="352" width="412" height="20" fill="url(#ledge)"/>
  <rect x="0" y="352" width="412" height="3" fill="#fff" opacity=".28"/>
  ${key(6, 354, 400, 36).replace(/stroke-width="2.6"/g, 'stroke-width="1.8"').replace(/M(\d+\.?\d*) (\d+\.?\d*)/g, (m) => m)}
`, `
  ${L.gradient('sand', [[0, '#cf9a62'], [0.5, '#a8713f'], [1, '#6e4426']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gradient('ledge', [[0, '#8a5a32'], [1, '#4a2c16']])}
  ${L.bevel('bev', { rel: 2.4, depth: 5, shine: 0.6, shade: 0.45 })}
  ${L.dropShadow('drop', 3, 3, 0.5)}
  ${L.stoneGrain('gr', { freq: 0.7, seed: 11, dark: 0.4 })}
  <pattern id="grain" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#000"/></pattern>
`),
};
