// The symbols of the reels (100 x 100 units each): the three 7s and the two BARs of the main reels, and the medallions of the bonus reel.
const L = require('./_lib');

const piece = (id, out, build) => ({
  _id: id,
  width: 100,
  height: 100,
  scale: 3,
  out: `assets/turbosevens/${out}.webp`,
  quality: 92,
  svg: () => {
    const g = build();
    return L.svg(100, 100, g.body, g.defs);
  },
});

const flame7 = () => {
  const s = L.seven('a', [[0, '#fff3a0'], [0.35, '#ffb21c'], [0.7, '#ff4a12'], [1, '#c4000e']], { stroke: '#5a0006', rim: '#fff3b0' });
  return { defs: s.defs + L.flameDefs('fa'), body: `<g transform="translate(50 62) scale(0.84) translate(-50 -62)">${L.flames('fa', 1)}</g><g transform="translate(0 -6)">${s.body}</g>` };
};
const red7 = () => {
  const s = L.seven('b', [[0, '#ff8a8a'], [0.3, '#ff2433'], [0.75, '#c1001a'], [1, '#780010']], { stroke: '#3a0008', rim: '#ffd0d0' });
  return { defs: s.defs + L.flameDefs('fb'), body: `<g transform="translate(50 70) scale(0.8 0.66) translate(-50 -70)" opacity="0.95">${L.flames('fb', 0.55)}</g><g transform="translate(0 -3)">${s.body}</g>` };
};
const gold7 = () => {
  const s = L.seven('c', [[0, '#fffbd0'], [0.3, '#ffd84a'], [0.65, '#e09a10'], [1, '#8a5200']], { stroke: '#4a2a00', rim: '#fff9d6' });
  return {
    defs: s.defs + L.radial('gh', [[0, '#ffd24a', 0.35], [1, '#ffd24a', 0]]),
    body: `<circle cx="52" cy="54" r="46" fill="url(#gh)"/>${s.body}
    <path d="M80 14 L82 20 L88 22 L82 24 L80 30 L78 24 L72 22 L78 20 Z" fill="#fff" opacity="0.9"/><path d="M20 70 L21.5 74 L26 75.5 L21.5 77 L20 81 L18.5 77 L14 75.5 L18.5 74 Z" fill="#fff" opacity="0.7"/>`,
  };
};
const green2bar = () => ({
  defs: `${L.gradient('g1', [[0, '#7dff9a'], [0.5, '#12b545'], [1, '#05682a']])}${L.dropShadow('gds', 2, 1.6, 0.6)}`,
  body: `<g filter="url(#gds)">${L.bar('g1', 8, 18, 84, 32, { rim: '#021f0e', text: '#eafff0', outline: '#04541f' })}${L.bar('g1', 8, 52, 84, 32, { rim: '#021f0e', text: '#eafff0', outline: '#04541f' })}</g>`,
});
const blue1bar = () => ({
  defs: `${L.gradient('b1', [[0, '#7fa6ff'], [0.5, '#1f56f0'], [1, '#0a2a9a']])}${L.dropShadow('bds', 2, 1.6, 0.6)}`,
  body: `<g filter="url(#bds)">${L.bar('b1', 6, 28, 88, 44, { rim: '#050f33', text: '#eaf1ff', outline: '#0a2f9e' })}</g>`,
});

