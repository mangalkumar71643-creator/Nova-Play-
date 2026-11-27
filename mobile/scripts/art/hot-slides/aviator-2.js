// Aviator, slide 2: THE SKY BADGE. A gold-rimmed round window on a night sky (stars, a warm moon, violet clouds) with our jet
// breaking out of it on its contrail; the name on a red ribbon and the game's auto cash-out under it (you can set it from 1.01x:
// GET /aviator/config minAutoCashout, the Auto Cash Out switch of the game).
const { svg, glow, spark, pill } = require('./_lib');
const { jet, jetDefs } = require('./_jet');

const CX = 450;
const CY = 244;
const R = 168; // the sky inside the rim

function stars() {
  let s = '';
  for (let i = 0; i < 34; i++) {
    const a = i * 2.39996;
    const r = Math.sqrt((i + 0.5) / 34) * (R - 14);
    s += `<circle cx="${(CX + Math.cos(a) * r).toFixed(1)}" cy="${(CY + Math.sin(a) * r * 0.9 - 20).toFixed(1)}" r="${(1.2 + (i % 3) * 0.6).toFixed(1)}" fill="#FFF4D0" opacity="${(0.5 + (i % 4) * 0.12).toFixed(2)}"/>`;
  }
  return s;
}

/** The rim's studs, like the edge of a coin. */
function studs() {
  let s = '';
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    s += `<circle cx="${(CX + Math.cos(a) * 184).toFixed(1)}" cy="${(CY + Math.sin(a) * 184).toFixed(1)}" r="4.5" fill="url(#stud)" stroke="#6A3A04" stroke-width="1"/>`;
  }
  return s;
}

// the jet: its tail inside the window, its nose out past the rim
const JX = 604;
const JY = 156;
const TRAIL = `M${CX - 150} ${CY + 112} C ${CX - 60} ${CY + 70}, ${CX - 10} ${CY + 20}, ${JX - 121} ${JY + 70}`;

