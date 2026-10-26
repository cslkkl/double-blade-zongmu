"""处理攻击特效：抠洋红 / 拆分 / 缩放"""
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


SRC = require_img_src() / "sanxingdui-fx"    # <SD_IMG_SRC>/sanxingdui-fx
DST = ASSETS                                 # assets/
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
    # 去溢色
    pur = (mag > 6) & (alpha > 0)
    a[..., 0] = np.where(pur, np.minimum(a[..., 0], a[..., 1] + despill), a[..., 0])
    a[..., 2] = np.where(pur, np.minimum(a[..., 2], a[..., 1] + despill), a[..., 2])
    a[..., 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def crop(img, pad=4):
    bb = img.split()[3].getbbox()
    if not bb:
        return img
    x0, y0, x1, y1 = bb
    return img.crop((max(0, x0 - pad), max(0, y0 - pad),
                     min(img.width, x1 + pad), min(img.height, y1 + pad)))


def split_cols(img, min_gap=14, min_w=60):
    """按列 alpha 投影切成独立对象"""
    al = np.array(img.split()[3])
    present = (al > 12).sum(axis=0) > 2
    groups, s = [], None
    gap = 0
    for x, v in enumerate(present):
        if v:
            if s is None:
                s = x
            gap = 0
        else:
            if s is not None:
                gap += 1
                if gap >= min_gap:
                    if x - gap - s + 1 >= min_w:
                        groups.append((s, x - gap + 1))
                    s = None
    if s is not None and len(present) - s >= min_w:
        groups.append((s, len(present)))
    return [img.crop((a, 0, b, img.height)) for a, b in groups]


def save(img, path, q=90):
    img.save(path, "WEBP", quality=q, method=6)
    print(f"  {path.name:22s} {path.stat().st_size/1024:7.1f} KB  ({img.width}x{img.height})")


print("=== 刀光三档 ===")
s1 = crop(key(Image.open(SRC / "slash-set-1.png")))
parts = split_cols(s1)
print(f"  切出 {len(parts)} 个")
for i, p in enumerate(parts[:3]):
    p = crop(p)
    sc = min(400 / p.width, 400 / p.height, 1.0)
    if sc < 0.999:
        p = p.resize((int(p.width * sc), int(p.height * sc)), Image.LANCZOS)
    save(p, DST / f"slash-{i+1}.webp")

print("=== 打击火花三档 ===")
s2 = crop(key(Image.open(SRC / "slash-set-2.png")))
parts2 = split_cols(s2)
print(f"  切出 {len(parts2)} 个")
for i, p in enumerate(parts2[:3]):
    p = crop(p)
    sc = min(360 / p.width, 360 / p.height, 1.0)
    if sc < 0.999:
        p = p.resize((int(p.width * sc), int(p.height * sc)), Image.LANCZOS)
    save(p, DST / f"hit-{i+1}.webp")

print("=== 旋风斩光环 ===")
w = crop(key(Image.open(SRC / "slash-whirl.png")))
sc = min(560 / w.width, 560 / w.height, 1.0)
if sc < 0.999:
    w = w.resize((int(w.width * sc), int(w.height * sc)), Image.LANCZOS)
save(w, DST / "whirl-ring.webp")

print("=== 投掷石块 ===")
rk = crop(key(Image.open(SRC / "fx-throw-rock.png")))
sc = min(220 / rk.width, 220 / rk.height, 1.0)
if sc < 0.999:
    rk = rk.resize((int(rk.width * sc), int(rk.height * sc)), Image.LANCZOS)
save(rk, DST / "proj-rock.webp")

print("=== 校验洋红残留 ===")
import glob
for p in sorted(glob.glob(str(DST / "slash-*.webp")) + glob.glob(str(DST / "hit-*.webp"))
                + [str(DST / "whirl-ring.webp"), str(DST / "proj-rock.webp")]):
    a = np.array(Image.open(p).convert("RGBA")).astype(np.int16)
    m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    bad = int(((m > 40) & (a[..., 3] > 20)).sum())
    print(f"  {Path(p).name:22s} 残留 {bad}")
