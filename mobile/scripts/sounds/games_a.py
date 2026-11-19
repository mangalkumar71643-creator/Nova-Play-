"""Sound sets for the crash games and the step / risk games."""
import numpy as np

import common as C
import lib as L

hz = L.hz


def _cash(r, f=2350, n=8, bell_f=84, gain=0.9):
    """'Cha-ching': a few coins and a bell."""
    return L.mix([(L.coin_shower(r, n, 0.45, f, 1.0), 0, 1.0), (L.bell(float(hz(bell_f)), 0.7, 0.35), 0.05, gain * 0.7)], 0.1)


# ================================================================== crash games
def aviator(r):
    d = {
        "start": L.mix([(L.thud(70, 0.18, r), 0, 1), (L.rattle(r, 0.22, 60, 1800), 0, 0.5), (L.sweep(110, 260, 0.25, "saw") * L.env_swell(L.N(0.25), 0.7) * 0.3, 0, 1)]),
        "launch": L.mix([(L.sweep(90, 380, 0.9, "saw") * L.env_swell(L.N(0.9), 0.85, 1.1) * 0.5, 0, 1), (L.whoosh(0.9, 250, 3200, r) * 0.7, 0.1, 1)]),
        "cashout": _cash(r, 2400, 9, 88),
        "special": L.mix([(L.sweep(520, 70, 0.8, "saw") * L.env_exp(L.N(0.8), 0.45) * 0.5, 0, 1), (L.explosion(0.8, r, 0.6) * 0.55, 0.15, 1), (L.rattle(r, 0.4, 40, 900) * 0.4, 0.05, 1)]),
        "win": C.win_stinger(r, 76, L.MAJOR_PENT, C.voice("bell", d=0.6, tau=0.35), 5, coins=0.6),
        "bigwin": C.bigwin_stinger(r, 76, L.MAJOR_PENT, C.voice("bell", d=0.6, tau=0.35), 1.0, 0.5),
        "lose": C.lose_motif(r, 76, L.MAJOR_PENT, C.voice("bell", d=0.6, tau=0.35), "slide", 300, 0.5, -9),
    }
    # Aviator has no take-off sound and no "you lost" sound (the owner's background music carries the flight); its crash
    # sound is the owner's own file, supplied/aviator/special.mp3, which build.py puts in the pack. The recipe's own versions
    # are still rendered above so the sounds that stay keep exactly the noise they have always had.
    for silent in ("launch", "special", "lose"):
        del d[silent]
    return d


def rocket(r):
    n = L.N(1.0)
    return {
        "start": L.mix([(C.blip(880, 0.07, "square", 0.05), 0, 0.5), (C.blip(1175, 0.07, "square", 0.05), 0.1, 0.5), (C.blip(1760, 0.12, "square", 0.08), 0.2, 0.5)]),
        "launch": L.mix([(L.rumble(1.1, 220, r, 0.35) * 0.8, 0, 1), (L.whoosh(1.1, 200, 5200, r) * 0.6, 0.15, 1), (L.sweep(60, 240, 1.1, "saw") * L.env_swell(L.N(1.1), 0.9) * 0.25, 0, 1)]),
        "loop": (lambda a, b: (a * 0.8 + b * 0.5))(L.stretch_loop_noise(1.0, r, 60, 380, "pink"), L.stretch_loop_noise(1.0, r, 1800, 5200, "white") * 0.4),
        "cashout": L.mix([(L.fm(1568, 3.01, 3.2, 0.5, 0.28, 0.1), 0, 1), (L.fm(2093, 3.01, 3.0, 0.6, 0.3, 0.1), 0.09, 0.9), (L.fm(2637, 3.01, 2.6, 0.8, 0.4, 0.1), 0.18, 0.9)]),
        "special": L.mix([(L.explosion(1.1, r, 1.0), 0, 1), (L.hp(L.noise(0.6, r), 2500) * L.env_exp(L.N(0.6), 0.2) * 0.4, 0.05, 1)]),
        "win": C.win_stinger(r, 79, L.MAJOR, C.voice("glass", d=0.6, ratio=3.01, index=3.4), 6, shim=0.5, step=0.07),
        "bigwin": C.bigwin_stinger(r, 79, L.MAJOR, C.voice("glass", d=0.7, ratio=3.01, index=3.4), 0.9, 0.9),
        "lose": L.mix([(L.sweep(900, 90, 0.6, "square") * L.env_exp(L.N(0.6), 0.3) * 0.3, 0, 1), (L.explosion(0.5, r, 0.5) * 0.5, 0.2, 1)]),
    }


