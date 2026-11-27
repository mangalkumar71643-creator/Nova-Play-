// Aviator, slide 3: THE GAUGE. A gold gauge whose needle climbs a multiplier scale that keeps going (no top mark: the game has no
// fixed top), our jet flying over it, the name on a carved plaque and the two things a player does: watch it climb and cash out
// whenever they like before it flies away.
const { svg, glow, spark, pill } = require('./_lib');
const { jet, jetDefs } = require('./_jet');

const CX = 450;
const CY = 372;
const R = 222; // the face
const A0 = 172; // the gauge's ends (degrees, 0 = right, clockwise): a little more than a half circle
const A1 = 368;

const at = (deg, r) => [CX + Math.cos((deg * Math.PI) / 180) * r, CY + Math.sin((deg * Math.PI) / 180) * r];
const arc = (r, a, b) => {
  const [x0, y0] = at(a, r);
  const [x1, y1] = at(b, r);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
};

function ticks() {
  let s = '';
  for (let a = 180; a <= 362; a += 5.666) {
    const major = Math.abs(((a - 180) / 34) - Math.round((a - 180) / 34)) < 0.01;
    const [x0, y0] = at(a, R - 16);
    const [x1, y1] = at(a, R - (major ? 42 : 30));
    s += `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${major ? '#FFE7A0' : '#C8B0F0'}" stroke-width="${major ? 5 : 2.5}" stroke-linecap="round" opacity="${major ? 1 : 0.7}"/>`;
  }
  return s;
}

