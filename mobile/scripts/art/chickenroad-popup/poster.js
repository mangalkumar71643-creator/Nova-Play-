// The Chicken Road popup picture (420 x 630 units, drawn at 2x = 840 x 1260), for Admin -> Popups: the app shows it once on app open, in the app and on
// the website. Everything on it is the app's own: the game's real screen (the road and the Cash Out / GO buttons, cut out of the running app: source/),
// the game's chicken, the egg and the two-line CHICKEN ROAD name of the app's header, the app's font (Montserrat) and its colours (the green of GO,
// the yellow of Cash Out, the dark grey of the screen).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const b64 = (file, mime) => `data:${mime};base64,` + fs.readFileSync(file).toString('base64');
const SRC = (f) => path.join(__dirname, 'source', f);
const ASSET = (f) => path.join(ROOT, 'assets', f);

const GREEN = '#3ECF8E';
const YELLOW = '#F5C518';
const INK = '#0A0A0D';

// Where everything sits (units of the 420 x 630 drawing).
const WIN = { x: 20, y: 204, w: 380, h: 318 }; // the game window
// The Cash Out / GO buttons: the crop of the real screen (774 x 104 px) drawn at 380 wide; the yellow button is its first 376 px, the green one its last 374.
const ROW = { x: 20, y: 552, w: 380, h: (380 * 104) / 774 };
const K = ROW.w / 774;
const YELLOW_BTN = { x: ROW.x, w: 376 * K };
const GREEN_BTN = { x: ROW.x + 400 * K, w: 374 * K };

/** A gold coin with a rupee sign. */
const coin = (cx, cy, r, rot = 0) => `
  <g transform="translate(${cx} ${cy}) rotate(${rot})" filter="url(#coinShadow)">
    <circle r="${r}" fill="url(#coinGold)"/>
    <circle r="${r * 0.8}" fill="none" stroke="#B8860B" stroke-width="${r * 0.1}" opacity="0.7"/>
    <circle r="${r}" fill="none" stroke="#FFE680" stroke-width="${r * 0.07}" opacity="0.8"/>
    <text y="${r * 0.37}" text-anchor="middle" font-family="PosterFont" font-weight="900" font-size="${r * 1.1}" fill="#8A5A00">₹</text>
  </g>`;

