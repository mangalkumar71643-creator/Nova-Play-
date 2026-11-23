// Shared pieces of the Ring Gauntlet art: the three ring colours, the shape badges and the sentinel standing in the middle of the wheel.
const L = require('../jaguar/_lib');

/** The three rings: outer square (yellow), middle triangle (green), inner circle (blue). */
const RING = {
  OUTER: { shape: 'SQUARE', main: '#ffc82e', light: '#ffe88a', dark: '#8a5a00', glow: '#ffb400' },
  MIDDLE: { shape: 'TRIANGLE', main: '#2ee86a', light: '#a6ffc4', dark: '#0b6b2c', glow: '#18d058' },
  INNER: { shape: 'CIRCLE', main: '#2aa8ff', light: '#a8deff', dark: '#0a4c8a', glow: '#1c8cff' },
};

/** A shape badge as SVG markup, centred on (cx, cy) with half-size r. */
function shape(kind, cx, cy, r, attrs) {
  if (kind === 'SQUARE') return `<rect x="${cx - r * 0.86}" y="${cy - r * 0.86}" width="${r * 1.72}" height="${r * 1.72}" rx="${r * 0.12}" ${attrs}/>`;
  if (kind === 'TRIANGLE') return `<path d="M${cx} ${cy - r * 1.02} L${cx + r * 1.02} ${cy + r * 0.74} L${cx - r * 1.02} ${cy + r * 0.74} Z" stroke-linejoin="round" ${attrs}/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r * 0.92}" ${attrs}/>`;
}

/**
 * The sentinel: a hooded guard in the ring's colour with a dark face plate and the ring's shape glowing on its forehead.
 * `state` is 'ready' (the ring's colours) or 'lost' (grey hood, a red cross on a cracked plate). Drawn in a 120 x 120 box; ids are prefixed.
 */
function sentinel(id, ringKey, state = 'ready') {
  const lost = state === 'lost';
  const c = lost ? { main: '#8c93a3', light: '#d0d5df', dark: '#2a2e38', glow: '#ff3b4a' } : RING[ringKey];
  const symbol = lost ? 'X' : RING[ringKey].shape;
  const sym = (() => {
    if (symbol === 'X') return `<path d="M51 38 L69 56 M69 38 L51 56" stroke="#ff4656" stroke-width="4.6" stroke-linecap="round" fill="none"/>`;
    return shape(symbol, 60, 47, 10.5, `fill="none" stroke="${c.light}" stroke-width="4.2"`);
  })();
  const defs = `
    ${L.radial(id + 'disc', [[0, lost ? '#2e2226' : '#2c303c'], [0.7, '#14161d'], [1, '#07080c']], { cx: 0.5, cy: 0.38, r: 0.75 })}
    ${L.gradient(id + 'rim', [[0, c.light], [0.35, c.main], [0.7, c.dark], [1, c.main]], { x1: 0, y1: 0, x2: 1, y2: 1 })}
    ${L.gradient(id + 'hood', [[0, c.light], [0.28, c.main], [0.75, c.dark], [1, c.dark]], { x1: 0.15, y1: 0, x2: 0.85, y2: 1 })}
    ${L.gradient(id + 'cloth', [[0, c.main], [1, c.dark]], { x1: 0, y1: 0, x2: 0, y2: 1 })}
    ${L.gradient(id + 'plate', [[0, '#3a3f4e'], [0.4, '#1a1c25'], [1, '#08090d']], { x1: 0.2, y1: 0, x2: 0.8, y2: 1 })}
    <filter id="${id}glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="3.2"/></filter>
    <filter id="${id}soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4"/></filter>
    ${L.bevel(id + 'bev', { rel: 1.6, depth: 3.2, shine: 0.55, shade: 0.4 })}
    ${L.dropShadow(id + 'drop', 2.5, 2.2, 0.6)}
    <clipPath id="${id}clip"><circle cx="60" cy="60" r="52"/></clipPath>`;
  const body = `
    <circle cx="60" cy="60" r="58" fill="url(#${id}rim)"/>
    <circle cx="60" cy="60" r="54.5" fill="#05060a"/>
    <circle cx="60" cy="60" r="52" fill="url(#${id}disc)"/>
    <g clip-path="url(#${id}clip)">
      <ellipse cx="60" cy="30" rx="44" ry="30" fill="${c.main}" opacity="${lost ? 0.05 : 0.16}" filter="url(#${id}glow)"/>
      <g filter="url(#${id}drop)">
        <path d="M-4 124 L-4 100 C4 90 22 84 40 82 L80 82 C98 84 116 90 124 100 L124 124 Z" fill="url(#${id}cloth)" filter="url(#${id}bev)"/>
        <path d="M40 82 L60 100 L80 82" fill="none" stroke="#050608" stroke-width="3" stroke-linejoin="round" opacity="0.7"/>
        <path d="M60 12 C84 12 95 33 95 56 C95 71 88 82 78 88 L42 88 C32 82 25 71 25 56 C25 33 36 12 60 12 Z" fill="url(#${id}hood)" filter="url(#${id}bev)"/>
      </g>
      <path d="M60 25 C75 25 82 39 82 55 C82 69 73 80 60 82 C47 80 38 69 38 55 C38 39 45 25 60 25 Z" fill="url(#${id}plate)" stroke="#000" stroke-opacity="0.75" stroke-width="1.6"/>
      <path d="M44 33 C49 27 56 26 60 26" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>
      <g opacity="0.95">
        <g filter="url(#${id}glow)" opacity="0.9">${symbol === 'X' ? sym : shape(symbol, 60, 47, 10.5, `fill="none" stroke="${c.glow}" stroke-width="5"`)}</g>
        ${sym}
      </g>
      <path d="M47 64 L73 64" stroke="${lost ? '#ff3b4a' : c.main}" stroke-width="2.6" stroke-linecap="round" filter="url(#${id}soft)"/>
      <path d="M47 64 L73 64" stroke="${lost ? '#ffd0d4' : c.light}" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M52 72 L52 77 M56.7 72.5 L56.7 78 M61.3 72.5 L61.3 78 M66 72 L66 77" stroke="#000" stroke-opacity="0.65" stroke-width="1.6" stroke-linecap="round"/>
      ${lost ? `<path d="M64 27 L58 42 L66 50 L57 63 L63 79" fill="none" stroke="#000" stroke-opacity="0.75" stroke-width="1.5" stroke-linejoin="round"/><path d="M64.8 27.5 L58.8 42.5 L66.8 50.5 L57.8 63.5" fill="none" stroke="#ff8a94" stroke-opacity="0.5" stroke-width="0.7"/>` : ''}
    </g>
    <circle cx="60" cy="60" r="52" fill="none" stroke="#000" stroke-opacity="0.65" stroke-width="2.6"/>
    <path d="M14 40 A52 52 0 0 1 60 8" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="2.4" stroke-linecap="round"/>`;
  return { defs, body };
}

module.exports = { ...L, RING, shape, sentinel };
