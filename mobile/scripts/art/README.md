# Game artwork

The pictures of the newer games are drawn in code and rendered to WEBP, so they can be changed and rebuilt without any design tool.

```bash
# needs Playwright (Chromium) for Node and Pillow for Python
node mobile/scripts/art/build.js                 # every piece
node mobile/scripts/art/build.js redbutton       # one game
node mobile/scripts/art/build.js redbutton/lcd   # one piece
```

* Each piece is a small module `scripts/art/<game>/<piece>.js` that returns SVG markup (gradients, blurs, lighting filters, patterns).
* `build.js` renders it in Chromium at the scale the module asks for and writes the WEBP named by the module's `out`
  (`assets/<game>/…`, or `assets/icons/…` for a Home tile).
* The app only uses the finished pictures (SVG filters are not available in the app); the moving parts (the LCD digits, the
  lamps, the reels) are drawn live on top of them.
* To use a painted picture instead, save it over the file the app loads (same name, same shape) — nothing else needs to change.
* `teenpatticlub/` draws the back of the cards (`card-back`), the emblem and the felt grain of the table, and the Home tile of Teen Patti Club
  (the card faces and the chips are drawn live by the app, as SVG, so they stay sharp at any size).
