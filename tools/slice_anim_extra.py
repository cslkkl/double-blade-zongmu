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

# idle 基准：屏幕身高对齐的参照。scaleFix 的正确定义见 AGENTS.md ——
#   scaleFix = (idle 内容高 ÷ idle 画布高) ÷ (该 clip 内容高 ÷ 该 clip 画布高)
# 但**这个公式只对「站直」的 clip 成立**。弯腰（pickup）与蹲低（attack-thrust）
# 的内容高天然更矮，按包围盒归一化会把弯腰的人放大到站立高度 —— 这是踩过的坑
# （宽高比 2.19 → 1.19 那批）。所以本脚本**不自动写** scaleFix：
#   · 已存在的 clip：patch_js 原样沿用文件里的旧值（手改过的校准不会被覆盖）
#   · 新增的 clip：写 1.0 占位并大声警告，必须人眼实测后再手改
# estimate_scale_fix() 只把「按包围盒反算」的数字打出来给人对照，不落盘。


def estimate_scale_fix(body_h, canvas_h, idle_ratio):
    """按「内容高 / 画布高」反算 scaleFix —— **仅供参考**。

    弯腰 / 蹲低的 clip 会算出偏大的值（把矮姿势拉成站高），所以只打印不落盘。
    """
    if not body_h or not canvas_h or not idle_ratio:
        return None
    return round(idle_ratio / (body_h / float(canvas_h)), 3)


def idle_body_ratio():
    """实测 idle-0.webp 的「内容高 / 画布高」—— 反算基准，别用常量猜。"""
    p = OUT_IMG / "idle-0.webp"
    if not p.exists():
        print("  注意：idle-0.webp 不存在，无法给出 scaleFix 参考值")
        return None
    a = np.array(Image.open(p).convert("RGBA"))[:, :, 3]
    rows = np.where((a > 24).any(axis=1))[0]
    if not len(rows):
        return None
    return (rows[-1] - rows[0] + 1) / float(a.shape[0])


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

    files, anchors, heights = [], [], []
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

        fa = np.array(frame)[:, :, 3]
        ax = SA.frame_anchor(fa)
        anchors.append(ax)
        # 内容高：alpha > 24 的包围盒高（与 AGENTS.md 的实测口径一致）
        rows = np.where((fa > 24).any(axis=1))[0]
        heights.append(int(rows[-1] - rows[0] + 1) if len(rows) else 0)

        name = f"{clip}-{i}.webp"
        frame.save(OUT_IMG / name, "WEBP", quality=92, method=6)
        files.append(name)

    if not files:
        print(f"  失败 {clip}: 没写出帧")
        return None

    ax = float(np.median(anchors)) if anchors else 0.5
    body = max(heights) if heights else 0
    est = estimate_scale_fix(body, ch, idle_body_ratio())
    print(f"  {clip:14s} {len(files)} 帧  {cw}x{ch}  内容高 {body}  "
          f"包围盒反算 scaleFix={est}（仅参考，姿势矮的 clip 会偏大）  "
          f"残留 {SA.magenta_residue(Image.open(OUT_IMG / files[0]))}")
    return {
        "clip": clip,
        "frames": len(files),
        "fps": fps,
        "loop": loop,
        "w": cw,
        "h": ch,
        "anchorX": round(ax, 4),
        "footY": 1.0,
        # ⚠️ 只作新增 clip 的初值。已存在的 clip 由 patch_js 沿用旧值，绝不覆盖。
        "scaleFix": 1.0,
        "estimate": est,
        "bodyH": body,
        "files": [f"assets/anim/{f}" for f in files],
    }


def _existing_scale_fix(src, clip):
    """从文件里沿用已存在 clip 的 scaleFix —— 手改过的校准绝不覆盖。

    这是本脚本唯一的「反算」保障：脚本算不出正确值（弯腰 / 蹲低的 clip 按
    包围盒归一化会把人放大到站高，见 AGENTS.md 的活跃坑），所以重跑时
    必须保住人眼调过的数。找不到就返回 None，由调用方决定写占位。
    """
    m = re.search(
        r"^\s*" + re.escape(clip) + r"\s*:\s*\{[^}]*?scaleFix:\s*([0-9.]+)",
        src, re.S | re.M)
    return m.group(1) if m else None


def patch_js(entries):
    """把新 clip 插入 window.ANIM（已存在则替换该行，但保留原有 scaleFix）"""
    src = OUT_JS.read_text(encoding="utf-8")

    for e in entries:
        files = ", ".join(f'"{f}"' for f in e["files"])
        old = _existing_scale_fix(src, e["clip"])
        if old is not None:
            fix = old
            note = f"  scaleFix 沿用 {old}（不覆盖手改；包围盒反算为 {e['estimate']}）"
        else:
            fix = e["scaleFix"]
            note = (f"  !! 新增 clip 的 scaleFix 写的是占位 {fix}（包围盒反算 {e['estimate']}）"
                    f" —— 必须实测内容高后手改，不是 1.0 就一定对")
        line = (
            f'  {e["clip"]:14s}{{ frames: {e["frames"]}, fps: {e["fps"]}, '
            f'loop: {"true" if e["loop"] else "false"}, w: {e["w"]}, h: {e["h"]}, '
            f'anchorX: {e["anchorX"]}, footY: 1.0, scaleFix: {fix},\n'
            f'            files: [{files}] }}'
        )
        pat = re.compile(r"^\s*" + re.escape(e["clip"]) + r"\s*:\s*\{.*?\},?\s*$", re.S | re.M)
        if pat.search(src):
            src = pat.sub(line.rstrip(",") + ",", src, count=1)
            print(f"  替换 {e['clip']}" + note)
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
            print(f"  追加 {e['clip']}" + note)

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
