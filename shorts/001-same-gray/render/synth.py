"""Tiny additive synth + SFX kit (numpy only). Original sound design."""
from __future__ import annotations

import numpy as np

SR = 48000


def t_axis(dur, sr=SR):
    return np.arange(int(round(dur * sr)), dtype=np.float64) / sr


def sine(freq, dur, amp=1.0, phase=0.0, sr=SR):
    t = t_axis(dur, sr)
    return amp * np.sin(2 * np.pi * freq * t + phase)


def saw(freq, dur, amp=1.0, sr=SR):
    t = t_axis(dur, sr)
    return amp * (2 * ((freq * t) % 1.0) - 1)


def noise(dur, amp=1.0, sr=SR, seed=0):
    rng = np.random.default_rng(seed)
    return amp * rng.standard_normal(int(round(dur * sr)))


def norm(x, peak=0.9):
    m = np.max(np.abs(x))
    return x if m < 1e-9 else x * (peak / m)


def fft_filter(x, lo=None, hi=None, sr=SR):
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / sr)
    m = np.ones_like(f)
    if lo:
        m *= 1 / (1 + np.exp(-(f - lo) / max(1.0, lo * 0.06)))
    if hi:
        m *= 1 / (1 + np.exp((f - hi) / max(1.0, hi * 0.06)))
    return np.fft.irfft(X * m, n)


def sweep_filter(x, lo0, lo1, hi0, hi1, sr=SR, blocks=24):
    n = len(x)
    out = np.zeros(n)
    edges = np.linspace(0, n, blocks + 1).astype(int)
    for i in range(blocks):
        a, b = edges[i], edges[i + 1]
        if b <= a:
            continue
        u = i / max(1, blocks - 1)
        seg = x[a:b]
        y = fft_filter(seg, lo=lo0 + (lo1 - lo0) * u, hi=hi0 + (hi1 - hi0) * u, sr=sr)
        w = np.ones(b - a)
        fade_n = min(256, (b - a) // 2)
        if fade_n > 1:
            w[:fade_n] *= np.linspace(0, 1, fade_n)
            w[-fade_n:] *= np.linspace(1, 0, fade_n)
        out[a:b] += y * w
    return out


def reverb(x, sr=SR, decay=0.45, mix=0.25, seed=7):
    rng = np.random.default_rng(seed)
    n_ir = int(decay * sr)
    ir = rng.standard_normal(n_ir) * np.exp(-np.linspace(0, 7, n_ir))
    ir[: max(1, int(0.01 * sr))] *= np.linspace(0, 1, max(1, int(0.01 * sr)))
    L = len(x) + n_ir
    wet = np.fft.irfft(np.fft.rfft(x, L) * np.fft.rfft(np.pad(ir, (0, len(x))), L), L)[: len(x)]
    wet = wet / max(1e-9, np.max(np.abs(wet))) * np.max(np.abs(x))
    return (1 - mix) * x + mix * wet


def place(buf, clip, t, gain=1.0, sr=SR):
    i = int(round(t * sr))
    if i >= len(buf):
        return
    n = min(len(clip), len(buf) - i)
    if n > 0:
        buf[i:i + n] += clip[:n] * gain


def fade(x, fin=0.005, fout=0.02, sr=SR):
    n = len(x)
    a, b = min(int(fin * sr), n // 2), min(int(fout * sr), n // 2)
    if a > 0:
        x[:a] *= np.linspace(0, 1, a)
    if b > 0:
        x[-b:] *= np.linspace(1, 0, b)
    return x


# ------------------------------------------------------------------ SFX
def sfx_whoosh(dur=0.55, seed=1):
    x = noise(dur, 1.0, seed=seed)
    y = sweep_filter(x, 300, 2600, 1200, 7000)
    e = np.sin(np.linspace(0, np.pi, len(y))) ** 2
    return norm(fade(y * e), 0.9)


def sfx_tick(seed=2):
    d = 0.055
    t = t_axis(d)
    click = np.sin(2 * np.pi * 2100 * t) * np.exp(-t * 150)
    body = noise(d, 0.4, seed=seed) * np.exp(-t * 260)
    return norm(0.7 * click + 0.5 * body, 0.75)


def sfx_shutter(seed=3):
    a = np.zeros(int(0.20 * SR))
    place(a, sfx_tick(seed), 0.0, 0.9)
    place(a, sfx_tick(seed + 1), 0.085, 0.7)
    return norm(a, 0.8)


def sfx_thud(seed=4):
    d = 0.75
    t = t_axis(d)
    f = 90 * np.exp(-t * 5) + 38
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5.5)
    body = fft_filter(noise(d, 0.6, seed=seed), hi=900) * np.exp(-t * 26)
    return norm(fade(sub + 0.45 * body, 0.001, 0.15), 0.95)


def sfx_pop(freq=1050, seed=5):
    d = 0.16
    t = t_axis(d)
    f = freq * (1 + 0.7 * np.exp(-t * 60))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 26)
    return norm(fade(x, 0.001, 0.05), 0.6)


