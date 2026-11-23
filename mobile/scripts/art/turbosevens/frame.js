// The frame round the reels (412 x 300 units): a steel bezel with the window cut out (reels at x 22..390, y 8..284), the gold frame of the bonus reel,
// the payline arrows at both ends of the middle row, and a ledge with three amber lights under the bonus reel.
const L = require('./_lib');

const X0 = 22, Y0 = 8, W = 368, H = 276, COL = 92;

module.exports = {
  width: 412,
  height: 300,
  scale: 2.5,
  out: 'assets/turbosevens/frame.webp',
  quality: 90,
  svg: () => {
    const hole = `M${X0 + 8} ${Y0} H${X0 + W - 8} Q${X0 + W} ${Y0} ${X0 + W} ${Y0 + 8} V${Y0 + H - 8} Q${X0 + W} ${Y0 + H} ${X0 + W - 8} ${Y0 + H} H${X0 + 8} Q${X0} ${Y0 + H} ${X0} ${Y0 + H - 8} V${Y0 + 8} Q${X0} ${Y0} ${X0 + 8} ${Y0} Z`;
    const outer = 'M14 0 H398 Q412 0 412 14 V286 Q412 300 398 300 H14 Q0 300 0 286 V14 Q0 0 14 0 Z';
    const gx = X0 + 3 * COL;
    const arrowY = Y0 + COL * 1.5;
    return L.svg(412, 300, `
      <path d="${outer}${hole}" fill="url(#steel)" fill-rule="evenodd" filter="url(#bevel)"/>
      <path d="${hole}" fill="none" stroke="#000" stroke-opacity="0.8" stroke-width="3"/>
      <path d="${hole}" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="1" transform="translate(0 -1.5)"/>
      <rect x="${gx - 2}" y="${Y0 - 1}" width="${COL + 4}" height="${H + 2}" rx="4" fill="none" stroke="url(#goldRim)" stroke-width="5"/>
      <rect x="${gx + 2.5}" y="${Y0 + 3.5}" width="${COL - 5}" height="${H - 7}" rx="2" fill="none" stroke="#000" stroke-opacity="0.45" stroke-width="2"/>
      <path d="M4 ${arrowY} L${X0 - 1} ${arrowY - 11} L${X0 - 1} ${arrowY + 11} Z" fill="url(#arrow)" stroke="#6a4200" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M408 ${arrowY} L${X0 + W + 1} ${arrowY - 11} L${X0 + W + 1} ${arrowY + 11} Z" fill="url(#arrow)" stroke="#6a4200" stroke-width="1.2" stroke-linejoin="round"/>
      <rect x="${gx - 6}" y="${Y0 + H + 2}" width="${COL + 12}" height="12" rx="3" fill="#17110b" stroke="#6a4a18" stroke-width="1"/>
      ${[0, 1, 2].map((i) => `<path d="M${gx + 10 + i * 26} ${Y0 + H + 12} L${gx + 18 + i * 26} ${Y0 + H + 4} L${gx + 26 + i * 26} ${Y0 + H + 12} Z" fill="url(#amber)"/>`).join('')}
    `, `
      ${L.gradient('steel', [[0, '#9a9cab'], [0.06, '#5d5f6c'], [0.5, '#2a2b34'], [0.94, '#14151b'], [1, '#050507']])}
      ${L.gradient('goldRim', [[0, '#fff1a8'], [0.3, '#e5a41c'], [0.65, '#8a5a0a'], [1, '#ffd45a']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
      ${L.gradient('arrow', [[0, '#fff5b0'], [0.5, '#ffc21c'], [1, '#c98600']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
      ${L.gradient('amber', [[0, '#fff0a0'], [1, '#ff8a00']])}
      ${L.bevel('bevel', { rel: 2, depth: 4, shine: 0.7, shade: 0.4 })}
    `);
  },
};
