#!/usr/bin/env python3
"""
Builds the NovaPlay website: the app exported for the web, with a phone frame around it on computers and an
install manifest, written into backend/public so the server's Vercel project serves it at its root
(admin.html, chat.html, download/ and the rest of backend/public stay as they are).

  python3 mobile/scripts/build-web.py

Needs Node + the app's npm packages (npm ci in mobile/). The API is the live server: the app's API_BASE_URL.
"""
import json, os, re, shutil, subprocess, sys
from pathlib import Path
from PIL import Image

MOBILE = Path(__file__).resolve().parent.parent
PUBLIC = MOBILE.parent / "backend" / "public"
TMP = Path("/tmp/novaplay-web-export")
THEME = "#170709"

# What this script owns in backend/public (replaced on every build).
OWNED = ["_expo", "assets", "web-icons", "index.html", "manifest.webmanifest", "favicon.ico", "metadata.json"]

def run(*cmd, cwd=MOBILE):
    print("==>", " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True)

shutil.rmtree(TMP, ignore_errors=True)
run("npx", "expo", "export", "-p", "web", "--output-dir", str(TMP))

# Icons for the install prompt and the home screen.
icons = TMP / "web-icons"
icons.mkdir()
src = Image.open(MOBILE / "assets" / "icon.png").convert("RGBA")
for size in (192, 512):
    src.resize((size, size), Image.LANCZOS).save(icons / f"icon-{size}.png")
src.resize((180, 180), Image.LANCZOS).save(icons / "apple-touch-icon.png")
# Maskable: the picture inside the safe 80% on the app's dark red.
mask = Image.new("RGBA", (512, 512), THEME)
inner = src.resize((400, 400), Image.LANCZOS)
mask.paste(inner, (56, 56), inner)
mask.save(icons / "icon-maskable-512.png")

(TMP / "manifest.webmanifest").write_text(json.dumps({
    "name": "NovaPlay", "short_name": "NovaPlay", "description": "NovaPlay games in your browser",
    "start_url": "/", "scope": "/", "display": "standalone", "orientation": "any",
    "background_color": THEME, "theme_color": THEME,
    "icons": [
        {"src": "/web-icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "/web-icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "/web-icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}, indent=2))

# The page: the app's own index.html, plus
#  - on a computer (wide window, top page): the phone frame (web-shell.html) replaces the page, and the app
#    runs inside it (the frame's page is this same index.html, opened inside the iframe, where it is not "top");
#  - on a phone: the app runs full screen, with phone-friendly meta tags and no scrollbars or text selection.
html = (TMP / "index.html").read_text()
shell = (MOBILE / "scripts" / "web-shell.html").read_text()
shell_js = json.dumps(shell).replace("</", "<\\/")
head_extra = f"""
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
    <meta name="theme-color" content="{THEME}" />
    <meta name="description" content="NovaPlay: all your favourite games in one place." />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="NovaPlay" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/web-icons/apple-touch-icon.png" />
    <style>
      html, body {{ background: {THEME}; overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }}
      body {{ height: 100dvh; -webkit-user-select: none; user-select: none; touch-action: manipulation; }}
      input, textarea {{ -webkit-user-select: text; user-select: text; }}
      * {{ scrollbar-width: none; }}
      *::-webkit-scrollbar {{ display: none; }}
    </style>
    <script>
      (function () {{
        // A computer (wide window, not already inside the phone frame): show the page with the phone frame.
        if (window.self !== window.top || window.innerWidth <= 700 || /[?&]plain=1/.test(location.search)) return;
        document.open();
        document.write({shell_js});
        document.close();
      }})();
    </script>
"""
# The app's bundle is loaded by a script of ours instead of a plain <script defer>: the phone frame's page must
# not start the app itself (the frame's iframe does).
bundle = re.search(r'<script src="(/_expo/static/js/web/[^"]+)" defer></script>', html)
assert bundle, "the app bundle tag was not found in index.html"
loader = (
    "<script>(function(){"
    "if(window.self===window.top&&window.innerWidth>700&&!/[?&]plain=1/.test(location.search))return;"
    f"var s=document.createElement('script');s.src='{bundle.group(1)}';s.defer=true;document.body.appendChild(s);"
    "})();</script>"
)
html = html.replace(bundle.group(0), loader, 1)
html = re.sub(r'<meta name="viewport"[^>]*/>', "", html)
html = html.replace("<title>NovaPlay</title>", "<title>NovaPlay</title>" + head_extra, 1)
assert "web-shell" not in html and "phone frame" in html
(TMP / "index.html").write_text(html)

# Into backend/public.
for name in OWNED:
    target = PUBLIC / name
    if target.is_dir():
        shutil.rmtree(target)
    elif target.exists():
        target.unlink()
for entry in TMP.iterdir():
    if entry.name == "metadata.json":
        continue
    dest = PUBLIC / entry.name
    if entry.is_dir():
        shutil.copytree(entry, dest)
    else:
        shutil.copy2(entry, dest)
size = sum(f.stat().st_size for n in OWNED if (PUBLIC / n).exists() for f in ([PUBLIC / n] if (PUBLIC / n).is_file() else (PUBLIC / n).rglob("*")) if f.is_file())
print(f"==> Website written to {PUBLIC} ({size / 1e6:.1f} MB)")
