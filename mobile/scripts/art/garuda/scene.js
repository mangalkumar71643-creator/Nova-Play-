// The temple at sunset behind the Garuda (412 x 300 units, the top of the machine): a violet-to-gold sky with the sun
// low behind the Garuda, two stone towers (prangs), the temple's balustrade, carved pillars at the sides and jungle leaves.
const L = require('./_lib');

const W = 412;
const H = 300;

/** A prang (a temple tower): stacked, narrowing tiers with a rounded top and a spire; lit from the side facing the sun. */
function prang(cx, base, h, w, id, litLeft) {
  const tiers = 7;
  let out = '';
  let y = base;
  let half = w / 2;
  const tierH = (h * 0.78) / tiers;
  for (let i = 0; i < tiers; i++) {
    const nh = half * 0.86;
    const top = y - tierH;
    out += `<path d="M${cx - half} ${y} L ${cx - nh} ${top} L ${cx + nh} ${top} L ${cx + half} ${y} Z" fill="url(#${id})"/>`;
    out += `<path d="M${cx - nh} ${top} L ${cx + nh} ${top}" stroke="#3a1606" stroke-opacity="0.45" stroke-width="0.9"/>`;
    // little niches on the lower tiers
    if (i < 4) out += `<path d="M${cx - 3} ${y - 1.5} L ${cx - 3} ${top + tierH * 0.35} Q ${cx} ${top + tierH * 0.12} ${cx + 3} ${top + tierH * 0.35} L ${cx + 3} ${y - 1.5} Z" fill="#2a0c04" opacity="0.55"/>`;
    y = top;
    half = nh;
  }
  // the rounded crown of the tower and its spire
  out += `<path d="M${cx - half} ${y} C ${cx - half} ${y - h * 0.1}, ${cx - half * 0.3} ${y - h * 0.16}, ${cx} ${y - h * 0.2} C ${cx + half * 0.3} ${y - h * 0.16}, ${cx + half} ${y - h * 0.1}, ${cx + half} ${y} Z" fill="url(#${id})"/>`;
  out += `<path d="M${cx - 1.2} ${y - h * 0.19} L ${cx} ${y - h * 0.28} L ${cx + 1.2} ${y - h * 0.19} Z" fill="url(#${id})"/>`;
  // the side away from the sun in shade
  const shade = litLeft ? `M${cx} ${base} L ${cx + w / 2} ${base} L ${cx} ${y - h * 0.2} Z` : `M${cx} ${base} L ${cx - w / 2} ${base} L ${cx} ${y - h * 0.2} Z`;
  out += `<path d="${shade}" fill="#1a0602" opacity="0.32"/>`;
  return out;
}

/** A row of balusters (the temple's balustrade). */
function balustrade(x0, x1, y, h) {
  let out = `<rect x="${x0}" y="${y - 6}" width="${x1 - x0}" height="6" fill="url(#rail)"/>`;
  for (let x = x0 + 6; x < x1 - 4; x += 11) {
    out += `<path d="M${x - 3} ${y + h} L ${x - 3} ${y + h * 0.7} Q ${x - 4.5} ${y + h * 0.45} ${x - 2} ${y + h * 0.3} L ${x - 2} ${y + 2} L ${x + 2} ${y + 2} L ${x + 2} ${y + h * 0.3} Q ${x + 4.5} ${y + h * 0.45} ${x + 3} ${y + h * 0.7} L ${x + 3} ${y + h} Z" fill="url(#baluster)"/>`;
  }
  out += `<rect x="${x0}" y="${y + h}" width="${x1 - x0}" height="7" fill="url(#rail)"/>`;
  return out;
}

/** A carved stone pillar at the side of the picture. */
function pillar(x, w, flip) {
  let out = `<rect x="${x}" y="40" width="${w}" height="${H - 40}" fill="url(#pillar)"/>`;
  for (let y = 58; y < H; y += 26) out += `<path d="M${x} ${y} L ${x + w} ${y}" stroke="#1a0a04" stroke-opacity="0.55" stroke-width="1.2"/>`;
  for (let y = 70; y < H; y += 52) out += `<path d="M${x + w * 0.5} ${y - 12} L ${x + w * 0.5} ${y}" stroke="#1a0a04" stroke-opacity="0.4" stroke-width="1"/>`;
  out += `<rect x="${x - 3}" y="34" width="${w + 6}" height="10" rx="2" fill="url(#pillarCap)"/>`;
  out += `<rect x="${flip ? x : x + w - 4}" y="40" width="4" height="${H - 40}" fill="#ffb060" opacity="0.18"/>`;
  return out;
}

