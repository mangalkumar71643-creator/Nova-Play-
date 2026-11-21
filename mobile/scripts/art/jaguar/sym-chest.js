// A gold-banded treasure chest with a ruby lock, on a red stone tile.
const L = require('./_lib');
const tile = require('./_tile')('t', ['#e8484f', '#a3222c', '#5a0c14'], 7);

module.exports = {
  width: 220,
  height: 220,
  scale: 2,
  out: 'assets/jaguar/sym-chest.webp',
  quality: 90,
  svg: () => L.svg(220, 220, `
  ${tile.body}
  <ellipse cx="110" cy="190" rx="76" ry="9" fill="#000" opacity=".45" filter="url(#bl)"/>
  <g filter="url(#drop)">
    <g filter="url(#bev)">
      <!-- body -->
      <path d="M36 116 L 184 116 L 180 184 Q 110 194 40 184 Z" fill="url(#wood)"/>
      <!-- lid -->
      <path d="M34 118 Q 36 56 110 50 Q 184 56 186 118 Z" fill="url(#wood)"/>
      <!-- gold trim and straps -->
      <path d="M32 112 L 188 112 L 188 124 L 32 124 Z" fill="url(#gold)"/>
      <path d="M58 56 L 78 54 L 80 184 L 58 184 Z" fill="url(#gold)"/>
      <path d="M162 56 L 142 54 L 140 184 L 162 184 Z" fill="url(#gold)"/>
      <path d="M36 172 Q 110 182 184 172 L 183 186 Q 110 196 37 186 Z" fill="url(#gold)"/>
      <path d="M44 84 Q 110 40 176 84" fill="none" stroke="url(#gold)" stroke-width="7" stroke-linecap="round"/>
      <g fill="#3a1d08" opacity=".55">${[64, 70, 148, 154].map((x) => `<circle cx="${x}" cy="150" r="2.4"/>`).join('')}</g>
      <!-- lock -->
      <path d="M92 108 h 36 v 22 q -18 14 -36 0 Z" fill="url(#gold)"/>
    </g>
    <circle cx="110" cy="124" r="11" fill="url(#ruby)"/>
    <circle cx="106" cy="120" r="3.4" fill="#fff" opacity=".85"/>
  </g>
  <path d="M46 70 Q 70 54 104 52" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".38" filter="url(#bl2)"/>
`, `${tile.defs}
  ${L.gradient('wood', [[0, '#ffbe5a'], [0.45, '#e07a22'], [1, '#8a3c0a']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gold('gold')}
  ${L.radial('ruby', [[0, '#ffd0d0'], [0.35, '#ff3b4e'], [1, '#7a0010']], { cx: 0.4, cy: 0.35, r: 0.75 })}
  ${L.bevel('bev', { rel: 2, depth: 4 })}
  ${L.dropShadow('drop', 5, 3.5, 0.55)}
  ${L.blur('bl', 5)}${L.blur('bl2', 3)}
`),
};
