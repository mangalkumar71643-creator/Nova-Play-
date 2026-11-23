"""Sound sets for the table games, lotteries, slots and instant games.

Every function returns {event: float32 array}. Events used by the app:
start, step, tick, land, reveal, launch, loop, cashout, special, win, bigwin, lose.
"""
import numpy as np

import common as C
import lib as L

hz = L.hz
K = C.K


# ------------------------------------------------------------------ helpers
def triple(r, root, scale, kind, n=5, coins=0.0, shim=0.0, step=0.075, lose_kind="slide", lose_f=300, depth=-7,
           big_extra=None, bass=None, rev=(0.55, 0.2), big_n=8, **vk):
    """win / bigwin / lose sharing one musical identity."""
    v = C.voice(kind, **vk)
    return {
        "win": C.win_stinger(r, root, scale, v, n, coins=coins, shim=shim, step=step, rev=rev),
        "bigwin": C.bigwin_stinger(r, root, scale, v, 1.0, max(shim, 0.5), bass=bass, extra=big_extra, n=big_n, rev=(0.8, 0.25)),
        "lose": C.lose_motif(r, root, scale, v, lose_kind, lose_f, 0.5, depth),
    }


def cards(k, gap=0.11, first=0, pitch=0.0, g=1.0):
    return L.mix([(C.card_deal(first + i, pitch), i * gap, g) for i in range(k)])


def ticker(r, d=1.6, n=26, f=2600, g=1.0):
    """Clicks whose spacing grows (a wheel / ball slowing down)."""
    parts = []
    for i in range(n):
        t0 = d * (i / n) ** 2
        parts.append((L.click(r, 0.02, f * r.uniform(0.85, 1.2), 6, 0.004) * 1.5, t0, g * (0.6 + 0.4 * i / n)))
    return L.mix(parts, 0.05)


def pops(r, notes, gap=0.2, kind="glass", d=0.35, g=1.0, **vk):
    v = C.voice(kind, d=d, **vk)
    return L.mix([(v(float(hz(m))), i * gap, g) for i, m in enumerate(notes)], 0.2)


def digi(r, n=6, gap=0.07, lo=900, hi=2800, g=0.5):
    """Random data-bleeps."""
    return L.mix([(C.blip(float(r.uniform(lo, hi)), 0.05, "square", 0.03), i * gap, g) for i in range(n)])


def scratch(r, d=0.8, g=1.0):
    parts = []
    t = 0.0
    while t < d - 0.12:
        parts.append((L.bp(L.noise(0.11, r), 1800, 7000) * L.env_swell(L.N(0.11), 0.4) * 1.6, t, g * r.uniform(0.6, 1.0)))
        t += r.uniform(0.07, 0.13)
    return L.mix(parts)


def reel_spin(r, d=1.4, f=2000, rate=44, g=1.0):
    n = L.N(d)
    whirr = L.bp(L.noise(d, r), f * 0.35, f * 1.8) * L.env_swell(n, 0.35, 1.0) * 0.55
    return L.mix([(L.rattle(r, d, rate, f, 0.4) * 0.8, 0, g), (whirr, 0, g * 0.8)])


def reel_stops(r, k=3, t0=0.0, gap=0.28, f=170):
    parts = []
    for i in range(k):
        parts.append((L.thud(f * (1 + 0.1 * i), 0.1, r, 0.04, 0.6) * 1.1, t0 + i * gap, 1.0))
        parts.append((L.click(r, 0.02, 1700, 5), t0 + i * gap, 0.7))
    return L.mix(parts)


def lever(r):
    return L.mix([(L.click(r, 0.03, 900, 3, 0.01) * 1.8, 0, 1), (L.sweep(120, 260, 0.14, "saw") * L.env_exp(L.N(0.14), 0.07) * 0.3, 0.01, 1), (L.thud(120, 0.1, r, 0.04), 0.16, 0.8)])


def howl(r, f=330, d=1.4, g=1.0):
    y = L.voice_glide(f, f * 2.0, d, vib=5.0, vdepth=0.03, formants=(650, 1100), rng=r)
    y = y * L.env_swell(L.N(d), 0.45, 1.1)
    return L.reverb(y, 0.8, 0.3, rng=r) * g


def thunder(r, d=1.1, g=1.0):
    return L.mix([(L.hp(L.noise(0.18, r), 2500) * L.env_exp(L.N(0.18), 0.05, 0.0003) * 1.6, 0, 1),
                  (L.rumble(d, 150, r, 0.5) * L.env_exp(L.N(d), d * 0.5, 0.01) * 1.1, 0.05, 1)]) * g


def crackle(r, k=3, gap=0.06):
    return L.mix([(L.hp(L.noise(0.08, r), 3000) * L.env_exp(L.N(0.08), 0.02, 0.0003) * 1.6, i * gap + float(r.uniform(0, 0.02)), 1.0) for i in range(k)])


def chiptune(r, root, n=5, step=0.06, scale=None, g=1.0):
    scale = scale or L.MAJOR_PENT
    v = C.voice("synth", d=0.18, cut=5200, tau=0.12)
    return L.arp(L.scale_notes(root, scale, 2)[:n - 1] + [L.scale_notes(root, scale, 2)[n - 1] + 12], step, v, tail=0.25, accent=1.3, gain=g)


def drum_roll(r, f=120, n=9, gap=0.045, kind="tabla"):
    fn = C.tabla if kind == "tabla" else C.dhol
    return L.mix([(fn(r, f * (1 + 0.03 * (i % 3)), 0.25), i * gap, 0.5 + 0.5 * i / n) for i in range(n)], 0.2)


def gem(f):
    return L.fm(f, 3.5, 3.4, 0.4, 0.22, 0.09)


# ================================================================== table games
def sevenupdown(r):
    d = {
        "start": C.K("chips-handle-2"),
        "tick": C.tk(r, "wood", 1500),
        "reveal": L.mix([(K("dice-shake-2"), 0, 1.0), (K("dice-throw-1"), 0.9, 1.0), (K("die-throw-2"), 1.05, 0.9)]),
        "land": K("die-throw-3"),
    }
    d.update(triple(r, 72, L.MAJOR_PENT, "mallet", 5, coins=0.6, lose_kind="pluck", lose_f=330, d=0.5, tau=0.28))
    return d


