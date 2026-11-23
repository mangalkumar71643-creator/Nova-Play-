// The backdrop of Turbo Sevens (412 x 800 units): red theatre curtains in the dark with a light on the machine.
const L = require('./_lib');

module.exports = {
  width: 412,
  height: 800,
  scale: 2,
  out: 'assets/turbosevens/bg.webp',
  quality: 82,
  svg: () => {
    let folds = '';
    for (let i = 0; i < 22; i++) {
      const x = i * 19.5;
      folds += `<rect x="${x}" y="0" width="19.5" height="800" fill="url(#fold)" opacity="${i % 2 ? 0.55 : 0.3}"/>`;
    }
    return L.svg(412, 800, `
      <rect width="412" height="800" fill="url(#curtain)"/>
      ${folds}
      <rect width="412" height="800" fill="url(#spot)"/>
      <rect width="412" height="800" fill="url(#vig)"/>
    `, `
      ${L.gradient('curtain', [[0, '#5a0a16'], [0.45, '#340610'], [1, '#0c0204']])}
      ${L.gradient('fold', [[0, '#000', 0.55], [0.5, '#ff6a6a', 0.14], [1, '#000', 0.55]], { x1: 0, y1: 0, x2: 1, y2: 0 })}
      ${L.radial('spot', [[0, '#ff8a4a', 0.35], [0.6, '#ff4a2a', 0.08], [1, '#000', 0]], { cx: 0.5, cy: 0.12, r: 0.65 })}
      ${L.radial('vig', [[0.55, '#000', 0], [1, '#000', 0.6]], { cx: 0.5, cy: 0.5, r: 0.85 })}
    `);
  },
};
