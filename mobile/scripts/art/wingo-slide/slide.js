// The Win Go picture for the HOME SLIDER of Admin (a slide stands on the red stage at the top of Home; the app draws its own Play button under it).
// 900 x 640 at 1x, a transparent picture about as wide as the stage (the stage takes up to ~1.4 : 1). Made of the game's own look (WinGoScreen.tsx):
// its number chips 0-9 in their colours (0 red + violet, 5 green + violet, odd green, even red) with the 9X under each, its Green 2X / Violet 4.5X /
// Red 2X buttons, the clock of its period tabs, and the game's top pay (a number pays 9X); the red and gold of the Home round it off. Our own art.
//
// The admin panel's "Remove background" step (on by default) clears white / light-grey and near-black pixels that touch the outside of the picture,
// so nothing white or black may touch the edge: the white board sits inside a gold frame, every chip and the clock inside a maroon + gold outline,
// the title is a sticker, and the shadows are maroon (as in the Chicken Road slide).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const b64 = (file, mime) => `data:${mime};base64,` + fs.readFileSync(file).toString('base64');
const ASSET = (f) => path.join(ROOT, 'assets', f);

const MAROON = '#6A0D1A';
const GOLD = '#F5C518';
// The game's colours (WinGoScreen.tsx C_GREEN, C_RED, C_VIOLET) and a darker shade of each for a chip's edge.
const HEX = { GREEN: '#1DB25E', RED: '#F0445A', VIOLET: '#A559E6' };
const EDGE = { '#1DB25E': '#117A40', '#F0445A': '#A8213A', '#A559E6': '#6E2FA8' };
const colorsOf = (n) => (n === 0 ? ['RED', 'VIOLET'] : n === 5 ? ['GREEN', 'VIOLET'] : n % 2 === 0 ? ['RED'] : ['GREEN']).map((c) => HEX[c]);

/** The two halves of a split chip (0 and 5), or the whole round, centred on 0,0. */
const face = (cols, r, dy = 0, edge = false) => {
  const c = cols.map((x) => (edge ? EDGE[x] : x));
  return c.length === 1
    ? `<circle cy="${dy}" r="${r}" fill="${c[0]}"/>`
    : `<path d="M0 ${dy - r} A${r} ${r} 0 0 0 0 ${dy + r} Z" fill="${c[0]}"/><path d="M0 ${dy - r} A${r} ${r} 0 0 1 0 ${dy + r} Z" fill="${c[1]}"/>`;
};

/** One of the game's number chips (NumberBall): the colour, a dashed white ring, a white middle and the number in the chip's colours. */
function chip(n, r) {
  const cols = colorsOf(n);
  const dash = ((2 * Math.PI * r * 0.82) / 16).toFixed(2);
  return `${face(cols, r)}
    <circle r="${r * 0.82}" fill="none" stroke="#fff" stroke-width="${r * 0.14}" stroke-dasharray="${dash} ${dash}" opacity="0.6"/>
    <circle r="${r * 0.6}" fill="#fff"/>
    <circle r="${r}" fill="url(#chipShine)"/>
    <text y="${(r * 0.3).toFixed(1)}" text-anchor="middle" font-family="SlideFont" font-weight="900" font-size="${(r * 0.84).toFixed(1)}" fill="url(#num${n})">${n}</text>`;
}

/** A big chip with an edge (a little thickness), as a sticker: maroon and gold round it. */
const heroChip = (n, cx, cy, r, rot) => `
  <g transform="translate(${cx} ${cy}) rotate(${rot})" filter="url(#shadow)">
    <circle r="${r + 17}" fill="${GOLD}"/><circle cy="${r * 0.12}" r="${r + 17}" fill="${GOLD}"/>
    <circle r="${r + 9}" fill="${MAROON}"/><circle cy="${r * 0.12}" r="${r + 9}" fill="${MAROON}"/>
    ${face(colorsOf(n), r, r * 0.12, true)}
    ${chip(n, r)}
  </g>`;

/** A gold coin with a rupee sign. */
const coin = (cx, cy, r, rot = 0) => `
  <g transform="translate(${cx} ${cy}) rotate(${rot})" filter="url(#shadow)">
    <circle r="${r + 3}" fill="${MAROON}"/>
    <circle r="${r}" fill="url(#coinGold)"/>
    <circle r="${r * 0.8}" fill="none" stroke="#B8860B" stroke-width="${r * 0.1}" opacity="0.7"/>
    <circle r="${r}" fill="none" stroke="#FFE680" stroke-width="${r * 0.07}" opacity="0.8"/>
    <text y="${r * 0.37}" text-anchor="middle" font-family="SlideFont" font-weight="900" font-size="${r * 1.1}" fill="#8A5A00">₹</text>
  </g>`;