def dragontiger(r):
    d = {
        "start": L.mix([(K("chips-stack-2"), 0, 1.0), (L.gong(140, 0.8, 0.5), 0.02, 0.35)]),
        "tick": L.mix([(L.mallet(float(hz(55)), 0.12, 0.05), 0, 1.4)]),
        "reveal": L.mix([(cards(2, 0.16, 0), 0, 1.0), (L.gong(120, 1.4, 0.9), 0.25, 0.8), (L.rumble(0.8, 110, r, 0.5) * 0.4, 0.2, 1)]),
        "land": L.mix([(C.card_place(2), 0, 1.0), (L.gong(160, 1.0, 0.6), 0.02, 0.6)]),
    }
    d.update(triple(r, 62, L.HIRAJOSHI, "pluck", 6, coins=0.5, lose_kind="pluck", lose_f=260, step=0.085, big_extra=L.gong(130, 1.8) * 0.8, d=0.6, damp=0.997))
    return d


def andarbahar(r):
    d = {
        "start": L.mix([(C.tabla(r, 140), 0, 1.0), (C.tabla(r, 180, 0.3), 0.09, 0.8)]),
        "tick": C.tk(r, "mallet", 150),
        "reveal": L.mix([(cards(6, 0.13, 1, 1.0), 0, 0.9), (drum_roll(r, 110, 10, 0.07, "dhol"), 0.1, 0.7)]),
        "land": L.mix([(C.dhol(r, 90), 0, 1.0), (C.card_place(0), 0, 0.8)]),
    }
    d.update(triple(r, 64, L.PHRYGIAN_DOM, "flute", 6, coins=0.4, lose_kind="pluck", lose_f=240, step=0.08, big_extra=drum_roll(r, 120, 12, 0.05, "dhol") * 0.8, d=0.6, tau=0.35))
    return d


def teenpatti(r):
    d = {
        "start": L.fade(K("card-shuffle", 0, 0.9)[: L.N(1.3)], 0.002, 0.25),
        "tick": C.tk(r, "flick", 3200),
        "reveal": L.mix([(K("card-fan-1"), 0, 1.0), (cards(3, 0.2, 2, 0.5), 0.35, 0.9), (C.dhol(r, 100), 0.95, 0.8)]),
        "land": L.mix([(C.card_place(1), 0, 1.0), (C.tabla(r, 150, 0.3), 0.03, 0.7)]),
    }
    d.update(triple(r, 67, L.PHRYGIAN_DOM, "brass", 5, coins=0.7, lose_kind="wah", lose_f=280, step=0.07, big_extra=drum_roll(r, 140, 12, 0.05) * 0.8, d=0.5, tau=0.3))
    return d


def jhandimunda(r):
    d = {
        "start": L.mix([(K("chips-handle-5"), 0, 1.0), (C.tabla(r, 200, 0.2), 0.05, 0.6)]),
        "tick": L.mallet(float(hz(88)), 0.1, 0.04) * 1.2,
        "reveal": L.mix([(K("dice-shake-3"), 0, 1.0), (drum_roll(r, 130, 9, 0.08, "dhol"), 0.05, 0.5), (K("dice-throw-2"), 1.0, 1.0)]),
        "land": L.mix([(K("die-throw-1"), 0, 1.0), (C.dhol(r, 95), 0, 0.8)]),
    }
    d.update(triple(r, 69, L.PHRYGIAN_DOM, "flute", 6, coins=0.6, lose_kind="buzz", lose_f=240, step=0.075, big_extra=drum_roll(r, 120, 14, 0.045, "dhol"), d=0.55, tau=0.3))
    return d


def roulette(r):
    spin = L.mix([(L.whoosh(1.5, 150, 1800, r) * 0.45, 0, 1.0), (ticker(r, 2.0, 34, 2400), 0.2, 0.8), (L.lp(L.noise(2.2, r), 900) * L.env_swell(L.N(2.2), 0.3) * 0.25, 0, 1)])
    d = {
        "start": L.mix([(K("chips-stack-4"), 0, 1.0), (K("chip-lay-2"), 0.12, 0.8)]),
        "tick": C.tk(r, "ratchet", 2400),
        "reveal": spin,
        "land": L.mix([(L.click(r, 0.03, 1500, 4, 0.008) * 2.0, 0, 1), (L.thud(150, 0.12, r, 0.05, 0.4), 0, 0.9), (L.bell(float(hz(93)), 0.4, 0.12), 0.02, 0.4)]),
    }
    d.update(triple(r, 74, L.MAJOR, "epiano", 6, coins=0.5, lose_kind="glass", lose_f=700, step=0.08, big_extra=K("chips-stack-6") * 0.9, d=0.6))
    return d


def baccarat(r):
    d = {
        "start": K("chips-handle-3"),
        "tick": C.tk(r, "bell", 2100),
        "reveal": L.mix([(cards(4, 0.24, 0), 0, 1.0), (K("card-place-2"), 1.05, 0.9)]),
        "land": L.mix([(C.card_place(3), 0, 1.0), (L.bell(float(hz(79)), 0.5, 0.2), 0.02, 0.35)]),
    }
    d.update(triple(r, 71, L.MAJOR, "epiano", 5, coins=0.3, lose_kind="glass", lose_f=620, step=0.09, big_extra=K("chips-collide-2") * 0.9, rev=(0.8, 0.28), d=0.6, index=1.6))
    return d


# ================================================================== lotteries
def wingo(r):
    d = {
        "start": L.mix([(C.blip(880, 0.06, "square", 0.04), 0, 0.5), (C.blip(1320, 0.08, "square", 0.05), 0.07, 0.5)]),
        "tick": C.blip(1500, 0.04, "square", 0.025) * 0.8,
        "reveal": L.mix([(C.blip(300 + 90 * i, 0.05, "square", 0.03), i * 0.05, 0.4) for i in range(14)] + [(C.blip(1568, 0.25, "square", 0.12), 0.78, 0.55), (C.blip(2093, 0.3, "square", 0.15), 0.9, 0.5)]),
        "land": C.blip(1046, 0.18, "square", 0.1) * 0.6,
        "win": L.mix([(chiptune(r, 72, 6, 0.055), 0, 1.0), (L.coin_shower(r, 7, 0.5), 0.1, 0.5)]),
        "bigwin": L.mix([(chiptune(r, 72, 9, 0.065), 0, 1.0), (chiptune(r, 84, 7, 0.06), 0.6, 0.8), (L.coin_shower(r, 18, 1.2), 0.15, 0.8)]),
        "lose": L.mix([(C.blip(392, 0.12, "square", 0.08), 0, 0.5), (C.blip(330, 0.12, "square", 0.08), 0.13, 0.5), (C.blip(262, 0.3, "square", 0.18, -0.1), 0.26, 0.5)]),
    }
    # The last 5 seconds of a round are one sound the owner supplied (supplied/wingo/countdown.flac), not these beats.
    del d["tick"]
    return d


