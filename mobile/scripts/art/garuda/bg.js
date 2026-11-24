// The backdrop of the whole Garuda Gold screen (412 x 900 units): warm temple stone in deep shadow, so a tall phone shows
// stone above and below the machine instead of a flat colour.
const L = require('./_lib');

module.exports = {
  width: 412,
  height: 900,
  scale: 1.5,
  out: 'assets/garuda/bg.webp',
  quality: 80,
  svg: () => {
    let blocks = '';
    for (let y = 0, row = 0; y < 900; y += 46, row++) {
      blocks += `<path d="M0 ${y} H412" stroke="#000" stroke-opacity="0.35" stroke-width="2"/>`;
      for (let x = (row % 2) * 52; x < 412; x += 104) blocks += `<path d="M${x} ${y} V${y + 46}" stroke="#000" stroke-opacity="0.3" stroke-width="2"/>`;
    }
    return L.svg(
      412,
      900,
      `<rect width="412" height="900" fill="url(#stone)"/>
  <rect width="412" height="900" fill="#000" filter="url(#grain)" opacity="0.7"/>
  ${blocks}
  <rect width="412" height="900" fill="url(#shade)"/>`,
      `${L.gradient('stone', [[0, '#3a1e0e'], [0.5, '#24120a'], [1, '#160a04']])}
  ${L.radial('shade', [[0.4, '#000', 0], [1, '#000', 0.65]], { cx: 0.5, cy: 0.5, r: 0.75 })}
  ${L.stoneGrain('grain', { freq: 0.8, seed: 21, dark: 0.3 })}`
    );
  },
};
