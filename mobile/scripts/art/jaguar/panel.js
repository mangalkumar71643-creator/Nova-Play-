// The panel under the reels: deep jungle with big leaves and yellow flowers. 412 x 180 units.
const L = require('./_lib');

const leaf = (x, y, len, ang, fill, w = 22) => `<g transform="translate(${x} ${y}) rotate(${ang})">
  <path d="M0 0 C ${w} ${-len * 0.25}, ${w * 1.1} ${-len * 0.7}, 0 ${-len} C ${-w * 1.1} ${-len * 0.7}, ${-w} ${-len * 0.25}, 0 0 Z" fill="url(#${fill})"/>
  <path d="M0 -4 L0 ${-len + 6}" stroke="#d6ffb0" stroke-opacity=".35" stroke-width="1.4"/>
</g>`;
const flower = (x, y, r) => `<g transform="translate(${x} ${y})">${Array.from({ length: 6 }, (_, i) => `<ellipse cx="0" cy="${-r * 0.7}" rx="${r * 0.36}" ry="${r * 0.72}" transform="rotate(${i * 60})" fill="url(#petal)" stroke="#a8620c" stroke-width=".8"/>`).join('')}<circle r="${r * 0.22}" fill="#7a3d06"/></g>`;

module.exports = {
  width: 412,
  height: 180,
  scale: 2,
  out: 'assets/jaguar/panel.webp',
  quality: 82,
  svg: () => L.svg(412, 180, `
  <rect width="412" height="180" fill="url(#bg)"/>
  ${leaf(0, 110, 130, 68, 'lf2', 20)}${leaf(412, 110, 130, -68, 'lf2', 20)}
  ${leaf(-8, 160, 150, 52, 'lf1', 22)}${leaf(420, 160, 150, -52, 'lf1', 22)}
  ${leaf(24, 190, 130, 28, 'lf1', 20)}${leaf(388, 190, 130, -28, 'lf1', 20)}
  ${flower(34, 70, 26)}${flower(66, 118, 20)}${flower(378, 70, 26)}${flower(348, 118, 20)}
  <rect width="412" height="14" fill="url(#top)"/>
  <rect width="412" height="180" fill="url(#vig)"/>
`, `
  ${L.gradient('bg', [[0, '#1f5a2c'], [0.5, '#123d1f'], [1, '#08240f']])}
  ${L.gradient('lf1', [[0, '#1d7a32'], [0.55, '#0f5a26'], [1, '#07361a']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('lf2', [[0, '#3aa04a'], [1, '#1a6a30']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('petal', [[0, '#fff3a0'], [0.6, '#ffd23a'], [1, '#e8a010']])}
  ${L.gradient('top', [[0, '#000', 0.55], [1, '#000', 0]])}
  ${L.radial('vig', [[0.6, '#000', 0], [1, '#000', 0.5]], { cx: 0.5, cy: 0.4, r: 0.8 })}
`),
};