def k3(r):
    d = {
        "start": K("dice-grab-1"),
        "tick": C.tk(r, "tink", 2700),
        "reveal": L.mix([(K("dice-shake-1"), 0, 1.0), (K("die-throw-1"), 0.85, 0.9), (K("die-throw-3"), 0.95, 0.8), (K("die-throw-4"), 1.05, 0.8)]),
        "land": K("dice-throw-3"),
    }
    d.update(triple(r, 67, L.MAJOR, "glass", 5, coins=0.5, lose_kind="glass", lose_f=500, step=0.07, d=0.5, ratio=3.0, index=2.4))
    return d


def fived(r):
    notes = [72, 76, 79, 83, 86]
    d = {
        "start": L.mix([(C.blip(740, 0.06, "sine", 0.04), 0, 0.7), (L.rattle(r, 0.25, 40, 3000, 0.2) * 0.8, 0.05, 1.0)]),
        "tick": L.mallet(float(hz(91)), 0.1, 0.04) * 1.2,
        "reveal": pops(r, notes, 0.24, "bell", 0.5, tau=0.3),
        "land": L.bell(float(hz(96)), 0.4, 0.18),
    }
    d.update(triple(r, 76, L.MAJOR_PENT, "bell", 6, coins=0.5, lose_kind="pluck", lose_f=340, step=0.07, d=0.6, tau=0.35))
    return d


def trxwin(r):
    d = {
        "start": L.mix([(C.blip(1200, 0.04, "sine", 0.025), 0, 0.7), (C.blip(1800, 0.05, "sine", 0.03), 0.05, 0.7)]),
        "tick": C.tk(r, "blip", 2300),
        "reveal": L.mix([(digi(r, 12, 0.07, 700, 3200, 0.45), 0, 1.0), (L.sweep(200, 2400, 0.9, "saw") * L.env_swell(L.N(0.9), 0.85) * 0.18, 0, 1.0)]),
        "land": L.mix([(C.blip(1568, 0.1, "square", 0.06), 0, 0.5), (L.bell(float(hz(91)), 0.4, 0.15), 0.02, 0.5)]),
    }
    d.update(triple(r, 74, L.MINOR_PENT, "synth", 5, coins=0.4, lose_kind="buzz", lose_f=300, step=0.065, rev=(0.45, 0.18), d=0.4, cut=4200, tau=0.22))
    return d


# ================================================================== instant games
def luckywheel(r):
    d = {
        "start": L.mix([(L.whoosh(0.7, 200, 2400, r) * 0.6, 0, 1.0), (ticker(r, 1.6, 22, 2900), 0.4, 0.5)]),
        "land": L.mix([(ticker(r, 1.8, 20, 2900), 0, 1.0), (L.thud(160, 0.12, r, 0.05), 1.85, 0.7)]),
        "tick": L.click(r, 0.02, 3000, 6, 0.004) * 1.4,
    }
    d.update(triple(r, 74, L.MAJOR_PENT, "bell", 6, coins=0.8, lose_kind="wah", lose_f=330, step=0.07, shim=0.4, d=0.6, tau=0.4))
    return d


def scratchcard(r):
    d = {
        "start": L.mix([(L.bp(L.noise(0.25, r), 3000, 9000) * L.env_swell(L.N(0.25), 0.2) * 1.2, 0, 1.0), (C.start_sound(r, "chips"), 0.15, 0.6), (scratch(r, 0.9), 0.4, 0.7)]),
        "tick": L.bp(L.noise(0.1, r), 1800, 7000) * L.env_swell(L.N(0.1), 0.4) * 1.5,
    }
    d.update(triple(r, 79, L.MAJOR_PENT, "glass", 6, coins=1.0, shim=0.7, lose_kind="pluck", lose_f=380, step=0.065, d=0.5, ratio=3.5, index=3.2))
    return d


def diceduel(r):
    d = {
        "start": L.mix([(K("dice-shake-2"), 0, 1.0), (K("dice-throw-2"), 0.85, 0.9), (K("die-throw-4"), 0.95, 0.9)]),
        "land": K("die-throw-1"),
        "tick": C.tk(r, "tap", 1100),
    }
    d.update(triple(r, 70, L.MAJOR, "mallet", 5, coins=0.5, lose_kind="thud", lose_f=300, step=0.075, d=0.5, tau=0.26))
    return d


def colorball(r):
    drum = L.mix([(L.rattle(r, 1.4, 55, 1500, 0.2) * 0.9, 0, 1.0), (L.bp(L.noise(1.4, r), 300, 1600) * L.env_swell(L.N(1.4), 0.5) * 0.5, 0, 1.0)])
    d = {
        "start": drum,
        "land": L.mix([(L.sweep(300, 1500, 0.1, "sine") * L.env_exp(L.N(0.1), 0.04) * 0.9, 0, 1.0), (L.bell(float(hz(86)), 0.5, 0.2), 0.08, 0.7)]),
        "tick": C.tk(r, "bubble", 700),
    }
    d.update(triple(r, 78, L.MAJOR_PENT, "bell", 5, coins=0.5, lose_kind="glass", lose_f=900, step=0.07, d=0.5, tau=0.3))
    return d


def fortunesix(r):
    d = {
        "start": L.mix([(L.rattle(r, 0.9, 40, 1800, 0.3) * 0.9, 0, 1.0), (L.whoosh(0.9, 200, 2000, r) * 0.4, 0, 1)]),
        "land": pops(r, [79, 81, 83, 84, 86, 88], 0.28, "bell", 0.5, tau=0.25),
        "tick": L.mallet(float(hz(86)), 0.1, 0.04) * 1.2,
    }
    d.update(triple(r, 79, L.MAJOR, "bell", 6, coins=0.6, shim=0.4, lose_kind="pluck", lose_f=400, step=0.075, d=0.6, tau=0.35))
    return d