def skyjet(r):
    return {
        "start": L.mix([(C.blip(2000, 0.05, "sine", 0.03), 0, 0.7), (C.blip(2600, 0.07, "sine", 0.05), 0.06, 0.7), (L.whoosh(0.25, 800, 3500, r, shape="fast") * 0.4, 0, 1)]),
        "launch": L.mix([(L.sweep(180, 1400, 1.0, "saw") * L.env_swell(L.N(1.0), 0.85, 1.2) * 0.35, 0, 1), (L.whoosh(1.0, 400, 6000, r) * 0.8, 0.05, 1)]),
        "loop": (lambda a, w: a * 0.6 + w * 0.5)(L.stretch_loop_noise(1.0, r, 700, 5500), np.sin(2 * np.pi * 880 * np.arange(L.N(1.0)) / L.SR) * (0.7 + 0.3 * np.sin(2 * np.pi * 3 * np.arange(L.N(1.0)) / L.SR))),
        "cashout": L.mix([(L.bell(float(hz(96)), 0.6, 0.3), 0, 1), (L.bell(float(hz(103)), 0.7, 0.35), 0.1, 0.9)]),
        "special": L.mix([(L.sweep(1500, 120, 0.7, "saw") * L.env_exp(L.N(0.7), 0.35) * 0.4, 0, 1), (L.thud(70, 0.4, r, 0.12) * 1.1, 0.5, 1)]),
        "win": C.win_stinger(r, 84, L.MAJOR_PENT, C.voice("glass", d=0.5, ratio=2.0, index=2.2), 5, shim=0.4, step=0.06),
        "bigwin": C.bigwin_stinger(r, 84, L.MAJOR_PENT, C.voice("glass", d=0.6, ratio=2.0, index=2.2), 0.9, 0.8),
        "lose": C.lose_motif(r, 84, L.MAJOR_PENT, C.voice("glass", d=0.5, ratio=2.0, index=2.2), "glass", 880, 0.5),
    }


def airship(r):
    return {
        "start": L.mix([(L.hp(L.noise(0.3, r), 3000) * L.env_swell(L.N(0.3), 0.3) * 0.35, 0, 1), (L.click(r, 0.03, 900, 4), 0.02, 0.8), (L.bell(float(hz(65)), 0.5, 0.3), 0.12, 0.6)]),
        "launch": L.mix([(L.hp(L.noise(1.0, r), 2200) * L.env_swell(L.N(1.0), 0.4) * 0.45, 0, 1), (L.bell(float(hz(60)), 0.9, 0.5), 0.1, 0.8), (L.sweep(60, 120, 1.0, "saw") * L.env_swell(L.N(1.0), 0.8) * 0.2, 0, 1)]),
        "loop": C.pad_loop(r, [110, 165, 220, 330, 440], trem=2, noise_amt=0.3),
        "cashout": L.mix([(L.bell(float(hz(72)), 0.7, 0.4), 0, 1), (L.bell(float(hz(76)), 0.7, 0.4), 0.14, 1)]),
        "special": L.mix([(L.gong(95, 1.2, 0.8), 0, 1), (L.rattle(r, 0.5, 30, 700) * 0.5, 0.05, 1), (L.sweep(300, 60, 0.9, "saw") * L.env_exp(L.N(0.9), 0.4) * 0.25, 0, 1)]),
        "win": C.win_stinger(r, 69, L.MAJOR, C.voice("organ", d=0.6, tau=0.4), 5, coins=0.4, step=0.085),
        "bigwin": C.bigwin_stinger(r, 69, L.MAJOR, C.voice("organ", d=0.7, tau=0.5), 0.9, 0.3, bass=L.gong(110, 1.6) * 0.6),
        "lose": C.lose_motif(r, 69, L.MAJOR, C.voice("organ", d=0.6, tau=0.4), "wah", 260, 0.5),
    }


