// The Win Go picture for the HOME SLIDER of Admin (a slide stands on the red stage at the top of Home; the app draws its own Play button under it).
// 900 x 640 at 1x, transparent. Its own layout, unlike the Chicken Road slide (title top-left, card, plate): everything turns round the middle.
// A big emerald-and-gold stopwatch shows the game's countdown boxes (a round every 30 seconds), the game's ten number chips (WinGoScreen.tsx
// NumberBall: 0 red + violet, 5 green + violet, odd green, even red) stand over it in an arch, the 7 lit as the number that came up, the name runs
// along a green ribbon with gold edges, and a gold burst gives the game's top pay (a number pays 9X). Win Go's green and gold on the red stage.
//
// The admin panel's "Remove background" step (on by default) clears white / light-grey and near-black pixels that touch the outside of the picture,
// so nothing white or black reaches the edge (the white parts are inside the watch and the chips) and the shadows are dark green or maroon.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const b64 = (file, mime) => `data:${mime};base64,` + fs.readFileSync(file).toString('base64');
const ASSET = (f) => path.join(ROOT, 'assets', f);

const GOLD = '#F5C518';
const DEEP_GREEN = '#0A4A28';
// The game's colours (WinGoScreen.tsx C_GREEN, C_RED, C_VIOLET).
const HEX = { GREEN: '#1DB25E', RED: '#F0445A', VIOLET: '#A559E6' };
const colorsOf = (n) => (n === 0 ? ['RED', 'VIOLET'] : n === 5 ? ['GREEN', 'VIOLET'] : n % 2 === 0 ? ['RED'] : ['GREEN']).map((c) => HEX[c]);

// The watch, and the arch of chips round it.
const CX = 450;
const CY = 352;
const ARCH_R = 282;
const WIN = 7;

/** One of the game's number chips (NumberBall), centred on 0,0: the colour, a dashed white ring, a white middle, the number in its colours. */
function chip(n, r) {
  const cols = colorsOf(n);
  const dash = ((2 * Math.PI * r * 0.82) / 16).toFixed(2);
  const face =
    cols.length === 1
      ? `<circle r="${r}" fill="${cols[0]}"/>`
      : `<path d="M0 ${-r} A${r} ${r} 0 0 0 0 ${r} Z" fill="${cols[0]}"/><path d="M0 ${-r} A${r} ${r} 0 0 1 0 ${r} Z" fill="${cols[1]}"/>`;
  return `<circle r="${r + 5}" fill="url(#goldRim)"/>
    ${face}
    <circle r="${r * 0.82}" fill="none" stroke="#fff" stroke-width="${r * 0.14}" stroke-dasharray="${dash} ${dash}" opacity="0.6"/>
    <circle r="${r * 0.6}" fill="#fff"/>
    <circle r="${r}" fill="url(#chipShine)"/>
    <text y="${(r * 0.3).toFixed(1)}" text-anchor="middle" font-family="SlideFont" font-weight="900" font-size="${(r * 0.84).toFixed(1)}" fill="url(#num${n})">${n}</text>`;
}

/** A gold coin with a rupee sign. */
const coin = (cx, cy, r, rot = 0) => `
  <g transform="translate(${cx} ${cy}) rotate(${rot})" filter="url(#shadow)">
    <circle r="${r + 3}" fill="#8F5A0C"/>
    <circle r="${r}" fill="url(#coinGold)"/>
    <circle r="${r * 0.8}" fill="none" stroke="#B8860B" stroke-width="${r * 0.1}" opacity="0.7"/>
    <circle r="${r}" fill="none" stroke="#FFE680" stroke-width="${r * 0.07}" opacity="0.8"/>
    <text y="${r * 0.37}" text-anchor="middle" font-family="SlideFont" font-weight="900" font-size="${r * 1.1}" fill="#8A5A00">₹</text>
  </g>`;

/** A four-point gold sparkle. */
const spark = (cx, cy, r, rot = 0) =>
  `<path transform="translate(${cx} ${cy}) rotate(${rot})" d="M0 ${-r} C${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r} 0 C${r * 0.12} ${r * 0.12} ${r * 0.12} ${r * 0.12} 0 ${r} C${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r} 0 C${-r * 0.12} ${-r * 0.12} ${-r * 0.12} ${-r * 0.12} 0 ${-r} Z" fill="#FFE27A" filter="url(#glow)"/>`;

