"""切分角色新增动作：拾取 / 重武器劈砍 / 长柄突刺

复用 tools/slice_anim.py 的抠图与分帧原语，不改动既有 9 个动作的帧。
输出 assets/anim/{pickup,attack-heavy,attack-thrust}-N.webp 并回写 anim-data.js。
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

# 画布长边上限，与既有动作保持一致
MAX_SIDE = 560

NEW = [
    ("char-pickup.png",        "pickup",        3, 10, False),
    ("char-attack-heavy.png",  "attack-heavy",  4, 14, False),
    ("char-attack-thrust.png", "attack-thrust", 4, 16, False),
]


def slice_one(png, clip, nominal, fps, loop):
    path = Path(SA.SRC) / png
    if not path.exists():
        print(f"  跳过 {png}（不存在）")
        return None

    rgb = np.array(Image.open(path).convert("RGB"))
    rgba, a = SA.cut_magenta(rgb)

    # 生图条带的帧数是我们指定的，直接用 nominal；detect_count 只作参考
    det = SA.detect_count(a, nominal)
    n = det[0] if isinstance(det, tuple) else det
    if n != nominal:
        print(f"  注意 {clip}: 自动检测 {n} 帧，按指定 {nominal} 帧切")
        n = nominal

    bounds, _segcount = SA.frame_bounds(a, n)
    if not bounds:
        print(f"  失败 {clip}: 分帧为空")
        return None

    # 统一画布：取所有帧的最大尺寸，保证同一 clip 内尺寸一致
    cells = []
    for (x0, x1) in zip(bounds[:-1], bounds[1:]):
        sub = rgba[:, x0:x1]
        ys = np.where(sub[:, :, 3].max(axis=1) > 8)[0]
        if not len(ys):
            cells.append(None)
            continue
        cells.append(sub[max(0, ys[0] - 4): ys[-1] + 5])

    valid = [c for c in cells if c is not None]
    if not valid:
        print(f"  失败 {clip}: 无有效帧")
        return None

    H = max(c.shape[0] for c in valid)
    W = max(c.shape[1] for c in valid)

    sc = min(MAX_SIDE / max(W, H), 1.0)
    cw, ch = max(1, int(W * sc)), max(1, int(H * sc))

    files, anchors = [], []
    for i, c in enumerate(cells):
        if c is None:
            continue
        pad = np.zeros((H, W, 4), np.uint8)
        pad[: c.shape[0], : c.shape[1]] = c
        frame = Image.fromarray(pad, "RGBA")

        # 脚底对齐：把内容底边贴到画布底
        bb = frame.split()[3].getbbox()
        if bb:
            frame = frame.crop((0, 0, frame.width, bb[3]))
            pad2 = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            pad2.paste(frame, (0, H - frame.height), frame)
            frame = pad2

        if sc < 0.999:
            frame = frame.resize((cw, ch), Image.LANCZOS)
        frame = SA.defringe_rgba(frame)

        ax = SA.frame_anchor(np.array(frame)[:, :, 3])
        anchors.append(ax)

        name = f"{clip}-{i}.webp"
        frame.save(OUT_IMG / name, "WEBP", quality=92, method=6)
        files.append(name)

    if not files:
        print(f"  失败 {clip}: 没写出帧")
        return None

    ax = float(np.median(anchors)) if anchors else 0.5
    print(f"  {clip:14s} {len(files)} 帧  {cw}x{ch}  残留 {SA.magenta_residue(Image.open(OUT_IMG / files[0]))}")
    return {
        "clip": clip,
        "frames": len(files),
        "fps": fps,
        "loop": loop,
        "w": cw,
        "h": ch,
        "anchorX": round(ax, 4),
        "footY": 1.0,
        "scaleFix": 1.0,
        "files": [f"assets/anim/{f}" for f in files],
    }


def patch_js(entries):
    """把新 clip 插入 window.ANIM（已存在则替换该行）"""
    src = OUT_JS.read_text(encoding="utf-8")

    for e in entries:
        files = ", ".join(f'"{f}"' for f in e["files"])
        line = (
            f'  {e["clip"]:14s}{{ frames: {e["frames"]}, fps: {e["fps"]}, '
            f'loop: {"true" if e["loop"] else "false"}, w: {e["w"]}, h: {e["h"]}, '
            f'anchorX: {e["anchorX"]}, footY: 1.0, scaleFix: {e["scaleFix"]},\n'
            f'            files: [{files}] }}'
        )
        pat = re.compile(r"^\s*" + re.escape(e["clip"]) + r"\s*:\s*\{.*?\},?\s*$", re.S | re.M)
        if pat.search(src):
            src = pat.sub(line.rstrip(",") + ",", src, count=1)
            print(f"  替换 {e['clip']}")
        else:
            # 插到 window.ANIM 的闭合大括号前
            m = re.search(r"window\.ANIM\s*=\s*\{", src)
            if not m:
                print("  失败：找不到 window.ANIM")
                continue
            depth, i = 0, m.end() - 1
            while i < len(src):
                if src[i] == "{":
                    depth += 1
                elif src[i] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                i += 1
            body = src[:i].rstrip()
            if not body.endswith(","):
                body += ","
            src = body + "\n" + line + ",\n" + src[i:]
            print(f"  追加 {e['clip']}")

    OUT_JS.write_text(src, encoding="utf-8")

    # 生成后门禁：缺冒号这类语法错误必须当场炸，不能留到运行时
    import subprocess
    r = subprocess.run(["node", "--check", str(OUT_JS)], capture_output=True, text=True)
    if r.returncode != 0:
        print("!! anim-data.js 语法错误：")
        print(r.stderr.strip()[:600])
        raise SystemExit(1)
    print("  node --check anim-data.js 通过")


def main():
    SA.source_dir()      # 源目录缺失直接退出，不写空产物
    print("=== 新动作切片 ===")
    entries = []
    for png, clip, nominal, fps, loop in NEW:
        e = slice_one(png, clip, nominal, fps, loop)
        if e:
            entries.append(e)

    if not entries:
        print("没有可写入的 clip")
        return 1

    print("=== 回写 anim-data.js ===")
    patch_js(entries)

    total = sum((OUT_IMG / Path(f).name).stat().st_size
                for e in entries for f in e["files"])
    print(f"=== 合计 {sum(e['frames'] for e in entries)} 帧 / {total/1024:.1f} KB ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())