def cosmonaut(r):
    return {
        "start": L.mix([(C.blip(1000, 0.06, "sine", 0.05), 0, 0.7), (C.blip(1000, 0.06, "sine", 0.05), 0.12, 0.7), (L.hp(L.noise(0.2, r), 4000) * L.env_exp(L.N(0.2), 0.08) * 0.3, 0.2, 1)]),
        "launch": L.mix([(L.sweep(150, 2400, 1.0, "saw") * L.env_swell(L.N(1.0), 0.8) * 0.28, 0, 1), (L.fm(300, 1.5, 6.0, 1.0, 0.6, 0.5) * L.env_swell(L.N(1.0), 0.8) * 0.3, 0, 1), (L.hp(L.noise(1.0, r), 3500) * L.env_swell(L.N(1.0), 0.3) * 0.25, 0, 1)]),
        "loop": C.pad_loop(r, [110, 165, 220, 277, 330], trem=3, noise_amt=0.1),
        "cashout": L.mix([(L.reverb(L.osc("sine", 1318, 0.12) * L.env_exp(L.N(0.12), 0.06), 0.9, 0.5, rng=r), 0, 1), (L.reverb(L.osc("sine", 1760, 0.12) * L.env_exp(L.N(0.12), 0.06), 0.9, 0.5, rng=r), 0.2, 0.8)]),
        "special": L.mix([(L.lp(L.noise(0.5, r), 3000) * L.env_exp(L.N(0.5), 0.16) * 0.9, 0, 1), (L.sweep(1200, 60, 0.9, "sine") * L.env_exp(L.N(0.9), 0.4) * 0.5, 0.05, 1)]),
        "win": C.win_stinger(r, 81, L.MAJOR_PENT, C.voice("synth", d=0.5, cut=3600, tau=0.3), 6, shim=0.5, step=0.065),
        "bigwin": C.bigwin_stinger(r, 81, L.MAJOR_PENT, C.voice("synth", d=0.6, cut=3600, tau=0.35), 0.8, 0.9),
        "lose": L.mix([(L.sweep(900, 100, 0.6, "sine") * L.env_exp(L.N(0.6), 0.35) * 0.5, 0, 1), (L.hp(L.noise(0.3, r), 2000) * L.env_exp(L.N(0.3), 0.1) * 0.25, 0, 1)]),
    }


def cricketx(r):
    def bat():
        return L.mix([(L.click(r, 0.03, 1200, 3, 0.008) * 1.6, 0, 1), (L.resonator(L.noise(0.12, r) * L.env_exp(L.N(0.12), 0.025), 760, 9) * 3, 0, 1), (L.thud(180, 0.1, r, 0.03, 0.2), 0, 0.8)])
    return {
        "start": L.mix([(L.thud(120, 0.12, r, 0.04), 0, 1), (L.thud(150, 0.1, r, 0.03), 0.2, 0.8)]),
        "launch": L.mix([(bat(), 0, 1.2), (L.cheer(1.0, r) * 0.45, 0.1, 1)]),
        "loop": C.crowd_loop(r, 1.0, 300, 2200),
        "cashout": L.mix([(L.cheer(1.0, r) * 0.7, 0, 1), (L.rattle(r, 0.4, 14, 1500, 0.3) * 0.7, 0.1, 1)]),
        "special": L.mix([(L.rattle(r, 0.4, 36, 3200) * 0.5, 0, 1), (L.thud(140, 0.3, r, 0.1), 0.1, 1), (L.voice_glide(300, 190, 0.7, formants=(600, 1000), rng=r) * 0.5, 0.2, 1)]),
        "win": C.win_stinger(r, 72, L.MAJOR, C.voice("mallet", d=0.5, tau=0.3), 5, coins=0.3),
        "bigwin": C.bigwin_stinger(r, 72, L.MAJOR, C.voice("mallet", d=0.6), 0.9, 0.3, bass=L.cheer(1.6, r) * 0.55),
        "lose": C.lose_motif(r, 72, L.MAJOR, C.voice("mallet", d=0.5, tau=0.3), "thud", 220, 0.45),
    }


def nightracer(r):
    return {
        "start": L.mix([(L.rattle(r, 0.35, 28, 700, 0.2) * 0.7, 0, 1), (L.sweep(70, 220, 0.4, "saw") * L.env_swell(L.N(0.4), 0.8) * 0.35, 0.1, 1)]),
        "launch": L.mix([(L.sweep(70, 520, 1.0, "saw") * L.env_swell(L.N(1.0), 0.85, 1.1) * 0.4, 0, 1), (L.bp(L.noise(0.3, r), 2500, 4200) * L.env_exp(L.N(0.3), 0.1) * 0.4, 0.2, 1)]),
        "loop": C.engine_loop(r, f0=121, chug=41, noise_amt=0.18, band=(400, 1600), n_h=22, cut=3600, dist=3.4),
        "step": L.mix([(L.whoosh(0.5, 500, 7000, r, shape="fast") * 0.8, 0, 1), (L.sweep(200, 1400, 0.35, "saw") * L.env_swell(L.N(0.35), 0.6) * 0.3, 0, 1)]),
        "cashout": L.mix([(C.voice("brass", d=0.4)(float(hz(67))), 0, 0.8), (C.voice("brass", d=0.5)(float(hz(71))), 0.1, 0.8), (C.voice("brass", d=0.6)(float(hz(74))), 0.2, 0.9), (L.coin_shower(r, 6, 0.4), 0.2, 0.7)]),
        "special": L.mix([(L.bp(L.noise(0.8, r), 1800, 4300) * L.env_swell(L.N(0.8), 0.15, 0.9) * 0.9, 0, 1), (L.explosion(0.7, r, 0.8), 0.35, 1), (L.rattle(r, 0.5, 60, 4500) * 0.3, 0.4, 1)]),
        "win": C.win_stinger(r, 67, L.MINOR_PENT, C.voice("brass", d=0.5, tau=0.3), 5, coins=0.5, step=0.07),
        "bigwin": C.bigwin_stinger(r, 67, L.MINOR_PENT, C.voice("brass", d=0.6, tau=0.35), 1.0, 0.4),
        "lose": C.lose_motif(r, 67, L.MINOR_PENT, C.voice("brass", d=0.5, tau=0.3), "slide", 220, 0.5, -12),
    }


