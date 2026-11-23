// The round buttons of the control deck: the big SPIN orb (green, and lit gold while it runs), and the small bronze buttons (off / on).
const L = require('./_lib');

const spin = (lit) =>
  L.svg(120, 120, `
    <circle cx="60" cy="64" r="56" fill="#000" opacity="0.5" filter="url(#sh)"/>
    <circle cx="60" cy="60" r="56" fill="url(#ring)"/>
    <circle cx="60" cy="60" r="52" fill="#07090b"/>
    <circle cx="60" cy="60" r="48" fill="url(#orb)" filter="url(#bev)"/>
    <ellipse cx="60" cy="38" rx="32" ry="17" fill="url(#gloss)"/>
    <text x="60" y="76" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="46" fill="${lit ? '#4a2a00' : '#fff6c0'}" stroke="${lit ? '#fff1b0' : '#0a5a22'}" stroke-width="5" paint-order="stroke" stroke-linejoin="round">7</text>
    <circle cx="60" cy="60" r="48" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="1"/>
  `, `
    ${L.gradient('ring', [[0, '#9fa2b0'], [0.3, '#4a4c58'], [0.7, '#1b1c22'], [1, '#6a6c7a']], { x1: 0.1, y1: 0, x2: 0.9, y2: 1 })}
    ${L.radial('orb', lit ? [[0, '#fff0a0'], [0.5, '#ffc21c'], [1, '#a86800']] : [[0, '#a8ff9a'], [0.45, '#22c84a'], [1, '#08702a']], { cx: 0.42, cy: 0.32, r: 0.8 })}
    ${L.gradient('gloss', [[0, '#fff', 0.75], [1, '#fff', 0]])}
    ${L.bevel('bev', { rel: 2.4, depth: 4, shine: 0.7 })}
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5"/></filter>
  `);

const small = (on) =>
  L.svg(64, 64, `
    <circle cx="32" cy="35" r="29" fill="#000" opacity="0.5" filter="url(#sh)"/>
    <circle cx="32" cy="32" r="29" fill="url(#ring)"/>
    <circle cx="32" cy="32" r="25" fill="url(#face)" filter="url(#bev)"/>
    <ellipse cx="32" cy="20" rx="16" ry="8" fill="#fff" opacity="${on ? 0.45 : 0.25}"/>
  `, `
    ${L.gradient('ring', [[0, '#e8c88a'], [0.4, '#8a5a24'], [0.75, '#3a2410'], [1, '#c89a58']], { x1: 0.1, y1: 0, x2: 0.9, y2: 1 })}
    ${L.radial('face', on ? [[0, '#a8ff9a'], [0.5, '#22c84a'], [1, '#08702a']] : [[0, '#6a5a6e'], [0.5, '#3a2c3e'], [1, '#1c1220']], { cx: 0.42, cy: 0.32, r: 0.85 })}
    ${L.bevel('bev', { rel: 1.8, depth: 3, shine: 0.6 })}
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter>
  `);

module.exports = [
  { _id: 'spin', width: 120, height: 120, scale: 2.5, out: 'assets/turbosevens/spin.webp', quality: 92, svg: () => spin(false) },
  { _id: 'lit', width: 120, height: 120, scale: 2.5, out: 'assets/turbosevens/spin-lit.webp', quality: 92, svg: () => spin(true) },
  { _id: 'btn', width: 64, height: 64, scale: 3, out: 'assets/turbosevens/btn.webp', quality: 92, svg: () => small(false) },
  { _id: 'on', width: 64, height: 64, scale: 3, out: 'assets/turbosevens/btn-on.webp', quality: 92, svg: () => small(true) },
];
