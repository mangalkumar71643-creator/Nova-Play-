// Mines, slide 2: THE GEM. The game's cut diamond, huge, in a burst of ice-blue light, its sapphire tiles flying around it and two
// of its bombs (each in its own red glow); the name on a carved plaque and the rule that matters: you can cash out after any gem
// (the server asks for at least one revealed tile: "Reveal at least one tile before cashing out.").
const { minesPieces, svg, glow, spark, pill } = require('./_lib');
// (the game's gem piece is a top view; the hero here is drawn as a side-view brilliant so it reads as a diamond at this size)
const PIECES = minesPieces();

const GX = 450; // the diamond's centre
const GY = 214;

/** A brilliant-cut diamond seen from the side (table, crown, girdle, pavilion), ice blue facets lit from the top left. */
function diamond(cx, top, W, H) {
  const X = (u) => (cx + u * W).toFixed(1);
  const Y = (v) => (top + v * H).toFixed(1);
  const P = (u, v) => `${X(u)} ${Y(v)}`;
  const tri = (a, b, c, fill, op = 1) => `<path d="M${P(...a)} L${P(...b)} L${P(...c)} Z" fill="${fill}" opacity="${op}"/>`;
  const quad = (a, b, c, d, fill, op = 1) => `<path d="M${P(...a)} L${P(...b)} L${P(...c)} L${P(...d)} Z" fill="${fill}" opacity="${op}"/>`;
  const G = 0.3; // the girdle's height (share of H)
  const T = [[-0.3, 0], [-0.1, 0], [0.1, 0], [0.3, 0]];
  const Gd = [[-0.5, G], [-0.25, G], [0, G], [0.25, G], [0.5, G]];
  const C = [0, 1];
  const M = [[-0.31, 0.6], [-0.1, 0.62], [0.1, 0.62], [0.31, 0.6]]; // where the pavilion's half facets meet
  let f = '';
  // the table
  f += quad(T[0], T[3], [0.22, 0.12], [-0.22, 0.12], 'url(#dTable)');
  // the crown
  f += tri(T[0], Gd[0], Gd[1], '#E8FBFF');
  f += tri(T[0], T[1], Gd[1], '#B8F0FF');
  f += quad(T[0], [-0.22, 0.12], [0.0, 0.12], Gd[1], '#9BE6FF', 0.55);
  f += tri(T[1], Gd[1], Gd[2], '#7FDBFF');
  f += tri(T[1], T[2], Gd[2], '#C8F4FF');
  f += tri(T[2], Gd[2], Gd[3], '#4CC4F0');
  f += tri(T[2], T[3], Gd[3], '#8FE0FF');
  f += tri(T[3], Gd[3], Gd[4], '#2FA8E0');
  // the pavilion
  f += tri(Gd[0], Gd[1], M[0], '#9BE6FF');
  f += tri(Gd[1], M[0], C, '#5CCBF4');
  f += tri(Gd[0], M[0], C, '#C8F4FF');
  f += tri(Gd[1], Gd[2], M[1], '#3FB6EA');
  f += tri(Gd[1], M[1], C, '#7FDBFF');
  f += tri(Gd[2], M[1], C, '#1C8FCB');
  f += tri(Gd[2], Gd[3], M[2], '#2FA8E0');
  f += tri(Gd[2], M[2], C, '#4CC4F0');
  f += tri(Gd[3], M[2], C, '#126FA8');
  f += tri(Gd[3], Gd[4], M[3], '#1C8FCB');
  f += tri(Gd[3], M[3], C, '#0E5E96');
  f += tri(Gd[4], M[3], C, '#0A4E80');
  const outline = `M${P(...T[0])} L${P(...T[3])} L${P(...Gd[4])} L${P(...C)} L${P(...Gd[0])} Z`;
  const lines = [
    [T[0], Gd[1]], [T[1], Gd[1]], [T[1], Gd[2]], [T[2], Gd[2]], [T[2], Gd[3]], [T[3], Gd[3]], [Gd[0], Gd[4]],
    [Gd[1], C], [Gd[2], C], [Gd[3], C], [Gd[0], M[0]], [Gd[1], M[0]], [Gd[1], M[1]], [Gd[2], M[1]], [Gd[2], M[2]], [Gd[3], M[2]], [Gd[3], M[3]], [Gd[4], M[3]],
  ].map(([a, b]) => `M${P(...a)} L${P(...b)}`).join(' ');
  return `<g filter="url(#sShadow)"><path d="${outline}" fill="#0A3A66" stroke="#0A3A66" stroke-width="10" stroke-linejoin="round"/></g>
    ${f}
    <path d="${lines}" fill="none" stroke="#E8FBFF" stroke-opacity="0.55" stroke-width="1.6"/>
    <path d="${outline}" fill="none" stroke="#DFF8FF" stroke-width="3" stroke-linejoin="round"/>
    <path d="M${P(-0.27, 0.035)} L${P(-0.12, 0.035)} L${P(-0.33, 0.25)} Z" fill="#fff" opacity="0.85"/>
    <path d="M${P(-0.4, 0.36)} L${P(-0.3, 0.36)} L${P(-0.06, 0.82)} Z" fill="#fff" opacity="0.45"/>`;
}