def goalrush(r):
    return {
        "start": L.whistle(2950, 0.28, 12, r) * 0.8,
        "launch": L.mix([(L.thud(95, 0.18, r, 0.05, 0.4), 0, 1.2), (L.whoosh(0.5, 400, 2500, r, shape="fast") * 0.5, 0.05, 1)]),
        "loop": L.stretch_loop_noise(1.0, r, 300, 2600) * 0.45 + L.harmonics(233, 1.0, [1, 0.7, 0.5, 0.4, 0.3, 0.2, 0.15, 0.1]) * 0.5,
        "cashout": L.mix([(L.cheer(1.2, r) * 0.8, 0, 1), (L.whistle(3050, 0.35, 16, r) * 0.6, 0.1, 1)]),
        "special": L.mix([(L.bell(float(hz(83)), 0.5, 0.2, 1.4), 0, 0.9), (L.thud(110, 0.2, r, 0.07), 0.02, 1), (L.voice_glide(360, 200, 0.8, formants=(650, 1050), rng=r) * 0.5, 0.2, 1)]),
        "win": C.win_stinger(r, 74, L.MAJOR, C.voice("brass", d=0.45, tau=0.28), 4, coins=0.3, step=0.08),
        "bigwin": C.bigwin_stinger(r, 74, L.MAJOR, C.voice("brass", d=0.55, tau=0.3), 0.7, 0.4, bass=L.cheer(1.8, r) * 0.7),
        "lose": C.lose_motif(r, 74, L.MAJOR, C.voice("brass", d=0.45, tau=0.28), "wah", 300, 0.55),
    }


def bigcatch(r):
    def splash(g=1.0):
        return L.mix([(L.lp(L.noise(0.35, r), 3200) * L.env_exp(L.N(0.35), 0.09) * 0.9, 0, g), (L.sweep(300, 900, 0.08, "sine") * L.env_exp(L.N(0.08), 0.03), 0.06, 0.6 * g), (L.sweep(400, 1300, 0.06, "sine") * L.env_exp(L.N(0.06), 0.03), 0.13, 0.5 * g)])
    return {
        "start": L.mix([(L.thud(140, 0.14, r, 0.04), 0, 0.8), (C.start_sound(r, "bubble", 500), 0.04, 1)]),
        "launch": L.mix([(L.whoosh(0.45, 600, 2600, r, shape="fast") * 0.7, 0, 1), (splash(), 0.4, 1)]),
        "loop": (lambda a: a * (0.7 + 0.3 * np.sin(2 * np.pi * 1 * np.arange(L.N(1.0)) / L.SR)))(L.stretch_loop_noise(1.0, r, 150, 1400)),
        "step": L.rattle(r, 0.25, 30, 2200, 0.1) * 1.5,
        "cashout": L.mix([(L.rattle(r, 0.3, 36, 2600, 0.2) * 1.4, 0, 1), (splash(0.8), 0.25, 1), (L.bell(float(hz(79)), 0.6, 0.3), 0.35, 0.8)]),
        "special": L.mix([(L.sweep(2200, 450, 0.18, "saw") * L.env_exp(L.N(0.18), 0.05) * 0.6, 0, 1), (L.click(r, 0.02, 3500, 4) * 1.2, 0, 1), (L.thud(90, 0.3, r, 0.1), 0.12, 0.8)]),
        "win": C.win_stinger(r, 70, L.MAJOR_PENT, C.voice("pluck", d=0.5, damp=0.995), 5, coins=0.5),
        "bigwin": C.bigwin_stinger(r, 70, L.MAJOR_PENT, C.voice("pluck", d=0.6), 0.9, 0.4, extra=splash(0.7)),
        "lose": C.lose_motif(r, 70, L.MAJOR_PENT, C.voice("pluck", d=0.5, damp=0.995), "pluck", 330, 0.5),
    }


