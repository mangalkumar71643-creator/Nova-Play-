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
* `garuda/` draws Garuda Gold: the temple at sunset (`scene.js`), the golden Garuda over it (`hero.js`: feather fans for the wings, the
  bevel applied outside the mirror so both wings are lit alike), the symbols (`symbols.js`: letters on sandstone tiles, the gems in gold
  tiles, the WILD mask on red; cells of 98 x 76), the multiplier coins (`coins.js`), the reel housing (`frame.js`: frame, backings, the
  centre window), the name plate and NUDGE lamp (`title.js`), the deck (`panel.js`), the buttons and the EX switch (`buttons.js`), the
  backdrop (`bg.js`) and the Home tile (`icon.js`, built last: it uses the scene, the hero, a ruby and the 500x coin). All of it is our own
  drawing: no picture of another game is used.
* `chickenroad-popup/` is not a piece of the app: it draws the picture of Chicken Road for **Admin -> Popups** (a popup is an uploaded picture,
  so it needs no new app: the app and the website show it once when they open). `poster.js` builds `assets/promo/chicken-road-popup.webp`
  (840 x 1260, 2:3; `chicken-road-popup.png` is the same picture for uploading). It is made of the game's own screen: `source/game-road.webp` and
  `source/game-buttons.webp` are cut out of the running app (the road with the ambulance coming, the Cash Out / GO buttons), `source/chicken.webp`
  is the game's chicken with its edge cleaned (`clean_chicken.py`, because the popup draws it three times larger than the game does). The
  headline, "UP TO 1189x" (the top multiplier of Hardcore: x1189.4) and the footer are in `poster.js`; to change the words or the numbers, edit
  them there and build again: `node scripts/art/build.js chickenroad-popup`. The admin panel shrinks an upload to 900 px wide at most and saves it as
  WebP 0.86, which this picture survives without any visible change. None of it goes into the app (nothing `require`s `assets/promo/`).
  `slide.js` is the same game for the **Home Slider** instead (a slide stands on the red stage and the app draws its own Play button under it):
  `assets/promo/chicken-road-slide.webp` (900 x 640, transparent, about the 1.4 : 1 that the stage shows biggest; `.png` for uploading), made of the
  game's chicken, taxi, police car and manholes, the egg and name of the header, and an "UP TO 1189x" plate in the red and gold of the Home. In the
  panel the slide's button text must be short (**PLAY**; "PLAY NOW" is cut off) and the game **Chicken Road**. The panel's "Remove background" box
  (on by default) clears white / light-grey and near-black pixels that touch the outside of a slide, so every white part of the slide sits inside a
  maroon or gold outline and there are no black shadows; checked through the real panel: nothing is lost.
* `wingo-slide/` draws the **Home Slider** picture of Win Go the same way: `assets/promo/wingo-slide.webp` (900 x 640, transparent; `.png` for
  uploading), made of the game's own look (WinGoScreen.tsx): its number chips 0-9 in their colours with the 9X under each, its Green 2X /
  Violet 4.5X / Red 2X buttons on its white board in a gold frame, the clock of its period tabs beside the name, three big chips (7, 0, 5) and an
  "UP TO 9X" plate (a number pays 9X, the game's top pay). In the panel: button text **PLAY**, game **Win Go**, "Remove background" on (checked
  through the real panel and on Home at 360 x 640, 411 x 783 and 430 x 932). Build: `node scripts/art/build.js wingo-slide`.
* Size: the pictures are WEBP at quality 80 at most (`to_webp.py` caps what `build.js` writes; `shrink_webp.py` does the same for pictures that
  are already in `assets/`, and leaves a picture alone if it would look noticeably worse). The fonts are small subsets too, see `scripts/fonts/`.
