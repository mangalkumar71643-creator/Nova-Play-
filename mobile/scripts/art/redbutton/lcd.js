// The LCD: a groove in the panel, a dark bezel and the green glass with its printed wave, lit from behind. The digits are drawn by the app on top.
// Drawing units: the asset has a margin round the 748 x 417 unit LCD (16 left and right, 12 on top, 26 below) for its shadow.
module.exports = {
  width: 780,
  height: 455,
  scale: 1.5,
  out: 'assets/redbutton/lcd.webp',
  quality: 92,
  svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="455" viewBox="0 0 780 455">
  <defs>
    <linearGradient id="groove" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050505"/><stop offset="1" stop-color="#77777c"/></linearGradient>
    <linearGradient id="groove2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f6f74"/><stop offset="1" stop-color="#060606"/></linearGradient>
    <linearGradient id="bezel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4d4e50"/><stop offset=".5" stop-color="#262728"/><stop offset="1" stop-color="#121212"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#97aa8a"/><stop offset=".07" stop-color="#b9d6a7"/><stop offset=".25" stop-color="#c8e5b7"/><stop offset=".62" stop-color="#bfe0ad"/><stop offset="1" stop-color="#a7cc94"/>
    </linearGradient>
    <radialGradient id="glow" cx=".5" cy=".4" r=".62"><stop offset="0" stop-color="#e2f6d2" stop-opacity=".55"/><stop offset="1" stop-color="#e2f6d2" stop-opacity="0"/></radialGradient>
    <linearGradient id="shadeTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10200f" stop-opacity=".55"/><stop offset="1" stop-color="#10200f" stop-opacity="0"/></linearGradient>
    <linearGradient id="shadeLeft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#10200f" stop-opacity=".4"/><stop offset="1" stop-color="#10200f" stop-opacity="0"/></linearGradient>
    <linearGradient id="shadeRight" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#10200f" stop-opacity=".25"/><stop offset="1" stop-color="#10200f" stop-opacity="0"/></linearGradient>
    <linearGradient id="wave" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fbd73" stop-opacity=".55"/><stop offset="1" stop-color="#7fb066" stop-opacity=".45"/></linearGradient>
    <clipPath id="clipGlass"><rect x="42" y="36" width="696" height="369" rx="14"/></clipPath>
    <filter id="drop" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000" flood-opacity=".75"/></filter>
    <filter id="soft"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="4"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .1  0 0 0 0 .2  0 0 0 0 .1  0 -2.2 0 0 1.3"/>
    </filter>
  </defs>
  <!-- groove round the display, cut into the panel -->
  <rect x="18" y="14" width="744" height="413" rx="46" fill="none" stroke="url(#groove)" stroke-width="3.5"/>
  <rect x="21.5" y="17.5" width="737" height="406" rx="43" fill="none" stroke="url(#groove2)" stroke-width="2"/>
  <g filter="url(#drop)">
    <rect x="30" y="24" width="720" height="393" rx="30" fill="url(#bezel)" stroke="#0a0a0a" stroke-width="2"/>
    <rect x="31.5" y="25.5" width="717" height="390" rx="28.5" fill="none" stroke="#8d8e92" stroke-opacity=".55" stroke-width="1.2"/>
    <rect x="38" y="32" width="704" height="377" rx="22" fill="#090a09"/>
  </g>
  <!-- the glass -->
  <rect x="42" y="36" width="696" height="369" rx="14" fill="url(#glass)"/>
  <g clip-path="url(#clipGlass)">
    <rect x="42" y="36" width="696" height="369" fill="url(#glow)"/>
    <path d="M42 318 C 150 292, 270 282, 395 289 S 650 284, 738 258 L 738 405 L 42 405 Z" fill="url(#wave)" filter="url(#soft)"/>
    <path d="M42 318 C 150 292, 270 282, 395 289 S 650 284, 738 258" fill="none" stroke="#e6f7d6" stroke-opacity=".28" stroke-width="1.6"/>
    <rect x="42" y="36" width="696" height="369" filter="url(#grain)" opacity=".28"/>
    <rect x="42" y="36" width="696" height="34" fill="url(#shadeTop)"/>
    <rect x="42" y="36" width="24" height="369" fill="url(#shadeLeft)"/>
    <rect x="714" y="36" width="24" height="369" fill="url(#shadeRight)"/>
    <path d="M42 36 L 372 36 L 246 405 L 42 405 Z" fill="#fff" fill-opacity=".055"/>
    <rect x="42" y="36" width="696" height="2" fill="#fff" fill-opacity=".35"/>
  </g>
  <rect x="42.5" y="36.5" width="695" height="368" rx="14" fill="none" stroke="#06100a" stroke-opacity=".7" stroke-width="1.4"/>
</svg>`,
};
