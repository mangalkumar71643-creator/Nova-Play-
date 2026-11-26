// The Garuda Gold picture for Admin -> Popups (an app-open popup; the app draws its PLAY button under it): 840 x 1260 (2:3).
// Our own art only: the golden Garuda of the game (../garuda/hero.js, drawn again here at poster size), the game's name in its
// gold serif letters, the game's real top win (one spin pays at most Rs 5,00,000; the multiplier reel's NUDGE goes up to 500x),
// on a dark warm background with gold light, coins and sparks.
const fs = require('fs');
const path = require('path');
const L = require('../garuda/_lib');
const hero = require('../garuda/hero');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const b64 = (file, mime) => `data:${mime};base64,` + fs.readFileSync(file).toString('base64');
const W = 840;
const H = 1260;

/** A gold coin with a rupee sign, tilted. */
const coin = (cx, cy, r, rot = 0, squash = 0.82) => `
  <g transform="translate(${cx} ${cy}) rotate(${rot}) scale(1 ${squash})" filter="url(#pShadow)">
    <circle cy="${r * 0.18}" r="${r}" fill="#8F5A0C"/>
    <circle r="${r}" fill="url(#coinGold)"/>
    <circle r="${r * 0.78}" fill="none" stroke="#B8860B" stroke-width="${r * 0.09}" opacity="0.8"/>
    <text y="${r * 0.38}" text-anchor="middle" font-family="PF" font-weight="900" font-size="${r * 1.05}" fill="#8A5A00">₹</text>
    <ellipse cx="${-r * 0.32}" cy="${-r * 0.42}" rx="${r * 0.34}" ry="${r * 0.13}" fill="#fff" opacity="0.5" transform="rotate(-28 ${-r * 0.32} ${-r * 0.42})"/>
  </g>`;

/** A four-point sparkle. */
const spark = (cx, cy, r, rot = 0) =>
  `<path transform="translate(${cx} ${cy}) rotate(${rot})" d="M0 ${-r} C${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r} 0 C${r * 0.12} ${r * 0.12} ${r * 0.12} ${r * 0.12} 0 ${r} C${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r} 0 C${-r * 0.12} ${-r * 0.12} ${-r * 0.12} ${-r * 0.12} 0 ${-r} Z" fill="#FFE9A0" filter="url(#pGlow)"/>`;

