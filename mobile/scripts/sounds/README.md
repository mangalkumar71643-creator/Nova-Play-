# NovaPlay game sounds

Every game has its own sound pack in `mobile/assets/sounds/games/<game>/`
(`start`, `step`, `tick`, `land`, `reveal`, `launch`, `countdown`, `loop`, `cashout`, `special`, `win`, `bigwin`, `lose` — only the
ones that fit that game). `mobile/src/sound/packs.ts` is the generated index the app bundles.

## How they are made

* **Synthesised here** (`lib.py`, `common.py`, `games_a.py`, `games_b.py`): FM bells, Karplus-Strong plucks, marimba bars,
  filtered-noise whooshes / explosions, engines, crowds, drums (tabla / dhol), arcade blips, … Each game gets its own root
  note, scale, instrument and signature effects (a howl for Wolf Moon, thunder for Gates of Zeus, tabla and dhol for the Indian
  card games, a vault tumbler for Vault Heist, …).
* **Card, chip and dice foley** comes from Kenney's *Casino Audio* pack — **CC0 (public domain)**, https://kenney.nl/assets/casino-audio
  (also on OpenGameArt: https://opengameart.org/content/casino-audio). It is mixed, pitch-shifted and layered, never used alone as a
  whole game's sound. The pack itself is not stored in this repo.
* Nothing else is third-party. No attribution is required for CC0, but it is credited here anyway — thank you, Kenney.

## Rebuild

```bash
pip install numpy scipy soundfile        # and ffmpeg on PATH
# download the CC0 pack once (any folder that contains Audio/*.ogg):
curl -LO https://opengameart.org/sites/default/files/kenney_casino-audio.zip && unzip kenney_casino-audio.zip -d /tmp/kenney_casino
python3 mobile/scripts/sounds/build.py --kenney /tmp/kenney_casino --report
```

`build.py` renders every pack, levels each kind of sound to the same loudness (so no game is much louder than another), exports
mp3 (loops are wav so they repeat without a gap), rewrites `packs.ts` and prints a "too alike" check — no two games should have
near-identical sounds of the same kind (the build reports any pair above 0.95 similarity; the current worst is about 0.95).
Output is deterministic: the same inputs always give the same files.

To change one game's sound, edit its function in `games_a.py` (crash and step games) or `games_b.py` (tables, lotteries, slots,
instant games), then run the build with `--only <game>` to hear just that game (this does not rewrite `packs.ts`), and finally a
full build.

## How the app plays them

* `mobile/src/sound/engine.ts` — one global on/off switch (Settings → Sound Effects, in the info card of the games that have one, and the speaker icon of the games that have it), the pack of the
  game on screen, and `createGamePlayers()` for the screens that play their own cues (tick / land / win / big).
* `mobile/src/sound/apiHook.ts` — plays the sounds of every other game from the API traffic: a bet or spin when it is sent or answered,
  steps and cash-outs, a crash game's take-off / flight / crash from its round polls, the countdown, draw and landing of timed rounds from
  the server's clock, and a win or loss when the waiting bets come back settled.
* `mobile/src/sound/games.ts` — which route / API path / kind each game is, and how a screen's cues map onto its pack.
* `cd mobile && npx tsx scripts/sounds/check-api-hook.ts` — checks all of the above on made-up API traffic and a virtual clock, and that
  every game has the sounds its kind needs.

## Background music

A game can have a background music loop on top of its sound effects (Aviator, Chicken Road and Seven Up Down have one). Give `music.py` the track and the game's key:

```bash
python3 -I mobile/scripts/sounds/music.py aviator /path/to/track.mp3 --volume 0.4
```

It finds where the track's fade-in ends and its fade-out begins, picks the loop end that lines up best with the part just before the
loop start, cross-fades the join (so the repeat has no jump), levels the loop to -20 LUFS, encodes an mp3 into
`mobile/assets/sounds/music/<game>.mp3` and rewrites `mobile/src/sound/music.ts`. The app plays it while that game is on screen, pauses it
in the background, and it has its own switch (Settings → Music) besides the main sound switch. Where a track comes from is written down in
`mobile/assets/sounds/music/README.md`.

