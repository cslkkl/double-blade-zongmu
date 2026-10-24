"""前景层重做：
原画里那几团紫灰色块是实心的（alpha 接近 255），不是抠图残留。
前景本来就该是深色剪影，所以整层按亮度重映射成暗绿黑，只保留明暗层次，去掉紫色色相。
"""
import numpy as np
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\11965\Desktop\imagegen无限\output\sx-scene\foreground-occlusion.png")
DST = Path(r"C:\Users\11965\Desktop\三星堆\assets\bg-fg.webp")

im = Image.open(SRC).convert("RGBA")
a = np.array(im).astype(np.float32)

r, g, b = a[..., 0], a[..., 1], a[..., 2]
mag = np.minimum(r, b) - g

alpha = a[..., 3].copy()

# 1. 硬抠洋红
alpha[mag > 105] = 0

# 2. 半透明薄雾清掉（前景只要实心剪影）
alpha[alpha < 200] = 0

# 3. 按亮度重映射到暗绿黑色阶（彻底去掉紫色相）
lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
lum = np.clip((lum - 0.02) / 0.45, 0, 1)          # 拉伸，让原本的暗部有层次

# 渐变：最暗 #06090a → 最亮 #3d5147（低饱和青绿）
dark = np.array([6, 9, 10], np.float32)
light = np.array([61, 81, 71], np.float32)
rgb = dark + (light - dark) * lum[..., None]

a[..., 0] = rgb[..., 0]
a[..., 1] = rgb[..., 1]
a[..., 2] = rgb[..., 2]
a[..., 3] = np.clip(alpha, 0, 255)

out = Image.fromarray(a.astype(np.uint8), "RGBA")

# 裁透明边
bbox = out.split()[3].getbbox()
if bbox:
    out = out.crop(bbox)

sc = min(1700 / out.width, 900 / out.height, 1.0)
if sc < 0.999:
    out = out.resize((int(out.width * sc), int(out.height * sc)), Image.LANCZOS)

out.save(DST, "WEBP", quality=86, method=6)

# 校验紫色残留
chk = np.array(Image.open(DST).convert("RGBA")).astype(np.int16)
cr, cg, cb = chk[..., 0], chk[..., 1], chk[..., 2]
cmag = np.minimum(cr, cb) - cg
bad = (cmag > 25) & (chk[..., 3] > 20)
print(f"{DST.name}  {DST.stat().st_size/1024:.1f} KB  {out.width}x{out.height}")
print(f"紫色残留: {int(bad.sum())} px")
