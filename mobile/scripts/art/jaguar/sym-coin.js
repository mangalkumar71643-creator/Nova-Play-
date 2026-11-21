// A gold coin with a teal stone mask that sticks its tongue out.
const L = require('./_lib');

module.exports = {
  width: 220,
  height: 220,
  scale: 2,
  out: 'assets/jaguar/sym-coin.webp',
  quality: 90,
  svg: () => L.svg(220, 220, `
  <ellipse cx="110" cy="204" rx="66" ry="8" fill="#000" opacity=".45" filter="url(#bl)"/>
  <g filter="url(#drop)">
    <g filter="url(#bev)">
      <circle cx="110" cy="108" r="86" fill="url(#gold)"/>
      <circle cx="110" cy="108" r="74" fill="url(#goldDark)"/>
      <circle cx="110" cy="108" r="68" fill="url(#plate)"/>
      <!-- rim studs -->
      <g fill="url(#gold)">${Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; return `<circle cx="${(110 + Math.cos(a) * 80).toFixed(1)}" cy="${(108 + Math.sin(a) * 80).toFixed(1)}" r="3.2"/>`; }).join('')}</g>
      <!-- the mask -->
      <path d="M110 46 C 146 46, 160 78, 156 108 C 152 138, 134 158, 110 164 C 86 158, 68 138, 64 108 C 60 78, 74 46, 110 46 Z" fill="url(#mask)"/>
      <path d="M72 70 Q 110 52 148 70 L 146 82 Q 110 68 74 82 Z" fill="url(#orange)"/>
      <!-- eyes -->
      <path d="M76 94 Q 92 82 106 96 Q 92 108 76 94 Z" fill="url(#orange)"/>
      <path d="M144 94 Q 128 82 114 96 Q 128 108 144 94 Z" fill="url(#orange)"/>
      <circle cx="93" cy="95" r="5.5" fill="#20120a"/><circle cx="127" cy="95" r="5.5" fill="#20120a"/>
      <circle cx="91" cy="93" r="1.8" fill="#fff"/><circle cx="125" cy="93" r="1.8" fill="#fff"/>
      <!-- nose -->
      <path d="M110 92 L 122 122 L 98 122 Z" fill="url(#gold)"/>
      <path d="M98 122 Q 110 130 122 122" stroke="#7a4a0c" stroke-width="2.4" fill="none"/>
      <!-- mouth and tongue -->
      <path d="M84 138 Q 110 128 136 138 Q 132 152 110 154 Q 88 152 84 138 Z" fill="#7d1a14"/>
      <path d="M100 142 Q 110 140 120 142 L 118 164 Q 110 172 102 164 Z" fill="url(#tongue)"/>
      <path d="M110 144 L 110 160" stroke="#a42848" stroke-width="1.6" opacity=".8"/>
      <g stroke="#f1b43a" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"><path d="M74 112 L 86 116"/><path d="M146 112 L 134 116"/><path d="M72 124 L 84 126"/><path d="M148 124 L 136 126"/></g>
    </g>
  </g>
  <ellipse cx="78" cy="52" rx="26" ry="9" transform="rotate(-32 78 52)" fill="#fff" opacity=".5" filter="url(#bl2)"/>
`, `
  ${L.gold('gold')}
  ${L.gradient('goldDark', [[0, '#b86f12'], [0.5, '#7a4608'], [1, '#d99a2a']], { x1: 1, y1: 1, x2: 0, y2: 0 })}
  ${L.radial('plate', [[0, '#e8a62a'], [0.7, '#a8650d'], [1, '#6f3d06']], { cx: 0.4, cy: 0.35, r: 0.8 })}
  ${L.gradient('mask', [[0, '#7fe6cf'], [0.45, '#2fae95'], [1, '#126b5a']], { x1: 0.2, y1: 0, x2: 0.8, y2: 1 })}
  ${L.gradient('orange', [[0, '#ffd27a'], [0.5, '#ff9a2a'], [1, '#c95a0c']])}
  ${L.gradient('tongue', [[0, '#ff9ab0'], [1, '#d04a6c']])}
  ${L.bevel('bev', { rel: 1.8, depth: 3.8 })}
  ${L.dropShadow('drop', 6, 4, 0.5)}
  ${L.blur('bl', 5)}${L.blur('bl2', 3)}
`),
};