def wolfmoon(r):
    d = {
        "start": L.mix([(reel_spin(r, 1.5, 1500, 38), 0, 1.0), (L.rumble(1.5, 90, r, 0.3) * 0.5, 0, 1.0)]),
        "land": reel_stops(r, 5, 0.0, 0.18, 150),
        "tick": L.bell(float(hz(81)), 0.4, 0.15) * 0.8,
        "win": L.mix([(howl(r, 300, 1.2) * 0.8, 0, 1.0), (C.win_stinger(r, 66, L.MINOR_PENT, C.voice("bell", d=0.6, tau=0.4), 5, coins=0.5, step=0.08), 0.1, 1.0)]),
        "bigwin": L.mix([(howl(r, 280, 1.8), 0, 1.0), (howl(r, 360, 1.6), 0.6, 0.8), (C.bigwin_stinger(r, 66, L.MINOR_PENT, C.voice("bell", d=0.7, tau=0.5), 1.0, 0.7, bass=L.gong(110, 1.8) * 0.7), 0.3, 1.0)]),
        "lose": L.mix([(L.lp(L.noise(0.7, r), 700) * L.env_swell(L.N(0.7), 0.3) * 0.4, 0, 1.0), (C.lose_sound(r, "slide", 250, 0.6, -9), 0.05, 0.8)]),
    }
    return d


def fruitmachine(r):
    d = {
        "start": L.mix([(lever(r), 0, 1.0), (reel_spin(r, 1.3, 2200, 48), 0.2, 0.9)]),
        "land": reel_stops(r, 3, 0.0, 0.3, 190),
        "tick": C.tk(r, "ratchet", 1900),
        "win": L.mix([(L.coin_shower(r, 12, 0.9, 2300), 0, 1.0), (L.arp([84, 88, 91, 96], 0.09, lambda f: L.bell(f, 0.5, 0.25), tail=0.3), 0.05, 0.8)]),
        "bigwin": L.mix([(L.coin_shower(r, 28, 1.8, 2300), 0, 1.0), (L.arp([76, 80, 83, 88, 92, 95, 100], 0.09, lambda f: L.bell(f, 0.6, 0.3), tail=0.5), 0.05, 0.9), (L.siren(0.9, 700, 1000, 4.0) * 0.18, 0.1, 1.0)]),
        "lose": L.mix([(C.lose_sound(r, "buzz", 220, 0.4), 0, 1.0), (L.thud(120, 0.15, r, 0.06), 0.2, 0.7)]),
    }
    return d


def fishermanscatch(r):
    def splash(g=1.0):
        return L.mix([(L.lp(L.noise(0.4, r), 3000) * L.env_exp(L.N(0.4), 0.1) * 0.9, 0, g), (L.sweep(300, 900, 0.08, "sine") * L.env_exp(L.N(0.08), 0.03), 0.06, 0.6 * g)])
    d = {
        "start": L.mix([(L.whoosh(0.5, 400, 3000, r, shape="fast") * 0.6, 0, 1.0), (splash(0.9), 0.45, 1.0), (L.rattle(r, 0.9, 30, 2400, 0.4) * 0.5, 0.9, 1.0)]),
        "land": L.mix([(L.rattle(r, 0.5, 26, 2400, 0.1) * 0.9, 0, 1.0), (splash(0.6), 0.35, 1.0)]),
        "tick": L.mix([(C.start_sound(r, "bubble", 520), 0, 0.9)]),
        "win": L.mix([(splash(0.8), 0, 1.0), (C.win_stinger(r, 69, L.MAJOR, C.voice("organ", d=0.5, tau=0.3), 5, coins=0.4, step=0.08), 0.1, 1.0)]),
        "bigwin": L.mix([(splash(1.0), 0, 1.0), (C.bigwin_stinger(r, 69, L.MAJOR, C.voice("organ", d=0.6, tau=0.4), 1.0, 0.5, bass=L.gong(95, 1.6) * 0.6), 0.15, 1.0)]),
        "lose": L.mix([(L.sweep(500, 140, 0.6, "sine") * L.env_exp(L.N(0.6), 0.3) * 0.5, 0, 1.0), (C.start_sound(r, "bubble", 260), 0.4, 0.6)]),
    }
    return d


def bookofpharaoh(r):
    sand = L.bp(L.noise(1.4, r), 1200, 6500) * L.env_swell(L.N(1.4), 0.4) * 0.5
    d = {
        "start": L.mix([(L.gong(150, 1.0, 0.6) * 0.8, 0, 1.0), (sand, 0.05, 1.0), (L.rattle(r, 1.2, 30, 1700, 0.5) * 0.6, 0.2, 1.0)]),
        "land": L.mix([(reel_stops(r, 5, 0.0, 0.22, 110), 0, 1.0), (L.rattle(r, 0.9, 36, 1300, 0.6) * 0.5, 0.0, 1.0)]),
        "tick": L.mallet(float(hz(77)), 0.14, 0.06) * 1.2,
        "win": C.win_stinger(r, 62, L.PHRYGIAN_DOM, C.voice("flute", d=0.6, tau=0.4), 6, coins=0.6, step=0.08),
        "bigwin": L.mix([(C.bigwin_stinger(r, 62, L.PHRYGIAN_DOM, C.voice("flute", d=0.7, tau=0.45), 1.2, 0.5, bass=L.gong(110, 2.0) * 0.9), 0, 1.0), (C.voice("brass", d=0.7, tau=0.5)(float(hz(55))), 0.05, 0.6)]),
        "lose": L.mix([(sand * 0.8, 0, 1.0), (C.lose_sound(r, "slide", 260, 0.6, -10), 0.1, 0.8)]),
    }
    return d


# ================================================================== games whose screens already trigger tick / land / win
def plinko(r):
    d = {
        "tick": L.mix([(L.mallet(float(hz(96 + int(r.integers(0, 5)))), 0.12, 0.05, 0.6) * 1.4, 0, 1.0)]),
        "start": L.mix([(K("chips-handle-1"), 0, 0.8), (L.sweep(1500, 700, 0.08, "sine") * L.env_exp(L.N(0.08), 0.03), 0.02, 0.5)]),
        "land": L.mix([(L.coin(r, 2200, 0.2, 0.07), 0, 0.9), (L.thud(180, 0.08, r, 0.04), 0, 0.6)]),
    }
    d.update(triple(r, 76, L.MAJOR_PENT, "mallet", 5, coins=0.8, lose_kind="pluck", lose_f=340, step=0.065, d=0.45, tau=0.24))
    return d


