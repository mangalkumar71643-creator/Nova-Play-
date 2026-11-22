"""Makes the voice calls of the table games ("Bet now" when betting opens, "Bet locked" when it closes) with Kokoro, an
open-weight text-to-speech model (82 M parameters, Apache-2.0 licence, "trained exclusively on permissive / non-copyrighted audio
data"), run offline through onnxruntime, in a soft female voice: its "af_bella" with a little of "af_sky" (90 % / 10 %).
(Model card: https://huggingface.co/hexgrad/Kokoro-82M, ONNX files: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)

    pip install onnxruntime soundfile scipy numpy
    python3 mobile/scripts/sounds/voice.py [--model-dir DIR] [--voice af_bella:0.9,af_sky:0.1]    # downloads the model (326 MB) the first time

writes supplied/ui/bet_now.flac and supplied/ui/bet_stop.flac; build.py then turns them into assets/sounds/ui/bet_now.mp3 and
bet_stop.mp3 like the other interface sounds (src/sound/ui.ts plays them). The same settings always give the same words.

The words are written as Kokoro's own phonemes (one character each, see tokenizer.json), not as text, so that nothing is guessed:
"bˈɛt" (bet), "nˈW" (now: W is the sound of "ow"), "lˈɑkt" (locked); ˈ puts the stress on the vowel, ː draws a sound out and ","
is a short pause. ("plˈiz" is "please": the opening call was "Please bet now" until 2026-11-22.)

What the owner asked for, and how each part is done:
  * "Bet now" and "Bet locked", no "Please" in either (the first versions said "Please bet now" and "Please bet stop").
  * slower and longer: speech at speed 0.60 (the first version, 1.0.113, was 0.72; 1.0 is normal speech) and the pause between the
    words drawn out (`widen`): "Bet... now" is 1.6 s and "Bet... locked" 1.9 s (as "Please bet now" / "Please bet stop" they were 1.4 s
    and 1.5 s). The speed cannot simply be lowered further: below about 0.58 the model blurs the soft "b" that opens "Bet" (a speech
    recognizer then hears "that locked"), and stretching the finished sound does the same, so the extra length is added as pause.
  * softer, "with love": a soft, clear female voice of the model, a little warmth added around 220 Hz, a gentler lift of the consonants
    (3 kHz) than before and the sharp top (above 6.5 kHz) rounded off. More of the very soft voice "af_sky" (a 60/40 mix was tried)
    makes it softer still, but the opening "b" then turns into a thump that a recognizer hears as "ooh bet locked"; a mix is made by
    averaging the voices' style vectors, which is how Kokoro's voices are meant to be combined.
  * checked the way the app plays it: the finished interface sounds (levelled, louder by UI_GAIN, mp3) were run through three speech
    recognizers (Whisper tiny.en, base.en, small.en), all of which hear "bet now" and "bet locked".

Why "Bet now" is written "bˈɛːːt nˈWː" with a long vowel: spoken plainly ("bˈɛt nˈWː") it is heard as "but now" by most recognizers at
every speed tried (the soft "b" and the short vowel of "bet" come too close to "but"; with "Please" in front of it, as in the first
versions, every voice was heard right). With the vowel of "bet" drawn out all three recognizers hear "bet now" at speeds 0.58, 0.60 and
0.62, and with the pause before "now" drawn out by 0.35-0.45 s at 0.60 (0.55 s already fails); the call uses 0.60 and 0.40 s. "Bet
locked" is just as fragile (0.62 and a softer voice already fail). Any change of voice, speed, words or pause has to be checked again
as described above.

The owner's reference clip (another app's announcer saying "Please bet now" in about 1.5 s) was NOT copied: a recording of someone
else's voice and of another company's product is not ours to clone. Only the way it is delivered (unhurried, the last word drawn out)
was matched, with an ordinary voice of the open model. To try another voice: --voice af_heart, af_sarah, hf_alpha, bf_emma ... or a mix
such as af_bella:0.5,af_heart:0.5.
"""
import argparse
import json
import os
import urllib.request

import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "supplied", "ui")
BASE = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/"
VOICE = "af_bella:0.9,af_sky:0.1"  # voice:weight[,voice:weight ...]

# file name -> (what is said, as Kokoro phonemes; speed of speech, 1.0 = normal; seconds added to the last pauses before the final word)
LINES = {
    "bet_now": ("bˈɛːːt nˈWː", 0.60, (0.40,)),  # "Bet... now" (no "Please": the owner wants exactly "Bet now"; the long vowel keeps "bet" from being heard as "but")
    "bet_stop": ("bˈɛt, lˈɑkt", 0.60, (0.25,)),  # "Bet... locked" (no "Please": the owner wants exactly "Bet locked")
}


def parse_voice(spec):
    """'af_bella:0.6,af_sky:0.4' -> {'af_bella': 0.6, 'af_sky': 0.4}; a bare name is that voice alone."""
    mix = {}
    for part in spec.split(","):
        name, _, weight = part.strip().partition(":")
        mix[name] = float(weight) if weight else 1.0
    return mix


