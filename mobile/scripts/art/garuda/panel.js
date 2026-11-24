// The control deck of Garuda Gold (412 x 148 units; the screen puts its top at y = 582): carved bronze-and-stone with gold
// rims, the WIN plate at the top and the Balance plate at the bottom; the buttons are drawn over it (buttons.js).
const L = require('./_lib');

module.exports = {
  width: 412,
  height: 148,
  scale: 2.5,
  out: 'assets/garuda/panel.webp',
  quality: 88,
  svg: () =>
    L.svg(
      412,
      148,
      `
  <rect width="412" height="148" fill="url(#deck)"/>
  <rect width="412" height="148" fill="#000" filter="url(#grain)" opacity="0.6"/>
  <!-- the steps at the top, as the temple's stairs come down to the deck -->
  <rect x="0" y="0" width="412" height="6" fill="url(#step)"/>
  <path d="M0 6.5 H412" stroke="#1a0a02" stroke-width="1"/>
  <!-- the WIN plate -->
  <rect x="96" y="10" width="220" height="28" rx="14" fill="url(#plate)"/>
  <rect x="96" y="10" width="220" height="28" rx="14" fill="none" stroke="url(#gGoldD)" stroke-width="2" filter="url(#gBev)"/>
  <!-- the Balance plate -->
  <rect x="106" y="116" width="200" height="26" rx="13" fill="url(#plate)"/>
  <rect x="106" y="116" width="200" height="26" rx="13" fill="none" stroke="url(#gGoldD)" stroke-width="1.6" filter="url(#gBev)" opacity="0.85"/>
  <!-- the round seat of the spin button -->
  <circle cx="206" cy="76" r="47" fill="url(#seat)"/>
  <circle cx="206" cy="76" r="47" fill="none" stroke="url(#gGoldD)" stroke-width="2.4" filter="url(#gBev)"/>
  <rect x="0" y="146" width="412" height="2" fill="#000" opacity="0.5"/>
`,
      `${L.goldDefs()}
  ${L.gradient('deck', [[0, '#5a3418'], [0.4, '#3a1e0a'], [1, '#1e0e04']])}
  ${L.gradient('step', [[0, '#c08a50'], [1, '#6a3e1a']])}
  ${L.gradient('plate', [[0, '#120802'], [1, '#2a1606']])}
  ${L.radial('seat', [[0.7, '#2a1406'], [1, '#120802']])}
  ${L.stoneGrain('grain', { freq: 1.0, seed: 12, dark: 0.28 })}`
    ),
};
