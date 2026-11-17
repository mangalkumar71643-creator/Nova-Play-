"""
Small DSP toolkit for the NovaPlay game sounds (numpy + scipy only).

Everything is mono float32 at SR. The recipes in games.py combine these
primitives with the CC0 casino foley from Kenney (see README.md) so each game
gets its own set of sounds.
"""
import io
import subprocess
import zlib

import numpy as np
import soundfile as sf
from scipy import signal

SR = 32000


# ---------------------------------------------------------------- basics
def N(d):
    return int(round(d * SR))


def hz(midi):
    return 440.0 * 2.0 ** ((np.asarray(midi, dtype=float) - 69.0) / 12.0)


def rng_for(name):
    return np.random.default_rng(zlib.crc32(name.encode()) & 0xFFFFFFFF)


def silence(d):
    return np.zeros(N(d), dtype=np.float32)


def fit(x, d):
    """Pad with silence / cut to exactly d seconds."""
    n = N(d)
    if len(x) >= n:
        return x[:n].astype(np.float32)
    return np.concatenate([x, np.zeros(n - len(x), dtype=np.float32)]).astype(np.float32)


def env_exp(n, tau, attack=0.002):
    """Fast linear attack, then an exponential decay with time constant tau."""
    t = np.arange(n) / SR
    e = np.exp(-t / max(tau, 1e-4))
    a = max(1, int(attack * SR))
    e[:a] *= np.linspace(0, 1, a)
    return e.astype(np.float32)


def env_swell(n, peak=0.5, power=1.6):
    """Rises to a peak at `peak` (0..1 of the length) then falls."""
    x = np.linspace(0, 1, n)
    left = (x / peak) ** power
    right = ((1 - x) / (1 - peak)) ** power
    return np.where(x < peak, left, right).astype(np.float32)


def fade(x, a=0.003, r=0.015):
    y = x.copy().astype(np.float32)
    na, nr = min(len(y), N(a)), min(len(y), N(r))
    if na:
        y[:na] *= np.linspace(0, 1, na, dtype=np.float32)
    if nr:
        y[-nr:] *= np.linspace(1, 0, nr, dtype=np.float32)
    return y


def norm(x, peak=0.8):
    m = float(np.max(np.abs(x))) if len(x) else 0.0
    return (x * (peak / m)).astype(np.float32) if m > 1e-9 else x.astype(np.float32)


def trim(x, thr=0.004, keep=0.004):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - N(keep))
    b = min(len(x), idx[-1] + N(keep * 4))
    return x[a:b]


def mix(parts, tail=0.0):
    """parts: [(array, offset_seconds, gain), ...] -> summed array."""
    end = 0
    for x, off, g in parts:
        end = max(end, N(off) + len(x))
    out = np.zeros(end + N(tail), dtype=np.float32)
    for x, off, g in parts:
        o = N(off)
        out[o:o + len(x)] += x * g
    return out


def cat(*xs):
    return np.concatenate([np.asarray(x, dtype=np.float32) for x in xs])


# ---------------------------------------------------------------- filters
def _sos(kind, fc, order=2):
    nyq = SR / 2
    if isinstance(fc, (tuple, list)):
        fc = [min(max(f, 20.0), nyq * 0.98) for f in fc]
    else:
        fc = min(max(fc, 20.0), nyq * 0.98)
    return signal.butter(order, fc, btype=kind, fs=SR, output="sos")


def lp(x, fc, order=2):
    return signal.sosfilt(_sos("low", fc, order), x).astype(np.float32)


def hp(x, fc, order=2):
    return signal.sosfilt(_sos("high", fc, order), x).astype(np.float32)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(_sos("band", (lo, hi), order), x).astype(np.float32)


def resonator(x, f, q=12.0):
    """Peaking band-pass at f (a ringing, 'tuned' filter)."""
    w0 = min(f, SR * 0.45) / (SR / 2)
    b, a = signal.iirpeak(w0, q)
    return signal.lfilter(b, a, x).astype(np.float32)


# ---------------------------------------------------------------- sources
def noise(d, rng, color="white"):
    x = rng.standard_normal(N(d)).astype(np.float32)
    if color == "pink":
        b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
        a = [1, -2.494956002, 2.017265875, -0.522189400]
        x = signal.lfilter(b, a, x).astype(np.float32) * 4.0
    elif color == "brown":
        x = np.cumsum(x).astype(np.float32)
        x -= np.mean(x)
        x = x / (np.max(np.abs(x)) + 1e-9)
    return x


