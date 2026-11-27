// Dragon Tiger, slide 1: FACE-OFF. The game's dragon (blue light) and tiger (red light) face each other across its VS emblem, over
// the name on a carved plaque; under it the Tie payout of the table (12.74x, from GET /dragon-tiger/config).
const { asset, svg, glow, spark, pill } = require('./_lib');

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/dragon-tiger-slide-1.webp',
  lossless: true,
  svg: () =>
    svg(
      `
  <circle cx="230" cy="232" r="215" fill="url(#gBlue)"/>
  <circle cx="670" cy="232" r="215" fill="url(#gRed)"/>
  <circle cx="450" cy="250" r="150" fill="url(#gGoldL)"/>

  <!-- the dragon (left) and the tiger (right), facing each other -->
  <g filter="url(#sShadow)">
    <image href="${asset('assets/dragon-tiger/dragon-head.webp')}" x="34" y="44" width="380" height="339" mask="url(#fadeL)"/>
    <image href="${asset('assets/dragon-tiger/tiger-head.webp')}" x="486" y="52" width="380" height="324" mask="url(#fadeR)"/>
  </g>
  <!-- the VS emblem between them -->
  <g filter="url(#sShadow)"><image href="${asset('assets/dragon-tiger/vs.webp')}" x="378" y="96" width="144" height="215"/></g>
  ${spark(350, 96, 12, 10)}${spark(560, 120, 9, -15)}${spark(452, 70, 7)}

  <!-- the name on a carved plaque with gold rims -->
  <g filter="url(#sShadow)">
    <g filter="url(#gBev)"><path d="M118 382 H782 L824 444 L782 506 H118 L76 444 Z" fill="url(#gGoldD)"/></g>
    <path d="M126 394 H774 L808 444 L774 494 H126 L92 444 Z" fill="url(#beam)"/>
    <path d="M126 394 H774 L808 444 L774 494 H126 L92 444 Z" fill="none" stroke="#2A0604" stroke-width="2"/>
    <g filter="url(#gBev)">
      <text x="450" y="472" text-anchor="middle" font-family="SF" font-weight="900" font-size="74" letter-spacing="3" fill="url(#nameGold)" stroke="#3A0A02" stroke-width="6" paint-order="stroke" stroke-linejoin="round"><tspan fill="url(#blueGold)">DRAGON</tspan> <tspan fill="url(#nameGold)">TIGER</tspan></text>
    </g>
  </g>
  ${pill(450, 562, 430, 76, 'plateRed', 'TIE PAYS <tspan fill="url(#amountGold)" font-size="40">12.74x</tspan>', { size: 30 })}
`,
      `${glow('gBlue', 230, 232, 215, '#2F8BFF', 0.75)}${glow('gRed', 670, 232, 215, '#FF4A1A', 0.75)}${glow('gGoldL', 450, 250, 150, '#FFD860', 0.6)}
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A1020"/><stop offset="0.55" stop-color="#4A0812"/><stop offset="1" stop-color="#32040C"/></linearGradient>
  <linearGradient id="blueGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6F2FF"/><stop offset="0.35" stop-color="#8FC4FF"/><stop offset="0.7" stop-color="#2F7BFF"/><stop offset="1" stop-color="#1A4FC8"/></linearGradient>
  <radialGradient id="fadeLG" cx="0.5" cy="0.5" r="0.62"><stop offset="0.72" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <mask id="fadeL" maskUnits="userSpaceOnUse" x="34" y="44" width="380" height="339"><rect x="34" y="44" width="380" height="339" fill="url(#fadeLG)"/></mask>
  <mask id="fadeR" maskUnits="userSpaceOnUse" x="486" y="52" width="380" height="324"><rect x="486" y="52" width="380" height="324" fill="url(#fadeLG)"/></mask>`
    ),
};
