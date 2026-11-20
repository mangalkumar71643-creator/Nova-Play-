#!/usr/bin/env python3
"""
Renders every game's sound pack and writes
  mobile/assets/sounds/games/<game>/<event>.(mp3|wav)
  mobile/src/sound/packs.ts          (static require() index Metro can bundle)

Usage:
  python3 build.py --kenney /path/to/kenney_casino        (folder that contains Audio/*.ogg)
                   [--only aviator,mines] [--report]

Inputs: the CC0 "Casino Audio" pack from Kenney (https://kenney.nl/assets/casino-audio) for the card /
chip / dice foley, everything else is synthesised in lib.py / common.py. See README.md.
"""
import argparse
import os
import shutil
import sys
from multiprocessing import Pool

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import common as C  # noqa: E402
import games_a  # noqa: E402
import games_b  # noqa: E402
import lib as L  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
# Sounds the app's owner supplied: supplied/<game>/<event>.<mp3|wav|ogg|m4a|...> replaces that event's synthesised sound.
SUPPLIED = os.path.join(HERE, "supplied")
AUDIO_EXT = (".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac")
# A supplied sound that more than one game plays: (the folder it is kept in, the event) -> the other games that use it too.
# (The owner asked for Win Go's last-5-seconds countdown in K3, 5D and Trx Win as well.)
SUPPLIED_SHARED = {("wingo", "countdown"): ["k3", "fived", "trxwin"]}
OUT = os.path.join(ROOT, "assets", "sounds", "games")
PACKS_TS = os.path.join(ROOT, "src", "sound", "packs.ts")

# Interface sounds the owner supplied (not a game's): supplied/ui/<name>.<ext> -> assets/sounds/ui/<name>.mp3 (played by src/sound/ui.ts).
UI_SUPPLIED = os.path.join(SUPPLIED, "ui")
UI_OUT = os.path.join(ROOT, "assets", "sounds", "ui")
# Interface sounds whose energy is mostly outside what a phone speaker reproduces (a low thump and high hiss, almost nothing
# between 300 Hz and 7 kHz). Levelled by that band they come out about twice as loud as every other sound, so these are
# levelled by the whole sound instead.
UI_LEVEL_BY_WHOLE = {"chip_bet"}

ALL = {**games_a.GAMES_A, **games_b.GAMES_B}

# The table games' bet is heard as the owner's chip sound (supplied/ui/chip_bet.mp3), played by the screen the moment the chip goes
# onto the table, so their packs have no "start" of their own. The recipes still make one (the game's other sounds are drawn from
# the same random stream, and leaving it out would change them), it is only not written.
NOT_IN_PACK = {g: {"start"} for g in ("sevenupdown", "dragontiger", "andarbahar", "teenpatti", "jhandimunda", "roulette", "baccarat")}

EVENTS = ["start", "step", "tick", "land", "reveal", "launch", "countdown", "loop", "cashout", "special", "win", "bigwin", "lose"]

# Target RMS (linear, over the audible part) per event so that no game or event is much louder than another.
RMS = {
    "tick": 0.075, "step": 0.11, "start": 0.13, "land": 0.14, "reveal": 0.13, "launch": 0.13, "cashout": 0.15,
    "special": 0.17, "win": 0.16, "bigwin": 0.18, "lose": 0.12, "loop": 0.06, "countdown": 0.14,
    "ui": 0.14,  # the app's own interface sounds (a popup being closed ...), see build_ui()
}
MAX_LEN = 4.2  # seconds, one-shots
MAX_LEN_OF = {"countdown": 7.0}  # the last-5-seconds sound of a timed round is longer


def soft_limit(x, knee=0.7):
    a = np.abs(x)
    over = a > knee
    y = x.copy()
    y[over] = np.sign(x[over]) * (knee + (1 - knee) * np.tanh((a[over] - knee) / (1 - knee)))
    return y


def fft_filter(x, hp=None, lp=None, order=3, loop=False):
    """Zero-phase high-pass / low-pass in the frequency domain (circular for loops, so they stay seamless)."""
    n = len(x)
    m = n if loop else n + 4096
    X = np.fft.rfft(x, m)
    fr = np.fft.rfftfreq(m, 1 / L.SR)
    H = np.ones_like(fr)
    if hp:
        H *= 1 / np.sqrt(1 + (hp / np.maximum(fr, 1e-3)) ** (2 * order))
    if lp:
        H *= 1 / np.sqrt(1 + (fr / lp) ** (2 * order))
    return np.fft.irfft(X * H, m)[:n].astype(np.float32)


def energy(x):
    return float(np.sum(np.asarray(x, dtype=np.float64) ** 2)) + 1e-12


