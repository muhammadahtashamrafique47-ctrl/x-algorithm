"""Poster / thumbnail frame for the Short."""
from __future__ import annotations

from PIL import Image, ImageDraw

from common import (ASSETS, CYAN, F_XB, F_SB, GRAY, H, SQ_BOT_CY, SQ_CX,
                    SQ_TOP_CY, W, font, hex_label, reticle)
import render


def main():
    img = render.ILLUS.convert("RGBA")
    # signature reticles on both patches
    r = reticle(470, thickness=7, corner=76)
    img.alpha_composite(r, (int(SQ_CX - r.width / 2), int(SQ_BOT_CY - r.height / 2)))

    d = ImageDraw.Draw(img)
    f = font(F_XB, 132)
    txt = "SAME GRAY?!"
    bb = d.textbbox((0, 0), txt, font=f, stroke_width=8)
    tw = bb[2] - bb[0]
    y = 1560
    d.text(((W - tw) / 2 - bb[0] + 5, y + 8), txt, font=f, fill=(0, 0, 0, 90),
           stroke_width=8, stroke_fill=(0, 0, 0, 90))
    d.text(((W - tw) / 2 - bb[0], y), txt, font=f, fill=(255, 255, 255, 255),
           stroke_width=8, stroke_fill=(0, 0, 0, 255))

    sub = font(F_SB, 44)
    s = "#7F7F7F   =   #7F7F7F"
    bb2 = d.textbbox((0, 0), s, font=sub)
    d.text(((W - (bb2[2] - bb2[0])) / 2 - bb2[0], 1735), s, font=sub,
           fill=CYAN + (235,))

    out = render.VIDEO / "thumbnail.png"
    img.convert("RGB").save(out)
    print("thumb ->", out)


if __name__ == "__main__":
    main()
