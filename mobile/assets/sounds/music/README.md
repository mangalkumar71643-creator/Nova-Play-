# Background music

Music tracks of the games that have one. `music.json` holds how loud the app plays each (0-1) and `../../../src/sound/music.ts` is the
index the app bundles; both are written by `scripts/sounds/music.py`.

| File | Where it comes from |
|---|---|
| `aviator.mp3` | The track the app's owner supplied for Aviator (file name `mk_song_mp_.mp3`, 73 s, sent in the chat on 2026-11-18), cut into a gapless 64 s loop. **The owner is responsible for having the rights to use it.** |
| `chickenroad.mp3` | The Chicken Road loop the owner sent (file name `chicken_road_seamless.mp3`, 20.6 s, sent in the chat on 2026-11-19). It already loops, so it is kept whole (`--as-is`), only levelled and encoded. Its container tags show it was cut out of a video. **The owner is responsible for having the rights to use it.** |
| `sevenupdown.mp3` | The track the owner supplied for Seven Up Down (file name `video_audio.mp3`, 10 s, sent in the chat on 2026-11-21): about 6 s of a quiet rising texture and then a loud impact with a long low tail, mono, and almost all of its energy below 250 Hz (80 % below 100 Hz, which a phone speaker cannot play). It is not a loop, so its last 0.5 s is cross-faded into its first, a 9 s loop with no jump at the seam (`--xfade 0.5 --from 0 --to 10`). Its container tags show it was cut out of a video. **The owner is responsible for having the rights to use it.** |

Add a track: `python3 -I mobile/scripts/sounds/music.py <game> /path/to/track.mp3 [--volume 0.4]`, then add a line to the table above.
