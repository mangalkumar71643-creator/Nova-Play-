// The big spin button: a golden gear ring round a purple orb (the arrows on it are drawn by the app so they can turn). 120 x 120 units.
const L = require('./_lib');

const gearRing = (cx, cy, r1, r2, n) => {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a0 = ((i - 0.3) / n) * Math.PI * 2, a1 = ((i + 0.3) / n) * Math.PI * 2;
    const p = (a, r) => `${(cx + Math.sin(a) * r).toFixed(1)} ${(cy - Math.cos(a) * r).toFixed(1)}`;
    d += `${i ? 'L' : 'M'}${p(a0, r1)} L${p(a0, r2)} L${p(a1, r2)} L${p(a1, r1)} `;
  }
  return d + 'Z';
};

const orb = (lit) => `
  <g filter="url(#drop)">
    <g filter="url(#bev)">
      <path d="${gearRing(60, 60, 50, 58, 12)}" fill="url(#goldD)"/>
      <circle cx="60" cy="60" r="54" fill="url(#goldD)"/>
      <circle cx="60" cy="60" r="43" fill="#5a3306"/>
    </g>
    <circle cx="60" cy="60" r="40" fill="url(#orb${lit ? 'On' : ''})"/>
    <circle cx="60" cy="60" r="40" fill="url(#shine)"/>
    <ellipse cx="46" cy="38" rx="20" ry="9" transform="rotate(-28 46 38)" fill="#fff" opacity=".42" filter="url(#bl)"/>
  </g>`;

module.exports = [
  { _id: 'idle', svg: () => L.svg(120, 120, orb(false), defs()), out: 'assets/jaguar/spin.webp' },
  { _id: 'lit', svg: () => L.svg(120, 120, orb(true), defs()), out: 'assets/jaguar/spin-lit.webp' },
].map((p) => ({ width: 120, height: 120, scale: 2, quality: 90, ...p }));

function defs() {
  return `${L.gradient('goldD', [[0, '#ffe17a'], [0.4, '#e8a020'], [0.8, '#9a5a0c'], [1, '#f0b038']])}
  ${L.radial('orb', [[0, '#e28cff'], [0.45, '#9b32dc'], [1, '#3a0a78']], { cx: 0.4, cy: 0.35, r: 0.8 })}
  ${L.radial('orbOn', [[0, '#ffc2ff'], [0.45, '#d058ff'], [1, '#6a1aa8']], { cx: 0.4, cy: 0.35, r: 0.8 })}
  ${L.radial('shine', [[0.6, '#fff', 0], [1, '#f2b6ff', 0.5]])}
  ${L.bevel('bev', { rel: 2, depth: 3.6, shine: 0.4, exp: 36, shade: 0.4 })}
  ${L.dropShadow('drop', 3, 3, 0.55)}${L.blur('bl', 2.4)}`;
}