// ---- the bonus reel: gold-rimmed medallions
const medal = (id, fill, label, size = 30, { w = 84, h = 60 } = {}) => {
  const cx = 50, cy = 50;
  return {
    defs: `${L.medalGold(id + 'g')}${L.radial(id + 'f', fill, { cx: 0.4, cy: 0.3, r: 0.85 })}${L.dropShadow(id + 'ds', 2.4, 2, 0.6)}${L.bevel(id + 'bv', { rel: 1.4, depth: 3, shine: 0.7 })}`,
    body: `
    <g filter="url(#${id}ds)">
      <ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" fill="url(#${id}g)" filter="url(#${id}bv)"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${w / 2 - 5}" ry="${h / 2 - 5}" fill="#3a1d00"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${w / 2 - 7}" ry="${h / 2 - 7}" fill="url(#${id}f)"/>
      <ellipse cx="${cx}" cy="${cy - h * 0.2}" rx="${w / 2 - 14}" ry="${h * 0.16}" fill="#fff" opacity="0.28"/>
    </g>
    <text x="${cx}" y="${cy + size * 0.36}" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="${size}" fill="url(#${id}t)" stroke="#2a1000" stroke-width="${size * 0.2}" paint-order="stroke" stroke-linejoin="round">${label}</text>
    ${L.gradient(id + 't', [[0, '#fff7c0'], [0.5, '#ffd23a'], [1, '#f08a00']])}`,
  };
};
const x2 = () => medal('m2', [[0, '#9dff8a'], [0.55, '#1ea63a'], [1, '#0a5a1c']], '2x', 30);
const x5 = () => medal('m5', [[0, '#a6c4ff'], [0.55, '#4a52e8'], [1, '#1a1a8a']], '5x', 30);
const x10 = () => medal('m10', [[0, '#ffc08a'], [0.55, '#ee4a12'], [1, '#8a1000']], '10x', 27, { w: 88, h: 64 });
const cash = (id, label, size, extra = '') => {
  const m = medal(id, [[0, '#fff2a0'], [0.55, '#ffc21c'], [1, '#c98600']], label, size, { w: 88, h: 66 });
  return {
    defs: m.defs,
    body: m.body.replace(/<text[\s\S]*<\/text>/, () => `<text x="50" y="${50 + size * 0.36}" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="${size}" fill="#e0101e" stroke="#fff" stroke-width="${size * 0.16}" paint-order="stroke" stroke-linejoin="round">${label}</text><text x="50" y="${50 + size * 0.36}" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="${size}" fill="#e0101e">${label}</text>`) +
      `<text x="50" y="26.5" text-anchor="middle" font-family="Inter" font-weight="900" font-size="7.5" letter-spacing="1.4" fill="#7a3a00">WIN</text><text x="50" y="79" text-anchor="middle" font-family="Inter" font-weight="900" font-size="7.5" letter-spacing="1.4" fill="#7a3a00">WIN</text>${extra}`,
  };
};
const cash2 = () => cash('c2', '$+', 30);
const cash20 = () => cash('c20', '$$+', 25, '<path d="M84 22 L85.5 26 L90 27.5 L85.5 29 L84 33 L82.5 29 L78 27.5 L82.5 26 Z" fill="#fff"/><path d="M14 66 L15 69 L18 70 L15 71 L14 74 L13 71 L10 70 L13 69 Z" fill="#fff"/>');
const respin = () => ({
  defs: `${L.medalGold('rg')}${L.gradient('rd', [[0, '#c78bff'], [0.5, '#6a22c8'], [1, '#2a0a66']], { x1: 0, y1: 0, x2: 0, y2: 1 })}${L.gradient('rb', [[0, '#ff6a50'], [1, '#b40a1a']])}${L.dropShadow('rds', 2.4, 2, 0.6)}${L.bevel('rbv', { rel: 1.3, depth: 2.6, shine: 0.7 })}${L.gradient('rt', [[0, '#fff7c0'], [0.5, '#ffd23a'], [1, '#f08a00']])}`,
  body: `
    <g filter="url(#rds)">
      <path d="M50 4 L90 50 L50 96 L10 50 Z" fill="url(#rg)" stroke="#6a3a00" stroke-width="2" stroke-linejoin="round" filter="url(#rbv)"/>
      <path d="M50 12 L82 50 L50 88 L18 50 Z" fill="url(#rd)"/>
      <path d="M50 12 L82 50 L50 50 Z" fill="#fff" opacity="0.14"/>
      <rect x="12" y="38" width="76" height="24" rx="5" fill="url(#rb)" stroke="#ffd23a" stroke-width="2"/>
      <text x="50" y="55.5" text-anchor="middle" font-family="Inter" font-weight="900" font-style="italic" font-size="15.5" letter-spacing="0.4" fill="url(#rt)" stroke="#4a0008" stroke-width="2.6" paint-order="stroke" stroke-linejoin="round">RESPIN</text>
    </g>`,
});
const empty = () => ({
  defs: `${L.medalGold('eg')}${L.radial('ef', [[0, '#fff7da'], [1, '#e8cf8c']], { cx: 0.5, cy: 0.4, r: 0.8 })}`,
  body: `
    <rect x="12" y="20" width="76" height="60" rx="8" fill="url(#eg)" stroke="#8a5a00" stroke-width="1.6"/>
    <rect x="17" y="25" width="66" height="50" rx="5" fill="url(#ef)" stroke="#b0801e" stroke-width="1"/>
    <path d="M50 33 L62 50 L50 67 L38 50 Z" fill="none" stroke="#c8a24a" stroke-width="2" opacity="0.55"/>
    <path d="M50 40 L56 50 L50 60 L44 50 Z" fill="#d9b45a" opacity="0.45"/>`,
});

module.exports = [
  piece('flame7', 'sym-flame7', flame7),
  piece('red7', 'sym-red7', red7),
  piece('gold7', 'sym-gold7', gold7),
  piece('green2bar', 'sym-green2bar', green2bar),
  piece('blue1bar', 'sym-blue1bar', blue1bar),
  piece('x2', 'b-x2', x2),
  piece('x5', 'b-x5', x5),
  piece('x10', 'b-x10', x10),
  piece('cash2', 'b-cash2', cash2),
  piece('cash20', 'b-cash20', cash20),
  piece('respin', 'b-respin', respin),
  piece('empty', 'b-empty', empty),
];
