// Aviator, slide 1: THE CLIMB. The rising curve of a round (a gold line over a golden fill, like the game's graph) with our jet at
// its tip, the name above, a multiplier on the curve as the game shows it (an example, not a promise: there is no fixed top) and
// the one rule of the game under it.
const { svg, glow, spark, pill, bigText } = require('./_lib');
const { jet, jetDefs } = require('./_jet');

// the curve ends at the jet's tail, heading the way the jet points (45 degrees up)
const TAIL = [630, 270];
const CURVE = `M70 530 C 380 530, 545 355, ${TAIL[0]} ${TAIL[1]}`;
const JET = [TAIL[0] + 79.3, TAIL[1] - 79.3];

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/aviator-slide-1.webp',
  lossless: true,
  svg: () =>
    svg(
      `
  <ellipse cx="470" cy="330" rx="420" ry="280" fill="url(#gNight)"/>
  <circle cx="${JET[0]}" cy="${JET[1]}" r="170" fill="url(#gSun)"/>
  ${[...Array(26)].map((_, i) => {
    const x = 120 + ((i * 197) % 680);
    const y = 90 + ((i * 113) % 380);
    return `<circle cx="${x}" cy="${y}" r="${1.4 + (i % 3) * 0.7}" fill="#FFE9B0" opacity="${0.45 + (i % 4) * 0.12}"/>`;
  }).join('')}

  <!-- the curve of the round -->
  <path d="${CURVE} L${TAIL[0]} 540 L70 540 Z" fill="url(#area)" mask="url(#areaFade)"/>
  <path d="${CURVE}" fill="none" stroke="#FF8A1A" stroke-width="18" stroke-linecap="round" opacity="0.4" filter="url(#soft8)"/>
  <path d="${CURVE}" fill="none" stroke="url(#line)" stroke-width="8" stroke-linecap="round"/>

  <!-- the jet at its tip -->
  <g filter="url(#sShadow)">${jet(JET[0], JET[1], -45, 0.92)}</g>
  ${spark(818, 96, 14, 10)}${spark(610, 150, 9)}${spark(846, 236, 8, -10)}

  <!-- the name and an example multiplier -->
  ${bigText('AVIATOR', 64, 140, 96, { anchor: 'start', spacing: 3, sw: 8, stroke: '#4A1C04' })}
  ${bigText('2.40x', 420, 456, 92, { fill: 'multWhite', spacing: 1, sw: 8, stroke: '#4A0E06' })}

  ${pill(450, 572, 620, 64, 'plateRed', 'CASH OUT <tspan fill="url(#amountGold)">BEFORE IT FLIES AWAY</tspan>', { size: 26 })}
`,
      `${jetDefs()}${glow('gNight', 470, 330, 1, '#3A1A8A', 0.75).replace('r="1"', 'r="420" gradientTransform="translate(470 330) scale(1 0.66) translate(-470 -330)"')}${glow('gSun', JET[0], JET[1], 170, '#FFD860', 0.6)}
  <linearGradient id="area" x1="0" y1="270" x2="0" y2="540" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFB020" stop-opacity="0.8"/><stop offset="0.6" stop-color="#FF8A1A" stop-opacity="0.38"/><stop offset="1" stop-color="#FF7A10" stop-opacity="0.04"/></linearGradient>
  <linearGradient id="areaFadeG" x1="70" y1="0" x2="${TAIL[0]}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.25" stop-color="#fff"/><stop offset="0.72" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="areaFade" maskUnits="userSpaceOnUse" x="0" y="0" width="900" height="640"><rect x="0" y="0" width="900" height="640" fill="url(#areaFadeG)"/></mask>
  <linearGradient id="line" x1="70" y1="0" x2="676" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFB020"/><stop offset="1" stop-color="#FFF6C0"/></linearGradient>
  <linearGradient id="multWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.5" stop-color="#FFF2C8"/><stop offset="1" stop-color="#FFD45E"/></linearGradient>`
    ),
};
