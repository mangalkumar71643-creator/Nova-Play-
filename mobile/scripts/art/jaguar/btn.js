// A round stone button in a gold ring (bet, auto, turbo, menu), off and on. 64 x 64 units.
const L = require('./_lib');

const btn = (on) => L.svg(64, 64, `
  <g filter="url(#drop)">
    <g filter="url(#bev)">
      <circle cx="32" cy="32" r="29" fill="url(#goldD)"/>
      <circle cx="32" cy="32" r="23.5" fill="url(#${on ? 'faceOn' : 'face'})"/>
    </g>
    <circle cx="32" cy="32" r="23.5" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="2"/>
    <ellipse cx="26" cy="20" rx="12" ry="5" transform="rotate(-24 26 20)" fill="#fff" opacity=".22"/>
  </g>
`, `${L.gradient('goldD', [[0, '#ffe17a'], [0.4, '#e8a020'], [0.8, '#9a5a0c'], [1, '#f0b038']])}
  ${L.radial('face', [[0, '#5a5048'], [1, '#26211d']], { cx: 0.4, cy: 0.3, r: 0.85 })}
  ${L.radial('faceOn', [[0, '#9cffb8'], [0.6, '#26b85a'], [1, '#0b5a2a']], { cx: 0.4, cy: 0.3, r: 0.85 })}
  ${L.bevel('bev', { rel: 1.6, depth: 3, shine: 0.4, exp: 36, shade: 0.4 })}
  ${L.dropShadow('drop', 2.5, 2.5, 0.55)}`);

module.exports = [
  { _id: 'off', svg: () => btn(false), out: 'assets/jaguar/btn.webp' },
  { _id: 'on', svg: () => btn(true), out: 'assets/jaguar/btn-on.webp' },
].map((p) => ({ width: 64, height: 64, scale: 2.5, quality: 90, ...p }));
