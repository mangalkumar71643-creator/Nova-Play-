#!/usr/bin/env python3
"""
Renders the premium full-screen backgrounds of the game screens, in the style of the Home screen's background:
a deep, dark base with the game's own colour, soft light arcs along the screen edges, drifting sparks, haze, a glow on
the floor and a vignette that keeps the middle calm so the game itself stays easy to read.

  python3 mobile/scripts/backdrops/make-backdrops.py [theme ...]        # all themes when none is named

Writes mobile/assets/backdrops/<theme>.webp (portrait, 720 x 1560) and <theme>-wide.webp (landscape, 1560 x 720) for the
themes that have one, and mobile/src/theme/backdrops.ts (the require() index the app imports). Everything is drawn here
(no third-party art) and is deterministic: the same inputs always give the same files.
Needs: pip install numpy scipy pillow
"""
import os
import sys
import zlib

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter

HERE = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(MOBILE, "assets", "backdrops")
INDEX = os.path.join(MOBILE, "src", "theme", "backdrops.ts")


def rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255.0


def smooth(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


# name: base (top, middle, bottom), accent (arcs, sparks, floor light), accent2 (haze, bokeh), glow (colour, x, y, size),
#       motifs (drawn in this order), wide (also render a landscape version)
THEMES = {
    "crimson":       dict(base=("#33070D", "#1D0408", "#0B0204"), accent="#FFC35A", accent2="#9A1426", glow=("#B3101F", .5, .30, .55), motifs=["haze", "dots", "arcs", "sparks", "horizon"], wide=True),
    "emerald":       dict(base=("#073321", "#04201A", "#020D08"), accent="#F2CE6A", accent2="#0E7A45", glow=("#12A058", .5, .34, .60), motifs=["felt", "haze", "arcs", "sparks", "horizon"], wide=True),
    "sapphire":      dict(base=("#0A2160", "#071238", "#030818"), accent="#8CBBFF", accent2="#2457D6", glow=("#2F6BFF", .5, .32, .60), motifs=["haze", "dots", "arcs", "sparks", "horizon"], wide=True),
    "ruby":          dict(base=("#45090F", "#25060A", "#0E0306"), accent="#FF7A5C", accent2="#B01A22", glow=("#D01A28", .5, .36, .60), motifs=["felt", "haze", "arcs", "sparks", "horizon"], wide=True),
    "teal-neon":     dict(base=("#053844", "#04212C", "#020C13"), accent="#46F0FF", accent2="#0F8FA0", glow=("#14B8C4", .5, .30, .60), motifs=["haze", "grid", "arcs", "sparks", "horizon"]),
    "violet-space":  dict(base=("#241050", "#120628", "#050213"), accent="#B98CFF", accent2="#FF4DD8", glow=("#7B3CE0", .5, .30, .60), motifs=["stars", "haze", "arcs", "sparks", "horizon"]),
    "indigo-space":  dict(base=("#0D1850", "#080C2C", "#02030F"), accent="#74AEFF", accent2="#5B6CFF", glow=("#3050E0", .5, .30, .60), motifs=["stars", "haze", "arcs", "sparks", "horizon"]),
    "ocean":         dict(base=("#06405A", "#032334", "#010B14"), accent="#52E6FF", accent2="#0A86B0", glow=("#12A5D0", .5, .24, .60), motifs=["rays", "bubbles", "haze", "arcs", "horizon"]),
    "pitch":         dict(base=("#063D22", "#04230F", "#010F08"), accent="#C8FF8A", accent2="#12A04A", glow=("#14B85A", .5, .30, .60), motifs=["rays", "haze", "arcs", "sparks", "horizon"]),
    "desert-gold":   dict(base=("#47270A", "#2A1606", "#110902"), accent="#FFCB4A", accent2="#B8741A", glow=("#E69A1E", .5, .32, .60), motifs=["rays", "haze", "dots", "arcs", "sparks", "horizon"]),
    "candy":         dict(base=("#561260", "#31093F", "#13041E"), accent="#FF86D8", accent2="#FF3DA8", glow=("#E040C8", .5, .30, .60), motifs=["bubbles", "haze", "arcs", "sparks", "horizon"]),
    "olympus":       dict(base=("#143880", "#0B2150", "#050C26"), accent="#FFD97A", accent2="#5E9CFF", glow=("#3C7CF0", .5, .26, .62), motifs=["rays", "haze", "arcs", "sparks", "horizon"]),
    "moonlight":     dict(base=("#0E1A44", "#08102A", "#02040F"), accent="#D2E0FF", accent2="#3C54B0", glow=("#5C78D8", .5, .24, .55), motifs=["stars", "haze", "arcs", "sparks", "horizon"]),
    "steel":         dict(base=("#212C3C", "#131A25", "#07090E"), accent="#FFC21A", accent2="#36506E", glow=("#4C86C0", .5, .30, .55), motifs=["haze", "dots", "arcs", "sparks", "horizon"]),
    "plum":          dict(base=("#450B3C", "#270623", "#10030F"), accent="#FFA0E0", accent2="#B0208C", glow=("#C02CA0", .5, .32, .60), motifs=["haze", "dots", "arcs", "sparks", "horizon"]),
    "neon-magenta":  dict(base=("#34053E", "#1B0422", "#08020E"), accent="#FF48E0", accent2="#3DF2FF", glow=("#D020C0", .5, .32, .60), motifs=["stars", "haze", "arcs", "sparks", "horizon"]),
    "asphalt":       dict(base=("#242830", "#14161B", "#07080A"), accent="#FFD23D", accent2="#4A5568", glow=("#8A94A8", .5, .30, .50), motifs=["haze", "dots", "arcs", "sparks", "horizon"]),
    "noir-red":      dict(base=("#1A0A0E", "#0E0508", "#050203"), accent="#FF4D5E", accent2="#8A1020", glow=("#C4172C", .5, .34, .55), motifs=["haze", "dots", "arcs", "sparks", "horizon"]),
}


class Canvas:
    def __init__(self, w, h, seed):
        self.w, self.h = w, h
        self.rng = np.random.default_rng(seed)
        self.Y, self.X = np.mgrid[0:h, 0:w].astype(np.float32)
        self.img = np.zeros((h, w, 3), np.float32)

    # ---- helpers
    def add(self, layer, color, strength=1.0):
        self.img += layer[..., None] * (color * strength)[None, None, :]

    def screen(self, rgb_layer):
        """'Screen' blend of an RGB float layer (so overlapping lights never go past white)."""
        self.img = 1.0 - (1.0 - np.clip(self.img, 0, 1)) * (1.0 - np.clip(rgb_layer, 0, 1))

    def noise_field(self, scale, seed_off=0):
        """Smooth random field in [-1, 1], features about `scale` px across."""
        sh, sw = max(4, int(self.h / scale)), max(4, int(self.w / scale))
        r = np.random.default_rng(int(self.rng.integers(0, 2 ** 31)) + seed_off)
        f = gaussian_filter(r.standard_normal((sh, sw)).astype(np.float32), 1.2, mode="wrap")
        f /= np.abs(f).max() + 1e-6
        return np.asarray(Image.fromarray(f).resize((self.w, self.h), Image.BICUBIC), np.float32)


def base_gradient(c, t):
    top, mid, bot = (rgb(x) * 0.78 for x in t["base"])
    v = (c.Y / (c.h - 1))[..., None]
    k = np.where(v < 0.5, v / 0.5, (v - 0.5) / 0.5)
    c.img = np.where(v < 0.5, top + (mid - top) * k, mid + (bot - mid) * k).astype(np.float32)
    gc, gx, gy, gs = t["glow"]
    d2 = ((c.X / c.w - gx) / gs) ** 2 + ((c.Y / c.h - gy) / (gs * 0.9 * c.w / c.h * 1.9)) ** 2
    c.add(np.exp(-d2 * 2.6).astype(np.float32), rgb(gc), 0.30)


def haze(c, t):
    """Smoky colour drifting in from the sides."""
    a2 = rgb(t["accent2"])
    f = (c.noise_field(c.h / 7.0) * 0.6 + c.noise_field(c.h / 16.0) * 0.4)
    side = np.maximum(np.exp(-(c.X / (c.w * 0.30)) ** 2), np.exp(-((c.w - c.X) / (c.w * 0.30)) ** 2))
    band = np.exp(-((c.Y / c.h - 0.46) / 0.30) ** 2)
    layer = np.clip(0.55 + f * 0.75, 0, 1.2) * side * band
    c.add(layer.astype(np.float32), a2, 0.34)


def dots(c, t):
    """Fine halftone dots fading out from the top corners (as on the Home screen)."""
    p = 9.0
    pat = (np.cos(2 * np.pi * c.X / p) + np.cos(2 * np.pi * c.Y / p))
    pat = smooth(pat, 0.9, 1.9)
    r1 = np.hypot(c.X, c.Y) / (c.w * 0.62)
    r2 = np.hypot(c.w - c.X, c.Y) / (c.w * 0.62)
    mask = np.maximum(1 - r1, 1 - r2).clip(0, 1) ** 1.4
    c.add((pat * mask).astype(np.float32), rgb(t["accent"]), 0.16)


def felt(c, t):
    """A woven cloth texture under a soft spot of light."""
    w1 = 0.5 + 0.5 * np.sin((c.X + c.Y) * 1.7)
    w2 = 0.5 + 0.5 * np.sin((c.X - c.Y) * 1.7)
    tex = (w1 * w2).astype(np.float32)
    spot = np.exp(-(((c.X / c.w - 0.5) / 0.62) ** 2 + ((c.Y / c.h - 0.42) / 0.5) ** 2) * 1.6).astype(np.float32)
    c.add(tex * (0.35 + 0.65 * spot), rgb(t["accent2"]), 0.09)


def arcs(c, t):
    """Nested curved light lines along both edges, bright in the middle of their run (the Home screen's gold arcs)."""
    acc = rgb(t["accent"])
    hot = acc + (1 - acc) * 0.55
    layer = np.zeros_like(c.img)
    wash = np.zeros((c.h, c.w), np.float32)
    cy = c.h * 0.52
    sc = c.h / 1560.0 if c.w > c.h else 1.0
    # (x of the arc at its middle, half-length, strength, line width)
    specs = [(62 * sc * 1.5, 820 * sc, 1.00, 2.4), (104 * sc * 1.5, 760 * sc, 0.80, 1.9), (146 * sc * 1.5, 700 * sc, 0.58, 1.5), (186 * sc * 1.5, 640 * sc, 0.36, 1.2)]
    for side in (0, 1):
        for x0, half, st, wd in specs:
            k = x0 / (half ** 2)
            dy = c.Y - cy
            xc = x0 - k * dy ** 2
            xx = c.X if side == 0 else (c.w - 1 - c.X)
            slope = 2 * k * dy
            d = np.abs(xx - xc) / np.sqrt(1 + slope ** 2)
            along = smooth(1 - np.abs(dy) / half, 0.0, 0.5)
            along = along * (0.80 + 0.20 * np.cos(dy / 80.0 + side * 2.0))
            vpos = c.Y / c.h
            along = along * smooth(vpos, 0.03, 0.18) * (1.0 - 0.90 * smooth(vpos, 0.66, 0.86))
            core = np.exp(-(d / wd) ** 2)
            glow = 0.70 * np.exp(-d / 8.0) + 0.38 * np.exp(-d / 26.0) + 0.16 * np.exp(-d / 80.0)
            inten = (core * 1.0 + glow * 0.62) * along * st
            layer += inten[..., None] * (hot * core[..., None] + acc * (1 - core[..., None]))
            # light spilling inwards from the line (stronger on its inner side)
            inner = np.clip(xx - xc, 0, None)
            wash += (np.exp(-inner / 70.0) * along * st * (xx >= xc)).astype(np.float32)
    c.screen(layer * 0.95)
    c.add(np.clip(wash, 0, 1.6) * 0.5, rgb(t["accent2"]), 0.16)


def disc_layer(c, pts, soft=0.8, ss=2):
    """pts: list of (x, y, radius, (r, g, b) brightness). Returns an RGB float layer."""
    im = Image.new("RGB", (c.w * ss, c.h * ss), (0, 0, 0))
    d = ImageDraw.Draw(im)
    for x, y, r, col in pts:
        cc = tuple(int(np.clip(v, 0, 1) * 255) for v in col)
        d.ellipse((x * ss - r * ss, y * ss - r * ss, x * ss + r * ss, y * ss + r * ss), fill=cc)
    im = im.resize((c.w, c.h), Image.LANCZOS)
    if soft > 0:
        im = im.filter(ImageFilter.GaussianBlur(soft))
    return np.asarray(im, np.float32) / 255.0


def sparks(c, t):
    r = c.rng
    acc, hot = rgb(t["accent"]), None
    hot = acc + (1 - acc) * 0.6
    n = int(230 * c.w * c.h / (720 * 1560))
    # more of them towards the sides and the lower half
    xs = np.where(r.random(n) < 0.72, np.where(r.random(n) < 0.5, r.beta(1.0, 4.0, n), 1 - r.beta(1.0, 4.0, n)), r.random(n)) * c.w
    ys = (r.beta(1.15, 0.85, n)) * c.h
    sizes = np.exp(r.uniform(np.log(0.7), np.log(2.8), n))
    bright = r.uniform(0.25, 1.0, n) ** 1.3
    pts = [(xs[i], ys[i], sizes[i], (acc * 0.6 + hot * 0.4) * bright[i]) for i in range(n)]
    layer = disc_layer(c, pts, soft=0.6)
    # a few bigger glowing ones
    big = [(r.random() * c.w, r.random() * c.h, r.uniform(2.6, 4.4), hot * r.uniform(0.7, 1.0)) for _ in range(14)]
    bl = disc_layer(c, big, soft=1.0)
    glow = gaussian_filter(bl, (7, 7, 0)) * 1.6
    c.screen(layer * 0.95 + bl * 0.9 + glow * 0.5)
    # embers with a short trail
    im = Image.new("RGB", (c.w * 2, c.h * 2), (0, 0, 0))
    d = ImageDraw.Draw(im)
    for _ in range(46):
        x, y = r.random() * c.w, r.random() * c.h
        ang = np.deg2rad(r.uniform(-115, -65))
        ln = r.uniform(7, 26)
        b = r.uniform(0.25, 0.8)
        steps = 6
        for s in range(steps):
            f0, f1 = s / steps, (s + 1) / steps
            col = tuple(int(v * 255 * b * (1 - f0)) for v in hot)
            d.line((2 * (x - np.cos(ang) * ln * f0), 2 * (y - np.sin(ang) * ln * f0), 2 * (x - np.cos(ang) * ln * f1), 2 * (y - np.sin(ang) * ln * f1)), fill=col, width=2)
    im = im.resize((c.w, c.h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.5))
    c.screen(np.asarray(im, np.float32) / 255.0 * 0.9)


def stars(c, t):
    r = c.rng
    n = 420
    xs, ys = r.random(n) * c.w, (r.random(n) ** 1.2) * c.h
    sizes = np.exp(r.uniform(np.log(0.5), np.log(1.7), n))
    bright = r.uniform(0.15, 1.0, n) ** 1.8
    tint = np.array([0.82, 0.88, 1.0], np.float32)
    layer = disc_layer(c, [(xs[i], ys[i], sizes[i], tint * bright[i]) for i in range(n)], soft=0.35)
    c.screen(layer * 0.9)
    # a few flares
    im = Image.new("RGB", (c.w * 2, c.h * 2), (0, 0, 0))
    d = ImageDraw.Draw(im)
    acc = rgb(t["accent"])
    for _ in range(9):
        x, y, ln = r.random() * c.w, r.random() * c.h * 0.8, r.uniform(8, 20)
        col = tuple(int(v * 255 * 0.8) for v in (acc + (1 - acc) * 0.5))
        d.line((2 * (x - ln), 2 * y, 2 * (x + ln), 2 * y), fill=col, width=2)
        d.line((2 * x, 2 * (y - ln), 2 * x, 2 * (y + ln)), fill=col, width=2)
    im = im.resize((c.w, c.h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.8))
    c.screen(np.asarray(im, np.float32) / 255.0 * 0.85)
    # nebula
    a2 = rgb(t["accent2"])
    f = (c.noise_field(c.h / 5.0) * 0.7 + c.noise_field(c.h / 12.0) * 0.3)
    mask = np.exp(-(((c.Y / c.h - 0.22) / 0.26) ** 2)) * (0.45 + 0.55 * np.exp(-((c.X / c.w - 0.7) / 0.5) ** 2))
    c.add((np.clip(f * 0.5 + 0.35, 0, 1) * mask).astype(np.float32), a2, 0.20)


def rays(c, t):
    """Soft fan of light from the top centre."""
    ang = np.arctan2(c.X - c.w * 0.5, -(c.Y + c.h * 0.06))
    n = 11
    fan = (0.5 + 0.5 * np.cos(ang * n * 2.2)) ** 3
    fall = np.exp(-(np.hypot(c.X - c.w * 0.5, c.Y + c.h * 0.06) / (c.h * 0.7)) ** 2)
    c.add((fan * fall).astype(np.float32), rgb(t["accent"]), 0.10)


def bubbles(c, t):
    r = c.rng
    acc = rgb(t["accent"])
    n = 26
    pts = []
    for _ in range(n):
        x = r.random() * c.w
        y = r.random() * c.h
        rad = np.exp(r.uniform(np.log(6), np.log(44)))
        pts.append((x, y, rad, acc * r.uniform(0.05, 0.11)))
    layer = disc_layer(c, pts, soft=2.2)
    ring = np.zeros_like(layer)
    im = Image.new("RGB", (c.w * 2, c.h * 2), (0, 0, 0))
    d = ImageDraw.Draw(im)
    for x, y, rad, col in pts:
        d.ellipse((2 * (x - rad), 2 * (y - rad), 2 * (x + rad), 2 * (y + rad)), outline=tuple(int(min(1, v * 5) * 255) for v in col), width=2)
    ring = np.asarray(im.resize((c.w, c.h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255.0
    c.screen(layer + ring * 0.8)


def grid(c, t):
    """Faint perspective floor grid under the horizon."""
    acc = rgb(t["accent"])
    hz = c.h * 0.66
    below = (c.Y > hz).astype(np.float32)
    depth = np.clip((c.Y - hz) / (c.h - hz), 0, 1)
    vx = (c.X - c.w * 0.5) / (0.05 + depth * 1.4 * c.w)
    vl = np.exp(-((vx * 14 - np.round(vx * 14)) / 0.07) ** 2)
    hl = np.exp(-(((depth ** 1.7) * 14 - np.round((depth ** 1.7) * 14)) / 0.06) ** 2)
    c.add(((vl + hl) * below * depth ** 0.8).astype(np.float32), acc, 0.07)


def horizon(c, t):
    """A thin line of light low on the screen with its glow spreading onto the floor."""
    acc = rgb(t["accent"])
    hot = acc + (1 - acc) * 0.5
    y0 = c.h * 0.935
    bell = np.exp(-(((c.X / c.w) - 0.5) / 0.30) ** 2)
    core = np.exp(-((c.Y - y0) / 1.4) ** 2) * bell
    glow = np.exp(-np.abs(c.Y - y0) / 16.0) * bell * 0.42 + np.exp(-np.abs(c.Y - y0) / 70.0) * bell * 0.20
    floor = np.exp(-np.clip(c.Y - y0, 0, None) / 90.0) * (c.Y >= y0) * bell * 0.16
    layer = core[..., None] * hot + (glow + floor)[..., None] * acc
    c.screen(layer * 0.72)


def finish(c, seed):
    # vignette keeps the middle calm and the corners deep
    nx, ny = (c.X / c.w - 0.5) / 0.5, (c.Y / c.h - 0.5) / 0.5
    r = np.sqrt(nx ** 2 * 0.9 + ny ** 2 * 0.72)
    vig = 1.0 - 0.60 * smooth(r, 0.55, 1.25)
    img = np.clip(c.img, 0, 1) * vig[..., None]
    # gentle film grain, then 8 bit with dither (no banding in the dark gradients)
    g = np.random.default_rng(seed).normal(0, 0.007, (c.h, c.w, 1)).astype(np.float32)
    img = np.clip(img + g, 0, 1)
    return Image.fromarray((img * 255 + np.random.default_rng(seed + 1).random(img.shape)).clip(0, 255).astype(np.uint8), "RGB")


MOTIFS = dict(haze=haze, dots=dots, felt=felt, arcs=arcs, sparks=sparks, stars=stars, rays=rays, bubbles=bubbles, grid=grid, horizon=horizon)


def render(name, wide=False):
    t = THEMES[name]
    seed = zlib.crc32(name.encode()) & 0x7FFFFFFF
    w, h = (1560, 720) if wide else (720, 1560)
    c = Canvas(w, h, seed)
    base_gradient(c, t)
    for m in t["motifs"]:
        MOTIFS[m](c, t)
    return finish(c, seed)


def write_index(done):
    lines = [
        "// GENERATED by mobile/scripts/backdrops/make-backdrops.py - do not edit by hand.",
        "// Full-screen backgrounds of the game screens (see components/GameBackdrop).",
        "",
        "export type BackdropTheme =",
    ]
    lines += [f"  | '{n}'" for n in THEMES]
    lines[-1] += ";"
    lines += ["", "/** The picture for each theme (portrait). */", "export const BACKDROPS: Record<BackdropTheme, number> = {"]
    lines += [f"  '{n}': require('../../assets/backdrops/{n}.webp')," for n in THEMES]
    lines += ["};", "", "/** Landscape versions, for the sideways games. */", "export const BACKDROPS_WIDE: Partial<Record<BackdropTheme, number>> = {"]
    lines += [f"  '{n}': require('../../assets/backdrops/{n}-wide.webp')," for n in THEMES if THEMES[n].get("wide")]
    lines += ["};", "", "/** The colour shown for the instant before a picture is ready (its darkest top colour). */", "export const BACKDROP_BASE: Record<BackdropTheme, string> = {"]
    for n, t in THEMES.items():
        top = rgb(t["base"][1]) * 0.78
        lines.append("  '%s': '#%02X%02X%02X'," % ((n,) + tuple(int(round(v * 255)) for v in top)))
    lines += ["};", ""]
    with open(INDEX, "w") as fh:
        fh.write("\n".join(lines))


def main():
    names = [a for a in sys.argv[1:] if not a.startswith("-")] or list(THEMES)
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for name in names:
        for wide in ((False, True) if THEMES[name].get("wide") else (False,)):
            im = render(name, wide)
            path = os.path.join(OUT, f"{name}{'-wide' if wide else ''}.webp")
            im.save(path, "WEBP", quality=80, method=6)
            total += os.path.getsize(path)
            print(f"{os.path.basename(path):22s} {os.path.getsize(path) // 1024} KB")
    if len(sys.argv) <= 1:
        write_index(names)
    print(f"done, {total // 1024} KB")


if __name__ == "__main__":
    main()
