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
* `ringgauntlet/` draws the wheel's plate (bezel, three recessed tracks, grooves), the four sentinels (one per ring and the lost one), the PLAY
  button, the logo, the backdrop and the Home tile of Ring Gauntlet; the lit arcs, the numbers on the segments and the badges are live SVG
  (the geometry in `plate.js` and in `screens/ring/RingWheel.tsx` must match).
* `turbosevens/` draws the symbols of the reels (`symbols.js`, build it first: the board and the icon embed them), the machine's top
  (`board.js`: marquee, paytable with its lit digits, the bonus-reel panel), the reel window (`reels.js`), the steel frame (`frame.js`),
  the control deck and the buttons; the reels, the WIN and balance digits and the lights are live.
