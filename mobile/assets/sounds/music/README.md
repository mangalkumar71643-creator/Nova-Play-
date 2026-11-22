# Background music

Music tracks of the games that have one. `music.json` holds how loud the app plays each (0-1) and `../../../src/sound/music.ts` is the
index the app bundles; both are written by `scripts/sounds/music.py`.

| File | Where it comes from |
|---|---|
| `aviator.mp3` | The track the app's owner supplied for Aviator (file name `mk_song_mp_.mp3`, 73 s, sent in the chat on 2026-11-18), cut into a gapless 64 s loop. **The owner is responsible for having the rights to use it.** |
| `chickenroad.mp3` | The Chicken Road loop the owner sent (file name `chicken_road_seamless.mp3`, 20.6 s, sent in the chat on 2026-11-19). It already loops, so it is kept whole (`--as-is`), only levelled and encoded. Its container tags show it was cut out of a video. **The owner is responsible for having the rights to use it.** |
| `sevenupdown.mp3` | The background music the owner supplied for Seven Up Down (file name `7_up_down.mp3`, 51 s, mono, 48 kHz, -27.4 LUFS, sent in the chat on 2026-11-22; it replaced the 3 s clip `7up_down.mp3` from 2026-11-21, which looped about every 3 s). It has a steady beat of 0.32 s that carries on evenly from its end into its start (the clip is cut on the beat) and its start and end sound alike, with no click where they meet (checked: the high-frequency energy at the seam is an ordinary 93rd percentile of the track, not a spike). So it is kept whole as the loop (`--as-is`), only levelled to -20 LUFS and encoded (a 51 s loop, it repeats about every 51 s). There is no speech in it (a speech recognizer finds no words). Its container tags show it was cut out of a video. **The owner is responsible for having the rights to use it.** |

Add a track: `python3 -I mobile/scripts/sounds/music.py <game> /path/to/track.mp3 [--volume 0.4]`, then add a line to the table above.