def osc(kind, f, d, phase0=0.0):
    """f may be a scalar or a per-sample array (for sweeps)."""
    n = N(d)
    f = np.full(n, float(f)) if np.isscalar(f) else np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(f)), f)
    ph = 2 * np.pi * np.cumsum(f) / SR + phase0
    if kind == "sine":
        y = np.sin(ph)
    elif kind == "saw":
        y = 2 * ((ph / (2 * np.pi)) % 1.0) - 1
    elif kind == "square":
        y = np.sign(np.sin(ph) + 1e-12)
    elif kind == "tri":
        y = 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1.0) - 1) - 1
    else:
        raise ValueError(kind)
    return y.astype(np.float32)


def sweep(f0, f1, d, kind="sine", curve="exp"):
    n = N(d)
    u = np.linspace(0, 1, n)
    if curve == "exp":
        f = f0 * (f1 / f0) ** u
    else:
        f = f0 + (f1 - f0) * u
    return osc(kind, f, d)


def harmonics(f, d, amps, phase0=0.0):
    """Additive tone from a list of harmonic amplitudes."""
    y = np.zeros(N(d), dtype=np.float32)
    for k, a in enumerate(amps, start=1):
        if f * k < SR * 0.45:
            y += a * osc("sine", f * k, d, phase0 * k)
    return y


def fm(fc, ratio, index, d, tau=0.25, itau=0.12):
    """Two-operator FM: bells, e-piano, glassy chimes."""
    n = N(d)
    t = np.arange(n) / SR
    idx = index * np.exp(-t / itau)
    y = np.sin(2 * np.pi * fc * t + idx * np.sin(2 * np.pi * fc * ratio * t))
    return (y * np.exp(-t / tau)).astype(np.float32)


def pluck(f, d, damp=0.996):
    """Karplus-Strong plucked string."""
    n = N(d)
    L = max(2, int(SR / f))
    buf = np.random.default_rng(int(f * 1000) & 0xFFFF).uniform(-1, 1, L)
    out = np.empty(n, dtype=np.float32)
    for i in range(n):
        j = i % L
        out[i] = buf[j]
        buf[j] = damp * 0.5 * (buf[j] + buf[(j + 1) % L])
    return out


def mallet(f, d=0.6, tau=0.3, bright=1.0):
    """Marimba / xylophone-like bar."""
    t = np.arange(N(d)) / SR
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / tau)
    y += 0.35 * bright * np.sin(2 * np.pi * f * 3.97 * t) * np.exp(-t / (tau * 0.28))
    y += 0.15 * bright * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / (tau * 0.1))
    return (y * 0.8).astype(np.float32)


def bell(f, d=1.2, tau=0.7, brightness=1.0):
    """Struck bar / tubular bell: inharmonic partials."""
    t = np.arange(N(d)) / SR
    parts = [(1.0, 1.0, 1.0), (2.76, 0.55, 0.6), (5.40, 0.30, 0.35), (8.93, 0.16, 0.22)]
    y = np.zeros_like(t)
    for ratio, amp, dec in parts:
        y += amp * (brightness if ratio > 1 else 1.0) * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / (tau * dec))
    return (y * 0.55).astype(np.float32)


def gong(f, d=1.8, tau=1.1):
    t = np.arange(N(d)) / SR
    y = np.zeros_like(t)
    for ratio, amp, dec in [(1, 1, 1), (1.47, 0.7, 0.9), (2.09, 0.55, 0.8), (2.56, 0.4, 0.7), (3.15, 0.3, 0.5), (4.02, 0.2, 0.4)]:
        wob = 1 + 0.002 * np.sin(2 * np.pi * (3 + ratio) * t)
        y += amp * np.sin(2 * np.pi * f * ratio * wob * t) * np.exp(-t / (tau * dec))
    return (y * 0.4).astype(np.float32)


def click(rng, d=0.02, f=2500, q=6.0, tau=0.004):
    x = noise(d, rng) * env_exp(N(d), tau, attack=0.0003)
    return resonator(x, f, q)


def thud(f0=140, d=0.18, rng=None, tau=0.06, body=0.5):
    n = N(d)
    y = sweep(f0 * 1.8, f0 * 0.6, d, "sine") * env_exp(n, tau, 0.001)
    if rng is not None:
        y = y + body * lp(noise(d, rng), 700) * env_exp(n, tau * 0.6, 0.0005)
    return y


def tick(rng, f=3200, d=0.03, tau=0.006):
    return click(rng, d, f, 5.0, tau) * 1.6


def rattle(rng, d=0.5, rate=45, f=2400, decay=0.9):
    """Many tiny clicks (dice, beads, reels, chips)."""
    out = np.zeros(N(d), dtype=np.float32)
    k = int(d * rate)
    times = np.sort(rng.uniform(0, d - 0.03, k))
    for i, t0 in enumerate(times):
        c = click(rng, 0.02, f * rng.uniform(0.7, 1.4), rng.uniform(3, 8), 0.0035)
        g = (1 - decay * i / max(1, k)) * rng.uniform(0.5, 1.0)
        o = N(t0)
        out[o:o + len(c)] += c[: len(out) - o] * g
    return out


