"""处理手机虚拟键美术：青铜盘 2 种（正圆 / 圆角方）+ 金线纹样 8 种

口径只有一条：**先抠洋红，再按「盘体本体」归一，不被外挂的柔和暗影带偏**。
盘 →「盘体边长 = 0.96 × 256 = 246」，纹样 →「长边 = 0.70 × 256 = 179」，
一律 256×256 方画布居中，WebP q86 / method 6。

UI 侧键面是 `border-radius:50%`（方盘 26%）的裁切盒 + `background-size:100% 100%`。
归一化只按**盘体本体**口径，盘外暗影因此不参与缩放；实测归一后盘体外那圈暗影只剩
0~1px（圆盘 0、方盘 1px），落在裁切盒内、读成盘缘下侧的接触阴影，**不构成矩形脏边**。
所以脚本里没有「去影」这一步 —— 该做的是把归一化口径钉在本体上，而不是先把它抠掉。

⚠️ 这批图的暗影**不是低 alpha**：实测盘底下缘暗影带（源图 y≈750~766）alpha 中位数 255，
不透明度与盘体相同，只是色度低（chroma p50≈8、亮度 p50≈24），因此躲过了洋红键；
「按 alpha>200 取实心区求包围盒」在这里判不出本体（与 alpha>8 的包围盒只差 1~2px）。
真正可靠的判据是**形状的竖直对称性**，见 plate_body_box 的注释。
"""
import glob
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

SRC = Path(r"C:\Users\11965\Desktop\imagegen无限\output\sanxingdui-touch")
DST = Path(r"C:\Users\11965\Desktop\三星堆\assets\touch")
DST.mkdir(parents=True, exist_ok=True)

CANVAS = 256
PLATE_FILL = 0.96          # 盘体边长占画布
GLYPH_FILL = 0.70          # 纹样长边占画布
QUALITY = 86
METHOD = 6
DESPILL = 22
A_SOFT = 8                 # 判前景 / 切格的 alpha 阈值
SQ_RADIUS_HINT = 0.26      # UI 侧方盘键的 border-radius（本脚本只用来校验裁切损失）
MIN_BLOB = 24              # 小于此面积的碎块判为残片丢弃（比这大的都留着）
MIN_OUT = 8                # 缩放后再筛一次：小于此面积的孤立点直接抹掉

KEY_LO, KEY_HI = 45, 115   # 洋红键的双阈值，与 prep_interact 同量级

# 行优先，与源图 4 列 × 2 行一一对应，**顺序不能改**
GLYPHS = ["left", "right", "jump", "atk", "skill", "act", "drop", "give"]


# ---------------------------------------------------------------- 抠图原语

def key(img, lo=KEY_LO, hi=KEY_HI, despill=DESPILL):
    """洋红键：mag = min(r,b) - g。与 prep_icons / prep_interact 同一套配方。"""
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


def despill_pass(img, amount=DESPILL):
    """缩放之后再过一遍 despill。

    为什么需要第二次：LANCZOS 会把边缘那 1~2px 半洋红像素与邻居混色，
    把本来已经被压下去的紫重新抬出来（实测重采样后残留 18px / 10 张）。
    这里只动 mag>6 的像素，金色与青铜绿不受影响。
    """
    a = np.array(img).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    pur = (np.minimum(r, b) - g) > 6
    a[..., 0] = np.where(pur, np.minimum(a[..., 0], a[..., 1] + amount), a[..., 0])
    a[..., 2] = np.where(pur, np.minimum(a[..., 2], a[..., 1] + amount), a[..., 2])
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def trim(img, pad=0):
    bb = img.split()[3].getbbox()
    if not bb:
        return img
    x0, y0, x1, y1 = bb
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(img.width, x1 + pad), min(img.height, y1 + pad)
    return img.crop((x0, y0, x1, y1))


# ---------------------------------------------------------------- 连通域