def vortex(r):
    return {
        "start": L.mix([(L.sweep(200, 900, 0.35, "sine") * L.env_swell(L.N(0.35), 0.7) * 0.5, 0, 1), (L.whoosh(0.35, 300, 2500, r, shape="fast") * 0.5, 0, 1)]),
        "tick": L.mix([(L.sweep(260, 880, 0.07, "sine") * L.env_exp(L.N(0.07), 0.03) * 0.9, 0, 1), (L.click(r, 0.02, 2600, 5), 0.0, 0.4)]),
        "land": L.mix([(L.fm(float(hz(79)), 4.1, 2.6, 0.4, 0.22, 0.08), 0, 1), (L.thud(120, 0.1, r, 0.04), 0, 0.5)]),
        "cashout": L.mix([(L.gong(140, 1.2, 0.7), 0, 0.9), (L.coin_shower(r, 7, 0.4), 0.05, 0.8)]),
        "special": L.mix([(L.sweep(1200, 60, 1.0, "saw") * L.env_exp(L.N(1.0), 0.5) * 0.4, 0, 1), (L.reverse(L.whoosh(0.9, 300, 3000, r)) * 0.6, 0, 1)]),
        "win": C.win_stinger(r, 73, L.MAJOR_PENT, C.voice("glass", d=0.6, ratio=4.1, index=3.0), 6, shim=0.8, step=0.07),
        "bigwin": C.bigwin_stinger(r, 73, L.MAJOR_PENT, C.voice("glass", d=0.7, ratio=4.1, index=3.0), 0.8, 1.0),
        "lose": L.mix([(L.sweep(500, 60, 0.7, "sine") * L.env_exp(L.N(0.7), 0.4) * 0.6, 0, 1), (L.lp(L.noise(0.6, r), 600) * L.env_swell(L.N(0.6), 0.3) * 0.3, 0, 1)]),
    }


# ================================================================== step / risk games
def chickenroad(r):
    # Silent by choice: the owner asked for no sound effects in Chicken Road (no cluck on a step, no horn, no jingles).
    # Only its background music plays (assets/sounds/music/chickenroad.mp3).
    return {}


def mines(r):
    def gem(f):
        return L.reverb(L.fm(f, 3.5, 3.4, 0.45, 0.28, 0.09), 0.4, 0.18, rng=r)
    return {
        "start": L.mix([(L.rattle(r, 0.3, 40, 3000, 0.4) * 1.4, 0, 1), (L.click(r, 0.02, 2200, 5) * 0.9, 0.31, 1)]),
        "step": gem(float(hz(88))),
        "cashout": _cash(r, 2450, 8, 90),
        "special": L.mix([(L.lp(L.explosion(1.0, r, 1.0), 1800), 0, 1.1), (L.rattle(r, 0.7, 60, 900, 0.3) * 0.6, 0.15, 1)]),
        "win": C.win_stinger(r, 76, L.MAJOR_PENT, C.voice("glass", d=0.55, index=3.2), 6, shim=0.5, coins=0.3, step=0.06),
        "bigwin": C.bigwin_stinger(r, 76, L.MAJOR_PENT, C.voice("glass", d=0.65, index=3.2), 1.0, 0.8),
        "lose": C.lose_motif(r, 76, L.MAJOR_PENT, C.voice("glass", d=0.55, index=3.2), "buzz", 200, 0.4),
    }


def dragontower(r):
    roar = L.distort(L.voice_glide(95, 150, 0.9, vib=7, vdepth=0.03, formants=(420, 760), rng=r), 3.0) * 0.7 + L.lp(L.noise(0.9, r), 1400) * L.env_swell(L.N(0.9), 0.3) * 0.25
    return {
        "start": L.mix([(L.gong(150, 1.2, 0.8) * 0.9, 0, 1)]),
        "step": L.mix([(C.stone_step(r, 95, 0.2), 0, 1), (L.pluck(float(hz(64 + int(r.integers(0, 4)) * 2)), 0.5) * 0.7, 0.04, 1)]),
        "cashout": L.mix([(L.gong(190, 1.4, 0.9) * 0.9, 0, 1), (L.coin_shower(r, 8, 0.5), 0.1, 0.8)]),
        "special": L.mix([(roar * L.env_swell(L.N(0.9), 0.3), 0, 1), (L.explosion(0.6, r, 0.6) * 0.5, 0.15, 1)]),
        "win": C.win_stinger(r, 57, L.HIRAJOSHI, C.voice("bell", d=0.7, tau=0.5), 6, coins=0.4, step=0.09, rev=(0.7, 0.25)),
        "bigwin": C.bigwin_stinger(r, 57, L.HIRAJOSHI, C.voice("bell", d=0.8, tau=0.55), 0.8, 0.4, bass=L.gong(100, 1.8) * 0.8),
        "lose": L.mix([(roar * 0.6 * L.env_swell(L.N(0.9), 0.2), 0, 1), (L.thud(70, 0.3, r, 0.1), 0.5, 1)]),
    }


