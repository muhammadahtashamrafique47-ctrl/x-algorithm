"""Frame renderer: builds every frame of the Short from the assets + cues."""
from __future__ import annotations

import math
import subprocess
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from common import (ASSETS, AUDIO, BAR_CY, BAR_H, BAR_W, BOT_BOX, CYAN, F_B, F_SB,
                    F_XB, FPS, GRAY, H, SQ, SQ_BOT_CY, SQ_CX, SQ_TOP_CY, TOP_BOX,
                    VIDEO, W, WHITE, clamp, draw_text_card, ease_in, ease_out,
                    font, hex_label, lerp, load_cues, paste_center, ramp, reticle,
                    smoothstep)

C = load_cues()
END = C["end"]
N_FRAMES = int(round(END * FPS))


def T(key):
    return C[key]


# ------------------------------------------------------------------ content
B1, B2, B3 = T("b1"), T("b2"), T("b3")
B4, B5, B6 = T("b4"), T("b5"), T("b6")
FLAT_A, FLAT_B = B3, B3 + 0.27
LABELS_IN = B3 + 0.28
DIAG_IN = 8.86
DIAG_OUT = B4 - 0.06
PROOF1 = T("cover")
PROOF2 = T("connect")
LOOP_TAIL = END - 0.30

CAPTIONS = [
    # (start, end, lines, size)
    (0.55, T("right") + 0.02, ["DIFFERENT SHADES?"], 84),
    (T("closer") + 0.02, T("darker") - 0.06, ["LOOK CLOSER"], 84),
    (T("darker") + 0.04, T("lock") - 0.10, ["BOTTOM ONE'S", "DARKER"], 78),
    (T("lock") + 0.04, B3 - 0.06, ["LOCK IN", "YOUR ANSWER"], 78),
    (FLAT_A + 0.02, FLAT_B - 0.02, ["IDENTICAL."], 90),
    (T("same_gray") + 0.02, DIAG_IN - 0.10, ["SAME GRAY"], 92, 1400),
    (DIAG_IN + 0.02, T("compares") - 0.04, ["YOUR BRAIN", "DOESN'T MEASURE LIGHT"], 70),
    (T("compares") + 0.02, B4 - 0.10, ["IT COMPARES."], 86),
    (B4 + 0.04, T("lighter") - 0.06, ["IT JUDGES EVERY SHADE", "AGAINST ITS NEIGHBOURS"], 66),
    (T("lighter") + 0.06, T("darker2") - 0.04, ["DARKER AROUND", "LOOKS LIGHTER"], 78, 1450),
    (T("darker2") + 0.06, B5 - 0.08, ["BRIGHTER AROUND", "LOOKS DARKER"], 78, 1450),
    (B5 + 0.04, PROOF1 - 0.04, ["DON'T BELIEVE ME?"], 80),
    (PROOF1 + 0.05, T("same1") - 0.06, ["COVER THE", "BACKGROUND"], 74),
    (T("same1") + 0.02, PROOF2 - 0.06, ["SAME."], 104),
    (PROOF2 + 0.04, T("same2") - 0.04, ["CONNECT THEM"], 80),
    (T("same2") + 0.03, B6 - 0.05, ["SAME."], 104),
    (B6 + 0.04, T("brain") - 0.06, ["YOUR EYES", "WEREN'T FOOLED"], 72),
    (T("brain") + 0.04, T("look_again") - 0.03, ["YOUR BRAIN WAS."], 80),
    (T("look_again") + 0.02, END - 0.55, ["LOOK AGAIN"], 56, 1250),
]


# ------------------------------------------------------------------ assets
def _load(name):
    return Image.open(ASSETS / name).convert("RGBA")


ILLUS = _load("illusion_main.png").convert("RGB")
FLAT = _load("flat_gray.png").convert("RGB")
MASK = _load("mask_windows.png")
BAR = _load("bar_connect.png")
DIAGRAM = _load("brain_eye_vector.png")


@lru_cache(maxsize=64)
def card(lines: tuple[str, ...], size: int):
    return draw_text_card(list(lines), size=size, stroke=7, shadow=True,
                          shadow_alpha=0.42)


