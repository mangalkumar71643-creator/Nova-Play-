"""
Shared sound builders for the game recipes (voices, jingles, stingers).

Every builder returns a float32 mono array at lib.SR. Recipes pick a root note,
scale, voice and layers per game so no two games share a sound set.
"""
import numpy as np

import lib as L

KENNEY = {"dir": None}


def K(name, semitones=0.0, gain=1.0):
    """A Kenney Casino (CC0) sample, optionally pitch-shifted."""
    x = L.load_sample(f"{KENNEY['dir']}/Audio/{name}.ogg")
    if semitones:
        x = L.pitch(x, semitones)
    return x * gain


# ------------------------------------------------------------------ voices
def voice(kind, **kw):
    d = kw.get("d", 0.7)
    if kind == "bell":
        return lambda f: L.bell(f, d, kw.get("tau", 0.5), kw.get("br", 1.0))
    if kind == "mallet":
        return lambda f: L.mallet(f, d, kw.get("tau", 0.3), kw.get("br", 1.0))
    if kind == "pluck":
        return lambda f: L.pluck(f, d, kw.get("damp", 0.996))
    if kind == "glass":
        return lambda f: L.fm(f, kw.get("ratio", 3.5), kw.get("index", 3.0), d, kw.get("tau", 0.4), kw.get("itau", 0.16))
    if kind == "epiano":
        return lambda f: L.fm(f, 1.0, kw.get("index", 2.2), d, kw.get("tau", 0.45), 0.2)
    if kind == "synth":
        def v(f):
            n = L.N(d)
            y = L.osc("saw", f, d) * 0.55 + L.osc("square", f * 1.005, d) * 0.35
            y = L.lp(y, kw.get("cut", 3200)) * L.env_exp(n, kw.get("tau", 0.25), 0.004)
            return y * 0.8
        return v
    if kind == "organ":
        def v(f):
            y = L.harmonics(f, d, kw.get("amps", [1, 0.5, 0.33, 0.2, 0.1]))
            return y * L.env_exp(L.N(d), kw.get("tau", 0.35), 0.008) * 0.5
        return v
    if kind == "brass":
        def v(f):
            n = L.N(d)
            y = L.lp(L.osc("saw", f, d) + 0.6 * L.osc("saw", f * 1.004, d), kw.get("cut", 2400))
            e = np.minimum(1, np.arange(n) / (0.03 * L.SR)) * np.exp(-np.arange(n) / L.SR / kw.get("tau", 0.35))
            return y * e * 0.45
        return v
    if kind == "sine":
        return lambda f: L.osc("sine", f, d) * L.env_exp(L.N(d), kw.get("tau", 0.2), 0.003)
    if kind == "flute":
        def v(f):
            n = L.N(d)
            t = np.arange(n) / L.SR
            y = L.osc("sine", f * (1 + 0.004 * np.sin(2 * np.pi * 5 * t)), d) + 0.15 * L.osc("sine", f * 2, d)
            y += 0.04 * L.lp(np.random.default_rng(int(f)).standard_normal(n).astype(np.float32), 5000)
            e = np.minimum(1, t / 0.04) * np.exp(-t / kw.get("tau", 0.4))
            return y * e * 0.6
        return v
    raise ValueError(kind)


def blip(f, d=0.1, kind="sine", tau=0.05, glide=0.0):
    f1 = f * (1 + glide)
    y = L.osc(kind, np.linspace(f, f1, L.N(d)), d)
    if kind in ("saw", "square"):
        y = L.lp(y, 4200)
    return y * L.env_exp(L.N(d), tau, 0.002)


