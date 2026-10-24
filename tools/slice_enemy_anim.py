# -*- coding: utf-8 -*-
"""
敌人条带 -> 逐帧 webp + js/anim-data.js 追加 window.ENEMY_ANIM
- 复用 slice_anim.py 的 cut_magenta / frame_bounds / frame_anchor / resize / defringe
- 每个 kind 独立画布几何（同 kind 同尺寸），长边 <= 400
- 只覆盖 assets/anim/enemy-*.webp 与 boss-*.webp，不动角色帧
- anim-data.js 里 window.ANIM 原样保留，只在末尾追加 window.ENEMY_ANIM
"""
import os
import sys
import tempfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)   # slice_anim.py 与本文件同在 tools/

import slice_anim as S  # noqa: E402

SRC = r"C:\Users\11965\Desktop\imagegen无限\output\sanxingdui-enemy"
OUT_IMG = os.path.join(ROOT, "assets", "anim")
OUT_JS = os.path.join(ROOT, "js", "anim-data.js")

# kind, 文件, 帧数, fps, loop
CLIPS = [
    ("walker", "enemy-walker.png", 4, 10, True),
    ("fast",   "enemy-fast.png",   4, 14, True),
    ("brute",  "enemy-brute.png",  4, 8,  True),
    ("boss",   "boss-zongmu.png",  2, 3,  True),
]

MARGIN = 0.08
TARGET_LONG = 400
QUALITY = 90
PER_MAX = 64 * 1024
TOTAL_MAX = 2 * 1024 * 1024
PROBE = os.path.join(tempfile.gettempdir(), "_enemy_probe.webp")


def despill(im):
    """敌人这套图的软边比角色更薄，洋红残留会在低 alpha 处泛紫。
    在 slice_anim.defringe_rgba 之后再加一道更狠的去溢色：
    - 半透明处 R/B 直接压到 G+10
    - 近不透明但明显带洋红分量的描边也一并压（本套调色板只有青铜/金/陶土）
    - 极低 alpha 的洋红残余直接清掉，避免压缩后出彩边
    """
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    al = a[:, :, 3]
    r = a[:, :, 0].copy()
    g = a[:, :, 1]
    b = a[:, :, 2].copy()
    m = np.minimum(r, b) - g

    soft = (al > 0) & (m > 6) & (al < 252)
    hard = (al >= 252) & (m > 12)
    capS = g + 10.0
    capH = g + 14.0
    r = np.where(soft, np.minimum(r, capS), r)
    b = np.where(soft, np.minimum(b, capS), b)
    r = np.where(hard, np.minimum(r, capH), r)
    b = np.where(hard, np.minimum(b, capH), b)

    al = np.where((al < 40) & (m > 10), 0.0, al)

    out = np.stack([r, g, b, al], axis=2)
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), "RGBA")


def kind_frames(fn, nominal):
    """切一个条带的 n 帧，返回 [(rgba, left, right, top, foot, cx)]"""
    rgb = np.asarray(Image.open(os.path.join(SRC, fn)).convert("RGB"))
    rgba, a = S.cut_magenta(rgb)
    detected, amps = S.detect_count(a, nominal)
    n = nominal  # 标称帧数为准；FFT 只用来交叉校验
    bounds, nsegs = S.frame_bounds(a, n)

    items = []
    for i in range(n):
        x0, x1 = bounds[i], bounds[i + 1]
        got = S.frame_anchor(a[:, x0:x1])
        if got is None:
            raise RuntimeError("%s 第 %d 帧是空的，检查条带" % (fn, i))
        left, right, top, foot, cx = got
        items.append(dict(rgba=rgba[:, x0:x1], left=left, right=right,
                          top=top, foot=foot, cx=cx))
    return items, dict(detected=detected, segs=nsegs, bounds=bounds, amps=amps)


def kind_geometry(items):
    """该 kind 的统一画布：内容居中，脚底贴齐画布下沿（footY = 1.0）。"""
    maxL = max(it["cx"] - it["left"] for it in items)
    maxR = max(it["right"] - it["cx"] for it in items)
    maxUp = max(it["foot"] - it["top"] for it in items)

    W0 = (maxL + maxR) * (1 + MARGIN)
    H0 = maxUp * (1 + MARGIN)
    padL0 = (W0 - (maxL + maxR)) / 2.0 + maxL
    padT0 = H0 - maxUp
    sc = min(1.0, TARGET_LONG / max(W0, H0))
    return dict(W0=W0, H0=H0, padL0=padL0, padT0=padT0, sc=sc)