def flood(mask, sy, sx):
    """从 (sy,sx) 出发取 4 邻接连通域。纯 numpy + Python 栈，不引 scipy。"""
    h, w = mask.shape
    out = np.zeros((h, w), bool)
    if not (0 <= sy < h and 0 <= sx < w) or not mask[sy, sx]:
        return out
    stack = [(sy, sx)]
    out[sy, sx] = True
    while stack:
        y, x = stack.pop()
        if y > 0 and mask[y - 1, x] and not out[y - 1, x]:
            out[y - 1, x] = True
            stack.append((y - 1, x))
        if y + 1 < h and mask[y + 1, x] and not out[y + 1, x]:
            out[y + 1, x] = True
            stack.append((y + 1, x))
        if x > 0 and mask[y, x - 1] and not out[y, x - 1]:
            out[y, x - 1] = True
            stack.append((y, x - 1))
        if x + 1 < w and mask[y, x + 1] and not out[y, x + 1]:
            out[y, x + 1] = True
            stack.append((y, x + 1))
    return out


def seed_near(mask, cy, cx, radius=400):
    """在 (cy,cx) 附近找最近的种子像素（逐圈外扩）。盘心是实心锈面，通常第一圈就中。"""
    h, w = mask.shape
    for r in range(0, radius, 8):
        y0, y1 = max(0, cy - r), min(h, cy + r + 1)
        x0, x1 = max(0, cx - r), min(w, cx + r + 1)
        sub = mask[y0:y1, x0:x1]
        if sub.any():
            ys, xs = np.nonzero(sub)
            k = int(np.argmin((ys + y0 - cy) ** 2 + (xs + x0 - cx) ** 2))
            return int(ys[k] + y0), int(xs[k] + x0)
    return None


def keep_big_blobs(img, min_area=MIN_BLOB):
    """丢掉小于 min_area 的碎块（邻格残片 / 没抠净的孤立点）。

    按**面积**筛，不按「只留最大块」筛 —— 纹样里同一个图案可能由多笔分开的块组成
    （`drop` 就是箭头 + 羽毛两块，`jump` 的太阳芒也是散点）。
    """
    a = np.array(img)
    mask = a[..., 3] > A_SOFT
    keep = np.zeros_like(mask)
    visited = np.zeros_like(mask)
    for y, x in zip(*np.nonzero(mask)):
        if visited[y, x]:
            continue
        blob = flood(mask, int(y), int(x))
        visited |= blob
        if blob.sum() >= min_area:
            keep |= blob
    dropped = int((mask & ~keep).sum())
    a[..., 3] = np.where(keep, a[..., 3], 0)
    return Image.fromarray(a, "RGBA"), dropped


# ---------------------------------------------------------------- 切格

def snap_cuts(prof, n, frac=0.35, min_size=60):
    """把每个期望切点吸附到窗口内投影最低处（= 最宽的空白列/行），避免切到图案。"""
    L = len(prof)
    cuts = [0]
    for i in range(1, n):
        guess = int(L * i / n)
        lo = max(cuts[-1] + min_size, guess - int(L / n * frac))
        hi = min(L - min_size, guess + int(L / n * frac))
        if hi <= lo:
            cuts.append(guess)
            continue
        cuts.append(lo + int(np.argmin(prof[lo:hi])))
    cuts.append(L)
    return cuts


def split_cells(img, rows, cols):
    al = np.array(img.split()[3])
    colp = (al > A_SOFT).sum(axis=0)
    rowp = (al > A_SOFT).sum(axis=1)
    xs = snap_cuts(colp, cols)
    ys = snap_cuts(rowp, rows)
    return [(xs[c], ys[r], xs[c + 1], ys[r + 1])
            for r in range(rows) for c in range(cols)], xs, ys


# ---------------------------------------------------------------- 盘体本体