# ------------------------------------------------------------------ jingles
def jingle(rng, root, scale, v, n=5, step=0.075, pattern="up", tail=0.45, rev=(0.55, 0.2), last_gain=1.25, octave_top=True):
    notes = L.scale_notes(root, scale, 2)
    idx = list(range(n))
    if pattern == "up":
        seq = [notes[i % len(notes)] for i in idx]
    elif pattern == "updown":
        half = [notes[i % len(notes)] for i in range(n // 2 + 1)]
        seq = half + half[-2::-1][: n - len(half)]
    elif pattern == "trill":
        a, b = notes[2], notes[4]
        seq = [a if i % 2 == 0 else b for i in idx[:-1]] + [notes[5 % len(notes)]]
    else:  # "chord": notes together then top note
        seq = [notes[0], notes[2], notes[4], notes[5 % len(notes)]][:n]
        step = 0.012
    if octave_top:
        seq[-1] = seq[-1] + 12 if pattern != "chord" else seq[-1]
    x = L.arp(seq, step, v, tail=tail, accent=last_gain)
    if rev:
        x = L.reverb(x, rev[0], rev[1], rng=rng)
    return x


def shimmer(rng, root_midi, d=1.2, gain=0.5):
    """High glassy sparkles rising in pitch."""
    parts = []
    for i in range(9):
        f = float(L.hz(root_midi + 12 + 2 * i + rng.integers(0, 2)))
        parts.append((L.fm(f * 2, 4.1, 2.5, 0.35, 0.18, 0.07), i * d / 10 + rng.uniform(0, 0.02), gain * (0.5 + 0.5 * i / 9)))
    return L.mix(parts, 0.3)


def win_stinger(rng, root, scale, v, n=5, coins=0.0, shim=0.0, pattern="up", rev=(0.55, 0.2), step=0.075, tail=0.45):
    parts = [(jingle(rng, root, scale, v, n, step, pattern, tail=tail, rev=rev), 0.0, 1.0)]
    if coins:
        parts.append((L.coin_shower(rng, 8, 0.7), 0.05, coins))
    if shim:
        parts.append((shimmer(rng, root, 1.0, shim), 0.1, 1.0))
    return L.mix(parts)


def bigwin_stinger(rng, root, scale, v, coins=1.0, shim=0.6, bass=None, n=8, step=0.085, rev=(0.8, 0.25), extra=None):
    parts = [(jingle(rng, root, scale, v, n, step, "up", tail=0.9, rev=rev, last_gain=1.3), 0.0, 1.0)]
    parts.append((L.coin_shower(rng, 20, 1.3), 0.15, coins))
    parts.append((shimmer(rng, root, 1.5, shim), 0.2, 1.0))
    if bass is not None:
        parts.append((bass, 0.0, 0.8))
    if extra is not None:
        parts.append((extra, 0.0, 1.0))
    return L.mix(parts)


def lose_sound(rng, kind="slide", f0=330, d=0.5, depth=-7):
    n = L.N(d)
    if kind == "slide":
        y = L.sweep(f0, f0 * 2 ** (depth / 12), d, "saw")
        y = L.lp(y, 1400) * L.env_exp(n, d * 0.55, 0.004)
        return L.reverb(y, 0.25, 0.1, rng=rng)
    if kind == "buzz":
        y = L.osc("square", f0 * 0.5, d) * 0.5 + L.osc("saw", f0 * 0.503, d) * 0.4
        y = L.lp(y, 900) * L.env_exp(n, d * 0.5, 0.003)
        return y
    if kind == "wah":  # two falling notes "wah-wah"
        a = blip(f0, 0.22, "saw", 0.16, -0.12)
        b = blip(f0 * 0.89, 0.34, "saw", 0.2, -0.2)
        return L.lp(L.mix([(a, 0, 1), (b, 0.2, 1)]), 1500)
    if kind == "thud":
        return L.thud(f0 * 0.35, d, rng, d * 0.4) * 1.2
    if kind == "pluck":
        a = L.pluck(f0, 0.35)
        b = L.pluck(f0 * 0.794, 0.45)
        return L.mix([(a, 0, 0.8), (b, 0.16, 1.0)])
    if kind == "glass":
        a = L.fm(f0, 3.5, 2.5, 0.4, 0.25, 0.1)
        b = L.fm(f0 * 0.707, 3.5, 2.0, 0.5, 0.3, 0.1)
        return L.mix([(a, 0, 0.8), (b, 0.14, 1.0)])
    raise ValueError(kind)


def lose_motif(rng, root, scale, v, kind="wah", f0=300, d=0.5, depth=-7):
    """A short falling figure in the game's own instrument and key, plus a quiet character layer."""
    notes = L.scale_notes(root - 5, scale, 2)
    seq = [notes[min(len(notes) - 1, 4)], notes[min(len(notes) - 1, 2)], notes[0] - 2]
    mot = L.reverb(L.arp(seq, 0.13, v, tail=0.25, accent=1.15), 0.4, 0.12, rng=rng)
    parts = [(mot, 0.0, 1.0)]
    if kind:
        parts.append((lose_sound(rng, kind, f0, d, depth), 0.0, 0.45))
    return L.mix(parts)


def tk(rng, kind, f):
    """Tiny 'tick' voices so no two games share one."""
    if kind == "wood":
        return L.click(rng, 0.04, f, 14, 0.012) * 2.0
    if kind == "tink":
        return L.fm(f, 3.1, 2.0, 0.09, 0.03, 0.02)
    if kind == "blip":
        return blip(f, 0.04, "square", 0.025) * 0.8
    if kind == "pop":
        return L.sweep(f * 0.5, f * 1.5, 0.06, "sine") * L.env_exp(L.N(0.06), 0.025)
    if kind == "tap":
        return L.thud(f, 0.07, rng, 0.03, 0.4) * 1.2
    if kind == "flick":
        return L.hp(L.noise(0.05, rng), f) * L.env_exp(L.N(0.05), 0.012, 0.0003) * 1.6
    if kind == "bell":
        return L.bell(f, 0.25, 0.1)
    if kind == "bubble":
        return L.sweep(f * 0.6, f * 1.6, 0.08, "sine") * L.env_exp(L.N(0.08), 0.03)
    if kind == "ratchet":
        return L.mix([(L.click(rng, 0.02, f, 6, 0.004) * 1.4, 0, 1.0), (L.click(rng, 0.02, f * 1.3, 6, 0.004) * 1.2, 0.035, 0.8)])
    if kind == "mallet":
        return L.mallet(f, 0.12, 0.05) * 1.3
    if kind == "coin":
        return L.coin(rng, f, 0.15, 0.05)
    raise ValueError(kind)


# ------------------------------------------------------------------ starts / steps
def start_sound(rng, kind="blip", f=520, d=0.2):
    n = L.N(d)
    if kind == "blip":
        return L.mix([(blip(f, 0.07, "sine", 0.04, 0.5), 0, 1), (blip(f * 1.5, 0.09, "sine", 0.05, 0.3), 0.06, 0.9)])
    if kind == "whoosh":
        return L.whoosh(d, f * 0.5, f * 8, rng, shape="fast") * 0.9
    if kind == "thunk":
        return L.mix([(L.thud(f * 0.28, 0.2, rng), 0, 1), (L.click(rng, 0.02, f * 4, 5), 0, 0.5)])
    if kind == "chips":
        return K("chips-handle-3") * 0.9
    if kind == "bubble":
        return L.mix([(L.sweep(f * 0.5, f * 1.8, 0.09, "sine") * L.env_exp(L.N(0.09), 0.04), 0, 1), (L.sweep(f * 0.7, f * 2.2, 0.07, "sine") * L.env_exp(L.N(0.07), 0.03), 0.05, 0.7)])
    if kind == "click":
        return L.click(rng, 0.03, f * 3, 4.0, 0.006) * 1.4
    if kind == "beep":
        return L.mix([(blip(f, 0.08, "square", 0.05), 0, 0.6), (blip(f, 0.08, "square", 0.05), 0.11, 0.6)])
    if kind == "charge":
        return L.sweep(f * 0.6, f * 2.4, d, "saw") * L.env_swell(n, 0.8, 1.2) * 0.4
    raise ValueError(kind)


def stone_step(rng, f=110, d=0.2):
    return L.mix([(L.thud(f, d, rng, 0.07, 0.7), 0, 1), (L.click(rng, 0.02, 1500, 4), 0, 0.4)])


def engine_loop(rng, f0=60, chug=12, noise_amt=0.5, band=(300, 2800), kind="saw", n_h=14, d=1.0, cut=2500, dist=1.0):
    """A seamless 1-second engine/ambience loop (all periods are whole numbers)."""
    n = L.N(d)
    t = np.arange(n) / L.SR
    y = np.zeros(n, dtype=np.float32)
    for k in range(1, n_h + 1):
        if f0 * k < L.SR * 0.4:
            y += (1.0 / (k ** (0.9 if kind == "saw" else 1.6))) * np.sin(2 * np.pi * f0 * k * t + 0.7 * k)
    am = 1 + 0.45 * np.sin(2 * np.pi * chug * t) + 0.2 * np.sin(2 * np.pi * chug * 2 * t + 1.1)
    y = y * am
    if dist != 1.0:
        y = L.distort(y / (np.max(np.abs(y)) + 1e-9), dist)
    nz = L.stretch_loop_noise(d, rng, band[0], band[1]) * noise_amt
    out = y / (np.max(np.abs(y)) + 1e-9) + nz
    # low-pass in the frequency domain (circular -> still seamless)
    X = np.fft.rfft(out)
    fr = np.fft.rfftfreq(n, 1 / L.SR)
    X *= 1 / (1 + (fr / cut) ** 4)
    out = np.fft.irfft(X, n).astype(np.float32)
    return out / (np.max(np.abs(out)) + 1e-9)


def pad_loop(rng, freqs, d=1.0, trem=2, noise_amt=0.1):
    n = L.N(d)
    t = np.arange(n) / L.SR
    y = np.zeros(n, dtype=np.float32)
    for i, f in enumerate(freqs):
        y += np.sin(2 * np.pi * f * t + i) * (1 + 0.25 * np.sin(2 * np.pi * trem * t + i))
    y += noise_amt * L.stretch_loop_noise(d, rng, 150, 1800)
    return (y / (np.max(np.abs(y)) + 1e-9)).astype(np.float32)


def crowd_loop(rng, d=1.0, lo=350, hi=2600):
    x = L.stretch_loop_noise(d, rng, lo, hi)
    t = np.arange(L.N(d)) / L.SR
    return (x * (0.75 + 0.25 * np.sin(2 * np.pi * 2 * t))).astype(np.float32)


# ------------------------------------------------------------------ cards / chips
def card_deal(i=0, pitch=0.0):
    names = ["card-slide-1", "card-slide-2", "card-slide-3", "card-slide-4", "card-slide-5", "card-slide-6", "card-slide-7", "card-slide-8"]
    return K(names[i % len(names)], pitch)


def card_place(i=0, pitch=0.0):
    return K(["card-place-1", "card-place-2", "card-place-3", "card-place-4"][i % 4], pitch)


def chips_win(rng, i=0, pitch=0.0):
    a = K(["chips-collide-1", "chips-collide-2", "chips-collide-3", "chips-collide-4"][i % 4], pitch)
    b = K(["chips-stack-1", "chips-stack-2", "chips-stack-3", "chips-stack-4", "chips-stack-5", "chips-stack-6"][i % 6], pitch)
    return L.mix([(a, 0, 1.0), (b, 0.12, 0.9)])


def tabla(rng, f=130, d=0.4):
    """Tabla-ish pitched drum hit (for the Indian-flavoured games)."""
    n = L.N(d)
    t = np.arange(n) / L.SR
    f_env = f * (1 + 1.2 * np.exp(-t / 0.03))
    y = np.sin(2 * np.pi * np.cumsum(f_env) / L.SR) * np.exp(-t / 0.18)
    y += 0.4 * np.sin(2 * np.pi * np.cumsum(f_env * 2.3) / L.SR) * np.exp(-t / 0.07)
    y[: L.N(0.03)] += 0.25 * L.click(rng, 0.03, 1800, 3)[: L.N(0.03)]
    return (y * 0.7).astype(np.float32)


def dhol(rng, f=95, d=0.3):
    return L.thud(f, d, rng, 0.11, 0.6) * 1.3


def tom(rng, f=110, d=0.35):
    n = L.N(d)
    t = np.arange(n) / L.SR
    y = L.sweep(f * 1.6, f, d, "sine") * np.exp(-t / 0.12) + 0.3 * L.lp(L.noise(d, rng), 900) * np.exp(-t / 0.03)
    return (y * 1.2).astype(np.float32)
