// PAUSED DRAFT (the owner asked for the Garuda Gold game instead). The art build skips files whose names start with "_", so this one is not
// built. To finish it: put a public-domain or CC0 jaguar photo, cropped square round the face, at source/jaguar-face.webp (licence checked on
// its Wikimedia Commons page), rename this file to slide.js and run node scripts/art/build.js jaguar-slide.
// The Jaguar Temple picture for the HOME SLIDER of Admin (a slide stands on the red stage at the top of Home; the app draws its own Play button under it).
// 900 x 640 at 1x, transparent, about the 1.4 : 1 the stage shows biggest. A real jaguar (a public-domain photograph, source/jaguar-face.webp, made by
// prepare_photo.py) in a carved gold sun-stone frame in the gold of the game, the game's own title plaque, and only what the game really gives:
// 10 FREE GAMES (three sun stones), the Jaguar Spirit that grows to x10 in them, and the BUY BONUS.
//
// The admin panel's "Remove background" step (on by default) clears white / light-grey and near-black pixels that touch the outside of a slide, so
// nothing white or black touches the outside here: the photo sits inside the gold frame, the words have gold and dark-brown outlines, the badges
// gold rings, and the shadows are dark brown, not black.
const fs = require('fs');
const path = require('path');
const L = require('../jaguar/_lib');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const b64 = (file, mime) => `data:${mime};base64,` + fs.readFileSync(file).toString('base64');
const SRC = (f) => path.join(__dirname, 'source', f);
const ASSET = (f) => path.join(ROOT, 'assets', f);

const GOLD = '#F5C518';
const BROWN = '#3A2306';
const C = { x: 450, y: 236 }; // the centre of the medallion
const R = { teethOut: 224, teethIn: 196, bandIn: 177, turqIn: 165, photo: 158 };

const polar = (r, a) => `${(C.x + Math.sin(a) * r).toFixed(1)} ${(C.y - Math.cos(a) * r).toFixed(1)}`;

/** The sun-stone teeth round the medallion. */
function teeth(n) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.5) / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2;
    d += `${i ? 'L' : 'M'}${polar(R.teethIn, a0)} L${polar(R.teethOut, a1)} L${polar(R.teethIn, a2)} `;
  }
  return d + 'Z';
}

/** Light rays behind the medallion. */
function rays(n) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.06, w = (Math.PI / n) * (i % 2 ? 0.55 : 0.9);
    out += `<path d="M${C.x} ${C.y} L${polar(470, a - w)} L${polar(470, a + w)} Z" opacity="${i % 2 ? 0.55 : 1}"/>`;
  }
  return out;
}

/** Engraved steps on the gold band, and the beads on the turquoise ring. */
const steps = (n) => Array.from({ length: n }, (_, i) => `<rect x="${C.x - 4}" y="${C.y - R.teethIn + 4}" width="8" height="11" rx="1.5" transform="rotate(${(360 / n) * i} ${C.x} ${C.y})"/>`).join('');
const beads = (n) => Array.from({ length: n }, (_, i) => `<circle cx="${C.x}" cy="${C.y - (R.bandIn + R.turqIn) / 2}" r="4.2" transform="rotate(${(360 / n) * i + 360 / n / 2} ${C.x} ${C.y})"/>`).join('');

/** A gold coin with a rupee sign. */
const coin = (cx, cy, r, rot = 0) => `
  <g transform="translate(${cx} ${cy}) rotate(${rot})" filter="url(#sShadow)">
    <circle r="${r + 3}" fill="${BROWN}"/>
    <circle r="${r}" fill="url(#coinGold)"/>
    <circle r="${r * 0.8}" fill="none" stroke="#B8860B" stroke-width="${r * 0.1}" opacity="0.7"/>
    <circle r="${r}" fill="none" stroke="#FFE680" stroke-width="${r * 0.07}" opacity="0.8"/>
    <text y="${r * 0.37}" text-anchor="middle" font-family="SlideFont" font-weight="900" font-size="${r * 1.1}" fill="#8A5A00">₹</text>
  </g>`;