/** A four-point gold sparkle. */
const spark = (cx, cy, r, rot = 0) =>
  `<path transform="translate(${cx} ${cy}) rotate(${rot})" d="M0 ${-r} C${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r} 0 C${r * 0.12} ${r * 0.12} ${r * 0.12} ${r * 0.12} 0 ${r} C${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r} 0 C${-r * 0.12} ${-r * 0.12} ${-r * 0.12} ${-r * 0.12} 0 ${-r} Z" fill="#FFD84A" filter="url(#glow)"/>`;

/** One of the game's three colour bets: its gradient, its name and its pay. */
const colourBet = (x, w, grad, label, rate) => `
  <rect x="${x}" y="16" width="${w}" height="64" rx="14" fill="url(#${grad})"/>
  <rect x="${x + 4}" y="19" width="${w - 8}" height="24" rx="11" fill="#fff" opacity="0.16"/>
  <g font-family="SlideFont" fill="#fff" stroke="#000" stroke-opacity="0.12" stroke-width="3" paint-order="stroke">
    <text x="${x + 14}" y="58" font-weight="900" font-size="25">${label}</text>
    <text x="${x + w - 12}" y="57" font-weight="800" font-size="21" text-anchor="end">${rate}</text>
  </g>`;

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/wingo-slide.webp',
  lossless: true,
  svg: () => {
    const font900 = b64(ASSET('fonts/Montserrat_900Black.ttf'), 'font/ttf');
    const font800 = b64(ASSET('fonts/Montserrat_800ExtraBold.ttf'), 'font/ttf');
    // The board's ten chips, two rows of five, each with the game's 9X under it.
    const board = Array.from({ length: 10 }, (_, n) => {
      const x = 74 + (n % 5) * 98;
      const y = n < 5 ? 150 : 266;
      return `<g transform="translate(${x} ${y})">${chip(n, 40)}</g>
        <text x="${x}" y="${y + 61}" text-anchor="middle" font-family="SlideFont" font-weight="800" font-size="20" fill="#8E9893">9X</text>`;
    }).join('');
    const numberGradients = Array.from({ length: 10 }, (_, n) => {
      const cols = colorsOf(n);
      return `<linearGradient id="num${n}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cols[0]}"/><stop offset="1" stop-color="${cols[1] ?? cols[0]}"/></linearGradient>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640">
  <defs>
    <style>
      @font-face { font-family: 'SlideFont'; font-weight: 900; src: url(${font900}) format('truetype'); }
      @font-face { font-family: 'SlideFont'; font-weight: 800; src: url(${font800}) format('truetype'); }
    </style>
    ${numberGradients}
    <linearGradient id="goldFrame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9A8"/><stop offset="0.5" stop-color="#E3A92E"/><stop offset="1" stop-color="#8F5A0C"/></linearGradient>
    <linearGradient id="whiteText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFE9B0"/></linearGradient>
    <linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0A0"/><stop offset="0.5" stop-color="#FFC62E"/><stop offset="1" stop-color="#F08C00"/></linearGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B3162B"/><stop offset="0.5" stop-color="#7C0E1E"/><stop offset="1" stop-color="#520812"/></linearGradient>
    <linearGradient id="betGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3FD17F"/><stop offset="1" stop-color="#16994F"/></linearGradient>
    <linearGradient id="betViolet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C184F5"/><stop offset="1" stop-color="#8C3FD8"/></linearGradient>
    <linearGradient id="betRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF7385"/><stop offset="1" stop-color="#E0263E"/></linearGradient>
    <radialGradient id="clockGreen" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#6BE59C"/><stop offset="1" stop-color="#138A48"/></radialGradient>
    <radialGradient id="chipShine" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="coinGold" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#FFF2A8"/><stop offset="0.5" stop-color="${GOLD}"/><stop offset="1" stop-color="#C98A00"/></radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#3A0008" flood-opacity="0.65"/></filter>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>

  <g transform="translate(20 8) scale(0.955)">
  <!-- THE BOARD: the game's colour bets and number chips on its white panel, in a gold frame, a little tilted -->
  <g transform="translate(24 238) rotate(-3 270 180)" filter="url(#shadow)">
    <rect x="-10" y="-10" width="560" height="380" rx="30" fill="url(#goldFrame)"/>
    <rect x="0" y="0" width="540" height="360" rx="22" fill="#FFFFFF"/>
    ${colourBet(16, 162, 'betGreen', 'Green', '2X')}
    ${colourBet(189, 162, 'betViolet', 'Violet', '4.5X')}
    ${colourBet(362, 162, 'betRed', 'Red', '2X')}
    <rect x="16" y="92" width="508" height="252" rx="18" fill="#EEF1F0"/>
    ${board}
    <rect x="3" y="3" width="534" height="354" rx="20" fill="none" stroke="#E3A92E" stroke-opacity="0.35" stroke-width="2"/>
  </g>

  <!-- THE NAME: the clock of the game's period tabs and its name, as a sticker -->
  <g transform="translate(96 100)" filter="url(#shadow)">
    <circle r="80" fill="${GOLD}"/>
    <circle r="71" fill="${MAROON}"/>
    <circle r="60" fill="url(#clockGreen)" stroke="#fff" stroke-width="6"/>
    <g stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.85">
      <path d="M0 -50 V-42"/><path d="M50 0 H42"/><path d="M0 50 V42"/><path d="M-50 0 H-42"/>
    </g>
    <path d="M0 0 V-34" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
    <path d="M0 0 L24 13" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
    <circle r="7.5" fill="#fff"/>
    <ellipse cx="-22" cy="-27" rx="17" ry="9" fill="#fff" opacity="0.3" transform="rotate(-32 -22 -27)"/>
  </g>
  <g font-family="SlideFont" font-weight="900" stroke-linejoin="round" filter="url(#shadow)">
    <g paint-order="stroke">
      <text x="196" y="148" font-size="124" letter-spacing="2" fill="none" stroke="${GOLD}" stroke-width="58">WIN GO</text>
      <text x="196" y="148" font-size="124" letter-spacing="2" fill="none" stroke="${MAROON}" stroke-width="40">WIN GO</text>
    </g>
    <text x="196" y="148" font-size="124" letter-spacing="2"><tspan fill="url(#whiteText)">WIN</tspan><tspan fill="url(#goldText)"> GO</tspan></text>
  </g>

  <!-- THE REWARD: the game's top pay (a number pays 9X), on a plate in the red and gold of the Home -->
  <g transform="translate(592 420) rotate(3 158 92) scale(0.9)" filter="url(#shadow)">
    <path d="M30 0 H306 L336 30 V166 L306 196 H30 L0 166 V30 Z" fill="url(#goldFrame)"/>
    <path d="M34 10 H302 L326 34 V162 L302 186 H34 L10 162 V34 Z" fill="url(#plate)"/>
    <path d="M34 10 H302 L326 34 V70 H10 V34 Z" fill="#fff" opacity="0.1"/>
    <path d="M34 15 H302 L321 36 V160 L302 181 H34 L15 160 V36 Z" fill="none" stroke="#FFD25A" stroke-opacity="0.6" stroke-width="2"/>
    <g font-family="SlideFont" font-weight="900" text-anchor="middle">
      <text x="168" y="62" font-size="38" letter-spacing="6" fill="#FFD25A" stroke="#3A0008" stroke-width="6" paint-order="stroke" stroke-linejoin="round">UP TO</text>
      <text x="168" y="160" font-size="104" fill="url(#whiteText)" stroke="#3A0008" stroke-width="12" paint-order="stroke" stroke-linejoin="round">9X</text>
    </g>
    <circle cx="22" cy="22" r="5" fill="#FFE9A8"/><circle cx="314" cy="22" r="5" fill="#FFE9A8"/><circle cx="22" cy="174" r="5" fill="#FFE9A8"/><circle cx="314" cy="174" r="5" fill="#FFE9A8"/>
  </g>

  <!-- THE CHIPS jumping out: a green 7, a red-and-violet 0, a green-and-violet 5 -->
  ${heroChip(5, 652, 262, 44, -14)}
  ${heroChip(0, 824, 158, 56, 14)}
  ${heroChip(7, 784, 316, 86, -9)}

  ${coin(574, 226, 26, -12)}
  ${coin(42, 606, 24, 10)}
  ${coin(878, 616, 18, -8)}
  ${coin(690, 410, 18, 12)}
  ${spark(612, 52, 24, 8)}
  ${spark(878, 262, 18, 0)}
  ${spark(28, 236, 18, 10)}
  ${spark(552, 626, 20, 0)}
  </g>
</svg>`;
  },
};
