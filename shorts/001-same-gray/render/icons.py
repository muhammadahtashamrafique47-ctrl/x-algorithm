"""Flat vector icons drawn from primitives: eye, brain, arrow."""
from __future__ import annotations

import math

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from common import CYAN, WHITE, clamp


def _catmull(points, samples=16, closed=True):
    p = np.array(points, dtype=float)
    n = len(p)
    out = []
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = p[(i - 1) % n] if closed else p[max(i - 1, 0)]
        p1 = p[i % n]
        p2 = p[(i + 1) % n] if closed else p[min(i + 1, n - 1)]
        p3 = p[(i + 2) % n] if closed else p[min(i + 2, n - 1)]
        for t in np.linspace(0, 1, samples, endpoint=False):
            t2, t3 = t * t, t * t * t
            pt = 0.5 * ((2 * p1) + (-p0 + p2) * t +
                        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                        (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append(tuple(pt))
    return out


def make_brain(size=380, stroke=7, color=WHITE, seed=3):
    """Flat brain glyph: bumpy rounded silhouette, centre cleft, gyri folds."""
    S = 4
    W = size * S
    st = max(2, int(stroke * S))
    rng = np.random.default_rng(seed)

    mask = Image.new("L", (W, W), 0)
    d = ImageDraw.Draw(mask)
    inset = W * 0.135
    d.rounded_rectangle((inset, inset, W - inset, W - inset), radius=W * 0.27, fill=255)
    cx = cy = W / 2
    for k in range(26):
        ang = 2 * math.pi * k / 26 + rng.uniform(-0.10, 0.10)
        rx, ry = W * 0.355, W * 0.345
        px = cx + rx * math.cos(ang) * rng.uniform(0.93, 1.0)
        py = cy + ry * math.sin(ang) * rng.uniform(0.93, 1.0)
        r = W * rng.uniform(0.085, 0.125)
        d.ellipse((px - r, py - r, px + r, py + r), fill=255)

    # taper the bottom so it reads as a brain, not a cloud
    a = np.asarray(mask, np.float32) / 255.0
    xs = np.arange(W, dtype=np.float32)
    out_a = np.zeros_like(a)
    for y in range(W):
        u = (y - cy) / (W * 0.5)
        f = 1.0 - 0.20 * clamp(u, 0.0, 1.0) ** 1.25
        out_a[y] = np.interp(cx + (xs - cx) / f, xs, a[y], left=0.0, right=0.0)
    mask = Image.fromarray((out_a * 255).astype(np.uint8))
    del d

    mask = mask.filter(ImageFilter.GaussianBlur(S * 0.9)).point(lambda v: 255 if v > 127 else 0)
    ring_in = mask.filter(ImageFilter.MinFilter(st * 2 + 1))
    ring = Image.fromarray(((np.asarray(mask, np.int16) - np.asarray(ring_in, np.int16))
                            .clip(0, 255)).astype(np.uint8))

    out = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    fill = Image.new("RGBA", (W, W), color + (255,))
    fill.putalpha(Image.fromarray((np.asarray(ring_in, np.float32) * 0.13).astype(np.uint8)))
    out.alpha_composite(fill)
    line = Image.new("RGBA", (W, W), color + (255,))
    line.putalpha(ring)
    out.alpha_composite(line)

    det = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    dd = ImageDraw.Draw(det)
    drift = [(cx, cy - W * 0.315), (cx - W * 0.012, cy - W * 0.16),
             (cx + W * 0.010, cy), (cx - W * 0.008, cy + W * 0.16),
             (cx, cy + W * 0.315)]
    dd.line(_catmull(drift, samples=16, closed=False), fill=color + (215,),
            width=max(3, int(st * 0.75)), joint="curve")
    fold = max(2, int(st * 0.68))
    for sg in (-1, 1):
        for pts, alpha in (
            ([(0.10, -0.185), (0.175, -0.135), (0.205, -0.055)], 140),
            ([(0.075, 0.010), (0.165, 0.035), (0.195, 0.105)], 140),
            ([(0.030, 0.190), (0.090, 0.205), (0.115, 0.265)], 120),
        ):
            p = [(cx + sg * W * x, cy + W * y) for x, y in pts]
            dd.line(_catmull(p, samples=12, closed=False), fill=color + (alpha,),
                    width=fold, joint="curve")
    det.putalpha(Image.fromarray((np.asarray(det.getchannel("A"), np.float32) *
                                 (np.asarray(ring_in, np.float32) / 255)).astype(np.uint8)))
    out.alpha_composite(det)
    return out.resize((size, size), Image.LANCZOS)


def make_eye(w, h, stroke=7):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = w / 2, h / 2
    top, bot = [], []
    for i in range(41):
        t = i / 40
        x = cx - w / 2 + w * t
        y = cy - math.sin(math.pi * t) * (h / 2)
        top.append((x, y))
        bot.append((x, 2 * cy - y))
    d.line(top, fill=WHITE + (240,), width=stroke, joint="curve")
    d.line(bot, fill=WHITE + (240,), width=stroke, joint="curve")
    r = h * 0.40
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=CYAN + (255,), width=stroke)
    d.ellipse((cx - r * 0.44, cy - r * 0.44, cx + r * 0.44, cy + r * 0.44), fill=CYAN + (255,))
    d.ellipse((cx - r * 0.20, cy - r * 0.34, cx + r * 0.02, cy - r * 0.10), fill=(255, 255, 255, 255))
    return img


def make_arrow(w, h, stroke=6):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    y = h / 2
    d.line([(2, y), (w - 26, y)], fill=(255, 255, 255, 190), width=stroke)
    d.polygon([(w - 2, y), (w - 34, y - 19), (w - 34, y + 19)], fill=CYAN + (255,))
    return img
