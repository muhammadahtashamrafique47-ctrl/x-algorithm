"""Generate every visual asset for the Short (lossless PNG)."""
from __future__ import annotations

from PIL import Image, ImageDraw

from common import (ASSETS, BAR_H, BAR_W, BOT_BOX, CYAN, F_SB, F_XB, GRAY, H,
                    TOP_BOX, W, font, gradient_1x, hex_label, reticle)
from icons import make_arrow, make_brain, make_eye


def save(img, name):
    img.save(ASSETS / name)
    print("wrote assets/" + name, img.size, img.mode)


def illusion_main():
    arr = gradient_1x(W, H)
    for box in (TOP_BOX, BOT_BOX):
        arr[box[1]:box[3], box[0]:box[2]] = GRAY
    save(Image.fromarray(arr), "illusion_main.png")


def mask_windows():
    mask = Image.new("RGBA", (W, H), (0, 0, 0, 255))
    d = ImageDraw.Draw(mask)
    for x0, y0, x1, y1 in (TOP_BOX, BOT_BOX):
        d.rectangle((x0 + 1, y0 + 1, x1 - 2, y1 - 2), fill=(0, 0, 0, 0))
    save(mask, "mask_windows.png")


def bar_connect():
    save(Image.new("RGBA", (BAR_W, BAR_H), (GRAY, GRAY, GRAY, 255)), "bar_connect.png")


def flat_gray():
    save(Image.new("RGB", (W, H), (GRAY, GRAY, GRAY)), "flat_gray.png")


def diagram():
    w, h = 960, 520
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    img.alpha_composite(make_eye(300, 170, stroke=7), (30, 110))
    img.alpha_composite(make_arrow(230, 64, stroke=6), (330, 163))
    img.alpha_composite(make_brain(330, stroke=7), (600, 40))
    d = ImageDraw.Draw(img)
    qf = font(F_XB, 120)
    bb = d.textbbox((0, 0), "?", font=qf)
    d.text((600 + 165 - (bb[2] - bb[0]) / 2 - bb[0],
            40 + 170 - (bb[3] - bb[1]) / 2 - bb[1]), "?", font=qf, fill=CYAN + (255,))
    sf = font(F_SB, 34)
    for txt, cx in (("EYE", 180), ("BRAIN", 765)):
        bb = d.textbbox((0, 0), txt, font=sf)
        d.text((cx - (bb[2] - bb[0]) / 2 - bb[0], 452 - bb[1]), txt, font=sf,
               fill=(255, 255, 255, 190))
    save(img, "brain_eye_vector.png")


def previews():
    chip = Image.new("RGBA", (460, 460), (28, 28, 28, 255))
    chip.alpha_composite(reticle(420, thickness=5, corner=70), (20, 20))
    save(chip, "reticle_preview.png")
    save(hex_label(), "hex_label_preview.png")


if __name__ == "__main__":
    ASSETS.mkdir(exist_ok=True)
    illusion_main()
    mask_windows()
    bar_connect()
    flat_gray()
    diagram()
    previews()
    g = gradient_1x(W, H)[:, 0, 0].astype(int)
    print(f"surround top-square: {g[TOP_BOX[1]-6]} (above) / {g[TOP_BOX[3]+6]} (below)")
    print(f"surround bottom-square: {g[BOT_BOX[1]-6]} (above) / {g[BOT_BOX[3]+6]} (below)")
    print(f"both patches exactly 0x{GRAY:02X}")
