# -*- coding: utf-8 -*-
"""
sprite strip -> per-frame webp + js/anim-data.js
- 洋红底抠图 (magenta = min(R,B)-G)
- 去溢色
- 自动检测帧数 (FFT 投影周期 + 空隙校验)
- 自动分帧 (列投影 + 间隙合并 + 碎片归并 + 边界吸附)
- 跨帧统一锚点 (脚底对齐 y, 躯干中线对齐 x)

用法：
  python tools/slice_anim.py               # 默认只处理角色，只清角色帧，不动敌人帧
  python tools/slice_anim.py --only char   # 同上，显式指定
  python tools/slice_anim.py --only enemy  # 委托给 tools/slice_enemy_anim.py
"""
import argparse
import os
import re
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))

SRC = r"C:\Users\11965\Desktop\imagegen无限\output\sanxingdui-anim"
OUT_IMG = r"C:\Users\11965\Desktop\三星堆\assets\anim"
OUT_JS = r"C:\Users\11965\Desktop\三星堆\js\anim-data.js"

# clip, file, nominal frames, fps, loop
CLIPS = [
    ("idle",   "char-idle.png",   4, 6,  True),
    ("walk",   "char-walk.png",   6, 12, True),
    ("attack", "char-attack.png", 4, 16, False),
    ("jump",   "char-jump.png",   3, 10, False),
    ("hurt",   "char-hurt.png",   2, 14, False),
    ("whirl",  "char-whirl.png",  4, 18, True),
    ("throw",  "char-throw.png",  3, 14, False),
    ("bow",    "char-bow.png",    3, 12, False),
    ("dead",   "char-dead.png",   3, 8,  False),
]

ALPHA_FULL = 115.0   # m > 115 -> 透明
ALPHA_ZERO = 45.0    # m < 45  -> 不透明
DEFRINGE   = 34      # R,B <= G+34
MERGE_GAP  = 8       # 列间隙 < 8px 合并
SOLID      = 40      # 视为"内容"的 alpha 阈值
OPAQUE     = 128     # 求中线用的 alpha 阈值
MARGIN     = 0.08
TARGET_LONG = 560

# 只认角色帧：<clip>-<i>.webp。enemy-*/boss-* 一律不碰。
CHAR_FRAME_RE = re.compile(r"^(idle|walk|attack|jump|hurt|whirl|throw|bow|dead)-\d+\.webp$")


def clean_char_frames():
    """删掉 assets/anim 下的角色帧，保留敌人帧。返回删除数量。"""
    if not os.path.isdir(OUT_IMG):
        return 0
    n = 0
    for f in sorted(os.listdir(OUT_IMG)):
        if CHAR_FRAME_RE.match(f):
            os.remove(os.path.join(OUT_IMG, f))
            n += 1
    return n


# ---------------------------------------------------------------- 抠图
def cut_magenta(rgb):
    """返回 (rgba uint8, alpha float32)。含洋红抠除与去溢色。"""
    r = rgb[:, :, 0].astype(np.float32)
    g = rgb[:, :, 1].astype(np.float32)
    b = rgb[:, :, 2].astype(np.float32)
    m = np.minimum(r, b) - g

    a = np.where(m > ALPHA_FULL, 0.0,
        np.where(m < ALPHA_ZERO, 255.0,
                 np.clip((ALPHA_FULL - m) / (ALPHA_FULL - ALPHA_ZERO) * 255.0, 0.0, 255.0)))

    # 去溢色: 半透明边缘把 R/B 压到 G+DEFRINGE 以内
    edge = (a > 0) & (a < 250)
    cap = g + DEFRINGE
    r = np.where(edge, np.minimum(r, cap), r)
    b = np.where(edge, np.minimum(b, cap), b)

    rgba = np.empty(rgb.shape[:2] + (4,), np.uint8)
    rgba[:, :, 0] = np.clip(r, 0, 255).astype(np.uint8)
    rgba[:, :, 1] = np.clip(g, 0, 255).astype(np.uint8)
    rgba[:, :, 2] = np.clip(b, 0, 255).astype(np.uint8)
    rgba[:, :, 3] = a.astype(np.uint8)
    return rgba, a


# ---------------------------------------------------------------- 帧数检测
def detect_count(a, nominal):
    """列投影做 FFT，取 2..9 区间内能量最强的周期作为帧数。"""
    prof = (a > SOLID).sum(axis=0).astype(np.float32)
    x = prof - prof.mean()
    F = np.abs(np.fft.rfft(x))
    amps = {k: float(F[k]) for k in range(2, 10) if k < len(F)}
    if not amps:
        return nominal, amps
    best = max(amps, key=lambda k: amps[k])
    # 太弱的周期不可信，回退到标称值
    if amps[best] < 1e-6:
        return nominal, amps
    return best, amps


