// The back of every card at the table: cream edge, deep burgundy field with a fine gold lattice, a gold frame and the NP medallion.
const { suit, GOLD } = require('./_lib');

module.exports = {
  width: 140,
  height: 196,
  scale: 3,
  out: 'assets/teenpatticlub/card-back.webp',
  quality: 94,
  svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="196" viewBox="0 0 140 196">
  <defs>
    ${GOLD}
    <linearGradient id="field" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a1a3a"/><stop offset=".5" stop-color="#52102a"/><stop offset="1" stop-color="#2a0614"/></linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e6dcc8"/></linearGradient>
    <pattern id="lattice" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M0 0H12M0 0V12" stroke="#f0c968" stroke-opacity=".3" stroke-width=".6"/>
    </pattern>
    <pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <circle cx="6" cy="6" r=".9" fill="#f0c968" fill-opacity=".38"/>
    </pattern>
    <radialGradient id="spot" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#ffd9a0" stop-opacity=".30"/><stop offset="1" stop-color="#ffd9a0" stop-opacity="0"/></radialGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <clipPath id="field-clip"><rect x="7" y="7" width="126" height="182" rx="8"/></clipPath>
  </defs>
  <rect x=".5" y=".5" width="139" height="195" rx="13" fill="url(#edge)" stroke="#c9bda3" stroke-width="1"/>
  <rect x="7" y="7" width="126" height="182" rx="8" fill="url(#field)"/>
  <g clip-path="url(#field-clip)">
    <rect x="7" y="7" width="126" height="182" fill="url(#lattice)"/>
    <rect x="7" y="7" width="126" height="182" fill="url(#dots)"/>
    <rect x="7" y="7" width="126" height="182" fill="url(#spot)"/>
  </g>
  <rect x="11" y="11" width="118" height="174" rx="5.5" fill="none" stroke="url(#gold)" stroke-width="1.6"/>
  <rect x="14.5" y="14.5" width="111" height="167" rx="3.5" fill="none" stroke="#f0c968" stroke-opacity=".5" stroke-width=".6"/>
  <!-- corner pips -->
  ${suit('S', 19, 19, 11, '#f0c968')}${suit('H', 110, 19, 11, '#f0c968')}${suit('C', 19, 166, 11, '#f0c968')}${suit('D', 110, 166, 11, '#f0c968')}
  <!-- medallion -->
  <g>
    <circle cx="70" cy="98" r="36" fill="#2a0614" stroke="url(#gold)" stroke-width="2.4"/>
    <circle cx="70" cy="98" r="31" fill="none" stroke="#f0c968" stroke-opacity=".55" stroke-width=".7" stroke-dasharray="1.6 2.6"/>
    <circle cx="70" cy="98" r="27" fill="url(#field)"/>
    <text x="70" y="108.5" text-anchor="middle" font-family="Liberation Serif, DejaVu Serif, serif" font-weight="700" font-size="29" fill="url(#gold)" letter-spacing="-1">NP</text>
    ${suit('D', 66, 75, 8, '#f0c968')}
    ${suit('D', 66, 113, 8, '#f0c968')}
  </g>
  <rect x=".5" y=".5" width="139" height="195" rx="13" fill="url(#shine)"/>
</svg>`,
};
