// The Chicken Road picture for the HOME SLIDER of Admin (a slide stands on the red stage at the top of Home; the app draws its own Play button under it).
// 900 x 640 at 1x, a transparent picture about as wide as the stage (the stage takes up to ~1.4 : 1). Made of the game's own art: the chicken, the
// yellow taxi, the police car, the manholes, the egg and the two-line name of the app's header; the colours of the Home (red, gold) round it off.
//
// The admin panel's "Remove background" step (on by default) clears white / light-grey and near-black pixels that touch the outside of the picture,
// so nothing white or black may touch the edge: every white part sits inside an outline of maroon or gold (the "sticker" look of the title and the
// chicken, the gold frame of the road card, the gold border of the plate), and there are no black shadows (the shadows are maroon).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const b64 = (file, mime) => `data:${mime};base64,` + fs.readFileSync(file).toString('base64');
const SRC = (f) => path.join(__dirname, 'source', f);
const ASSET = (f) => path.join(ROOT, 'assets', f);

const MAROON = '#6A0D1A';
const GOLD = '#F5C518';

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

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/chicken-road-slide.webp',
  lossless: true,
  svg: () => {
    const font900 = b64(ASSET('fonts/Montserrat_900Black.ttf'), 'font/ttf');
    const font800 = b64(ASSET('fonts/Montserrat_800ExtraBold.ttf'), 'font/ttf');
    const chicken = b64(SRC('chicken.webp'), 'image/webp');
    const manhole = b64(ASSET('chicken-road-manhole.webp'), 'image/webp');
    const taxi = b64(ASSET('chicken-road-car-1.webp'), 'image/webp');
    const police = b64(ASSET('chicken-road-car-3.webp'), 'image/webp');
    // The road card: 3 lanes of 188 units; the manholes sit at the same height, the cars drive down towards them.
    const lanes = [94, 270, 446];
    const labels = ['1.88x', '2.09x', '2.32x'];
    const manholes = lanes
      .map(
        (x, i) => `
        <image href="${manhole}" x="${x - 66}" y="${232 - 69}" width="132" height="138"/>
        <text x="${x}" y="${232 + 13}" text-anchor="middle" font-family="SlideFont" font-weight="800" font-size="37" fill="#fff" stroke="#1A1B1E" stroke-width="3" paint-order="stroke" stroke-linejoin="round">${labels[i]}</text>`
      )
      .join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640">
  <defs>
    <style>
      @font-face { font-family: 'SlideFont'; font-weight: 900; src: url(${font900}) format('truetype'); }
      @font-face { font-family: 'SlideFont'; font-weight: 800; src: url(${font800}) format('truetype'); }
    </style>
    <linearGradient id="goldFrame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9A8"/><stop offset="0.5" stop-color="#E3A92E"/><stop offset="1" stop-color="#8F5A0C"/></linearGradient>
    <linearGradient id="whiteText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FFE9B0"/></linearGradient>
    <linearGradient id="goldText" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0A0"/><stop offset="0.5" stop-color="#FFC62E"/><stop offset="1" stop-color="#F08C00"/></linearGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B3162B"/><stop offset="0.5" stop-color="#7C0E1E"/><stop offset="1" stop-color="#520812"/></linearGradient>
    <linearGradient id="egg" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#FFC27A"/><stop offset="0.55" stop-color="#F29A4B"/><stop offset="1" stop-color="#D9742A"/></linearGradient>
    <linearGradient id="asphalt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#707071"/><stop offset="1" stop-color="#5C5C60"/></linearGradient>
    <radialGradient id="coinGold" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#FFF2A8"/><stop offset="0.5" stop-color="${GOLD}"/><stop offset="1" stop-color="#C98A00"/></radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#3A0008" flood-opacity="0.65"/></filter>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <!-- the sticker outline of the chicken: its outline pushed out by about 9 units (blur, then cut hard), in maroon, with a gold line round that -->
    <filter id="sticker" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b1"/>
      <feComponentTransfer in="b1" result="m1"><feFuncA type="linear" slope="14" intercept="-1.0"/></feComponentTransfer>
      <feFlood flood-color="${MAROON}" result="c1"/><feComposite in="c1" in2="m1" operator="in" result="maroon"/>
      <feGaussianBlur in="SourceAlpha" stdDeviation="9" result="b2"/>
      <feComponentTransfer in="b2" result="m2"><feFuncA type="linear" slope="14" intercept="-1.0"/></feComponentTransfer>
      <feFlood flood-color="${GOLD}" result="c2"/><feComposite in="c2" in2="m2" operator="in" result="gold"/>
      <feDropShadow in="gold" dx="0" dy="7" stdDeviation="6" flood-color="#3A0008" flood-opacity="0.6" result="outer"/>
      <feMerge><feMergeNode in="outer"/><feMergeNode in="gold"/><feMergeNode in="maroon"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="screenClip"><rect x="6" y="6" width="528" height="338" rx="16"/></clipPath>
  </defs>

  <g transform="translate(20 8) scale(0.955)">
  <!-- THE ROAD CARD: the game's screen in a gold frame, a little tilted -->
  <g transform="translate(24 244) rotate(-3 270 175)" filter="url(#shadow)">
    <rect x="-9" y="-9" width="558" height="368" rx="28" fill="url(#goldFrame)"/>
    <rect x="0" y="0" width="540" height="350" rx="20" fill="#1A1B1E"/>
    <g clip-path="url(#screenClip)">
      <rect x="6" y="6" width="528" height="338" fill="url(#asphalt)"/>
      <g stroke="#F2F2F2" stroke-width="8" stroke-dasharray="34 28" stroke-linecap="butt" opacity="0.95"><path d="M182 -10 V360"/><path d="M358 -10 V360"/></g>
      ${manholes}
      <!-- the cars drive down their lanes towards the manholes -->
      <image href="${taxi}" x="${lanes[0] - 52}" y="14" width="104" height="167"/>
      <image href="${police}" x="${lanes[1] - 53}" y="2" width="106" height="170"/>
      <!-- a soft light across the glass -->
      <path d="M6 6 H280 L140 344 H6 Z" fill="#fff" opacity="0.06"/>
    </g>
    <rect x="3" y="3" width="534" height="344" rx="18" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="2"/>
  </g>

  <!-- THE NAME of the game: the egg and the two lines of the app's header, as a sticker -->
  <g transform="translate(24 30)" filter="url(#shadow)">
    <path d="M44 0 C72 0 92 40 92 78 C92 110 72 130 44 130 C16 130 -4 110 -4 78 C-4 40 16 0 44 0 Z" fill="none" stroke="${GOLD}" stroke-width="30" stroke-linejoin="round"/>
    <path d="M44 0 C72 0 92 40 92 78 C92 110 72 130 44 130 C16 130 -4 110 -4 78 C-4 40 16 0 44 0 Z" fill="url(#egg)" stroke="${MAROON}" stroke-width="16" stroke-linejoin="round" paint-order="stroke"/>
    <ellipse cx="28" cy="38" rx="12" ry="20" fill="#fff" opacity="0.4" transform="rotate(18 28 38)"/>
    <circle cx="56" cy="82" r="4.2" fill="#B65A1C" opacity="0.8"/><circle cx="32" cy="98" r="3.6" fill="#B65A1C" opacity="0.8"/><circle cx="62" cy="52" r="3.2" fill="#B65A1C" opacity="0.7"/><circle cx="24" cy="70" r="3" fill="#B65A1C" opacity="0.7"/>
  </g>
  <g font-family="SlideFont" font-weight="900" stroke-linejoin="round" filter="url(#shadow)">
    <g paint-order="stroke">
      <text x="152" y="100" font-size="98" letter-spacing="0.5" fill="none" stroke="${GOLD}" stroke-width="46">CHICKEN</text>
      <text x="152" y="196" font-size="98" letter-spacing="0.5" fill="none" stroke="${GOLD}" stroke-width="46">ROAD</text>
      <text x="152" y="100" font-size="98" letter-spacing="0.5" fill="none" stroke="${MAROON}" stroke-width="32">CHICKEN</text>
      <text x="152" y="196" font-size="98" letter-spacing="0.5" fill="none" stroke="${MAROON}" stroke-width="32">ROAD</text>
    </g>
    <text x="152" y="100" font-size="98" letter-spacing="0.5" fill="url(#whiteText)">CHICKEN</text>
    <text x="152" y="196" font-size="98" letter-spacing="0.5" fill="url(#goldText)">ROAD</text>
  </g>

  <!-- THE REWARD: a plate in the red and gold of the Home -->
  <g transform="translate(578 414) rotate(3 158 92) scale(0.94)" filter="url(#shadow)">
    <path d="M30 0 H306 L336 30 V166 L306 196 H30 L0 166 V30 Z" fill="url(#goldFrame)"/>
    <path d="M34 10 H302 L326 34 V162 L302 186 H34 L10 162 V34 Z" fill="url(#plate)"/>
    <path d="M34 10 H302 L326 34 V70 H10 V34 Z" fill="#fff" opacity="0.1"/>
    <path d="M34 15 H302 L321 36 V160 L302 181 H34 L15 160 V36 Z" fill="none" stroke="#FFD25A" stroke-opacity="0.6" stroke-width="2"/>
    <g font-family="SlideFont" font-weight="900" text-anchor="middle">
      <text x="168" y="62" font-size="38" letter-spacing="6" fill="#FFD25A" stroke="#3A0008" stroke-width="6" paint-order="stroke" stroke-linejoin="round">UP TO</text>
      <text x="168" y="156" font-size="92" fill="url(#whiteText)" stroke="#3A0008" stroke-width="12" paint-order="stroke" stroke-linejoin="round">1189x</text>
    </g>
    <circle cx="22" cy="22" r="5" fill="#FFE9A8"/><circle cx="314" cy="22" r="5" fill="#FFE9A8"/><circle cx="22" cy="174" r="5" fill="#FFE9A8"/><circle cx="314" cy="174" r="5" fill="#FFE9A8"/>
  </g>

  <!-- THE CHICKEN of the game, jumping out of the card -->
  <g transform="translate(590 16) rotate(8 150 170)">
    <image href="${chicken}" x="0" y="0" width="290" height="335" filter="url(#sticker)"/>
  </g>

  ${coin(566, 262, 27, -12)}
  ${coin(878, 396, 22, 14)}
  ${coin(60, 612, 24, 10)}
  ${coin(870, 618, 18, -8)}
  ${spark(612, 44, 26, 8)}
  ${spark(882, 228, 20, 0)}
  ${spark(30, 236, 18, 10)}
  ${spark(548, 628, 20, 0)}
  </g>
</svg>`;
  },
};