def sfx_snare(seed=6):
    d = 0.34
    t = t_axis(d)
    n = fft_filter(noise(d, 1.0, seed=seed), lo=900, hi=7500) * np.exp(-t * 16)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 26)
    return norm(fade(0.8 * n + 0.5 * tone, 0.001, 0.08), 0.8)


def sfx_swish(seed=8):
    d = 0.38
    y = sweep_filter(noise(d, 1.0, seed=seed), 500, 1800, 2600, 5200)
    e = np.exp(-((np.linspace(0, 1, len(y)) - 0.42) ** 2) / 0.055)
    return norm(fade(y * e, 0.02, 0.06), 0.55)


def sfx_ding(freq=1318.5, seed=9, dur=1.25):
    t = t_axis(dur)
    x = (np.sin(2 * np.pi * freq * t) * np.exp(-t * 3.6) +
         0.34 * np.sin(2 * np.pi * freq * 2.01 * t) * np.exp(-t * 6.2) +
         0.16 * np.sin(2 * np.pi * freq * 2.98 * t) * np.exp(-t * 9.0))
    return norm(fade(reverb(x, decay=0.35, mix=0.32), 0.002, 0.2), 0.55)


def sfx_slide_lock(seed=10):
    d = 0.42
    t = t_axis(d)
    y = sweep_filter(noise(d, 1.0, seed=seed), 2400, 500, 6000, 1200, blocks=18)
    e = np.linspace(0, 1, len(y)) ** 1.5
    lock = np.zeros(len(y))
    place(lock, sfx_tick(seed + 1), 0.30, 1.0)
    place(lock, sfx_thud(seed + 2) * 0.35, 0.31, 0.8)
    return norm(fade(y * e * 0.7 + lock, 0.004, 0.06), 0.75)


def pad_chord(freqs, dur, sr=SR, detune=0.004, seed=11):
    t = t_axis(dur, sr)
    x = np.zeros_like(t)
    rng = np.random.default_rng(seed)
    for f in freqs:
        for mult in (1 - detune, 1.0, 1 + detune):
            ph = rng.uniform(0, 2 * np.pi)
            x += np.sin(2 * np.pi * f * mult * t + ph) / (len(freqs) * 3)
            x += 0.18 * np.sin(2 * np.pi * f * 2 * mult * t + ph) / (len(freqs) * 3)
    return x


def kick(dur=0.30, sr=SR):
    t = t_axis(dur, sr)
    f = 120 * np.exp(-t * 26) + 46
    x = np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-t * 12)
    x += 0.25 * noise(dur, 1.0, seed=21) * np.exp(-t * 90)
    return norm(x, 0.9)


def pluck(freq, dur=0.35, sr=SR, seed=22):
    t = t_axis(dur, sr)
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t * 9)
    x += 0.3 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 14)
    x += 0.12 * saw(freq, dur, 1.0, sr) * np.exp(-t * 18)
    x = fft_filter(x, lo=300, hi=6500)
    return x / max(1e-9, np.max(np.abs(x)))
