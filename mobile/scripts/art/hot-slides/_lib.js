// Shared pieces of the hot-game slides for the HOME SLIDER (Admin → Home Slider): 900 x 640, transparent, standing on the app's red
// stage (the app draws its own Play button under a slide). Our own art only.
//
// The admin panel's "Remove background" step (on by default, cleanSlideImage in admin.html) takes the average colour of the picture's
// border as the background (black, for a picture whose border is fully transparent) and clears every pixel near it, or white /
// light grey, that it can reach from the outside. So every slide keeps: a fully transparent border (svg() fades the outer 30 px out),
// gold or coloured outer edges, light that fades out well inside the picture, and shadows that are red-brown, never black or near
// black (a bevel darkens the lower edges of a shape, so free-standing lettering gets an unbevelled red-brown rim around it).
const fs = require('fs');
const path = require('path');
const G = require('../garuda/_lib');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.ttf': 'font/ttf' };
/** A file of the app (path from the mobile folder) as a data URL. */
const asset = (rel) => `data:${MIME[path.extname(rel)]};base64,` + fs.readFileSync(path.join(ROOT, rel)).toString('base64');
/** SVG markup as a data URL (for <image>). */
const svgImage = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

const W = 900;
const H = 640;
/** The colour of every shadow: red-brown, far enough from black that the panel's background remover leaves it. */
const SHADOW = '#4A0C08';

/** The app's Montserrat (900 and 800) for the slide's lettering. */
const fonts = () => `<style>
  @font-face { font-family: 'SF'; font-weight: 900; src: url(${asset('assets/fonts/Montserrat_900Black.ttf')}) format('truetype'); }
  @font-face { font-family: 'SF'; font-weight: 800; src: url(${asset('assets/fonts/Montserrat_800ExtraBold.ttf')}) format('truetype'); }
</style>`;

/** Filters and gradients every slide uses: brown shadows (never black), sparkle glow, the gold of the games. */
const baseDefs = () => `${fonts()}${G.goldDefs()}
  <filter id="sShadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="7" stdDeviation="6" flood-color="${SHADOW}" flood-opacity="0.7"/></filter>
  <filter id="sShadowS" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="3" stdDeviation="2.5" flood-color="${SHADOW}" flood-opacity="0.7"/></filter>
  <filter id="edgeBlur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>
  <mask id="edgeFade" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect x="24" y="24" width="${W - 48}" height="${H - 48}" fill="#fff" filter="url(#edgeBlur)"/></mask>
  <filter id="sGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="soft8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
  <linearGradient id="nameGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFBE0"/><stop offset="0.3" stop-color="#FFE27A"/><stop offset="0.62" stop-color="#F0A820"/><stop offset="1" stop-color="#C87A08"/></linearGradient>
  <linearGradient id="plateRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D0213A"/><stop offset="0.5" stop-color="#930F24"/><stop offset="1" stop-color="#5C0814"/></linearGradient>
  <linearGradient id="plateBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2F7BFF"/><stop offset="0.5" stop-color="#1446B8"/><stop offset="1" stop-color="#0A2470"/></linearGradient>
  <linearGradient id="amountGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF9D6"/><stop offset="0.35" stop-color="#FFE070"/><stop offset="0.7" stop-color="#F2A91E"/><stop offset="1" stop-color="#FFD45E"/></linearGradient>`;

/** A soft round light (fades to nothing at r). */
const glow = (id, cx, cy, r, color, opacity = 0.7) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="0.55" stop-color="${color}" stop-opacity="${opacity * 0.4}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;

/** A four-point sparkle (gold, never white: a white speck at the edge would be cleared by the panel). */
const spark = (cx, cy, r, rot = 0, fill = '#FFD84A') =>
  `<path transform="translate(${cx} ${cy}) rotate(${rot})" d="M0 ${-r} C${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r} 0 C${r * 0.12} ${r * 0.12} ${r * 0.12} ${r * 0.12} 0 ${r} C${-r * 0.12} ${r * 0.12} ${-r * 0.12} ${r * 0.12} ${-r} 0 C${-r * 0.12} ${-r * 0.12} ${-r * 0.12} ${-r * 0.12} 0 ${-r} Z" fill="${fill}" filter="url(#sGlow)"/>`;

/** A pill with a gold rim: fill is a gradient id (plateRed, plateBlue...), text centred. */
function pill(cx, cy, w, h, fill, text, { size = 28, color = '#FFE9B0', stroke = '#3A0008' } = {}) {
  const x = cx - w / 2;
  const y = cy - h / 2;
  return `<g filter="url(#sShadow)">
    <g filter="url(#gBev)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="url(#gGold)"/></g>
    <rect x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}" rx="${(h - 14) / 2}" fill="url(#${fill})"/>
    <rect x="${x + 18}" y="${y + 10}" width="${w - 36}" height="${(h - 14) * 0.36}" rx="${(h - 14) * 0.18}" fill="#fff" opacity="0.14"/>
    <text x="${cx}" y="${cy + size * 0.35}" text-anchor="middle" font-family="SF" font-weight="900" font-size="${size}" letter-spacing="1" fill="${color}" stroke="${stroke}" stroke-width="5" paint-order="stroke">${text}</text>
  </g>`;
}

/** Big lettering: gold face, dark rim, bevel (font SF 900), and an unbevelled red-brown rim around it all (see the top). */
const bigText = (text, x, y, size, { fill = 'nameGold', stroke = '#4A1C04', sw = 7, spacing = 2, anchor = 'middle', italic = false, rim = '#7A240C' } = {}) => {
  const attrs = `x="${x}" y="${y}" text-anchor="${anchor}" font-family="SF" font-weight="900" font-size="${size}" letter-spacing="${spacing}"${italic ? ' font-style="italic"' : ''} stroke-linejoin="round"`;
  return `<g filter="url(#sShadow)"><text ${attrs} fill="${rim}" stroke="${rim}" stroke-width="${sw + 5}">${text}</text><g filter="url(#gBev)"><text ${attrs} fill="url(#${fill})" stroke="${stroke}" stroke-width="${sw}" paint-order="stroke">${text}</text></g></g>`;
};

/** The Mines game's own pieces (scripts/art/mines/tiles.js) as images, their black drop shadows turned red-brown. */
const minesPieces = () =>
  Object.fromEntries(require('../mines/tiles').map((p) => [p._id, svgImage(p.svg().replace(/flood-color="#000"/g, `flood-color="${SHADOW}"`))]));

/** A whole slide: its art inside the soft edge mask, so the picture's border is always fully transparent. */
const svg = (body, defs = '') => G.svg(W, H, `<g mask="url(#edgeFade)">${body}</g>`, baseDefs() + defs);

module.exports = { G, ROOT, SHADOW, asset, svgImage, W, H, svg, glow, spark, pill, bigText, minesPieces };
