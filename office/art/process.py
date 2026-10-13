"""Cut Codex sheets (art/raw) into game frames (public/assets) following the pixel-character skill.

Characters: two 4x4 sheets per role. One union crop box per sheet (no re-centring jitter), one scale per
sheet chosen so the standing body is BODY px tall in both sheets, and a per-row anchor (feet centre) written
to public/assets/sprites.json so rows from different sheets line up. Props: one object per cell, trimmed.

Run: uv run --with pillow --with numpy --with scipy python art/process.py
"""
import json
import statistics
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "raw"
OUT = ROOT.parent / "public" / "assets"
CONTACT = ROOT / "contact"
BODY = 112  # 2x the 56 px in-game height

ROLES = {"editor": "editor", "writer": "writer", "world": "worldbuilder", "reader": "reader"}
SHEETS = {"a": ["walk_down", "walk_up", "walk_side", "work"], "b": ["talk_down", "talk_side", "cheer", "action"]}
# the row whose median height defines the sheet scale (a standing pose)
SCALE_ROW = {"a": "walk_down", "b": "talk_down"}

PROPS = {
    "props_a": ["desk_exec_old", "desk_writer_old", "bookshelf", "desk_library_old", "meeting_table", "whiteboard",
                "manuscript_shelf", "armchair", "side_table", "floor_lamp", "plant", "coffee_counter",
                "chair_back", "chair_front", "book_stack", "cork_board"],
    "props_b": ["window", "clock", "painting", "succulent", "filing_cabinet", "sofa", "rug_round", "pendant_lamp",
                "coat_rack", "trash_bin", "water_cooler", "tall_bookcase", "scroll_crate", "dog_bed", "record_player", "boxes"],
    "props_c": ["desk_exec", "desk_writer", "desk_library", "meeting_table_rect", "bookshelf_b", "bookshelf_c",
                "stamp", "paper", "chair_editor", "chair_world", "chair_reader", "stool",
                "rug_purple", "rug_red", "fern", "certificate"],
}
PROP_PX = 256  # props are stored with their longest side at most this many px; display size is set in code


def key_magenta(img: Image.Image) -> np.ndarray:
    a = np.array(img.convert("RGBA"))
    r, g, b = (a[..., i].astype(int) for i in range(3))
    mag = (r > 150) & (b > 150) & (g < 140) & (np.minimum(r, b) - g > 65)
    # antialiased fringe: pinkish pixels touching the key
    fringe = (r > 120) & (b > 120) & (np.minimum(r, b) - g > 40)
    a[mag | fringe, 3] = 0
    return a


def cells(a: np.ndarray, rows: int = 4, cols: int = 4) -> list[np.ndarray]:
    h, w = a.shape[:2]
    ch, cw = h / rows, w / cols
    return [a[round(r * ch): round((r + 1) * ch), round(c * cw): round((c + 1) * cw)] for r in range(rows) for c in range(cols)]


def bbox(cell: np.ndarray):
    ys, xs = np.nonzero(cell[..., 3] > 0)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(xs) else None


