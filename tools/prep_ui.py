"""处理封面与 UI 素材：标题背景、面板框、按钮四态

封面是整图（不做洋红抠除），面板与按钮需要抠成透明。
按钮四态必须切成同尺寸，否则换态时按钮会跳。
"""
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(r"C:\Users\11965\Desktop\imagegen无限\output\sanxingdui-ui")
DST = Path(r"C:\Users\11965\Desktop\三星堆\assets\ui")
DST.mkdir(parents=True, exist_ok=True)


def key(img, lo=45, hi=112, despill=20):
    a = np.array(img.convert("RGBA")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = np.minimum(r, b) - g
    alpha = a[..., 3].astype(np.float32)
    full = mag > hi
    alpha[full] = 0
    t = np.clip((mag - lo) / float(hi - lo), 0, 1)
    soft = (mag > lo) & (~full)
    alpha[soft] = alpha[soft] * (1.0 - t[soft])
    pur = (mag > 6) & (alpha > 0)
    a[..., 0] = np.where(pur, np.minimum(a[..., 0], a[..., 1] + despill), a[..., 0])
    a[..., 2] = np.where(pur, np.minimum(a[..., 2], a[..., 1] + despill), a[..., 2])
    a[..., 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def trim(img, pad=2):
    bb = img.split()[3].getbbox()
    if not bb:
        return img
    x0, y0, x1, y1 = bb
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(img.width, x1 + pad), min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


def split_row(img, n, min_w=30):
    """一行 n 个：用 alpha 列投影找间隙切"""
    a = np.array(img.split()[3])
    prof = (a > 12).sum(axis=0)
    w = img.width
    cuts = [0]
    for i in range(1, n):
        guess = int(w * i / n)
        lo = max(cuts[-1] + min_w, guess - int(w / n * 0.4))
        hi = min(w - min_w, guess + int(w / n * 0.4))
        seg = prof[lo:hi]
        cuts.append(lo + int(np.argmin(seg)))
    cuts.append(w)
    out = []
    for i in range(n):
        c = img.crop((cuts[i], 0, cuts[i + 1], img.height))
        c = trim(c)
        if c.width >= min_w:
            out.append(c)
    return out


def save(img, name, q=88):
    p = DST / name
    img.save(p, "WEBP", quality=q, method=6)
    print(f"  {name:24s} {p.stat().st_size/1024:6.1f} KB  {img.width}x{img.height}")


print("=== 封面（整图，不抠）===")
title = Image.open(SRC / "ui-title-screen.png").convert("RGB")
# 统一到 1920x1080 覆盖用尺寸
title = title.resize((1920, 1080), Image.LANCZOS)
title.save(DST / "title-bg.webp", "WEBP", quality=84, method=6)
print(f"  title-bg.webp            {(DST/'title-bg.webp').stat().st_size/1024:6.1f} KB  1920x1080")

print("=== 面板框 ===")
panel = trim(key(Image.open(SRC / "ui-panel-frame.png"), lo=38, hi=95, despill=12))
# 面板是实心青铜，边缘残留的紫像素一律清掉：alpha 直接归零
pa = np.array(panel).astype(np.int16)
pm = np.minimum(pa[..., 0], pa[..., 2]) - pa[..., 1]
pa[..., 3] = np.where(pm > 26, 0, pa[..., 3])
# 收一圈 1px，把半透明紫边也切掉
from PIL import ImageFilter
pm_img = Image.fromarray(pa.astype(np.uint8), "RGBA")
a_ch = pm_img.split()[3].filter(ImageFilter.MinFilter(3))
pm_img.putalpha(a_ch)
panel = pm_img
save(panel, "panel-frame.webp")

print("=== 按钮四态 ===")
states = split_row(key(Image.open(SRC / "ui-button-set.png")), 4)
print(f"  切出 {len(states)} 个")
if len(states) == 4:
    # 强制统一尺寸：取所有态的最大宽高，各自居中放进去
    W = max(s.width for s in states)
    H = max(s.height for s in states)
    names = ["btn-normal", "btn-hover", "btn-press", "btn-disabled"]
    for nm, s in zip(names, states):
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        canvas.paste(s, ((W - s.width) // 2, (H - s.height) // 2), s)
        save(canvas, nm + ".webp")
    print(f"  统一画布 {W}x{H}（四态同尺寸，换态不跳）")

print("=== 校验 ===")
import glob
tot = 0
for p in sorted(glob.glob(str(DST / "*.webp"))):
    if "title-bg" in p:
        continue
    a = np.array(Image.open(p).convert("RGBA")).astype(np.int16)
    m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    bad = int(((m > 40) & (a[..., 3] > 20)).sum())
    if bad:
        print(f"  {Path(p).name:24s} 紫色残留 {bad}")
for p in glob.glob(str(DST / "*.webp")):
    tot += Path(p).stat().st_size
print(f"  合计 {tot/1024:.1f} KB / {len(glob.glob(str(DST/'*.webp')))} 个")
