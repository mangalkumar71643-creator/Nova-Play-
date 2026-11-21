// Blue crystal dagger with a corded handle and a turquoise carved pommel, laid at an angle.
const L = require('./_lib');

module.exports = {
  width: 220,
  height: 220,
  scale: 2,
  out: 'assets/jaguar/sym-dagger.webp',
  quality: 90,
  svg: () => L.svg(220, 220, `
  <ellipse cx="116" cy="208" rx="70" ry="8" fill="#000" opacity=".42" filter="url(#bl)"/>
  <g transform="translate(110 108) scale(1.16) rotate(42) translate(-110 -108)" filter="url(#drop)">
    <g filter="url(#bev)">
      <!-- blade -->
      <path d="M89 92 L131 92 L127 128 L119 166 L110 208 L101 166 L93 128 Z" fill="url(#bladeL)"/>
      <path d="M110 92 L131 92 L127 128 L119 166 L110 208 Z" fill="url(#bladeR)"/>
      <path d="M110 96 L110 204" stroke="#d9f6ff" stroke-width="1.6" opacity=".9"/>
      <path d="M97 106 L103 150 L108 190" stroke="#fff" stroke-width="2.4" opacity=".55" fill="none" stroke-linecap="round"/>
      <path d="M122 110 L119 140" stroke="#bfe9ff" stroke-width="2" opacity=".5" fill="none" stroke-linecap="round"/>
      <!-- guard -->
      <path d="M78 86 Q 110 78 142 86 L 146 98 Q 110 90 74 98 Z" fill="url(#gold)"/>
      <!-- cord -->
      <rect x="97" y="46" width="26" height="42" rx="6" fill="url(#cord)"/>
      <g stroke="#2c1f14" stroke-width="2.2" opacity=".85">${Array.from({ length: 8 }, (_, i) => `<path d="M97 ${50 + i * 5.2} L123 ${55 + i * 5.2}"/>`).join('')}</g>
      <!-- pommel -->
      <path d="M90 22 Q 110 8 130 22 L 128 52 Q 110 60 92 52 Z" fill="url(#turq)"/>
      <circle cx="102" cy="34" r="4.2" fill="#082b2a"/><circle cx="118" cy="34" r="4.2" fill="#082b2a"/>
      <path d="M102 46 L 118 46" stroke="#082b2a" stroke-width="3" stroke-linecap="round"/>
      <path d="M96 24 Q 110 14 124 24" stroke="#fff" stroke-width="2.4" fill="none" opacity=".6"/>
    </g>
  </g>
`, `
  ${L.gradient('bladeL', [[0, '#b8f0ff'], [0.35, '#5cc6ff'], [0.75, '#2a86ee'], [1, '#1b4fc4']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gradient('bladeR', [[0, '#3f9cf5'], [0.6, '#1f5fd6'], [1, '#0f2f94']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gradient('cord', [[0, '#a89684'], [0.5, '#7a6858'], [1, '#4d3f33']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('turq', [[0, '#9ff0e2'], [0.5, '#2fb9ab'], [1, '#0e6d69']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gold('gold')}
  ${L.bevel('bev', { rel: 1.8, depth: 3.6 })}
  ${L.dropShadow('drop', 6, 4, 0.5)}
  ${L.blur('bl', 5)}
`),
};
