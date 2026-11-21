// A purple stone jaguar head in profile, carved with spirals.
const L = require('./_lib');
const spiral = require('./_spiral');

const head = L.smooth([[24, 122], [30, 104], [58, 90], [88, 76], [122, 64], [158, 62], [190, 80], [198, 118], [186, 158], [156, 178], [118, 174], [78, 164], [46, 148], [26, 134]], true, 0.8);

module.exports = {
  width: 220,
  height: 220,
  scale: 2,
  out: 'assets/jaguar/sym-head.webp',
  quality: 90,
  svg: () => L.svg(220, 220, `
  <ellipse cx="112" cy="198" rx="72" ry="8" fill="#000" opacity=".45" filter="url(#bl)"/>
  <g filter="url(#drop)">
    <g filter="url(#bev)">
      <!-- ear -->
      <path d="${L.smooth([[134, 74], [140, 40], [166, 30], [182, 52], [178, 82]], true, 0.8)}" fill="url(#purple)"/>
      <path d="${L.smooth([[148, 70], [152, 50], [166, 46], [172, 60]], true, 0.8)}" fill="#3a1478"/>
      <!-- head -->
      <path d="${head}" fill="url(#purple)"/>
      <path d="${head}" fill="url(#purpleV)"/>
      <!-- brow and cheek ridges -->
      <path d="M62 96 Q 90 78 128 78" fill="none" stroke="#e2c8ff" stroke-width="5" stroke-linecap="round" opacity=".7"/>
      <path d="M44 124 Q 80 112 118 136" fill="none" stroke="#2e0f66" stroke-width="3.5" stroke-linecap="round" opacity=".6"/>
      <g fill="none" stroke="#d6b6ff" stroke-width="4.5" stroke-linecap="round" opacity=".85"><path d="${spiral(142, 124, 24, 1.6, 1, 0.6)}"/></g>
      <g fill="none" stroke="#2e0f66" stroke-width="3" opacity=".5"><path d="M160 146 q 10 8 24 -2 M156 158 q 12 10 28 -4"/></g>
    </g>
    <!-- eye -->
    <path d="M76 96 Q 94 84 110 98 Q 94 110 76 96 Z" fill="#f4eaff"/>
    <circle cx="94" cy="97" r="7" fill="#7a3fe0"/><circle cx="94" cy="97" r="3.4" fill="#12062e"/><circle cx="91.5" cy="94.5" r="1.8" fill="#fff"/>
    <path d="M70 90 Q 92 74 116 96" fill="none" stroke="#1f0a45" stroke-width="5" stroke-linecap="round"/>
    <!-- nose and mouth -->
    <ellipse cx="40" cy="112" rx="8" ry="5.4" fill="#1d0942" transform="rotate(-20 40 112)"/>
    <path d="M30 132 Q 62 150 110 152" fill="none" stroke="#1d0942" stroke-width="4" stroke-linecap="round"/>
    <g fill="#fffaf0" stroke="#3a1478" stroke-width="1.4"><path d="M46 138 l 6 18 l 7 -14 Z"/><path d="M72 146 l 5 15 l 7 -12 Z"/></g>
  </g>
  <ellipse cx="100" cy="68" rx="30" ry="7" transform="rotate(-18 100 68)" fill="#fff" opacity=".5" filter="url(#bl2)"/>
`, `
  ${L.gradient('purple', [[0, '#d8b4ff'], [0.4, '#9a58ea'], [1, '#4a1b96']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gradient('purpleV', [[0, '#fff', 0.1], [0.5, '#fff', 0], [1, '#10002e', 0.35]])}
  ${L.bevel('bev', { rel: 2.4, depth: 5 })}
  ${L.dropShadow('drop', 6, 4, 0.5)}
  ${L.blur('bl', 5)}${L.blur('bl2', 3)}
`),
};
