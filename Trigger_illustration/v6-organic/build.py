"""Make distinct, seamless trigger loops from the approved painted source icons.

The metal/glass rim is never transformed. Only the energy beneath it moves.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from scipy.ndimage import distance_transform_edt, gaussian_filter, map_coordinates

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "approved-concept.png"
GUARD_SOURCE = ROOT / "guard-source.png"
NAMES = ("empty", "pulse", "blackhole", "guard", "hardening", "reposition", "repulsion")
SIZE = 256
COUNT = 36
FRAME_MS = 66
C = (SIZE - 1) / 2
Y, X = np.mgrid[:SIZE, :SIZE].astype(np.float32)
DX, DY = X - C, Y - C
R = np.hypot(DX, DY)
THETA = np.arctan2(DY, DX)
INTERIOR = np.clip((90 - R) / 12, 0, 1).astype(np.float32)


def square_icon(source: Image.Image) -> Image.Image:
    rgba = source.convert("RGBA")
    bounds = rgba.getchannel("A").getbbox()
    if bounds:
        rgba = rgba.crop(bounds)
    side = max(rgba.size)
    canvas = Image.new("RGBA", (side, side))
    canvas.alpha_composite(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
    return canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def blend_inner(base: Image.Image, moving: Image.Image, strength: float = 1) -> Image.Image:
    mask = Image.fromarray(np.uint8(np.clip(INTERIOR * strength, 0, 1) * 255), "L")
    result = Image.composite(moving, base, mask)
    result.putalpha(base.getchannel("A"))
    return result


def polar_warp(base: Image.Image, phase: float, radial: float = 0,
               spiral: float = 0, center: tuple[float, float] = (C, C)) -> Image.Image:
    cx, cy = center
    dx, dy = X - cx, Y - cy
    r = np.hypot(dx, dy)
    theta = np.arctan2(dy, dx)
    # Source lookup runs in reverse so all pixels remain filled and the loop is exact.
    source_theta = theta - spiral * math.sin(phase) * np.clip((94 - r) / 90, 0, 1)
    source_r = r * (1 + radial * math.sin(phase))
    sx = cx + source_r * np.cos(source_theta)
    sy = cy + source_r * np.sin(source_theta)
    arr = np.asarray(base, dtype=np.float32)
    bands = [map_coordinates(arr[:, :, channel], [sy, sx], order=1, mode="nearest")
             for channel in range(4)]
    return Image.fromarray(np.uint8(np.clip(np.stack(bands, axis=2), 0, 255)), "RGBA")


def glow(canvas: Image.Image, center: tuple[float, float], radius: float,
         color: tuple[int, int, int], opacity: int) -> None:
    layer = Image.new("RGBA", (SIZE, SIZE))
    ink = ImageDraw.Draw(layer)
    x, y = center
    ink.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*color, opacity))
    blur = layer.filter(ImageFilter.GaussianBlur(max(3, radius * .65)))
    canvas.alpha_composite(blur)


def dimmed_glow(base: Image.Image, phase: float, color: tuple[int, int, int],
                center: tuple[float, float] = (C, C), radius: float = 36,
                high: float = 1) -> Image.Image:
    glow_layer = Image.new("RGBA", (SIZE, SIZE))
    glow(glow_layer, center, radius, color, int((9 + 18 * (1 + math.sin(phase)) / 2) * high))
    result = Image.alpha_composite(base, glow_layer)
    return result


def energy_breathe(base: Image.Image, phase: float, kind: str, strength: float) -> Image.Image:
    arr = np.asarray(base, dtype=np.float32).copy()
    red, green, blue = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    if kind == "repulsion":
        feature = (green > blue * 1.25) & (red > blue * 1.20) & (green > 95)
    else:
        feature = (blue > red * 1.15) & (green > red * 1.04) & (blue > 100)
    factor = 1 + strength * math.sin(phase) * feature * INTERIOR
    arr[:, :, :3] *= factor[:, :, None]
    return Image.fromarray(np.uint8(np.clip(arr, 0, 255)), "RGBA")


def orb_patch(base: Image.Image, center: tuple[int, int], radius: int) -> Image.Image:
    x, y = center
    patch = base.crop((x - radius, y - radius, x + radius, y + radius))
    m = Image.new("L", patch.size, 0)
    ImageDraw.Draw(m).ellipse((2, 2, patch.width - 2, patch.height - 2), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(2.5))
    patch.putalpha(m)
    return patch


def soften_orbs(base: Image.Image, centers: list[tuple[int, int]], radius: int) -> Image.Image:
    # Fill the old orbit positions from their nearest clean surroundings, then
    # feather only the filled area. Blurring the source leaves duplicate ghosts.
    mask = np.zeros((SIZE, SIZE), dtype=bool)
    for x, y in centers:
        mask |= (X - x) ** 2 + (Y - y) ** 2 < radius ** 2
    nearest = distance_transform_edt(mask, return_distances=False, return_indices=True)
    original = np.asarray(base, dtype=np.uint8)
    filled = original.copy()
    filled[mask] = original[nearest[0][mask], nearest[1][mask]]
    softened = Image.fromarray(filled, "RGBA").filter(ImageFilter.GaussianBlur(2))
    feather = Image.fromarray((mask * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(2))
    return Image.composite(softened, base, feather)


def paste_orb(canvas: Image.Image, patch: Image.Image, x: float, y: float,
              brightness: float = 1) -> None:
    if brightness != 1:
        patch = ImageEnhance.Brightness(patch).enhance(brightness)
    canvas.alpha_composite(patch, (round(x - patch.width / 2), round(y - patch.height / 2)))


def make_orbit(base: Image.Image, phase: float, kind: str) -> Image.Image:
    if kind == "guard":
        anchors = [(87, 142), (177, 94)]
        patches = [orb_patch(base, anchors[0], 21), orb_patch(base, anchors[1], 18)]
        moving = soften_orbs(base, anchors, 22)
        # The protective heart stays fixed while two satellites circle it.
        angle = phase + .4
        points = [(C + 51 * math.cos(angle), C + 29 * math.sin(angle)),
                  (C + 51 * math.cos(angle + math.pi), C + 29 * math.sin(angle + math.pi))]
        color = (255, 176, 75)
    else:
        anchors = [(91, 152), (178, 96)]
        patches = [orb_patch(base, anchors[0], 21), orb_patch(base, anchors[1], 18)]
        # Reuse the approved empty glass interior as a clean painted underlay.
        # The route is drawn anew so there are only ever two visible nodes.
        moving = Image.open(ROOT / "empty-master.png").convert("RGBA")
        moving = dimmed_glow(moving, phase, (55, 190, 117), (C, C), 70, 1.3)
        route = Image.new("RGBA", (SIZE, SIZE))
        line = ImageDraw.Draw(route)
        curve = []
        for step in range(29):
            t_curve = step / 28
            x_curve = (1 - t_curve) ** 2 * 91 + 2 * (1 - t_curve) * t_curve * 136 + t_curve ** 2 * 178
            y_curve = (1 - t_curve) ** 2 * 152 + 2 * (1 - t_curve) * t_curve * 160 + t_curve ** 2 * 96
            curve.append((x_curve, y_curve))
        line.line(curve, fill=(108, 255, 168, 225), width=5, joint="curve")
        line.polygon([(178, 96), (164, 99), (173, 111)], fill=(122, 255, 177, 230))
        moving = Image.alpha_composite(moving, route.filter(ImageFilter.GaussianBlur(1)))
        # Exchange positions along the existing curved route, then come home.
        t = (1 - math.cos(phase)) / 2
        points = [(91 + 87 * t, 152 - 56 * t - 18 * math.sin(math.pi * t)),
                  (178 - 87 * t, 96 + 56 * t + 18 * math.sin(math.pi * t))]
        color = (105, 255, 154)
    for i, (x, y) in enumerate(points):
        glow(moving, (x, y), 16 if kind == "guard" else 19, color, 35 + round(14 * math.sin(phase + i * math.pi) ** 2))
        paste_orb(moving, patches[i], x, y, 0.96 + .11 * math.sin(phase + i * math.pi))
    return blend_inner(base, moving)


def blackhole(base: Image.Image, phase: float) -> Image.Image:
    # Twist the nebula at different radii. Keep the center dark and stationary.
    radial_weight = np.clip((91 - R) / 83, 0, 1)
    # One complete turn per loop, with a periodic local twist: no jump at wrap.
    angle = THETA - phase - .28 * math.sin(phase) * radial_weight
    sx = C + R * np.cos(angle)
    sy = C + R * np.sin(angle)
    arr = np.asarray(base, dtype=np.float32)
    bands = [map_coordinates(arr[:, :, channel], [sy, sx], order=1, mode="nearest")
             for channel in range(4)]
    moving = Image.fromarray(np.uint8(np.clip(np.stack(bands, axis=2), 0, 255)), "RGBA")
    moving = dimmed_glow(moving, phase, (180, 75, 255), (148, 101), 23, .8)
    # Repaint the void after the nebula has spiralled.
    void = Image.new("RGBA", (SIZE, SIZE))
    glow(void, (124, 137), 29, (4, 1, 15), 135)
    moving = Image.alpha_composite(moving, void)
    return blend_inner(base, moving)


def pulse(base: Image.Image, phase: float) -> Image.Image:
    moving = polar_warp(base, phase, radial=-.045)
    moving = dimmed_glow(moving, phase, (51, 224, 255), (C, C), 33, 1.25)
    moving = energy_breathe(moving, phase, "pulse", .28)
    return blend_inner(base, moving)


def hardening(base: Image.Image, phase: float) -> Image.Image:
    # Crystal catches light, contracts and grows a delicate frost bloom.
    moving = polar_warp(base, phase, radial=.027)
    moving = dimmed_glow(moving, phase - .6, (128, 216, 255), (125, 125), 43, .85)
    moving = energy_breathe(moving, phase - .8, "hardening", .20)
    frost = Image.new("RGBA", (SIZE, SIZE))
    ink = ImageDraw.Draw(frost)
    amount = (1 + math.sin(phase - .8)) / 2
    for angle in (0.48, 2.12, 3.73, 5.54):
        a = angle + .035 * math.sin(phase)
        r1, r2 = 49, 53 + 30 * amount
        p1 = (C + r1 * math.cos(a), C + r1 * math.sin(a))
        p2 = (C + r2 * math.cos(a), C + r2 * math.sin(a))
        ink.line((p1, p2), fill=(172, 228, 255, round(21 + 45 * amount)), width=2)
    moving = Image.alpha_composite(moving, frost.filter(ImageFilter.GaussianBlur(.6)))
    return blend_inner(base, moving)


def repulsion(base: Image.Image, phase: float) -> Image.Image:
    # Each ring expands then returns, while the core stores and releases energy.
    moving = polar_warp(base, phase, radial=-.055)
    moving = dimmed_glow(moving, phase, (207, 255, 84), (C, C), 39, 1.1)
    moving = energy_breathe(moving, phase, "repulsion", .28)
    wave = Image.new("RGBA", (SIZE, SIZE))
    ink = ImageDraw.Draw(wave)
    progress = (1 - math.cos(phase)) / 2
    for i in range(2):
        radius = 30 + 20 * progress + 16 * i
        alpha = round((37 - 9 * i) * (1 - .55 * progress))
        ink.arc((C - radius, C - radius, C + radius, C + radius), 112, 249,
                fill=(209, 255, 91, alpha), width=2)
        ink.arc((C - radius, C - radius, C + radius, C + radius), 292, 429,
                fill=(209, 255, 91, alpha), width=2)
    moving = Image.alpha_composite(moving, wave.filter(ImageFilter.GaussianBlur(1)))
    return blend_inner(base, moving)


def empty(base: Image.Image, phase: float, cloud: np.ndarray) -> Image.Image:
    # A quiet unassigned reservoir: cloudy light breathes, but no symbol spins.
    arr = np.asarray(base, dtype=np.float32).copy()
    drift = np.roll(cloud, (round(4 * math.sin(phase)), round(5 * math.cos(phase))), (0, 1))
    energy = (16 + 24 * math.sin(phase) + 11 * drift) * INTERIOR
    arr[:, :, :3] += energy[:, :, None] * np.array([.57, 1, .9], np.float32)
    moving = Image.fromarray(np.uint8(np.clip(arr, 0, 255)), "RGBA")
    mote = Image.new("RGBA", (SIZE, SIZE))
    glow(mote, (C + 35 * math.cos(phase), C + 23 * math.sin(phase)),
         7, (139, 245, 220), 75)
    moving = Image.alpha_composite(moving, mote)
    return blend_inner(base, moving)


def animate(base: Image.Image, name: str, frame_index: int, cloud: np.ndarray) -> Image.Image:
    phase = 2 * math.pi * frame_index / COUNT
    if name == "empty":
        return empty(base, phase, cloud)
    if name == "pulse":
        return pulse(base, phase)
    if name == "blackhole":
        return blackhole(base, phase)
    if name in ("guard", "reposition"):
        return make_orbit(base, phase, name)
    if name == "hardening":
        return hardening(base, phase)
    return repulsion(base, phase)


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    guard_source = Image.open(GUARD_SOURCE).convert("RGBA")
    cloud = gaussian_filter(np.random.default_rng(2453).normal(size=(SIZE, SIZE)).astype(np.float32), 13)
    cloud /= max(1e-5, float(np.max(np.abs(cloud))))
    frame_root = ROOT / "frames"
    frame_root.mkdir(exist_ok=True)
    selected = set(sys.argv[1:]) if len(sys.argv) > 1 else set(NAMES)
    for index, name in enumerate(NAMES):
        if name not in selected:
            continue
        if name == "guard":
            base = square_icon(guard_source)
        else:
            col, row = index % 4, index // 4
            bounds = (round(col * source.width / 4), round(row * source.height / 2),
                      round((col + 1) * source.width / 4), round((row + 1) * source.height / 2))
            base = square_icon(source.crop(bounds))
        base.save(ROOT / f"{name}-master.png")
        frame_dir = frame_root / name
        frame_dir.mkdir(exist_ok=True)
        frames = []
        for frame_index in range(COUNT):
            frame = animate(base, name, frame_index, cloud)
            frame.save(frame_dir / f"frame-{frame_index:02}.png")
            frames.append(frame)
        frames[0].save(ROOT / f"{name}.webp", save_all=True, append_images=frames[1:],
                       duration=FRAME_MS, loop=0, quality=88, method=3)
        sheet = Image.new("RGBA", (SIZE * COUNT, SIZE))
        for frame_index, frame in enumerate(frames):
            sheet.alpha_composite(frame, (SIZE * frame_index, 0))
        sheet.save(ROOT / f"{name}-sheet.webp", quality=88, method=3)
        print(f"{name}: {COUNT} frames")
    (ROOT / "animation.json").write_text(json.dumps({
        "art_source": "existing", "source": [SOURCE.name, GUARD_SOURCE.name],
        "frame_count": COUNT, "frame_ms": FRAME_MS, "size": SIZE,
        "motions": {"empty": "breathing reservoir", "pulse": "growing and fading charge ring",
                    "blackhole": "spiralling internal nebula", "guard": "two orbiting satellites",
                    "hardening": "crystal contraction and frost growth",
                    "reposition": "two energies exchanging along a route",
                    "repulsion": "expanding and recovering energy waves"}
    }, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