def whoosh(d=0.6, f0=300, f1=4500, rng=None, slices=28, q=0.35, shape="swell"):
    rng = rng or np.random.default_rng(1)
    n = N(d)
    x = noise(d + 0.1, rng)
    out = np.zeros(n + N(0.1), dtype=np.float32)
    seg = n // slices + 1
    win = np.hanning(seg * 2)
    for i in range(slices):
        fc = f0 * (f1 / f0) ** (i / max(1, slices - 1))
        lo, hi = fc * (1 - q), fc * (1 + q)
        y = bp(x, max(40, lo), min(SR * 0.45, hi), 2)
        a = i * seg
        w = win[: min(len(win), len(out) - a)]
        out[a:a + len(w)] += y[a:a + len(w)] * w
    out = out[:n]
    e = env_swell(n, 0.55 if shape == "swell" else 0.12, 1.3)
    return (out * e * 3.0).astype(np.float32)


def rumble(d=1.0, f=160, rng=None, depth=0.5):
    rng = rng or np.random.default_rng(2)
    x = lp(noise(d, rng, "brown"), f, 3)
    t = np.arange(N(d)) / SR
    am = 1 - depth + depth * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t))
    return (x * am * 2.2).astype(np.float32)


def explosion(d=1.0, rng=None, power=1.0):
    rng = rng or np.random.default_rng(3)
    n = N(d)
    parts = []
    # crack
    parts.append((hp(noise(0.05, rng), 800) * env_exp(N(0.05), 0.012, 0.0003) * 1.4, 0.0, 1.0))
    # body: low-passed noise whose cutoff falls
    body = np.zeros(n, dtype=np.float32)
    x = noise(d, rng)
    for i, fc in enumerate(np.geomspace(5200, 260, 10)):
        a, b = int(i * n / 10), int((i + 1) * n / 10)
        body[a:b] = lp(x, fc, 2)[a:b]
    parts.append((body * env_exp(n, d * 0.32, 0.001) * 1.5, 0.0, 1.0))
    # sub boom
    parts.append((sweep(95, 28, d, "sine") * env_exp(n, d * 0.38, 0.002) * 1.2, 0.0, power))
    return mix(parts)


def siren(d=1.0, f0=600, f1=1100, rate=2.0):
    n = N(d)
    t = np.arange(n) / SR
    f = f0 + (f1 - f0) * (0.5 + 0.5 * np.sin(2 * np.pi * rate * t - np.pi / 2))
    y = osc("square", f, d) * 0.5 + osc("saw", f * 2, d) * 0.2
    return lp(y, 3800)


def whistle(f=3000, d=0.5, vib=14, rng=None):
    rng = rng or np.random.default_rng(4)
    n = N(d)
    t = np.arange(n) / SR
    fv = f * (1 + 0.012 * np.sin(2 * np.pi * vib * t))
    y = osc("sine", fv, d) * 0.8 + bp(noise(d, rng), f * 0.8, f * 1.3) * 0.35
    return y * env_swell(n, 0.12, 0.6)


def coin(rng, f=2350, d=0.28, tau=0.11, bright=1.0):
    t = np.arange(N(d)) / SR
    y = np.sin(2 * np.pi * f * t) * np.exp(-t / tau)
    y += 0.8 * bright * np.sin(2 * np.pi * f * 1.5 * t) * np.exp(-t / (tau * 0.8))
    y += 0.5 * bright * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / (tau * 0.45))
    y *= np.minimum(1, t / 0.0008)
    return (y * 0.55).astype(np.float32)


def coin_shower(rng, n=14, span=0.9, f=2350, gain=1.0):
    parts = []
    for i in range(n):
        t0 = (i / n) ** 0.85 * span + rng.uniform(0, 0.03)
        parts.append((coin(rng, f * rng.uniform(0.85, 1.25), 0.25, rng.uniform(0.07, 0.13)), t0, gain * rng.uniform(0.5, 1.0)))
    return mix(parts, 0.1)


def cheer(d=1.2, rng=None, lo=500, hi=3200):
    rng = rng or np.random.default_rng(5)
    x = bp(noise(d, rng, "pink"), lo, hi, 2)
    t = np.arange(N(d)) / SR
    mod = 0.7 + 0.3 * np.sin(2 * np.pi * 7.5 * t) * np.sin(2 * np.pi * 3.1 * t + 1)
    return (x * mod * env_swell(N(d), 0.35, 1.4) * 3.0).astype(np.float32)


def formant(x, freqs=(800, 1150), qs=(8, 10)):
    y = np.zeros_like(x)
    for f, q in zip(freqs, qs):
        y += resonator(x, f, q)
    return y


