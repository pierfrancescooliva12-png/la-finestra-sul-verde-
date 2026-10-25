"""Prepara le foto per il sito: ridimensiona e converte in WebP (1600 px e 800 px).

Uso: python3 scripts/photos.py ORIGINALE.jpg nome-file [ORIGINALE2.jpg nome2 ...]
Le foto finiscono in public/photos/<nome>-1600.webp e <nome>-800.webp.
"""
import sys
from pathlib import Path
from PIL import Image, ImageOps

OUT = Path(__file__).resolve().parent.parent / "public" / "photos"
SIZES = (1600, 800)

def convert(src, name):
    im = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    for w in SIZES:
        copy = im.copy()
        copy.thumbnail((w, w * 2), Image.LANCZOS)
        dest = OUT / f"{name}-{w}.webp"
        copy.save(dest, "WEBP", quality=80, method=6)  # i metadati (EXIF/GPS) non vengono copiati
        print(f"{dest.name}: {copy.size[0]}x{copy.size[1]}, {dest.stat().st_size // 1024} KB")

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or len(args) % 2:
        sys.exit(__doc__)
    OUT.mkdir(parents=True, exist_ok=True)
    for src, name in zip(args[::2], args[1::2]):
        convert(src, name)
