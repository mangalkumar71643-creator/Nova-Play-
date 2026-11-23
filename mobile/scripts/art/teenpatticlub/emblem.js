// The emblem on the felt, in the middle of the table (drawn in gold; the screen shows it faint).
const { suit, GOLD } = require('./_lib');

module.exports = {
  width: 320,
  height: 320,
  scale: 2,
  out: 'assets/teenpatticlub/emblem.webp',
  quality: 90,
  svg: () => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">
  <defs>
    ${GOLD}
    <path id="top" d="M 40 160 A 120 120 0 0 1 280 160"/>
    <path id="bottom" d="M 52 168 A 108 108 0 0 0 268 168"/>
  </defs>
  <circle cx="160" cy="160" r="150" fill="none" stroke="url(#gold)" stroke-width="3"/>
  <circle cx="160" cy="160" r="142" fill="none" stroke="url(#gold)" stroke-width="1" stroke-dasharray="2 5"/>
  <circle cx="160" cy="160" r="90" fill="none" stroke="url(#gold)" stroke-width="2"/>
  <text font-family="Liberation Serif, DejaVu Serif, serif" font-weight="700" font-size="27" letter-spacing="5" fill="url(#gold)"><textPath href="#top" startOffset="50%" text-anchor="middle">TEEN PATTI CLUB</textPath></text>
  <text font-family="Inter" font-weight="700" font-size="13" letter-spacing="3.4" fill="url(#gold)"><textPath href="#bottom" startOffset="50%" text-anchor="middle" side="left">REAL PLAYERS · REAL RULES</textPath></text>
  <text x="160" y="196" text-anchor="middle" font-family="Liberation Serif, DejaVu Serif, serif" font-weight="700" font-size="96" fill="url(#gold)" letter-spacing="-3">NP</text>
  ${suit('S', 62, 150, 22, '#e2b45c')}${suit('H', 236, 150, 22, '#e2b45c')}
  ${suit('D', 149, 66, 22, '#e2b45c')}${suit('C', 149, 232, 22, '#e2b45c')}
</svg>`,
};
