#!/usr/bin/env python3
"""
Losslessly strip privacy metadata (EXIF / XMP / IPTC / comments / text chunks)
from JPEG and PNG files WITHOUT re-encoding the image data.

- JPEG: removes APP1 (EXIF/XMP), APP13 (IPTC/Photoshop), APP12 and COM segments.
        Keeps APP0 (JFIF), APP2 (ICC colour profile) and APP14 (Adobe) so
        colours look identical.
- PNG:  removes tEXt / iTXt / zTXt / eXIf / tIME chunks.
        Keeps iCCP / sRGB / gAMA / cHRM / pHYs.

Usage
-----
    python tools/strip_metadata.py assets             # clean a folder
    python tools/strip_metadata.py assets --dry-run   # preview only
    python tools/strip_metadata.py assets --check     # report metadata, change nothing

The --check mode exits with code 1 if any metadata is found, so it can be
used in a pre-commit hook or CI step.
"""

import os
import sys

JPEG_EXTS = {".jpg", ".jpeg", ".jpe", ".jfif"}

# JPEG markers that carry privacy metadata and are removed.
JPEG_META = {
    0xE1: "APP1 (EXIF/XMP)",
    0xED: "APP13 (IPTC/Photoshop)",
    0xEC: "APP12",
    0xFE: "COM (comment)",
}

PNG_EXTS = {".png"}
PNG_META = {
    b"tEXt": "tEXt (text)",
    b"iTXt": "iTXt (international text)",
    b"zTXt": "zTXt (compressed text)",
    b"eXIf": "eXIf (EXIF)",
    b"tIME": "tIME (timestamp)",
}


def _walk_jpeg(data):
    """Yield (marker, segment_bytes) until the image scan starts (SOS)."""
    if not data.startswith(b"\xff\xd8"):
        return
    pos = 2
    while pos < len(data):
        if data[pos] != 0xFF:
            return
        start = pos
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        if pos >= len(data):
            return
        marker = data[pos]
        pos += 1

        if marker == 0xD9:
            yield marker, data[start:pos]
            return
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            yield marker, data[start:pos]
            continue

        if pos + 2 > len(data):
            return
        seg_len = int.from_bytes(data[pos:pos + 2], "big")
        seg_end = pos + seg_len
        if seg_len < 2 or seg_end > len(data):
            return

        yield marker, data[start:seg_end]

        if marker == 0xDA:  # SOS: the rest is entropy-coded image data
            return
        pos = seg_end


def strip_jpeg(data):
    if not data.startswith(b"\xff\xd8"):
        return data, False

    out = bytearray(b"\xff\xd8")
    changed = False
    pos = 2

    while pos < len(data):
        if data[pos] != 0xFF:
            return data, False
        start = pos
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        if pos >= len(data):
            break
        marker = data[pos]
        pos += 1

        if marker == 0xD9:
            out += data[start:pos]
            break
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            out += data[start:pos]
            continue

        if pos + 2 > len(data):
            return data, False
        seg_len = int.from_bytes(data[pos:pos + 2], "big")
        seg_end = pos + seg_len
        if seg_len < 2 or seg_end > len(data):
            return data, False

        if marker == 0xDA:
            out += data[start:seg_end]
            out += data[seg_end:]
            return bytes(out), changed

        if marker in JPEG_META:
            changed = True
        else:
            out += data[start:seg_end]
        pos = seg_end

    return bytes(out), changed


def find_jpeg_meta(data):
    return [name for m, _ in _walk_jpeg(data) if (name := JPEG_META.get(m))]


def strip_png(data):
    sig = b"\x89PNG\r\n\x1a\n"
    if not data.startswith(sig):
        return data, False

    out = bytearray(sig)
    pos = 8
    changed = False

    while pos + 12 <= len(data):
        length = int.from_bytes(data[pos:pos + 4], "big")
        ctype = data[pos + 4:pos + 8]
        total = 12 + length
        if pos + total > len(data):
            return data, False
        chunk = data[pos:pos + total]

        if ctype in PNG_META:
            changed = True
        else:
            out += chunk

        pos += total
        if ctype == b"IEND":
            break

    return bytes(out), changed


def find_png_meta(data):
    names = []
    sig = b"\x89PNG\r\n\x1a\n"
    if not data.startswith(sig):
        return names
    pos = 8
    while pos + 12 <= len(data):
        length = int.from_bytes(data[pos:pos + 4], "big")
        ctype = data[pos + 4:pos + 8]
        total = 12 + length
        if pos + total > len(data):
            break
        if ctype in PNG_META:
            names.append(PNG_META[ctype])
        pos += total
        if ctype == b"IEND":
            break
    return names


def iter_images(root):
    for dirpath, _dirnames, filenames in os.walk(root):
        if os.sep + ".git" + os.sep in dirpath + os.sep:
            continue
        for name in filenames:
            ext = os.path.splitext(name)[1].lower()
            if ext in JPEG_EXTS or ext in PNG_EXTS:
                yield os.path.join(dirpath, name), ext


def clean(root, dry_run=False):
    total = changed = saved = 0
    for path, ext in iter_images(root):
        total += 1
        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError:
            continue

        new, did = (strip_png if ext in PNG_EXTS else strip_jpeg)(data)
        if not did or new == data:
            continue

        rel = os.path.relpath(path, root)
        delta = len(data) - len(new)
        saved += delta
        changed += 1
        print(f"  {rel}: -{delta} bytes")
        if not dry_run:
            with open(path, "wb") as fh:
                fh.write(new)

    verb = "Would clean" if dry_run else "Cleaned"
    print(f"\n{verb} {changed} of {total} image(s); {saved} bytes removed.")
    return 0


def check(root):
    total = dirty = 0
    for path, ext in iter_images(root):
        total += 1
        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError:
            continue
        tags = (find_png_meta if ext in PNG_EXTS else find_jpeg_meta)(data)
        if tags:
            dirty += 1
            print(f"  METADATA  {os.path.relpath(path, root)}: {', '.join(tags)}")

    print(f"\nChecked {total} image(s): {dirty} still contain metadata.")
    if dirty == 0:
        print("Result: CLEAN - no privacy metadata found.")
        return 0
    print("Result: run this script without --check to remove it.")
    return 1


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root = args[0] if args else "."
    if "--check" in sys.argv:
        sys.exit(check(root))
    sys.exit(clean(root, dry_run="--dry-run" in sys.argv))
