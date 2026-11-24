"""Checks that the small fonts still have everything the app shows (run it before a release, after adding an icon or a symbol):

    python3 scripts/fonts/check_icons.py

* every icon name the app uses is in assets/fonts/MaterialCommunityIcons.subset.ttf;
* every non-ASCII character in the app's own text that the full Montserrat has is in each small Montserrat.
Exit code 1 (and the list of what is missing) if not: run scripts/fonts/subset.py again.
"""
import importlib.util
import os
import sys

from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('font_subsets', os.path.join(HERE, 'subset.py'))
fs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fs)

problems = []
glyphs, names = fs.used_icons()
cmap = TTFont(fs.MCI_SUBSET).getBestCmap()
missing_icons = [n for n in names if glyphs[n] not in cmap]
if missing_icons:
    problems.append(f'icons missing from the small icon font: {missing_icons}')
print(f'icons: {len(names)} used by the app, {len(missing_icons)} missing from the small font')

chars = fs.app_characters()
for f in sorted(os.listdir(os.path.join(fs.HERE, 'full'))):
    if not f.endswith('.ttf'):
        continue
    full = TTFont(os.path.join(fs.HERE, 'full', f)).getBestCmap()
    small = TTFont(os.path.join(fs.MOBILE, 'assets/fonts', f)).getBestCmap()
    lost = sorted(c for c in chars if ord(c) in full and ord(c) not in small)
    if lost:
        problems.append(f'{f}: characters of the app missing from the small font: {lost}')
    print(f'{f}: {len(chars)} non-ASCII characters in the app, {len(lost)} lost')

if problems:
    print('\n'.join(problems))
    sys.exit(1)
print('all ok')