def treasuredig(r):
    def dig():
        return L.mix([(L.lp(L.noise(0.18, r), 1800) * L.env_swell(L.N(0.18), 0.35) * 0.8, 0, 1), (L.thud(110, 0.15, r, 0.05, 0.6), 0.12, 1)])
    creak = L.resonator(L.sweep(180, 360, 0.5, "saw") * L.env_swell(L.N(0.5), 0.5), 420, 5) * 0.6
    return {
        "start": L.mix([(dig(), 0, 1)]),
        "step": L.mix([(dig(), 0, 0.9), (L.coin(r, 3000, 0.15, 0.05), 0.2, 0.6)]),
        "cashout": L.mix([(creak, 0, 0.9), (L.coin_shower(r, 14, 0.8), 0.3, 1)]),
        "special": L.mix([(L.click(r, 0.02, 2600, 6) * 1.2, 0, 1), (L.click(r, 0.02, 2200, 6) * 1.2, 0.09, 1), (C.start_sound(r, "bubble", 350), 0.18, 0.8)]),
        "win": C.win_stinger(r, 67, L.MAJOR, C.voice("mallet", d=0.5, tau=0.28), 5, coins=0.9, step=0.08),
        "bigwin": C.bigwin_stinger(r, 67, L.MAJOR, C.voice("mallet", d=0.6), 1.2, 0.3, extra=creak),
        "lose": C.lose_motif(r, 67, L.MAJOR, C.voice("mallet", d=0.5, tau=0.28), "wah", 260, 0.5),
    }


def bombsquad(r):
    def beeps(n=3, f=1000, gap=0.12):
        return L.mix([(C.blip(f, 0.07, "square", 0.05), i * gap, 0.55) for i in range(n)])
    return {
        "start": beeps(3, 900, 0.13),
        "step": L.mix([(L.click(r, 0.02, 3200, 6) * 1.3, 0, 1), (L.click(r, 0.02, 2400, 6), 0.025, 0.8), (C.blip(1500, 0.08, "sine", 0.05), 0.07, 0.5)]),
        "cashout": L.mix([(C.blip(1000, 0.07, "square", 0.05), 0, 0.5), (C.blip(1330, 0.07, "square", 0.05), 0.1, 0.5), (C.blip(1760, 0.1, "square", 0.08), 0.2, 0.5), (L.bell(float(hz(91)), 0.6, 0.3), 0.3, 0.7)]),
        "special": L.mix([(beeps(4, 1400, 0.06), 0, 1), (L.distort(L.explosion(1.3, r, 1.6), 2.0), 0.26, 1), (L.rattle(r, 0.5, 40, 3200, 0.5) * 0.35, 0.4, 1)]),
        "win": C.win_stinger(r, 79, L.MAJOR, C.voice("synth", d=0.4, cut=4200, tau=0.2), 5, step=0.06),
        "bigwin": C.bigwin_stinger(r, 79, L.MAJOR, C.voice("synth", d=0.5, cut=4200), 0.8, 0.4),
        "lose": L.mix([(beeps(3, 700, 0.1), 0, 1), (C.blip(300, 0.35, "saw", 0.2, -0.4), 0.32, 0.6)]),
    }


