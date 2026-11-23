// A fine felt grain, laid over the green of the table: light and dark specks with a little more weave across than down.
module.exports = {
  width: 240,
  height: 426,
  scale: 1,
  out: 'assets/teenpatticlub/felt-noise.webp',
  quality: 45,
  svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="426" viewBox="0 0 240 426">
  <defs>
    <filter id="l" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.95 0.7" numOctaves="3" seed="11"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.2 0 0 0 -1.52"/>
    </filter>
    <filter id="d" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.8 1.1" numOctaves="3" seed="23"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3.2 0 0 0 1.7"/>
    </filter>
  </defs>
  <rect width="240" height="426" filter="url(#l)" opacity=".5"/>
  <rect width="240" height="426" filter="url(#d)" opacity=".6"/>
</svg>`,
};
