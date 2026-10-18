"""Shared constants + helpers for the 'Same Gray' Short."""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RENDER = ROOT / "render"
ASSETS = ROOT / "assets"
AUDIO = ROOT / "audio"
VIDEO = ROOT / "video"
FONTS = RENDER / "fonts"

W, H = 1080, 1920
FPS = 30

BG_TOP, BG_BOT, GRAY = 0x1C, 0xE8, 0x7F
CYAN = (0x00, 0xE5, 0xFF)
WHITE = (255, 255, 255)

SQ = 380
SQ_CX = 540
SQ_TOP_CY = 470
SQ_BOT_CY = 1010
CAP_Y = 1470          # caption centre: below the squares, above Shorts UI
TOP_BOX = (SQ_CX - SQ // 2, SQ_TOP_CY - SQ // 2, SQ_CX + SQ // 2, SQ_TOP_CY + SQ // 2)
BOT_BOX = (SQ_CX - SQ // 2, SQ_BOT_CY - SQ // 2, SQ_CX + SQ // 2, SQ_BOT_CY + SQ // 2)
BAR_W, BAR_H, BAR_CY = 120, 300, 740

F_XB = "Montserrat-ExtraBold.ttf"
F_B = "Montserrat-Bold.ttf"
F_SB = "Montserrat-SemiBold.ttf"
F_M = "Montserrat-Medium.ttf"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def smoothstep(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


def ease_out(t, p=3):
    t = clamp(t)
    return 1 - (1 - t) ** p


def ease_in(t, p=3):
    return clamp(t) ** p


def lerp(a, b, t):
    return a + (b - a) * t


def ramp(t, t0, t1):
    if t1 <= t0:
        return 1.0 if t >= t1 else 0.0
    return smoothstep((t - t0) / (t1 - t0))


# Gradient anchored to the two squares: the top patch sits on ~#39 and the
# bottom on ~#B9, which is what makes identical #7F patches read differently.
GRAD_ANCHORS = [(0.000, 18), (0.245, 48), (0.526, 186), (1.000, 242)]


def gradient_1x(w=W, h=H, dither=True):
    y = np.arange(h, dtype=np.float32) / (h - 1)
    v = np.zeros_like(y)
    for i in range(len(GRAD_ANCHORS) - 1):
        u0, v0 = GRAD_ANCHORS[i]
        u1, v1 = GRAD_ANCHORS[i + 1]
        m = (y >= u0) & (y <= u1)
        t = np.clip((y[m] - u0) / (u1 - u0), 0, 1)
        t = t * t * (3 - 2 * t)
        v[m] = v0 + (v1 - v0) * t
    v[y > GRAD_ANCHORS[-1][0]] = GRAD_ANCHORS[-1][1]
    arr = np.repeat(v[:, None], w, axis=1).astype(np.float32)
    if dither:
        # static triangular dither (±1 LSB) kills 8-bit banding in the ramp;
        # applied to the background only, never to the #7F patches
        rng = np.random.default_rng(1995)
        arr = arr + 0.9 * (rng.uniform(-0.5, 0.5, arr.shape).astype(np.float32) +
                           rng.uniform(-0.5, 0.5, arr.shape).astype(np.float32))
    arr = np.clip(np.round(arr), 0, 255).astype(np.uint8)
    return np.repeat(arr[:, :, None], 3, axis=2)


def text_size(draw, txt, fnt, stroke=0):
    b = draw.textbbox((0, 0), txt, font=fnt, stroke_width=stroke)
    return b[2] - b[0], b[3] - b[1], b


def draw_text_card(lines, size=84, fill=WHITE, stroke=6, shadow=True,
                   shadow_alpha=0.30, line_gap=16, font_name=F_XB):
    """Caption card, 1x RGBA, with black stroke + soft drop shadow."""
    fnt = font(font_name, size)
    pd = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    sizes = [text_size(pd, ln, fnt, stroke) for ln in lines]
    pad = stroke + 24
    w = max(s[0] for s in sizes) + pad * 2
    h = sum(s[1] for s in sizes) + line_gap * (len(lines) - 1) + pad * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    if shadow:
        sh = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        sd = ImageDraw.Draw(sh)
        y = pad
        for ln, (tw, th, bbox) in zip(lines, sizes):
            sd.text(((w - tw) // 2 - bbox[0], y - bbox[1] + 6), ln, font=fnt,
                    fill=(0, 0, 0, int(255 * shadow_alpha)), stroke_width=stroke,
                    stroke_fill=(0, 0, 0, int(255 * shadow_alpha)))
            y += th + line_gap
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))

    d = ImageDraw.Draw(img)
    y = pad
    for ln, (tw, th, bbox) in zip(lines, sizes):
        d.text(((w - tw) // 2 - bbox[0], y - bbox[1]), ln, font=fnt, fill=fill,
               stroke_width=stroke, stroke_fill=(0, 0, 0, 255))
        y += th + line_gap
    return img


def paste_center(dst, src, cx, cy, alpha=1.0):
    if alpha <= 0:
        return
    if alpha < 1:
        src = src.copy()
        src.putalpha(src.getchannel("A").point(lambda v: int(v * alpha)))
    dst.alpha_composite(src, (int(cx - src.width / 2), int(cy - src.height / 2)))


def reticle(size, thickness=4, corner=64, alpha=255, scan_y=None, color=CYAN):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle((2, 2, size - 3, size - 3), outline=color + (int(alpha * 0.30),), width=2)
    for x0, y0, dx, dy in ((0, 0, 1, 1), (size - 1, 0, -1, 1),
                           (0, size - 1, 1, -1), (size - 1, size - 1, -1, -1)):
        d.line([(x0, y0 + dy * corner), (x0, y0), (x0 + dx * corner, y0)],
               fill=color + (alpha,), width=thickness)
    if scan_y is not None:
        yy = int(clamp(scan_y) * (size - 1))
        glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        ImageDraw.Draw(glow).line([(6, yy), (size - 6, yy)],
                                  fill=color + (int(alpha * 0.45),), width=10)
        glow = glow.filter(ImageFilter.GaussianBlur(6))
        d.line([(6, yy), (size - 6, yy)], fill=color + (alpha,), width=2)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.alpha_composite(glow)
        out.alpha_composite(img)
        return out
    return img


def hex_label(text="#7F7F7F", size=52, fg=WHITE, bg="#7F7F7F"):
    fnt = font(F_B, size)
    pd = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    tw, th, bbox = text_size(pd, text, fnt, 0)
    padx, pady = 26, 14
    img = Image.new("RGBA", (tw + padx * 2, th + pady * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=12,
                        fill=bg, outline=(255, 255, 255, 95), width=2)
    d.text((padx - bbox[0], pady - bbox[1]), text, font=fnt, fill=fg)
    return img


def load_cues():
    with open(RENDER / "cues.json") as f:
        return json.load(f)
