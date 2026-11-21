// The big button: a brushed-chrome bezel with the dark gap where the dome sits (the dome is a separate picture, so it can be pressed).
// Drawing units: 500 x 500, bezel centre (250, 250), outer radius 232.
const N = 400;
/** Brushed chrome all the way round: bright at the top left, black at the bottom right, with a second bright edge at the right. */
function chrome(r1, r2, phase) {
  let out = '';
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2;
    const a1 = ((i + 1.15) / N) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    // angle measured from the top, clockwise; the light comes from the top left (around 300 degrees)
    const deg = ((mid * 180) / Math.PI + 360) % 360;
    const toLight = Math.abs(((deg - 305 + 540) % 360) - 180) / 180; // 0 at the light, 1 opposite
    let v = Math.pow(0.5 + 0.5 * Math.cos(toLight * Math.PI), 1.15); // 1 at the light, 0 opposite
    v += 0.18 * Math.pow(Math.max(0, 1 - Math.abs(((deg - 95 + 540) % 360) - 180) / 40), 2); // a second glint at the right
    const grain = 0.022 * Math.sin(i * 12.9898 + phase) * Math.sin(i * 78.233) + 0.015 * Math.sin(i * 3.7 + phase * 2);
    v = Math.min(1, Math.max(0, v * 0.97 + grain + 0.03));
    const g = Math.round(8 + v * 245);
    const col = `rgb(${g},${g},${Math.max(0, g - 3)})`;
    const p = (r, a) => `${(250 + Math.sin(a) * r).toFixed(2)},${(250 - Math.cos(a) * r).toFixed(2)}`;
    out += `<path d="M${p(r1, a0)} L${p(r2, a0)} L${p(r2, a1)} L${p(r1, a1)} Z" fill="${col}" stroke="${col}" stroke-width=".7" stroke-linejoin="round"/>`;
  }
  return out;
}

module.exports = {
  width: 500,
  height: 500,
  scale: 1.5,
  out: 'assets/redbutton/bigbutton.webp',
  quality: 92,
  svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <defs>
    <radialGradient id="pit" cx=".5" cy=".5" r=".5"><stop offset=".78" stop-color="#050505"/><stop offset="1" stop-color="#1a1a1a"/></radialGradient>
    <radialGradient id="ringShade" cx=".5" cy=".5" r=".5"><stop offset=".84" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
    <filter id="drop" x="-12%" y="-12%" width="124%" height="130%"><feDropShadow dx="0" dy="9" stdDeviation="10" flood-color="#000" flood-opacity=".8"/></filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 -1.6 0 0 .95"/>
    </filter>
    <clipPath id="ringClip"><path fill-rule="evenodd" d="M250 18 A232 232 0 1 1 249.99 18 Z M250 52 A198 198 0 1 0 250.01 52 Z"/></clipPath>
  </defs>
  <g filter="url(#drop)">
    <circle cx="250" cy="250" r="232" fill="#111"/>
    ${chrome(198, 232, 0.3)}
  </g>
  <g clip-path="url(#ringClip)"><rect width="500" height="500" filter="url(#grain)" opacity=".16"/></g>
  <circle cx="250" cy="250" r="232" fill="url(#ringShade)"/>
  <circle cx="250" cy="250" r="231.2" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.4"/>
  <circle cx="250" cy="250" r="198" fill="url(#pit)"/>
  <circle cx="250" cy="250" r="197.5" fill="none" stroke="#000" stroke-opacity=".9" stroke-width="3"/>
  <path d="M96 138 A 190 190 0 0 1 250 60" fill="none" stroke="#000" stroke-opacity=".8" stroke-width="10" stroke-linecap="round" filter="blur(3px)"/>
</svg>`,
};
