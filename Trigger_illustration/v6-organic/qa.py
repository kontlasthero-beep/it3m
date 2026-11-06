"""Review loop timing, stationary rims and game-sized sprite legibility."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
NAMES = ("empty", "pulse", "blackhole", "guard", "hardening", "reposition", "repulsion")
STEPS = (0, 6, 12, 18, 24, 30)
PREVIEW_SIZE = 128
preview = Image.new("RGB", (900, len(NAMES) * 180 + 24), "#142022")
ink = ImageDraw.Draw(preview)
results = {}
for row, name in enumerate(NAMES):
    master = np.asarray(Image.open(ROOT / f"{name}-master.png").convert("RGBA"), dtype=np.float32)
    frames = [np.asarray(Image.open(ROOT / "frames" / name / f"frame-{i:02}.png").convert("RGBA"), dtype=np.float32)
              for i in range(36)]
    y, x = np.mgrid[:256, :256]
    rim = np.hypot(x - 127.5, y - 127.5) >= 90
    rim_delta = max(float(np.abs(frame[rim] - master[rim]).max()) for frame in frames)
    deltas = [float(np.mean(np.abs(frames[(i + 1) % 36] - frames[i]))) for i in range(36)]
    seam_ratio = deltas[-1] / max(0.0001, float(np.median(deltas[:-1])))
    results[name] = {"rim_max_delta": rim_delta, "median_step_delta": round(float(np.median(deltas)), 3),
                     "seam_to_median_step": round(seam_ratio, 2)}
    ink.text((12, row * 180 + 12), name, fill="#eee7d4")
    for col, frame_index in enumerate(STEPS):
        frame = Image.fromarray(np.uint8(frames[frame_index]), "RGBA")
        frame = frame.resize((PREVIEW_SIZE, PREVIEW_SIZE), Image.Resampling.LANCZOS)
        preview.paste(frame, (118 + col * 128, row * 180 + 10), frame)
        ink.text((165 + col * 128, row * 180 + 144), str(frame_index), fill="#b7c6c1")
preview.save(ROOT / "preview-contact.png")
(ROOT / "qa.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
print(json.dumps(results, indent=2))
