// The red dome of the big button, up and pressed. Drawing units: 400 x 400, dome centre (200, 200), radius 190 (up).
const dome = (r, opts) => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <radialGradient id="body" cx=".5" cy=".68" r=".62">
      <stop offset="0" stop-color="${opts.mid}"/><stop offset=".55" stop-color="${opts.base}"/><stop offset="1" stop-color="${opts.edge}"/>
    </radialGradient>
    <radialGradient id="bounce" cx=".5" cy=".92" r=".5"><stop offset="0" stop-color="#ff8a6a" stop-opacity="${opts.bounce}"/><stop offset="1" stop-color="#ff8a6a" stop-opacity="0"/></radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9d90" stop-opacity="${opts.rim}"/><stop offset=".25" stop-color="#ff9d90" stop-opacity="0"/></linearGradient>
    <radialGradient id="spec" cx=".42" cy=".2" r=".3"><stop offset="0" stop-color="#fff" stop-opacity="${opts.spec}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="lower" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#400000" stop-opacity="0"/><stop offset="1" stop-color="#400000" stop-opacity=".4"/></linearGradient>
    <filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>
    <filter id="drop" x="-10%" y="-10%" width="125%" height="130%"><feDropShadow dx="${opts.sx}" dy="${opts.sy}" stdDeviation="${opts.sb}" flood-color="#000" flood-opacity=".85"/></filter>
    <clipPath id="c"><circle cx="200" cy="200" r="${r}"/></clipPath>
  </defs>
  <g filter="url(#drop)"><circle cx="200" cy="200" r="${r}" fill="${opts.edge}"/></g>
  <circle cx="200" cy="200" r="${r}" fill="url(#body)"/>
  <g clip-path="url(#c)">
    <circle cx="200" cy="200" r="${r}" fill="url(#bounce)"/>
    <circle cx="200" cy="200" r="${r}" fill="url(#lower)"/>
    <ellipse cx="200" cy="${200 - r * 0.62}" rx="${r * 0.55}" ry="${r * 0.26}" fill="#fff" opacity="${opts.spec}" filter="url(#blur6)"/>
    <circle cx="200" cy="200" r="${r}" fill="url(#rim)"/>
    <circle cx="200" cy="200" r="${r - 1}" fill="none" stroke="#ffb3a8" stroke-opacity="${opts.edgeLine}" stroke-width="2.4"/>
  </g>
</svg>`;

module.exports = [
  { _id: 'up', svg: () => dome(190, { mid: '#d4584b', base: '#b8281f', edge: '#7e0f0c', bounce: 0.38, rim: 0.55, spec: 0.1, sx: 0, sy: 9, sb: 9, edgeLine: 0.3 }), out: 'assets/redbutton/dome-up.webp' },
  { _id: 'down', svg: () => dome(184, { mid: '#c04336', base: '#a01e17', edge: '#6a0a08', bounce: 0.22, rim: 0.3, spec: 0.05, sx: 0, sy: 3, sb: 4, edgeLine: 0.18 }), out: 'assets/redbutton/dome-down.webp' },
].map((p) => ({ width: 400, height: 400, scale: 1.5, quality: 92, ...p }));
