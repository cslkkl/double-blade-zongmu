"""前景层重做：只保留底部草地细条，去掉悬挂物与大面积黑色
原 bg-fg.webp 是 16:9 整图（顶部有横梁/挂帘/铁链，草地占近半屏），
平铺进游戏像盖了一层黑布。这里只取底部草叶剪影，压成约 18% 高的细条。
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


SRC = require_img_src() / "sx-scene" / "foreground-occlusion.png"   # 单张源图
DST = ASSETS / "bg-fg-strip.webp"
if not SRC.is_file():
    raise SystemExit("缺少源图：%s（检查 SD_IMG_SRC 下的 sx-scene/foreground-occlusion.png）" % SRC)

im = Image.open(SRC).convert("RGBA")
a = np.array(im).astype(np.float32)
h, w = a.shape[:2]

r, g, b = a[..., 0], a[..., 1], a[..., 2]
mag = np.minimum(r, b) - g
alpha = a[..., 3].copy()

# 抠洋红
alpha[mag > 105] = 0
alpha[alpha < 200] = 0

# 只保留底部 30% 区域（草叶带），上部横梁/挂帘/铁链全部丢弃
keep_from = int(h * 0.70)
alpha[:keep_from, :] = 0

# 按亮度重映射为暗青绿剪影
lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
lum = np.clip((lum - 0.02) / 0.45, 0, 1)
dark = np.array([8, 12, 13], np.float32)
light = np.array([42, 58, 50], np.float32)
rgb = dark + (light - dark) * lum[..., None]
a[..., 0], a[..., 1], a[..., 2] = rgb[..., 0], rgb[..., 1], rgb[..., 2]
a[..., 3] = np.clip(alpha, 0, 255)

out = Image.fromarray(a.astype(np.uint8), "RGBA")

# 裁到内容，再压成 1600 宽
bb = out.split()[3].getbbox()
if bb:
    out = out.crop(bb)

sc = 1600 / out.width
out = out.resize((1600, max(1, int(out.height * sc))), Image.LANCZOS)

out.save(DST, "WEBP", quality=88, method=6)

chk = np.array(Image.open(DST).convert("RGBA")).astype(np.int16)
cm = np.minimum(chk[..., 0], chk[..., 2]) - chk[..., 1]
bad = int(((cm > 25) & (chk[..., 3] > 20)).sum())
print(f"{DST.name}  {DST.stat().st_size/1024:.1f} KB  {out.width}x{out.height}  紫色残留 {bad}")