def vaultheist(r):
    def tumbler(f=1100):
        return L.mix([(L.click(r, 0.02, f * 2.4, 8) * 1.5, 0, 1), (L.resonator(L.noise(0.12, r) * L.env_exp(L.N(0.12), 0.03), f, 14) * 2, 0, 0.7)])
    return {
        "start": L.mix([(tumbler(900), 0, 0.8), (tumbler(1000), 0.12, 0.8), (tumbler(1150), 0.26, 0.9)]),
        "step": L.mix([(tumbler(1250), 0, 1), (C.blip(1480, 0.08, "sine", 0.05), 0.03, 0.4)]),
        "cashout": L.mix([(L.thud(60, 0.4, r, 0.15) * 1.3, 0, 1), (L.resonator(L.noise(0.3, r) * L.env_exp(L.N(0.3), 0.08), 800, 8) * 2, 0.02, 0.6), (L.coin_shower(r, 12, 0.7), 0.3, 0.9)]),
        "special": L.mix([(L.siren(0.9, 620, 1000, 3.0) * 0.55, 0, 1)]),
        "win": C.win_stinger(r, 63, L.MINOR_PENT, C.voice("epiano", d=0.5, index=3.0), 5, coins=0.8, step=0.08),
        "bigwin": C.bigwin_stinger(r, 63, L.MINOR_PENT, C.voice("epiano", d=0.6, index=3.0), 1.0, 0.4, bass=L.thud(55, 0.5, r, 0.2) * 1.2),
        "lose": L.mix([(L.siren(0.5, 620, 900, 4.0) * 0.5, 0, 1), (C.lose_motif(r, 65, L.MINOR_PENT, C.voice("epiano", d=0.5), "buzz", 200, 0.4), 0.3, 0.7)]),
    }


def penaltyhero(r):
    kick = L.mix([(L.thud(90, 0.18, r, 0.05, 0.5), 0, 1.3), (L.click(r, 0.02, 900, 3), 0, 0.5)])
    return {
        "start": L.mix([(L.thud(70, 0.12, r, 0.04), 0, 0.8), (L.whistle(2550, 0.2, 10, r), 0.12, 0.7)]),
        "step": L.mix([(kick, 0, 1), (L.whoosh(0.4, 600, 4000, r, shape="fast") * 0.5, 0.1, 0.8)]),
        "cashout": L.mix([(L.whoosh(0.3, 800, 5000, r, shape="fast") * 0.6, 0, 1), (L.thud(90, 0.15, r, 0.05) * 1.2, 0.25, 1), (L.cheer(0.9, r) * 0.55, 0.3, 1)]),
        "special": L.mix([(L.thud(160, 0.12, r, 0.04, 0.8) * 1.2, 0, 1), (L.voice_glide(330, 200, 0.8, formants=(620, 1000), rng=r) * 0.5, 0.15, 1)]),
        "win": C.win_stinger(r, 71, L.MAJOR, C.voice("brass", d=0.45, tau=0.28), 4, step=0.09, coins=0.3),
        "bigwin": C.bigwin_stinger(r, 71, L.MAJOR, C.voice("brass", d=0.55), 0.7, 0.4, bass=L.cheer(1.7, r) * 0.7),
        "lose": C.lose_motif(r, 71, L.MAJOR, C.voice("brass", d=0.45, tau=0.28), "wah", 280, 0.55),
    }


def luckycups(r):
    def slide(d=0.22, f=2200):
        return L.bp(L.noise(d, r), f * 0.4, f * 1.2) * L.env_swell(L.N(d), 0.5) * 1.6
    return {
        "start": L.mix([(slide(0.2), 0, 1), (L.thud(200, 0.06, r, 0.02), 0.2, 0.7), (slide(0.2, 1800), 0.22, 1), (L.thud(180, 0.06, r, 0.02), 0.42, 0.7), (slide(0.2, 2400), 0.44, 1)]),
        "step": L.mix([(L.thud(230, 0.08, r, 0.03, 0.7), 0, 1), (L.click(r, 0.02, 1400, 4), 0, 0.6)]),
        "cashout": _cash(r, 2350, 7, 86),
        "special": L.mix([(L.sweep(300, 1500, 0.08, "sine") * L.env_exp(L.N(0.08), 0.04), 0, 1), (L.click(r, 0.02, 2800, 6), 0.06, 0.7), (L.bell(float(hz(91)), 0.5, 0.25), 0.07, 0.8)]),
        "win": C.win_stinger(r, 74, L.MAJOR_PENT, C.voice("mallet", d=0.45, tau=0.25), 5, coins=0.5, step=0.07),
        "bigwin": C.bigwin_stinger(r, 74, L.MAJOR_PENT, C.voice("mallet", d=0.55), 0.9, 0.3),
        "lose": L.mix([(L.thud(160, 0.15, r, 0.05, 0.8), 0, 1), (C.lose_motif(r, 74, L.MAJOR_PENT, C.voice("mallet", d=0.45, tau=0.25), "wah", 300, 0.5), 0.1, 0.7)]),
    }


