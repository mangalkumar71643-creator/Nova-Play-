// The wheel's plate (380 x 380 units, centre 190,190): a dark metal bezel, three recessed tracks (outer 8 segments, middle 6, inner 4) with the
// grooves between the segments, and the well for the sentinel. The lit arcs, the numbers and the badges are drawn live on top of it.
const L = require('./_lib');

const C = 190;
// Tracks: radius in / out. The app draws its live layer with the same numbers.
const TRACKS = [
  { r0: 141, r1: 177, n: 8 },
  { r0: 99, r1: 135, n: 6 },
  { r0: 62, r1: 93, n: 4 },
];

const annulus = (r0, r1) => `M${C - r1} ${C} A${r1} ${r1} 0 1 0 ${C + r1} ${C} A${r1} ${r1} 0 1 0 ${C - r1} ${C} Z M${C - r0} ${C} A${r0} ${r0} 0 1 1 ${C + r0} ${C} A${r0} ${r0} 0 1 1 ${C - r0} ${C} Z`;
const polar = (r, deg) => [C + r * Math.sin((deg * Math.PI) / 180), C - r * Math.cos((deg * Math.PI) / 180)];

module.exports = {
  width: 380,
  height: 380,
  scale: 2.5,
  out: 'assets/ringgauntlet/plate.webp',
  quality: 90,
  svg: () => {
    let tracks = '';
    let grooves = '';
    for (const t of TRACKS) {
      tracks += `
      <path d="${annulus(t.r0 - 1.6, t.r1 + 1.6)}" fill="#3a3c47" fill-rule="evenodd" transform="translate(0 1.2)"/>
      <path d="${annulus(t.r0, t.r1)}" fill="url(#track)" fill-rule="evenodd"/>
      <path d="${annulus(t.r0, t.r1)}" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="2" fill-rule="evenodd" filter="url(#inner)"/>`;
      for (let i = 0; i < t.n; i++) {
        const a = (360 / t.n) * i;
        const [x0, y0] = polar(t.r0, a);
        const [x1, y1] = polar(t.r1, a);
        grooves += `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} L${x1.toFixed(2)} ${y1.toFixed(2)}" stroke="#08080b" stroke-width="2.6" stroke-linecap="butt"/><path d="M${x0.toFixed(2)} ${(y0 + 1).toFixed(2)} L${x1.toFixed(2)} ${(y1 + 1).toFixed(2)}" stroke="#3b3d49" stroke-width="0.9" opacity="0.8"/>`;
      }
    }
    // the little studs on the bezel
    let studs = '';
    for (let i = 0; i < 24; i++) {
      const [x, y] = polar(185.6, i * 15);
      studs += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.5" fill="#0a0a0d"/><circle cx="${x.toFixed(2)}" cy="${(y - 0.5).toFixed(2)}" r="0.9" fill="#5b5e6c"/>`;
    }
    return L.svg(380, 380, `
    <circle cx="${C}" cy="${C + 5}" r="186" fill="#000" opacity="0.55" filter="url(#shadow)"/>
    <circle cx="${C}" cy="${C}" r="189" fill="url(#bezel)"/>
    <circle cx="${C}" cy="${C}" r="189" fill="none" stroke="url(#bezelEdge)" stroke-width="1.6"/>
    <circle cx="${C}" cy="${C}" r="181.5" fill="#06060a"/>
    <circle cx="${C}" cy="${C}" r="180" fill="url(#base)"/>
    ${studs}
    <g>${tracks}</g>
    <g>${grooves}</g>
    <circle cx="${C}" cy="${C}" r="58" fill="#05060a"/>
    <circle cx="${C}" cy="${C}" r="57" fill="none" stroke="url(#well)" stroke-width="3.2"/>
    <circle cx="${C}" cy="${C}" r="54" fill="url(#hole)"/>
    <path d="M${C - 140} ${C - 62} A150 150 0 0 1 ${C - 40} ${C - 150}" fill="none" stroke="#fff" stroke-opacity="0.07" stroke-width="3" stroke-linecap="round"/>
    `, `
    ${L.gradient('bezel', [[0, '#5a5d6b'], [0.25, '#2a2c35'], [0.6, '#14151b'], [1, '#3b3d49']], { x1: 0.1, y1: 0, x2: 0.9, y2: 1 })}
    ${L.gradient('bezelEdge', [[0, '#9ea2b3'], [0.5, '#2b2d36'], [1, '#6d7080']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
    ${L.radial('base', [[0, '#25262d'], [0.6, '#17181d'], [1, '#0d0d11']], { cx: 0.5, cy: 0.42, r: 0.72 })}
    ${L.gradient('track', [[0, '#1b1c22'], [0.5, '#202128'], [1, '#14151a']], { x1: 0.2, y1: 0, x2: 0.8, y2: 1 })}
    ${L.gradient('well', [[0, '#7c8091'], [0.5, '#262831'], [1, '#6a6d7d']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
    ${L.radial('hole', [[0, '#17181e'], [1, '#0a0a0e']], { cx: 0.5, cy: 0.4, r: 0.7 })}
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="inner" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.2"/></filter>
    `);
  },
};