module.exports = {
  width: W,
  height: H,
  scale: 1,
  out: 'assets/promo/garuda-gold-popup.webp',
  quality: 90,
  svg: () => {
    const font900 = b64(path.join(ROOT, 'assets/fonts/Montserrat_900Black.ttf'), 'font/ttf');
    const font800 = b64(path.join(ROOT, 'assets/fonts/Montserrat_800ExtraBold.ttf'), 'font/ttf');
    // The game's Garuda, as its own picture (its filters and gradients keep to themselves), drawn large.
    const heroSvg = 'data:image/svg+xml;base64,' + Buffer.from(hero.svg()).toString('base64');
    // Gold light from behind the Garuda.
    let rays = '';
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      const w = 0.045;
      const R = 760;
      rays += `<path d="M420 360 L${(420 + R * Math.sin(a - w)).toFixed(1)} ${(360 - R * Math.cos(a - w)).toFixed(1)} L${(420 + R * Math.sin(a + w)).toFixed(1)} ${(360 - R * Math.cos(a + w)).toFixed(1)} Z"/>`;
    }
    // Floating gold dust (a fixed random stream, so every build is the same).
    let s = 17;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    let dust = '';
    for (let i = 0; i < 70; i++) {
      const x = 30 + rnd() * 780, y = 40 + rnd() * 1120, r = 1 + rnd() * 2.6;
      dust += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="#FFD36A" opacity="${(0.25 + rnd() * 0.55).toFixed(2)}"/>`;
    }
    const badge = (x, w, text) => `
      <g transform="translate(${x} 1046)">
        <rect x="${-w / 2}" y="-28" width="${w}" height="56" rx="28" fill="url(#badgeFill)" stroke="url(#gGold)" stroke-width="3"/>
        <rect x="${-w / 2 + 8}" y="-23" width="${w - 16}" height="18" rx="9" fill="#fff" opacity="0.08"/>
        <text y="10" text-anchor="middle" font-family="PF" font-weight="800" font-size="25" letter-spacing="1.5" fill="#FFE8A8">${text}</text>
      </g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <style>
      @font-face { font-family: 'PF'; font-weight: 900; src: url(${font900}) format('truetype'); }
      @font-face { font-family: 'PF'; font-weight: 800; src: url(${font800}) format('truetype'); }
    </style>
    ${L.goldDefs()}
    <radialGradient id="bgGlow" cx="420" cy="380" r="760" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7A3E0C"/><stop offset="0.35" stop-color="#3A1806"/><stop offset="0.75" stop-color="#160803"/><stop offset="1" stop-color="#0B0402"/></radialGradient>
    <radialGradient id="rayFade" cx="420" cy="360" r="700" gradientUnits="userSpaceOnUse"><stop offset="0.1" stop-color="#FFD36A" stop-opacity="0.32"/><stop offset="1" stop-color="#FFD36A" stop-opacity="0"/></radialGradient>
    <radialGradient id="halo" cx="420" cy="330" r="360" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFE08A" stop-opacity="0.55"/><stop offset="0.6" stop-color="#F0A020" stop-opacity="0.15"/><stop offset="1" stop-color="#F0A020" stop-opacity="0"/></radialGradient>
    <linearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E0502" stop-opacity="0"/><stop offset="0.55" stop-color="#0E0502" stop-opacity="0.85"/><stop offset="1" stop-color="#0E0502" stop-opacity="1"/></linearGradient>
    <linearGradient id="nameGoldBig" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBE0"/><stop offset="0.3" stop-color="#FFE27A"/><stop offset="0.62" stop-color="#F0A820"/><stop offset="1" stop-color="#C87A08"/></linearGradient>
    <linearGradient id="amountGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF9D6"/><stop offset="0.3" stop-color="#FFE070"/><stop offset="0.58" stop-color="#F2A91E"/><stop offset="0.82" stop-color="#C4780C"/><stop offset="1" stop-color="#FFD45E"/></linearGradient>
    <linearGradient id="amountDeep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9A6000"/><stop offset="1" stop-color="#5A3400"/></linearGradient>
    <linearGradient id="badgeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5A1A0A"/><stop offset="1" stop-color="#2A0A04"/></linearGradient>
    <linearGradient id="frameGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE9A8"/><stop offset="0.3" stop-color="#C98A1A"/><stop offset="0.55" stop-color="#FFE07A"/><stop offset="0.8" stop-color="#A86A08"/><stop offset="1" stop-color="#FFD25A"/></linearGradient>
    <radialGradient id="coinGold" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#FFF2A8"/><stop offset="0.5" stop-color="#F5C518"/><stop offset="1" stop-color="#C98A00"/></radialGradient>
    <filter id="pShadow" x="-30%" y="-30%" width="170%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.6"/></filter>
    <filter id="pGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="textGlow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur in="SourceAlpha" stdDeviation="10" result="b"/><feFlood flood-color="#FFB020" flood-opacity="0.45"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    ${L.bevel('pBev', { rel: 1.8, depth: 3.6, shine: 0.95, exp: 26 })}
  </defs>

  <!-- the dark warm ground, the gold light and the dust -->
  <rect width="${W}" height="${H}" fill="url(#bgGlow)"/>
  <g fill="url(#rayFade)">${rays}</g>
  <circle cx="420" cy="330" r="360" fill="url(#halo)"/>
  ${dust}

  <!-- THE GARUDA of the game -->
  <image href="${heroSvg}" x="30" y="92" width="780" height="568"/>
  <rect x="0" y="540" width="${W}" height="200" fill="url(#heroFade)"/>

  <!-- THE NAME, in the game's gold serif letters, with lotus ornaments -->
  <g filter="url(#textGlow)">
    <g filter="url(#pBev)">
      <text x="420" y="776" text-anchor="middle" font-family="Liberation Serif" font-weight="700" font-size="98" letter-spacing="5" fill="url(#nameGoldBig)" stroke="#3A1A02" stroke-width="7" paint-order="stroke" stroke-linejoin="round">GARUDA GOLD</text>
    </g>
  </g>
  <g fill="url(#gGold)" filter="url(#pBev)">
    <path d="M160 806 H680 L696 812 L680 818 H160 L144 812 Z"/>
    <path d="M420 798 L432 812 L420 826 L408 812 Z"/>
  </g>

  <!-- THE TOP WIN: one spin pays at most Rs 5,00,000 -->
  <text x="420" y="878" text-anchor="middle" font-family="PF" font-weight="800" font-size="36" letter-spacing="8" fill="#FFE8A8">WIN UP TO</text>
  <g font-family="PF" font-weight="900" font-size="132" text-anchor="middle" letter-spacing="1">
    ${Array.from({ length: 9 }, (_, i) => `<text x="420" y="${1000 + (9 - i) * 1.5}" fill="#2A0E02" stroke="#2A0E02" stroke-width="16" stroke-linejoin="round">₹5,00,000</text>`).join('')}
    ${Array.from({ length: 8 }, (_, i) => `<text x="420" y="${1000 + (8 - i) * 1.5}" fill="url(#amountDeep)">₹5,00,000</text>`).join('')}
    <g filter="url(#pBev)"><text x="420" y="1000" fill="url(#amountGold)">₹5,00,000</text></g>
  </g>

  <!-- what the game has -->
  ${badge(250, 300, 'NUDGE UP TO 500×')}
  ${badge(560, 260, '5 LINES · EX BET')}

  ${coin(84, 690, 34, -18)}
  ${coin(752, 640, 28, 16)}
  ${coin(110, 1120, 26, 12)}
  ${coin(740, 1110, 30, -10)}
  ${spark(130, 150, 26, 0)}
  ${spark(716, 170, 22, 12)}
  ${spark(420, 60, 18, 0)}
  ${spark(200, 560, 16, 10)}
  ${spark(650, 560, 18, 0)}
  ${spark(420, 1100, 14, 0)}

  <text x="420" y="1218" text-anchor="middle" font-family="PF" font-weight="800" font-size="20" letter-spacing="4" fill="#C9A15A" opacity="0.9">NOVA PLAY · 18+ · PLAY RESPONSIBLY</text>

  <!-- a gold frame round it all -->
  <rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="30" fill="none" stroke="url(#frameGold)" stroke-width="6"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="22" fill="none" stroke="#FFD36A" stroke-opacity="0.35" stroke-width="1.5"/>
</svg>`;
  },
};