def fetch(model_dir, voices):
    os.makedirs(model_dir, exist_ok=True)
    wanted = [("onnx/model.onnx", "model.onnx"), ("tokenizer.json", "tokenizer.json")] + [(f"voices/{v}.bin", f"{v}.bin") for v in voices]
    for remote, local in wanted:
        path = os.path.join(model_dir, local)
        if not os.path.exists(path):
            print("downloading", remote)
            urllib.request.urlretrieve(BASE + remote, path)
    return model_dir


def speak(model_dir, voices, phonemes, speed):
    from onnxruntime import InferenceSession

    sess = InferenceSession(os.path.join(model_dir, "model.onnx"), providers=["CPUExecutionProvider"])
    vocab = json.load(open(os.path.join(model_dir, "tokenizer.json")))["model"]["vocab"]
    ids = [vocab[c] for c in phonemes if c in vocab]
    # a voice is a table of style vectors, one per sentence length; a mix is the weighted average of the voices' vectors
    style = sum(w * np.fromfile(os.path.join(model_dir, f"{v}.bin"), dtype=np.float32).reshape(-1, 1, 256)[len(ids)] for v, w in voices.items()) / sum(voices.values())
    out = sess.run(None, dict(input_ids=np.array([[0, *ids, 0]], dtype=np.int64), style=style.astype(np.float32), speed=np.array([speed], dtype=np.float32)))[0]
    return out[0].astype(np.float32), 24000


def shape(x, sr):
    """For a phone speaker next to game music: nothing below ~120 Hz, a little warmth around 220 Hz, a soft lift where consonants live
    (3 kHz), the sharp top rounded off, at 44.1 kHz, silence off the ends."""
    x = signal.resample_poly(x, 147, 80).astype(np.float32)  # 24 kHz -> 44.1 kHz
    sr = 44100
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    gain = np.ones_like(f)
    gain[f < 120] = 0.0
    gain *= 1 + 0.2 * np.exp(-0.5 * ((f - 3000) / 1200) ** 2)  # about +1.6 dB around 3 kHz (the first version had +3.5 dB)
    gain *= 1 + 0.5 * np.exp(-0.5 * ((f - 220) / 90) ** 2)  # about +3.5 dB of warmth
    gain *= 1 / (1 + (f / 6500) ** 6)  # a gentle roll-off above 6.5 kHz
    x = np.fft.irfft(X * gain, len(x)).astype(np.float32)
    keep = np.where(np.abs(x) > 0.02 * np.max(np.abs(x)))[0]
    x = x[max(0, keep[0] - int(0.01 * sr)): keep[-1] + int(0.05 * sr)]
    return (x / np.max(np.abs(x)) * 0.89).astype(np.float32), sr


def pauses(x, sr, min_ms=60, quiet=0.04):
    """[(start ms, length ms)] of the silences inside the sound (below `quiet` of its loudest 5 ms) that last at least `min_ms`."""
    hop = int(0.005 * sr)
    n = len(x) // hop
    level = np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(1))
    silent = level < quiet * level.max()
    found, i = [], 0
    while i < n:
        if silent[i]:
            j = i
            while j < n and silent[j]:
                j += 1
            if (j - i) * 5 >= min_ms and i > 4 and j < n - 4:
                found.append((i * 5, (j - i) * 5))
            i = j
        else:
            i += 1
    return found


def widen(x, sr, extras, tail=0.4):
    """Draws the call out by adding silence (`extras`, seconds) to its last pauses, one extra per pause, counting back from the last
    pause that ends at least `tail` seconds before the end (the pause in front of the final word). The sound itself is not stretched:
    that would blur the soft "b" of "bet"."""
    ends_by = len(x) / sr * 1000 - tail * 1000
    ps = [p for p in pauses(x, sr) if p[0] + p[1] <= ends_by][-len(extras):]
    for (start, length), extra in reversed(list(zip(ps, extras[-len(ps):] if ps else ()))):
        mid = int((start + length / 2) / 1000 * sr)
        x = np.concatenate([x[:mid], np.zeros(int(extra * sr), np.float32), x[mid:]])
    return x


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", default=os.path.join(os.path.expanduser("~"), ".cache", "novaplay-kokoro"))
    ap.add_argument("--voice", default=VOICE, help="a Kokoro voice or a mix, e.g. af_heart, af_sarah, hf_alpha, af_bella:0.9,af_sky:0.1")
    args = ap.parse_args()
    voices = parse_voice(args.voice)
    model_dir = fetch(args.model_dir, voices)
    os.makedirs(OUT, exist_ok=True)
    for name, (phonemes, speed, extras) in LINES.items():
        x, sr = shape(*speak(model_dir, voices, phonemes, speed))
        x = widen(x, sr, extras)
        path = os.path.join(OUT, name + ".flac")
        sf.write(path, x, sr, format="FLAC", subtype="PCM_16")
        print(f"{path}: {phonemes!r} speed {speed} {len(x) / sr:.2f} s")


if __name__ == "__main__":
    main()