# ---------------------------------------------------------------- 分帧
def column_segments(a):
    """列投影 -> 连续非空区间，间隙 < MERGE_GAP 合并。"""
    nz = (a > SOLID).sum(axis=0) > 0
    idx = np.where(nz)[0]
    if len(idx) == 0:
        return []
    segs, s, prev = [], int(idx[0]), int(idx[0])
    for i in idx[1:]:
        i = int(i)
        if i - prev >= MERGE_GAP:
            segs.append([s, prev])
            s = i
        prev = i
    segs.append([s, prev])
    return segs


def merge_fragments(segs, n, pitch):
    """碎片归并: 段数多于帧数时，反复合并间距最小的一对（按中心距离最近原则）。"""
    segs = [list(s) for s in segs]
    while len(segs) > n:
        best_i, best_d = 0, 1e18
        for i in range(len(segs) - 1):
            gap = segs[i + 1][0] - segs[i][1]
            c0 = (segs[i][0] + segs[i][1]) / 2
            c1 = (segs[i + 1][0] + segs[i + 1][1]) / 2
            d = gap + 0.25 * abs((c1 - c0) - pitch)
            if d < best_d:
                best_d, best_i = d, i
        segs[best_i] = [segs[best_i][0], segs[best_i + 1][1]]
        del segs[best_i + 1]
    return segs


def frame_bounds(a, n):
    """返回 n+1 个边界列下标。"""
    H, W = a.shape
    pitch = W / float(n)
    prof = (a > SOLID).sum(axis=0).astype(np.float32)
    sm = np.convolve(prof, np.ones(7) / 7.0, "same")

    segs = column_segments(a)
    segs = merge_fragments(segs, n, pitch) if len(segs) > n else segs
    pure_gaps = len(segs) == n  # 段数正好等于帧数 -> 用间隙中点

    bounds = [0]
    for i in range(1, n):
        geo = int(round(i * pitch))
        lo = max(1, int(round(geo - 0.20 * pitch)))
        hi = min(W - 2, int(round(geo + 0.20 * pitch)))

        if pure_gaps:
            cand = int(round((segs[i - 1][1] + segs[i][0]) / 2))
            cand = min(max(cand, lo), hi)
        else:
            # 在几何边界附近吸附到列投影局部极小（处理剑/环越过格线）
            cand = int(np.argmin(sm[lo:hi + 1])) + lo
            if sm[cand] > 0.55 * sm.max():
                cand = geo
        bounds.append(cand)
    bounds.append(W)

    # 单调性保障
    for i in range(1, len(bounds)):
        if bounds[i] <= bounds[i - 1]:
            bounds[i] = min(W, bounds[i - 1] + 1)
    return bounds, len(segs)


# ---------------------------------------------------------------- 锚点
def frame_anchor(sub_a):
    """返回 (left, right, top, foot, cx)；坐标为该帧局部列坐标/绝对行坐标。"""
    ys, xs = np.where(sub_a > SOLID)
    if len(ys) == 0:
        return None
    left, right = int(xs.min()), int(xs.max())
    top, foot = int(ys.min()), int(ys.max())
    h = max(1, foot - top + 1)

    # 躯干中线: 内容高度 50%~70% 区间内不透明像素的 x 中位数
    y0 = top + int(round(h * 0.50))
    y1 = top + int(round(h * 0.70))
    band = sub_a[y0:y1 + 1, :]
    by, bx = np.where(band > OPAQUE)
    if len(bx) == 0:
        by, bx = np.where(band > SOLID)
    if len(bx):
        cx = float(np.median(bx))
        # 两轮稳健化：剔除离群的剑/环，只保留躯干簇
        span = max(1.0, float(right - left))
        for _ in range(2):
            keep = bx[np.abs(bx - cx) <= 0.16 * span]
            if len(keep) < 8:
                break
            cx = float(np.median(keep))
    else:
        cx = (left + right) / 2.0
    cx = min(max(cx, left), right)
    return left, right, top, foot, cx


