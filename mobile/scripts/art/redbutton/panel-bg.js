// The panel's brushed-metal face: dark steel with fine vertical grain, a soft sheen at the top left and a dark edge all round.
module.exports = {
  width: 540,
  height: 1170,
  scale: 1.5,
  out: 'assets/redbutton/panel-bg.webp',
  quality: 74,
  svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="1170" viewBox="0 0 540 1170">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b2b2d"/><stop offset=".4" stop-color="#1d1d1f"/><stop offset="1" stop-color="#0f0f10"/>
    </linearGradient>
    <radialGradient id="sheen" cx=".28" cy=".16" r=".75">
      <stop offset="0" stop-color="#fff" stop-opacity=".11"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="sheen2" cx=".85" cy=".62" r=".6">
      <stop offset="0" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig" cx=".5" cy=".42" r=".88">
      <stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/>
    </radialGradient>
    <filter id="brushL" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.85 0.004" numOctaves="2" seed="3"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.4 0 0 0 -1.62"/>
    </filter>
    <filter id="brushD" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.7 0.003" numOctaves="2" seed="9"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.4 0 0 0 1.78"/>
    </filter>
  </defs>
  <rect width="540" height="1170" fill="url(#base)"/>
  <rect width="540" height="1170" filter="url(#brushL)" opacity=".22"/>
  <rect width="540" height="1170" filter="url(#brushD)" opacity=".3"/>
  <rect width="540" height="1170" fill="url(#sheen)"/>
  <rect width="540" height="1170" fill="url(#sheen2)"/>
  <rect width="540" height="1170" fill="url(#vig)"/>
</svg>`,
};