def pump(r):
    def pshh(d=0.16, g=1.0):
        return L.bp(L.noise(d, r), 1500, 6000) * L.env_swell(L.N(d), 0.3) * 1.4 * g
    def squeak(f=700):
        return L.fm(f, 1.0, 1.8, 0.14, 0.07, 0.05) * 0.5
    return {
        "start": L.mix([(pshh(), 0, 1), (L.thud(120, 0.08, r, 0.03), 0, 0.5)]),
        "step": L.mix([(pshh(0.14), 0, 1), (squeak(float(hz(70 + int(r.integers(0, 6))))), 0.05, 0.8)]),
        "cashout": L.mix([(C.blip(1800, 0.08, "sine", 0.06), 0, 0.7), (_cash(r, 2500, 6, 90), 0.05, 1)]),
        "special": L.mix([(L.click(r, 0.02, 1800, 1.5, 0.01) * 2.2, 0, 1), (L.hp(L.noise(0.12, r), 800) * L.env_exp(L.N(0.12), 0.025) * 1.2, 0, 1), (L.thud(110, 0.12, r, 0.03), 0, 0.6)]),
        "win": C.win_stinger(r, 77, L.MAJOR, C.voice("sine", d=0.3, tau=0.18), 5, coins=0.5, step=0.06, rev=(0.3, 0.12)),
        "bigwin": C.bigwin_stinger(r, 77, L.MAJOR, C.voice("sine", d=0.35, tau=0.2), 0.9, 0.5),
        "lose": L.mix([(L.click(r, 0.02, 1800, 1.5, 0.01) * 2.0, 0, 1), (L.hp(L.noise(0.12, r), 800) * L.env_exp(L.N(0.12), 0.025), 0, 1), (C.lose_motif(r, 77, L.MAJOR, C.voice("sine", d=0.3, tau=0.18), "wah", 300, 0.4), 0.1, 0.6)]),
    }


def coinflip(r):
    toss =L.mix([(L.sweep(1500, 2900, 0.5, "sine", "lin") * L.env_exp(L.N(0.5), 0.45) * 0.4, 0, 1), (L.sweep(3000, 4600, 0.5, "sine", "lin") * L.env_exp(L.N(0.5), 0.35) * 0.2, 0, 1)])
    land = L.mix([(L.coin(r, 2300, 0.3, 0.1), 0, 1), (L.coin(r, 2700, 0.2, 0.06), 0.09, 0.7), (L.coin(r, 3100, 0.12, 0.04), 0.15, 0.5)])
    return {
        "start": toss,
        "step": land,
        "cashout": L.coin_shower(r, 10, 0.6, 2450),
        "win": C.win_stinger(r, 78, L.MAJOR, C.voice("bell", d=0.45, tau=0.28), 4, coins=0.4, step=0.07),
        "bigwin": C.bigwin_stinger(r, 78, L.MAJOR, C.voice("bell", d=0.5), 1.0, 0.5),
        "lose": L.mix([(L.coin(r, 1700, 0.3, 0.09), 0, 1), (C.lose_motif(r, 78, L.MAJOR, C.voice("bell", d=0.45, tau=0.28), "glass", 700, 0.4), 0.1, 0.5)]),
    }


def hilo(r):
    return {
        "start": L.mix([(C.card_deal(2), 0, 1), (C.card_place(1), 0.14, 0.8)]),
        "step": L.mix([(C.card_place(0, 1.5), 0, 1), (C.blip(660, 0.06, "sine", 0.04, 0.3), 0.06, 0.4)]),
        "cashout": L.mix([(C.chips_win(r, 1), 0, 1), (L.bell(float(hz(86)), 0.5, 0.25), 0.1, 0.5)]),
        "win": C.win_stinger(r, 72, L.MAJOR_PENT, C.voice("epiano", d=0.45), 4, step=0.07),
        "bigwin": C.bigwin_stinger(r, 72, L.MAJOR_PENT, C.voice("epiano", d=0.55), 0.8, 0.4),
        "lose": L.mix([(C.card_place(2, -3), 0, 0.9), (C.lose_motif(r, 72, L.MAJOR_PENT, C.voice("epiano", d=0.45), "buzz", 240, 0.35), 0.05, 0.6)]),
    }


GAMES_A = {
    "aviator": aviator, "rocket": rocket, "skyjet": skyjet, "airship": airship, "cosmonaut": cosmonaut,
    "cricketx": cricketx, "nightracer": nightracer, "goalrush": goalrush, "bigcatch": bigcatch, "vortex": vortex,
    "chickenroad": chickenroad, "mines": mines, "dragontower": dragontower, "treasuredig": treasuredig,
    "bombsquad": bombsquad, "vaultheist": vaultheist, "penaltyhero": penaltyhero, "luckycups": luckycups,
    "pump": pump, "coinflip": coinflip, "hilo": hilo,
}