# ---------------------------------------------------------------- 尺寸变换
def resize_rgba_premul(rgba, size):
    """预乘 alpha 后缩放，避免透明边缘发黑/发紫。"""
    f = rgba.astype(np.float32) / 255.0
    a = f[:, :, 3:4]
    pre = np.concatenate([f[:, :, :3] * a, a], axis=2)
    im = Image.fromarray((pre * 255.0 + 0.5).astype(np.uint8), "RGBA")
    im = im.resize(size, Image.LANCZOS)
    q = np.asarray(im).astype(np.float32) / 255.0
    aq = q[:, :, 3:4]
    safe = np.where(aq > 1e-4, aq, 1.0)
    rgb = np.where(aq > 1e-4, q[:, :, :3] / safe, 0.0)
    out = np.concatenate([np.clip(rgb, 0, 1), aq], axis=2)
    return (out * 255.0 + 0.5).astype(np.uint8)


def defringe_rgba(im):
    """缩放/合成后的二次去溢色：半透明边缘 R,B 压到 G+DEFRINGE 以内。"""
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    al = a[:, :, 3]
    edge = (al > 0) & (al <= 245)
    g = a[:, :, 1]
    cap = g + DEFRINGE
    a[:, :, 0] = np.where(edge, np.minimum(a[:, :, 0], cap), a[:, :, 0])
    a[:, :, 2] = np.where(edge, np.minimum(a[:, :, 2], cap), a[:, :, 2])
    # 极低 alpha 的边缘直接丢掉，避免压缩后出彩边
    a[:, :, 3] = np.where(al < 16, 0, al)
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), "RGBA")


def magenta_residue(im):
    """洋红残留计数：不透明处 min(R,B)-G 明显偏高。"""
    a = np.asarray(im.convert("RGBA")).astype(np.int16)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    m = np.minimum(r, b) - g
    return int(((al > 32) & (m > 60)).sum())


