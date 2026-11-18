# Background music

Music tracks of the games that have one. `music.json` holds how loud the app plays each (0-1) and `../../../src/sound/music.ts` is the
index the app bundles; both are written by `scripts/sounds/music.py`.

| File | Where it comes from |
|---|---|
| `aviator.mp3` | The track the app's owner supplied for Aviator (file name `mk_song_mp_.mp3`, 73 s, sent in the chat on 2026-11-18), cut into a gapless 64 s loop. **The owner is responsible for having the rights to use it.** |

Add a track: `python3 -I mobile/scripts/sounds/music.py <game> /path/to/track.mp3 [--volume 0.4]`, then add a line to the table above.