module.exports = {
  width: 420,
  height: 630,
  scale: 2,
  out: 'assets/promo/chicken-road-popup.webp',
  lossless: true,
  svg: () => {
    const font900 = b64(ASSET('fonts/Montserrat_900Black.ttf'), 'font/ttf');
    const font800 = b64(ASSET('fonts/Montserrat_800ExtraBold.ttf'), 'font/ttf');
    const road = b64(SRC('game-road.webp'), 'image/webp');
    const buttons = b64(SRC('game-buttons.webp'), 'image/webp');
    const chicken = b64(SRC('chicken.webp'), 'image/webp');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="630" viewBox="0 0 420 630">
  <defs>
    <style>
      @font-face { font-family: 'PosterFont'; font-weight: 900; src: url(${font900}) format('truetype'); }
      @font-face { font-family: 'PosterFont'; font-weight: 800; src: url(${font800}) format('truetype'); }
    </style>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d0e10"/><stop offset="0.55" stop-color="#17181b"/><stop offset="1" stop-color="#101113"/></linearGradient>
    <radialGradient id="greenGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${GREEN}" stop-opacity="0.34"/><stop offset="1" stop-color="${GREEN}" stop-opacity="0"/></radialGradient>
    <radialGradient id="yellowGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${YELLOW}" stop-opacity="0.26"/><stop offset="1" stop-color="${YELLOW}" stop-opacity="0"/></radialGradient>
    <linearGradient id="headline" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${YELLOW}"/><stop offset="0.55" stop-color="#C9E86A"/><stop offset="1" stop-color="${GREEN}"/></linearGradient>
    <linearGradient id="frame" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GREEN}"/><stop offset="0.5" stop-color="${GREEN}" stop-opacity="0.15"/><stop offset="1" stop-color="${YELLOW}"/></linearGradient>
    <linearGradient id="egg" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#FFC27A"/><stop offset="0.55" stop-color="#F29A4B"/><stop offset="1" stop-color="#D9742A"/></linearGradient>
    <radialGradient id="coinGold" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#FFF2A8"/><stop offset="0.5" stop-color="${YELLOW}"/><stop offset="1" stop-color="#C98A00"/></radialGradient>
    <linearGradient id="badge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFDD55"/><stop offset="1" stop-color="${YELLOW}"/></linearGradient>
    <filter id="glowEdge" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.6"/></filter>
    <filter id="coinShadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#000" flood-opacity="0.55"/></filter>
    <clipPath id="windowClip"><rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" rx="16"/></clipPath>
    <clipPath id="yellowClip"><rect x="${YELLOW_BTN.x}" y="${ROW.y}" width="${YELLOW_BTN.w}" height="${ROW.h}" rx="13"/></clipPath>
    <clipPath id="greenClip"><rect x="${GREEN_BTN.x}" y="${ROW.y}" width="${GREEN_BTN.w}" height="${ROW.h}" rx="13"/></clipPath>
  </defs>

  <!-- the screen colour of the app, with the two glows of its buttons -->
  <rect width="420" height="630" fill="url(#bg)"/>
  <circle cx="210" cy="360" r="250" fill="url(#greenGlow)"/>
  <circle cx="390" cy="600" r="170" fill="url(#yellowGlow)"/>

  <!-- the app's name for the game: the egg and the two-line CHICKEN ROAD of its header -->
  <g transform="translate(24 22)" filter="url(#drop)">
    <path d="M22 0 C36 0 46 20 46 38 C46 54 36 64 22 64 C8 64 -2 54 -2 38 C-2 20 8 0 22 0 Z" fill="url(#egg)"/>
    <ellipse cx="14" cy="18" rx="6" ry="10" fill="#fff" opacity="0.4" transform="rotate(18 14 18)"/>
    <circle cx="28" cy="40" r="2.1" fill="#B65A1C" opacity="0.8"/><circle cx="16" cy="48" r="1.8" fill="#B65A1C" opacity="0.8"/><circle cx="31" cy="26" r="1.6" fill="#B65A1C" opacity="0.7"/><circle cx="12" cy="34" r="1.5" fill="#B65A1C" opacity="0.7"/>
  </g>
  <g font-family="PosterFont" font-weight="900" fill="#fff" filter="url(#drop)">
    <text x="82" y="52" font-size="30" letter-spacing="0.4">CHICKEN</text>
    <text x="82" y="84" font-size="30" letter-spacing="0.4">ROAD</text>
  </g>

  <!-- the game's own chicken, jumping out of the top right -->
  <g transform="translate(296 2) rotate(8 60 66)" filter="url(#drop)">
    <image href="${chicken}" x="0" y="0" width="114" height="132"/>
  </g>

  <!-- the headline: the white of the screen, the yellow of Cash Out and the green of GO -->
  <g font-family="PosterFont" font-weight="900" filter="url(#drop)">
    <text x="22" y="146" font-size="31" fill="#fff" letter-spacing="0.2">CROSS THE ROAD.</text>
    <text x="22" y="184" font-size="31" fill="url(#headline)" letter-spacing="0.2">CASH OUT ANYTIME!</text>
  </g>

  <!-- the game window: the running app's road -->
  <rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" rx="16" fill="${GREEN}" opacity="0.55" filter="url(#glowEdge)"/>
  <g clip-path="url(#windowClip)">
    <image href="${road}" x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" preserveAspectRatio="xMinYMid slice"/>
  </g>
  <rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" rx="16" fill="none" stroke="${GREEN}" stroke-width="2.4"/>

  <!-- the biggest multiplier of the game, as a Cash Out coloured chip -->
  <g transform="translate(${WIN.x + 14} ${WIN.y + WIN.h - 20})" filter="url(#drop)">
    <rect x="0" y="0" width="190" height="38" rx="19" fill="url(#badge)"/>
    <rect x="1.5" y="1.5" width="187" height="35" rx="17.5" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1.2"/>
    <text x="95" y="26.5" text-anchor="middle" font-family="PosterFont" font-weight="900" font-size="20" fill="${INK}" letter-spacing="0.4">UP TO 1189x</text>
  </g>

  <!-- the app's own Cash Out and GO buttons -->
  <g filter="url(#drop)"><g clip-path="url(#yellowClip)"><image href="${buttons}" x="${ROW.x}" y="${ROW.y}" width="${ROW.w}" height="${ROW.h}"/></g></g>
  <g filter="url(#drop)"><g clip-path="url(#greenClip)"><image href="${buttons}" x="${ROW.x}" y="${ROW.y}" width="${ROW.w}" height="${ROW.h}"/></g></g>

  ${coin(398, 148, 15, 14)}
  ${coin(26, 206, 12, -16)}
  ${coin(404, 520, 14, 10)}
  ${coin(20, 617, 10, -12)}
  ${coin(402, 616, 13, 16)}

  <g font-family="PosterFont" font-weight="800" text-anchor="middle" fill="#8A8A8E" font-size="10" letter-spacing="1.6">
    <text x="210" y="620">NOVA PLAY  ·  18+  ·  PLAY RESPONSIBLY</text>
  </g>

  <!-- a thin frame in the colours of GO and Cash Out, so the picture keeps its edge on the dark screen behind a popup -->
  <rect x="1.5" y="1.5" width="417" height="627" rx="13" fill="none" stroke="url(#frame)" stroke-width="3" opacity="0.7"/>
</svg>`;
  },
};