# ---------------------------------------------------------------- 主流程
def main():
    os.makedirs(OUT_IMG, exist_ok=True)
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)
    removed = clean_char_frames()
    print("清理角色帧 %d 个（敌人帧保留）" % removed)

    frames = {}   # clip -> list of dict(rgba, left, right, top, foot, cx)
    meta = {}

    for clip, fn, nominal, fps, loop in CLIPS:
        path = os.path.join(SRC, fn)
        rgb = np.asarray(Image.open(path).convert("RGB"))
        rgba, a = cut_magenta(rgb)
        n, amps = detect_count(a, nominal)
        bounds, nsegs = frame_bounds(a, n)

        items = []
        for i in range(n):
            x0, x1 = bounds[i], bounds[i + 1]
            sub = rgba[:, x0:x1]
            sub_a = a[:, x0:x1]
            got = frame_anchor(sub_a)
            if got is None:
                continue
            left, right, top, foot, cx = got
            items.append(dict(rgba=sub, left=left, right=right,
                              top=top, foot=foot, cx=cx, w=x1 - x0))
        frames[clip] = items
        meta[clip] = dict(fps=fps, loop=loop, n=n, nominal=nominal,
                          bounds=bounds, segs=nsegs)

    # ---- 统一画布几何（原始分辨率）----
    maxL = max(it["cx"] - it["left"] for its in frames.values() for it in its)
    maxR = max(it["right"] - it["cx"] for its in frames.values() for it in its)
    maxUp = max(it["foot"] - it["top"] for its in frames.values() for it in its)

    W0 = (maxL + maxR) * (1 + MARGIN)
    H0 = maxUp * (1 + MARGIN)
    padL0 = (W0 - (maxL + maxR)) / 2.0 + maxL
    padT0 = H0 - maxUp  # 脚底贴齐画布下沿 -> footY = 1.0

    scale = min(1.0, TARGET_LONG / max(W0, H0))

    def render(sc, quality):
        CW = max(1, int(round(W0 * sc)))
        CH = max(1, int(round(H0 * sc)))
        pl = padL0 * (CW / W0)
        pt = padT0 * (CH / H0)
        results = {}
        for clip, its in frames.items():
            out = []
            for i, it in enumerate(its):
                crop = it["rgba"][it["top"]:it["foot"] + 1, :]
                # 只保留内容左右必要部分
                x0 = max(0, it["left"] - 2)
                x1 = min(crop.shape[1], it["right"] + 3)
                crop = crop[:, x0:x1]
                tw = max(1, int(round(crop.shape[1] * sc)))
                th = max(1, int(round(crop.shape[0] * sc)))
                r = resize_rgba_premul(crop, (tw, th))

                canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
                px = int(round(pl - (it["cx"] - x0) * sc))
                py = int(round(CH - th))
                canvas.alpha_composite(Image.fromarray(r, "RGBA"), (px, py))
                canvas = defringe_rgba(canvas)
                out.append(canvas)
            results[clip] = out
        return results, CW, CH

    # ---- 逐步降采样直到满足体积预算 ----
    budget, per_max, total_max = 58 * 1024, 60 * 1024, 3 * 1024 * 1024
    chosen = None
    for sc in [scale, scale * 0.92, scale * 0.85, scale * 0.78, scale * 0.7, scale * 0.62]:
        results, CW, CH = render(sc, 90)
        sizes, ok = {}, True
        for clip, ims in results.items():
            ims[0].save("_probe.webp", "WEBP", quality=90, method=4, alpha_quality=100)
            base = os.path.getsize("_probe.webp")
            if base > per_max:
                ok = False
        total = 0
        if ok:
            for clip, ims in results.items():
                for im in ims:
                    im.save("_probe.webp", "WEBP", quality=90, method=4, alpha_quality=100)
                    total += os.path.getsize("_probe.webp")
            if total > total_max:
                ok = False
        if os.path.exists("_probe.webp"):
            os.remove("_probe.webp")
        if ok:
            chosen = (results, CW, CH, sc, total)
            break

    if chosen is None:
        results, CW, CH = render(scale * 0.55, 90)
        chosen = (results, CW, CH, scale * 0.55, 0)

    results, CW, CH, sc_used, _ = chosen

    # ---- 落盘 ----
    report = []
    total_bytes = 0
    data = {}
    for clip, fn, nominal, fps, loop in CLIPS:
        ims = results[clip]
        n = len(ims)
        files = []
        resid_max = 0
        size_max = 0
        for i, im in enumerate(ims):
            name = "%s-%d.webp" % (clip, i)
            p = os.path.join(OUT_IMG, name)
            im.save(p, "WEBP", quality=90, method=6, alpha_quality=100)
            sz = os.path.getsize(p)
            total_bytes += sz
            size_max = max(size_max, sz)
            resid_max = max(resid_max, magenta_residue(im))
            files.append("assets/anim/" + name)
        data[clip] = dict(frames=n, fps=fps, loop=loop, w=CW, h=CH,
                          anchorX=round(padL0 * (CW / W0) / CW, 4),
                          footY=1.0, files=files)
        report.append((clip, meta[clip]["nominal"], n, "%dx%d" % (CW, CH),
                       size_max, resid_max))

    js = ["window.ANIM = {"]
    for clip, _, _, fps, loop in CLIPS:
        d = data[clip]
        fl = ", ".join('"%s"' % s for s in d["files"])
        js.append('  %-7s { frames: %d, fps: %d, loop: %-5s w: %d, h: %d, '
                  'anchorX: %s, footY: %s, files: [%s] },'
                  % (clip + ":", d["frames"], d["fps"],
                     "true," if d["loop"] else "false,", d["w"], d["h"],
                     d["anchorX"], d["footY"], fl))
    js.append("};")
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("\n".join(js) + "\n")

    # ---- 报表 ----
    print("\nclip     nominal  实际  画布        最大帧KB  洋红残留")
    print("-" * 62)
    for clip, nom, n, dim, smax, resid in report:
        print("%-8s %-9d %-5d %-11s %-9.1f %d" % (clip, nom, n, dim, smax / 1024.0, resid))
    print("-" * 62)
    print("帧总数 %d  总大小 %.2f MB  缩放 %.3f" %
          (sum(len(results[c[0]]) for c in CLIPS), total_bytes / 1048576.0, sc_used))
    print("canvas %dx%d anchorX=%.4f" % (CW, CH, data["idle"]["anchorX"]))
    for clip, _, _, _, _ in CLIPS:
        m = meta[clip]
        print("  %-7s bounds=%s segs=%d" % (clip, m["bounds"], m["segs"]))


def run_enemy():
    """--only enemy：委托给 tools/slice_enemy_anim.py（它只覆盖 enemy-*/boss-* 帧）。"""
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    print("委托 tools/slice_enemy_anim.py 处理敌人帧")
    import slice_enemy_anim
    slice_enemy_anim.main()


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="角色/敌人条带切片。默认只处理角色，不清敌人帧。")
    p.add_argument("--only", choices=("char", "enemy"), default="char",
                   help="char=只切角色（默认，保留敌人帧）；"
                        "enemy=委托 tools/slice_enemy_anim.py")
    return p.parse_args(argv)


def cli(argv=None):
    args = parse_args(argv)
    if args.only == "enemy":
        run_enemy()
    else:
        main()


if __name__ == "__main__":
    cli()