@lru_cache(maxsize=256)
def ret_patch(size: int, scan_q: int):
    return reticle(size, thickness=5, corner=int(size * 0.17),
                   scan_y=(scan_q / 100 if scan_q >= 0 else None))


@lru_cache(maxsize=32)
def chip(text: str, size: int = 42):
    fnt = font(F_B, size)
    pd = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    bb = pd.textbbox((0, 0), text, font=fnt)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    padx, pady = 30, 18
    img = Image.new("RGBA", (tw + padx * 2, th + pady * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=14,
                        fill=(10, 12, 14, 205), outline=CYAN + (235,), width=3)
    d.text((padx - bb[0], pady - bb[1]), text, font=fnt, fill=WHITE)
    return img


# ------------------------------------------------------------------ motion
ZOOM_KEYS = [
    (0.00, 1.000, 540, 960),
    (0.80, 1.018, 540, 960),
    (B2, 1.030, 540, 970),
    (T("lock") - 0.02, 1.075, 540, 1000),
    (B3, 1.095, 540, 1010),
    (FLAT_B, 1.000, 540, 960),
    (DIAG_IN, 1.030, 540, 960),
    (B4, 1.000, 540, 960),
    (B5, 1.035, 540, 985),
    (PROOF1, 1.085, 540, 1000),
    (PROOF2, 1.045, 540, 980),
    (B6, 1.030, 540, 960),
    (T("look_again"), 1.015, 540, 960),
    (END - 0.30, 1.000, 540, 960),
]


def zoom_state(t):
    if t <= ZOOM_KEYS[0][0]:
        return ZOOM_KEYS[0][1:]
    for i in range(len(ZOOM_KEYS) - 1):
        t0, s0, x0, y0 = ZOOM_KEYS[i]
        t1, s1, x1, y1 = ZOOM_KEYS[i + 1]
        if t0 <= t <= t1:
            u = smoothstep((t - t0) / (t1 - t0))
            return lerp(s0, s1, u), lerp(x0, x1, u), lerp(y0, y1, u)
    return ZOOM_KEYS[-1][1:]


def camera(t):
    """Return (scale, crop_x0, crop_y0) for the current camera state."""
    s, cx, cy = zoom_state(t)
    if s <= 1.0005:
        return 1.0, 0.0, 0.0
    vw, vh = W / s, H / s
    return s, clamp(cx - vw / 2, 0, W - vw), clamp(cy - vh / 2, 0, H - vh)


def project(x, y, t):
    """World (1x) coords -> screen coords."""
    s, x0, y0 = camera(t)
    return (x - x0) * s, (y - y0) * s


def apply_camera(img, t):
    s, x0, y0 = camera(t)
    if s <= 1.0005:
        return img
    return img.resize((W, H), Image.BILINEAR, box=(x0, y0, x0 + W / s, y0 + H / s))


# ------------------------------------------------------------------ pieces
def add_caption(canvas, t):
    for cap in CAPTIONS:
        t0, t1, lines, size = cap[:4]
        if not (t0 <= t <= t1):
            continue
        img = card(tuple(lines), size)
        a = ramp(t, t0, t0 + 0.16) * (1 - ramp(t, t1 - 0.13, t1))
        if a <= 0.01:
            continue
        pop = 0.94 + 0.06 * ease_out((t - t0) / 0.20)
        if abs(pop - 1) > 0.002:
            img = img.resize((int(img.width * pop), int(img.height * pop)), Image.BILINEAR)
        y = cap[4] if len(cap) > 4 else (1400 if len(lines) == 1 else 1380)
        paste_center(canvas, img, W / 2, y, a)


def add_reticle(canvas, wx, wy, wsize, t, t_in, hold=None, scan=True, pulse=0.0):
    """Reticle around a world-space box, projected to screen space."""
    if t < t_in:
        return
    life = t - t_in
    a = ramp(t, t_in, t_in + 0.12)
    s_cam, _, _ = camera(t)
    s = (1.0 + 0.20 * (1 - ease_out(life / 0.22))) * (1.0 + pulse)
    scan_q = int(100 * clamp(life / 0.30)) if scan else -1
    patch = ret_patch(int(wsize * s_cam * s), scan_q)
    sx, sy = project(wx, wy, t)
    paste_center(canvas, patch, sx, sy, a)


def add_arrows(canvas, box, t, t_in, outward=True, color=CYAN, length=96, gap=22):
    if t < t_in:
        return
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    ease = ease_out((t - t_in) / 0.45)
    L = length * ease
    if L < 2:
        return
    d = ImageDraw.Draw(canvas)
    a = int(255 * ramp(t, t_in, t_in + 0.10))
    col = color + (a,)
    w, head = 8, 24

    def arrow(px, py, dx, dy):
        ex, ey = px + dx * L, py + dy * L
        d.line([(px, py), (ex, ey)], fill=col, width=w)
        if dx:
            sx = 1 if dx > 0 else -1
            d.polygon([(ex + sx * head, ey), (ex, ey - 18), (ex, ey + 18)], fill=col)
        else:
            sy = 1 if dy > 0 else -1
            d.polygon([(ex, ey + sy * head), (ex - 18, ey), (ex + 18, ey)], fill=col)

    if outward:
        # radiating out of the dark surround -> reads as "lighter"
        arrow(cx, y0 - gap, 0, -1)
        arrow(x0 - gap, cy, -1, 0)
        arrow(x1 + gap, cy, 1, 0)
    else:
        # pressing in from the bright surround, stopping at the edge -> "darker"
        arrow(cx, y0 - gap - length, 0, 1)
        arrow(x0 - gap - length, cy, 1, 0)
        arrow(x1 + gap + length, cy, -1, 0)


def add_hex_labels(canvas, t, alpha=1.0):
    lab = hex_label()
    for box in (TOP_BOX, BOT_BOX):
        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
        paste_center(canvas, lab, cx, cy, alpha)


def add_diagram(canvas, t):
    if not (DIAG_IN <= t <= DIAG_OUT + 0.2):
        return
    u = ramp(t, DIAG_IN, DIAG_IN + 0.45)
    a = u * (1 - ramp(t, DIAG_OUT, DIAG_OUT + 0.18))
    off = (1 - ease_out(u)) * -320
    img = DIAGRAM.resize((int(960 * 0.98), int(520 * 0.98)), Image.LANCZOS)
    if a < 0.99:
        img = img.copy()
        img.putalpha(img.getchannel("A").point(lambda v: int(v * a)))
    canvas.alpha_composite(img, (int(W / 2 - img.width / 2 + off), int(790 - img.height / 2)))


def add_mask(canvas, t):
    """Wipe down at PROOF1, slide up at PROOF2."""
    if t < PROOF1:
        return
    if t < PROOF2:
        u = ease_out((t - PROOF1) / 0.40, 3)
        y_cut = int(u * H)
        if y_cut <= 0:
            return
        layer = MASK.crop((0, 0, W, y_cut))
        canvas.alpha_composite(layer, (0, 0))
        if 0 < y_cut < H:
            d = ImageDraw.Draw(canvas)
            glow = Image.new("RGBA", (W, 24), (0, 0, 0, 0))
            ImageDraw.Draw(glow).line([(0, 12), (W, 12)], fill=CYAN + (180,), width=5)
            canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(7)), (0, y_cut - 12))
            d.line([(0, y_cut), (W, y_cut)], fill=CYAN + (235,), width=3)
        return
    u = ease_in((t - PROOF2) / 0.42, 2)
    off = int(-u * H)
    if off > -H:
        canvas.alpha_composite(MASK, (0, off))


