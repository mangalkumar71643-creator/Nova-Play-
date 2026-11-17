# NovaPlay game sounds

Every game has its own sound pack in `mobile/assets/sounds/games/<game>/`
(`start`, `step`, `tick`, `land`, `reveal`, `launch`, `loop`, `cashout`, `special`, `win`, `bigwin`, `lose` — only the ones that
fit that game). `mobile/src/sound/packs.ts` is the generated index the app bundles.

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
near-identical sounds of the same kind (the build reports any pair above 0.95 similarity; the current worst is about 0.94).
Output is deterministic: the same inputs always give the same files.

To change one game's sound, edit its function in `games_a.py` (crash and step games) or `games_b.py` (tables, lotteries, slots,
instant games), then run the build with `--only <game>` to hear just that game (this does not rewrite `packs.ts`), and finally a
full build.
