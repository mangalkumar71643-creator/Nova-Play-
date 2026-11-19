#!/usr/bin/env python3
"""
Builds every NovaPlay logo file from the logo the app's owner supplied, mobile/assets/brand/novaplay-logo.png
(1254 x 1254, black background, red neon rounded-square frame, the "N" ribbon emblem in a red ring, the
"NOVA PLAY" wordmark and a red arc).

  python3 mobile/scripts/brand/make-logo-assets.py            # write everything
  python3 mobile/scripts/brand/make-logo-assets.py --preview /tmp/sheet.png   # also a contact sheet to look at

The logo is black with glowing red/white shapes, so the shapes are cut out of the black by brightness (black -> clear,
glow -> soft red edge) and every layer is resampled straight from the 1254 px master (never from another output).

What it writes (relative to the repository root):
  mobile/assets/icon.png                      the logo tile (frame included), opaque, 1024 px: store / web / iOS icon
  mobile/assets/android-icon-foreground.png   adaptive icon foreground: wordmark + emblem, no frame, in the safe zone
  mobile/assets/android-icon-monochrome.png   its one-colour version (Android 13 themed icons)
  mobile/assets/android-icon-background.png   adaptive icon background (black with a faint red glow at the edges)
  mobile/assets/splash-icon.png               the same artwork on a transparent square (512 px)
  mobile/assets/favicon.png                   48 px browser icon (black tile + emblem)
  mobile/assets/novaplay-badge.webp           the emblem alone, 200 px, for the top bar / invite page / notifications
  mobile/assets/login-hero.webp               the logo artwork for the top of the login screen (soft, no frame)
  mobile/assets/brand/icon-maskable-512.png   PWA "maskable" icon (the website build uses it)
  mobile/android/app/src/main/res/mipmap-*/ic_launcher{,_round,_foreground,_monochrome,_background}.webp
  mobile/android/app/src/main/res/drawable-*/splashscreen_logo.webp
  landing/{favicon.png,favicon-32.png}, landing/assets/{badge.webp,apple-touch-icon.png}  the welcome website
  landing/assets/logo-h.webp                  the welcome website's header / footer logo: emblem + wordmark side by side
  landing/index.html                          only the "?v=..." stamps on the logo URLs (see stamp_landing_html)
  backend/public/invite/novaplay-badge.webp                                               the invite page / admin notifications

Not made here: landing/assets/og.jpg (the share picture; its bytes only feed the stamp) and the Android XML (colours,
adaptive icon, splash theme).

Why the stamps: the welcome website serves /assets/* with "max-age=86400, stale-while-revalidate=604800" and the favicons
are cached by the browser on their own, so a logo file that is replaced under the same URL keeps showing the OLD logo
to anyone who visited before. Every logo URL in landing/index.html therefore carries "?v=<hash of the logo files>", which
this script rewrites each time it runs.
Needs: pip install pillow numpy
"""
import argparse
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
MOBILE = HERE.parent.parent
ROOT = MOBILE.parent
MASTER = MOBILE / "assets" / "brand" / "novaplay-logo.png"
RES = MOBILE / "android" / "app" / "src" / "main" / "res"
DENSITY = {"mdpi": 1.0, "hdpi": 1.5, "xhdpi": 2.0, "xxhdpi": 3.0, "xxxhdpi": 4.0}

# --- geometry of the master (pixels), measured once; the checks in main() fail if a different image is used ---
FRAME_CENTER = (622.0, 610.0)       # the red frame: bbox x 173..1071, y 160..1060
FRAME_HALF = 449.0                  # half the frame's width
FRAME_RADIUS = 230.0                # its corner radius
CONTENT_WINDOW = (300, 300, 970, 880)  # emblem + wordmark + arc live in here; the frame and its glow do not
CONTENT_CIRCLE = (621.5, 642.3, 306.0)  # smallest circle around the artwork (x, y, r)
EMBLEM_CENTER = (632.5, 526.5)      # the "N" in its ring
EMBLEM_RADIUS = 214.0
EMBLEM_BOTTOM = 722                 # below this row the wordmark starts
WORDMARK_BOX = (330, 726, 940, 850)  # "NOVA PLAY" (rows 730..788) and the red arc under it (rows 798..838)
LOGO_FILES = ["assets/badge.webp", "assets/logo-h.webp", "assets/apple-touch-icon.png", "assets/og.jpg", "favicon-32.png", "favicon.png"]

