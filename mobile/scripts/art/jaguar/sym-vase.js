// Jade vase with a gold rim and bands, Aztec spirals in relief.
const L = require('./_lib');
const spiral = require('./_spiral');

const body = L.mirrored(110, [[40, 40], [27, 60], [29, 68], [54, 82], [67, 106], [65, 134], [50, 162], [34, 183], [31, 190]], 0.9);

module.exports = {
  width: 220,
  height: 220,
  scale: 2,
  out: 'assets/jaguar/sym-vase.webp',
  quality: 90,
  svg: () => L.svg(220, 220, `
  <ellipse cx="110" cy="203" rx="62" ry="9" fill="#000" opacity=".5" filter="url(#bl)"/>
  <g filter="url(#drop)">
    <g filter="url(#bev)">
      <path d="${body}" fill="url(#jadeH)"/>
      <path d="${body}" fill="url(#jadeV)"/>
      <!-- gold base, shoulder and neck bands -->
      <path d="M72 181 Q 110 192 148 181 L 150 192 Q 110 204 70 192 Z" fill="url(#gold)"/>
      <path d="M58 83 Q 110 104 162 83 L 165 94 Q 110 116 55 94 Z" fill="url(#gold)"/>
      <path d="M83 62 Q 110 70 137 62 L 138 70 Q 110 78 82 70 Z" fill="url(#gold)"/>
      <!-- spirals on the belly -->
      <g fill="none" stroke="url(#gold)" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="${spiral(82, 136, 20, 1.7, 1, -1.2)}"/>
        <path d="${spiral(138, 136, 20, 1.7, -1, -1.95)}"/>
        <path d="M96 128 Q 110 118 124 128" />
      </g>
      <!-- a row of diamonds -->
      <g fill="url(#gold)">${Array.from({ length: 8 }, (_, i) => `<path d="M${68 + i * 12} 164 l4.4 4.4 l-4.4 4.4 l-4.4 -4.4 Z"/>`).join('')}</g>
      <!-- the rim -->
      <ellipse cx="110" cy="38" rx="44" ry="12.5" fill="url(#gold)"/>
    </g>
    <ellipse cx="110" cy="38.5" rx="35" ry="8.2" fill="url(#mouth)"/>
    <path d="M70 36 Q 110 28 150 36" fill="none" stroke="#fff6c8" stroke-width="1.8" opacity=".8"/>
  </g>
  <!-- light -->
  <path d="M56 98 C 52 112, 54 128, 60 142" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".38" filter="url(#bl2)"/>
  <ellipse cx="82" cy="92" rx="10" ry="6" transform="rotate(-24 82 92)" fill="#fff" opacity=".42" filter="url(#bl2)"/>
`, `
  ${L.gradient('jadeH', [[0, '#063d1c'], [0.2, '#23a14a'], [0.38, '#9be268'], [0.6, '#1f9a45'], [1, '#05341a']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('jadeV', [[0, '#ffffff', 0.18], [0.45, '#ffffff', 0], [1, '#00160b', 0.35]])}
  ${L.gold('gold')}
  ${L.radial('mouth', [[0, '#052a18'], [1, '#0f6a3b']], { cx: 0.5, cy: 0.35, r: 0.7 })}
  ${L.bevel('bev', { rel: 2.2, depth: 4.5 })}
  ${L.dropShadow('drop', 5, 4, 0.5)}
  ${L.blur('bl', 5)}${L.blur('bl2', 2.2)}
`),
};
