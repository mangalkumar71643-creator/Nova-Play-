// The title plaque: a mossy stone slab with gold lettering and leaves. 270 x 80 units.
const L = require('./_lib');

const leaf = (x, y, ang, s = 1) => `<g transform="translate(${x} ${y}) rotate(${ang}) scale(${s})"><path d="M0 0 C 10 -8, 12 -26, 0 -36 C -12 -26, -10 -8, 0 0 Z" fill="url(#lf)"/><path d="M0 -2 L 0 -32" stroke="#b6f2a0" stroke-opacity=".5" stroke-width="1.2"/></g>`;

module.exports = {
  width: 270,
  height: 80,
  scale: 2.5,
  out: 'assets/jaguar/logo.webp',
  quality: 90,
  svg: () => L.svg(270, 80, `
  <g filter="url(#drop)">
    <g filter="url(#bev)">
      <path d="M26 10 H 244 Q 256 10 256 22 V 58 Q 256 70 244 70 H 26 Q 14 70 14 58 V 22 Q 14 10 26 10 Z" fill="url(#slab)"/>
      <path d="M26 10 H 244 Q 256 10 256 22 V 58 Q 256 70 244 70 H 26 Q 14 70 14 58 V 22 Q 14 10 26 10 Z" fill="none" stroke="url(#gold)" stroke-width="3.4"/>
    </g>
  </g>
  ${leaf(20, 18, -40, 0.9)}${leaf(250, 18, 40, 0.9)}${leaf(28, 66, -110, 0.7)}${leaf(242, 66, 110, 0.7)}
  <text x="135" y="46" text-anchor="middle" font-family="Inter" font-weight="900" font-size="35" letter-spacing="1" fill="url(#gold)" stroke="#3a2306" stroke-width="5" paint-order="stroke" filter="url(#tb)">JAGUAR</text>
  <text x="135" y="64" text-anchor="middle" font-family="Inter" font-weight="800" font-size="13.5" letter-spacing="9" fill="#f6ecc8" stroke="#1d3a12" stroke-width="3" paint-order="stroke">TEMPLE</text>
`, `
  ${L.gradient('slab', [[0, '#4f8a56'], [0.5, '#2d5a34'], [1, '#183a20']])}
  ${L.gradient('gold', [[0, '#fff3a8'], [0.45, '#f5c242'], [0.75, '#d08a14'], [1, '#ffd85a']])}
  ${L.gradient('lf', [[0, '#7be06a'], [1, '#1f7a2e']])}
  ${L.bevel('bev', { rel: 1.8, depth: 3.2, shine: 0.5 })}
  ${L.bevel('tb', { rel: 1.2, depth: 2.4, shine: 0.7 })}
  ${L.dropShadow('drop', 3, 3, 0.5)}
`),
};
