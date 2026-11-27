// Dragon Tiger, slide 3: THE MEDALLION. A gold medallion split down the middle by a lightning crack, the dragon on its sapphire half
// and the tiger on its ruby half, with gold rays behind it; the name on a red ribbon across its foot and the table's rule under it
// (the bigger card wins; Dragon or Tiger pays 2.12x, from GET /dragon-tiger/config).
const { asset, svg, glow, spark, pill } = require('./_lib');

const CX = 450;
const CY = 238;
const R = 168; // the picture inside the rim

/** Gold rays behind the medallion, fading out well inside the picture (an oval fade: long to the sides, short to the top). */
function rays() {
  let d = '';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const w = 0.028;
    const p = (ang, r) => `${(CX + Math.cos(ang) * r).toFixed(1)} ${(CY + Math.sin(ang) * r).toFixed(1)}`;
    d += `M${p(a - w, 150)} L${p(a, 330)} L${p(a + w, 150)} Z `;
  }
  return `<path d="${d}" fill="url(#rayFade)"/>`;
}

/** The studs on the rim, like the edge of a coin. */
function studs() {
  let s = '';
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const x = CX + Math.cos(a) * 187;
    const y = CY + Math.sin(a) * 187;
    s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="url(#stud)" stroke="#6A3A04" stroke-width="1.2"/>`;
  }
  return s;
}

// the crack: a zigzag from the top of the picture to its foot
const CRACK = `M${CX - 6} ${CY - R - 4} L${CX + 14} ${CY - 92} L${CX - 12} ${CY - 40} L${CX + 16} ${CY + 18} L${CX - 14} ${CY + 76} L${CX + 10} ${CY + 128} L${CX - 4} ${CY + R + 4}`;

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/dragon-tiger-slide-3.webp',
  lossless: true,
  svg: () =>
    svg(
      `
  <circle cx="${CX - 170}" cy="${CY + 10}" r="220" fill="url(#gBlue)"/>
  <circle cx="${CX + 170}" cy="${CY + 10}" r="220" fill="url(#gRed)"/>
  ${rays()}

  <!-- the medallion -->
  <g filter="url(#sShadow)">
    <g filter="url(#gBev)"><circle cx="${CX}" cy="${CY}" r="206" fill="url(#gGoldD)"/></g>
    <circle cx="${CX}" cy="${CY}" r="196" fill="url(#rimBand)"/>
    ${studs()}
    <g filter="url(#gBev)"><circle cx="${CX}" cy="${CY}" r="${R + 9}" fill="url(#gGold)"/></g>
  </g>
  <g clip-path="url(#disc)">
    <rect x="${CX - R}" y="${CY - R}" width="${R}" height="${R * 2}" fill="url(#sapphire)"/>
    <rect x="${CX}" y="${CY - R}" width="${R}" height="${R * 2}" fill="url(#ruby)"/>
    <g clip-path="url(#leftHalf)"><image href="${asset('assets/dragon-tiger/dragon-head.webp')}" x="${CX - 262}" y="${CY - 128}" width="290" height="259"/></g>
    <g clip-path="url(#rightHalf)"><image href="${asset('assets/dragon-tiger/tiger-head.webp')}" x="${CX - 28}" y="${CY - 124}" width="290" height="247"/></g>
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#discShade)"/>
  </g>
  <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#5A3204" stroke-width="3"/>
  <!-- the lightning crack between the halves -->
  <path d="${CRACK}" fill="none" stroke="#FF9A1A" stroke-width="16" stroke-linejoin="round" opacity="0.45" filter="url(#soft8)"/>
  <path d="${CRACK}" fill="none" stroke="url(#bolt)" stroke-width="7" stroke-linejoin="round" filter="url(#sGlow)"/>
  ${spark(CX + 16, CY + 18, 14, 10)}${spark(CX - 12, CY - 40, 10, -12)}${spark(CX + 205, CY - 120, 11, 8)}${spark(CX - 212, CY + 96, 9, -6)}

  <!-- the ribbon with the name -->
  <g filter="url(#sShadow)">
    <path d="M150 432 L96 432 L126 470 L96 508 L178 508 Z" fill="url(#ribbonBack)"/>
    <path d="M750 432 L804 432 L774 470 L804 508 L722 508 Z" fill="url(#ribbonBack)"/>
    <g filter="url(#gBev)"><path d="M150 414 Q450 392 750 414 L750 490 Q450 468 150 490 Z" fill="url(#gGoldD)"/></g>
    <path d="M160 422 Q450 401 740 422 L740 482 Q450 461 160 482 Z" fill="url(#plateRed)"/>
    <path id="ribbonLine" d="M170 466 Q450 445 730 466" fill="none"/>
    <g filter="url(#gBev)"><text font-family="SF" font-weight="900" font-size="54" letter-spacing="4" text-anchor="middle" fill="url(#nameGold)" stroke="#3A0A02" stroke-width="6" paint-order="stroke" stroke-linejoin="round"><textPath href="#ribbonLine" startOffset="50%"><tspan fill="url(#blueGold)">DRAGON</tspan> • TIGER</textPath></text></g>
  </g>

  ${pill(450, 566, 600, 74, 'plateBlue', 'BIGGER CARD WINS · <tspan fill="url(#amountGold)" font-size="38">2.12x</tspan>', { size: 28, stroke: '#061440' })}
`,
      `${glow('gBlue', CX - 170, CY + 10, 220, '#2F8BFF', 0.6)}${glow('gRed', CX + 170, CY + 10, 220, '#FF4A1A', 0.6)}
  <radialGradient id="rayFade" cx="${CX}" cy="${CY}" r="330" gradientUnits="userSpaceOnUse" gradientTransform="translate(${CX} ${CY}) scale(1 0.66) translate(${-CX} ${-CY})"><stop offset="0.45" stop-color="#FFD860" stop-opacity="0.75"/><stop offset="1" stop-color="#FFD860" stop-opacity="0"/></radialGradient>
  <radialGradient id="rimBand" cx="${CX}" cy="${CY - 40}" r="240" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8A2A10"/><stop offset="1" stop-color="#3E0A06"/></radialGradient>
  <radialGradient id="stud" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#FFF6C8"/><stop offset="0.5" stop-color="#F2B630"/><stop offset="1" stop-color="#9A5A06"/></radialGradient>
  <linearGradient id="sapphire" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A6BFF"/><stop offset="0.6" stop-color="#0E2F8A"/><stop offset="1" stop-color="#06164A"/></linearGradient>
  <linearGradient id="ruby" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF4A2A"/><stop offset="0.6" stop-color="#9A0E1A"/><stop offset="1" stop-color="#4A040C"/></linearGradient>
  <radialGradient id="discShade" cx="${CX}" cy="${CY}" r="${R}" gradientUnits="userSpaceOnUse"><stop offset="0.7" stop-color="#1A0404" stop-opacity="0"/><stop offset="1" stop-color="#1A0404" stop-opacity="0.55"/></radialGradient>
  <linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBE0"/><stop offset="0.5" stop-color="#FFE070"/><stop offset="1" stop-color="#FFB020"/></linearGradient>
  <linearGradient id="blueGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6F2FF"/><stop offset="0.35" stop-color="#8FC4FF"/><stop offset="0.7" stop-color="#2F7BFF"/><stop offset="1" stop-color="#1A4FC8"/></linearGradient>
  <linearGradient id="ribbonBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8A0E20"/><stop offset="1" stop-color="#4A0610"/></linearGradient>
  <clipPath id="disc"><circle cx="${CX}" cy="${CY}" r="${R}"/></clipPath>
  <clipPath id="leftHalf"><path d="${CRACK} L${CX - R - 10} ${CY + R + 4} L${CX - R - 10} ${CY - R - 4} Z"/></clipPath>
  <clipPath id="rightHalf"><path d="${CRACK} L${CX + R + 10} ${CY + R + 4} L${CX + R + 10} ${CY - R - 4} Z"/></clipPath>`
    ),
};
