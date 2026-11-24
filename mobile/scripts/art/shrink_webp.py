"""Re-encodes the WEBP pictures of the app at a lower quality so the app is smaller (same names, same sizes in pixels).

    python3 scripts/art/shrink_webp.py            # shrink every assets/**/*.webp in place
    python3 scripts/art/shrink_webp.py --dry-run  # only say what would be saved

* lossy pictures are re-encoded at QUALITY (80); a picture that would come out much worse (PSNR under MIN_PSNR against the
  original, flattened on grey) is tried at QUALITY_FALLBACK (86) and left alone if that is still too different;
* lossless pictures and pictures that do not get smaller by at least MIN_SAVING stay as they are;
* the art that scripts/art/build.js draws is capped at the same quality (to_webp.py), so a rebuild gives the same sizes.
Needs Pillow.
"""
import io
import math
import os
import sys

from PIL import Image

QUALITY = 80
QUALITY_FALLBACK = 86
ALPHA_QUALITY = 90
MIN_PSNR = 33.0
MIN_SAVING = 0.04  # keep the old file unless the new one is at least 4% smaller

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')


def is_lossless(path):
    """True for a WEBP file whose picture is stored lossless (VP8L)."""
    with open(path, 'rb') as f:
        data = f.read(4096)
    pos = 12
    while pos + 8 <= len(data):
        fourcc = data[pos:pos + 4]
        size = int.from_bytes(data[pos + 4:pos + 8], 'little')
        if fourcc == b'VP8L':
            return True
        if fourcc == b'VP8 ':
            return False
        pos += 8 + size + (size & 1)
    return False


def flat(im):
    im = im.convert('RGBA')
    bg = Image.new('RGBA', im.size, (128, 128, 128, 255))
    bg.alpha_composite(im)
    return bg.convert('RGB')


def psnr(a, b):
    pa, pb = a.tobytes(), b.tobytes()
    step = 3
    se = sum((x - y) ** 2 for x, y in zip(pa[::step], pb[::step])) / len(pa[::step])
    return 99.0 if se == 0 else 10 * math.log10(255 * 255 / se)


def encode(im, quality):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, alpha_quality=ALPHA_QUALITY, method=6)
    return buf.getvalue()


def main():
    dry = '--dry-run' in sys.argv
    files = sorted(os.path.join(d, f) for d, _, fs in os.walk(os.path.join(ROOT, 'assets')) for f in fs if f.lower().endswith('.webp'))
    before = after = 0
    changed = skipped_lossless = kept = fallback = 0
    for p in files:
        old = os.path.getsize(p)
        before += old
        if is_lossless(p):
            skipped_lossless += 1
            after += old
            continue
        im = Image.open(p)
        im.load()
        ref = flat(im)
        best = None
        for q in (QUALITY, QUALITY_FALLBACK):
            data = encode(im, q)
            if psnr(ref, flat(Image.open(io.BytesIO(data)))) >= MIN_PSNR:
                best = data
                if q == QUALITY_FALLBACK:
                    fallback += 1
                break
        if best is None or len(best) > old * (1 - MIN_SAVING):
            kept += 1
            after += old
            continue
        changed += 1
        after += len(best)
        if not dry:
            with open(p, 'wb') as f:
                f.write(best)
    print(f'{len(files)} pictures: {changed} re-encoded ({fallback} of them at {QUALITY_FALLBACK}), {skipped_lossless} lossless left alone, {kept} left as they were')
    print(f'{before / 1e6:.2f} MB -> {after / 1e6:.2f} MB (saves {(before - after) / 1e6:.2f} MB){" [dry run, nothing written]" if dry else ""}')


if __name__ == '__main__':
    main()
