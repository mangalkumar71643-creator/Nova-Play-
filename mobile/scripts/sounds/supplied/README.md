# Sounds supplied by the app's owner

A file here replaces the synthesised sound of the same game and event: `supplied/<game>/<event>.mp3` (events: start, step, tick, land,
reveal, launch, cashout, special, win, bigwin, lose). `build.py` decodes it with ffmpeg, trims it, makes it as loud as every other sound
and puts it in the game's pack. (A looping background track is different: use `music.py`.)

| File | Where it comes from |
|---|---|
| `aviator/special.mp3` | The 1.9 s sound the owner sent for Aviator (file name `aviator_background_music.mp3`, sent in the chat on 2026-11-19). The owner first called it the take-off sound, then corrected that: it is the **crash** sound. It plays when the plane crashes and never before: the server keeps the crash secret until it happens, and the app plays nothing that could warn a player. Its container tags show it was cut out of a video. **The owner is responsible for having the rights to use it.** |