// the marks: 1x 2x 5x 10x 20x, then the scale fades on (it never ends)
const MARKS = [
  [180, '1x'],
  [214, '2x'],
  [248, '5x'],
  [282, '10x'],
  [316, '20x'],
  [350, '50x'],
];
const NEEDLE = 232; // about 3.5x
const JET = [730, 110];
const JET_TAIL = [JET[0] - 0.951 * 105, JET[1] + 0.309 * 105]; // its tail (the jet is turned 18 degrees nose up)

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/aviator-slide-3.webp',
  lossless: true,
  svg: () =>
    svg(
      `
  <ellipse cx="${CX}" cy="${CY - 50}" rx="330" ry="250" fill="url(#gViolet)"/>

  <!-- the jet's trail (from behind the gauge) -->
  <circle cx="712" cy="122" r="124" fill="url(#gJet)"/>
  <path d="M470 194 L${JET_TAIL[0]} ${JET_TAIL[1]}" fill="none" stroke="url(#trail)" stroke-width="9" stroke-linecap="round"/>

  <!-- the gauge -->
  <g filter="url(#sShadow)">
    <g filter="url(#gBev)"><path d="${arc(R + 22, A0, A1)} Z" fill="url(#gGoldD)"/></g>
    <path d="${arc(R, A0 + 1, A1 - 1)} Z" fill="url(#face)"/>
  </g>
  <path d="${arc(R - 24, 180, 366)}" fill="none" stroke="url(#band)" stroke-width="20" stroke-linecap="round" opacity="0.95"/>
  ${ticks()}
  ${MARKS.map(([a, t]) => {
    const [x, y] = at(a, R - 72);
    return `<text x="${x.toFixed(1)}" y="${(y + 9).toFixed(1)}" text-anchor="middle" font-family="SF" font-weight="900" font-size="25" fill="#FFF2C8" stroke="#1A0A3A" stroke-width="4" paint-order="stroke">${t}</text>`;
  }).join('')}
  <path d="${arc(R - 24, 340, 368)}" fill="none" stroke="url(#fadeOn)" stroke-width="22"/>

  <!-- the needle -->
  <g filter="url(#sShadowS)">
    <path d="M${at(NEEDLE, R - 50).map((v) => v.toFixed(1)).join(' ')} L${at(NEEDLE + 90, 12).map((v) => v.toFixed(1)).join(' ')} L${at(NEEDLE + 180, 30).map((v) => v.toFixed(1)).join(' ')} L${at(NEEDLE - 90, 12).map((v) => v.toFixed(1)).join(' ')} Z" fill="url(#needle)" stroke="#7A3A00" stroke-width="2" stroke-linejoin="round"/>
    <g filter="url(#gBev)"><circle cx="${CX}" cy="${CY}" r="26" fill="url(#gGold)"/></g>
    <circle cx="${CX}" cy="${CY}" r="12" fill="url(#ruby)"/>
  </g>
  <path d="${arc(R - 24, 180, NEEDLE)}" fill="none" stroke="#FFF2B0" stroke-width="6" stroke-linecap="round" opacity="0.9" filter="url(#sGlow)"/>

  <!-- the jet over it -->
  <g filter="url(#sShadow)">${jet(JET[0], JET[1], -18, 0.86)}</g>
  ${spark(838, 64, 14, 10)}${spark(560, 96, 9)}${spark(206, 170, 11, -8)}${spark(800, 214, 8)}

  <!-- the name on a carved plaque -->
  <g filter="url(#sShadow)">
    <g filter="url(#gBev)"><path d="M214 408 H686 L726 458 L686 508 H214 L174 458 Z" fill="url(#gGoldD)"/></g>
    <path d="M222 418 H678 L710 458 L678 498 H222 L190 458 Z" fill="url(#beam)"/>
    <path d="M222 418 H678 L710 458 L678 498 H222 L190 458 Z" fill="none" stroke="#1A0A3A" stroke-width="2"/>
    <g filter="url(#gBev)"><text x="450" y="486" text-anchor="middle" font-family="SF" font-weight="900" font-size="74" letter-spacing="8" fill="url(#nameGold)" stroke="#4A1C04" stroke-width="6" paint-order="stroke" stroke-linejoin="round">AVIATOR</text></g>
  </g>

  ${pill(450, 568, 640, 64, 'plateRed', 'WATCH IT CLIMB · <tspan fill="url(#amountGold)">CASH OUT ANY TIME</tspan>', { size: 25 })}
`,
      `${jetDefs()}${glow('gViolet', CX, CY - 50, 1, '#7A3AD8', 0.6).replace('r="1"', 'r="330" gradientTransform="translate(450 322) scale(1 0.76) translate(-450 -322)"')}${glow('gJet', 712, 122, 124, '#FFD860', 0.55)}
  <radialGradient id="face" cx="${CX}" cy="${CY}" r="${R}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3A1678"/><stop offset="0.7" stop-color="#1E0C4A"/><stop offset="1" stop-color="#140834"/></radialGradient>
  <linearGradient id="band" x1="${CX - R}" y1="0" x2="${CX + R}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#2ED47A"/><stop offset="0.35" stop-color="#F2D23A"/><stop offset="0.65" stop-color="#FF8A1A"/><stop offset="1" stop-color="#E8203A"/></linearGradient>
  <linearGradient id="fadeOn" x1="${at(340, R)[0]}" y1="${at(340, R)[1]}" x2="${at(366, R)[0]}" y2="${at(366, R)[1]}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1E0C4A" stop-opacity="0"/><stop offset="1" stop-color="#1E0C4A" stop-opacity="0.95"/></linearGradient>
  <linearGradient id="needle" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF6C8"/><stop offset="0.5" stop-color="#FFD24A"/><stop offset="1" stop-color="#E89A10"/></linearGradient>
  <radialGradient id="ruby" cx="0.38" cy="0.32" r="0.8"><stop offset="0" stop-color="#FFB3BF"/><stop offset="0.45" stop-color="#FF2A48"/><stop offset="1" stop-color="#7A0016"/></radialGradient>
  <linearGradient id="trail" x1="470" y1="0" x2="${JET_TAIL[0]}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFE7A0" stop-opacity="0"/><stop offset="1" stop-color="#FFF6D8"/></linearGradient>
  <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A1C9A"/><stop offset="0.55" stop-color="#2A0E66"/><stop offset="1" stop-color="#1A0848"/></linearGradient>`
    ),
};
