"""Makes the fonts of the app smaller by dropping the letters and icons it never shows (same names, same look).

    pip install fonttools
    python3 scripts/fonts/subset.py

* Montserrat (5 weights): from the full fonts in scripts/fonts/full to assets/fonts. Kept: Latin (Basic Latin, Latin-1, Latin Extended-A),
  punctuation, currency signs (the rupee sign included), a few symbols, and every other character the app's own text uses.
  Cyrillic and Vietnamese letters are dropped (a name written in them is drawn with the phone's own font).
* MaterialCommunityIcons: from the copy in node_modules (7,448 icons) to assets/fonts/MaterialCommunityIcons.subset.ttf with only the icons the app
  names (in mobile/src, App.tsx and backend/src). metro.config.js makes the app load this file instead of the full one. Run this script again
  (and scripts/fonts/check_icons.py) whenever an icon is added.
"""
import json
import os
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
MOBILE = os.path.abspath(os.path.join(HERE, '..', '..'))
BACKEND = os.path.abspath(os.path.join(MOBILE, '..', 'backend'))
GLYPHMAP = os.path.join(MOBILE, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json')
MCI_FULL = os.path.join(MOBILE, 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf')
MCI_SUBSET = os.path.join(MOBILE, 'assets/fonts/MaterialCommunityIcons.subset.ttf')

LATIN_RANGES = [(0x20, 0x7E), (0xA0, 0x17F), (0x2C6, 0x2C6), (0x2DA, 0x2DC), (0x2000, 0x206F), (0x20A0, 0x20BF), (0x2113, 0x2113), (0x2116, 0x2116),
                (0x2122, 0x2122), (0x2190, 0x2193), (0x2212, 0x2212), (0x221E, 0x221E), (0x2248, 0x2248), (0x2260, 0x2265), (0x25CA, 0x25CA)]


def source_files(root, exts):
    for d, dirs, fs in os.walk(root):
        dirs[:] = [x for x in dirs if x not in ('node_modules', 'build', 'dist', '.git')]
        for f in fs:
            if f.endswith(exts):
                yield os.path.join(d, f)


def app_sources():
    files = list(source_files(os.path.join(MOBILE, 'src'), ('.ts', '.tsx')))
    files.append(os.path.join(MOBILE, 'App.tsx'))
    files += list(source_files(os.path.join(BACKEND, 'src'), ('.ts',)))
    return files


def used_icons():
    """Every icon name the app can show: names written as strings, and every icon of a family built as a template string."""
    glyphs = json.load(open(GLYPHMAP))
    names = set()
    for p in app_sources():
        text = open(p, encoding='utf-8').read()
        for m in re.finditer(r"""['"`]([a-z0-9]+(?:-[a-z0-9]+)*)['"`]""", text):
            if m.group(1) in glyphs:
                names.add(m.group(1))
        for m in re.finditer(r"`([a-z0-9]+(?:-[a-z0-9]+)*-)\$\{", text):
            prefix = m.group(1)
            if len(prefix) >= 3:
                names.update(n for n in glyphs if n.startswith(prefix))
    return glyphs, sorted(names)


def app_characters():
    chars = set()
    for p in app_sources():
        chars.update(c for c in open(p, encoding='utf-8').read() if ord(c) > 0x7F)
    return chars


def subset_font(src, dst, unicodes):
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True
    options.glyph_names = False
    options.hinting = True
    options.legacy_kern = True
    font = TTFont(src)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=sorted(unicodes))
    subsetter.subset(font)
    font.save(dst)
    return os.path.getsize(src), os.path.getsize(dst)


def main():
    total_before = total_after = 0
    wanted = {c for lo, hi in LATIN_RANGES for c in range(lo, hi + 1)} | {ord(c) for c in app_characters()}
    for f in sorted(os.listdir(os.path.join(HERE, 'full'))):
        if not f.endswith('.ttf'):
            continue
        a, b = subset_font(os.path.join(HERE, 'full', f), os.path.join(MOBILE, 'assets/fonts', f), wanted)
        total_before += a
        total_after += b
        print(f'  {f}: {a // 1024} KB -> {b // 1024} KB')
    glyphs, names = used_icons()
    a, b = subset_font(MCI_FULL, MCI_SUBSET, {glyphs[n] for n in names})
    total_before += a
    total_after += b
    print(f'  MaterialCommunityIcons: {a // 1024} KB -> {b // 1024} KB ({len(names)} of {len(glyphs)} icons kept)')
    print(f'fonts: {total_before / 1e6:.2f} MB -> {total_after / 1e6:.2f} MB (before compression)')


if __name__ == '__main__':
    sys.exit(main())