module.exports = {
  width: 900,
  height: 640,
  scale: 1,
  out: 'assets/promo/aviator-slide-2.webp',
  lossless: true,
  svg: () =>
    svg(
      `
  <circle cx="${CX}" cy="${CY}" r="270" fill="url(#gViolet)"/>

  <!-- the window: gold rim with studs, the night sky inside -->
  <g filter="url(#sShadow)">
    <g filter="url(#gBev)"><circle cx="${CX}" cy="${CY}" r="200" fill="url(#gGoldD)"/></g>
    <circle cx="${CX}" cy="${CY}" r="192" fill="url(#rimBand)"/>
    ${studs()}
    <g filter="url(#gBev)"><circle cx="${CX}" cy="${CY}" r="${R + 8}" fill="url(#gGold)"/></g>
  </g>
  <g clip-path="url(#sky)">
    <rect x="${CX - R}" y="${CY - R}" width="${R * 2}" height="${R * 2}" fill="url(#night)"/>
    ${stars()}
    <circle cx="${CX - 78}" cy="${CY - 70}" r="40" fill="url(#moon)"/>
    <circle cx="${CX - 78}" cy="${CY - 70}" r="90" fill="url(#moonGlow)"/>
    <path d="${TRAIL}" fill="none" stroke="#FFD27A" stroke-width="26" stroke-linecap="round" opacity="0.25" filter="url(#soft8)"/>
    <path d="${TRAIL}" fill="none" stroke="url(#trail)" stroke-width="9" stroke-linecap="round"/>
    <path d="M${CX - R} ${CY + 120} C ${CX - 120} ${CY + 80}, ${CX - 70} ${CY + 112}, ${CX - 30} ${CY + 104} C ${CX + 10} ${CY + 70}, ${CX + 90} ${CY + 80}, ${CX + 110} ${CY + 106} C ${CX + 140} ${CY + 92}, ${CX + R} ${CY + 100}, ${CX + R} ${CY + 120} L${CX + R} ${CY + R} L${CX - R} ${CY + R} Z" fill="url(#cloud)"/>
    <path d="M${CX - R} ${CY + 150} C ${CX - 90} ${CY + 118}, ${CX - 20} ${CY + 140}, ${CX + 30} ${CY + 134} C ${CX + 80} ${CY + 112}, ${CX + 140} ${CY + 128}, ${CX + R} ${CY + 140} L${CX + R} ${CY + R} L${CX - R} ${CY + R} Z" fill="url(#cloud2)"/>
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="url(#skyShade)"/>
  </g>
  <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="#5A3204" stroke-width="3"/>

  <!-- the jet breaking out -->
  <circle cx="${JX + 40}" cy="${JY - 20}" r="120" fill="url(#gJet)"/>
  <g filter="url(#sShadow)">${jet(JX, JY, -30, 1.15)}</g>
  ${spark(JX + 150, JY - 96, 15, 10)}${spark(JX + 186, JY + 30, 9)}${spark(CX - 196, CY - 110, 11, -8)}${spark(CX - 120, CY - 20, 8, 0, '#FFF4D0')}

  <!-- the name on a ribbon -->
  <g filter="url(#sShadow)">
    <path d="M168 440 L110 440 L142 478 L110 516 L196 516 Z" fill="url(#ribbonBack)"/>
    <path d="M732 440 L790 440 L758 478 L790 516 L704 516 Z" fill="url(#ribbonBack)"/>
    <g filter="url(#gBev)"><path d="M168 420 Q450 398 732 420 L732 498 Q450 476 168 498 Z" fill="url(#gGoldD)"/></g>
    <path d="M178 428 Q450 407 722 428 L722 490 Q450 469 178 490 Z" fill="url(#plateRed)"/>
    <path id="ribbonLine" d="M186 475 Q450 454 714 475" fill="none"/>
    <g filter="url(#gBev)"><text font-family="SF" font-weight="900" font-size="58" letter-spacing="6" text-anchor="middle" fill="url(#nameGold)" stroke="#4A1C04" stroke-width="6" paint-order="stroke" stroke-linejoin="round"><textPath href="#ribbonLine" startOffset="50%">AVIATOR</textPath></text></g>
  </g>

  ${pill(450, 572, 540, 66, 'plateBlue', 'AUTO CASH-OUT FROM <tspan fill="url(#amountGold)" font-size="36">1.01x</tspan>', { size: 26, stroke: '#061440' })}
`,
      `${jetDefs()}${glow('gViolet', CX, CY, 270, '#7A3AD8', 0.55)}${glow('gJet', JX + 40, JY - 20, 120, '#FFD860', 0.5)}
  <radialGradient id="rimBand" cx="${CX}" cy="${CY - 40}" r="240" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8A2A10"/><stop offset="1" stop-color="#3E0A06"/></radialGradient>
  <radialGradient id="stud" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#FFF6C8"/><stop offset="0.5" stop-color="#F2B630"/><stop offset="1" stop-color="#9A5A06"/></radialGradient>
  <linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140A3A"/><stop offset="0.55" stop-color="#3A1678"/><stop offset="1" stop-color="#7A2A9A"/></linearGradient>
  <radialGradient id="moon" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#FFFBE0"/><stop offset="0.6" stop-color="#FFE7A0"/><stop offset="1" stop-color="#F2B84A"/></radialGradient>
  <radialGradient id="moonGlow"><stop offset="0.4" stop-color="#FFE7A0" stop-opacity="0.35"/><stop offset="1" stop-color="#FFE7A0" stop-opacity="0"/></radialGradient>
  <linearGradient id="trail" x1="${CX - 150}" y1="0" x2="${JX - 121}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFD27A" stop-opacity="0"/><stop offset="0.5" stop-color="#FFE7A0" stop-opacity="0.85"/><stop offset="1" stop-color="#FFF6D8"/></linearGradient>
  <linearGradient id="cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C88AE8" stop-opacity="0.75"/><stop offset="1" stop-color="#7A3AB8" stop-opacity="0.9"/></linearGradient>
  <linearGradient id="cloud2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E8A8F0" stop-opacity="0.85"/><stop offset="1" stop-color="#9A4AC8"/></linearGradient>
  <radialGradient id="skyShade" cx="${CX}" cy="${CY}" r="${R}" gradientUnits="userSpaceOnUse"><stop offset="0.72" stop-color="#14062A" stop-opacity="0"/><stop offset="1" stop-color="#14062A" stop-opacity="0.6"/></radialGradient>
  <linearGradient id="ribbonBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8A0E20"/><stop offset="1" stop-color="#4A0610"/></linearGradient>
  <clipPath id="sky"><circle cx="${CX}" cy="${CY}" r="${R}"/></clipPath>`
    ),
};
