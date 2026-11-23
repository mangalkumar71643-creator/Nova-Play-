// The backdrop of Ring Gauntlet (412 x 780 units): charcoal with a soft light behind the wheel and the three shapes drawn faintly in the corners.
const L = require('./_lib');

const faint = (extra) => `fill="none" stroke="#ffffff" stroke-opacity="0.045" stroke-width="7" ${extra}`;

module.exports = {
  width: 412,
  height: 780,
  scale: 2,
  out: 'assets/ringgauntlet/bg.webp',
  quality: 82,
  svg: () =>
    L.svg(412, 780, `
    <rect width="412" height="780" fill="url(#base)"/>
    <rect width="412" height="780" fill="url(#spot)"/>
    <circle cx="62" cy="108" r="38" ${faint('')}/>
    <path d="M206 70 L246 140 L166 140 Z" ${faint('stroke-linejoin="round"')}/>
    <rect x="316" y="72" width="72" height="72" rx="6" ${faint('')}/>
    <circle cx="48" cy="690" r="40" ${faint('')}/>
    <path d="M178 650 L226 730 L130 730 Z" ${faint('stroke-linejoin="round"')}/>
    <rect x="316" y="652" width="76" height="76" rx="6" ${faint('')}/>
    <rect width="412" height="780" filter="url(#grain)" opacity="0.5"/>
    <rect width="412" height="780" fill="url(#vig)"/>
    `, `
    ${L.gradient('base', [[0, '#202026'], [0.45, '#17171b'], [1, '#0c0c0f']])}
    ${L.radial('spot', [[0, '#3a3b45', 0.55], [0.55, '#2a2b33', 0.18], [1, '#1c1c21', 0]], { cx: 0.5, cy: 0.42, r: 0.55 })}
    ${L.radial('vig', [[0.6, '#000', 0], [1, '#000', 0.5]], { cx: 0.5, cy: 0.5, r: 0.8 })}
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0"/></filter>
    `),
};
