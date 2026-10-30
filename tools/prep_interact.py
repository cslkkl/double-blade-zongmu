"""处理互动素材：宝箱双态 / 机关双态 / 拾取物"""
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


SRC = require_img_src() / "sx-scene" / "interact"    # <SD_IMG_SRC>/sx-scene/interact
DST = ASSETS / "interact"
DST.mkdir(parents=True, exist_ok=True)


def key(img, lo=45, hi=115, despill=22):
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


def crop(img, pad=2):
    bb = img.split()[3].getbbox()
    if not bb:
        return img
    x0, y0, x1, y1 = bb
    return img.crop((max(0, x0 - pad), max(0, y0 - pad),
                     min(img.width, x1 + pad), min(img.height, y1 + pad)))


def save(img, name, maxw, q=90):
    sc = min(maxw / img.width, maxw / img.height, 1.0)
    if sc < 0.999:
        img = img.resize((int(img.width * sc), int(img.height * sc)), Image.LANCZOS)
    p = DST / name
    img.save(p, "WEBP", quality=q, method=6)
    print(f"  {name:22s} {p.stat().st_size/1024:6.1f} KB  {img.width}x{img.height}")


jobs = [
    ("obj-chest-closed.png",   "chest-closed.webp",   260),
    ("obj-chest-open.png",     "chest-open.webp",     260),
    ("obj-mechanism-off.png",  "mechanism-off.webp",  260),
    ("obj-mechanism-on.png",   "mechanism-on.webp",   260),
    ("obj-pickup-cowrie.png",  "pickup-cowrie.webp",  120),
    ("obj-pickup-jade.png",    "pickup-jade.webp",    120),
]

print("=== 互动素材 ===")
for src, name, maxw in jobs:
    im = Image.open(SRC / src)
    im = crop(key(im))
    save(im, name, maxw)

print("=== 校验 ===")
import glob
for p in sorted(glob.glob(str(DST / "*.webp"))):
    a = np.array(Image.open(p).convert("RGBA")).astype(np.int16)
    m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    bad = int(((m > 40) & (a[..., 3] > 20)).sum())
    print(f"  {Path(p).name:22s} 紫色残留 {bad}")
