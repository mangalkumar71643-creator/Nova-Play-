// A silver ring with a skull-mask and blue gems, on a blue stone tile.
const L = require('./_lib');
const tile = require('./_tile')('t', ['#4b8ff0', '#2556b8', '#12285f']);

module.exports = {
  width: 220,
  height: 220,
  scale: 2,
  out: 'assets/jaguar/sym-ring.webp',
  quality: 90,
  svg: () => L.svg(220, 220, `
  ${tile.body}
  <ellipse cx="112" cy="190" rx="70" ry="8" fill="#000" opacity=".4" filter="url(#bl)"/>
  <g filter="url(#drop)">
    <g filter="url(#bev)">
      <!-- the band -->
      <ellipse cx="114" cy="112" rx="76" ry="60" fill="none" stroke="#2b3342" stroke-width="34"/>
      <ellipse cx="114" cy="110" rx="76" ry="60" fill="none" stroke="url(#silver)" stroke-width="30"/>
      <!-- blue enamel on the right -->
      <path d="M150 62 A 76 60 0 0 1 150 160" fill="none" stroke="url(#enamel)" stroke-width="24" stroke-linecap="butt"/>
      <path d="M158 80 h 22 v 8 h -14 v 8 h 14 M158 112 h 22 v 8 h -14 v 8 h 14" stroke="#cfe8ff" stroke-width="3.4" fill="none" opacity=".9"/>
      <!-- the mask -->
      <path d="M50 78 Q 80 52 110 78 L 114 120 Q 108 148 80 158 Q 52 148 46 120 Z" fill="url(#silver)"/>
      <path d="M58 70 Q 80 58 102 70" fill="none" stroke="#2b3342" stroke-width="3" opacity=".7"/>
      <circle cx="66" cy="102" r="12.5" fill="#1d2433"/><circle cx="94" cy="102" r="12.5" fill="#1d2433"/>
      <path d="M80 112 L 86 128 L 74 128 Z" fill="#2b3342"/>
      <g fill="#f3f6fb">${Array.from({ length: 5 }, (_, i) => `<rect x="${64 + i * 7.2}" y="138" width="5.2" height="9" rx="1.2"/>`).join('')}</g>
      <path d="M52 92 q -8 6 0 14 M108 92 q 8 6 0 14" stroke="#2b3342" stroke-width="3" fill="none"/>
    </g>
    <circle cx="66" cy="102" r="9" fill="url(#gem)"/><circle cx="94" cy="102" r="9" fill="url(#gem)"/>
    <circle cx="63" cy="99" r="2.6" fill="#fff"/><circle cx="91" cy="99" r="2.6" fill="#fff"/>
  </g>
  <ellipse cx="66" cy="62" rx="20" ry="6" transform="rotate(-20 66 62)" fill="#fff" opacity=".5" filter="url(#bl2)"/>
`, `${tile.defs}
  ${L.silver('silver', { x1: 0, y1: 0, x2: 0, y2: 1 })}
  ${L.gradient('enamel', [[0, '#7fd0ff'], [0.5, '#1f86ee'], [1, '#0b3e9c']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.radial('gem', [[0, '#e3f4ff'], [0.35, '#4db2ff'], [1, '#0a3fa8']], { cx: 0.4, cy: 0.35, r: 0.7 })}
  ${L.bevel('bev', { rel: 2, depth: 4 })}
  ${L.dropShadow('drop', 5, 3.5, 0.55)}
  ${L.blur('bl', 5)}${L.blur('bl2', 3)}
`),
};