def largest_blob_only(cell: np.ndarray) -> np.ndarray:
    """Drop specks (bits of neighbouring cells): keep the biggest blob and blobs touching its box."""
    labels, n = ndimage.label(cell[..., 3] > 0)
    if n <= 1:
        return cell
    sizes = ndimage.sum(np.ones_like(labels), labels, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    ys, xs = np.nonzero(labels == main)
    y0, y1, x0, x1 = ys.min() - 4, ys.max() + 4, xs.min() - 4, xs.max() + 4
    keep = np.zeros(n + 1, bool)
    for i, sl in enumerate(ndimage.find_objects(labels), start=1):
        if sl and sl[0].start <= y1 and sl[0].stop >= y0 and sl[1].start <= x1 and sl[1].stop >= x0 and sizes[i - 1] > 6:
            keep[i] = True
    out = cell.copy()
    out[~keep[labels], 3] = 0
    return out


def downscale(img: Image.Image, size: tuple[int, int]) -> Image.Image:
    small = img.resize(size, Image.Resampling.BOX)
    a = np.array(small)
    a[..., 3] = np.where(a[..., 3] >= 110, 255, 0)
    return Image.fromarray(a, "RGBA")


def process_sheet(role: str, src: str, part: str, manifest: dict, contact: list) -> list[str]:
    rows = SHEETS[part]
    raw = RAW / f"{src}_{part}.png"
    cs = [largest_blob_only(c) for c in cells(key_magenta(Image.open(raw)))]
    boxes = [bbox(c) for c in cs]
    issues = [f"{role}_{part}: empty frame {i}" for i, b in enumerate(boxes) if b is None]
    if issues:
        return issues
    union = (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))
    ref = rows.index(SCALE_ROW[part])
    body = statistics.median(b[3] - b[1] for b in boxes[ref * 4: ref * 4 + 4])
    s = BODY / body
    size = (max(1, round((union[2] - union[0]) * s)), max(1, round((union[3] - union[1]) * s)))
    for ri, row in enumerate(rows):
        rb = boxes[ri * 4: ri * 4 + 4]
        feet = statistics.median(b[3] for b in rb)
        cx = statistics.median((b[0] + b[2]) / 2 for b in rb)
        tall = max(b[3] for b in rb) - min(b[1] for b in rb)
        for ci, b in enumerate(rb):
            if abs(b[3] - feet) > 0.04 * tall and row != "cheer":
                issues.append(f"{role}_{row}_{ci}: baseline drift {b[3] - feet:+.0f}px")
        manifest[role][row] = {
            "ox": round((cx - union[0]) / (union[2] - union[0]), 4),
            "oy": round((feet - union[1]) / (union[3] - union[1]), 4),
        }
        for ci in range(4):
            c = cs[ri * 4 + ci]
            frame = downscale(Image.fromarray(c[union[1]: union[3], union[0]: union[2]], "RGBA"), size)
            name = f"{role}_{row}_{ci}"
            frame.save(OUT / "chars" / f"{name}.png")
            contact.append((name, frame, manifest[role][row]))
    return issues


def contact_sheet(items: list, path: Path, cols: int = 8) -> None:
    fw = max(f.width for _, f, _ in items) + 12
    fh = max(f.height for _, f, _ in items) + 24
    sheet = Image.new("RGB", (fw * cols, fh * ((len(items) + cols - 1) // cols)), "#2a2f38")
    d = ImageDraw.Draw(sheet)
    for i, (name, f, anchor) in enumerate(items):
        x, y = (i % cols) * fw + 6, (i // cols) * fh + 16
        d.text((x, y - 14), name, fill="white")
        sheet.paste(f, (x, y), f)
        if anchor:
            ax, ay = x + anchor["ox"] * f.width, y + anchor["oy"] * f.height
            d.line((x, ay, x + f.width, ay), fill="#f8b800")
            d.line((ax, ay - 4, ax, ay + 4), fill="#00e0ff")
    sheet.save(path)


def process_props(sheet: str, names: list[str], contact: list) -> list[str]:
    raw = RAW / f"{sheet}.png"
    if not raw.exists():
        return [f"missing {raw.name}"]
    issues = []
    for name, c in zip(names, cells(key_magenta(Image.open(raw)))):
        c = largest_blob_only(c)
        b = bbox(c)
        if b is None:
            issues.append(f"{sheet}: empty {name}")
            continue
        img = Image.fromarray(c[b[1]: b[3], b[0]: b[2]], "RGBA")
        k = min(1.0, PROP_PX / max(img.size))
        img = downscale(img, (max(1, round(img.width * k)), max(1, round(img.height * k))))
        img.save(OUT / "props" / f"{name}.png")
        contact.append((name, img, None))
    return issues


def main() -> int:
    (OUT / "chars").mkdir(parents=True, exist_ok=True)
    (OUT / "props").mkdir(parents=True, exist_ok=True)
    CONTACT.mkdir(exist_ok=True)
    manifest: dict = {}
    issues: list[str] = []
    for role, src in ROLES.items():
        manifest[role] = {}
        contact: list = []
        for part in SHEETS:
            if (RAW / f"{src}_{part}.png").exists():
                issues += process_sheet(role, src, part, manifest, contact)
            else:
                issues.append(f"missing {src}_{part}.png")
        if contact:
            contact_sheet(contact, CONTACT / f"{role}.png")
    props: list = []
    for sheet, names in PROPS.items():
        issues += process_props(sheet, names, props)
    if props:
        contact_sheet(props, CONTACT / "props.png")
    (OUT / "sprites.json").write_text(json.dumps(manifest, indent=1))
    print("\n".join(issues) or "ok")
    return 1 if issues else 0


if __name__ == "__main__":
    sys.exit(main())
