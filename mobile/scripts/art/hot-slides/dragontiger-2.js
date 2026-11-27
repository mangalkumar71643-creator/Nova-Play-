// Dragon Tiger, slide 2: THE CARDS. One card each, the bigger card wins: the Dragon's card (a king, blue, the dragon on its face) and
// the Tiger's (a queen, red, the tiger on its face) leaning into each other with a lightning strike between them, the name in big
// letters above, and the real pace of the table under them (a new round every 20 seconds).
const { asset, svg, glow, spark, pill } = require('./_lib');

/** A card leaning by `rot` degrees: gold rim, coloured face with the beast on it, the rank and suit in two corners. */
function card(cx, cy, rot, { face, beast, rank, suit, ink, clip }) {
  const w = 214;
  const h = 300;
  const x = -w / 2;
  const y = -h / 2;
  return `<g transform="translate(${cx} ${cy}) rotate(${rot})" filter="url(#sShadow)">
    <g filter="url(#gBev)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="url(#gGoldD)"/></g>
    <rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="14" fill="url(#${face})"/>
    <g clip-path="url(#${clip})"><image href="${beast}" x="${x - 30}" y="${y + 40}" width="${w + 60}" height="${(w + 60) * 0.88}"/></g>
    <rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="14" fill="none" stroke="#FFE7A0" stroke-opacity="0.55" stroke-width="2"/>
    <g font-family="SF" font-weight="900" text-anchor="middle" fill="${ink}" stroke="#2A0804" stroke-width="4" paint-order="stroke">
      <text x="${x + 38}" y="${y + 62}" font-size="46">${rank}</text><text x="${x + 38}" y="${y + 98}" font-size="34">${suit}</text>
      <g transform="rotate(180)"><text x="${x + 38}" y="${y + 62}" font-size="46">${rank}</text><text x="${x + 38}" y="${y + 98}" font-size="34">${suit}</text></g>
    </g>
  </g>`;
}

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/dragon-tiger-slide-2.webp',
  lossless: true,
  svg: () =>
    svg(
      `
  <circle cx="300" cy="330" r="230" fill="url(#gBlue)"/>
  <circle cx="600" cy="330" r="230" fill="url(#gRed)"/>
  <circle cx="450" cy="320" r="140" fill="url(#gGoldL)"/>

  <!-- the name -->
  <g filter="url(#sShadow)">
    <text x="450" y="118" text-anchor="middle" font-family="SF" font-weight="900" font-size="88" letter-spacing="2" fill="#7A240C" stroke="#7A240C" stroke-width="13" stroke-linejoin="round"><tspan>DRAGON</tspan><tspan font-size="54" dy="-6"> VS </tspan><tspan dy="6">TIGER</tspan></text>
    <g filter="url(#gBev)"><text x="450" y="118" text-anchor="middle" font-family="SF" font-weight="900" font-size="88" letter-spacing="2" stroke="#4A0E06" stroke-width="8" paint-order="stroke" stroke-linejoin="round"><tspan fill="url(#blueGold)">DRAGON</tspan><tspan fill="url(#nameGold)" font-size="54" dy="-6"> VS </tspan><tspan fill="url(#redGold)" dy="6">TIGER</tspan></text></g>
  </g>

  <!-- one card each: the king of the Dragon, the queen of the Tiger -->
  ${card(330, 330, -13, { face: 'faceBlue', beast: asset('assets/dragon-tiger/dragon-head.webp'), rank: 'K', suit: '♠', ink: '#E6F2FF', clip: 'cardClipL' })}
  ${card(570, 330, 13, { face: 'faceRed', beast: asset('assets/dragon-tiger/tiger-head.webp'), rank: 'Q', suit: '♥', ink: '#FFE9B0', clip: 'cardClipR' })}

  <!-- the strike between them -->
  <g filter="url(#sGlow)"><path d="M462 186 L428 300 L462 300 L432 440 L500 280 L466 280 L496 186 Z" fill="url(#bolt)" stroke="#7A3A00" stroke-width="3" stroke-linejoin="round"/></g>
  ${spark(404, 210, 12, 15)}${spark(512, 430, 10, -10)}${spark(470, 160, 8)}

  ${pill(450, 560, 470, 80, 'plateRed', 'A ROUND EVERY <tspan fill="url(#amountGold)" font-size="40">20s</tspan>', { size: 30 })}
`,
      `${glow('gBlue', 300, 330, 230, '#2F8BFF', 0.7)}${glow('gRed', 600, 330, 230, '#FF4A1A', 0.7)}${glow('gGoldL', 450, 320, 140, '#FFD860', 0.55)}
  <linearGradient id="blueGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E6F2FF"/><stop offset="0.35" stop-color="#8FC4FF"/><stop offset="0.7" stop-color="#2F7BFF"/><stop offset="1" stop-color="#1A4FC8"/></linearGradient>
  <linearGradient id="redGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF0C8"/><stop offset="0.35" stop-color="#FFB24A"/><stop offset="0.7" stop-color="#FF4A1A"/><stop offset="1" stop-color="#C8200C"/></linearGradient>
  <linearGradient id="faceBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D4FB8"/><stop offset="1" stop-color="#081E5A"/></linearGradient>
  <linearGradient id="faceRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B8202A"/><stop offset="1" stop-color="#4E0610"/></linearGradient>
  <linearGradient id="bolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBE0"/><stop offset="0.5" stop-color="#FFD84A"/><stop offset="1" stop-color="#F09A10"/></linearGradient>
  <clipPath id="cardClipL"><rect x="-99" y="-142" width="198" height="284" rx="14"/></clipPath>
  <clipPath id="cardClipR"><rect x="-99" y="-142" width="198" height="284" rx="14"/></clipPath>`
    ),
};
