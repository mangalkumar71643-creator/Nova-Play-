// The jaguar warrior's face and chest, front on, drawn in a 200 x 200 box (centre 100, 100): used by the wild symbol and the hero.
const L = require('./_lib');

const rnd = (i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  return a - Math.floor(a);
};

module.exports = function jaguar(id = 'j') {
  const D = (n) => id + n;
  const defs = `
    ${L.radial(D('Fur'), [[0, '#ffc566'], [0.55, '#f59a2c'], [1, '#c2601a']], { cx: 0.45, cy: 0.32, r: 0.85 })}
    ${L.radial(D('Muz'), [[0, '#fff6dc'], [1, '#f2d296']], { cx: 0.5, cy: 0.35, r: 0.75 })}
    ${L.gradient(D('Green'), [[0, '#a3f7ac'], [0.5, '#2fc45b'], [1, '#0d7332']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
    ${L.gradient(D('Red'), [[0, '#ffa493'], [0.5, '#e8473d'], [1, '#98181a']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
    ${L.gradient(D('Blue'), [[0, '#7fd4ff'], [0.5, '#1f93d8'], [1, '#0b4a8c']])}
    ${L.gradient(D('Cape'), [[0, '#48b8f0'], [0.6, '#1673b8'], [1, '#0a3a70']])}
    ${L.radial(D('Iris'), [[0, '#fbffa8'], [0.6, '#cfe03a'], [1, '#7a9a14']], { cx: 0.4, cy: 0.35, r: 0.7 })}
    ${L.gradient(D('Gold'), L.GOLD_STOPS)}
    ${L.gradient(D('Turq'), [[0, '#a3f5e8'], [0.5, '#2dbfae'], [1, '#0c6a66']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
    ${L.bevel(D('Bev'), { rel: 2, depth: 3.4, shine: 0.7, shade: 0.4 })}
    ${L.dropShadow(D('Drop'), 3, 2.5, 0.45)}
  `;

  // feathers fanned out behind the head, green and red in turn
  const feathers = [];
  for (let i = -6; i <= 6; i++) {
    const len = 112 - Math.abs(i) * 4.4;
    const fill = i % 2 === 0 ? D('Green') : D('Red');
    feathers.push({ i, len, fill });
  }
  const feather = ({ i, len, fill }) => `<g transform="translate(100 100) rotate(${i * 13.5})">
      <path d="M0 0 C 15 -22, 17 ${-len * 0.66}, 0 ${-len} C -17 ${-len * 0.66}, -15 -22, 0 0 Z" fill="url(#${fill})" stroke="#1b0f08" stroke-opacity=".55" stroke-width="1.3"/>
      <path d="M0 -8 L0 ${-len + 9}" stroke="#fff" stroke-opacity=".5" stroke-width="1.6"/>
      <path d="M-9 ${-len * 0.55} Q 0 ${-len * 0.6} 9 ${-len * 0.55}" stroke="#14150f" stroke-opacity=".35" stroke-width="2" fill="none"/>
    </g>`;

  const spots = Array.from({ length: 26 }, (_, k) => {
    const a = rnd(k + 3) * Math.PI * 2;
    const r = 26 + rnd(k + 40) * 22;
    const x = 100 + Math.cos(a) * r * 1.25;
    const y = 112 + Math.sin(a) * r * 0.8;
    if (y < 76 || (Math.abs(x - 100) < 22 && y > 100 && y < 140) || (Math.abs(x - 100) < 36 && y > 92 && y < 106)) return '';
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2 + rnd(k + 9) * 2.6).toFixed(1)}" fill="#2a1408" opacity=".78"/>`;
  }).join('');

  const body = `
    <g filter="url(#${D('Drop')})">
      ${feathers.sort((a, b) => Math.abs(b.i) - Math.abs(a.i)).map(feather).join('')}
    </g>
    <!-- cape and chest -->
    <g filter="url(#${D('Drop')})"><g filter="url(#${D('Bev')})">
      <path d="M18 202 Q 26 166 66 156 L 134 156 Q 174 166 182 202 Z" fill="url(#${D('Cape')})"/>
      <path d="M18 202 Q 26 166 66 156 L 134 156 Q 174 166 182 202" fill="none" stroke="url(#${D('Gold')})" stroke-width="5"/>
    </g></g>
    <!-- ears -->
    <g filter="url(#${D('Drop')})"><g filter="url(#${D('Bev')})">
      <circle cx="48" cy="68" r="21" fill="url(#${D('Fur')})"/><circle cx="152" cy="68" r="21" fill="url(#${D('Fur')})"/>
    </g></g>
    <circle cx="48" cy="70" r="11" fill="#3a1c10"/><circle cx="152" cy="70" r="11" fill="#3a1c10"/>
    <circle cx="48" cy="72" r="6" fill="#8a4a2a"/><circle cx="152" cy="72" r="6" fill="#8a4a2a"/>
    <!-- head -->
    <g filter="url(#${D('Drop')})"><g filter="url(#${D('Bev')})">
      <path d="M100 56 C 142 56, 162 84, 158 114 C 154 144, 130 162, 100 162 C 70 162, 46 144, 42 114 C 38 84, 58 56, 100 56 Z" fill="url(#${D('Fur')})"/>
    </g></g>
    ${spots}
    <ellipse cx="100" cy="130" rx="38" ry="28" fill="url(#${D('Muz')})"/>
    <!-- headband -->
    <g filter="url(#${D('Drop')})"><g filter="url(#${D('Bev')})">
      <path d="M43 80 Q 100 54 157 80 L 158 95 Q 100 70 42 95 Z" fill="url(#${D('Blue')})"/>
      <g fill="url(#${D('Gold')})">${[0, 1, 2, 3, 4].map((k) => { const t = k / 4; const x = 52 + t * 96; const y = 86 - Math.sin(t * Math.PI) * 17; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4"/>`; }).join('')}</g>
    </g></g>
    <!-- eyes -->
    <g>
      <path d="M56 102 Q 74 86 94 100 Q 74 113 56 102 Z" fill="#fffbe0"/>
      <path d="M144 102 Q 126 86 106 100 Q 126 113 144 102 Z" fill="#fffbe0"/>
      <circle cx="76" cy="100" r="8" fill="url(#${D('Iris')})"/><circle cx="124" cy="100" r="8" fill="url(#${D('Iris')})"/>
      <ellipse cx="76" cy="100" rx="2.4" ry="6.6" fill="#120904"/><ellipse cx="124" cy="100" rx="2.4" ry="6.6" fill="#120904"/>
      <circle cx="73" cy="97" r="2" fill="#fff"/><circle cx="121" cy="97" r="2" fill="#fff"/>
      <path d="M53 103 Q 74 83 96 99" fill="none" stroke="#150a05" stroke-width="4.6" stroke-linecap="round"/>
      <path d="M147 103 Q 126 83 104 99" fill="none" stroke="#150a05" stroke-width="4.6" stroke-linecap="round"/>
      <path d="M95 101 Q 101 114 96 128 M105 101 Q 99 114 104 128" fill="none" stroke="#150a05" stroke-width="3" stroke-linecap="round"/>
      <path d="M50 84 L 94 94 M150 84 L 106 94" stroke="#1b0d06" stroke-width="5.4" stroke-linecap="round"/>
    </g>
    <!-- nose, mouth -->
    <path d="M89 118 Q 100 113 111 118 L 100 131 Z" fill="#c4506c" stroke="#2a0e12" stroke-width="2"/>
    <path d="M100 131 L 100 141 M100 141 Q 87 152 72 144 M100 141 Q 113 152 128 144" fill="none" stroke="#2a0e12" stroke-width="2.8" stroke-linecap="round"/>
    <g fill="#fffdf2" stroke="#2a0e12" stroke-width="1.2"><path d="M85 146 l 5 13 l 5 -11 Z"/><path d="M115 146 l -5 13 l -5 -11 Z"/></g>
    <g fill="#2a1408" opacity=".7">${[[78, 126], [73, 132], [82, 133], [122, 126], [127, 132], [118, 133]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5"/>`).join('')}</g>
    <!-- necklace -->
    <g filter="url(#${D('Drop')})">
      <path d="M52 160 Q 100 194 148 160" fill="none" stroke="url(#${D('Gold')})" stroke-width="8" stroke-linecap="round"/>
      ${[0, 1, 2, 3, 4, 5, 6].map((k) => { const t = k / 6; const x = 58 + t * 84; const y = 163 + Math.sin(t * Math.PI) * 22; return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5.4" fill="url(#${D('Turq')})" stroke="#0b4a46" stroke-width="1"/>`; }).join('')}
    </g>
  `;
  return { defs, body };
};
