// Mines, slide 3: THE CLIMB. Six of the game's open tiles rise like stairs, a diamond on each, and over each one the real payout
// after that many gems with 3 mines (1.02x, 1.16x, 1.34x, 1.55x, 1.81x, 2.13x: GET /mines/config), a gold arrow climbing with
// them; the name top left, the idea bottom right.
const { minesPieces, svg, glow, spark, pill, bigText } = require('./_lib');
const PIECES = minesPieces();

const LADDER = ['1.02x', '1.16x', '1.34x', '1.55x', '1.81x', '2.13x'];
const TW = 112;
const TH = TW * 0.74;
const stepAt = (i) => ({ x: 62 + i * 128, y: 452 - i * 50 });

function stairs() {
  let s = '';
  LADDER.forEach((m, i) => {
    const { x, y } = stepAt(i);
    const cx = x + TW / 2;
    const big = i === LADDER.length - 1;
    const cw = big ? 132 : 112;
    const ch = big ? 50 : 42;
    s += `<g filter="url(#sShadow)">
      <image href="${PIECES['tile-open']}" x="${x}" y="${y}" width="${TW}" height="${TH}"/>
      <image href="${PIECES.gem}" x="${x - 6}" y="${y - 6}" width="${TW + 12}" height="${TH + 12}"/>
    </g>
    <g filter="url(#sShadowS)">
      <g filter="url(#gBev)"><rect x="${cx - cw / 2}" y="${y - ch - 12}" width="${cw}" height="${ch}" rx="${ch / 2}" fill="url(#gGold)"/></g>
      <rect x="${cx - cw / 2 + 5}" y="${y - ch - 7}" width="${cw - 10}" height="${ch - 10}" rx="${(ch - 10) / 2}" fill="url(#${big ? 'plateRed' : 'plateBlue'})"/>
      <text x="${cx}" y="${y - 12 - ch / 2 + (big ? 10 : 8)}" text-anchor="middle" font-family="SF" font-weight="900" font-size="${big ? 28 : 22}" fill="url(#amountGold)" stroke="${big ? '#3A0008' : '#061440'}" stroke-width="4" paint-order="stroke">${m}</text>
    </g>`;
  });
  return s;
}

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/mines-slide-3.webp',
  lossless: true,
  svg: () =>
    svg(
      `
  <ellipse cx="450" cy="330" rx="420" ry="270" fill="url(#gBlue)"/>
  <circle cx="770" cy="196" r="110" fill="url(#gGoldL)"/>

  <!-- the arrow climbing with the stairs -->
  <path d="M96 566 C 360 548, 640 420, 842 236" fill="none" stroke="url(#arrow)" stroke-width="30" stroke-linecap="round"/>
  <path d="M869 212 L855 259 L820 221 Z" fill="#FFD84A" stroke="#C87A08" stroke-width="3" stroke-linejoin="round"/>

  ${stairs()}
  ${spark(830, 92, 14, 10)}${spark(690, 120, 9)}${spark(560, 190, 8, -8)}${spark(470, 236, 7)}

  <!-- the name, top left -->
  ${bigText('MINES', 228, 150, 104, { spacing: 4, sw: 8, stroke: '#4A1C04' })}
  ${pill(228, 212, 236, 48, 'plateBlue', 'WITH 3 MINES', { size: 21, stroke: '#061440' })}

  <!-- the idea, bottom right -->
  ${pill(636, 548, 440, 66, 'plateRed', 'EVERY GEM <tspan fill="url(#amountGold)">PAYS MORE</tspan>', { size: 27 })}
`,
      `${glow('gBlue', 450, 330, 1, '#2F8BFF', 0.5).replace('r="1"', 'r="420" gradientTransform="translate(450 330) scale(1 0.64) translate(-450 -330)"')}${glow('gGoldL', 770, 196, 110, '#FFD860', 0.6)}
  <linearGradient id="arrow" x1="96" y1="566" x2="842" y2="236" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFD84A" stop-opacity="0"/><stop offset="0.35" stop-color="#FFD84A" stop-opacity="0.55"/><stop offset="1" stop-color="#FFE070" stop-opacity="0.95"/></linearGradient>`
    ),
};
