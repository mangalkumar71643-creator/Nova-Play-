#!/usr/bin/env python3
"""
Builds one clean, seamless loop of a game's background music from a recording of the game (a screen recording, say) in which the
game's music repeats the same loop over and over.

  python3 -I mobile/scripts/sounds/music_loop.py recording.mp4 loop.wav [--min 4] [--max 40] [--beats 16]
  python3 -I mobile/scripts/sounds/music.py <game> loop.wav --as-is        (then levels, encodes and registers the loop)

* decodes the recording's audio with ffmpeg (mono, 44.1 kHz),
* finds the length of the repeat: the lag, between --min and --max seconds, at which the recording best matches itself (waveform
  correlation, to the sample; a shorter exact repeat inside the lag, a half or a third of it, wins over the longer one),
* cuts the recording into copies of that length and combines them sample by sample with the median, so a sound that is in only one
  copy (a tap, a notification, the fade-in at the start of the recording, a cut-off end) drops out and the codec noise of the
  recording is averaged down,
* starts the loop at the quietest of its --beats beat boundaries. The music repeats exactly, so a loop cut at any point is seamless;
  a quiet start only hides the join in a player that is not gapless,
* writes loop.wav (mono, 44.1 kHz, 16 bit) and prints what it found: the repeat length, how well the copies agree, where the
  loop starts in the recording.

Fails (and writes nothing) when the recording does not repeat (the best correlation is below --min-corr): then the music is not a
loop and `music.py` (loop point search) or `music.py --short` is the tool to use.

The recording is untrusted input: it is only ever decoded by ffmpeg (run this script with `python3 -I`).
The rights to the music are the owner's: say where it came from in assets/sounds/music/README.md.
"""
import argparse
import io
import subprocess
import sys

import numpy as np
import soundfile as sf

SR = 44100


def decode(path):
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vn", "-ac", "1", "-ar", str(SR), "-f", "wav", "pipe:1"], capture_output=True, check=True)
    x, _ = sf.read(io.BytesIO(p.stdout), dtype="float64")
    return x


def match_scores(m, lags):
    """Normalised correlation of the signal with itself shifted by each lag (samples)."""
    n = len(m)
    f = np.fft.rfft(m, 2 * n)
    ac = np.fft.irfft(f * np.conj(f))[:n]
    cs = np.concatenate([[0.0], np.cumsum(m ** 2)])
    return ac[lags] / np.sqrt(cs[n - lags] * (cs[n] - cs[lags]) + 1e-12)


def repeat_length(m, lo_s, hi_s):
    """(lag in samples, correlation) of the best self-match between lo_s and hi_s seconds; the shortest exact repeat wins."""
    n = len(m)
    lags = np.arange(int(lo_s * SR), min(int(hi_s * SR), n // 2))
    scores = match_scores(m, lags)
    k = int(np.argmax(scores))
    best, best_score = int(lags[k]), float(scores[k])
    for parts in (2, 3, 4, 5, 6, 8):  # an exact repeat of 1/parts of the lag?
        centre = best / parts
        if centre < lo_s * SR:
            break
        sub = np.arange(int(centre) - 3, int(centre) + 4)
        s = match_scores(m, sub)
        j = int(np.argmax(s))
        if s[j] >= 0.97 * best_score:
            best, best_score = int(sub[j]), float(s[j])
            break
    return best, best_score


def build_loop(m, period):
    copies = int(np.ceil(len(m) / period))
    grid = np.full((copies, period), np.nan)
    for k in range(copies):
        seg = m[k * period:(k + 1) * period]
        grid[k, : len(seg)] = seg
    loop = np.nanmedian(grid, axis=0)
    # how far each copy is from the loop, typically (dB below the loop's own level)
    level = np.sqrt(np.mean(loop ** 2))
    diffs = [20 * np.log10(np.sqrt(np.nanmean((grid[k] - loop) ** 2)) / level + 1e-12) for k in range(copies) if np.isfinite(grid[k]).sum() > period // 2]
    return loop, copies, diffs


def quietest_beat(loop, beats):
    """Sample at which the loop is quietest around one of its beat boundaries."""
    win = int(0.02 * SR)
    env = np.sqrt(np.convolve(loop ** 2, np.ones(win) / win, mode="same"))
    best, where = None, 0
    half = int(0.03 * SR)
    for b in range(beats):
        c = int(round(b * len(loop) / beats))
        lo, hi = max(0, c - half), min(len(loop), c + half)
        j = lo + int(np.argmin(env[lo:hi]))
        if best is None or env[j] < best:
            best, where = float(env[j]), j
    return where


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("recording")
    ap.add_argument("out")
    ap.add_argument("--min", type=float, default=4.0, help="shortest repeat to look for, seconds")
    ap.add_argument("--max", type=float, default=40.0, help="longest repeat to look for, seconds")
    ap.add_argument("--beats", type=int, default=16, help="beats in the loop (the loop starts on the quietest of them)")
    ap.add_argument("--min-corr", type=float, default=0.9, help="how well the recording has to repeat itself")
    a = ap.parse_args()

    m = decode(a.recording)
    print(f"recording: {len(m) / SR:.2f} s of audio")
    period, corr = repeat_length(m, a.min, a.max)
    print(f"repeat length {period} samples = {period / SR:.4f} s, waveform correlation {corr:.4f}")
    if corr < a.min_corr:
        sys.exit(f"the recording does not repeat itself (correlation {corr:.2f} < {a.min_corr}): not a loop, nothing written")
    loop, copies, diffs = build_loop(m, period)
    print(f"{copies} copies (the last may be partial); each differs from the loop by {', '.join(f'{d:.1f}' for d in diffs)} dB (codec noise; much more would mean sounds that are in one copy only)")
    start = quietest_beat(loop, a.beats)
    loop = np.roll(loop, -start)
    print(f"the loop starts at {start / SR:.3f} s into the repeat (its quietest beat), {len(loop) / SR:.4f} s long, peak {np.max(np.abs(loop)):.2f}")
    sf.write(a.out, loop.astype(np.float32), SR, subtype="PCM_16")
    print("wrote", a.out)


if __name__ == "__main__":
    main()
