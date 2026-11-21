// The hero: the jaguar warrior with the spirit orb in its golden ring (left) and the golden staff (right). 412 x 250 units, transparent.
const L = require('./_lib');
const jaguar = require('./_jaguar')('j');

const gearRing = (cx, cy, r1, r2, n) => {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = ((i - 0.28) / n) * Math.PI * 2, a1 = ((i + 0.28) / n) * Math.PI * 2;
    const p = (a, r) => `${(cx + Math.sin(a) * r).toFixed(1)} ${(cy - Math.cos(a) * r).toFixed(1)}`;
    d += `${i ? 'L' : 'M'}${p(a0, r1)} L${p(a0, r2)} L${p(a1, r2)} L${p(a1, r1)} `;
  }
  return d + 'Z';
};

module.exports = {
  width: 412,
  height: 250,
  scale: 2,
  out: 'assets/jaguar/hero.webp',
  quality: 88,
  svg: () => L.svg(412, 250, `
  <!-- the orb in its golden ring -->
  <g transform="translate(66 124)" filter="url(#drop)">
    <g filter="url(#bevSoft)">
      <path d="${gearRing(0, 0, 40, 52, 14)}" fill="url(#goldD)"/>
      <circle r="46" fill="url(#goldD)"/>
      <circle r="36" fill="#6b3f08"/>
    </g>
    <circle r="33" fill="url(#orb)"/>
    <circle r="33" fill="url(#orbShine)"/>
    <path d="M-20 -8 C -8 -22, 10 -20, 18 -6 C 8 -12, -6 -10, -20 -8 Z" fill="#fff" opacity=".28"/>
    <circle cx="-12" cy="-14" r="6" fill="#fff" opacity=".45"/>
  </g>
  <circle cx="66" cy="124" r="58" fill="url(#orbGlow)"/>
  <!-- the staff -->
  <g transform="translate(346 30)" filter="url(#drop)">
    <g filter="url(#bev)">
      <rect x="-9" y="64" width="18" height="190" rx="5" fill="url(#pole)"/>
      <g stroke="#0b3d1c" stroke-width="3" opacity=".7">${Array.from({ length: 9 }, (_, i) => `<path d="M-9 ${150 + i * 10} L 9 ${158 + i * 10}"/>`).join('')}</g>
      <path d="M-34 20 L 34 20 L 30 44 L 10 52 L 10 66 L -10 66 L -10 52 L -30 44 Z" fill="url(#gold)"/>
      <path d="M-26 8 L 26 8 L 34 20 L -34 20 Z" fill="url(#gold)"/>
      <rect x="-20" y="-14" width="40" height="26" rx="5" fill="url(#gold)"/>
      <path d="M-12 24 h 24 v 8 h -16 v 8 h 16" stroke="#7a4608" stroke-width="4" fill="none"/>
    </g>
  </g>
  <!-- arms and hands -->
  <g filter="url(#drop)">
    <path d="M132 224 Q 112 196 96 170" fill="none" stroke="#2a1408" stroke-width="36" stroke-linecap="round"/>
    <path d="M132 224 Q 112 196 96 170" fill="none" stroke="url(#armFur)" stroke-width="30" stroke-linecap="round"/>
    <path d="M282 224 Q 300 190 340 168" fill="none" stroke="#2a1408" stroke-width="36" stroke-linecap="round"/>
    <path d="M282 224 Q 300 190 340 168" fill="none" stroke="url(#armFur)" stroke-width="30" stroke-linecap="round"/>
    <g fill="#2a1408" opacity=".75"><circle cx="124" cy="206" r="3"/><circle cx="112" cy="190" r="2.6"/><circle cx="296" cy="204" r="3"/><circle cx="312" cy="188" r="2.6"/><circle cx="126" cy="220" r="2.4"/><circle cx="288" cy="218" r="2.4"/></g>
    <circle cx="346" cy="170" r="19" fill="#2a1408"/><circle cx="346" cy="170" r="16.5" fill="url(#armFur)"/>
    <path d="M337 163 q 9 -3 18 0 M336 171 q 10 -3 20 0 M338 178 q 8 -3 16 0" stroke="#2a1408" stroke-width="2" fill="none" opacity=".7"/>
  </g>
  <!-- the jaguar -->
  <g transform="translate(206 128) scale(1.18) translate(-100 -112)">${jaguar.body}</g>
`, `${jaguar.defs}
  ${L.gold('gold')}
  ${L.gradient('goldD', [[0, '#ffd45e'], [0.45, '#e39a1a'], [0.8, '#9a5a0c'], [1, '#e8a830']])}
  ${L.radial('armFur', [[0, '#ffc566'], [1, '#d87820']], { cx: 0.4, cy: 0.3, r: 0.9 })}
  ${L.radial('orb', [[0, '#f6a8ff'], [0.4, '#b042e8'], [1, '#430a86']], { cx: 0.4, cy: 0.35, r: 0.8 })}
  ${L.radial('orbShine', [[0.55, '#ffffff', 0], [1, '#e6a0ff', 0.55]])}
  ${L.radial('orbGlow', [[0.55, '#d070ff', 0.45], [1, '#d070ff', 0]])}
  ${L.gradient('pole', [[0, '#1f7a38'], [0.4, '#58d070'], [1, '#0d4a22']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.bevel('bev', { rel: 2, depth: 4 })}
  ${L.bevel('bevSoft', { rel: 2.2, depth: 3, shine: 0.35, exp: 40, shade: 0.35 })}
  ${L.dropShadow('drop', 4, 3.5, 0.5)}
`),
};
