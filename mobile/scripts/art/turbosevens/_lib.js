// Shared pieces of the Turbo Sevens art: the 7s, the flames, the BAR plates and the gold-rimmed medallions of the bonus reel.
const L = require('../jaguar/_lib');

/** The 7 (a 100 x 100 box): thick top bar, a diagonal stem. */
const SEVEN = 'M17 19 L86 19 L86 36 L52 91 L30 91 L58 37 L17 37 Z';

/** One tongue of flame standing on (x, base): width w, height h, leaning by `lean`. */
function tongue(x, base, w, h, lean = 0) {
  const tip = [x + lean, base - h];
  return `M${x - w / 2} ${base} C${x - w * 0.55} ${base - h * 0.45} ${x - w * 0.12 + lean * 0.5} ${base - h * 0.55} ${tip[0]} ${tip[1]} C${x + w * 0.16 + lean * 0.5} ${base - h * 0.5} ${x + w * 0.55} ${base - h * 0.4} ${x + w / 2} ${base} Z`;
}

/** The three flame colours (outer, middle, hot core) as gradients with the given id prefix. */
const flameDefs = (id) => `
  ${L.gradient(id + 'o', [[0, '#ff2a00'], [0.55, '#ff7a00'], [1, '#ffd23a']], { x1: 0, y1: 0, x2: 0, y2: 1 })}
  ${L.gradient(id + 'm', [[0, '#ff9c00'], [1, '#fff08a']], { x1: 0, y1: 0, x2: 0, y2: 1 })}
  ${L.gradient(id + 'c', [[0, '#fff6c0'], [1, '#ffffff']], { x1: 0, y1: 0, x2: 0, y2: 1 })}
  <filter id="${id}blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>`;

/** Flames round the foot and sides of a 7: `scale` 1 is the big blaze of the top prize. */
function flames(id, scale = 1) {
  const tongues = [
    [14, 82, 20, 52 * scale, -5], [26, 90, 24, 64 * scale, -2], [42, 94, 24, 50 * scale, 2], [58, 94, 24, 56 * scale, -1], [74, 90, 24, 66 * scale, 3], [87, 82, 20, 50 * scale, 5],
    [22, 52, 16, 38 * scale, -6], [82, 50, 16, 40 * scale, 6],
  ];
  return `
  <g filter="url(#${id}blur)" opacity="0.8">${tongues.map(([x, b, w, h, l]) => `<path d="${tongue(x, b, w + 6, h + 6, l)}" fill="#ff5a00"/>`).join('')}</g>
  ${tongues.map(([x, b, w, h, l]) => `<path d="${tongue(x, b, w, h, l)}" fill="url(#${id}o)"/><path d="${tongue(x, b, w * 0.62, h * 0.72, l * 0.7)}" fill="url(#${id}m)"/><path d="${tongue(x, b, w * 0.3, h * 0.42, l * 0.4)}" fill="url(#${id}c)"/>`).join('')}`;
}

/** A 7 with a fill gradient, a dark outline and a lit edge. */
function seven(id, fillStops, { stroke = '#4a0008', rim = '#fff', bevelDepth = 3.6 } = {}) {
  return {
    defs: `${L.gradient(id + 'f', fillStops, { x1: 0.2, y1: 0, x2: 0.8, y2: 1 })}${L.bevel(id + 'bv', { rel: 1.8, depth: bevelDepth, shine: 0.8, shade: 0.45, exp: 18 })}${L.dropShadow(id + 'ds', 2.2, 1.8, 0.65)}`,
    body: `
    <g filter="url(#${id}ds)">
      <path d="${SEVEN}" fill="${stroke}" stroke="${stroke}" stroke-width="9" stroke-linejoin="round"/>
      <path d="${SEVEN}" fill="url(#${id}f)" stroke="${rim}" stroke-opacity="0.55" stroke-width="1.4" stroke-linejoin="round" filter="url(#${id}bv)"/>
    </g>`,
  };
}

/** A BAR plate (x, y, w, h) in a colour: dark rim, gradient face, lit top edge and the word. */
function bar(id, x, y, w, h, { face, rim, text, outline }) {
  const fs = h * 0.72;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h * 0.2}" fill="${rim}"/>
    <rect x="${x + 2}" y="${y + 2}" width="${w - 4}" height="${h - 4}" rx="${h * 0.16}" fill="url(#${id})"/>
    <rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${(h - 6) * 0.42}" rx="${h * 0.12}" fill="#fff" opacity="0.2"/>
    <text x="${x + w / 2}" y="${y + h * 0.5 + fs * 0.36}" text-anchor="middle" font-family="Inter" font-weight="900" font-size="${fs}" letter-spacing="${h * 0.04}" fill="${text}" stroke="${outline}" stroke-width="${h * 0.1}" paint-order="stroke">BAR</text>`;
}

const medalGold = (id) => L.gradient(id, [[0, '#fff6b8'], [0.3, '#ffd23a'], [0.65, '#d98f00'], [1, '#ffe27a']], { x1: 0, y1: 0, x2: 1, y2: 1 });

module.exports = { ...L, SEVEN, tongue, flames, flameDefs, seven, bar, medalGold };