/** A cluster of jungle leaves. */
function leaves(cx, cy, n, size, rot, seed) {
  let out = '';
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * 120 - 60 + rnd() * 20;
    const l = size * (0.7 + rnd() * 0.5);
    const x = cx + (rnd() - 0.5) * size * 0.8;
    const y = cy + (rnd() - 0.5) * size * 0.5;
    out += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)})">
      <path d="M0 0 C ${l * 0.25} ${-l * 0.2}, ${l * 0.75} ${-l * 0.18}, ${l} 0 C ${l * 0.75} ${l * 0.2}, ${l * 0.25} ${l * 0.18}, 0 0 Z" fill="url(#leaf)"/>
      <path d="M0 0 L ${l * 0.95} 0" stroke="#0a2a10" stroke-opacity="0.5" stroke-width="0.7"/>
    </g>`;
  }
  return out;
}

module.exports = {
  width: W,
  height: H,
  scale: 2.5,
  out: 'assets/garuda/scene.webp',
  quality: 86,
  svg: () =>
    L.svg(
      W,
      H,
      `
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="206" cy="170" r="190" fill="url(#sun)"/>
  <g filter="url(#cloudBlur)" opacity="0.55">
    <ellipse cx="96" cy="92" rx="70" ry="7" fill="#ff9ab0"/>
    <ellipse cx="320" cy="78" rx="80" ry="6" fill="#ffb0a0"/>
    <ellipse cx="250" cy="128" rx="90" ry="5" fill="#ffd090"/>
    <ellipse cx="120" cy="140" rx="70" ry="5" fill="#ffc080"/>
  </g>
  <!-- far hills -->
  <path d="M0 205 C 40 190, 80 196, 120 186 C 160 176, 190 190, 230 184 C 270 178, 320 192, 360 182 C 380 178, 400 184, 412 180 L 412 260 L 0 260 Z" fill="url(#hills)"/>
  <!-- the towers -->
  <g>${prang(92, 262, 150, 74, 'stoneL', false)}</g>
  <g>${prang(320, 262, 150, 74, 'stoneR', true)}</g>
  <g opacity="0.85">${prang(40, 262, 96, 46, 'stoneL', false)}${prang(372, 262, 96, 46, 'stoneR', true)}</g>
  <!-- the temple terrace -->
  <rect x="0" y="236" width="${W}" height="${H - 236}" fill="url(#terrace)"/>
  ${balustrade(0, W, 248, 30)}
  <rect x="0" y="282" width="${W}" height="${H - 282}" fill="url(#terraceFront)"/>
  <!-- warm light from the sun on the middle of the terrace -->
  <ellipse cx="206" cy="262" rx="150" ry="40" fill="url(#terraceGlow)"/>
  <!-- pillars at the sides -->
  ${pillar(0, 30, false)}${pillar(W - 30, 30, true)}
  <!-- jungle leaves at the top corners -->
  <g filter="url(#leafShade)">${leaves(30, 22, 14, 46, 40, 7)}${leaves(70, 6, 10, 40, 20, 19)}${leaves(382, 22, 14, 46, 140, 23)}${leaves(342, 6, 10, 40, 160, 31)}</g>
  <path d="M18 30 C 22 70, 14 110, 20 150" stroke="#123a16" stroke-width="2" fill="none" opacity="0.8"/>
  <path d="M394 30 C 390 70, 398 110, 392 150" stroke="#123a16" stroke-width="2" fill="none" opacity="0.8"/>
  <!-- the edges a little darker -->
  <rect width="${W}" height="${H}" fill="url(#vignette)"/>
`,
      `${L.goldDefs()}
  ${L.gradient('sky', [[0, '#241046'], [0.3, '#5a2266'], [0.5, '#a83a6a'], [0.68, '#ec6a48'], [0.82, '#ffae4a'], [1, '#ffd27a']])}
  ${L.radial('sun', [[0, '#fff8d0', 0.95], [0.25, '#ffd070', 0.75], [0.6, '#ff8a40', 0.3], [1, '#ff6a30', 0]])}
  ${L.gradient('hills', [[0, '#5a2a54'], [1, '#2a1028']])}
  ${L.gradient('stoneL', [[0, '#e09a5a'], [0.5, '#a85a2c'], [1, '#5a2a12']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.gradient('stoneR', [[0, '#5a2a12'], [0.5, '#a85a2c'], [1, '#e09a5a']], { x1: 0, y1: 1, x2: 1, y2: 0 })}
  ${L.gradient('terrace', [[0, '#8a4a26'], [1, '#4a2210']])}
  ${L.gradient('terraceFront', [[0, '#6a3418'], [1, '#2a1006']])}
  ${L.radial('terraceGlow', [[0, '#ffc070', 0.45], [1, '#ffc070', 0]])}
  ${L.gradient('rail', [[0, '#d08a50'], [1, '#6a3414']])}
  ${L.gradient('baluster', [[0, '#7a3e1a'], [0.45, '#d49456'], [1, '#6a3414']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('pillar', [[0, '#3a1a0a'], [0.5, '#6a3a1c'], [1, '#2a1006']], { x1: 0, y1: 0, x2: 1, y2: 0 })}
  ${L.gradient('pillarCap', [[0, '#a8682e'], [1, '#4a2410']])}
  ${L.gradient('leaf', [[0, '#3aa83a'], [0.6, '#1a6a22'], [1, '#0a3a12']], { x1: 0, y1: 0, x2: 1, y2: 1 })}
  ${L.radial('vignette', [[0.6, '#000', 0], [1, '#000', 0.55]], { cx: 0.5, cy: 0.45, r: 0.75 })}
  <filter id="cloudBlur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  ${L.dropShadow('leafShade', 3, 3, 0.5)}`
    ),
};
