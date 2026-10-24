"""素材预处理 v2：洋红抠图 + 边缘去污染（decontamination）"""
import numpy as np
from pathlib import Path
from PIL import Image

SRC = Path(r"C:\Users\11965\Desktop\imagegen无限\output")
DST = Path(r"C:\Users\11965\Desktop\三星堆\assets")
(DST / "props").mkdir(parents=True, exist_ok=True)
(DST / "char").mkdir(parents=True, exist_ok=True)


def decontaminate(a: np.ndarray, passes: int = 4) -> np.ndarray:
    """把半透明边缘像素的颜色向邻近不透明像素靠拢，消除洋红污染"""
    rgb = a[..., :3].astype(np.float32)
    alpha = a[..., 3].astype(np.float32)

    for _ in range(passes):
        # 上/下/左/右 四个方向
        up = np.roll(rgb, -1, axis=0); up_w = np.roll(alpha, -1, axis=0)
        dn = np.roll(rgb, 1, axis=0);  dn_w = np.roll(alpha, 1, axis=0)
        lf = np.roll(rgb, -1, axis=1); lf_w = np.roll(alpha, -1, axis=1)
        rt = np.roll(rgb, 1, axis=1);  rt_w = np.roll(alpha, 1, axis=1)

        stack_c = np.stack([up, dn, lf, rt], axis=2)          # H,W,4,3
        stack_a = np.stack([up_w, dn_w, lf_w, rt_w], axis=2)  # H,W,4

        # 只采信 alpha 更高的邻居
        valid = stack_a > np.maximum(alpha[..., None], 200)
        wsum = valid.sum(axis=2)

        need = (alpha > 0) & (alpha < 250) & (wsum > 0)
        if not need.any():
            break

        weighted = (stack_c * valid[..., None]).sum(axis=2)
        avg = weighted / np.maximum(wsum, 1)[..., None]

        rgb[need] = rgb[need] * 0.35 + avg[need] * 0.65

    out = a.copy()
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out


def key_magenta(img: Image.Image, lo=45, hi=115) -> Image.Image:
    a = np.array(img.convert("RGBA")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = np.minimum(r, b) - g

    alpha = a[..., 3].astype(np.float32)

    # 硬抠
    full = mag > hi
    alpha[full] = 0

    # 软边
    t = np.clip((mag - lo) / float(hi - lo), 0, 1)
    soft = (mag > lo) & (~full)
    alpha[soft] = alpha[soft] * (1.0 - t[soft])

    # 去紫：把洋红偏色压掉
    purple = (mag > 12) & (alpha > 0)
    a[..., 0] = np.where(purple, np.minimum(a[..., 0], a[..., 1] + 34), a[..., 0])
    a[..., 2] = np.where(purple, np.minimum(a[..., 2], a[..., 1] + 34), a[..., 2])

    a[..., 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    a = decontaminate(a.astype(np.uint8), passes=5)
    return Image.fromarray(a, "RGBA")


def key_flood_dark(img: Image.Image, tol=26) -> Image.Image:
    from collections import deque
    im = img.convert("RGBA")
    a = np.array(im)
    h, w = a.shape[:2]
    bg = a[0, 0, :3].astype(np.int16)
    rgb = a[..., :3].astype(np.int16)
    diff = np.abs(rgb - bg).sum(axis=2)
    candidate = diff <= tol * 3

    visited = np.zeros((h, w), bool)
    dq = deque()
    for x in range(w):
        dq.append((0, x)); dq.append((h - 1, x))
    for y in range(h):
        dq.append((y, 0)); dq.append((y, w - 1))
    while dq:
        y, x = dq.popleft()
        if y < 0 or y >= h or x < 0 or x >= w:
            continue
        if visited[y, x] or not candidate[y, x]:
            continue
        visited[y, x] = True
        dq.append((y - 1, x)); dq.append((y + 1, x))
        dq.append((y, x - 1)); dq.append((y, x + 1))

    a[..., 3] = np.where(visited, 0, a[..., 3])
    a = decontaminate(a, passes=4)
    return Image.fromarray(a, "RGBA")


def crop_content(img: Image.Image, pad=0) -> Image.Image:
    bbox = img.split()[3].getbbox()
    if not bbox:
        return img
    x0, y0, x1, y1 = bbox
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(img.width, x1 + pad); y1 = min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


def fit(img: Image.Image, maxw, maxh) -> Image.Image:
    sc = min(maxw / img.width, maxh / img.height, 1.0)
    if sc >= 0.999:
        return img
    return img.resize((max(1, int(img.width * sc)), max(1, int(img.height * sc))), Image.LANCZOS)


def save_webp(img, path, q=88):
    img.save(path, "WEBP", quality=q, method=6)
    print(f"  {path.name:22s} {path.stat().st_size/1024:8.1f} KB  ({img.width}x{img.height})")


def save_jpg(img, path, q=86):
    img.convert("RGB").save(path, "JPEG", quality=q, optimize=True, progressive=True)
    print(f"  {path.name:22s} {path.stat().st_size/1024:8.1f} KB  ({img.width}x{img.height})")


print("=== 背景 ===")
save_jpg(fit(Image.open(SRC / "sx-scene/far-bg-altar.png"), 1600, 900), DST / "bg-far.jpg")

mid = crop_content(key_magenta(Image.open(SRC / "sx-scene/mid-bg-pit.png")))
save_webp(fit(mid, 1600, 900), DST / "bg-mid.webp")

fg = crop_content(key_magenta(Image.open(SRC / "sx-scene/foreground-occlusion.png")))
save_webp(fit(fg, 1700, 900), DST / "bg-fg.webp")

gd = crop_content(key_magenta(Image.open(SRC / "sx-scene/ground-strip-wide.png")))
save_webp(fit(gd, 2400, 700), DST / "ground.webp")

print("=== 道具 ===")
for f in sorted((SRC / "sx-scene/props").glob("*.png")):
    name = f.stem.replace("prop-", "")
    im = crop_content(key_magenta(Image.open(f)))
    save_webp(fit(im, 460, 460), DST / "props" / f"{name}.webp", 86)

print("=== 特效 ===")
fx = crop_content(key_magenta(Image.open(SRC / "sx-scene/interact/fx-slash.png")))
w3 = fx.width // 3
for i in range(3):
    piece = crop_content(fx.crop((i * w3, 0, (i + 1) * w3, fx.height)))
    save_webp(fit(piece, 260, 260), DST / f"fx-slash-{i+1}.webp", 90)

print("=== 角色 ===")
ch = crop_content(key_flood_dark(Image.open(SRC / "sanxingdui-game/sanxingdui-chibi-turnaround-v3.png")))
save_webp(ch, DST / "char" / "turnaround.webp", 90)

sv = crop_content(key_flood_dark(Image.open(SRC / "sanxingdui-game/sanxingdui-chibi-side-v5.png")))
alpha = np.array(sv.split()[3])
present = (alpha.sum(axis=0) > 0)
groups, start = [], None
for x, v in enumerate(present):
    if v and start is None:
        start = x
    elif not v and start is not None:
        if x - start > 30:
            groups.append((start, x))
        start = None
if start is not None:
    groups.append((start, len(present)))

for i, (x0, x1) in enumerate(groups[:2]):
    part = crop_content(sv.crop((x0, 0, x1, sv.height)))
    save_webp(part, DST / "char" / f"pose-{i}.webp", 92)

print("=== 合计 ===")
total = sum(p.stat().st_size for p in DST.rglob("*") if p.is_file())
print(f"  {total/1024:.1f} KB")
