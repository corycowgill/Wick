"""Generate WICK's music and sound effects with open Hugging Face models, locally on the GPU.

  music: facebook/musicgen-medium   (CC-BY-NC-4.0)
  sfx:   cvssp/audioldm2            (CC-BY-NC-SA-4.0)

Outputs small mono MP3s to assets/audio/. Needs torch (CUDA), transformers 4.46,
diffusers 0.31, soundfile, and ffmpeg on PATH.

  python tools/gen_audio.py            # everything
  python tools/gen_audio.py sfx        # only sound effects
  python tools/gen_audio.py music      # only music
"""
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
import torch

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "audio")
RAW = os.path.join(os.environ.get("WICK_RAW", os.path.join(ROOT, "tools", "_raw")))
os.makedirs(OUT, exist_ok=True)
os.makedirs(RAW, exist_ok=True)
DEV = "cuda" if torch.cuda.is_available() else "cpu"

MUSIC = {
    # name: (prompt, seconds)
    "music-title": ("gentle music box and soft harp lullaby, warm autumn evening by candlelight, "
                    "cozy medieval village, slow and tender, instrumental", 24),
    "music-town": ("cozy medieval folk tune, plucked lute and soft wooden flute, light hand drum, "
                   "warm autumn night festival, gentle and adventurous, instrumental", 30),
    "music-night": ("mysterious calm dark fantasy music, soft plucked harp, low warm cello drone, "
                    "quiet night in an old castle, slow tempo, instrumental", 30),
    "music-end": ("joyful triumphant folk orchestra, bells, strings and flute, warm celebration "
                  "at sunrise, uplifting finale, instrumental", 20),
}

SFX = {
    # name: (prompt, seconds generated, seconds kept)
    "jump": ("a short soft cartoon jump, light springy boing whoosh", 1.5, 0.45),
    "land": ("a soft dull thud of a small soft object landing on stone", 1.5, 0.4),
    "drip": ("a single thick wax drop falling and plopping, wet splat, close up", 1.5, 0.5),
    "relight": ("a torch igniting, fire bursting into flame with a warm whoosh", 3.0, 1.6),
    "pickup": ("a bright magical sparkle chime, small bell twinkle", 2.0, 0.9),
    "extinguish": ("a small flame hissing out in water, steam sizzle", 2.0, 1.1),
    "burnout": ("a tiny candle flame fizzling out with a soft puff of smoke", 2.0, 1.0),
    "ignite": ("dry cobweb catching fire, quick crackle and flare", 1.5, 0.6),
    "complete": ("a warm magical success chime, harp glissando and bells", 4.0, 2.6),
    "wind": ("a strong gust of wind howling past", 4.0, 2.5),
    "fire-loop": ("gentle crackling candle and small fire ambience, close up, steady", 8.0, 6.0),
    "rain-loop": ("light rain falling on cobblestones in a quiet alley at night, steady", 10.0, 8.0),
}


def peak_normalise(x, peak_db=-1.5):
    m = np.max(np.abs(x)) + 1e-9
    return x * (10 ** (peak_db / 20) / m)


def trim_lead(x, sr, thresh=0.02):
    """Drop leading silence so sounds start on the hit."""
    env = np.abs(x)
    idx = np.argmax(env > thresh * np.max(env))
    return x[max(0, idx - int(0.005 * sr)):]


def fade(x, sr, fin=0.005, fout=0.08):
    n_in, n_out = int(fin * sr), int(fout * sr)
    if n_in:
        x[:n_in] *= np.linspace(0, 1, n_in)
    if n_out and n_out < len(x):
        x[-n_out:] *= np.linspace(1, 0, n_out) ** 2
    return x


def make_loop(x, sr, xfade=2.0):
    """Seamless loop: crossfade the tail into the head (equal power)."""
    n = int(xfade * sr)
    head, body, tail = x[:n], x[n:-n], x[-n:]
    t = np.linspace(0, np.pi / 2, n)
    mixed = tail * np.cos(t) + head * np.sin(t)
    return np.concatenate([mixed, body])


def encode(x, sr, name, kbps):
    wav = os.path.join(RAW, name + ".wav")
    sf.write(wav, x.astype(np.float32), sr)
    mp3 = os.path.join(OUT, name + ".mp3")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1",
                    "-ar", "32000" if sr >= 32000 else "22050", "-b:a", f"{kbps}k", mp3], check=True)
    print(f"  {name}.mp3  {os.path.getsize(mp3) // 1024} KB  {len(x) / sr:.2f}s", flush=True)


def gen_music(only=None):
    from transformers import AutoProcessor, MusicgenForConditionalGeneration
    print("loading facebook/musicgen-medium", flush=True)
    proc = AutoProcessor.from_pretrained("facebook/musicgen-medium")
    model = MusicgenForConditionalGeneration.from_pretrained(
        "facebook/musicgen-medium", torch_dtype=torch.float16, low_cpu_mem_usage=True).to(DEV)
    sr = model.config.audio_encoder.sampling_rate
    for name, (prompt, secs) in MUSIC.items():
        if only and name != only:
            continue
        torch.manual_seed(7)
        inputs = proc(text=[prompt], padding=True, return_tensors="pt").to(DEV)
        tokens = int(secs * 50) + 100     # 50 tokens/s, plus room for the loop crossfade
        with torch.no_grad():
            audio = model.generate(**inputs, do_sample=True, guidance_scale=3.5, max_new_tokens=tokens)
        x = audio[0, 0].float().cpu().numpy()
        x = make_loop(x, sr, xfade=2.0)
        encode(peak_normalise(x, -3), sr, name, 56)
    del model
    torch.cuda.empty_cache()


def gen_sfx():
    from diffusers import AudioLDM2Pipeline
    print("loading cvssp/audioldm2", flush=True)
    pipe = AudioLDM2Pipeline.from_pretrained("cvssp/audioldm2", torch_dtype=torch.float16).to(DEV)
    sr = 16000
    neg = "low quality, noise, music, speech, distortion"
    for name, (prompt, gen_s, keep_s) in SFX.items():
        g = torch.Generator(DEV).manual_seed(11)
        # three candidates; the pipeline ranks them with CLAP against the prompt and returns best first
        out = pipe(prompt, negative_prompt=neg, num_inference_steps=150, audio_length_in_s=gen_s,
                   num_waveforms_per_prompt=3, generator=g).audios
        x = out[0].astype(np.float32)
        if name.endswith("-loop"):
            x = x[: int((keep_s + 1.0) * sr)]
            x = make_loop(x, sr, xfade=1.0)
        else:
            x = trim_lead(x, sr)[: int(keep_s * sr)]
            x = fade(x, sr)
        encode(peak_normalise(x), sr, name, 48)


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "sfx"):
        gen_sfx()
    if what in ("all", "music"):
        gen_music()
    if what.startswith("music-"):
        gen_music(what)        # a single track, e.g. music-title
    print("done", flush=True)
