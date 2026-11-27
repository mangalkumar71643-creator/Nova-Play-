// Mines, slide 1: THE BOARD. The game's own 5 x 5 board (its sapphire tiles, cut diamonds and bomb, from scripts/art/mines/tiles.js)
// tilted in a gold frame on the right, gems flying out of it; on the left the name and the real climb of the payout with 3 mines
// (1.16x, 1.34x, 1.55x, 1.81x after 2, 3, 4 and 5 gems: GET /mines/config).
const { minesPieces, svg, glow, spark, pill, bigText } = require('./_lib');
const PIECES = minesPieces();

const TW = 64; // a tile (100 x 74 units)
const TH = 47;
const GAP = 6;
const IW = 5 * TW + 4 * GAP;
const IH = 5 * TH + 4 * GAP;
const BX = 488; // the board's inner top-left
const BY = 196;
const CXB = BX + IW / 2;
const CYB = BY + IH / 2;

// under each tile: g = a diamond found, b = the bomb that was hit, anything else still closed
const LAYOUT = ['..g..', '.g...', '...gb', 'g....', '..g..'];

function board() {
  let s = '';
  LAYOUT.forEach((row, r) =>
    [...row].forEach((c, k) => {
      const x = BX + k * (TW + GAP);
      const y = BY + r * (TH + GAP);
      if (c === 'g') s += `<image href="${PIECES['tile-open']}" x="${x}" y="${y}" width="${TW}" height="${TH}"/><image href="${PIECES.gem}" x="${x - 4}" y="${y - 3}" width="${TW + 8}" height="${TH + 6}"/>`;
      else if (c === 'b') s += `<image href="${PIECES.blast}" x="${x}" y="${y}" width="${TW}" height="${TH}"/><image href="${PIECES.bomb}" x="${x - 4}" y="${y - 4}" width="${TW + 8}" height="${TH + 8}"/>`;
      else s += `<image href="${PIECES.tile}" x="${x}" y="${y}" width="${TW}" height="${TH}"/>`;
    })
  );
  return s;
}

/** A step of the payout ladder: a small gem and the multiplier on a blue chip with a gold rim. */
const step = (x, y, text) => `<g filter="url(#sShadowS)">
    <g filter="url(#gBev)"><rect x="${x}" y="${y}" width="124" height="48" rx="24" fill="url(#gGold)"/></g>
    <rect x="${x + 5}" y="${y + 5}" width="114" height="38" rx="19" fill="url(#plateBlue)"/>
    <image href="${PIECES.gem}" x="${x + 1}" y="${y + 3}" width="56" height="42"/>
    <text x="${x + 83}" y="${y + 32}" text-anchor="middle" font-family="SF" font-weight="900" font-size="23" fill="url(#amountGold)" stroke="#061440" stroke-width="4" paint-order="stroke">${text}</text>
  </g>`;

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/mines-slide-1.webp',
  lossless: true,
  svg: () =>
    svg(
      `
  <circle cx="${CXB}" cy="${CYB}" r="236" fill="url(#gBlue)"/>
  <circle cx="236" cy="200" r="190" fill="url(#gGoldL)"/>

  <!-- the board, tilted, in its gold frame -->
  <g transform="rotate(-7 ${CXB} ${CYB})">
    <g filter="url(#sShadow)">
      <g filter="url(#gBev)"><rect x="${BX - 22}" y="${BY - 22}" width="${IW + 44}" height="${IH + 44}" rx="26" fill="url(#gGoldD)"/></g>
      <rect x="${BX - 12}" y="${BY - 12}" width="${IW + 24}" height="${IH + 24}" rx="18" fill="url(#field)"/>
      <rect x="${BX - 12}" y="${BY - 12}" width="${IW + 24}" height="${IH + 24}" rx="18" fill="none" stroke="#5c8cd8" stroke-opacity="0.35" stroke-width="1.5"/>
    </g>
    ${board()}
  </g>

  <!-- gems flying out of the board -->
  <g filter="url(#sShadow)">
    <image href="${PIECES.gem}" x="742" y="92" width="112" height="83" transform="rotate(12 798 133)"/>
    <image href="${PIECES.gem}" x="436" y="456" width="88" height="65" transform="rotate(-14 480 488)"/>
  </g>
  ${spark(736, 102, 13, 10)}${spark(852, 214, 9)}${spark(470, 176, 9, -8)}${spark(560, 540, 8)}

  <!-- the name and the climb of the payout -->
  ${bigText('MINES', 236, 200, 104, { spacing: 4, sw: 8, stroke: '#4A1C04' })}
  ${pill(236, 268, 310, 58, 'plateRed', 'FIND THE GEMS', { size: 25 })}
  ${step(40, 486, '1.16x')}${step(136, 432, '1.34x')}${step(232, 378, '1.55x')}${step(328, 324, '1.81x')}
  ${pill(150, 584, 224, 48, 'plateBlue', 'WITH 3 MINES', { size: 21, stroke: '#061440' })}
`,
      `${glow('gBlue', CXB, CYB, 236, '#2F8BFF', 0.65)}${glow('gGoldL', 236, 200, 190, '#FFD860', 0.5)}
  <linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E2A72"/><stop offset="1" stop-color="#071A4A"/></linearGradient>`
    ),
};
