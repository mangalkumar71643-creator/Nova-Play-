"""Turns the PNGs that build.js drew into WEBP files (see build.js). Lossy pictures are capped at quality 80 (as scripts/art/shrink_webp.py
does for the pictures that are already in the app) so the app stays small."""
import json
import os
import sys

from PIL import Image

MAX_QUALITY = 80
ALPHA_QUALITY = 90

for item in json.load(open(sys.argv[1])):
    im = Image.open(item["png"])
    os.makedirs(os.path.dirname(item["out"]), exist_ok=True)
    im.save(item["out"], "WEBP", quality=min(item["quality"], MAX_QUALITY), alpha_quality=ALPHA_QUALITY, lossless=item["lossless"], method=6)
    print(f'  {os.path.relpath(item["out"])}  {im.size[0]}x{im.size[1]}  {os.path.getsize(item["out"]) // 1024} KB')