SAFE_RADIUS_DP = 33.0               # adaptive icon: the artwork stays inside the 66 dp safe circle of the 108 dp canvas
PAD = 1500


def smoothstep(x, lo, hi):
    t = np.clip((np.asarray(x, dtype=np.float32) - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def load_master():
    return Image.open(MASTER).convert("RGB")


def soft_window(shape, box, fade):
    """1 inside `box` (l, t, r, b), falling to 0 over `fade` px at its edges."""
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    l, t, r, b = box
    wx = np.clip(np.minimum(xx - l, r - xx) / fade, 0, 1)
    wy = np.clip(np.minimum(yy - t, b - yy) / fade, 0, 1)
    return wx * wy


def cut(master, box, fade=25, bottom=None):
    """The master with everything outside `box` (and, if given, below row `bottom`) removed (set to black)."""
    a = np.asarray(master).astype(np.float32)
    win = soft_window(a.shape[:2], box, fade)
    if bottom is not None:
        yy = np.mgrid[0 : a.shape[0], 0 : a.shape[1]][0].astype(np.float32)
        win = win * np.clip((bottom - yy) / 10.0, 0, 1)
    return Image.fromarray(np.clip(a * win[..., None], 0, 255).astype(np.uint8))


def place(img, cx, cy, scale, out_w, out_h=None):
    """Canvas out_w x out_h on which source point (cx, cy) is the centre and one source px is `scale` canvas px."""
    out_h = out_h or out_w
    padded = Image.new("RGB", (img.width + 2 * PAD, img.height + 2 * PAD), (0, 0, 0))
    padded.paste(img, (PAD, PAD))
    hw, hh = out_w / 2 / scale, out_h / 2 / scale
    box = (PAD + cx - hw, PAD + cy - hh, PAD + cx + hw, PAD + cy + hh)
    return padded.resize((out_w, out_h), Image.LANCZOS, box=box)


def to_rgba(rgb):
    """Black -> clear. alpha = brightest channel; the colour is un-premultiplied, so on black it looks like the picture.
    The master has a faint grey haze (brightness 25..37) above the emblem that belongs to its tile, not to the logo:
    the brightness is gated (0 below 28, full above 58) so the haze and the noise vanish and only the glow that is
    clearly part of the artwork stays."""
    a = np.asarray(rgb.convert("RGB")).astype(np.float32)
    v = a.max(axis=2)
    alpha = np.clip(v / 255.0, 0, 1) * smoothstep(v, 28, 58)
    col = np.where(v[..., None] > 0, a * (255.0 / np.maximum(v[..., None], 1.0)), 0)
    out = np.dstack([np.clip(col, 0, 255), alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def mono(rgb):
    """One colour (white) shape for themed icons: the bright artwork is solid, its glow is dropped."""
    v = np.asarray(rgb.convert("RGB")).astype(np.float32).max(axis=2)
    alpha = smoothstep(v, 70, 150) * 255.0
    out = np.zeros(v.shape + (4,), np.uint8)
    out[..., :3] = 255
    out[..., 3] = alpha.astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def over(rgba, bg):
    base = bg.convert("RGBA").copy()
    base.alpha_composite(rgba)
    return base.convert("RGB")


def glow_background(n):
    """Black with a faint deep-red glow towards the edges (the neon frame's light), n x n."""
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    d = np.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2)
    g = smoothstep(d, 0.45, 1.05)
    col = np.zeros((n, n, 3), np.float32)
    col[..., 0] = 70 * g
    col[..., 1] = 4 * g
    col[..., 2] = 10 * g
    return Image.fromarray(col.astype(np.uint8), "RGB")


def rounded_mask(size, half, radius, ss=4):
    m = Image.new("L", (size * ss, size * ss), 0)
    c = size * ss / 2
    ImageDraw.Draw(m).rounded_rectangle((c - half * ss, c - half * ss, c + half * ss - 1, c + half * ss - 1), radius=radius * ss, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def circle_mask(size, ss=4):
    m = Image.new("L", (size * ss, size * ss), 0)
    ImageDraw.Draw(m).ellipse((0, 0, size * ss - 1, size * ss - 1), fill=255)
    return m.resize((size, size), Image.LANCZOS)


def save_png(img, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


def save_webp(img, path, lossless=True, quality=92):
    path.parent.mkdir(parents=True, exist_ok=True)
    if lossless:
        img.save(path, "WEBP", lossless=True, quality=100, method=6)
    else:
        img.save(path, "WEBP", quality=quality, alpha_quality=100, method=6)


# ---------------------------------------------------------------------------------------------------------------
def artwork(master):
    """The emblem + wordmark + arc with the frame removed (RGB on black)."""
    return cut(master, CONTENT_WINDOW)


def adaptive_foreground_rgb(art, n):
    """Artwork fitted into the adaptive icon's safe circle on an n px canvas that stands for 108 dp."""
    cx, cy, r = CONTENT_CIRCLE
    return place(art, cx, cy, (SAFE_RADIUS_DP * n / 108.0) / r, n)


def tile(master, n, half):
    """The logo tile (frame included) on an n px square, `half` source px from the frame's centre to the edge."""
    return place(master, FRAME_CENTER[0], FRAME_CENTER[1], n / (2 * half), n)


def emblem_rgb(master, n, fill=0.82):
    """The N emblem alone (ring included), centred, the ring's circle filling `fill` of an n px square."""
    art = cut(master, (360, 290, 910, 760), fade=20, bottom=EMBLEM_BOTTOM)
    cx, cy = EMBLEM_CENTER
    return place(art, cx, cy, (fill * n / 2) / EMBLEM_RADIUS, n)


def build_android(master, art):
    for dens, f in DENSITY.items():
        n_canvas = int(round(108 * f))
        fg_rgb = adaptive_foreground_rgb(art, n_canvas)
        fg = to_rgba(fg_rgb)
        bg = glow_background(n_canvas)
        d = RES / f"mipmap-{dens}"
        save_webp(fg, d / "ic_launcher_foreground.webp")
        save_webp(mono(fg_rgb), d / "ic_launcher_monochrome.webp")
        save_webp(bg, d / "ic_launcher_background.webp")
        # legacy launcher icons (Android < 8): a rounded tile with the frame, and a round one
        size = int(round(48 * f))
        half = FRAME_HALF + 17
        t = tile(master, size, half).convert("RGBA")
        scale = size / (2 * half)
        t.putalpha(rounded_mask(size, (FRAME_HALF + 12) * scale, (FRAME_RADIUS + 12) * scale))
        save_webp(t, d / "ic_launcher.webp")
        comp = over(fg, bg)
        vis = int(round(72 * f))                      # the visible 72 dp of the 108 dp canvas
        off = (n_canvas - vis) // 2
        rnd = comp.crop((off, off, off + vis, off + vis)).resize((size, size), Image.LANCZOS).convert("RGBA")
        rnd.putalpha(circle_mask(size))
        save_webp(rnd, d / "ic_launcher_round.webp")
        # cold-start splash: artwork on a 288 dp square, about 188 dp wide
        n_splash = int(round(288 * f))
        cx, cy, r = CONTENT_CIRCLE
        sp = to_rgba(place(art, cx, cy, (98.0 * f) / r, n_splash))
        save_webp(sp, RES / f"drawable-{dens}" / "splashscreen_logo.webp", lossless=False, quality=92)
        (RES / f"drawable-{dens}" / "splashscreen_logo.png").unlink(missing_ok=True)  # the old placeholder


def build_expo(master, art):
    a = MOBILE / "assets"
    save_png(tile(master, 1024, FRAME_HALF / 0.9), a / "icon.png")
    fg_rgb = adaptive_foreground_rgb(art, 1024)
    save_png(to_rgba(fg_rgb), a / "android-icon-foreground.png")
    save_png(mono(fg_rgb), a / "android-icon-monochrome.png")
    save_png(glow_background(512), a / "android-icon-background.png")
    cx, cy, r = CONTENT_CIRCLE
    save_png(to_rgba(place(art, cx, cy, (0.42 * 512) / r, 512)), a / "splash-icon.png")
    # PWA maskable icon: full-bleed, the artwork inside the central 61 %
    save_png(over(to_rgba(adaptive_foreground_rgb(art, 512)), glow_background(512)), a / "brand" / "icon-maskable-512.png")
    # in-app badge: the emblem alone
    save_webp(to_rgba(emblem_rgb(master, 200, fill=0.96)), a / "novaplay-badge.webp", lossless=False, quality=95)
    # login hero: artwork 400 px tall on an 828 x 424 transparent strip
    top, bottom = 339.0, 840.0
    hero = place(art, 633.0, (top + bottom) / 2, 400.0 / (bottom - top), 828, 424)
    save_webp(to_rgba(hero), a / "login-hero.webp", lossless=False, quality=92)


def small_icon(master, n):
    """Browser icon: black rounded tile with the emblem, drawn at 4x and reduced."""
    ss = 4
    big = n * ss
    base = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    base.paste(Image.new("RGBA", (big, big), (0, 0, 0, 255)), (0, 0), rounded_mask(big, big / 2, big * 0.22, ss=1))
    em = to_rgba(emblem_rgb(master, big, fill=0.78))
    base.alpha_composite(em)
    return base.resize((n, n), Image.LANCZOS)


def build_web(master):
    save_png(small_icon(master, 48), MOBILE / "assets" / "favicon.png")
    save_png(small_icon(master, 64), ROOT / "landing" / "favicon.png")
    save_png(small_icon(master, 32), ROOT / "landing" / "favicon-32.png")
    save_png(tile(master, 180, FRAME_HALF / 0.9), ROOT / "landing" / "assets" / "apple-touch-icon.png")
    badge = to_rgba(emblem_rgb(master, 200, fill=0.96))
    save_webp(badge, ROOT / "landing" / "assets" / "badge.webp", lossless=False, quality=95)
    save_webp(badge, ROOT / "backend" / "public" / "invite" / "novaplay-badge.webp", lossless=False, quality=95)
    lk = lockup(master)
    save_webp(lk, ROOT / "landing" / "assets" / "logo-h.webp", lossless=False, quality=92)
    return lk.size


def trim(rgba, pad=6):
    box = rgba.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    l, t, r, b = box
    out = Image.new("RGBA", (r - l + 2 * pad, b - t + 2 * pad), (0, 0, 0, 0))
    out.alpha_composite(rgba.crop(box), (pad, pad))
    return out


def lockup(master):
    """Emblem and wordmark side by side (the owner's picture stacks them), 120 px tall = 3x of a 40 px header logo."""
    h = 120
    emblem_src = cut(master, (360, 290, 910, 760), fade=20, bottom=EMBLEM_BOTTOM)
    text_src = cut(master, WORDMARK_BOX, fade=6)
    ke = h / 381.0                                   # the emblem (rows 339..720) fills the height
    emb = to_rgba(place(emblem_src, 632.5, 529.5, ke, 150, h))
    kt = 0.79
    tw, th = int(round(610 * kt)) + 6, int(round(124 * kt)) + 6
    txt = to_rgba(place(text_src, (WORDMARK_BOX[0] + WORDMARK_BOX[2]) / 2, (WORDMARK_BOX[1] + WORDMARK_BOX[3]) / 2, kt, tw, th))
    canvas = Image.new("RGBA", (150 + 10 + tw, h), (0, 0, 0, 0))
    canvas.alpha_composite(emb, (0, 0))
    canvas.alpha_composite(txt, (160, (h - th) // 2))
    return trim(canvas)


def stamp_landing_html():
    """Put "?v=<hash of the logo files>" on every logo URL in landing/index.html (see the docstring for why)."""
    import hashlib
    import re

    land = ROOT / "landing"
    h = hashlib.sha256()
    for f in LOGO_FILES:
        h.update((land / f).read_bytes())
    token = h.hexdigest()[:8]
    html = (land / "index.html").read_text()
    names = "|".join(re.escape(f) for f in sorted(LOGO_FILES, key=len, reverse=True))
    new = re.sub(r"(?<![\w-])(" + names + r")(\?v=[0-9a-f]+)?", lambda m: f"{m.group(1)}?v={token}", html)
    if new != html:
        (land / "index.html").write_text(new)
    return token


def preview(master, art, out):
    cell = 260
    items = []
    n = 432
    fg = to_rgba(adaptive_foreground_rgb(art, n))
    bg = glow_background(n)
    comp = over(fg, bg)
    items.append(("icon.png", Image.open(MOBILE / "assets" / "icon.png").convert("RGB")))
    items.append(("adaptive", comp))
    items.append(("monochrome", over(mono(adaptive_foreground_rgb(art, n)), Image.new("RGB", (n, n), (40, 44, 52)))))
    items.append(("badge", over(Image.open(MOBILE / "assets" / "novaplay-badge.webp").convert("RGBA"), Image.new("RGB", (200, 200), (21, 17, 18)))))
    items.append(("favicon", Image.open(MOBILE / "assets" / "favicon.png").convert("RGBA").resize((192, 192), Image.NEAREST)))
    items.append(("hero", over(Image.open(MOBILE / "assets" / "login-hero.webp").convert("RGBA"), Image.new("RGB", (828, 424), (23, 7, 9)))))
    items.append(("splash", over(Image.open(RES / "drawable-xxhdpi" / "splashscreen_logo.webp").convert("RGBA"), Image.new("RGB", (864, 864), (23, 7, 9)))))
    items.append(("round", Image.open(RES / "mipmap-xxxhdpi" / "ic_launcher_round.webp").convert("RGBA")))
    items.append(("legacy", Image.open(RES / "mipmap-xxxhdpi" / "ic_launcher.webp").convert("RGBA")))
    cols = 5
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * cell), (58, 62, 70))
    for i, (_, im) in enumerate(items):
        im = im.convert("RGBA")
        k = (cell - 16) / max(im.size)
        im = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)
        sheet.paste(im, ((i % cols) * cell + (cell - im.width) // 2, (i // cols) * cell + (cell - im.height) // 2), im)
    sheet.save(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", help="also write a contact sheet of the results to this PNG")
    args = ap.parse_args()
    master = load_master()
    assert master.size == (1254, 1254), "the master logo must be the 1254 x 1254 picture the owner supplied"
    a = np.asarray(master).astype(np.float32).max(axis=2)
    ys, xs = np.where(a > 60)
    assert (xs.min(), xs.max(), ys.min(), ys.max()) == (173, 1071, 160, 1060), "the frame is not where the geometry constants expect it"
    art = artwork(master)
    border = np.asarray(art).max(axis=2)[CONTENT_WINDOW[1] : CONTENT_WINDOW[3], CONTENT_WINDOW[0] : CONTENT_WINDOW[2]]
    assert max(border[0].max(), border[-1].max(), border[:, 0].max(), border[:, -1].max()) <= 2, "the frame's glow reaches into the artwork"
    build_android(master, art)
    build_expo(master, art)
    lk_size = build_web(master)
    if (ROOT / "landing" / "index.html").exists():
        print("landing logo stamp: ?v=" + stamp_landing_html(), "| header logo", lk_size)
    if args.preview:
        preview(master, art, args.preview)
    print("done")


if __name__ == "__main__":
    main()