/** A four-point gold sparkle. */
const spark = (cx, cy, r, rot = 0) =>
  `<path transform="translate(${cx} ${cy}) rotate(${rot})" d="M0 ${-r} C${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r} 0 C${r * 0.12} ${r * 0.12} ${r * 0.12} ${r * 0.12} 0 ${r} C${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r} 0 C${-r * 0.12} ${-r * 0.12} ${-r * 0.12} ${-r * 0.12} 0 ${-r} Z" fill="#FFD84A" filter="url(#sGlow)"/>`;

/** Words with the gold ring and the dark-brown outline (the outlines are wide enough to fill the notches of the letters). */
const bigWords = (x, y, size, text, fill, anchor = 'start') => `
  <text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="none" stroke="${GOLD}" stroke-width="${size * 0.46}" stroke-linejoin="round">${text}</text>
  <text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="none" stroke="${BROWN}" stroke-width="${size * 0.32}" stroke-linejoin="round">${text}</text>
  <text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${fill}">${text}</text>`;

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/jaguar-temple-slide.webp',
  lossless: true,
  svg: () => {
    const font900 = b64(ASSET('fonts/Montserrat_900Black.ttf'), 'font/ttf');
    const font800 = b64(ASSET('fonts/Montserrat_800ExtraBold.ttf'), 'font/ttf');
    const photo = b64(SRC('jaguar-face.webp'), 'image/webp');
    const logo = b64(ASSET('jaguar/logo.webp'), 'image/webp');
    const buy = b64(ASSET('jaguar/badge-buy.webp'), 'image/webp');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640">
  <defs>
    <style>
      @font-face { font-family: 'SlideFont'; font-weight: 900; src: url(${font900}) format('truetype'); }
      @font-face { font-family: 'SlideFont'; font-weight: 800; src: url(${font800}) format('truetype'); }
    </style>
    ${L.gold('sGoldV')}
    ${L.gold('sGoldD', { x1: 0, y1: 0, x2: 1, y2: 1 })}
    ${L.bevel('sBev', { rel: 2.2, depth: 4 })}
    ${L.gradient('sTurq', [[0, '#8ff3e6'], [0.5, '#2bbfb0'], [1, '#0f6f6a']])}
    ${L.gradient('sGoldText', [[0, '#FFF6C2'], [0.45, '#FFCF3A'], [1, '#E58A00']])}
    ${L.gradient('sRed', [[0, '#E0233A'], [0.55, '#A3101F'], [1, '#5E0712']])}
    <radialGradient id="sRay" cx="${C.x}" cy="${C.y}" r="440" gradientUnits="userSpaceOnUse"><stop offset="0.3" stop-color="#FFD25A" stop-opacity="0.75"/><stop offset="1" stop-color="#FFD25A" stop-opacity="0"/></radialGradient>
    <radialGradient id="sHalo" cx="${C.x}" cy="${C.y}" r="300" gradientUnits="userSpaceOnUse"><stop offset="0.55" stop-color="#FFC83A" stop-opacity="0.55"/><stop offset="1" stop-color="#FFC83A" stop-opacity="0"/></radialGradient>
    <radialGradient id="sVignette" cx="${C.x}" cy="${C.y}" r="${R.photo}" gradientUnits="userSpaceOnUse"><stop offset="0.72" stop-color="#1a0d02" stop-opacity="0"/><stop offset="1" stop-color="#1a0d02" stop-opacity="0.55"/></radialGradient>
    <radialGradient id="coinGold" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#FFF2A8"/><stop offset="0.5" stop-color="${GOLD}"/><stop offset="1" stop-color="#C98A00"/></radialGradient>
    <filter id="sShadow" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#2A1404" flood-opacity="0.6"/></filter>
    <filter id="sGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="sPhoto"><circle cx="${C.x}" cy="${C.y}" r="${R.photo}"/></clipPath>
  </defs>

  <!-- the light of the temple behind it all -->
  <circle cx="${C.x}" cy="${C.y}" r="300" fill="url(#sHalo)"/>
  <g fill="url(#sRay)">${rays(28)}</g>

  <!-- THE MEDALLION: the jaguar in a carved gold sun stone -->
  <g filter="url(#sShadow)">
    <g filter="url(#sBev)">
      <path d="${teeth(36)}" fill="url(#sGoldD)"/>
      <circle cx="${C.x}" cy="${C.y}" r="${R.teethIn}" fill="url(#sGoldV)"/>
    </g>
    <g fill="#8a5408" opacity="0.55">${steps(40)}</g>
    <circle cx="${C.x}" cy="${C.y}" r="${R.bandIn}" fill="url(#sTurq)"/>
    <g fill="url(#sGoldV)" filter="url(#sBev)">${beads(24)}</g>
    <circle cx="${C.x}" cy="${C.y}" r="${R.turqIn}" fill="url(#sGoldV)" filter="url(#sBev)"/>
    <g clip-path="url(#sPhoto)">
      <rect x="${C.x - R.photo}" y="${C.y - R.photo}" width="${R.photo * 2}" height="${R.photo * 2}" fill="#3a2410"/>
      <image href="${photo}" x="${C.x - R.photo}" y="${C.y - R.photo}" width="${R.photo * 2}" height="${R.photo * 2}" preserveAspectRatio="xMidYMid slice"/>
      <circle cx="${C.x}" cy="${C.y}" r="${R.photo}" fill="url(#sVignette)"/>
      <path d="M${C.x - 120} ${C.y - 90} A ${R.photo} ${R.photo} 0 0 1 ${C.x + 60} ${C.y - 150} A ${R.photo * 1.2} ${R.photo * 1.2} 0 0 0 ${C.x - 120} ${C.y - 90} Z" fill="#fff" opacity="0.10"/>
    </g>
    <circle cx="${C.x}" cy="${C.y}" r="${R.photo}" fill="none" stroke="#5a3206" stroke-width="3"/>
  </g>

  <!-- the game's own title plaque, over the foot of the medallion -->
  <image href="${logo}" x="${C.x - 215}" y="388" width="430" height="127" filter="url(#sShadow)"/>

  <!-- LEFT: the Jaguar Spirit badge (x10 in the free games) -->
  <g transform="translate(122 300) rotate(-8)" filter="url(#sShadow)">
    <circle r="84" fill="url(#sGoldD)" filter="url(#sBev)"/>
    <circle r="72" fill="url(#sRed)"/>
    <circle r="72" fill="none" stroke="#FFD25A" stroke-opacity="0.55" stroke-width="2"/>
    <g font-family="SlideFont" font-weight="900" text-anchor="middle" stroke-linejoin="round" paint-order="stroke">
      <text y="-26" font-size="19" letter-spacing="2" fill="#fff" stroke="${BROWN}" stroke-width="5">SPIRIT</text>
      <text y="30" font-size="62" fill="url(#sGoldText)" stroke="${BROWN}" stroke-width="9">x10</text>
      <text y="54" font-size="14" letter-spacing="1" fill="#FFE9A8" stroke="${BROWN}" stroke-width="4">UP TO</text>
    </g>
  </g>

  <!-- RIGHT: the game's BUY BONUS badge in a gold ring -->
  <g transform="translate(778 300) rotate(8)" filter="url(#sShadow)">
    <circle r="84" fill="url(#sGoldD)" filter="url(#sBev)"/>
    <image href="${buy}" x="-76" y="-76" width="152" height="152"/>
  </g>

  <!-- 10 FREE GAMES -->
  <g font-family="SlideFont" font-weight="900" filter="url(#sShadow)">
    ${bigWords(122, 604, 104, '10', 'url(#sGoldText)')}
    ${bigWords(268, 604, 76, 'FREE GAMES', 'url(#sGoldText)')}
  </g>

  ${coin(170, 118, 26, -12)}
  ${coin(742, 112, 24, 14)}
  ${coin(58, 446, 20, 10)}
  ${coin(848, 452, 22, -8)}
  ${spark(268, 58, 22, 8)}
  ${spark(640, 46, 18, 0)}
  ${spark(866, 214, 18, 10)}
  ${spark(36, 222, 16, 0)}
</svg>`;
  },
};