function rays() {
  let d = '';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2 + 0.06;
    const w = i % 2 ? 0.035 : 0.055;
    const p = (ang, r) => `${(GX + Math.cos(ang) * r).toFixed(1)} ${(GY + Math.sin(ang) * r).toFixed(1)}`;
    d += `M${p(a - w, 120)} L${p(a, 300)} L${p(a + w, 120)} Z `;
  }
  return `<path d="${d}" fill="url(#rayFade)"/>`;
}

/** A bomb of the game in its own red glow (the glow keeps its dark edge inside the picture). */
const bomb = (cx, cy, rot, size) => {
  const w = size;
  const h = size * 0.74;
  return `<circle cx="${cx}" cy="${cy}" r="${size * 0.46}" fill="url(#bombGlow)"/>
  <image href="${PIECES.bomb}" x="${cx - w * 0.47}" y="${cy - h * 0.57}" width="${w}" height="${h}" transform="rotate(${rot} ${cx} ${cy})"/>`;
};

/** A closed tile of the game, flying. */
const tile = (cx, cy, w, rot) => `<image href="${PIECES.tile}" x="${cx - w / 2}" y="${cy - w * 0.37}" width="${w}" height="${w * 0.74}" transform="rotate(${rot} ${cx} ${cy})"/>`;

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/mines-slide-2.webp',
  lossless: true,
  svg: () =>
    svg(
      `
  <ellipse cx="${GX}" cy="${GY + 30}" rx="300" ry="226" fill="url(#gIce)"/>
  ${rays()}

  <!-- sapphire tiles flying around -->
  <g filter="url(#sShadow)">
    ${tile(150, 132, 128, -16)}${tile(758, 120, 120, 14)}${tile(96, 300, 92, 10)}${tile(812, 292, 96, -10)}
  </g>
  <!-- the bombs -->
  ${bomb(196, 382, -18, 190)}${bomb(712, 378, 16, 180)}

  <!-- the diamond -->
  <ellipse cx="${GX}" cy="${GY}" rx="190" ry="170" fill="url(#gemHalo)"/>
  ${diamond(GX, GY - 128, 330, 282)}
  ${spark(GX - 96, GY - 118, 22, 0, '#FFFFFF')}${spark(GX + 128, GY - 52, 14, 0, '#FFFFFF')}${spark(GX + 30, GY + 88, 11, 0, '#FFFFFF')}
  ${spark(GX - 190, GY - 96, 12, 8)}${spark(GX + 196, GY + 52, 10, -10)}${spark(GX + 70, GY - 170, 9)}

  <!-- the name on a carved plaque -->
  <g filter="url(#sShadow)">
    <g filter="url(#gBev)"><path d="M232 400 H668 L708 452 L668 504 H232 L192 452 Z" fill="url(#gGoldD)"/></g>
    <path d="M240 411 H660 L692 452 L660 493 H240 L208 452 Z" fill="url(#beam)"/>
    <path d="M240 411 H660 L692 452 L660 493 H240 L208 452 Z" fill="none" stroke="#06143A" stroke-width="2"/>
    <g filter="url(#gBev)"><text x="450" y="482" text-anchor="middle" font-family="SF" font-weight="900" font-size="80" letter-spacing="8" fill="url(#nameGold)" stroke="#4A1C04" stroke-width="6" paint-order="stroke" stroke-linejoin="round">MINES</text></g>
  </g>
  ${pill(450, 556, 520, 66, 'plateRed', 'CASH OUT AFTER <tspan fill="url(#amountGold)">ANY GEM</tspan>', { size: 27 })}
`,
      `${glow('gIce', GX, GY + 30, 1, '#46C8FF', 0.55).replace('r="1"', `r="300" gradientTransform="translate(${GX} ${GY + 30}) scale(1 0.75) translate(${-GX} ${-(GY + 30)})"`)}
  <radialGradient id="rayFade" cx="${GX}" cy="${GY}" r="300" gradientUnits="userSpaceOnUse" gradientTransform="translate(${GX} ${GY}) scale(1 0.62) translate(${-GX} ${-GY})"><stop offset="0.36" stop-color="#C8F4FF" stop-opacity="0.8"/><stop offset="1" stop-color="#7FE0FF" stop-opacity="0"/></radialGradient>
  <radialGradient id="gemHalo"><stop offset="0" stop-color="#E8FBFF" stop-opacity="0.9"/><stop offset="0.6" stop-color="#7FE0FF" stop-opacity="0.45"/><stop offset="1" stop-color="#46C8FF" stop-opacity="0"/></radialGradient>
  <linearGradient id="dTable" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.6" stop-color="#D8F7FF"/><stop offset="1" stop-color="#9BE6FF"/></linearGradient>
  <radialGradient id="bombGlow"><stop offset="0.3" stop-color="#FF5A1A" stop-opacity="0.85"/><stop offset="0.62" stop-color="#E8200C" stop-opacity="0.5"/><stop offset="1" stop-color="#C80A0A" stop-opacity="0"/></radialGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D4FB8"/><stop offset="0.55" stop-color="#0E2A72"/><stop offset="1" stop-color="#081C52"/></linearGradient>`
    ),
};
