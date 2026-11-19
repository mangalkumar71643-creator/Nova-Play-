# Sounds supplied by the app's owner

A file here replaces the synthesised sound of the same game and event: `supplied/<game>/<event>.mp3` (events: start, step, tick, land,
reveal, launch, cashout, special, win, bigwin, lose). `build.py` decodes it with ffmpeg, trims it, makes it as loud as every other sound
and puts it in the game's pack. (A looping background track is different: use `music.py`.)

| File | Where it comes from |
|---|---|
| `aviator/launch.mp3` | The take-off sound the owner sent for Aviator (file name `aviator_background_music.mp3`, 1.9 s, sent in the chat on 2026-11-19). Its container tags show it was cut out of a video. **The owner is responsible for having the rights to use it.** |
