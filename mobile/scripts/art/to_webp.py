"""Turns the PNGs that build.js drew into WEBP files (see build.js)."""
import json
import os
import sys

from PIL import Image

for item in json.load(open(sys.argv[1])):
    im = Image.open(item["png"])
    os.makedirs(os.path.dirname(item["out"]), exist_ok=True)
    im.save(item["out"], "WEBP", quality=item["quality"], lossless=item["lossless"], method=6)
    print(f'  {os.path.relpath(item["out"])}  {im.size[0]}x{im.size[1]}  {os.path.getsize(item["out"]) // 1024} KB')
