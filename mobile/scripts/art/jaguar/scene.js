// The jungle behind the jaguar: sky, a stepped pyramid, far hills, big palm leaves and light shafts. 412 x 300 units.
const L = require('./_lib');

const leaf = (x, y, len, ang, fill, w = 22) => `<g transform="translate(${x} ${y}) rotate(${ang})">
  <path d="M0 0 C ${w} ${-len * 0.25}, ${w * 1.1} ${-len * 0.7}, 0 ${-len} C ${-w * 1.1} ${-len * 0.7}, ${-w} ${-len * 0.25}, 0 0 Z" fill="url(#${fill})"/>
  <path d="M0 -4 L0 ${-len + 6}" stroke="#d6ffb0" stroke-opacity=".35" stroke-width="1.4"/>
  ${Array.from({ length: 7 }, (_, i) => `<path d="M0 ${-len * (0.15 + i * 0.12)} l ${w * 0.9 * (1 - i * 0.1)} ${-len * 0.09} M0 ${-len * (0.15 + i * 0.12)} l ${-w * 0.9 * (1 - i * 0.1)} ${-len * 0.09}" stroke="#0a3a1a" stroke-opacity=".28" stroke-width="1.2" fill="none"/>`).join('')}
</g>`;

module.exports = {
  width: 412,
  height: 300,
  scale: 2,
  out: 'assets/jaguar/scene.webp',
  quality: 82,
  svg: () => L.svg(412, 300, `
  <rect width="412" height="300" fill="url(#sky)"/>
  <ellipse cx="90" cy="60" rx="70" ry="20" fill="#fff" opacity=".85" filter="url(#b8)"/>
  <ellipse cx="300" cy="38" rx="86" ry="22" fill="#fff" opacity=".8" filter="url(#b8)"/>
  <ellipse cx="200" cy="90" rx="60" ry="12" fill="#fff" opacity=".5" filter="url(#b8)"/>
  <!-- far hills -->
  <path d="M0 150 Q 60 112 130 140 T 260 130 T 412 120 L 412 300 L 0 300 Z" fill="#2a7d8a" opacity=".55" filter="url(#b3)"/>
  <path d="M0 176 Q 80 140 170 166 T 340 150 T 412 156 L 412 300 L 0 300 Z" fill="#1f6a54" opacity=".75" filter="url(#b2)"/>
  <!-- the pyramid -->
  <g transform="translate(300 54)" opacity=".92">
    <path d="M10 220 L 40 160 L 70 160 L 78 130 L 100 130 L 106 100 L 130 100 L 134 78 L 150 78 L 154 60 L 172 60 L 176 220 Z" fill="url(#stone)"/>
    <path d="M10 220 L 40 160 M 40 160 L 70 160 M 78 130 L 100 130 M 106 100 L 130 100 M 134 78 L 150 78" stroke="#4c3a2a" stroke-opacity=".5" stroke-width="2" fill="none"/>
    <rect x="152" y="40" width="22" height="22" fill="#a98b66"/><rect x="156" y="46" width="14" height="16" fill="#3a2a1c" opacity=".7"/>
  </g>
  <rect x="270" y="80" width="142" height="160" fill="url(#mist)"/>
  <!-- light shafts -->
  <path d="M120 0 L 175 0 L 250 300 L 150 300 Z" fill="#fff" opacity=".1"/>
  <path d="M230 0 L 262 0 L 340 300 L 290 300 Z" fill="#fff" opacity=".07"/>
  <!-- palms, back to front -->
  <g opacity=".9">${leaf(-6, 120, 150, 58, 'lf2', 20)}${leaf(420, 110, 150, -60, 'lf2', 20)}${leaf(16, 40, 120, 40, 'lf2', 18)}</g>
  ${leaf(-10, 200, 190, 62, 'lf1', 26)}${leaf(8, 252, 170, 78, 'lf1', 24)}${leaf(420, 220, 190, -62, 'lf1', 26)}${leaf(404, 262, 170, -78, 'lf1', 24)}
  ${leaf(-8, 10, 120, 118, 'lf1', 22)}${leaf(420, 6, 120, -118, 'lf1', 22)}
  <rect width="412" height="300" fill="url(#vig)"/>
`, `
  ${L.gradient('sky', [[0, '#3fb4ee'], [0.55, '#8fdcf8'], [1, '#d6f6e8']])}
  ${L.gradient('stone', [[0, '#d2b48a'], [0.6, '#a07c52'], [1, '#6a4a30']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gradient('mist', [[0, '#d6f6e8', 0], [1, '#d6f6e8', 0.5]])}
  ${L.gradient('lf1', [[0, '#1d7a32'], [0.55, '#0f5a26'], [1, '#07361a']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('lf2', [[0, '#3aa04a'], [1, '#1a6a30']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.radial('vig', [[0.55, '#00140a', 0], [1, '#00140a', 0.55]], { cx: 0.5, cy: 0.45, r: 0.75 })}
  ${L.blur('b8', 8)}${L.blur('b3', 3)}${L.blur('b2', 1.6)}
`),
};
