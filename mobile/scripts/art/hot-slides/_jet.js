// The jet of the Aviator slides: our own drawing (a white jet with a crimson stripe, gold trim, blue glass and an engine flame),
// not the game's plane art. Drawn pointing right, about 250 units long; jet() places, turns and scales it.
//
// Every part is outlined in deep navy first, so the white body never touches the picture's transparent outside (the admin panel's
// "Remove background" step clears white connected to the outside).

const PARTS = {
  farWing: 'M18 -8 L-26 -66 L-50 -68 L-30 -8 Z',
  farTail: 'M-82 -6 L-104 -32 L-120 -32 L-104 -6 Z',
  body: 'M124 0 C110 -11 72 -17 22 -17 L-96 -12 C-112 -11 -120 -6 -122 0 C-120 6 -112 11 -96 12 L22 17 C72 17 110 11 124 0 Z',
  fin: 'M-60 -12 L-100 -64 L-122 -64 L-106 -12 Z',
  nearWing: 'M28 6 L-34 80 L-64 82 L-34 8 Z',
  nearTail: 'M-84 6 L-110 36 L-128 36 L-108 6 Z',
  engine: 'M14 22 C14 16 2 15 -26 16 C-32 17 -32 29 -26 30 C2 31 14 30 14 24 Z',
};

const defs = () => `
  <linearGradient id="jBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.45" stop-color="#EEF2F8"/><stop offset="0.8" stop-color="#B4BED2"/><stop offset="1" stop-color="#7E8AA6"/></linearGradient>
  <linearGradient id="jWing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4F6FA"/><stop offset="1" stop-color="#9AA6BE"/></linearGradient>
  <linearGradient id="jWingDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8A96B2"/><stop offset="1" stop-color="#5A6684"/></linearGradient>
  <linearGradient id="jRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF3A4E"/><stop offset="1" stop-color="#A80A20"/></linearGradient>
  <linearGradient id="jGlass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FD8FF"/><stop offset="0.5" stop-color="#2A78D8"/><stop offset="1" stop-color="#123A8A"/></linearGradient>
  <linearGradient id="jFlame" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#FFF6C0"/><stop offset="0.3" stop-color="#FFC83A"/><stop offset="0.7" stop-color="#FF6A10" stop-opacity="0.8"/><stop offset="1" stop-color="#FF3A00" stop-opacity="0"/></linearGradient>`;

/** The jet at (x, y), turned by rot degrees (negative = nose up), scaled by s. */
function jet(x, y, rot, s = 1) {
  const all = Object.values(PARTS);
  let windows = '';
  for (let i = 0; i < 9; i++) windows += `<rect x="${-66 + i * 13}" y="-8" width="6.5" height="5" rx="2.2" fill="#1A2A5A"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="M-120 0 L-200 -9 C-212 0 -212 0 -200 9 Z" fill="url(#jFlame)"/>
    <g fill="#14224A" stroke="#14224A" stroke-width="7" stroke-linejoin="round">${all.map((d) => `<path d="${d}"/>`).join('')}</g>
    <path d="${PARTS.farWing}" fill="url(#jWingDark)"/>
    <path d="${PARTS.farTail}" fill="url(#jWingDark)"/>
    <path d="${PARTS.body}" fill="url(#jBody)"/>
    <path d="M106 -2 C82 2 42 3 2 3 L-106 2 L-110 7 L2 9 C42 9 82 8 108 3 Z" fill="url(#jRed)"/>
    <path d="M80 -9 C90 -10 102 -7 110 -3 C100 -2 88 -2 74 -3 Z" fill="url(#jGlass)"/>
    ${windows}
    <path d="${PARTS.fin}" fill="url(#jBody)"/>
    <path d="M-98 -58 L-120 -58 L-122 -64 L-100 -64 Z" fill="url(#gGold)"/>
    <path d="M-72 -26 L-96 -56 L-104 -56 L-82 -26 Z" fill="url(#jRed)"/>
    <path d="${PARTS.nearWing}" fill="url(#jWing)"/>
    <path d="M28 6 L-34 80" stroke="url(#gGold)" stroke-width="4" stroke-linecap="round"/>
    <path d="M-34 80 L-64 82" stroke="url(#jRed)" stroke-width="4" stroke-linecap="round"/>
    <path d="${PARTS.nearTail}" fill="url(#jWing)"/>
    <path d="${PARTS.engine}" fill="url(#jBody)"/>
    <ellipse cx="13" cy="23" rx="3" ry="6.5" fill="#14224A"/>
    <path d="M100 -7 C70 -14 30 -14 -20 -12" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" fill="none" opacity="0.9"/>
  </g>`;
}

module.exports = { jet, jetDefs: defs };
