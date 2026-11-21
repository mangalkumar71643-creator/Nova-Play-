/** An outward spiral from (cx, cy): `turns` turns, ending at radius r. Returns an SVG path. */
module.exports = function spiral(cx, cy, r, turns = 1.6, dir = 1, start = 0) {
  const pts = [];
  const steps = Math.round(turns * 28);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = start + dir * t * turns * Math.PI * 2;
    const rr = r * (0.12 + 0.88 * t);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return 'M' + pts.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L');
};
