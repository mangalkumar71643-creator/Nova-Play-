// Shared pieces for the Jaguar Temple art: smooth paths, metals, stone and the bevel filter that turns flat shapes into carved, lit ones.

/** A smooth path (Catmull-Rom turned into cubic Beziers) through the points [[x, y], ...]. */
function smooth(pts, closed = false, tension = 0.5) {
  const n = pts.length;
  const P = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.min(n - 1, Math.max(0, i))]);
  let d = `M${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + ((p2[0] - p0[0]) * tension) / 3 * 2 * 0.5 * 1, p1[1] + ((p2[1] - p0[1]) * tension) / 3 * 2 * 0.5 * 1];
    const c2 = [p2[0] - ((p3[0] - p1[0]) * tension) / 3 * 2 * 0.5 * 1, p2[1] - ((p3[1] - p1[1]) * tension) / 3 * 2 * 0.5 * 1];
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + (closed ? ' Z' : '');
}

/** A closed, left-right symmetric outline from the right half's points (dx from the axis, y), top to bottom. */
function mirrored(cx, half, tension = 0.5) {
  const right = half.map(([dx, y]) => [cx + dx, y]);
  const left = half.map(([dx, y]) => [cx - dx, y]).reverse();
  return smooth([...right, ...left], true, tension);
}

const gradient = (id, stops, { x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('')}</linearGradient>`;
const radial = (id, stops, { cx = 0.5, cy = 0.5, r = 0.5, fx, fy } = {}) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${fx !== undefined ? ` fx="${fx}" fy="${fy}"` : ''}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a === undefined ? '' : ` stop-opacity="${a}"`}/>`).join('')}</radialGradient>`;

const GOLD_STOPS = [[0, '#fff7c9'], [0.22, '#ffd966'], [0.5, '#e8a21f'], [0.78, '#b46c10'], [1, '#ffd25a']];
const gold = (id, opt) => gradient(id, GOLD_STOPS, opt);
const SILVER_STOPS = [[0, '#ffffff'], [0.3, '#d6dbe4'], [0.55, '#8d95a6'], [0.8, '#5a6272'], [1, '#c9cfdb']];
const silver = (id, opt) => gradient(id, SILVER_STOPS, opt);

/**
 * The bevel: lights the edges of a group of flat shapes as if they were carved (a highlight on the sides facing the light at the
 * top left, a shade on the other sides). `rel` is how rounded the edge is (blur), `depth` how tall the relief stands.
 */
function bevel(id, { rel = 2.4, depth = 5, shine = 0.85, shade = 0.5, exp = 22, az = 235, el = 55 } = {}) {
  return `<filter id="${id}" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${rel}" result="h"/>
    <feSpecularLighting in="h" surfaceScale="${depth}" specularConstant="${shine}" specularExponent="${exp}" lighting-color="#fff" result="spec"><feDistantLight azimuth="${az}" elevation="${el}"/></feSpecularLighting>
    <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
    <feDiffuseLighting in="h" surfaceScale="${depth}" diffuseConstant="1" lighting-color="#fff" result="diff"><feDistantLight azimuth="${az}" elevation="${el}"/></feDiffuseLighting>
    <feComponentTransfer in="diff" result="diffN"><feFuncR type="linear" slope="${1 + shade * 0.5}" intercept="${-shade * 0.28}"/><feFuncG type="linear" slope="${1 + shade * 0.5}" intercept="${-shade * 0.28}"/><feFuncB type="linear" slope="${1 + shade * 0.5}" intercept="${-shade * 0.28}"/></feComponentTransfer>
    <feBlend in="SourceGraphic" in2="diffN" mode="multiply" result="lit"/>
    <feComposite in="lit" in2="SourceAlpha" operator="in" result="litIn"/>
    <feComposite in="litIn" in2="specIn" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>
  </filter>`;
}

const dropShadow = (id, dy = 6, blur = 5, opacity = 0.55, color = '#000') =>
  `<filter id="${id}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-color="${color}" flood-opacity="${opacity}"/></filter>`;
const blur = (id, s) => `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${s}"/></filter>`;

/** Stone grain over a shape: noise turned into light and dark specks. */
const stoneGrain = (id, { freq = 0.9, seed = 3, dark = 0.35, light = 0.18 } = {}) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed}"/>
    <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${-dark * 3} 0 0 0 ${dark * 1.7}"/>
  </filter>`;

const svg = (w, h, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;

module.exports = { smooth, mirrored, gradient, radial, gold, silver, GOLD_STOPS, bevel, dropShadow, blur, stoneGrain, svg };
