"""Lay out the narration, derive every cue time from the real audio,
and emit cues.json + vo_master.wav.

All phrase times below were measured from the generated VO clips
(see build/analyze_vo.py output); they sit inside real silences.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np

from common import AUDIO, RENDER as BUILD

import imageio_ffmpeg
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
SR = 48000
TEMPO = 1.05

# clip id -> (file, trim_start, trim_end, [phrase cue times in the *original* clip])
BEATS = [
    dict(id="b1", file="vo_01_hook.wav",      t0=0.14, t1=2.90, gap_after=0.22,
         phrases=[("shades", 0.17), ("right", 2.27)]),
    dict(id="b2", file="vo_02_challenge.wav", t0=0.17, t1=4.00, gap_after=0.24,
         phrases=[("closer", 0.17), ("darker", 1.28), ("lock", 2.88)]),
    dict(id="b3", file="vo_03_reveal.wav",    t0=0.16, t1=4.98, gap_after=0.24,
         phrases=[("identical", 0.16), ("same_gray", 1.21),
                  ("measures", 2.36), ("compares", 4.07)]),
    dict(id="b4", file="vo_04_science.wav",   t0=0.19, t1=6.99, gap_after=0.24,
         phrases=[("neighbours", 0.20), ("lighter", 2.68), ("darker2", 4.06)]),
    dict(id="b5", file="vo_05_proof.wav",     t0=0.17, t1=4.80, gap_after=0.28,
         phrases=[("believe", 0.17), ("cover", 1.27), ("same1", 2.50),
                  ("connect", 3.29), ("same2", 4.23)]),
    dict(id="b6", file="vo_06_loop.wav",      t0=0.17, t1=4.23, gap_after=0.00,
         phrases=[("eyes", 0.17), ("brain", 1.79), ("look_again", 3.38)]),
]

START = 0.05
TAIL = 0.50          # clean hold on the final frame before the loop cuts


def decode(path: Path) -> np.ndarray:
    out = subprocess.run(
        [FFMPEG, "-v", "quiet", "-i", str(path), "-ac", "1", "-ar", str(SR),
         "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).astype(np.float64)


def render_clip(beat) -> np.ndarray:
    """Trim + tempo-adjust one VO clip, return float32 mono at 48 kHz."""
    dur = (beat["t1"] - beat["t0"]) / TEMPO
    out = subprocess.run(
        [FFMPEG, "-v", "quiet", "-ss", f'{beat["t0"]:.4f}', "-i",
         str(AUDIO / beat["file"]), "-t", f'{beat["t1"] - beat["t0"]:.4f}',
         "-af", f"atempo={TEMPO}", "-ac", "1", "-ar", str(SR),
         "-f", "f32le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(out, dtype=np.float32).astype(np.float64)
    target = int(round(dur * SR))
    if len(x) < target:
        x = np.pad(x, (0, target - len(x)))
    return x[:target]


def main():
    cues = {"tempo": TEMPO, "fps": 30}
    placed = []
    t = START
    for beat in BEATS:
        x = render_clip(beat)
        beat["start"] = t
        beat["dur"] = len(x) / SR
        placed.append((t, x))
        cues[beat["id"]] = round(t, 4)
        for name, pt in beat["phrases"]:
            cues[name] = round(t + (pt - beat["t0"]) / TEMPO, 4)
        t += beat["dur"] + beat["gap_after"]

    total = t + TAIL
    cues["end"] = round(total, 4)

    n = int(round(total * SR))
    master = np.zeros(n + SR, dtype=np.float64)
    for start, x in placed:
        i = int(round(start * SR))
        master[i:i + len(x)] += x
    master = master[:n]

    # gentle VO polish: high-pass at 90 Hz, de-ess-ish shelf, soft clip
    master = highpass(master, 90)
    master = np.tanh(master * 1.15) / 1.15
    peak = np.max(np.abs(master))
    master = master / peak * 0.84
    write_wav(AUDIO / "vo_master.wav", master)
    np.save(BUILD / "vo_master.npy", master)

    with open(BUILD / "cues.json", "w") as f:
        json.dump(cues, f, indent=2)

    print(f"total {total:.3f}s  ({total*30:.0f} frames)")
    for k, v in cues.items():
        if isinstance(v, (int, float)):
            print(f"  {k:12s} {v:7.3f}")
    return cues


def highpass(x, cutoff, sr=SR):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    m = 1 / (1 + np.exp(-(f - cutoff) / max(1.0, cutoff * 0.25)))
    return np.fft.irfft(X * m, len(x))


def write_wav(path, x, sr=SR):
    import wave
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    main()
