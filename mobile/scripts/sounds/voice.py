"""Makes the voice calls of the table games ("Bet now" when betting opens, "Bet stop" when it closes) with Piper, a free offline
text-to-speech engine (MIT licence), and the male voice "mike" (medium quality), trained on a CC0 (public domain dedication) dataset.
(Hugging Face model card: https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/mike/medium/MODEL_CARD)

The words were chosen by trying the permissively licensed English voices and checking, with an offline speech recognizer, that
the finished clips are heard as "bet now" and "bet stop": in most voices the "b" of "bet" and the "t" before "stop" are soft, and the
recognizer heard "that now", "let's stop". "mike" with the comma in "Bet, stop!" was heard right every time (the female CC0 voice
"kathleen" too: use --voice kathleen).

    pip install piper-tts soundfile scipy
    python3 mobile/scripts/sounds/voice.py [--model-dir DIR] [--voice mike]    # downloads the voice (about 60 MB) into DIR the first time

writes supplied/ui/bet_now.flac and supplied/ui/bet_stop.flac; build.py then turns them into assets/sounds/ui/bet_now.mp3 and
bet_stop.mp3 like the other interface sounds (src/sound/ui.ts plays them). The same text and settings always give the same words.
"""
import argparse
import os
import urllib.request
import wave

import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "supplied", "ui")
BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/{voice}/medium/"
VOICE = "mike"

# file name -> what is said (the owner asked for "bet now" and "bet stop")
LINES = {"bet_now": "Bet now!", "bet_stop": "Bet, stop!"}


def fetch(model_dir, voice):
    os.makedirs(model_dir, exist_ok=True)
    model = f"en_US-{voice}-medium.onnx"
    for name in (model, model + ".json"):
        path = os.path.join(model_dir, name)
        if not os.path.exists(path):
            print("downloading", name)
            urllib.request.urlretrieve(BASE.format(voice=voice) + name, path)
    return os.path.join(model_dir, model)


def speak(model_path, text):
    from piper import PiperVoice, SynthesisConfig

    voice = PiperVoice.load(model_path)
    cfg = SynthesisConfig(length_scale=0.92, noise_scale=0.55, noise_w_scale=0.6)  # a little brisker than the default: an announcer
    tmp = os.path.join(HERE, "__voice_tmp.wav")
    with wave.open(tmp, "wb") as w:
        voice.synthesize_wav(text, w, syn_config=cfg)
    x, sr = sf.read(tmp, dtype="float32")
    os.remove(tmp)
    return x.mean(axis=1) if x.ndim > 1 else x, sr


def shape(x, sr):
    """For a phone speaker next to game music: nothing below ~120 Hz, a lift where consonants live, a little compression, at 44.1 kHz."""
    x = signal.resample_poly(x, 44100, sr).astype(np.float32)
    sr = 44100
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    gain = np.ones_like(f)
    gain[f < 120] = 0.0
    gain *= 1 + 0.55 * np.exp(-0.5 * ((f - 3000) / 1100) ** 2)  # about +3.8 dB around 3 kHz
    x = np.fft.irfft(X * gain, len(x)).astype(np.float32)
    # silence off the ends (keep a few ms)
    keep = np.where(np.abs(x) > 0.02 * np.max(np.abs(x)))[0]
    x = x[max(0, keep[0] - int(0.01 * sr)): keep[-1] + int(0.06 * sr)]
    x = np.tanh(1.6 * x / np.max(np.abs(x))) / np.tanh(1.6)  # soft compression: quiet syllables come up, the loud ones are held
    return (x * 0.89).astype(np.float32), sr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", default=os.path.join(os.path.expanduser("~"), ".cache", "novaplay-voice"))
    ap.add_argument("--voice", default=VOICE, help="a Piper en_US medium voice with a CC0 / public-domain dataset: mike, kathleen ...")
    args = ap.parse_args()
    model = fetch(args.model_dir, args.voice)
    os.makedirs(OUT, exist_ok=True)
    for name, text in LINES.items():
        x, sr = speak(model, text)
        x, sr = shape(x, sr)
        path = os.path.join(OUT, name + ".flac")
        sf.write(path, x, sr, format="FLAC", subtype="PCM_16")
        print(f"{path}: {text!r} {len(x) / sr:.2f} s")


if __name__ == "__main__":
    main()
