// A toggle switch: the steel hex nut with its collar (one picture) and the chrome lever (another, so the app can swing it).
// The lever picture is twice as tall as the lever, with the pivot in the middle, so turning the picture turns the lever about its pivot.
function hexFaces(cx, cy, r) {
  let out = '';
  const shades = ['#b9babd', '#8f9094', '#5d5e62', '#3c3d40', '#56575b', '#9fa0a4'];
  for (let i = 0; i < 6; i++) {
    const a0 = (Math.PI / 3) * i - Math.PI / 6;
    const a1 = a0 + Math.PI / 3;
    const p = (a, k) => `${(cx + Math.cos(a) * r * k).toFixed(2)},${(cy + Math.sin(a) * r * k * 0.9).toFixed(2)}`;
    out += `<path d="M${p(a0, 1)} L${p(a1, 1)} L${p(a1, 0.8)} L${p(a0, 0.8)} Z" fill="${shades[i]}" stroke="#2a2b2d" stroke-width="1" stroke-linejoin="round"/>`;
  }
  return out;
}

const nut = () => `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150">
  <defs>
    <radialGradient id="top" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#e6e7ea"/><stop offset=".5" stop-color="#9b9ca0"/><stop offset="1" stop-color="#4a4b4e"/></radialGradient>
    <radialGradient id="collar" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#f2f3f5"/><stop offset=".55" stop-color="#a7a8ac"/><stop offset="1" stop-color="#5a5b5f"/></radialGradient>
    <radialGradient id="hole" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#050505"/><stop offset="1" stop-color="#2c2d2f"/></radialGradient>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity=".85"/></filter>
  </defs>
  <g filter="url(#drop)">
    <path d="M75 12 L 128 41 L 128 104 L 75 134 L 22 104 L 22 41 Z" fill="#26272a"/>
    ${hexFaces(75, 74, 62)}
    <ellipse cx="75" cy="74" rx="50" ry="46" fill="url(#top)" stroke="#2c2d30" stroke-width="1.4"/>
    <ellipse cx="75" cy="74" rx="38" ry="35" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/>
    <ellipse cx="75" cy="76" rx="31" ry="28" fill="#2b2c2f"/>
    <ellipse cx="75" cy="73" rx="29" ry="26" fill="url(#collar)" stroke="#e9eaed" stroke-opacity=".5" stroke-width="1"/>
    <ellipse cx="75" cy="76" rx="15" ry="13" fill="url(#hole)"/>
    <ellipse cx="75" cy="76" rx="15" ry="13" fill="none" stroke="#000" stroke-opacity=".8" stroke-width="2"/>
  </g>
</svg>`;

const lever = () => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="400" viewBox="0 0 64 400">
  <defs>
    <linearGradient id="chrome" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3a3b3e"/><stop offset=".2" stop-color="#bdbec2"/><stop offset=".38" stop-color="#ffffff"/><stop offset=".6" stop-color="#9c9da1"/><stop offset=".85" stop-color="#4b4c4f"/><stop offset="1" stop-color="#2a2b2d"/>
    </linearGradient>
    <radialGradient id="tip" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#b5b6ba"/><stop offset="1" stop-color="#55565a"/></radialGradient>
    <filter id="drop" x="-40%" y="-5%" width="180%" height="115%"><feDropShadow dx="3" dy="5" stdDeviation="3.5" flood-color="#000" flood-opacity=".7"/></filter>
  </defs>
  <g filter="url(#drop)">
    <!-- pivot ball -->
    <circle cx="32" cy="200" r="14" fill="url(#tip)"/>
    <!-- the lever: slim at the pivot, fatter at the end -->
    <path d="M23 200 L 41 200 L 46 322 Q 47 350 32 352 Q 17 350 18 322 Z" fill="url(#chrome)"/>
    <path d="M26 204 L 24.5 322" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round" fill="none"/>
    <ellipse cx="29" cy="334" rx="6" ry="13" fill="#fff" opacity=".35"/>
    <path d="M18.4 326 Q 32 338 45.6 326" stroke="#000" stroke-opacity=".25" stroke-width="2" fill="none"/>
  </g>
</svg>`;

module.exports = [
  { _id: 'nut', width: 150, height: 150, scale: 2, svg: nut, out: 'assets/redbutton/toggle-nut.webp' },
  { _id: 'lever', width: 64, height: 400, scale: 2, svg: lever, out: 'assets/redbutton/toggle-lever.webp' },
].map((p) => ({ quality: 92, ...p }));
