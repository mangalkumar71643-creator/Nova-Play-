// The control deck under the machine (412 x 170 units): a dark metal panel with the plate for WIN and the plate for the balance.
const L = require('./_lib');

module.exports = {
  width: 412,
  height: 170,
  scale: 2.5,
  out: 'assets/turbosevens/panel.webp',
  quality: 88,
  svg: () =>
    L.svg(412, 170, `
      <rect width="412" height="170" fill="url(#deck)"/>
      <rect x="0" y="0" width="412" height="3" fill="#6a4a20"/><rect x="0" y="3" width="412" height="2" fill="#000" opacity="0.6"/>
      <rect x="116" y="9" width="180" height="30" rx="15" fill="#0a0806" stroke="#5a3d16" stroke-width="1.6"/>
      <rect x="116" y="9" width="180" height="30" rx="15" fill="url(#plate)" opacity="0.4"/>
      <rect x="126" y="134" width="160" height="28" rx="14" fill="#0a0806" stroke="#5a3d16" stroke-width="1.6"/>
      <path d="M10 62 Q10 56 16 56 H78 M334 56 H396 Q402 56 402 62" fill="none" stroke="#3a2a14" stroke-width="2" opacity="0.8"/>
      <path d="M10 118 Q10 124 16 124 H78 M334 124 H396 Q402 124 402 118" fill="none" stroke="#3a2a14" stroke-width="2" opacity="0.8"/>
    `, `
      ${L.gradient('deck', [[0, '#2a2018'], [0.5, '#17120d'], [1, '#0a0806']])}
      ${L.gradient('plate', [[0, '#fff', 0.3], [1, '#000', 0.3]])}
    `),
};
