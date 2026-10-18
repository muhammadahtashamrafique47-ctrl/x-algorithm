"""Build the original music bed + SFX, then mix to a -14 LUFS master."""
from __future__ import annotations

import json
import subprocess
import wave
from pathlib import Path

import numpy as np

from common import AUDIO, RENDER, load_cues
from synth import (SR, fade, fft_filter, kick, norm, pad_chord, place, pluck,
                   sfx_ding, sfx_pop, sfx_shutter, sfx_slide_lock, sfx_snare,
                   sfx_swish, sfx_thud, sfx_tick, sfx_whoosh)

import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
C = load_cues()
END = C["end"]
N = int(round(END * SR))
BPM = 120.0
BEAT = 60.0 / BPM

# Am - F - C - G, one bar (4 beats) each
CHORDS = [
    [220.00, 261.63, 329.63, 440.00],
    [174.61, 220.00, 261.63, 349.23],
    [261.63, 329.63, 392.00, 523.25],
    [196.00, 246.94, 293.66, 392.00],
]
ROOTS = [55.0, 43.65, 65.41, 49.0]


def chord_at(t):
    return int(t // (4 * BEAT)) % len(CHORDS)


def build_music():
    music = np.zeros(N + SR, dtype=np.float64)

    reveal_a, reveal_b = C["b3"], C["b3"] + 0.85
    proof = C["b5"]
    end_beat = C["brain"]

    # ---- pad: one sustained chord per bar, cross-faded
    bar = 4 * BEAT
    t = 0.0
    while t < end_beat:
        i = chord_at(t + 0.01)
        dur = min(bar, end_beat - t) + 0.35
        notes = [f / 2 for f in CHORDS[i][:3]] + CHORDS[i][:3]
        p = pad_chord(notes, dur, detune=0.0035, seed=i + 1)
        p = fft_filter(p, lo=110, hi=2600)
        a = np.ones(len(p))
        nf = int(0.28 * SR)
        a[:nf] = np.linspace(0, 1, nf)
        a[-nf:] = np.linspace(1, 0, nf)
        place(music, p * a * 0.30, t, 1.0)
        t += bar

    # ---- drums + bass + arp (silent through the reveal drop)
    def muted(t0, t1):
        return (reveal_a - 0.02) <= t0 < (reveal_b + 0.02) or t0 >= end_beat

    b = 0.0
    while b < end_beat - 0.05:
        tb = b
        if not muted(tb, tb + BEAT):
            i = chord_at(tb)
            # kick on every beat, accent on 1 and 3
            k = kick()
            g = 0.85 if int(round(tb / BEAT)) % 4 in (0, 2) else 0.55
            place(music, k, tb, g * 0.55)
            # sub bass on the offbeat
            root = ROOTS[i]
            sub = np.sin(2 * np.pi * root * np.arange(int(0.42 * SR)) / SR)
            e = np.exp(-np.arange(len(sub)) / SR * 7)
            place(music, sub * e * 0.9, tb + BEAT / 2, 0.30)
            # 16th arp from the upper chord tones from the proof beat on
            if tb >= proof:
                for s in range(4):
                    tt = tb + s * BEAT / 4
                    if muted(tt, tt + 0.01):
                        continue
                    note = CHORDS[i][s % len(CHORDS[i])] * 2
                    arp = pluck(note, 0.22, seed=s) * np.exp(
                        -np.arange(int(0.22 * SR)) / SR * 16)
                    place(music, arp, tt, 0.11 if s % 2 else 0.16)
        b += BEAT / 2

    # ---- hat ticks through the proof section
    h = proof
    while h < end_beat - 0.05:
        if int(round((h - proof) / (BEAT / 2))) % 2 == 1:
            n = np.random.default_rng(int(h * 1000) % 9999).standard_normal(int(0.05 * SR))
            n = fft_filter(n, lo=6000, hi=14000) * np.exp(-np.arange(len(n)) / SR * 90)
            place(music, n * 0.9, h, 0.10)
        h += BEAT / 4

    # ---- reveal: single sustained note, drums out
    hold = pad_chord([220.0, 329.63], reveal_b - reveal_a + 0.4, detune=0.002, seed=9)
    hold = fft_filter(hold, lo=150, hi=2000)
    a = np.ones(len(hold))
    a[: int(0.02 * SR)] = 0
    a[-int(0.25 * SR):] = np.linspace(1, 0, int(0.25 * SR))
    place(music, hold * a * 0.42, reveal_a)

    # ---- final chord, then a hard cut
    fin = pad_chord([220.0, 277.18, 329.63, 493.88], END - end_beat - 0.05,
                    detune=0.0025, seed=13)
    fin = fft_filter(fin, lo=120, hi=3000)
    a = np.ones(len(fin))
    a[: int(0.04 * SR)] = np.linspace(0, 1, int(0.04 * SR))
    place(music, fin * a * 0.55, end_beat)

    music = music[:N]
    # hard cut 0.30 s before the end so the loop is seamless
    cut = int((END - 0.30) * SR)
    music[cut:] = 0
    music = fft_filter(music, lo=38, hi=12000)
    return norm(music, 0.55)


def build_sfx():
    s = np.zeros(N, dtype=np.float64)
    place(s, sfx_whoosh(), 0.00, 0.30)
    place(s, sfx_tick(), 0.42, 0.36)
    place(s, sfx_tick(), 1.28, 0.30)
    place(s, sfx_riser(2.45), 2.88, 0.30)
    place(s, sfx_shutter(), C["lock"] - 0.03, 0.42)
    place(s, sfx_thud(), C["b3"] - 0.01, 0.62)
    place(s, sfx_pop(1120), C["lighter"] - 0.02, 0.62)
    place(s, sfx_pop(880), C["darker2"] - 0.02, 0.62)
    place(s, sfx_snare(), C["b5"] - 0.01, 0.45)
    place(s, sfx_swish(), C["cover"] - 0.04, 0.40)
    place(s, sfx_ding(1318.5), C["same1"], 0.46)
    place(s, sfx_slide_lock(), C["connect"] - 0.06, 0.46)
    place(s, sfx_ding(1318.5), C["same2"], 0.46)
    place(s, sfx_pop(660), C["brain"] - 0.01, 0.45)
    return s


def env(x, sr=SR, attack=0.02, release=0.12):
    e = np.ones(len(x))
    a, r = int(attack * sr), int(release * sr)
    if a:
        e[:a] = np.linspace(0, 1, a)
    if r:
        e[-r:] = np.linspace(1, 0, r)
    return e


def duck(music, vo, sr=SR):
    """Sidechain the music under the narration."""
    hop = int(0.01 * sr)
    n = len(music)
    win = 3
    rms = np.zeros(n // hop + 1)
    for i in range(0, n - hop, hop):
        rms[i // hop] = np.sqrt(np.mean(vo[i:i + hop] ** 2))
    k = np.ones(win) / win
    rms = np.convolve(rms, k, mode="same")
    target = np.where(rms > 0.012, 0.34, 1.0)      # ~ -9 dB default duck
    # smooth the gain curve
    idx = np.arange(len(target))
    x = np.interp(np.arange(n), idx * hop, target)
    b = np.exp(-1 / (0.08 * sr))
    g = np.empty(n)
    acc = 1.0
    for i in range(n):
        acc = (1 - b) * x[i] + b * acc
        g[i] = acc
    return music * g


def sfx_riser(dur=3.0, seed=33):
    from synth import noise, t_axis, sweep_filter
    t = t_axis(dur)
    n = noise(dur, 1.0, seed=seed)
    y = sweep_filter(n, 300, 1800, 700, 9000, blocks=26)
    up = (t / dur) ** 2
    tone_f = 180 * 2 ** (up * 2.2)
    tone = np.sin(2 * np.pi * np.cumsum(tone_f) / SR) * up * 0.25
    return norm((y * 0.8 + tone) * (t / dur) ** 1.6, 0.6)


def write_wav(path, x, sr=SR, stereo=False):
    x = np.clip(x, -1, 1)
    pcm = (x * 32767).astype("<i2")
    if stereo:
        pcm = np.repeat(pcm[:, None], 2, axis=1).reshape(-1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2 if stereo else 1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def measure_lufs(path):
    p = subprocess.run([FF, "-v", "info", "-i", str(path), "-af", "ebur128",
                        "-f", "null", "-"], capture_output=True, text=True)
    for line in p.stderr.splitlines()[::-1]:
        if "I:" in line and "LUFS" in line:
            try:
                return float(line.split("I:")[1].split("LUFS")[0].strip())
            except ValueError:
                pass
    return None


def main():
    vo = np.load(RENDER / "vo_master.npy")
    vo = np.pad(vo, (0, max(0, N - len(vo))))[:N]
    vo = norm(vo, 0.84)

    music = build_music()
    music = duck(music, vo)
    music *= 0.345          # bed sits ~18 dB under the voice
    sfx = build_sfx() * 0.60

    mix = vo + music + sfx

    # iterative loudness normalisation to -14 LUFS (no peak renormalising,
    # which would cancel the gain) then a single peak-safety scale
    target = -14.0
    gain = 1.0
    for _ in range(6):
        cand = np.tanh(np.clip(mix * gain, -3, 3) * 1.05) / 1.05
        cut = int((END - 0.30) * SR)
        probe = cand.copy()
        probe[cut:] *= np.linspace(1, 0, N - cut)
        write_wav(AUDIO / "_probe.wav", probe, stereo=True)
        lufs = measure_lufs(AUDIO / "_probe.wav")
        if lufs is None:
            break
        err = target - lufs
        print(f"  pass: {lufs:6.2f} LUFS  gain {gain:5.3f}  err {err:+.2f}")
        if abs(err) < 0.12:
            break
        gain *= 10 ** (err / 20)

    mix = np.tanh(np.clip(mix * gain, -3, 3) * 1.05) / 1.05
    pk = np.abs(mix).max()
    if pk > 0.97:
        mix *= 0.97 / pk
    cut = int((END - 0.30) * SR)
    mix[cut:] *= np.linspace(1, 0, N - cut)

    out = AUDIO / "mix_master.wav"
    write_wav(out, mix, stereo=True)          # stereo master for the editor
    write_wav(AUDIO / "music_bed.wav", music * gain)
    write_wav(AUDIO / "sfx_track.wav", sfx * gain)
    if (AUDIO / "_probe.wav").exists():
        (AUDIO / "_probe.wav").unlink()
    lufs = measure_lufs(out)
    print(f"mix -> {out}  integrated {lufs} LUFS  peak {np.abs(mix).max():.3f}")


if __name__ == "__main__":
    main()
