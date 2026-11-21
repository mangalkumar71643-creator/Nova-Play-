# Background music

Music tracks of the games that have one. `music.json` holds how loud the app plays each (0-1) and `../../../src/sound/music.ts` is the
index the app bundles; both are written by `scripts/sounds/music.py`.

| File | Where it comes from |
|---|---|
| `aviator.mp3` | The track the app's owner supplied for Aviator (file name `mk_song_mp_.mp3`, 73 s, sent in the chat on 2026-11-18), cut into a gapless 64 s loop. **The owner is responsible for having the rights to use it.** |
| `chickenroad.mp3` | The Chicken Road loop the owner sent (file name `chicken_road_seamless.mp3`, 20.6 s, sent in the chat on 2026-11-19). It already loops, so it is kept whole (`--as-is`), only levelled and encoded. Its container tags show it was cut out of a video. **The owner is responsible for having the rights to use it.** |
| `sevenupdown.mp3` | The background sound the owner supplied for Seven Up Down (file name `7up_down.mp3`, 3 s, mono, quiet at -26.5 LUFS, sent in the chat on 2026-11-21; it replaced a 10 s clip, `video_audio.mp3`, that the owner said was the wrong one). It is a short clip that does not loop by itself (it starts quietly and ends at full level), so its last 0.15 s is cross-faded into its first, a 2.85 s loop with no jump at the seam (`--short --from 0 --to 3 --xfade 0.15`), and it repeats about every 3 s. Its container tags show it was cut out of a video. **The owner is responsible for having the rights to use it.** |

Add a track: `python3 -I mobile/scripts/sounds/music.py <game> /path/to/track.mp3 [--volume 0.4]`, then add a line to the table above.
