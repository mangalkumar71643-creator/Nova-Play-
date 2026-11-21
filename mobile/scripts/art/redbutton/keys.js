// The two green bet keys: a steel frame with two wells, and one backlit key (the arrows are drawn by the app, so they can be pressed).
const frame = () => `<svg xmlns="http://www.w3.org/2000/svg" width="238" height="140" viewBox="0 0 238 140">
  <defs>
    <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b9b9e"/><stop offset=".45" stop-color="#55565a"/><stop offset="1" stop-color="#2a2b2d"/></linearGradient>
    <linearGradient id="well" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#030303"/><stop offset="1" stop-color="#171818"/></linearGradient>
    <filter id="drop" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000" flood-opacity=".7"/></filter>
  </defs>
  <g filter="url(#drop)">
    <rect x="10" y="8" width="218" height="118" rx="7" fill="url(#steel)"/>
    <rect x="11" y="9" width="216" height="116" rx="6" fill="none" stroke="#e8e8ea" stroke-opacity=".45" stroke-width="1.3"/>
    <rect x="18" y="16" width="202" height="102" rx="4" fill="url(#well)"/>
  </g>
</svg>`;

const key = () => `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="96" viewBox="0 0 100 96">
  <defs>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fbf9a"/><stop offset=".5" stop-color="#1f9c78"/><stop offset="1" stop-color="#178466"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#7ff0c8" stop-opacity=".5"/><stop offset="1" stop-color="#7ff0c8" stop-opacity="0"/></radialGradient>
    <filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="2.5" stdDeviation="2" flood-color="#021a12" flood-opacity=".8"/></filter>
  </defs>
  <g filter="url(#sh)">
    <rect x="6" y="5" width="88" height="84" rx="9" fill="#0d6b52"/>
    <rect x="6" y="5" width="88" height="80" rx="9" fill="url(#face)"/>
    <rect x="6" y="5" width="88" height="80" rx="9" fill="url(#glow)"/>
    <rect x="7" y="6" width="86" height="78" rx="8" fill="none" stroke="#bdf7e1" stroke-opacity=".55" stroke-width="1.4"/>
    <path d="M13 10 L 87 10" stroke="#e9fff6" stroke-opacity=".65" stroke-width="2" stroke-linecap="round"/>
  </g>
</svg>`;

module.exports = [
  { _id: 'frame', width: 238, height: 140, svg: frame, out: 'assets/redbutton/keys-frame.webp' },
  { _id: 'key', width: 100, height: 96, svg: key, out: 'assets/redbutton/key.webp' },
].map((p) => ({ scale: 1.5, quality: 92, ...p }));