A track that already loops is kept whole with `--as-is` (Chicken Road). A clip of only a few seconds that is not a loop has no loop end to look
for: `--short --from 0 --to <its length> --xfade 0.15` cross-fades its last 0.15 s into its first (Seven Up Down's 3 s clip, which therefore
repeats about every 3 s).

## Sounds the owner supplies

`supplied/<game>/<event>.<mp3|wav|flac|...>` replaces the synthesised sound of that event when the packs are built (see
`supplied/README.md` for where each one comes from). A sound that is mostly bass (a phone speaker cannot play it) is cut from ~110 Hz up and
levelled without a limiter; every other supplied sound is only trimmed, levelled and encoded. `countdown` is one sound for the last seconds
of a timed round: Win Go, K3, 5D and Trx Win play it from 5.1 s before the round ends (`countdownMs` in `src/sound/games.ts`; the three
last ones share Win Go's file through `SUPPLIED_SHARED` in `build.py`), for everyone watching, and if a player joins late it starts from the
part that is still to come.

A supplied sound that is shorter than the thing it goes with is repeated, each repeat cross-faded into the one before, until it covers the time
(`SUPPLIED_COVER` in `build.py`: Seven Up Down's dice roll lasts 2 s, from betting closing to the result). A table game's reveal sound is
normally heard only by players who have bets; `revealForAll` in `src/sound/games.ts` makes it heard by everyone watching (Seven Up Down:
everybody sees the dice roll).

## Interface sounds

Sounds of the interface itself (not of a game) live in `supplied/ui/<name>.<ext>`; `build.py` trims and levels them like the games' sounds
and writes `assets/sounds/ui/<name>.mp3`. `src/sound/ui.ts` lists them and plays them (`playUi('popupClose')`); they follow the same
Sound Effects switch as the games' sounds. So far there are three:

- the touch sound (`tap`), heard when a button, tab, tile, row or switch of the interface is tapped. In every screen and component
  that is not a game it comes from `components/TapPressable.tsx`, used in place of the React Native `Pressable` (it plays the sound
  after the button's own handler has run, only when the press does something, and not when the handler makes a sound of its own:
  a popup's cross makes the popup sound; `silent` switches it off for one button, as for a popup card that only absorbs taps).
  A switch uses `onValueChange={withTapSound(onChange)}`. In a game screen only the interface buttons make it (Back, Deposit,
  Withdraw, Help, the Rules / History / pay-table / My bets buttons and the tabs of that panel, the sound switch), through
  `onPress={withTapSound(...)}`; the buttons that are part of the play keep the game's own sounds. The check script fails if a
  menu file imports `Pressable` from react-native or one of those game-screen buttons is not wrapped.

- the popup-closing sound, played by the cross of every popup in the app (games, the Home popups added from the admin panel, VIP,
  Profile ...) through `onPress={withPopupSound(() => setPanel(null))}`. A new popup cross needs the same wrapper
  (`npx tsx scripts/sounds/check-api-hook.ts` fails if one is missing; a cross that clears something, like "clear picks", has none).
- the chip sound (`playChipBet()`), heard when a chip goes onto a bet: a tap on a betting area, Rebet or Double in the seven chip table
  games (Seven Up Down, Dragon Tiger, Andar Bahar, Teen Patti, Jhandi Munda, Roulette, Baccarat), and a chip added to the bet in Blackjack. It is called
  inside `placeChips`, right after the bet is accepted (a refused bet, betting closed or not enough balance, makes no sound), so it is
  heard at the tap and not when the server answers. It is these games' only bet sound: their packs have no `start` (`NOT_IN_PACK` in
  `build.py`) and `apiHook.ts` plays nothing for a table game's `/bet` reply. A new chip game puts `playChipBet()` in the same place
  (the check script fails if a screen with `type PlacedChip` has none). Four players take turns, so quick taps overlap and do not cut each other off.

A very quiet file (the touch sound's peak is -21 dBFS) is brought up to a normal level before the silence around it is trimmed
(`UI_BRING_UP_FIRST` in `build.py`), because the trimming works on absolute levels and would cut off the faint end of its ring.

A sound is levelled by what a phone speaker reproduces (300 Hz to 7 kHz). One that has almost nothing there (the chip sound is a low thump
and a high hiss) would come out about twice as loud as the rest, so those are listed in `UI_LEVEL_BY_WHOLE` in `build.py` and levelled by the whole sound.
