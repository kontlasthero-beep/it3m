"""Build the first approved trigger concept into small looping icon sprites."""
from __future__ import annotations

import math
from pathlib import Path
import sys

from PIL import Image, ImageChops, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parent
SHEET = Path(sys.argv[1])
GUARD = Path(sys.argv[2])
NAMES = ("empty", "pulse", "blackhole", "guard", "hardening", "reposition", "repulsion")
SIZE = 256
COUNT = 24
FRAME_MS = 80


def square_icon(source: Image.Image) -> Image.Image:
    rgba = source.convert("RGBA")
    bounds = rgba.getchannel("A").getbbox()
    if bounds:
        rgba = rgba.crop(bounds)
    side = max(rgba.size)
    canvas = Image.new("RGBA", (side, side))
    canvas.alpha_composite(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
    return canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def inner_mask() -> Image.Image:
    mask = Image.new("L", (SIZE, SIZE), 0)
    pixels = mask.load()
    for y in range(SIZE):
        for x in range(SIZE):
            distance = math.hypot(x - SIZE / 2, y - SIZE / 2)
            pixels[x, y] = round(255 * max(0, min(1, (99 - distance) / 12)))
    return mask


def animate(base: Image.Image, name: str, index: int, mask: Image.Image) -> Image.Image:
    phase = 2 * math.pi * index / COUNT
    angles = {
        "empty": 3, "pulse": 6, "blackhole": 360, "guard": 360,
        "hardening": 5, "reposition": 14, "repulsion": 8,
    }
    angle = (index * angles[name] / COUNT if name in ("blackhole", "guard")
             else math.sin(phase) * angles[name])
    moving = base.rotate(angle, Image.Resampling.BICUBIC)
    brightness = 1 + (0.07 if name in ("empty", "hardening") else 0.12) * math.sin(phase - 0.6)
    moving = ImageEnhance.Brightness(moving).enhance(brightness)
    result = Image.composite(moving, base, mask)
    # Keep the generated alpha silhouette fixed while light and symbols move inside it.
    result.putalpha(base.getchannel("A"))
    return result


def main() -> None:
    source = Image.open(SHEET).convert("RGBA")
    guard_source = Image.open(GUARD).convert("RGBA")
    mask = inner_mask()
    for index, name in enumerate(NAMES):
        if name == "guard":
            base = square_icon(guard_source)
        else:
            col, row = index % 4, index // 4
            # The guard occupies cell 4 in the approved sheet. Its replacement
            # comes from GUARD; other icons stay in their original cells.
            bounds = (round(col * source.width / 4), round(row * source.height / 2),
                      round((col + 1) * source.width / 4), round((row + 1) * source.height / 2))
            base = square_icon(source.crop(bounds))
        static_dir = ROOT / "static"
        static_dir.mkdir(parents=True, exist_ok=True)
        base.save(static_dir / f"{name}.png")
        frame_dir = ROOT / "frames" / name
        frame_dir.mkdir(parents=True, exist_ok=True)
        frames = []
        for frame_index in range(COUNT):
            frame = animate(base, name, frame_index, mask)
            frame.save(frame_dir / f"frame-{frame_index:02}.png")
            frames.append(frame)
        frames[0].save(ROOT / f"{name}.webp", save_all=True, append_images=frames[1:],
                       duration=FRAME_MS, loop=0, quality=88, method=6)
        sheet = Image.new("RGBA", (SIZE * COUNT, SIZE))
        for frame_index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (SIZE * frame_index, 0))
        sheet.save(ROOT / f"{name}-sheet.png")
        sheet.save(ROOT / f"{name}-sheet.webp", quality=88, method=6)
        print(f"{name}: {COUNT} frames")


if __name__ == "__main__":
    main()
