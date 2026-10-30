"""游戏图标：一张 2048 方图出多尺寸 favicon + 桌面图标

favicon 必须小尺寸也能认出，所以按 16/32/48 逐级检查轮廓是否还成立。
输出 PNG（透明边不要，图标本身满版）+ ICO（多尺寸打包）。
"""
import os
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


SRC = require_img_src() / "sanxingdui-icon" / "game-icon.png"   # 单张源图
DST = ASSETS / "icon"
if not SRC.is_file():
    raise SystemExit("缺少源图：%s（检查 SD_IMG_SRC 下的 sanxingdui-icon/game-icon.png）" % SRC)
DST.mkdir(parents=True, exist_ok=True)

SIZES = [16, 32, 48, 64, 128, 180, 192, 512]

print("=== 源图 ===")
im = Image.open(SRC).convert("RGB")
print(f"  {im.width}x{im.height}")

print("=== favicon 多尺寸 ===")
for s in SIZES:
    out = im.resize((s, s), Image.LANCZOS)
    name = f"icon-{s}.png"
    p = DST / name
    out.save(p, "PNG", optimize=True)
    print(f"  {name:14s} {p.stat().st_size/1024:6.1f} KB  {s}x{s}")

print("=== apple-touch-icon（180，不透明）===")
im.resize((180, 180), Image.LANCZOS).save(DST / "apple-touch-icon.png", "PNG", optimize=True)
print(f"  apple-touch-icon.png {(DST/'apple-touch-icon.png').stat().st_size/1024:6.1f} KB")

print("=== favicon.ico（16/32/48 打包）===")
ico = DST / "favicon.ico"
im.resize((256, 256), Image.LANCZOS).save(ico, format="ICO",
                                          sizes=[(16, 16), (32, 32), (48, 48)])
print(f"  favicon.ico    {ico.stat().st_size/1024:6.1f} KB")

print("=== 校验：小尺寸是否还有细节 ===")
import numpy as np
for s in [16, 32]:
    a = np.array(im.resize((s, s), Image.LANCZOS).convert("L"))
    # 灰度方差越大说明明暗层次还在，不会糊成一团
    print(f"  {s}x{s} 灰度标准差 {a.std():.1f}  min {a.min()}  max {a.max()}")

tot = sum(p.stat().st_size for p in DST.glob("*"))
print(f"=== 合计 {tot/1024:.1f} KB / {len(list(DST.glob('*')))} 个 ===")
