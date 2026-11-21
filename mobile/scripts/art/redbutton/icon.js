// The Home-screen tile of Red Button (same size as the other game icons): the panel's LCD, the big red button and the name.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const img = (file) => 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'redbutton', file)).toString('base64');

// A seven-segment digit for the little LCD (x, y = top-left corner).
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function digit(ch, x, y, w, h, t, fill) {
  const lean = 0.16;
  const P = (px, py) => `${(x + px + (h - py) * lean).toFixed(2)},${(y + py).toFixed(2)}`;
  const hs = (yc) => `M${P(t * 0.7, yc)} L${P(t * 1.1, yc - t / 2)} L${P(w - t * 1.1, yc - t / 2)} L${P(w - t * 0.7, yc)} L${P(w - t * 1.1, yc + t / 2)} L${P(t * 1.1, yc + t / 2)}Z`;
  const vs = (xc, ya, yb) => `M${P(xc, ya)} L${P(xc + t / 2, ya + t * 0.6)} L${P(xc + t / 2, yb - t * 0.6)} L${P(xc, yb)} L${P(xc - t / 2, yb - t * 0.6)} L${P(xc - t / 2, ya + t * 0.6)}Z`;
  const shapes = { a: hs(t / 2), g: hs(h / 2), d: hs(h - t / 2), f: vs(t / 2, t, h / 2 - 0.5), b: vs(w - t / 2, t, h / 2 - 0.5), e: vs(t / 2, h / 2 + 0.5, h - t), c: vs(w - t / 2, h / 2 + 0.5, h - t) };
  return [...SEG[ch]].map((s) => `<path d="${shapes[s]}" fill="${fill}"/>`).join('');
}

module.exports = {
  width: 171,
  height: 175,
  scale: 2,
  out: 'assets/icons/red-button.webp',
  quality: 92,
  svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="171" height="175" viewBox="0 0 171 175">
  <defs>
    <linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34343a"/><stop offset=".5" stop-color="#1b1b1e"/><stop offset="1" stop-color="#0e0e10"/></linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7a59"/><stop offset=".5" stop-color="#e3262b"/><stop offset="1" stop-color="#ff9a3c"/></linearGradient>
    <radialGradient id="glowR" cx=".5" cy=".6" r=".55"><stop offset="0" stop-color="#ff3a2a" stop-opacity=".6"/><stop offset="1" stop-color="#ff3a2a" stop-opacity="0"/></radialGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9db08f"/><stop offset=".15" stop-color="#c3e2b2"/><stop offset="1" stop-color="#a9cf96"/></linearGradient>
    <linearGradient id="title" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffd0c8"/></linearGradient>
    <filter id="brush" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.8 0.01" numOctaves="2" seed="5"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.2 0 0 0 -1.55"/>
    </filter>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".8"/></filter>
    <filter id="tglow" x="-10%" y="-30%" width="120%" height="180%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="#5a0000" flood-opacity=".95"/><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#ff3a2a" flood-opacity=".7"/></filter>
    <clipPath id="clip"><rect x="1.5" y="1.5" width="168" height="172" rx="16"/></clipPath>
  </defs>
  <g clip-path="url(#clip)">
    <rect width="171" height="175" fill="url(#card)"/>
    <rect width="171" height="175" filter="url(#brush)" opacity=".16"/>
    <rect width="171" height="175" fill="url(#glowR)"/>
  </g>
  <rect x="1.5" y="1.5" width="168" height="172" rx="16" fill="none" stroke="url(#rim)" stroke-width="2.6"/>
  <!-- the LCD -->
  <g filter="url(#drop)">
    <rect x="34" y="12" width="118" height="34" rx="6" fill="#0b0c0b" stroke="#55565a" stroke-width="1.2"/>
    <rect x="37" y="15" width="112" height="28" rx="4" fill="url(#glass)"/>
    <rect x="37" y="15" width="112" height="3" rx="1.5" fill="#fff" opacity=".3"/>
  </g>
  <text x="44" y="37" font-family="Inter" font-weight="900" font-style="italic" font-size="14" fill="#1b2a1f" opacity=".9">X</text>
  ${digit('2', 62, 20, 16, 19, 2.6, '#1b2a1f')}${digit('5', 84, 20, 16, 19, 2.6, '#1b2a1f')}${digit('0', 106, 20, 16, 19, 2.6, '#1b2a1f')}
  <rect x="127" y="34" width="2.6" height="2.6" fill="#1b2a1f" opacity=".0"/>
  <!-- the big red button -->
  <g filter="url(#drop)">
    <image href="${img('bigbutton.webp')}" x="30" y="46" width="111" height="111"/>
    <image href="${img('dome-up.webp')}" x="42.65" y="59.1" width="87.9" height="87.9"/>
  </g>
  <text x="85.5" y="168" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="21" letter-spacing=".5" fill="url(#title)" stroke="#7a0b0b" stroke-width=".8" paint-order="stroke" filter="url(#tglow)">RED BUTTON</text>
  <!-- NEW -->
  <g filter="url(#drop)"><rect x="5" y="5" width="34" height="14" rx="7" fill="#27b45e" stroke="#c8ffd8" stroke-width=".9"/></g>
  <text x="22" y="15.2" text-anchor="middle" font-family="Inter" font-weight="900" font-size="8.4" fill="#fff">NEW</text>
</svg>`,
};
