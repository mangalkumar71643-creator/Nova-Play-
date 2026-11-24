"""Makes source/chicken.webp for the Chicken Road popup: the game's chicken (assets/chicken-road-chicken.webp) with a clean edge.

The game shows the chicken at about 50 px, where the rough, light fringe left by its cut-out (and a few stray specks) cannot be seen. The popup draws
it three times as large, so this takes the fringe off: it keeps only the real chicken (no specks), takes two pixels off its outline, and gives the
outline a soft one-pixel edge. The pictures inside the chicken (face, comb, feet) are not touched.

    python3 scripts/art/chickenroad-popup/clean_chicken.py        (from the mobile folder)
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

src = Image.open(os.path.join(ROOT, "assets", "chicken-road-chicken.webp")).convert("RGBA")
rgba = np.array(src)
solid = rgba[..., 3] > 127

# Only the chicken itself: every piece of the outline that is big enough to be part of it (the body, and any foot or comb that the cut-out
# separated), not the specks.
labels, count = ndi.label(solid)
sizes = ndi.sum(solid, labels, range(1, count + 1))
keep = np.zeros(count + 1, bool)
keep[1:] = sizes >= 0.01 * solid.sum()
solid = keep[labels]

# Close the thin gaps the cut-out left inside the body, then take the fringe off.
solid = ndi.binary_closing(solid, iterations=2)
solid = ndi.binary_fill_holes(solid)
solid = ndi.binary_erosion(solid, iterations=2)
alpha = ndi.gaussian_filter(solid.astype(np.float32), 0.8)

# The colours of the pixels on the new edge come from the chicken, not from the cut-out's fringe: spread the colours of the inner pixels outwards.
inner = ndi.binary_erosion(solid, iterations=1)
_, (iy, ix) = ndi.distance_transform_edt(~inner, return_indices=True)
rgb = rgba[..., :3][iy, ix]

out = np.dstack([rgb, np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)])
os.makedirs(os.path.join(HERE, "source"), exist_ok=True)
Image.fromarray(out, "RGBA").save(os.path.join(HERE, "source", "chicken.webp"), "WEBP", lossless=True, method=6, exact=True)
print("source/chicken.webp", out.shape[1], "x", out.shape[0], os.path.getsize(os.path.join(HERE, "source", "chicken.webp")) // 1024, "KB")