def dice(r):
    d = {
        "start": L.mix([(K("dice-shake-1"), 0, 1.0)]),
        "tick": C.tk(r, "wood", 900),
        "land": L.mix([(K("die-throw-2"), 0, 1.0), (L.thud(130, 0.12, r, 0.05), 0.02, 0.5)]),
    }
    d.update(triple(r, 71, L.MAJOR_PENT, "mallet", 5, coins=0.5, lose_kind="thud", lose_f=300, step=0.07, d=0.45, tau=0.25))
    return d


def limbo(r):
    d = {
        "start": L.mix([(L.sweep(200, 1800, 0.5, "saw") * L.env_swell(L.N(0.5), 0.85) * 0.25, 0, 1.0), (L.whoosh(0.5, 300, 4500, r) * 0.5, 0, 1.0)]),
        "tick": C.blip(1900, 0.04, "sine", 0.025) * 0.9,
        "land": L.mix([(L.explosion(0.7, r, 0.7), 0, 1.0)]),
    }
    d.update(triple(r, 81, L.MAJOR, "glass", 6, coins=0.4, shim=0.6, lose_kind="slide", lose_f=500, step=0.06, d=0.5, ratio=3.01, index=3.2))
    return d


def keno(r):
    d = {
        "start": L.mix([(L.rattle(r, 0.6, 50, 1600, 0.3) * 0.8, 0, 1.0)]),
        "tick": L.mix([(L.sweep(400, 1700, 0.07, "sine") * L.env_exp(L.N(0.07), 0.03) * 0.9, 0, 1.0), (L.click(r, 0.02, 3000, 4), 0.0, 0.5)]),
        "land": L.bell(float(hz(88)), 0.4, 0.15),
    }
    d.update(triple(r, 75, L.MAJOR_PENT, "bell", 5, coins=0.5, lose_kind="glass", lose_f=760, step=0.07, d=0.55, tau=0.3))
    return d


def diamonds(r):
    d = {
        "start": L.mix([(L.rattle(r, 0.3, 40, 3500, 0.2) * 0.8, 0, 1.0)]),
        "tick": L.mix([(gem(float(hz(84 + int(r.integers(0, 6))))), 0, 1.0)]),
        "land": L.mix([(L.fm(float(hz(70)), 3.5, 2.0, 0.4, 0.2, 0.08), 0, 1.0), (L.thud(140, 0.08, r, 0.04), 0, 0.4)]),
    }
    d.update(triple(r, 84, L.MAJOR_PENT, "glass", 6, coins=0.4, shim=0.8, lose_kind="glass", lose_f=700, step=0.065, d=0.55, ratio=3.5, index=3.4))
    return d


def blackjack(r):
    d = {
        "start": L.mix([(K("chips-handle-4"), 0, 1.0)]),
        "tick": C.card_deal(1),
        "land": L.mix([(C.card_place(2, -3), 0, 0.9), (C.lose_sound(r, "buzz", 240, 0.35), 0.05, 0.6)]),
        "reveal": K("card-fan-2"),
    }
    d.update(triple(r, 70, L.MAJOR, "epiano", 5, coins=0.3, lose_kind="glass", lose_f=600, step=0.075, big_extra=K("chips-stack-5") * 0.9, d=0.5))
    return d


def casinoholdem(r):
    d = {
        "start": L.mix([(K("chips-stack-1"), 0, 1.0)]),
        "tick": L.mix([(C.card_place(0, 1.0), 0, 1.0), (C.card_deal(4), 0.0, 0.5)]),
        "land": L.mix([(C.card_place(3, -3), 0, 0.9), (L.thud(110, 0.15, r, 0.06), 0.02, 0.6)]),
    }
    d.update(triple(r, 65, L.MINOR_PENT, "epiano", 5, coins=0.5, lose_kind="slide", lose_f=270, step=0.08, big_extra=K("chips-collide-3") * 0.9, d=0.55, index=2.6))
    return d


def threecardpoker(r):
    d = {
        "start": L.mix([(K("chips-handle-6"), 0, 1.0)]),
        "tick": L.mix([(C.card_deal(5), 0, 1.0)]),
        "land": L.mix([(C.card_place(1, -2), 0, 0.9), (C.lose_sound(r, "pluck", 300, 0.4), 0.05, 0.5)]),
    }
    d.update(triple(r, 68, L.MAJOR_PENT, "pluck", 5, coins=0.5, lose_kind="pluck", lose_f=300, step=0.07, big_extra=K("chips-stack-3") * 0.9, d=0.5, damp=0.996))
    return d


def videopoker(r):
    d = {
        "start": L.mix([(C.blip(880, 0.06, "square", 0.04), 0, 0.5), (C.blip(1175, 0.08, "square", 0.05), 0.07, 0.5)]),
        "tick": L.mix([(C.card_deal(3), 0, 0.9), (C.blip(1480, 0.04, "square", 0.025), 0.02, 0.35)]),
        "land": L.mix([(C.blip(220, 0.25, "square", 0.15, -0.2), 0, 0.5), (C.card_place(2, -2), 0, 0.6)]),
    }
    d.update({
        "win": L.mix([(chiptune(r, 76, 5, 0.07), 0, 1.0), (L.coin_shower(r, 8, 0.6), 0.1, 0.5)]),
        "bigwin": L.mix([(chiptune(r, 72, 9, 0.07), 0, 1.0), (chiptune(r, 84, 8, 0.06), 0.55, 0.8), (L.coin_shower(r, 20, 1.3), 0.1, 0.8)]),
        "lose": C.lose_sound(r, "buzz", 240, 0.4),
    })
    return d


def slot(r):
    d = {
        "start": L.mix([(L.coin(r, 2500, 0.2, 0.08), 0, 0.9), (L.click(r, 0.03, 1100, 4, 0.01) * 1.6, 0.1, 1.0), (reel_spin(r, 1.0, 2800, 58), 0.15, 0.9)]),
        "tick": L.mix([(L.thud(170, 0.1, r, 0.04, 0.6) * 1.2, 0, 1.0), (L.click(r, 0.02, 1700, 5), 0, 0.6)]),
        "land": reel_stops(r, 3, 0.0, 0.25, 180),
    }
    d.update({
        "win": L.mix([(L.coin_shower(r, 12, 0.9), 0, 1.0), (L.arp([79, 83, 86, 91], 0.1, lambda f: L.bell(f, 0.5, 0.25), tail=0.3), 0.05, 0.9)]),
        "bigwin": L.mix([(L.coin_shower(r, 30, 2.0), 0, 1.0), (L.arp([72, 76, 79, 84, 88, 91, 96], 0.1, lambda f: L.bell(f, 0.6, 0.3), tail=0.5), 0.05, 0.9), (L.siren(1.0, 650, 950, 4.0) * 0.16, 0.1, 1.0)]),
        "lose": L.mix([(C.lose_sound(r, "wah", 240, 0.5), 0, 0.9)]),
    })
    return d


