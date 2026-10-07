"""
export_demo_wafers.py — wafer files to drop into Pipeline Studio's upload box.

    python src/models/vision/export_demo_wafers.py

Writes demo/wafer-images/: four case-study wafer maps (Edge-Ring, Scratch, Center,
Near-full) as 512 px PNGs in two palettes — the WM-811K plots people find on Kaggle
(viridis: purple background, teal pass, yellow fail) and plain black-on-white — plus
the raw .npy arrays. The upload path works out pass / fail / background from the
picture itself, so both palettes should classify the same as the array.
"""

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "src" / "mcp_server" / "data" / "wafer_maps"
OUT = ROOT / "demo" / "wafer-images"
CASES = {"case_2a": "edge-ring", "case_3a": "scratch", "case_1a": "center", "case_6a": "near-full"}
PALETTES = {
    "viridis": [(68, 1, 84), (33, 145, 140), (253, 231, 37)],      # off-wafer, pass, fail
    "mono": [(255, 255, 255), (214, 214, 214), (30, 30, 30)],
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for case, name in CASES.items():
        g = np.load(SRC / f"{case}.npy").astype(np.uint8)
        np.save(OUT / f"{name}.npy", g)
        for pal, colours in PALETTES.items():
            rgb = np.array(colours, dtype=np.uint8)[g]
            Image.fromarray(rgb).resize((512, 512), Image.NEAREST).save(OUT / f"{name}-{pal}.png")
    print("wrote", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
