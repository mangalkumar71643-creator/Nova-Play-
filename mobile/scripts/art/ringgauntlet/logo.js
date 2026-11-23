// The name of the game (170 x 52 units): three shapes over RING GAUNTLET.
const L = require('./_lib');

module.exports = {
  width: 170,
  height: 52,
  scale: 3,
  out: 'assets/ringgauntlet/logo.webp',
  quality: 92,
  svg: () =>
    L.svg(170, 52, `
    <g filter="url(#drop)">
      <g fill="none" stroke="#ff4f93" stroke-width="2.6" stroke-linejoin="round">
        <circle cx="12" cy="9" r="5"/>
        <path d="M30 4 L35.4 13.4 L24.6 13.4 Z"/>
        <rect x="42" y="4" width="9.6" height="9.6" rx="1"/>
      </g>
      <text x="4" y="33" font-family="Inter" font-weight="900" font-size="22" letter-spacing="1.5" fill="#fff" stroke="#000" stroke-width="3.2" paint-order="stroke">RING</text>
      <text x="4" y="49" font-family="Inter" font-weight="900" font-size="15.5" letter-spacing="2.4" fill="url(#hot)" stroke="#000" stroke-width="3" paint-order="stroke">GAUNTLET</text>
    </g>
  `, `
    ${L.gradient('hot', [[0, '#ffd1e3'], [0.5, '#ff5c9d'], [1, '#d6155f']])}
    ${L.dropShadow('drop', 1.5, 1.5, 0.7)}
  `),
};