def voice_glide(f0, f1, d, vib=5.5, vdepth=0.02, formants=(750, 1200), rng=None, kind="saw"):
    n = N(d)
    t = np.arange(n) / SR
    f = np.interp(np.linspace(0, 1, n), [0, 0.25, 0.7, 1], [f0, f1, f1, f0]) * (1 + vdepth * np.sin(2 * np.pi * vib * t))
    y = osc(kind, f, d)
    return formant(y, formants, (6, 8)) * 0.6


def reverb(x, t60=0.5, wet=0.22, damp=4200, rng=None, pre=0.008):
    rng = rng or np.random.default_rng(7)
    n = N(t60 * 1.2)
    t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 6.9 / t60)
    ir = lp(ir.astype(np.float32), damp, 1)
    ir[: N(pre)] = 0
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    y = signal.fftconvolve(x, ir)[: len(x) + n]
    dry = np.concatenate([x, np.zeros(len(y) - len(x), dtype=np.float32)])
    return (dry * (1 - wet * 0.5) + y * wet * 2.2).astype(np.float32)


def chorus(x, depth=0.003, rate=0.6, mix_=0.5):
    n = len(x)
    t = np.arange(n) / SR
    d = (depth * (0.5 + 0.5 * np.sin(2 * np.pi * rate * t))) * SR
    idx = np.clip(np.arange(n) - d, 0, n - 1)
    y = np.interp(idx, np.arange(n), x)
    return (x * (1 - mix_ * 0.5) + y * mix_ * 0.5).astype(np.float32)


def distort(x, drive=3.0):
    return (np.tanh(x * drive) / np.tanh(drive)).astype(np.float32)


def pitch(x, semitones):
    """Resample: changes pitch AND speed (good for foley variety)."""
    ratio = 2.0 ** (semitones / 12.0)
    n = int(len(x) / ratio)
    return np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)


def reverse(x):
    return x[::-1].copy()


def stretch_loop_noise(d, rng, f_lo, f_hi, color="pink"):
    """Seamless looping noise band: filtered in the frequency domain (circular)."""
    n = N(d)
    x = rng.standard_normal(n)
    X = np.fft.rfft(x)
    fr = np.fft.rfftfreq(n, 1 / SR)
    H = ((fr >= f_lo) & (fr <= f_hi)).astype(float)
    if color == "pink":
        H = H / np.sqrt(np.maximum(fr, 20) / 100.0)
    y = np.fft.irfft(X * H, n)
    return (y / (np.max(np.abs(y)) + 1e-9)).astype(np.float32)


# ---------------------------------------------------------------- samples
_cache = {}


def load_sample(path, gain_norm=True):
    key = (path, gain_norm)
    if key in _cache:
        return _cache[key].copy()
    p = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "wav", "pipe:1"],
        capture_output=True,
        check=True,
    )
    x, _ = sf.read(io.BytesIO(p.stdout), dtype="float32")
    x = trim(x)
    if gain_norm:
        x = norm(x, 0.8)
    _cache[key] = x
    return x.copy()


# ---------------------------------------------------------------- music
def scale_notes(root, scale, octaves=2):
    out = []
    for o in range(octaves):
        for s in scale:
            out.append(root + 12 * o + s)
    return out


MAJOR_PENT = [0, 2, 4, 7, 9]
MINOR_PENT = [0, 3, 5, 7, 10]
MAJOR = [0, 2, 4, 5, 7, 9, 11]
PHRYGIAN_DOM = [0, 1, 4, 5, 7, 8, 10]  # Egyptian / Indian "Bhairav" flavour
HIRAJOSHI = [0, 2, 3, 7, 8]  # East-Asian flavour


def arp(notes, step, voice, rng=None, tail=0.5, gain=1.0, accent=1.0):
    """Play the given MIDI notes one after another with `voice(freq)`."""
    parts = []
    for i, m in enumerate(notes):
        v = voice(float(hz(m)))
        parts.append((v, i * step, gain * (accent if i == len(notes) - 1 else 1.0)))
    return mix(parts, tail)


# ---------------------------------------------------------------- export
def to_mp3(x, path, bitrate="72k"):
    x = np.clip(x, -1, 1).astype(np.float32)
    tmp = path + ".tmp.wav"
    sf.write(tmp, x, SR, subtype="PCM_16")
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", tmp, "-codec:a", "libmp3lame", "-b:a", bitrate, "-ar", str(SR), "-ac", "1", path],
        check=True,
    )
    import os

    os.remove(tmp)


def to_wav(x, path):
    x = np.clip(x, -1, 1).astype(np.float32)
    sf.write(path, x, SR, subtype="PCM_16")
