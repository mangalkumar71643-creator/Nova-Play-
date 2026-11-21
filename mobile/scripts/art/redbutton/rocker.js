// The red rocker switch in its steel frame, in two states (off, and lit: on).
const frame = (cap, glowOn) => `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="140" viewBox="0 0 240 140">
  <defs>
    <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b9b9e"/><stop offset=".45" stop-color="#55565a"/><stop offset="1" stop-color="#2a2b2d"/></linearGradient>
    <linearGradient id="well" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050505"/><stop offset="1" stop-color="#1a1a1b"/></linearGradient>
    <filter id="drop" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000" flood-opacity=".7"/></filter>
    <filter id="glowf" x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="sh"><feDropShadow dx="0" dy="1.5" stdDeviation="1.4" flood-color="#400000" flood-opacity=".8"/></filter>
    <linearGradient id="body" x1="0" y1="0" x2="1" y2="0">${cap.body}</linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">${cap.shade}</linearGradient>
  </defs>
  <g filter="url(#drop)">
    <rect x="10" y="8" width="220" height="118" rx="7" fill="url(#steel)"/>
    <rect x="11" y="9" width="218" height="116" rx="6" fill="none" stroke="#e8e8ea" stroke-opacity=".45" stroke-width="1.3"/>
    <rect x="18" y="16" width="204" height="102" rx="4" fill="url(#well)"/>
  </g>
  ${glowOn ? '<ellipse cx="120" cy="68" rx="106" ry="52" fill="#ff2a22" opacity=".5" filter="url(#glowf)"/>' : ''}
  ${cap.shape}
  <g fill="none" stroke="#fff" filter="url(#sh)">
    <circle cx="${cap.ringX}" cy="68" r="${cap.ringR}" stroke-width="${cap.ringW}"/>
    <rect x="${cap.dashX}" y="${68 - cap.dashH / 2}" width="${cap.dashW}" height="${cap.dashH}" fill="#fff" stroke="none"/>
  </g>
</svg>`;

const OFF = {
  body: '<stop offset="0" stop-color="#7c1313"/><stop offset=".55" stop-color="#a31c1c"/><stop offset="1" stop-color="#c52626"/>',
  shade: '<stop offset="0" stop-color="#000" stop-opacity=".25"/><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/>',
  shape: `<path d="M22 21 L 214 24 Q 220 24 220 30 L 220 108 Q 220 113 214 113 L 22 113 Q 18 113 18 108 L 18 26 Q 18 21 22 21 Z" fill="url(#body)"/>
  <path d="M196 24 L 220 28 L 220 109 L 196 113 Z" fill="#e23a38" opacity=".9"/>
  <path d="M24 22 L 214 25" stroke="#ff8a82" stroke-opacity=".6" stroke-width="1.6" fill="none"/>
  <path d="M20 112 L 214 112" stroke="#300808" stroke-opacity=".7" stroke-width="2.4" fill="none"/>
  <rect x="18" y="21" width="202" height="92" rx="5" fill="url(#shade)"/>`,
  ringX: 62, ringR: 15, ringW: 7, dashX: 128, dashW: 30, dashH: 8,
};
const ON = {
  body: '<stop offset="0" stop-color="#ee2523"/><stop offset=".5" stop-color="#ff4038"/><stop offset="1" stop-color="#f23029"/>',
  shade: '<stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".18"/>',
  shape: `<path d="M22 18 L 218 18 Q 223 18 223 24 L 223 112 Q 223 118 218 118 L 22 118 Q 17 118 17 112 L 17 24 Q 17 18 22 18 Z" fill="url(#body)"/>
  <path d="M24 19.5 L 216 19.5" stroke="#ffc3bd" stroke-opacity=".8" stroke-width="1.8" fill="none"/>
  <rect x="17" y="18" width="206" height="100" rx="6" fill="url(#shade)"/>`,
  ringX: 60, ringR: 18, ringW: 7.5, dashX: 124, dashW: 36, dashH: 8.5,
};

module.exports = [
  { _id: 'off', svg: () => frame(OFF, false), out: 'assets/redbutton/rocker-off.webp' },
  { _id: 'on', svg: () => frame(ON, true), out: 'assets/redbutton/rocker-on.webp' },
].map((p) => ({ width: 240, height: 140, scale: 1.5, quality: 92, ...p }));