def render_kind(items, g, sc):
    CW = max(1, int(round(g["W0"] * sc)))
    CH = max(1, int(round(g["H0"] * sc)))
    pl = g["padL0"] * (CW / g["W0"])

    out = []
    for it in items:
        crop = it["rgba"][it["top"]:it["foot"] + 1, :]
        x0 = max(0, it["left"] - 2)
        x1 = min(crop.shape[1], it["right"] + 3)
        crop = crop[:, x0:x1]
        tw = max(1, int(round(crop.shape[1] * sc)))
        th = max(1, int(round(crop.shape[0] * sc)))
        r = S.resize_rgba_premul(crop, (tw, th))

        canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
        px = int(round(pl - (it["cx"] - x0) * sc))
        py = int(round(CH - th))
        canvas.alpha_composite(Image.fromarray(r, "RGBA"), (px, py))
        out.append(despill(S.defringe_rgba(canvas)))
    return out, CW, CH, pl / CW


def measure(images):
    """一张一张存探针，返回 (单帧最大字节, 总字节)"""
    smax, total = 0, 0
    for im in images:
        im.save(PROBE, "WEBP", quality=QUALITY, method=4, alpha_quality=100)
        sz = os.path.getsize(PROBE)
        total += sz
        smax = max(smax, sz)
    return smax, total


def main():
    os.makedirs(OUT_IMG, exist_ok=True)
    os.makedirs(os.path.dirname(OUT_JS), exist_ok=True)

    data = {}
    info = {}
    rendered = {}
    total_bytes = 0

    for kind, fn, nominal, fps, loop in CLIPS:
        items, meta = kind_frames(fn, nominal)
        g = kind_geometry(items)

        chosen = None
        for k in (1.0, 0.92, 0.85, 0.78, 0.7, 0.62, 0.55):
            sc = g["sc"] * k
            ims, CW, CH, ax = render_kind(items, g, sc)
            smax, total = measure(ims)
            if smax <= PER_MAX and total <= TOTAL_MAX:
                chosen = (ims, CW, CH, ax, sc, smax, total)
                break
        if chosen is None:
            ims, CW, CH, ax = render_kind(items, g, g["sc"] * 0.55)
            smax, total = measure(ims)
            chosen = (ims, CW, CH, ax, g["sc"] * 0.55, smax, total)

        ims, CW, CH, ax, sc, smax, _ = chosen

        files = []
        szmax, resid_max = 0, 0
        for i, im in enumerate(ims):
            name = "enemy-%s-%d.webp" % (kind, i)
            p = os.path.join(OUT_IMG, name)
            im.save(p, "WEBP", quality=QUALITY, method=6, alpha_quality=100)
            sz = os.path.getsize(p)
            total_bytes += sz
            szmax = max(szmax, sz)
            resid_max = max(resid_max, S.magenta_residue(im))
            files.append("assets/anim/" + name)

        data[kind] = dict(frames=len(ims), fps=fps, loop=loop, w=CW, h=CH,
                          anchorX=round(ax, 4), footY=1.0, files=files)
        info[kind] = dict(n=len(ims), canvas="%dx%d" % (CW, CH),
                          szmax=szmax, resid=resid_max, sc=sc, meta=meta)

    if os.path.exists(PROBE):
        os.remove(PROBE)

    # ---------------- 追加 window.ENEMY_ANIM（window.ANIM 原样保留） ----------------
    with open(OUT_JS, "r", encoding="utf-8") as f:
        old = f.read()

    marker = "\nwindow.ENEMY_ANIM = "
    if marker in old:
        old = old.split(marker)[0].rstrip() + "\n"
    if "window.ANIM" not in old:
        raise RuntimeError("anim-data.js 里没有 window.ANIM，拒绝覆盖")

    js = ["", "window.ENEMY_ANIM = {"]
    for kind, fn, nominal, fps, loop in CLIPS:
        d = data[kind]
        fl = ", ".join('"%s"' % s for s in d["files"])
        js.append(
            '  %-8s { frames: %d, fps: %d, loop: %s, w: %d, h: %d, '
            'anchorX: %s, footY: %s, files: [%s] },'
            % (kind + ":", d["frames"], d["fps"],
               "true" if d["loop"] else "false", d["w"], d["h"],
               d["anchorX"], d["footY"], fl)
        )
    js.append("};")
    new = old.rstrip() + "\n" + "\n".join(js) + "\n"

    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write(new)

    # ---------------- 报表 ----------------
    print("\nkind     标称 实际  画布       最大帧KB  洋红残留  FFT检测 segs")
    print("-" * 68)
    frames_total = 0
    for kind, fn, nominal, fps, loop in CLIPS:
        i = info[kind]
        frames_total += i["n"]
        print("%-8s %-5d %-5d %-10s %-9.1f %-9d %-8d %d"
              % (kind, nominal, i["n"], i["canvas"], i["szmax"] / 1024.0,
                 i["resid"], i["meta"]["detected"], i["meta"]["segs"]))
    print("-" * 68)
    print("帧总数 %d  总大小 %.2f MB (%d bytes)"
          % (frames_total, total_bytes / 1048576.0, total_bytes))
    for kind, _, _, _, _ in CLIPS:
        d = data[kind]
        print("  %-7s anchorX=%s w=%d h=%d fps=%d files=%d"
              % (kind, d["anchorX"], d["w"], d["h"], d["fps"], len(d["files"])))


if __name__ == "__main__":
    main()