def plate_body_box(img, label):
    """量出盘体**本体**的包围盒，返回 (cx, cy, side, 诊断串)。

    判据（不靠肉眼，逐条可复核）：

    1) 先取最大连通前景块（以格心为种子）。盘子与暗影是连通的，所以这一步清不掉暗影
       —— 它的真正作用是丢掉井格边缘的碎屑、以及把「盘」和「散落的高光点」分开。

    2) 「暗影 alpha 更低」这条**在本批图上不成立**（见文件头）：暗影是不透明的深棕，
       所以 alpha 阈值分不出本体。放弃这条。

    3) 用**形状的竖直对称性**：源图里两张盘都是竖直等轴的形状（左正圆、
       右等边圆角方），而生图把暗影只画在**下缘**，上轮廓干净。于是：
         · 横向本体宽度 W = 「最宽行」的列跨度 —— 暗影只会往下溢出，
           永远不会比赤道（/直边段）更宽，所以 W 与暗影无关；
         · 纵向镜像高 H = 2 × (最宽行的中位 y − 最上行 y)，**只用来交叉校验**。
       取本体边长 S = W。实测左盘 W=579/H=579、右盘 W=555/H=550，
       差异来自下缘暗影与圆角方盘上下圆角不完全对称；全 alpha 包围盒只比 W 大 1~8px，
       所以这条判据**不会把盘压小**（若按含影包围盒缩，盘体会小 0.5~1.5%）。

    4) 本体中心 = (W 的中点, 最宽行的中位 y)。S 表达成边长正方形（圆与等边方盘一致）。
    """
    a = np.array(img)
    mask = a[..., 3] > A_SOFT
    sy, sx = seed_near(mask, img.height // 2, img.width // 2)
    if sy is None:
        print(f"  ⚠️ {label}: 找不到前景种子，退回全 alpha 包围盒")
        bb = img.split()[3].getbbox()
        return ((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2,
                max(bb[2] - bb[0], bb[3] - bb[1]), "fallback")
    body = flood(mask, sy, sx)
    ys, xs = np.nonzero(body)

    spans = np.zeros(body.shape[0], np.int32)
    for y in range(ys.min(), ys.max() + 1):
        col = np.nonzero(body[y])[0]
        if len(col):
            spans[y] = col.max() - col.min() + 1
    W = int(spans.max())
    wide = np.nonzero(spans == W)[0]
    cy = float(np.median(wide))
    row = np.nonzero(body[int(round(cy))])[0]
    cx = float((row.min() + row.max()) / 2)
    H = 2.0 * (cy - float(ys.min()))
    diag = (f"最宽行跨度 W={W}  镜像高 H={H:.0f}  全包围盒 "
            f"{xs.max()-xs.min()+1}x{ys.max()-ys.min()+1}"
            f"  → 下缘暗影溢出仅 {ys.max()-ys.min()+1-W:+.0f}px（纵向）")
    return cx, cy, float(W), diag


# ---------------------------------------------------------------- 归一 + 落盘

def blit(dst, src, left, top):
    """把 src 贴到 dst（允许负偏移；越界部分裁掉 —— 盘外那圈暗影就是这么被吃掉的）。"""
    x0, y0 = max(0, -left), max(0, -top)
    dx, dy = max(0, left), max(0, top)
    w = min(src.width - x0, dst.width - dx)
    h = min(src.height - y0, dst.height - dy)
    if w <= 0 or h <= 0:
        return
    dst.alpha_composite(src.crop((x0, y0, x0 + w, y0 + h)), (dx, dy))


def normalize(img, cx, cy, body_side, target, canvas=CANVAS):
    """把「本体」等比缩到 target 像素，本体中心落在 canvas 中心。
    缩放比只由 body_side 决定 —— 这正是「不被外挂暗影带偏」的地方。"""
    s = target / body_side
    nw = max(1, round(img.width * s))
    nh = max(1, round(img.height * s))
    rs = img.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    blit(out, rs, int(round(canvas / 2 - cx * s)), int(round(canvas / 2 - cy * s)))
    return despill_pass(out)


def save(img, name):
    p = DST / name
    img.save(p, "WEBP", quality=QUALITY, method=METHOD)
    print(f"  {name:22s} {p.stat().st_size / 1024:6.1f} KB  {img.width}x{img.height}")
    return p


# ---------------------------------------------------------------- 量盘体 / 裁切盒

def body_span(img, thr=A_SOFT):
    """量盘体在画布里的实际横向外径（最大连通块的最宽行跨度）。
    不量 alpha 包围盒 —— 盘外那圈暗影会把它撑大，那不是盘体。"""
    mask = np.array(img)[..., 3] > thr
    sy, sx = seed_near(mask, img.height // 2, img.width // 2)
    body = flood(mask, sy, sx)
    ys, xs = np.nonzero(body)
    W = 0
    for y in range(ys.min(), ys.max() + 1):
        col = np.nonzero(body[y])[0]
        if len(col):
            W = max(W, col.max() - col.min() + 1)
    return W, body


def clip_mask(canvas, round_radius_frac):
    """复刻 UI 侧裁切盒：`border-radius:50%`（frac=0.5 → 正圆）或方盘 26% 圆角。"""
    m = Image.new("L", (canvas, canvas), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [0, 0, canvas - 1, canvas - 1], radius=int(round(round_radius_frac * canvas)), fill=255)
    return np.array(m) > 0


def corner_frac(img):
    """实测方盘圆角半径占边长的比例：用「左直边覆盖的行数」反推。
    圆角方盘（squircle）的竖直轮廓 = 直边段 + 上下两段圆角，故 半径 ≈ (边长 − 直边长)/2。"""
    mask = np.array(img)[..., 3] > A_SOFT
    sy, sx = seed_near(mask, img.height // 2, img.width // 2)
    body = flood(mask, sy, sx)
    ys, xs = np.nonzero(body)
    xmin = xs.min()
    straight = [y for y in range(ys.min(), ys.max() + 1)
                if body[y].any() and np.nonzero(body[y])[0].min() == xmin]
    side = xs.max() - xs.min() + 1
    return (side - len(straight)) / 2.0 / side


# ---------------------------------------------------------------- 主流程

print("=== 青铜盘 2 格（源图两张并排，按列投影在中间空隙切）===")
plate_src = key(Image.open(SRC / "touch-plate.png"))
plate_cells, pxs, _ = split_cells(plate_src, 1, 2)
print(f"  列投影切点 x = {pxs}（源图宽 {plate_src.width}，两张盘中缝）")
plates = []
for (x0, y0, x1, y1), name in zip(plate_cells, ["plate", "plate-sq"]):
    cell = plate_src.crop((x0, y0, x1, y1))
    cx, cy, S, diag = plate_body_box(cell, name)
    print(f"  {name}: 源格 {x1-x0}x{y1-y0}  {diag}")
    target = int(round(CANVAS * PLATE_FILL))
    out = normalize(cell, cx, cy, S, target)
    W, _ = body_span(out)
    # 归一后偏差 >3% 就用实测值反算重来一次（只重算一次）
    dev = (W - target) / target
    if abs(dev) > 0.03:
        print(f"    ⚠️ 首轮盘体外径 {W}px 偏离目标 {target}px（{dev*100:+.2f}%），"
              f"按实测值反算 S={S*W/target:.1f} 重算一次")
        out = normalize(cell, cx, cy, S * W / target, target)
        W, _ = body_span(out)
        print(f"    重算后盘体外径 {W}px")
    plates.append((name, out, S))

print("=== 金线纹样 4x2 ===")
glyph_src = key(Image.open(SRC / "touch-glyphs.png"))
glyph_cells, gxs, gys = split_cells(glyph_src, 2, 4)
print(f"  列投影切点 x = {gxs}")
print(f"  行投影切点 y = {gys}")
glyphs = []
for i, (x0, y0, x1, y1) in enumerate(glyph_cells):
    cell = glyph_src.crop((x0, y0, x1, y1))
    cell, dropped = keep_big_blobs(cell)
    cell = trim(cell)
    bb = cell.split()[3].getbbox()
    cx = (bb[0] + bb[2]) / 2
    cy = (bb[1] + bb[3]) / 2
    long_side = max(bb[2] - bb[0], bb[3] - bb[1])
    out = normalize(cell, cx, cy, long_side, int(round(CANVAS * GLYPH_FILL)))
    glyphs.append((GLYPHS[i], out))
    print(f"  {GLYPHS[i]:6s} 源格 {x1-x0}x{y1-y0}  本体 {bb[2]-bb[0]}x{bb[3]-bb[1]}"
          f"（长边 {long_side}）  丢碎屑 {dropped}px")

print("=== 写盘 ===")
files = [(name + ".webp", img, save(img, name + ".webp")) for name, img, _ in plates]
files += [("glyph-" + name + ".webp", img, save(img, "glyph-" + name + ".webp"))
          for name, img in glyphs]

# ---------------------------------------------------------------- 验收

print("=== 验收：盘体占比 + 裁切盒切角损失 ===")
for name, img, src_side in plates:
    W, body = body_span(img)
    ratio = W / img.width
    dev = (ratio - PLATE_FILL) / PLATE_FILL
    tag = "OK" if abs(dev) <= 0.03 else "⚠️ 超差 >3%"
    frac = 0.5 if name == "plate" else SQ_RADIUS_HINT
    cm = clip_mask(CANVAS, frac)
    lost = int((body & ~cm).sum())     # 裁切盒会切掉的盘体像素（应为 0）
    print(f"  {name + '.webp':22s} 盘体外径 {W}px  占比 {ratio*100:5.2f}%"
          f"（目标 {PLATE_FILL*100:.0f}%，偏差 {dev*100:+.2f}% {tag}）"
          f"  源本体边长 {src_side:.0f}"
          f"  border-radius {frac*100:.0f}% 裁切掉盘体 {lost} px")
    if name == "plate-sq":
        cf = corner_frac(img)
        print(f"  {'plate-sq.webp':22s} 实测圆角半径 ≈ {cf*100:.1f}% 边长"
              f"（UI 用了 {SQ_RADIUS_HINT*100:.0f}%，更小 = 更方，故不会切到金边）")

print("=== 验收：洋红残留 ===")
bad_total = 0
for p in sorted(glob.glob(str(DST / "*.webp"))):
    a = np.array(Image.open(p).convert("RGBA")).astype(np.int16)
    m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    bad = int(((m > 40) & (a[..., 3] > 20)).sum())
    bad_total += bad
    print(f"  {Path(p).name:22s} 洋红残留 {bad}")
print(f"  合计洋红残留 {bad_total}")

print("=== 验收：体积 ===")
PLATE_MAX, GLYPH_MAX = 60, 20
over = 0
for nm, img, p in files:
    kb = p.stat().st_size / 1024
    cap = PLATE_MAX if nm.startswith("plate") else GLYPH_MAX
    flag = "" if kb < cap else f"  ⚠️ 超 {cap}KB"
    over += 0 if kb < cap else 1
    print(f"  {nm:22s} {kb:6.1f} KB / 上限 {cap} KB{flag}")
tot = sum(p.stat().st_size for _, _, p in files) / 1024
print(f"  合计 {tot:.1f} KB / {len(files)} 个文件")
if over:
    print(f"  ⚠️ {over} 个文件超预算")

# ---------------------------------------------------------------- 合成预览自检

print("=== 合成预览（深色底 #14110c + 金色按下态 #f5d98e，64px / 40px 两档）===")
BG = [(0x14, 0x11, 0x0C), (0xF5, 0xD9, 0x8E)]
tiles = [(n, im) for n, im, _ in plates] + [(n, im) for n, im in glyphs]   # 10 个全上
PAD = 8
SIZES = (64, 40)                      # 两档真实键面尺寸（键径 48~84px 的上下界附近）
colw = max(SIZES) + PAD * 2
sheet_w = colw * len(tiles) + PAD
sheet_h = sum((s + PAD) * len(BG) for s in SIZES) + PAD
sheet = Image.new("RGB", (sheet_w, sheet_h), (0, 0, 0))
x = PAD
for nm, im in tiles:
    # 盘走真实裁切盒（圆盘 50%，方盘 26%）；纹样键没有圆角裁切，直接贴
    frac = 0.5 if nm == "plate" else (SQ_RADIUS_HINT if nm == "plate-sq" else None)
    y = PAD
    for size in SIZES:
        small = im.resize((size, size), Image.LANCZOS)
        clip = np.array(clip_mask(size, frac)) > 0 if frac is not None else None
        for bgc in BG:
            base = Image.new("RGB", (size, size), bgc)
            base.paste(small, (0, 0), small)
            if clip is not None:
                arr = np.array(base)
                arr[~clip] = bgc
                base = Image.fromarray(arr)
            sheet.paste(base, (x, y))
            y += size + PAD
    x += colw

pp = Path(tempfile.gettempdir()) / "touch-preview.png"
sheet.save(pp)
print(f"  预览：{pp}  ({sheet.width}x{sheet.height})"
      f"  列顺序：plate, plate-sq, 然后 8 个 glyph")