def aces(r):
    d = {
        "start": L.mix([(K("card-fan-2", 2.0), 0, 0.9), (C.blip(1568, 0.08, "sine", 0.05), 0.12, 0.35)]),
        "tick": L.mix([(C.card_place(0, 2.0), 0, 0.9), (L.bell(float(hz(86)), 0.3, 0.12), 0.0, 0.5)]),
        "land": L.mix([(cards(4, 0.05, 0, -1.0), 0, 1.0)]),
    }
    d.update(triple(r, 72, L.MAJOR, "epiano", 6, coins=0.7, lose_kind="glass", lose_f=640, step=0.07, big_extra=K("chips-stack-6") * 0.9, d=0.5, index=2.4))
    return d


def candyblast(r):
    def pop(f):
        return L.mix([(L.sweep(f * 0.7, f * 1.7, 0.07, "sine") * L.env_exp(L.N(0.07), 0.03), 0, 1.0), (L.click(r, 0.02, 3800, 4), 0.0, 0.6)])
    d = {
        "start": L.mix([(C.blip(784, 0.06, "sine", 0.04), 0, 0.8), (C.blip(1175, 0.08, "sine", 0.05), 0.07, 0.8)]),
        "tick": pop(float(hz(84 + int(r.integers(0, 5)) * 2))),
        "land": L.mix([(L.lp(L.noise(0.2, r), 1800) * L.env_exp(L.N(0.2), 0.06) * 0.9, 0, 1.0), (L.sweep(500, 250, 0.1, "sine") * L.env_exp(L.N(0.1), 0.05), 0.0, 0.8)]),
    }
    d.update(triple(r, 81, L.MAJOR_PENT, "mallet", 6, coins=0.4, shim=0.9, lose_kind="pluck", lose_f=520, step=0.06, d=0.4, tau=0.22, br=1.5))
    return d


def gatesofzeus(r):
    ch = lambda f: L.chorus(C.voice("organ", d=0.8, tau=0.6, amps=[1, 0.6, 0.4, 0.25, 0.15])(f), 0.004, 0.5, 0.7)
    d = {
        "start": L.mix([(L.rumble(0.5, 120, r, 0.4) * 0.6, 0, 1.0), (crackle(r, 3, 0.07), 0.1, 0.5)]),
        "tick": crackle(r, 2, 0.04) * 0.8,
        "land": thunder(r, 0.9, 0.9),
    }
    v = ch
    d.update({
        "win": L.mix([(C.win_stinger(r, 64, L.MAJOR, v, 5, coins=0.6, step=0.09, rev=(0.9, 0.3)), 0, 1.0), (crackle(r, 3, 0.05), 0, 0.6)]),
        "bigwin": L.mix([(C.bigwin_stinger(r, 64, L.MAJOR, v, 1.0, 0.7, bass=thunder(r, 1.4, 1.0)), 0, 1.0), (crackle(r, 5, 0.06), 0.1, 0.7)]),
        "lose": L.mix([(L.rumble(0.8, 110, r, 0.3) * 0.5, 0, 1.0), (C.lose_sound(r, "slide", 220, 0.6, -10), 0.05, 0.7)]),
    })
    return d


def moneycoming(r):
    d = {
        "start": L.mix([(L.coin(r, 2300, 0.25, 0.1), 0, 0.8), (L.rattle(r, 0.7, 44, 2500, 0.3) * 0.7, 0.1, 1.0)]),
        "tick": L.mix([(L.coin(r, 2800, 0.15, 0.06), 0, 0.9)]),
        "land": L.mix([(L.coin_shower(r, 6, 0.35), 0, 0.9), (L.thud(150, 0.1, r, 0.04), 0, 0.5)]),
    }
    d.update(triple(r, 67, L.MAJOR_PENT, "pluck", 6, coins=1.0, lose_kind="pluck", lose_f=300, step=0.075, shim=0.3, big_extra=L.gong(130, 1.8) * 0.9, d=0.55, damp=0.996))
    return d


def neon777(r):
    d = {
        "start": L.mix([(L.sweep(200, 900, 0.3, "saw") * L.env_swell(L.N(0.3), 0.8) * 0.25, 0, 1.0), (reel_spin(r, 0.9, 2400, 40), 0.1, 0.7)]),
        "tick": C.blip(1568, 0.05, "square", 0.03, 0.1) * 0.8,
        "land": L.mix([(L.thud(95, 0.15, r, 0.06), 0, 1.0), (C.blip(440, 0.12, "saw", 0.08), 0, 0.4)]),
    }
    arp80 = lambda root, n: C.jingle(r, root, L.MINOR_PENT, C.voice("synth", d=0.28, cut=3800, tau=0.2), n, 0.07, "up", tail=0.4, rev=(0.45, 0.2))
    d.update({
        "win": L.mix([(arp80(69, 6), 0, 1.0), (L.coin_shower(r, 8, 0.6), 0.1, 0.5)]),
        "bigwin": L.mix([(arp80(60, 9), 0, 1.0), (arp80(72, 8), 0.6, 0.8), (L.coin_shower(r, 22, 1.4), 0.15, 0.8), (C.voice("brass", d=0.9, tau=0.7)(float(hz(48))), 0.0, 0.5)]),
        "lose": C.lose_sound(r, "slide", 330, 0.5, -12),
    })
    return d


