// The Sun Stone (the scatter): a gold calendar disc with a turquoise ring and a sun face.
const L = require('./_lib');

const teeth = (n, r1, r2) => {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    const p = (a, r) => `${(110 + Math.sin(a) * r).toFixed(1)} ${(108 - Math.cos(a) * r).toFixed(1)}`;
    d += `${i ? 'L' : 'M'}${p(a0, r1)} L${p(a1, r2)} L${p(a2, r1)} `;
  }
  return d + 'Z';
};

module.exports = {
  width: 220,
  height: 220,
  scale: 2,
  out: 'assets/jaguar/sym-sun.webp',
  quality: 90,
  svg: () => L.svg(220, 220, `
  <circle cx="110" cy="108" r="104" fill="url(#aura)"/>
  <g filter="url(#drop)">
    <g filter="url(#bev)">
      <path d="${teeth(20, 84, 100)}" fill="url(#gold)"/>
      <circle cx="110" cy="108" r="84" fill="url(#gold)"/>
      <circle cx="110" cy="108" r="72" fill="#7a4608"/>
      <circle cx="110" cy="108" r="68" fill="url(#turq)"/>
      <g fill="url(#gold)">${Array.from({ length: 20 }, (_, i) => { const a = (i / 20) * Math.PI * 2; return `<rect x="-4.5" y="-4.5" width="9" height="9" rx="1.6" transform="translate(${(110 + Math.cos(a) * 60).toFixed(1)} ${(108 + Math.sin(a) * 60).toFixed(1)}) rotate(${((a * 180) / Math.PI + 45).toFixed(0)})"/>`; }).join('')}</g>
      <circle cx="110" cy="108" r="48" fill="url(#gold)"/>
      <circle cx="110" cy="108" r="42" fill="url(#sunface)"/>
      <!-- the sun face -->
      <path d="M80 90 Q 94 80 106 92 Q 94 100 80 90 Z M140 90 Q 126 80 114 92 Q 126 100 140 90 Z" fill="#fff4c9"/>
      <circle cx="93" cy="91" r="3.6" fill="#3a0d00"/><circle cx="127" cy="91" r="3.6" fill="#3a0d00"/>
      <path d="M110 94 L 118 114 L 102 114 Z" fill="#c24a10"/>
      <path d="M92 128 Q 110 140 128 128 Q 122 150 110 150 Q 98 150 92 128 Z" fill="#7d1a14"/>
      <path d="M104 130 Q 110 128 116 130 L 114 144 Q 110 150 106 144 Z" fill="#ff9ab0"/>
    </g>
  </g>
  <ellipse cx="78" cy="52" rx="28" ry="8" transform="rotate(-34 78 52)" fill="#fff" opacity=".5" filter="url(#bl2)"/>
`, `
  ${L.radial('aura', [[0.45, '#ffb43a', 0.55], [1, '#ffb43a', 0]])}
  ${L.gold('gold')}
  ${L.gradient('turq', [[0, '#8ef0e0'], [0.5, '#25b3a4'], [1, '#0b6a66']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.radial('sunface', [[0, '#ffe08a'], [0.6, '#ff9a22'], [1, '#c9520a']], { cx: 0.4, cy: 0.35, r: 0.8 })}
  ${L.bevel('bev', { rel: 2, depth: 4 })}
  ${L.dropShadow('drop', 5, 3.5, 0.5)}
  ${L.blur('bl2', 3)}
`),
};
