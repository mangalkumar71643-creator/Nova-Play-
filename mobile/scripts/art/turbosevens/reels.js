// The reel window (368 x 276 units: four columns of 92, three rows of 92). `reels-bg` is what the symbols sit on; `reels-shade` lies over them
// and rounds the reels off (dark at the top and the bottom, a gloss, the lines between the reels).
const L = require('./_lib');

const W = 368, H = 276, COL = 92;

module.exports = [
  {
    _id: 'bg',
    width: W,
    height: H,
    scale: 2.5,
    out: 'assets/turbosevens/reels-bg.webp',
    quality: 88,
    svg: () =>
      L.svg(W, H, `
      ${[0, 1, 2].map((i) => `<rect x="${i * COL}" y="0" width="${COL}" height="${H}" fill="url(#cyl)"/><rect x="${i * COL}" y="0" width="${COL}" height="${H}" fill="url(#side)"/>`).join('')}
      <rect x="${3 * COL}" y="0" width="${COL}" height="${H}" fill="url(#gold)"/>
      <rect x="${3 * COL}" y="0" width="${COL}" height="${H}" fill="url(#side)"/>
    `, `
      ${L.gradient('cyl', [[0, '#8c8fa0'], [0.16, '#dfe2ec'], [0.34, '#ffffff'], [0.66, '#ffffff'], [0.84, '#dfe2ec'], [1, '#8a8d9c']])}
      ${L.gradient('gold', [[0, '#9a6a1c'], [0.16, '#f2d68a'], [0.34, '#fff2c4'], [0.66, '#fff2c4'], [0.84, '#f2d68a'], [1, '#946416']])}
      ${L.gradient('side', [[0, '#000', 0.22], [0.12, '#000', 0], [0.88, '#000', 0], [1, '#000', 0.22]], { x1: 0, y1: 0, x2: 1, y2: 0 })}
    `),
  },
  {
    _id: 'shade',
    width: W,
    height: H,
    scale: 2.5,
    out: 'assets/turbosevens/reels-shade.webp',
    quality: 88,
    svg: () =>
      L.svg(W, H, `
      <rect width="${W}" height="${H}" fill="url(#top)"/>
      <rect width="${W}" height="${H}" fill="url(#bottom)"/>
      ${[1, 2, 3].map((i) => `<rect x="${i * COL - 1.6}" y="0" width="3.2" height="${H}" fill="#14161c" opacity="0.85"/><rect x="${i * COL + 1.6}" y="0" width="1" height="${H}" fill="#fff" opacity="0.35"/>`).join('')}
      ${[0, 1, 2, 3].map((i) => `<rect x="${i * COL + 8}" y="0" width="7" height="${H}" fill="#fff" opacity="0.1"/>`).join('')}
    `, `
      ${L.gradient('top', [[0, '#05060a', 0.62], [0.2, '#05060a', 0.18], [0.33, '#05060a', 0]])}
      ${L.gradient('bottom', [[0.67, '#05060a', 0], [0.8, '#05060a', 0.18], [1, '#05060a', 0.62]])}
    `),
  },
];