def redbutton(r):
    """Red Button, a retro control panel: the big button going down, a toggle switch clicking, LCD beeps and a relay when the digits lock."""
    push = L.mix([
        (L.thud(68, 0.24, r, 0.09, 0.9), 0, 1.0),  # the heavy body of the button
        (L.click(r, 0.03, 1700, 4.0, 0.006) * 1.7, 0.0, 0.9),  # the clack on top
        (L.click(r, 0.02, 3800, 7.0, 0.004) * 1.2, 0.05, 0.6),  # the relay
        (L.sweep(160, 1100, 0.55, "saw") * L.env_swell(L.N(0.55), 0.85) * 0.2, 0.07, 1.0),  # the panel powering up
        (L.whoosh(0.5, 400, 3200, r) * 0.22, 0.1, 1.0),
    ])
    toggle = L.mix([
        (L.click(r, 0.02, 2300, 6.0, 0.004) * 2.2, 0.0, 1.0),
        (L.click(r, 0.025, 1500, 5.0, 0.005) * 1.7, 0.05, 0.9),
        (L.thud(190, 0.07, r, 0.02, 0.4), 0.0, 0.5),
    ])
    d = {
        "start": push,
        "step": toggle,
        "tick": C.blip(1760, 0.05, "square", 0.03, 0.1) * 0.8,
        "land": L.mix([(L.thud(105, 0.22, r, 0.08), 0, 1.0), (C.blip(660, 0.1, "square", 0.06), 0, 0.5), (C.blip(990, 0.18, "square", 0.1), 0.07, 0.5)]),
    }
    arp = lambda root, n: C.jingle(r, root, L.MAJOR_PENT, C.voice("synth", d=0.3, cut=4200, tau=0.22), n, 0.07, "up", tail=0.4, rev=(0.45, 0.2))
    d.update({
        "win": L.mix([(arp(64, 6), 0, 1.0), (L.coin_shower(r, 8, 0.6), 0.1, 0.5)]),
        "bigwin": L.mix([(arp(55, 9), 0, 1.0), (arp(67, 8), 0.6, 0.8), (L.coin_shower(r, 24, 1.5), 0.15, 0.8), (L.gong(110, 1.8) * 0.8, 0.0, 0.6)]),
        "lose": L.mix([(C.lose_sound(r, "slide", 260, 0.55, -10), 0, 1.0), (L.sweep(150, 70, 0.4, "saw") * L.env_swell(L.N(0.4), 0.2) * 0.18, 0.02, 1.0)]),
    })
    return d


def jaguartemple(r):
    """Jaguar Temple, a jungle-temple slot: stone slabs dropping on the reels, drums, a temple gong and marimba."""
    marimba = lambda root, n: C.jingle(r, root, L.MAJOR_PENT, C.voice("mallet", d=0.55, tau=0.4), n, 0.075, "up", tail=0.45, rev=(0.55, 0.22))
    d = {
        "start": L.mix([(L.rumble(0.9, 100, r, 0.35) * 0.55, 0, 1.0), (L.whoosh(0.8, 300, 3000, r) * 0.3, 0.02, 1.0), (C.tom(r, 150, 0.25), 0, 0.5), (L.rattle(r, 0.6, 30, 1800, 0.5) * 0.5, 0.1, 0.8)]),
        "tick": L.mix([(L.coin(r, 2900, 0.12, 0.05), 0, 0.9)]),
        "land": L.mix([(L.thud(85, 0.2, r, 0.07), 0, 1.0), (L.click(r, 0.02, 1500, 4.0, 0.006) * 1.4, 0, 0.8), (L.bell(float(hz(84)), 0.35, 0.12) * 0.5, 0.01, 0.6)]),
        "step": L.mix([(L.click(r, 0.02, 2100, 6.0, 0.004) * 2.0, 0, 1.0), (L.thud(220, 0.05, r, 0.02, 0.4), 0, 0.4)]),
        "special": L.mix([(L.gong(98, 2.2) * 0.9, 0, 1.0), (C.tom(r, 90, 0.5), 0.05, 0.9), (C.tom(r, 90, 0.5), 0.4, 0.8), (marimba(62, 8), 0.5, 0.9), (L.coin_shower(r, 12, 0.9), 0.6, 0.5)]),
        "win": L.mix([(marimba(67, 6), 0, 1.0), (L.coin_shower(r, 8, 0.6), 0.08, 0.5)]),
        "bigwin": L.mix([(C.tom(r, 100, 0.5), 0, 0.9), (C.tom(r, 120, 0.4), 0.18, 0.8), (marimba(60, 9), 0.1, 1.0), (marimba(72, 8), 0.65, 0.8), (L.coin_shower(r, 26, 1.5), 0.15, 0.8), (L.gong(110, 2.0) * 0.8, 0.0, 0.7)]),
        "lose": L.mix([(C.tom(r, 80, 0.4), 0, 0.8), (C.lose_sound(r, "slide", 240, 0.5, -11), 0.04, 0.7)]),
    }
    return d


def teenpatticlub(r):
    """Teen Patti Club, real Teen Patti at a table: cards dealt one by one, a card turned over, chips pushed to the pot, cards
    thrown in, a soft chime when it is your turn, the clock ticking, and a warm win. The bets themselves are heard as the app's chip sound."""
    d = {
        # the deal: seven cards slid across the felt, a soft thud under the last
        "start": L.mix([(cards(7, 0.095, 0, 0.0), 0, 1.0), (L.thud(120, 0.18, r, 0.05, 0.5), 0.62, 0.35)]),
        # a card turned face up
        "step": L.mix([(K("card-fan-1")[: L.N(0.45)], 0, 0.85), (C.card_place(2, 1.0), 0.16, 0.75)]),
        # the last seconds of a turn: a small wooden tick
        "tick": C.tk(r, "wood", 1700) * 0.9,
        # your turn: two soft bells
        "land": L.mix([(L.bell(float(hz(81)), 0.55, 0.28), 0, 0.8), (L.bell(float(hz(88)), 0.7, 0.34), 0.13, 0.8)]),
        # the cards are shown: a fan of cards turned over
        "reveal": L.mix([(K("card-fan-2"), 0, 1.0), (cards(3, 0.14, 3, 0.5), 0.3, 0.8), (L.thud(80, 0.22, r, 0.06), 0.75, 0.6)]),
        # a pack: the cards are pushed away
        "special": L.mix([(K("card-shove-2"), 0, 1.0), (L.whoosh(0.3, 1500, 500, r) * 0.2, 0.02, 1.0)]),
        # the pot is pushed to the winner
        "cashout": L.mix([(C.chips_win(r, 1), 0, 1.0), (C.chips_win(r, 3, 1.0), 0.18, 0.8)]),
    }
    d.update(triple(r, 62, L.MAJOR_PENT, "glass", 6, coins=0.6, shim=0.3, lose_kind="wah", lose_f=260, step=0.075, d=0.55, tau=0.32))
    return d


