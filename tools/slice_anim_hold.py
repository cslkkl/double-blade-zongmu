"""切分「手持不同武器」的站立姿态，输出单帧 + 自动反算 scaleFix

生图一次出多把武器的持械姿态，切完各自包围盒不同，必须按内容高反算 scaleFix，
否则换武器时会像之前 attack-thrust 那样突然变大。
基准：idle 的 内容高/画布高 比值。
"""
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import slice_anim as SA  # noqa: E402

OUT_IMG = Path(SA.OUT_IMG)
OUT_JS = Path(SA.OUT_JS)

MAX_SIDE = 560

# (源图, 武器 key, 帧序号, 期望帧数)
JOBS = [
    ("char-hold-heavy.png",  "axe",    0, 2),
    ("char-hold-heavy.png",  "hammer", 1, 2),
    ("char-hold-fast.png",   "sword",  0, 3),
    ("char-hold-fast.png",   "dagger", 1, 3),
    ("char-hold-fast.png",   "spear",  2, 3),
    ("char-hold-ranged.png", "bow",    0, 2),
    ("char-hold-ranged.png", "rock",   1, 2),
]


def sheet_cells(png, n):
    """把一张条带切成 n 个单元格，返回每个单元格的 rgba + 内容高"""
    path = Path(SA.SRC) / png
    rgb = np.array(Image.open(path).convert("RGB"))
    rgba, a = SA.cut_magenta(rgb)
    bounds, _ = SA.frame_bounds(a, n)
    cells = []
    for x0, x1 in zip(bounds[:-1], bounds[1:]):
        sub = rgba[:, x0:x1]
        ys = np.where(sub[:, :, 3].max(axis=1) > 8)[0]
        if not len(ys):
            cells.append(None)
            continue
        cells.append(sub[max(0, ys[0] - 4): ys[-1] + 5])
    return cells


def measure_content_h(frame):
    a = np.array(frame)[:, :, 3]
    ys = np.where((a > 24).any(axis=1))[0]
    return int(ys[-1] - ys[0] + 1) if len(ys) else 0


def idle_baseline():
    """idle-0 的 内容高 / 画布高，作为身高基准"""
    im = Image.open(OUT_IMG / "idle-0.webp").convert("RGBA")
    return measure_content_h(im) / im.height


def main():
    SA.source_dir()      # 源目录缺失直接退出，不写空产物
    base_ratio = idle_baseline()
    print(f"基准 idle 内容高/画布高 = {base_ratio:.4f}")
    print()

    # 同一张源图只切一次
    cache = {}
    entries = []

    for png, key, idx, n in JOBS:
        if png not in cache:
            cache[png] = sheet_cells(png, n)
        cells = cache[png]
        if idx >= len(cells) or cells[idx] is None:
            print(f"  失败 {key}: 第 {idx} 格为空")
            continue

        c = cells[idx]
        H, W = c.shape[0], c.shape[1]

        # 统一画布：横向留足，底部贴齐
        canvas_w = max(W, int(H * 0.62))
        pad = np.zeros((H, canvas_w, 4), np.uint8)
        ox = (canvas_w - W) // 2
        pad[:, ox:ox + W] = c

        frame = Image.fromarray(pad, "RGBA")
        sc = min(MAX_SIDE / max(canvas_w, H), 1.0)
        cw, ch = max(1, int(canvas_w * sc)), max(1, int(H * sc))
        if sc < 0.999:
            frame = frame.resize((cw, ch), Image.LANCZOS)
        frame = SA.defringe_rgba(frame)

        # 内容高 -> scaleFix，让屏幕身高与 idle 一致
        content_h = measure_content_h(frame)
        ratio = content_h / frame.height
        scale_fix = round(base_ratio / ratio, 3) if ratio > 0 else 1.0

        # 锚点：内容包围盒的水平中心
        alpha = np.array(frame)[:, :, 3]
        xs = np.where((alpha > 24).any(axis=0))[0]
        anchor = round(float((xs[0] + xs[-1]) / 2) / frame.width, 4) if len(xs) else 0.5

        name = f"hold-{key}.webp"
        frame.save(OUT_IMG / name, "WEBP", quality=92, method=6)

        screen_h = 252 * scale_fix * (content_h / frame.height)
        print(f"  {key:8s} {cw}x{ch}  内容高 {content_h:3d}  "
              f"scaleFix {scale_fix:.3f}  锚点 {anchor}  -> 屏幕 {screen_h:.0f}px")

        entries.append({
            "key": key, "w": cw, "h": ch,
            "anchorX": anchor, "scaleFix": scale_fix,
            "file": f"assets/anim/{name}",
        })

    if not entries:
        print("没有产出")
        return 1

    write_js(entries)
    return 0


def write_js(entries):
    rows = []
    for e in entries:
        rows.append(
            f'  {e["key"]:8s}: {{ w: {e["w"]}, h: {e["h"]}, '
            f'anchorX: {e["anchorX"]}, footY: 1.0, scaleFix: {e["scaleFix"]},\n'
            f'            file: "{e["file"]}" }}'
        )
    block = (
        "\n/* 手持不同武器的站立姿态：换武器时替换 idle 帧。\n"
        "   scaleFix 已按 idle 的内容高反算，屏幕身高一致，不会跳变。 */\n"
        "window.ANIM_HOLD = {\n" + ",\n".join(rows) + "\n};\n"
    )

    src = OUT_JS.read_text(encoding="utf-8")
    src = re.sub(r"\n/\* 手持不同武器的站立姿态[\s\S]*?\n\};\n", "\n", src)
    src = src.rstrip() + "\n" + block
    OUT_JS.write_text(src, encoding="utf-8")

    import subprocess
    r = subprocess.run(["node", "--check", str(OUT_JS)], capture_output=True, text=True)
    if r.returncode != 0:
        print("!! anim-data.js 语法错误：")
        print(r.stderr.strip()[:600])
        raise SystemExit(1)
    print("\n  node --check anim-data.js 通过")
    print(f"  写入 {len(entries)} 个 hold 姿态")


if __name__ == "__main__":
    sys.exit(main())
