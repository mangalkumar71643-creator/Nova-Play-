// Shared drawing helpers of the Teen Patti Club art: the four suits (100 x 100 units) and the gold of the table.
const SUIT_PATHS = {
  S: 'M50 2 C56 22 98 38 98 64 C98 80 86 88 74 88 C64 88 56 82 53 74 C54 84 58 92 66 98 L34 98 C42 92 46 84 47 74 C44 82 36 88 26 88 C14 88 2 80 2 64 C2 38 44 22 50 2 Z',
  H: 'M50 94 C12 64 2 44 2 28 C2 12 14 4 28 4 C38 4 46 10 50 20 C54 10 62 4 72 4 C86 4 98 12 98 28 C98 44 88 64 50 94 Z',
  D: 'M50 2 C58 22 78 40 96 50 C78 60 58 78 50 98 C42 78 22 60 4 50 C22 40 42 22 50 2 Z',
};
// A club is three round leaves and a stem.
const CLUB = (fill) => `<circle cx="50" cy="27" r="24" fill="${fill}"/><circle cx="26" cy="62" r="24" fill="${fill}"/><circle cx="74" cy="62" r="24" fill="${fill}"/><path d="M50 52 C50 74 46 88 34 98 L66 98 C54 88 50 74 50 52 Z" fill="${fill}"/>`;

/** One suit ('S', 'H', 'C', 'D') as SVG markup, its box's top-left at (x, y) and `size` units wide. */
function suit(kind, x, y, size, fill) {
  const k = size / 100;
  const body = kind === 'C' ? CLUB(fill) : `<path d="${SUIT_PATHS[kind]}" fill="${fill}"/>`;
  return `<g transform="translate(${x} ${y}) scale(${k})">${body}</g>`;
}

const GOLD = `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#f0c968"/><stop offset=".7" stop-color="#c58f33"/><stop offset="1" stop-color="#8a5a18"/></linearGradient>`;

module.exports = { suit, SUIT_PATHS, GOLD };
