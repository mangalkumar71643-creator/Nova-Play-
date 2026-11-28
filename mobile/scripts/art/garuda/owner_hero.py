"""Garuda Gold: the owner's own golden Garuda (owner, 2026-11-28: "put my Garuda in the game in place of the one there"), cut out of
its black background and placed in the game's scene as assets/garuda/hero.webp (412 x 300 units at 2.5x, transparent; the temple
scene shows behind it and the name plate covers its bottom edge, where the picture ends).

The black is un-blended away (colour-to-alpha against black, only where the black reaches in from the edges of the picture: the
feathers' tips and outline stay soft and keep their gold, while shadows inside the figure stay solid). Anything apart from the
figure (the small mark in the corner of the picture) goes with the background.

usage: python3 -I scripts/art/garuda/owner_hero.py [SOURCE] [OUT]
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'owner-garuda-source.jpg')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(MOBILE, 'assets', 'garuda', 'hero.webp')

W, H = 1030, 750  # the scene: 412 x 300 units at 2.5x
LO, HI = 10.0, 60.0  # black (JPEG noise up to ~6) .. the darkest the figure's own colour gets at its outline
CORE, MIN_HOLE = 14.0, 120  # plain black, and how much of it makes a see-through hole (not a shadow)

P = np.array(Image.open(src).convert('RGB')).astype(np.float32)
h, w, _ = P.shape
m = P.max(axis=2)

# 1. the background: the dark that reaches in from the picture's edges, and the black seen through the figure (between an arm
# and the body, between two feathers): a dark patch around a core of plain black big enough not to be a shadow
lab, n = ndi.label(m < HI)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
core = m < CORE
core_area = ndi.sum(core, lab, index=np.arange(1, n + 1))
holes = {i + 1 for i, a in enumerate(core_area) if a >= MIN_HOLE}
bg = np.isin(lab, list(edge | holes))

# 2. alpha: none in the black, rising with brightness where the background meets the figure, full everywhere else
alpha = np.where(bg, np.clip((m - LO) / (HI - LO), 0, 1), 1.0)
# un-blend the black from the soft edge (colour = alpha x figure over black)
with np.errstate(divide='ignore', invalid='ignore'):
    C = np.where(alpha[..., None] > 0, P / np.maximum(alpha[..., None], 1e-3), 0)
C = np.clip(C, 0, 255)

# 3. only the figure: the biggest piece (the mark in the corner and any speck go)
labA, nA = ndi.label(alpha > 0.04)
areas = ndi.sum(np.ones_like(alpha), labA, index=np.arange(1, nA + 1))
keep = labA == (int(np.argmax(areas)) + 1)
# what the figure encloses stays with it (a soft pixel between two feathers)
keep = ndi.binary_fill_holes(keep) | (ndi.binary_dilation(keep, iterations=2) & (alpha > 0))
alpha = np.where(keep, alpha, 0)

ys, xs = np.where(alpha > 0.04)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
rgba = np.dstack([C, alpha * 255]).astype(np.uint8)[y0:y1, x0:x1]
fig = Image.fromarray(rgba, 'RGBA')

# 4. into the scene: the wings' tips just inside its sides, the picture's cut-off bottom on the scene's bottom (under the plate)
s = min((W - 10) / fig.width, (H - 20) / fig.height)
fw, fh = round(fig.width * s), round(fig.height * s)
# resize with premultiplied alpha (no dark or bright fringe at the soft edge)
arr = np.array(fig).astype(np.float32) / 255.0
pre = np.dstack([arr[..., :3] * arr[..., 3:4], arr[..., 3:4]])
pre_img = [Image.fromarray((pre[..., k] * 255).astype(np.uint8), 'L').resize((fw, fh), Image.LANCZOS) for k in range(4)]
pre_r = np.dstack([np.array(c).astype(np.float32) / 255.0 for c in pre_img])
a = np.clip(pre_r[..., 3], 0, 1)
with np.errstate(divide='ignore', invalid='ignore'):
    rgb = np.where(a[..., None] > 0, pre_r[..., :3] / np.maximum(a[..., None], 1e-4), 0)
small = Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, a * 255]).astype(np.uint8), 'RGBA')

canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
canvas.alpha_composite(small, ((W - fw) // 2, H - fh))
canvas.save(out, 'WEBP', quality=88, method=6)
print(f'{out}: {os.path.getsize(out) // 1024} KB, figure {fw} x {fh} at ({(W - fw) // 2}, {H - fh})')
