"""Makes the voice calls of the table games ("Please bet now" when betting opens, "Please bet stop" when it closes) with Kokoro, an
open-weight text-to-speech model (82 M parameters, Apache-2.0 licence, "trained exclusively on permissive / non-copyrighted audio
data"), run offline through onnxruntime, and its female voice "af_heart".
(Model card: https://huggingface.co/hexgrad/Kokoro-82M, ONNX files: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX)

    pip install onnxruntime soundfile scipy numpy
    python3 mobile/scripts/sounds/voice.py [--model-dir DIR] [--voice af_heart]    # downloads the model (326 MB) into DIR the first time

writes supplied/ui/bet_now.flac and supplied/ui/bet_stop.flac; build.py then turns them into assets/sounds/ui/bet_now.mp3 and
bet_stop.mp3 like the other interface sounds (src/sound/ui.ts plays them). The same settings always give the same words.

The words are written as Kokoro's own phonemes (one character each, see tokenizer.json), not as text, so that nothing is guessed:
"plˈiz" (please), "bˈɛt" (bet), "nˈW" (now: W is the sound of "ow"), "stˈɑp" (stop); ˈ puts the stress on the vowel and ː draws a
sound out. Speed 0.72 (1.0 is normal) gives the delivery the owner wanted: unhurried, with the last word drawn out, about 1.4 s.

Why "Please bet now" and not "Bet now": a bare "Bet now" / "Bet stop" is misheard even by good voices (a speech recognizer heard
"that now", "let's stop": the soft "b" of "bet" is lost at the start of a sound); with "Please" before it every voice tried was heard
right ("please bet now", "please bet stop"). The owner's reference clip, another app's announcer saying "Please bet now" in about
1.5 s with "now" drawn out, shows the same thing. That recording's voice was NOT copied (a recording of someone else's voice and of
another company's product is not ours to clone); only its delivery was matched, with an ordinary voice from the open model that has
about the same pitch (a clear female voice around 200-230 Hz). To try another voice: --voice af_bella, af_sarah, hf_alpha, bf_emma ...
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
VOICE = "af_heart"
SPEED = 0.72

# file name -> what is said, as Kokoro phonemes
LINES = {"bet_now": "plˈiz bˈɛt nˈWː", "bet_stop": "plˈiz bˈɛt stˈɑːp"}


def fetch(model_dir, voice):
    os.makedirs(model_dir, exist_ok=True)
    for remote, local in (("onnx/model.onnx", "model.onnx"), ("tokenizer.json", "tokenizer.json"), (f"voices/{voice}.bin", f"{voice}.bin")):
        path = os.path.join(model_dir, local)
        if not os.path.exists(path):
            print("downloading", remote)
            urllib.request.urlretrieve(BASE + remote, path)
    return model_dir


def speak(model_dir, voice, phonemes):
    from onnxruntime import InferenceSession

    sess = InferenceSession(os.path.join(model_dir, "model.onnx"), providers=["CPUExecutionProvider"])
    vocab = json.load(open(os.path.join(model_dir, "tokenizer.json")))["model"]["vocab"]
    ids = [vocab[c] for c in phonemes if c in vocab]
    styles = np.fromfile(os.path.join(model_dir, f"{voice}.bin"), dtype=np.float32).reshape(-1, 1, 256)
    out = sess.run(None, dict(input_ids=np.array([[0, *ids, 0]], dtype=np.int64), style=styles[len(ids)], speed=np.array([SPEED], dtype=np.float32)))[0]
    return out[0].astype(np.float32), 24000


def shape(x, sr):
    """For a phone speaker next to game music: nothing below ~120 Hz, a lift where consonants live, at 44.1 kHz, silence off the ends."""
    x = signal.resample_poly(x, 147, 80).astype(np.float32)  # 24 kHz -> 44.1 kHz
    sr = 44100
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    gain = np.ones_like(f)
    gain[f < 120] = 0.0
    gain *= 1 + 0.5 * np.exp(-0.5 * ((f - 3000) / 1200) ** 2)  # about +3.5 dB around 3 kHz
    x = np.fft.irfft(X * gain, len(x)).astype(np.float32)
    keep = np.where(np.abs(x) > 0.02 * np.max(np.abs(x)))[0]
    x = x[max(0, keep[0] - int(0.01 * sr)): keep[-1] + int(0.05 * sr)]
    return (x / np.max(np.abs(x)) * 0.89).astype(np.float32), sr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", default=os.path.join(os.path.expanduser("~"), ".cache", "novaplay-kokoro"))
    ap.add_argument("--voice", default=VOICE, help="a Kokoro voice, e.g. af_heart, af_bella, af_sarah, hf_alpha, bf_emma")
    args = ap.parse_args()
    model_dir = fetch(args.model_dir, args.voice)
    os.makedirs(OUT, exist_ok=True)
    for name, phonemes in LINES.items():
        x, sr = shape(*speak(model_dir, args.voice, phonemes))
        path = os.path.join(OUT, name + ".flac")
        sf.write(path, x, sr, format="FLAC", subtype="PCM_16")
        print(f"{path}: {phonemes!r} {len(x) / sr:.2f} s")


if __name__ == "__main__":
    main()
