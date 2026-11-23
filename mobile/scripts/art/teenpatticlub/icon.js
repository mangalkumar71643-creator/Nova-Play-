// The Home-screen tile of Teen Patti Club (same size as the other game icons): a pure sequence fanned over the felt, chips and the name.
const { suit, GOLD } = require('./_lib');

function face(rank, kind, x, y, rot, fill) {
  return `<g transform="translate(${x} ${y}) rotate(${rot})" filter="url(#drop)">
    <rect x="-24" y="-34" width="48" height="68" rx="5" fill="url(#cardface)" stroke="#c9bda3" stroke-width=".8"/>
    <text x="-19" y="-19" font-family="Liberation Serif, DejaVu Serif, serif" font-weight="700" font-size="15" fill="${fill}">${rank}</text>
    ${suit(kind, -20, -15, 8.5, fill)}
    ${suit(kind, -12, -8, 24, fill)}
  </g>`;
}

module.exports = {
  width: 171,
  height: 175,
  scale: 2,
  out: 'assets/icons/teen-patti-club.webp',
  quality: 92,
  svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="171" height="175" viewBox="0 0 171 175">
  <defs>
    ${GOLD}
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f5a40"/><stop offset=".55" stop-color="#083726"/><stop offset="1" stop-color="#04170f"/></linearGradient>
    <radialGradient id="spot" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#3fe0a0" stop-opacity=".42"/><stop offset="1" stop-color="#3fe0a0" stop-opacity="0"/></radialGradient>
    <linearGradient id="cardface" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ece6d6"/></linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".5" stop-color="#d9a441"/><stop offset="1" stop-color="#ffe08a"/></linearGradient>
    <linearGradient id="chipR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6a6a"/><stop offset="1" stop-color="#b3121f"/></linearGradient>
    <linearGradient id="chipB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb2ff"/><stop offset="1" stop-color="#1c4fb0"/></linearGradient>
    <linearGradient id="chipG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset="1" stop-color="#c98a1c"/></linearGradient>
    <filter id="drop" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.4" flood-color="#000" flood-opacity=".75"/></filter>
    <filter id="tglow" x="-10%" y="-30%" width="120%" height="180%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#2a1500" flood-opacity=".95"/><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ffc94a" flood-opacity=".55"/></filter>
    <filter id="feltn" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.9 0.7" numOctaves="2" seed="4"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3 0 0 0 -1.4"/></filter>
    <clipPath id="clip"><rect x="1.5" y="1.5" width="168" height="172" rx="16"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="171" height="175" fill="url(#bg)"/>
    <rect width="171" height="175" filter="url(#feltn)" opacity=".12"/>
    <rect width="171" height="175" fill="url(#spot)"/>
    <ellipse cx="85.5" cy="118" rx="96" ry="40" fill="none" stroke="#f0c968" stroke-opacity=".28" stroke-width="1"/>
  </g>
  <rect x="1.5" y="1.5" width="168" height="172" rx="16" fill="none" stroke="url(#rim)" stroke-width="2.6"/>
  <!-- the three cards: A K Q of spades, a pure sequence -->
  ${face('A', 'S', 58, 64, -16, '#16161c')}
  ${face('K', 'S', 85.5, 57, 0, '#16161c')}
  ${face('Q', 'S', 113, 64, 16, '#16161c')}
  <!-- chips -->
  <g filter="url(#drop)">
    <ellipse cx="38" cy="112" rx="17" ry="6.4" fill="url(#chipB)" stroke="#fff" stroke-width=".8"/>
    <ellipse cx="38" cy="107" rx="17" ry="6.4" fill="url(#chipR)" stroke="#fff" stroke-width=".8"/>
    <ellipse cx="38" cy="102" rx="17" ry="6.4" fill="url(#chipG)" stroke="#fff7d6" stroke-width=".8"/>
    <ellipse cx="38" cy="102" rx="9" ry="3.2" fill="none" stroke="#7a4a05" stroke-opacity=".7" stroke-width=".8"/>
    <ellipse cx="136" cy="114" rx="15" ry="5.6" fill="url(#chipR)" stroke="#fff" stroke-width=".8"/>
    <ellipse cx="136" cy="109.5" rx="15" ry="5.6" fill="url(#chipB)" stroke="#fff" stroke-width=".8"/>
  </g>
  <text x="85.5" y="140" text-anchor="middle" font-family="Liberation Serif, DejaVu Serif, serif" font-weight="700" font-size="24" letter-spacing="1" fill="url(#gold)" stroke="#3a2200" stroke-width=".9" paint-order="stroke" filter="url(#tglow)">TEEN PATTI</text>
  <text x="85.5" y="157" text-anchor="middle" font-family="Inter" font-weight="900" font-size="14" letter-spacing="6" fill="#fff" stroke="#04170f" stroke-width=".6" paint-order="stroke">CLUB</text>
  <!-- the ribbon -->
  <g filter="url(#drop)"><rect x="40" y="159.5" width="91" height="12.5" rx="6.2" fill="#0a2a1d" stroke="url(#rim)" stroke-width=".9"/></g>
  <text x="85.5" y="168.4" text-anchor="middle" font-family="Inter" font-weight="800" font-size="7.4" letter-spacing=".7" fill="#ffe08a">2-3 PLAYERS · LIVE</text>
  <!-- NEW -->
  <g filter="url(#drop)"><rect x="5" y="5" width="34" height="14" rx="7" fill="#27b45e" stroke="#c8ffd8" stroke-width=".9"/></g>
  <text x="22" y="15.2" text-anchor="middle" font-family="Inter" font-weight="900" font-size="8.4" fill="#fff">NEW</text>
</svg>`,
};
