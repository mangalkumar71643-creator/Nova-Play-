// The Garuda Gold picture for the HOME SLIDER of Admin (a slide stands on the red stage at the top of Home; the app draws its own Play
// button under it). 900 x 640, transparent. Our own art only: the game's golden Garuda (../garuda/hero.js) rising behind the game's name
// on a carved plaque with gold rims (as in the game), the coins of its multiplier reel (../garuda/coins.js: x500, x100, x50, x25) and the
// game's real top win (one spin pays at most Rs 5,00,000).
//
// The admin panel's "Remove background" step (on by default) clears white / light-grey and near-black pixels that touch the outside of
// the picture: the edges here are gold (the Garuda, the coins, the rims), the plaque's dark wood sits inside its gold rims, the light
// fades out well inside the picture, and the shadows are dark brown, not black.
const fs = require('fs');
const path = require('path');
const L = require('../garuda/_lib');
const hero = require('../garuda/hero');
const coins = require('../garuda/coins');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const b64 = (file, mime) => `data:${mime};base64,` + fs.readFileSync(file).toString('base64');
const svgImage = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const coinSvg = (id) => svgImage(coins.find((c) => c._id === id).svg());

/** A four-point sparkle (gold, never white: a white speck at the edge would be cleared by the panel). */
const spark = (cx, cy, r, rot = 0) =>
  `<path transform="translate(${cx} ${cy}) rotate(${rot})" d="M0 ${-r} C${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r} 0 C${r * 0.12} ${r * 0.12} ${r * 0.12} ${r * 0.12} 0 ${r} C${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r} 0 C${-r * 0.12} ${-r * 0.12} ${-r * 0.12} ${-r * 0.12} 0 ${-r} Z" fill="#FFD84A" filter="url(#sGlow)"/>`;

/** A coin of the multiplier reel, drawn at `size`, a little turned. */
const reelCoin = (id, cx, cy, size, rot) =>
  `<g transform="translate(${cx} ${cy}) rotate(${rot})" filter="url(#sShadow)"><image href="${coinSvg(id)}" x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}"/></g>`;

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/garuda-gold-slide.webp',
  lossless: true,
  svg: () => {
    const font900 = b64(path.join(ROOT, 'assets/fonts/Montserrat_900Black.ttf'), 'font/ttf');
    const font800 = b64(path.join(ROOT, 'assets/fonts/Montserrat_800ExtraBold.ttf'), 'font/ttf');
    const lotus = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#gBev)"><path d="M0 -9 C 4 -4, 4 4, 0 9 C -4 4, -4 -4, 0 -9 Z" fill="url(#gGold)"/><path d="M-7 -4 C -2 -2, 0 2, 0 7 C -5 5, -8 1, -7 -4 Z" fill="url(#gGold)"/><path d="M7 -4 C 2 -2, 0 2, 0 7 C 5 5, 8 1, 7 -4 Z" fill="url(#gGold)"/></g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640" viewBox="0 0 900 640">
  <defs>
    <style>
      @font-face { font-family: 'SF'; font-weight: 900; src: url(${font900}) format('truetype'); }
      @font-face { font-family: 'SF'; font-weight: 800; src: url(${font800}) format('truetype'); }
    </style>
    ${L.goldDefs()}
    ${L.gradient('beam', [[0, '#7a4418'], [0.5, '#4a260e'], [1, '#341a08']])}
    ${L.stoneGrain('grain', { freq: 1.1, seed: 4, dark: 0.25 })}
    <radialGradient id="glow" cx="450" cy="268" r="236" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFE08A" stop-opacity="0.75"/><stop offset="0.55" stop-color="#F5A623" stop-opacity="0.3"/><stop offset="1" stop-color="#F5A623" stop-opacity="0"/></radialGradient>
    <linearGradient id="nameGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBE0"/><stop offset="0.3" stop-color="#FFE27A"/><stop offset="0.62" stop-color="#F0A820"/><stop offset="1" stop-color="#C87A08"/></linearGradient>
    <linearGradient id="plateRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C21830"/><stop offset="0.5" stop-color="#8E0E20"/><stop offset="1" stop-color="#5C0814"/></linearGradient>
    <linearGradient id="amountGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF9D6"/><stop offset="0.35" stop-color="#FFE070"/><stop offset="0.7" stop-color="#F2A91E"/><stop offset="1" stop-color="#FFD45E"/></linearGradient>
    <filter id="sShadow" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#3A1404" flood-opacity="0.65"/></filter>
    <filter id="sGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <clipPath id="beamClip"><path d="M150 430 H750 L782 476 L750 522 H150 L118 476 Z"/></clipPath>
  </defs>

  <!-- gold light behind the Garuda, gone well before the edges -->
  <circle cx="450" cy="268" r="236" fill="url(#glow)"/>

  <!-- THE GARUDA of the game, rising behind its name -->
  <image href="${svgImage(hero.svg())}" x="62" y="4" width="776" height="565"/>

  <!-- THE NAME on the game's carved plaque with gold rims and lotus ends -->
  <g filter="url(#sShadow)">
    <g filter="url(#gBev)"><path d="M144 418 H756 L796 476 L756 534 H144 L104 476 Z" fill="url(#gGoldD)"/></g>
    <path d="M150 430 H750 L782 476 L750 522 H150 L118 476 Z" fill="url(#beam)"/>
    <rect x="100" y="420" width="700" height="112" fill="#000" filter="url(#grain)" opacity="0.55" clip-path="url(#beamClip)"/>
    <path d="M150 430 H750 L782 476 L750 522 H150 L118 476 Z" fill="none" stroke="#2A1204" stroke-width="2"/>
    ${lotus(150, 476, 1.6)}${lotus(750, 476, 1.6)}
    <g filter="url(#gBev)">
      <text x="450" y="503" text-anchor="middle" font-family="Liberation Serif" font-weight="700" font-size="78" letter-spacing="4" fill="url(#nameGold)" stroke="#3A1A02" stroke-width="5" paint-order="stroke" stroke-linejoin="round">GARUDA GOLD</text>
    </g>
  </g>

  <!-- THE TOP WIN: one spin pays at most Rs 5,00,000 -->
  <g filter="url(#sShadow)">
    <g filter="url(#gBev)"><rect x="226" y="538" width="448" height="82" rx="41" fill="url(#gGold)"/></g>
    <rect x="234" y="546" width="432" height="66" rx="33" fill="url(#plateRed)"/>
    <rect x="248" y="550" width="404" height="22" rx="11" fill="#fff" opacity="0.14"/>
    <text x="450" y="594" text-anchor="middle" font-family="SF" font-weight="900" font-size="30" letter-spacing="1.5" fill="#FFE9B0" stroke="#3A0008" stroke-width="5" paint-order="stroke">UP TO <tspan font-size="42" fill="url(#amountGold)">₹5,00,000</tspan></text>
  </g>

  <!-- the coins of its multiplier reel -->
  ${reelCoin('x500', 112, 390, 150, -12)}
  ${reelCoin('x100', 792, 380, 136, 10)}
  ${reelCoin('x50', 96, 568, 96, 8)}
  ${reelCoin('x25', 808, 566, 90, -10)}

  ${spark(450, 34, 15, 0)}
  ${spark(150, 120, 22, 10)}
  ${spark(752, 112, 20, 0)}
  ${spark(220, 600, 16, 0)}
  ${spark(690, 606, 16, 10)}
</svg>`;
  },
};