def ringgauntlet(r):
    """Ring Gauntlet, a ring that locks segment by segment: a heavy ring engaging, bright metal locks that climb in pitch, a dark
    failure sting, coins and a chime when it is cashed out."""
    lock = lambda f, g=1.0: L.mix([
        (L.click(r, 0.02, 2600, 6.0, 0.004) * 2.0, 0, g),
        (L.bell(float(hz(f)), 0.42, 0.16) * 0.55, 0.0, g * 0.8),
        (L.thud(240, 0.05, r, 0.02, 0.4), 0, 0.45 * g),
    ])
    chime = lambda root, n: C.jingle(r, root, L.MAJOR_PENT, C.voice("glass", d=0.5, tau=0.3), n, 0.07, "up", tail=0.5, rev=(0.5, 0.22))
    d = {
        "start": L.mix([
            (L.thud(62, 0.3, r, 0.1, 0.9), 0, 1.0),
            (L.click(r, 0.03, 1500, 4.0, 0.006) * 1.8, 0.0, 0.9),
            (L.sweep(120, 880, 0.5, "saw") * L.env_swell(L.N(0.5), 0.85) * 0.2, 0.05, 1.0),
            (L.whoosh(0.45, 300, 2600, r) * 0.2, 0.08, 1.0),
            (L.click(r, 0.02, 3200, 7.0, 0.004) * 1.4, 0.42, 0.7),
        ]),
        "step": lock(79),
        "tick": C.blip(1568, 0.05, "square", 0.03, 0.1) * 0.75,
        "land": L.mix([(L.thud(95, 0.18, r, 0.06), 0, 1.0), (L.click(r, 0.02, 1800, 5.0, 0.005) * 1.4, 0, 0.8)]),
        "special": L.mix([
            (L.sweep(520, 70, 0.55, "saw") * L.env_exp(L.N(0.55), 0.3) * 0.32, 0, 1.0),
            (L.thud(55, 0.35, r, 0.12, 1.0), 0.02, 1.0),
            (L.hp(L.noise(0.3, r), 1800) * L.env_exp(L.N(0.3), 0.08, 0.0004) * 1.2, 0.0, 0.8),
            (L.click(r, 0.03, 700, 3.0, 0.01) * 1.8, 0.0, 0.9),
        ]),
        "cashout": L.mix([(L.coin_shower(r, 10, 0.8), 0, 0.9), (chime(76, 5), 0.02, 0.9)]),
        "reveal": L.mix([(ticker(r, 1.2, 22, 2400, 0.9), 0, 1.0)]),
    }
    d.update({
        "win": L.mix([(chime(69, 7), 0, 1.0), (L.coin_shower(r, 12, 0.9), 0.08, 0.6)]),
        "bigwin": L.mix([(chime(60, 10), 0, 1.0), (chime(72, 9), 0.6, 0.85), (L.coin_shower(r, 30, 1.8), 0.12, 0.85), (L.gong(98, 2.0) * 0.8, 0.0, 0.6)]),
        "lose": L.mix([(C.lose_sound(r, "slide", 250, 0.55, -10), 0.05, 1.0), (L.thud(70, 0.3, r, 0.1, 0.8), 0, 0.7)]),
    })
    return d


def turbosevens(r):
    """Turbo Sevens, a classic 777 machine: a lever, reels whirring and stopping one by one, bells for a win, coins pouring for a big
    one, and a quick flourish when the bonus reel brings a multiplier, cash or the respin wheel."""
    d = {
        "start": L.mix([(lever(r), 0, 1.0), (reel_spin(r, 1.0, 2600, 52), 0.12, 0.85)]),
        "tick": L.mix([(L.coin(r, 3100, 0.1, 0.05), 0, 0.8)]),
        "land": L.mix([(L.thud(150, 0.12, r, 0.05, 0.6) * 1.2, 0, 1.0), (L.click(r, 0.02, 1700, 5.0, 0.004) * 1.2, 0, 0.7)]),
        "step": L.mix([(reel_spin(r, 0.55, 3000, 60), 0, 0.8), (L.click(r, 0.03, 1100, 4.0, 0.01) * 1.4, 0, 0.8)]),
        "reveal": L.mix([(ticker(r, 1.6, 26, 2600, 1.0), 0, 1.0)]),
        "special": L.mix([
            (L.bell(float(hz(88)), 0.7, 0.26), 0.0, 0.9),
            (L.bell(float(hz(95)), 0.9, 0.32), 0.1, 0.9),
            (L.coin(r, 3400, 0.2, 0.08), 0.02, 0.8),
        ]),
        "cashout": L.mix([(L.coin_shower(r, 8, 0.7), 0, 1.0), (L.bell(float(hz(91)), 0.6, 0.24), 0.0, 0.7)]),
    }
    bells = lambda root, n: C.jingle(r, root, L.MAJOR_PENT, C.voice("glass", d=0.45, tau=0.28), n, 0.075, "up", tail=0.45, rev=(0.5, 0.2))
    d.update({
        "win": L.mix([(bells(72, 6), 0, 1.0), (L.coin_shower(r, 10, 0.8), 0.06, 0.6)]),
        "bigwin": L.mix([(bells(60, 9), 0, 1.0), (bells(72, 8), 0.55, 0.85), (L.coin_shower(r, 32, 2.0), 0.1, 0.9), (L.siren(1.0, 650, 950, 4.0) * 0.14, 0.1, 1.0), (L.gong(110, 1.8) * 0.7, 0.0, 0.6)]),
        "lose": L.mix([(C.lose_sound(r, "wah", 240, 0.45), 0, 0.7)]),
    })
    return d


GAMES_B = {
    "sevenupdown": sevenupdown, "dragontiger": dragontiger, "andarbahar": andarbahar, "teenpatti": teenpatti,
    "jhandimunda": jhandimunda, "roulette": roulette, "baccarat": baccarat,
    "wingo": wingo, "k3": k3, "fived": fived, "trxwin": trxwin,
    "luckywheel": luckywheel, "scratchcard": scratchcard, "diceduel": diceduel, "colorball": colorball,
    "fortunesix": fortunesix, "wolfmoon": wolfmoon, "fruitmachine": fruitmachine, "fishermanscatch": fishermanscatch,
    "bookofpharaoh": bookofpharaoh,
    "plinko": plinko, "dice": dice, "limbo": limbo, "keno": keno, "diamonds": diamonds, "blackjack": blackjack,
    "casinoholdem": casinoholdem, "threecardpoker": threecardpoker, "videopoker": videopoker, "slot": slot,
    "teenpatticlub": teenpatticlub, "aces": aces, "candyblast": candyblast, "gatesofzeus": gatesofzeus, "moneycoming": moneycoming, "neon777": neon777, "redbutton": redbutton, "jaguartemple": jaguartemple,
    "ringgauntlet": ringgauntlet, "turbosevens": turbosevens,
}