def add_bar(canvas, t):
    if t < PROOF2:
        return
    u = ease_out((t - PROOF2) / 0.52, 3)
    y = BAR_CY - BAR_H / 2 + (1 - u) * 420
    x = int(W / 2 - BAR_W / 2)
    canvas.alpha_composite(BAR, (x, int(y)))
    if 0.02 < u < 0.98:
        glow = Image.new("RGBA", (BAR_W + 40, BAR_H + 40), (0, 0, 0, 0))
        ImageDraw.Draw(glow).rounded_rectangle((20, 20, BAR_W + 19, BAR_H + 19), radius=8,
                                               outline=CYAN + (150,), width=4)
        canvas.alpha_composite(glow.filter(ImageFilter.GaussianBlur(6)), (x - 20, int(y) - 20))


@lru_cache(maxsize=4)
def union_outline(scale_px: int = 7):
    """Cyan glow outline of squares + bridge, used for the 'one shape' reveal."""
    m = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(m)
    for box in (TOP_BOX, BOT_BOX):
        d.rectangle(box, fill=255)
    d.rectangle((W // 2 - BAR_W // 2, BAR_CY - BAR_H // 2,
                 W // 2 + BAR_W // 2, BAR_CY + BAR_H // 2), fill=255)
    inner = m.filter(ImageFilter.MinFilter(scale_px))
    edge = np.asarray(m, np.int16) - np.asarray(inner, np.int16)
    edge = Image.fromarray(edge.clip(0, 255).astype(np.uint8))
    glow = edge.filter(ImageFilter.GaussianBlur(7))
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    g = Image.new("RGBA", (W, H), CYAN + (255,))
    g.putalpha(glow.point(lambda v: int(v * 1.4)))
    out.alpha_composite(g)
    s = Image.new("RGBA", (W, H), CYAN + (255,))
    s.putalpha(edge)
    out.alpha_composite(s)
    return out


def add_frame_reticle(canvas, t):
    """Signature: a cyan square drawn around the whole frame."""
    t_in = T("brain")
    if t < t_in or t > t_in + 2.0:
        return
    u = clamp((t - t_in) / 0.55)
    a = ramp(t, t_in, t_in + 0.14) * (1 - ramp(t, t_in + 1.55, t_in + 1.9))
    if a <= 0.01:
        return
    inset = 46
    box = (inset, inset, W - inset, H - inset)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    col = CYAN + (int(235 * a),)
    per = 2 * ((box[2] - box[0]) + (box[3] - box[1]))
    drawn = per * ease_out(u)
    corners = [(box[0], box[1]), (box[2], box[1]), (box[2], box[3]),
               (box[0], box[3]), (box[0], box[1])]
    acc = 0.0
    for i in range(4):
        seg = math.dist(corners[i], corners[i + 1])
        if drawn <= acc:
            break
        f = clamp((drawn - acc) / seg)
        p0, p1 = corners[i], corners[i + 1]
        p = (lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f))
        d.line([p0, p], fill=col, width=4)
        acc += seg
    canvas.alpha_composite(layer)


def add_look_again_corner(canvas, t):
    pass


# ------------------------------------------------------------------ scenes
def build_world(t: float) -> Image.Image:
    """Everything the camera sees, composed at 1x."""
    if FLAT_A <= t < FLAT_B:
        world = FLAT.copy().convert("RGBA")
        bw = 320
        d = ImageDraw.Draw(world)
        for cx, tag in ((W / 2 - 200, "TOP"), (W / 2 + 200, "BOTTOM")):
            x0, y0 = int(cx - bw / 2), int(760 - bw / 2)
            world.paste(Image.new("RGB", (bw, bw), (GRAY,) * 3), (x0, y0))
            # hairline only so the patch is locatable; fill is untouched
            d.rectangle((x0, y0, x0 + bw - 1, y0 + bw - 1),
                        outline=(255, 255, 255, 70), width=2)
            f = font(F_SB, 30)
            bb = d.textbbox((0, 0), tag, font=f)
            d.text((cx - (bb[2] - bb[0]) / 2 - bb[0], y0 - 58 - bb[1]), tag, font=f,
                   fill=(255, 255, 255, 190))
        return world

    world = ILLUS.copy().convert("RGBA")

    if DIAG_IN <= t < B4:
        world = Image.blend(world, Image.new("RGBA", (W, H), (10, 11, 12, 255)), 0.55)
        return world

    # --- science annotation beat
    if T("lighter") - 0.05 <= t < B5:
        add_arrows(world, TOP_BOX, t, T("lighter"), outward=True)
    if T("darker2") - 0.05 <= t < B5:
        add_arrows(world, BOT_BOX, t, T("darker2"), outward=False)

    # --- proof beat: mask + connecting bar live in world space
    if PROOF1 <= t < B6:
        add_bar(world, t)      # bar is under the mask: it emerges as the mask lifts
        add_mask(world, t)
        if t >= T("same2"):
            ol = union_outline()
            a = ramp(t, T("same2"), T("same2") + 0.32) * (1 - ramp(t, B6 - 0.28, B6 - 0.02))
            if a > 0.01:
                o = ol.copy()
                o.putalpha(o.getchannel("A").point(lambda v: int(v * a)))
                world.alpha_composite(o)

    # --- stamped hex labels
    if LABELS_IN <= t < DIAG_IN:
        add_hex_labels(world, t, 1 - ramp(t, DIAG_IN - 0.28, DIAG_IN - 0.02))
    return world


def build_frame(t: float) -> Image.Image:
    world = build_world(t)
    canvas = apply_camera(world, t)

    # ---------------- screen-space overlays
    if DIAG_IN <= t < B4:
        add_diagram(canvas, t)

    if t < B3:
        if t < 1.28:
            add_reticle(canvas, SQ_CX, SQ_TOP_CY, SQ + 60, t, 0.42)
        else:
            pulse = 0.0
            if T("darker") - 0.05 <= t < T("darker") + 0.3:
                pulse = 0.035 * math.sin((t - T("darker") + 0.05) / 0.35 * math.pi)
            if t >= T("lock") - 0.02:
                pulse += 0.03 * (1 - ramp(t, T("lock"), T("lock") + 0.35))
            add_reticle(canvas, SQ_CX, SQ_BOT_CY, SQ + 60, t, 1.28, scan=False, pulse=pulse)

    if B6 <= t:
        add_reticle(canvas, SQ_CX, SQ_TOP_CY, SQ + 60, t, B6 + 0.20, scan=False)

    add_frame_reticle(canvas, t)

    # ---------------- reveal flash
    if FLAT_A <= t < FLAT_A + 0.20:
        a = 0.50 * (1 - (t - FLAT_A) / 0.20)
        canvas = Image.blend(canvas, Image.new("RGBA", (W, H), (255, 255, 255, 255)), a)

    # ---------------- micro shake on "lock in"
    if T("lock") - 0.02 <= t < T("lock") + 0.30:
        d = 1 - ramp(t, T("lock") - 0.02, T("lock") + 0.28)
        dx = int(7 * d * math.sin((t - T("lock")) * 62))
        dy = int(5 * d * math.cos((t - T("lock")) * 55))
        canvas = canvas.transform((W, H), Image.AFFINE, (1, 0, -dx, 0, 1, -dy),
                                  resample=Image.BILINEAR)

    add_caption(canvas, t)

    # ---------------- loop: final frames are pixel-identical to frame 0
    if t >= LOOP_TAIL:
        return ILLUS.copy()
    return canvas.convert("RGB")


# ------------------------------------------------------------------ encode
def main():
    VIDEO.mkdir(exist_ok=True)
    out = VIDEO / "same-gray-short.mp4"
    from imageio_ffmpeg import get_ffmpeg_exe
    ff = get_ffmpeg_exe()

    cmd = [ff, "-y", "-v", "warning",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-",
           "-i", str(AUDIO / "mix_master.wav"), "-map", "0:v:0", "-map", "1:a:0",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
           "-c:v", "libx264", "-preset", "slow", "-crf", "16",
           "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
           "-x264-params", "keyint=60:min-keyint=30:scenecut=0",
           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
           "-movflags", "+faststart", "-shortest", str(out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL,
                            stderr=subprocess.PIPE)

    for i in range(N_FRAMES):
        t = i / FPS
        img = build_frame(t)
        if img.mode != "RGB":
            img = img.convert("RGB")
        proc.stdin.write(img.tobytes())
        if i % 60 == 0:
            print(f"  frame {i:4d}/{N_FRAMES}  t={t:5.2f}s", flush=True)
    proc.stdin.close()
    err = proc.stderr.read().decode()
    rc = proc.wait()
    if rc != 0:
        print(err[-3000:])
        sys.exit(rc)
    print("video ->", out, out.stat().st_size // 1024, "KB")
    print(err[-800:] if err else "")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "stills":
        VIDEO.mkdir(exist_ok=True)
        for t in [float(x) for x in sys.argv[2:]]:
            p = Path(f"/tmp/still_{t:05.2f}.png")
            build_frame(t).save(p)
            print(p)
    else:
        main()