def phone_shape(x, loop):
    """Make it work on a phone speaker: nothing below ~140 Hz (it only costs headroom), bass that would be
    inaudible gets harmonics in the range a small speaker can play, and nothing piercing above ~7 kHz."""
    x = fft_filter(x, hp=140, loop=loop)
    low = fft_filter(x, lp=300, loop=loop)
    audible = x - low
    if energy(audible) < 0.45 * energy(x) and energy(low) > 1e-8:
        g = 6.0 / (float(np.max(np.abs(low))) + 1e-9)
        harm = fft_filter(np.tanh(g * low), hp=300, lp=2600, loop=loop)
        harm = harm * float(np.sqrt(energy(low) / energy(harm))) * 0.9
        x = audible + harm + 0.25 * low
    x = fft_filter(x, lp=7500, loop=loop)
    centroid_hi = energy(fft_filter(x, hp=6500, loop=loop)) / energy(x)
    if centroid_hi > 0.25:  # a hiss-heavy sound: take the top off a little more
        x = fft_filter(x, lp=5200, loop=loop)
    return x


def finish(event, x, faithful=False, whole=False):
    """faithful=True (a sound the owner supplied): keep it as it is, only trim, level and encode it.
    whole=True: level by the whole sound and not by the phone-speaker band (for a sound that has hardly any energy in it)."""
    x = np.nan_to_num(np.asarray(x, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    loop = event == "loop"
    if loop:
        n = L.N(1.0)
        if len(x) != n:
            raise ValueError(f"loop must be exactly 1.0 s, got {len(x) / L.SR:.3f}")
        x = x - float(np.mean(x))
    else:
        x = L.trim(x, 0.003, 0.004)
        cap = L.N(MAX_LEN_OF.get(event, MAX_LEN))
        if len(x) > cap:
            x = x[:cap]
    bass_heavy = False
    if faithful:
        # A supplied sound that is mostly bass (a phone cannot play it) keeps what a phone speaker can: from ~110 Hz up.
        bass_heavy = energy(fft_filter(x, lp=150, loop=loop)) > 0.4 * energy(x)
        x = fft_filter(x, hp=110 if bass_heavy else 35, loop=loop)
    else:
        x = phone_shape(x, loop)
    if not loop:
        x = L.trim(x, 0.002, 0.004)
        x = L.fade(x, 0.002, 0.035)
        if len(x) < L.N(0.09):  # an mp3 shorter than a frame or two is not reliably readable
            x = np.concatenate([x, np.zeros(L.N(0.09) - len(x), dtype=np.float32)])
    peak = float(np.max(np.abs(x))) if len(x) else 0.0
    if peak < 1e-5:
        raise ValueError("silent sound")
    # Level by what a phone speaker reproduces (300 Hz - 7 kHz), so every sound is equally loud there.
    band = x if whole else fft_filter(x, hp=300, lp=7000, loop=loop)
    bpeak = float(np.max(np.abs(band))) + 1e-9
    act = np.abs(band) > 0.03 * bpeak
    rms = float(np.sqrt(np.mean(band[act] ** 2)))
    scale = RMS[event] / rms
    if bass_heavy:
        scale = min(scale, 0.85 / peak)  # no limiter on it: keep it clean
    x = x * scale
    x = soft_limit(x)
    p = float(np.max(np.abs(x)))
    if p > 0.97:
        x = x * (0.97 / p)
    return x.astype(np.float32), {"peak": peak, "rms": rms}


def fingerprint(x):
    """24 log-spaced bands x 8 time slices of the spectrogram, mean-centred and normalised (for 'too alike' checks)."""
    from scipy import signal as sg

    x = np.pad(x, (0, max(0, 4096 - len(x))))
    f, t, S = sg.spectrogram(x, fs=L.SR, nperseg=1024, noverlap=768, mode="magnitude")
    edges = np.geomspace(80, 12000, 25)
    B = np.array([S[(f >= lo) & (f < hi)].sum(axis=0) for lo, hi in zip(edges[:-1], edges[1:])])
    cols = np.array_split(np.arange(B.shape[1]), 8)
    B = np.stack([B[:, c].mean(axis=1) if len(c) else B[:, -1] for c in cols], axis=1)
    B = np.log1p(B * 40)
    B = B - B.mean()
    n = np.linalg.norm(B)
    return (B / (n + 1e-9)).ravel()


def supplied_files(game):
    """event -> file of the sounds the owner supplied for this game (its own folder, plus the ones it shares)."""
    out = {}

    def scan(folder, only=None):
        d = os.path.join(SUPPLIED, folder)
        if not os.path.isdir(d):
            return
        for fn in sorted(os.listdir(d)):
            ev, ext = os.path.splitext(fn)
            if ext.lower() in AUDIO_EXT and ev in EVENTS and ev != "loop" and (only is None or ev == only):
                out.setdefault(ev, os.path.join(d, fn))

    scan(game)  # its own files win over a shared one
    for (src, ev), users in SUPPLIED_SHARED.items():
        if game in users:
            scan(src, only=ev)
    return out


def render_game(args):
    game, kenney = args
    C.KENNEY["dir"] = kenney
    rng = L.rng_for(game)
    raw = ALL[game](rng)
    supplied = set()
    for ev, path in supplied_files(game).items():
        # Decoded by ffmpeg only (it is untrusted input), then levelled like every other sound.
        raw[ev] = L.load_sample(path, gain_norm=False)
        supplied.add(ev)
    files, info = {}, {}
    for ev, arr in raw.items():
        if ev not in EVENTS:
            raise ValueError(f"{game}: unknown event {ev}")
        if ev in NOT_IN_PACK.get(game, ()):
            continue
        x, st = finish(ev, arr, faithful=ev in supplied)
        d = os.path.join(OUT, game)
        os.makedirs(d, exist_ok=True)
        if ev == "loop":
            path = os.path.join(d, f"{ev}.wav")
            L.to_wav(x, path)
        else:
            path = os.path.join(d, f"{ev}.mp3")
            L.to_mp3(x, path, "72k")
        files[ev] = os.path.relpath(path, os.path.join(ROOT, "src", "sound")).replace(os.sep, "/")
        info[ev] = {"dur": len(x) / L.SR, "size": os.path.getsize(path), "raw_peak": st["peak"], "fp": fingerprint(x)}
    return game, files, info


def build_ui():
    """The interface sounds the owner supplied, trimmed and levelled like every other sound (the file is kept as it is otherwise)."""
    if not os.path.isdir(UI_SUPPLIED):
        return []
    os.makedirs(UI_OUT, exist_ok=True)
    done = []
    for fn in sorted(os.listdir(UI_SUPPLIED)):
        name, ext = os.path.splitext(fn)
        if ext.lower() not in AUDIO_EXT:
            continue
        x, _ = finish("ui", L.load_sample(os.path.join(UI_SUPPLIED, fn), gain_norm=False), faithful=True, whole=name in UI_LEVEL_BY_WHOLE)
        L.to_mp3(x, os.path.join(UI_OUT, name + ".mp3"), "96k")
        done.append((name, len(x) / L.SR))
    return done


def ts_index(done):
    lines = [
        "// GENERATED by mobile/scripts/sounds/build.py — do not edit by hand.",
        "// Sounds: Kenney 'Casino Audio' (CC0) foley mixed with sounds synthesised in scripts/sounds. See assets/sounds/games/README.md.",
        "import type { SoundEvent } from './types';",
        "",
        "export const PACKS: Record<string, Partial<Record<SoundEvent, number>>> = {",
    ]
    for game in sorted(done):
        lines.append(f"  {game}: {{")
        for ev in EVENTS:
            if ev in done[game]:
                lines.append(f"    {ev}: require('{done[game][ev]}'),")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kenney", required=True)
    ap.add_argument("--only", default="")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--alike", type=float, default=0.97)
    ap.add_argument("--top", type=int, default=40)
    a = ap.parse_args()
    games = [g for g in ALL if not a.only or g in a.only.split(",")]
    if not a.only and os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT, exist_ok=True)
    with Pool(a.jobs) as p:
        results = p.map(render_game, [(g, a.kenney) for g in games])
    done = {g: f for g, f, _ in results}
    infos = {g: i for g, _, i in results}
    if not a.only:
        os.makedirs(os.path.dirname(PACKS_TS), exist_ok=True)
        with open(PACKS_TS, "w") as fh:
            fh.write(ts_index(done))
    if not a.only:
        for name, dur in build_ui():
            print(f"ui sound {name}: {dur * 1000:.0f} ms")
    total = sum(v["size"] for i in infos.values() for v in i.values())
    nfiles = sum(len(i) for i in infos.values())
    print(f"{len(games)} games, {nfiles} sounds, {total / 1e6:.2f} MB")
    if a.report:
        # How alike are two games' sounds of the same kind? (cosine similarity of the spectrogram fingerprints)
        pairs = []
        for ev in EVENTS:
            names = [g for g in infos if ev in infos[g]]
            for i, g1 in enumerate(names):
                for g2 in names[i + 1:]:
                    s = float(np.dot(infos[g1][ev]["fp"], infos[g2][ev]["fp"]))
                    pairs.append((s, ev, g1, g2))
        pairs.sort(reverse=True)
        print(f"pairs >= {a.alike}:", sum(1 for p in pairs if p[0] >= a.alike), "of", len(pairs))
        for s, ev, g1, g2 in pairs[:a.top]:
            print(f"  {s:.3f} {ev:8s} {g1} / {g2}")

if __name__ == "__main__":
    main()
