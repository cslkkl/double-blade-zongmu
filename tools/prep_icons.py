"""处理拾取物图标：武器 6 种 / 物品 6 种 / UI 4 种
关键：所有图标归一到同一正方形画布，避免"忽大忽小"。
"""
import os

import numpy as np
from pathlib import Path
from PIL import Image

# ---------------------------------------------------------------- 路径口径
ROOT = Path(__file__).resolve().parent.parent          # 仓库根
ASSETS = ROOT / "assets"                               # 产物根

# 外部生图源目录：不在仓库里，用环境变量给，没给就明确报错退出
IMG_SRC = Path(os.environ.get("SD_IMG_SRC", "")).expanduser()


def require_img_src():
    """取外部生图源目录；未设 SD_IMG_SRC 或目录不存在就退出，绝不写出空产物。"""
    if not os.environ.get("SD_IMG_SRC"):
        raise SystemExit("缺少生图源目录：设置环境变量 SD_IMG_SRC 指向 imagegen 的 output 目录，或用 --src 指定。")
    if not IMG_SRC.is_dir():
        raise SystemExit("生图源目录不存在：%s（检查 SD_IMG_SRC）" % IMG_SRC)
    return IMG_SRC


SRC = require_img_src() / "sanxingdui-items"    # <SD_IMG_SRC>/sanxingdui-items
DST = ASSETS / "icons"
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


def split_grid(img, rows, cols, gap=10, min_size=40):
    """按网格切分：先在期望的格子附近找空白列/行做吸附，避免切到物体"""
    al = np.array(img.split()[3])
    h, w = al.shape

    def bands(axis_len, expected):
        """在每两个格子之间找 alpha 总和最低的列作为切点"""
        proj = (al > 12).sum(axis=0 if axis_len == w else 1)
        cuts = [0]
        for i in range(1, expected):
            guess = int(axis_len * i / expected)
            lo = max(cuts[-1] + min_size, guess - int(axis_len / expected * 0.35))
            hi = min(axis_len - min_size, guess + int(axis_len / expected * 0.35))
            if hi <= lo:
                cuts.append(guess)
                continue
            seg = proj[lo:hi]
            cuts.append(lo + int(np.argmin(seg)))
        cuts.append(axis_len)
        return cuts

    xs = bands(w, cols)
    ys = bands(h, rows)
    out = []
    for r in range(rows):
        for c in range(cols):
            cell = img.crop((xs[c], ys[r], xs[c + 1], ys[r + 1]))
            bb = cell.split()[3].getbbox()
            if bb:
                cell = cell.crop(bb)
            if cell.width >= min_size and cell.height >= min_size:
                out.append(cell)
    return out


def to_uniform(img, canvas=256, fill=0.86):
    """把内容等比放进统一画布，按最长边占 fill，居中 —— 解决忽大忽小"""
    bb = img.split()[3].getbbox()
    if bb:
        img = img.crop(bb)
    target = int(canvas * fill)
    sc = target / max(img.width, img.height, 1)
    nw, nh = max(1, int(img.width * sc)), max(1, int(img.height * sc))
    img = img.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(img, ((canvas - nw) // 2, (canvas - nh) // 2), img)
    return out


def save(img, name, q=92):
    p = DST / name
    img.save(p, "WEBP", quality=q, method=6)
    print(f"  {name:26s} {p.stat().st_size/1024:6.1f} KB  {img.width}x{img.height}")


WEAPONS = ["dagger", "sword", "axe", "spear", "mace", "bow"]
ITEMS = ["cowrie", "jade", "eye", "bell", "jar", "rock"]
ICONS = ["icon-eye", "icon-mask", "icon-leiwen", "icon-tree"]

# ---- 无消费方的图标不再产出（2026-10-25）----
# it-cowrie / it-eye：index.html 的 ICON 表只用到 itJade / itBell / itJar / wpRock，
#   这两张没有任何 `IMG.itCowrie` / `IMG.itEye` 读取点。
# icon-* 四张（UI 图标）：整组无读取点。
# ⚠️ ITEMS / ICONS 两个**列表本身不能删** —— 切分是按网格下标的，删元素会让
#    后面每一格都错位。只跳过写盘，切分位置保持不变。
DEAD_ITEMS = {"cowrie", "eye"}
WRITE_UI_ICONS = False

print("=== 武器图标 3x2 ===")
ws = split_grid(key(Image.open(SRC / "weapon-set.png")), 2, 3)
print(f"  切出 {len(ws)}")
for i, im in enumerate(ws[:6]):
    save(to_uniform(im, 256, 0.86), f"wp-{WEAPONS[i]}.webp")

print("=== 物品图标 3x2 ===")
it = split_grid(key(Image.open(SRC / "item-set.png")), 2, 3)
print(f"  切出 {len(it)}")
for i, im in enumerate(it[:6]):
    if ITEMS[i] in DEAD_ITEMS:
        print(f"  跳过 it-{ITEMS[i]}（无消费方）")
        continue
    save(to_uniform(im, 192, 0.84), f"it-{ITEMS[i]}.webp")

if WRITE_UI_ICONS:
    print("=== UI 图标 2x2 ===")
    ic = split_grid(key(Image.open(SRC / "ui-icon-set.png")), 2, 2)
    print(f"  切出 {len(ic)}")
    for i, im in enumerate(ic[:4]):
        save(to_uniform(im, 128, 0.88), f"{ICONS[i]}.webp")
else:
    print("=== UI 图标：跳过（整组无消费方，见文件头 DEAD_ITEMS 说明）===")

print("=== 校验 ===")
import glob
bad_total = 0
for p in sorted(glob.glob(str(DST / "*.webp"))):
    a = np.array(Image.open(p).convert("RGBA")).astype(np.int16)
    m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    bad = int(((m > 40) & (a[..., 3] > 20)).sum())
    bad_total += bad
    if bad:
        print(f"  {Path(p).name:26s} 紫色残留 {bad}")
print(f"  合计紫色残留 {bad_total}")
total = sum(Path(p).stat().st_size for p in glob.glob(str(DST / "*.webp")))
print(f"  合计 {total/1024:.1f} KB / {len(glob.glob(str(DST / '*.webp')))} 个")
