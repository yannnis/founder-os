#!/usr/bin/env python3
"""Draw the Slopglass stamp used by the extension and the site icon."""

import struct
import zlib
from pathlib import Path


def chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def png(size: int) -> bytes:
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            raw.extend(pixel(x + 0.5, y + 0.5, size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")


def pixel(x: float, y: float, size: int) -> tuple[int, int, int, int]:
    cx = cy = size / 2
    dx, dy = x - cx, y - cy
    radius = (dx * dx + dy * dy) ** 0.5
    outer = size * 0.46
    if radius > outer:
        return (0, 0, 0, 0)
    if radius > outer * 0.78:
        return (216, 74, 47, 255)
    bar = abs(dy) < size * 0.07 and abs(dx) < size * 0.2
    if bar:
        return (28, 25, 21, 255)
    return (243, 239, 230, 255)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    icon_dir = root / "extension" / "icons"
    icon_dir.mkdir(parents=True, exist_ok=True)
    for size in (16, 48, 128):
        (icon_dir / f"{size}.png").write_bytes(png(size))
    (root / "app" / "icon.png").write_bytes(png(128))


if __name__ == "__main__":
    main()
