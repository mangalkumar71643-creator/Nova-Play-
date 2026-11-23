// The top of the machine (412 x 330 units): the LED marquee with the name, the paytable board with every price in lit digits, and the panel
// that explains the bonus reel (multipliers, cash symbols, respins). Drawn with the symbol pictures (build symbols first).
const fs = require('fs');
const path = require('path');
const L = require('./_lib');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const img = (file) => 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'turbosevens', file + '.webp')).toString('base64');
const pic = (name, cx, cy, size) => `<image href="${img(name)}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}"/>`;

// a small deterministic random stream for the marquee's lamps
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/** A lit-digit window: dim "88888" behind, the price in front, right-aligned. */
const led = (x, y, w, h, value, size = 17) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4.5" fill="#0b0a08" stroke="#3a0a14" stroke-width="1.6"/>
  <rect x="${x + 1.2}" y="${y + 1.2}" width="${w - 2.4}" height="${h - 2.4}" rx="3.5" fill="none" stroke="#000" stroke-opacity="0.7" stroke-width="1"/>
  <text x="${x + w - 6}" y="${y + h / 2 + size * 0.36}" text-anchor="end" font-family="DejaVu Sans Mono" font-weight="700" font-size="${size}" fill="#4a3208" letter-spacing="1">${'8'.repeat(Math.max(3, Math.floor((w - 8) / (size * 0.66))))}</text>
  <text x="${x + w - 6}" y="${y + h / 2 + size * 0.36}" text-anchor="end" font-family="DejaVu Sans Mono" font-weight="700" font-size="${size}" fill="#ffd23a" letter-spacing="1" filter="url(#ledGlow)">${value}</text>`;

const row3 = (name, y, price, x0 = 20, gap = 38, size = 40) =>
  [0, 1, 2].map((i) => pic(name, x0 + size / 2 + i * gap, y, size)).join('') + led(138, y - 13, 66, 26, price);

module.exports = {
  width: 412,
  height: 330,
  scale: 2.5,
  out: 'assets/turbosevens/board.webp',
  quality: 90,
  svg: () => {
    // ---- the marquee
    let dots = '';
    for (let gx = 0; gx < 54; gx++) {
      for (let gy = 0; gy < 6; gy++) {
        const x = 26 + gx * 6.7, y = 15 + gy * 6.9;
        const centre = 1 - Math.abs(gx - 26) / 30;
        const lit = 0.25 + 0.75 * rnd() * (0.4 + 0.6 * centre);
        const hue = rnd() < 0.18 ? '#ffd23a' : rnd() < 0.5 ? '#ff7a1a' : '#ff2a2a';
        dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.1" fill="${hue}" opacity="${lit.toFixed(2)}"/>`;
      }
    }
    const marquee = `
      <rect x="10" y="4" width="392" height="54" rx="14" fill="url(#metal)" stroke="#16100a" stroke-width="1.6"/>
      <rect x="15" y="9" width="382" height="44" rx="10" fill="#1a0507"/>
      <g filter="url(#dotGlow)">${dots}</g>
      <rect x="15" y="9" width="382" height="44" rx="10" fill="url(#glass)"/>
      <g filter="url(#drop)">
        <text x="136" y="40" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="25" letter-spacing="1" fill="url(#titleA)" stroke="#5a0610" stroke-width="5" paint-order="stroke" stroke-linejoin="round">TURBO</text>
        <text x="270" y="43" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="36" letter-spacing="1" fill="url(#titleB)" stroke="#5a0610" stroke-width="6" paint-order="stroke" stroke-linejoin="round">777</text>
      </g>`;

    // ---- the paytable
    const pay = `
      <rect x="8" y="62" width="396" height="154" rx="14" fill="url(#boardEdge)"/>
      <rect x="11" y="65" width="390" height="148" rx="12" fill="url(#boardFace)"/>
      <rect x="11" y="65" width="390" height="148" rx="12" fill="none" stroke="#ff9a8a" stroke-opacity="0.28" stroke-width="1.2"/>
      ${row3('sym-flame7', 94, '200')}
      ${row3('sym-red7', 136, '40')}
      ${row3('sym-gold7', 178, '20')}
      <path d="M208 74 L208 206" stroke="#2a0510" stroke-width="2" opacity="0.7"/><path d="M209.5 74 L209.5 206" stroke="#ff9a8a" stroke-opacity="0.18" stroke-width="1"/>
      ${[0, 1, 2].map((i) => pic('sym-green2bar', 230 + i * 38, 94, 40)).join('')}${led(342, 81, 52, 26, '8')}
      ${[0, 1, 2].map((i) => pic('sym-blue1bar', 230 + i * 38, 136, 40)).join('')}${led(342, 123, 52, 26, '4')}
      <g>
        ${[['sym-flame7', 0], ['sym-red7', 1], ['sym-gold7', 2]].map(([n, i]) => pic(n, 226 + i * 17, 168, 24)).join('')}
        <text x="243" y="188" text-anchor="middle" font-family="Inter" font-weight="800" font-size="8.5" fill="#f4e6e6">ANY</text>
        ${led(220, 192, 46, 18, '8', 12)}
        ${pic('sym-blue1bar', 277, 166, 27)}${pic('sym-green2bar', 303, 167, 27)}
        <text x="292" y="188" text-anchor="middle" font-family="Inter" font-weight="800" font-size="8.5" fill="#f4e6e6">ANY</text>
        ${led(269, 192, 46, 18, '2', 12)}
        <text x="360" y="174" text-anchor="middle" font-family="Inter" font-weight="800" font-size="17" fill="#fff">ANY</text>
        ${led(337, 188, 60, 22, '0.8', 14)}
      </g>`;

    // ---- the bonus reel panel
    const feat = `
      <rect x="8" y="220" width="396" height="106" rx="14" fill="url(#boardEdge)"/>
      <rect x="11" y="223" width="390" height="100" rx="12" fill="url(#featFace)"/>
      <path d="M152 232 L152 314 M276 232 L276 314" stroke="#1d0210" stroke-width="2" opacity="0.8"/><path d="M153.5 232 L153.5 314 M277.5 232 L277.5 314" stroke="#ff9a8a" stroke-opacity="0.16" stroke-width="1"/>
      <text x="82" y="241" text-anchor="middle" font-family="Inter" font-weight="800" font-size="12.5" fill="#f7eaea">Multiple</text>
      ${pic('b-x10', 82, 266, 56)}${pic('b-x5', 50, 300, 50)}${pic('b-x2', 114, 300, 50)}
      ${pic('b-cash20', 188, 258, 56)}${led(214, 246, 56, 26, '20')}
      ${pic('b-cash2', 188, 298, 52)}${led(214, 286, 56, 26, '2')}
      <text x="340" y="241" text-anchor="middle" font-family="Inter" font-weight="800" font-size="12.5" fill="#f7eaea">respins</text>
      ${pic('b-respin', 340, 270, 56)}
      <text x="332" y="312" text-anchor="middle" font-family="Inter" font-weight="900" font-size="13" fill="#fff">Get</text>
      <text x="364" y="312" text-anchor="middle" font-family="Inter" font-weight="900" font-size="14" fill="#6aa8ff">1~5</text>
      <text x="340" y="320" text-anchor="middle" font-family="Inter" font-weight="800" font-size="6.5" fill="#f4e6e6" opacity="0">.</text>`;

    return L.svg(412, 330, `${marquee}${pay}${feat}
      <text x="340" y="321" text-anchor="middle" font-family="Inter" font-weight="800" font-size="7.5" letter-spacing="0.6" fill="#ffe9b0">WHEEL AWARD</text>`, `
      ${L.gradient('metal', [[0, '#8e8f9c'], [0.3, '#3b3c46'], [0.7, '#15161c'], [1, '#6a6b78']])}
      ${L.gradient('glass', [[0, '#fff', 0.2], [0.5, '#fff', 0], [1, '#000', 0.25]])}
      ${L.gradient('titleA', [[0, '#fffbe0'], [0.5, '#ffe27a'], [1, '#ffb01a']])}
      ${L.gradient('titleB', [[0, '#fff3a0'], [0.4, '#ffa51c'], [0.75, '#ff4a12'], [1, '#d0000e']])}
      ${L.gradient('boardEdge', [[0, '#c9a24a'], [0.5, '#6a3a10'], [1, '#e8c96a']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
      ${L.gradient('boardFace', [[0, '#8a1030'], [0.5, '#5a0a22'], [1, '#3a0618']])}
      ${L.gradient('featFace', [[0, '#6e0e2c'], [1, '#3a0618']])}
      ${L.dropShadow('drop', 2, 1.6, 0.7)}
      <filter id="ledGlow" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="0.9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="dotGlow" x="-5%" y="-20%" width="110%" height="140%"><feGaussianBlur stdDeviation="0.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    `);
  },
};
