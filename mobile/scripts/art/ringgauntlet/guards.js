// The sentinel in the middle of the wheel: one picture per ring (square / triangle / circle) and the one for a lost round.
const L = require('./_lib');

const piece = (key, state, out) => ({
  _id: out,
  width: 120,
  height: 120,
  scale: 3,
  out: `assets/ringgauntlet/guard-${out}.webp`,
  quality: 92,
  svg: () => {
    const g = L.sentinel('g', key, state);
    return L.svg(120, 120, g.body, g.defs);
  },
});

module.exports = [piece('OUTER', 'ready', 'outer'), piece('MIDDLE', 'ready', 'middle'), piece('INNER', 'ready', 'inner'), piece('OUTER', 'lost', 'lost')];