/** A star of `points` points between radius r1 and r2, centred on 0,0. */
const star = (points, r1, r2) => {
  let d = '';
  for (let k = 0; k < points * 2; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / points;
    const r = k % 2 ? r2 : r1;
    d += `${k ? 'L' : 'M'}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)} `;
  }
  return `${d}Z`;
};

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/wingo-slide.webp',
  lossless: true,
  svg: () => {
    const font900 = b64(ASSET('fonts/Montserrat_900Black.ttf'), 'font/ttf');
    const font800 = b64(ASSET('fonts/Montserrat_800ExtraBold.ttf'), 'font/ttf');
    const numberGradients = Array.from({ length: 10 }, (_, n) => {
      const cols = colorsOf(n);
      return `<linearGradient id="num${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cols[0]}"/><stop offset="1" stop-color="${cols[1] ?? cols[0]}"/></linearGradient>`;
    }).join('');

    // The arch: 0 to 9 from left to right over the watch; the 7 (the number that came up) a little bigger, lit.
    const arch = Array.from({ length: 10 }, (_, n) => {
      const a = ((-76 + n * (152 / 9)) * Math.PI) / 180;
      const x = CX + ARCH_R * Math.sin(a);
      const y = CY - ARCH_R * Math.cos(a);
      const r = n === WIN ? 48 : 38;
      const lit = n === WIN ? `<circle r="${r + 22}" fill="url(#winGlow)"/>` : '';
      // Upright, so every number reads at a glance (a 6 or a 9 on its side would not).
      return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" filter="url(#shadowGreen)">${lit}${chip(n, r)}</g>`;
    }).join('');

    // The light behind the watch.
    const rays = Array.from({ length: 16 }, (_, k) => {
      const a = (k * 22.5 * Math.PI) / 180;
      const w = (4 * Math.PI) / 180;
      const R = 300;
      return `<path d="M${CX} ${CY} L${(CX + R * Math.sin(a - w)).toFixed(1)} ${(CY - R * Math.cos(a - w)).toFixed(1)} L${(CX + R * Math.sin(a + w)).toFixed(1)} ${(CY - R * Math.cos(a + w)).toFixed(1)} Z"/>`;
    }).join('');

    // The minute marks of the watch face.
    const ticks = Array.from({ length: 60 }, (_, k) => {
      const a = (k * 6 * Math.PI) / 180;
      const big = k % 5 === 0;
      const r1 = big ? 104 : 110;
      return `<path d="M${(Math.sin(a) * r1).toFixed(1)} ${(-Math.cos(a) * r1).toFixed(1)} L${(Math.sin(a) * 118).toFixed(1)} ${(-Math.cos(a) * 118).toFixed(1)}" stroke-width="${big ? 5 : 2.2}"/>`;
    }).join('');

    // The game's countdown boxes: 0 0 : 3 0.
    const box = (x, d) => `<rect x="${x}" y="-38" width="46" height="66" rx="9" fill="url(#boxWhite)"/><text x="${x + 23}" y="17" text-anchor="middle" font-family="SlideFont" font-weight="900" font-size="52" fill="#123B26">${d}</text>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640">
  <defs>
    <style>
      @font-face { font-family: 'SlideFont'; font-weight: 900; src: url(${font900}) format('truetype'); }
      @font-face { font-family: 'SlideFont'; font-weight: 800; src: url(${font800}) format('truetype'); }
    </style>
    ${numberGradients}
    <linearGradient id="goldCase" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1B0"/><stop offset="0.35" stop-color="#F5C518"/><stop offset="0.7" stop-color="#C98A00"/><stop offset="1" stop-color="#FFE07A"/></linearGradient>
    <linearGradient id="goldRim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFEFA0"/><stop offset="1" stop-color="#C98A00"/></linearGradient>
    <linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF6C0"/><stop offset="0.45" stop-color="#FFD02E"/><stop offset="1" stop-color="#F59A00"/></linearGradient>
    <linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#36D27B"/><stop offset="0.5" stop-color="#1DB25E"/><stop offset="1" stop-color="#0E7A40"/></linearGradient>
    <linearGradient id="ribbonTail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A9A52"/><stop offset="1" stop-color="#0B5F35"/></linearGradient>
    <linearGradient id="boxWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E3EFE8"/></linearGradient>
    <linearGradient id="burstRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6B6B"/><stop offset="0.5" stop-color="#E3162C"/><stop offset="1" stop-color="#A1081C"/></linearGradient>
    <radialGradient id="face" cx="0.42" cy="0.36" r="0.75"><stop offset="0" stop-color="#3FE08C"/><stop offset="0.6" stop-color="#16994F"/><stop offset="1" stop-color="#0B6A37"/></radialGradient>
    <radialGradient id="rayGold" cx="${CX}" cy="${CY}" r="300" gradientUnits="userSpaceOnUse"><stop offset="0.25" stop-color="#FFE27A" stop-opacity="0.75"/><stop offset="1" stop-color="#FFE27A" stop-opacity="0"/></radialGradient>
    <radialGradient id="halo" cx="${CX}" cy="${CY}" r="250" gradientUnits="userSpaceOnUse"><stop offset="0.45" stop-color="#FFD84A" stop-opacity="0.5"/><stop offset="1" stop-color="#FFD84A" stop-opacity="0"/></radialGradient>
    <radialGradient id="winGlow"><stop offset="0.55" stop-color="#FFF3A0" stop-opacity="0.95"/><stop offset="1" stop-color="#FFD84A" stop-opacity="0"/></radialGradient>
    <radialGradient id="chipShine" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="coinGold" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#FFF2A8"/><stop offset="0.5" stop-color="${GOLD}"/><stop offset="1" stop-color="#C98A00"/></radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#3A0008" flood-opacity="0.6"/></filter>
    <filter id="shadowGreen" x="-40%" y="-40%" width="180%" height="190%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="${DEEP_GREEN}" flood-opacity="0.75"/></filter>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <path id="ribbonText" d="M170 572 Q${CX} 534 730 572"/>
  </defs>

  <g transform="translate(18 6) scale(0.96)">
  <!-- light behind the watch -->
  <circle cx="${CX}" cy="${CY}" r="250" fill="url(#halo)"/>
  <g fill="url(#rayGold)">${rays}</g>

  <!-- THE ARCH of the game's number chips -->
  ${arch}

  <!-- THE WATCH: a round every 30 seconds, with the game's countdown boxes -->
  <g transform="translate(${CX} ${CY})" filter="url(#shadow)">
    <rect x="-20" y="-180" width="40" height="34" rx="6" fill="url(#goldCase)" stroke="#8F5A0C" stroke-width="3"/>
    <rect x="-40" y="-202" width="80" height="30" rx="12" fill="url(#goldCase)" stroke="#8F5A0C" stroke-width="3"/>
    <g transform="rotate(42)"><rect x="-15" y="-172" width="30" height="30" rx="6" fill="url(#goldCase)" stroke="#8F5A0C" stroke-width="3"/></g>
    <g transform="rotate(-42)"><rect x="-15" y="-172" width="30" height="30" rx="6" fill="url(#goldCase)" stroke="#8F5A0C" stroke-width="3"/></g>
    <circle r="152" fill="url(#goldCase)"/>
    <circle r="152" fill="none" stroke="#8F5A0C" stroke-width="3"/>
    <circle r="138" fill="#0B5F35"/>
    <circle r="128" fill="url(#face)"/>
    <g stroke="#fff" stroke-linecap="round" opacity="0.75">${ticks}</g>
    <text y="-56" text-anchor="middle" font-family="SlideFont" font-weight="800" font-size="20" letter-spacing="3" fill="#E9FFF1">TIME LEFT</text>
    <g transform="translate(0 6)">
      ${box(-112, 0)}${box(-60, 0)}
      <circle cx="0" cy="-14" r="5.5" fill="#fff"/><circle cx="0" cy="12" r="5.5" fill="#fff"/>
      ${box(14, 3)}${box(66, 0)}
    </g>
    <path d="M-92 -84 A128 128 0 0 1 60 -112" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="0.18"/>
  </g>

  <!-- THE NAME on a green ribbon with gold edges -->
  <g filter="url(#shadow)">
    <path d="M150 508 L56 520 L92 566 L56 612 L170 604 Z" fill="url(#ribbonTail)" stroke="${GOLD}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M750 508 L844 520 L808 566 L844 612 L730 604 Z" fill="url(#ribbonTail)" stroke="${GOLD}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M150 508 L170 532 L170 604 Z" fill="#06391F"/>
    <path d="M750 508 L730 532 L730 604 Z" fill="#06391F"/>
    <path d="M130 496 Q${CX} 452 770 496 L770 600 Q${CX} 556 130 600 Z" fill="url(#ribbon)" stroke="${GOLD}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M142 508 Q${CX} 466 758 508" fill="none" stroke="#fff" stroke-width="3" opacity="0.35"/>
    <text font-family="SlideFont" font-weight="900" font-size="98" letter-spacing="4" text-anchor="middle" fill="none" stroke="${DEEP_GREEN}" stroke-width="16" stroke-linejoin="round"><textPath href="#ribbonText" startOffset="50%">WIN GO</textPath></text>
    <text font-family="SlideFont" font-weight="900" font-size="98" letter-spacing="4" text-anchor="middle" fill="url(#goldText)"><textPath href="#ribbonText" startOffset="50%">WIN GO</textPath></text>
  </g>

  <!-- THE TOP PAY: a number pays 9X -->
  <g transform="translate(796 124) rotate(10)" filter="url(#shadow)">
    <path d="${star(18, 80, 64)}" fill="url(#goldCase)" stroke="#8F5A0C" stroke-width="3" stroke-linejoin="round"/>
    <circle r="58" fill="url(#burstRed)" stroke="#FFE07A" stroke-width="4"/>
    <text y="-20" text-anchor="middle" font-family="SlideFont" font-weight="800" font-size="16" letter-spacing="2" fill="#FFE9A8">NUMBER</text>
    <text y="34" text-anchor="middle" font-family="SlideFont" font-weight="900" font-size="58" fill="url(#goldText)" stroke="#5A0010" stroke-width="6" paint-order="stroke" stroke-linejoin="round">9X</text>
  </g>

  ${coin(74, 430, 26, -12)}
  ${coin(118, 352, 18, 10)}
  ${coin(830, 380, 22, 14)}
  ${coin(786, 452, 16, -8)}
  ${spark(112, 120, 24, 8)}
  ${spark(300, 210, 14, 0)}
  ${spark(612, 238, 16, 12)}
  ${spark(866, 268, 18, 0)}
  ${spark(450, 628, 18, 0)}
  </g>
</svg>`;
  },
};
