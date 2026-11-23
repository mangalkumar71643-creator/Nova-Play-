// The big PLAY button (130 x 130 units): a green glass orb with the arrow, in a dark ring that says HOLD TO AUTOPLAY. `play-lit` is the same
// with a lit ring and a white-yellow orb, for when the autoplay is running.
const L = require('./_lib');

const draw = (lit) =>
  L.svg(130, 130, `
    <circle cx="65" cy="68" r="62" fill="#000" opacity="0.5" filter="url(#sh)"/>
    <circle cx="65" cy="65" r="62" fill="url(#ring)"/>
    <circle cx="65" cy="65" r="60.4" fill="none" stroke="${lit ? '#ffe27a' : '#6a6d7c'}" stroke-opacity="${lit ? 0.9 : 0.7}" stroke-width="1.2"/>
    <circle cx="65" cy="65" r="57" fill="#0a0b0f"/>
    <path id="top" d="M17 65 A48 48 0 0 1 113 65" fill="none"/>
    <path id="bot" d="M12 65 A53 53 0 0 0 118 65" fill="none"/>
    <text font-family="Inter" font-weight="900" font-size="11.5" letter-spacing="2.2" fill="${lit ? '#ffe27a' : '#e9ecf4'}" text-anchor="middle"><textPath href="#top" startOffset="50%">HOLD</textPath></text>
    <text font-family="Inter" font-weight="900" font-size="10.5" letter-spacing="1.6" fill="${lit ? '#ffe27a' : '#e9ecf4'}" text-anchor="middle"><textPath href="#bot" startOffset="50%" side="left">TO AUTOPLAY</textPath></text>
    <circle cx="65" cy="65" r="43" fill="#050608"/>
    <circle cx="65" cy="65" r="41" fill="url(#orb)" filter="url(#bev)"/>
    <ellipse cx="65" cy="45" rx="29" ry="15" fill="url(#gloss)"/>
    <path d="M57 49 L57 81 L84 65 Z" fill="#fff" stroke="${lit ? '#8a5a00' : '#0b6b2c'}" stroke-width="3.2" stroke-linejoin="round" paint-order="stroke" transform="translate(-1 0)"/>
    <circle cx="65" cy="65" r="41" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1"/>
  `, `
    ${L.gradient('ring', [[0, '#5b5e6c'], [0.35, '#24252d'], [0.7, '#0f1015'], [1, '#444753']], { x1: 0.1, y1: 0, x2: 0.9, y2: 1 })}
    ${L.radial('orb', lit ? [[0, '#fff3a6'], [0.45, '#ffc82e'], [1, '#b87400']] : [[0, '#7dff9e'], [0.45, '#17c653'], [1, '#07702e']], { cx: 0.45, cy: 0.35, r: 0.75 })}
    ${L.gradient('gloss', [[0, '#fff', 0.7], [1, '#fff', 0]])}
    ${L.bevel('bev', { rel: 2.2, depth: 3.5, shine: 0.7 })}
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5"/></filter>
  `);

module.exports = [
  { _id: 'play', width: 130, height: 130, scale: 2.5, out: 'assets/ringgauntlet/play.webp', quality: 92, svg: () => draw(false) },
  { _id: 'lit', width: 130, height: 130, scale: 2.5, out: 'assets/ringgauntlet/play-lit.webp', quality: 92, svg: () => draw(true) },
];
