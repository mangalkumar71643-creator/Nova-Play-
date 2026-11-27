"""Cut a slide drawn on a white background (a picture the owner had re-made sharper by an image tool, sent as a JPG) out to a
transparent PNG for the Home Slider, so it stands cleanly on the app's red stage.

The white is un-blended away (colour-to-alpha against white: soft glows and sparkles stay as see-through gold, anti-aliased edges
stay clean), while the art itself stays solid: everything enclosed by a solid outline (the board, the plates, the letters with
their light highlights) and small light objects standing alone (white diamonds) keep full opacity and their own colours.
Grey shadows (black once un-blended) are tinted red-brown so the admin panel's "Remove background" step leaves them.

usage: python3 -I scripts/art/cutout_white.py IN OUT [--solid 0.45] [--light 0.12] [--min-light-area 300] [--max-light-area 8000] [--close 5] [--max-piece-area 25000] [--convex 0.8]
"""
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull

args = sys.argv[1:]
src_path, out_path = args[0], args[1]
opt = {'--solid': 0.45, '--light': 0.12, '--min-light-area': 300, '--max-light-area': 8000, '--close': 5, '--max-piece-area': 25000, '--convex': 0.8}
for i in range(2, len(args), 2):
    opt[args[i]] = float(args[i + 1])

P = np.array(Image.open(src_path).convert('RGB')).astype(np.float32)
h, w, _ = P.shape

# 1. colour-to-alpha against white
A0 = (255.0 - P).max(axis=2) / 255.0
with np.errstate(divide='ignore', invalid='ignore'):
    C = (P - (1.0 - A0[..., None]) * 255.0) / A0[..., None]
C = np.nan_to_num(np.clip(C, 0, 255))
NOISE = 0.035  # JPEG noise in the white
alpha = np.clip((A0 - NOISE) / (1 - NOISE), 0, 1)

# 2. solid art: what each solid shape encloses. Each shape on its own is closed first (a rim washed out by a sparkle still counts as
# closed) and then filled, so a pocket of background between two neighbouring shapes is never filled.
M = A0 > opt['--solid']
labM, nM = ndi.label(M)
areaM = ndi.sum(np.ones_like(A0), labM, index=np.arange(1, nM + 1))
solid = np.zeros_like(M)
close = int(opt['--close'])
pad = close + 2
for i, sl in enumerate(ndi.find_objects(labM), start=1):
    if sl is None:
        continue
    if areaM[i - 1] < 50:
        solid[sl] |= labM[sl] == i
        continue
    y0, y1 = max(sl[0].start - pad, 0), min(sl[0].stop + pad, h)
    x0, x1 = max(sl[1].start - pad, 0), min(sl[1].stop + pad, w)
    comp = labM[y0:y1, x0:x1] == i
    solid[y0:y1, x0:x1] |= ndi.binary_fill_holes(ndi.binary_closing(comp, iterations=close)) | comp
big = np.isin(labM, np.nonzero(areaM > opt['--max-light-area'])[0] + 1)
# small convex pieces (a chip, a gem) are filled to their convex hull when what lies inside that hull is solid enough: a chip's gold
# rim is a piece of its own (a thin light line parts it from the chip's face), and its hull takes in the face and the sparkle that
# washed part of the rim out
hulls = Image.new('L', (w, h), 0)
draw = ImageDraw.Draw(hulls)
for i, sl in enumerate(ndi.find_objects(labM), start=1):
    if sl is None or areaM[i - 1] < 300 or areaM[i - 1] > opt['--max-piece-area']:
        continue
    ys, xs = np.nonzero(labM[sl] == i)
    pts = np.column_stack([xs + sl[1].start, ys + sl[0].start])
    try:
        hull = ConvexHull(pts)
    except Exception:
        continue
    poly = [tuple(map(float, pts[v])) for v in hull.vertices]
    y0, y1 = max(sl[0].start - pad, 0), min(sl[0].stop + pad, h)
    x0, x1 = max(sl[1].start - pad, 0), min(sl[1].stop + pad, w)
    win = Image.new('L', (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(win).polygon([(x - x0, y - y0) for x, y in poly], fill=255)
    inside = np.array(win) > 0
    members = M[y0:y1, x0:x1] & inside
    members = ndi.binary_fill_holes(ndi.binary_closing(members, iterations=close)) & inside
    if members.sum() / max(inside.sum(), 1) >= opt['--convex']:
        draw.polygon(poly, fill=255)
solid |= np.array(hulls) > 0
# 3. light objects standing alone (white diamonds): a gem is convex, so each one is filled to its convex hull
light = ndi.binary_closing(A0 > opt['--light'], iterations=3)
lab, n = ndi.label(light)
kept = 0
hulls = Image.new('L', (w, h), 0)
draw = ImageDraw.Draw(hulls)
for i, sl in enumerate(ndi.find_objects(lab), start=1):
    if sl is None:
        continue
    comp = lab[sl] == i
    area = int(comp.sum())
    if area < opt['--min-light-area'] or area > opt['--max-light-area'] or (big[sl] & comp).any():
        continue
    ys, xs = np.nonzero(comp)
    pts = np.column_stack([xs + sl[1].start, ys + sl[0].start])
    try:
        hull = ConvexHull(pts)
    except Exception:
        continue
    draw.polygon([tuple(map(float, pts[v])) for v in hull.vertices], fill=255)
    kept += 1
solid |= np.array(hulls) > 0
inner = ndi.binary_erosion(solid, iterations=2)

alpha = np.where(inner, 1.0, alpha)
rgb = np.where(inner[..., None], P, C)

# 4. shadows: near black once un-blended, and see-through -> red-brown
dark = (rgb.max(axis=2) < 60) & (alpha > 0) & (alpha < 0.6) & ~inner
rgb[dark] = (74, 12, 8)

# 5. the admin panel's "Remove background" step clears white / light grey (all channels >= 185, within 22 of each other) that it can
# reach from the outside, so solid near-white pixels on the edge of a shape (a white diamond's facets, the top highlight of a gold
# letter) get a faint tint of their own colour family: blue-white for cool ones, warm gold for the others
edge_band = inner & ~ndi.binary_erosion(inner, iterations=4)
lo = rgb.min(axis=2)
hi = rgb.max(axis=2)
whiteish = edge_band & (lo >= 178) & (hi - lo <= 30)
cool = rgb[..., 2] >= rgb[..., 0]
tint = np.where(cool[..., None], np.array([186.0, 212.0, 246.0]), np.array([252.0, 222.0, 160.0]))
rgb = np.where(whiteish[..., None], rgb * 0.55 + tint * 0.45, rgb)
protected = int(whiteish.sum())

# 6. nothing on the picture's border (a speck of sparkle dust there would stop the panel from cropping)
B = 4
alpha[:B, :] = 0
alpha[-B:, :] = 0
alpha[:, :B] = 0
alpha[:, -B:] = 0

out = np.dstack([rgb, alpha * 255.0]).round().clip(0, 255).astype(np.uint8)
out[out[..., 3] == 0, :3] = 0
Image.fromarray(out, 'RGBA').save(out_path, optimize=True)
print(f'{w}x{h} -> {out_path}: solid {inner.mean():.1%} of the picture, light objects kept {kept}, shadows tinted {int(dark.sum())} px, edge whites tinted {protected} px')
