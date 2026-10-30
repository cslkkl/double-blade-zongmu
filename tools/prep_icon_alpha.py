#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把一张方底图标源图抠成透明底，并生成整套尺寸（16 → 512 + apple-touch-icon + favicon.ico）。

为什么不能用纯色键 —— 主体内部可能有与背景同色的像素
=====================================================
旧版 512 母版（assets/icon/icon-512.png）实测：面具本体内部（眼窝深处、下颌阴影、
鼻孔/耳孔）存在与四边背景色 (24,16,9) 欧氏距离 **为 0** 的像素。只要用"颜色接近
背景就置透明"这种纯色键，这些暗部会被一并判成背景，**面具当场被挖穿**。
洋红底同理：新图虽然用一个不相干的颜色当底，但主体里完全可能出现低
`min(R,B)-G` 的暗紫阴影。

所以这里走"连通域 + 轮廓填充"，不是单纯的颜色键：

  1. 先按颜色判据得到"确定是主体"的核心像素（下称 alpha0）；
  2. `scipy.ndimage.label` 标记 alpha0 连通域；含中心点的是主体，
     其余面积 > 200px 的连通域是金环、耳饰、光环等外围元素；
  3. 只对【主体】连通域做 `binary_fill_holes` —— 内部同色暗区重新变成不透明，
     主体轮廓完整；眼睛/嘴的正确形状靠"本来就是亮的"那些像素撑着，
     而不是靠颜色判断；
  4. 【外围元素不填洞】—— 金环是圆环，`fill_holes` 会把它糊成一枚金盘；
  5. alpha = 255 于（主体剪影 ∪ 外围元素），其余 0；
  6. 边缘羽化：alpha 轻微高斯 sigma=0.6 再 clip，避免锯齿；
     再从 512 母版用 LANCZOS 下采样出其余尺寸。

两种底
======
`--bg dark`     近黑平底：判据是到背景色的 RGB 欧氏距离 `d > T`。
`--bg magenta`  纯洋红平底：判据是 `m = min(R,B) - G`（与 tools/slice_anim.py
                同一套口径 lo=45 / hi=115），并做 despill —— 洋红底不压溢色，
                边缘会留一圈紫（见 tools/README.md）。
`--bg auto`     读四边 4px 中位色自己判断（默认）。

已知边界（深色底）
------------------
如果主体的深色描边与背景几乎同色（旧 512 母版就是：描边 rgb≈(23,16,8)，
到背景距离 d≈0～2，远低于 T=31），那条描边本身就落在"背景"里，`fill_holes`
补不回来 —— 它不是一个封闭的洞，而是一条通向画外的暗道。`--close <r>`
可以用半径 r 的圆盘闭运算把细缝先缝合再填洞，能救回一部分，但缝宽超过 2r
就无效。**所以新图优先用洋红底**：深色中性描边的 m=min(R,B)-G ≈ 0，
天然属于主体核心，不存在这个问题。

用法
====
  python tools/prep_icon_alpha.py                       # 读 assets/icon/_src.png，写 assets/icon/
  python tools/prep_icon_alpha.py --src path/to/x.png   # 换源图
  python tools/prep_icon_alpha.py --bg magenta          # 强制洋红底
  python tools/prep_icon_alpha.py --src a.png --out-dir .tmp/dry   # 只出到别处，不动 assets/

幂等性
======
所有产物都从 `--src` 重新算，不读上一轮的产物，因此可以反复跑；
同一张源图跑两次，输出字节级一致（缩放的 RGB 走颜色外扩，不吃上一轮的残色）。
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

# 脚本位置反推仓库根，不写死任何盘符/绝对路径。
ROOT = Path(__file__).resolve().parent.parent

DEFAULT_SRC = ROOT / "assets" / "icon" / "_src.png"
DEFAULT_OUT = ROOT / "assets" / "icon"
DEFAULT_PREVIEW = ROOT / ".tmp"

# ---- 深色底 ----------------------------------------------------------------
# 背景判定阈值（RGB 欧氏距离）。旧 512 母版实测 T 从 24 走到 40，前景占比只从
# 0.3845 变到 0.3768，说明背景与主体分得很开，31 落在中间最稳。
DEFAULT_T = 31.0

# ---- 洋红底（与 tools/slice_anim.py 的 ALPHA_ZERO / ALPHA_FULL / DEFRINGE 同值）
MAG_ALPHA_ZERO = 45.0   # m < 45  -> 完全主体
MAG_ALPHA_FULL = 115.0  # m > 115 -> 完全背景
DESPILL = 34            # 半透明边缘把 R,B 压到 G+34 以内
MIN_RAMP = 8            # 洋红软边的 alpha 下限，低于它算背景噪点

# 外围元素（金环 / 耳饰）的最小连通域面积，滤掉噪点与孤立高光。
MIN_OUTER_AREA = 200

# 母版边缘羽化强度。
FEATHER_SIGMA = 0.6

# 洋红像素判据（用于 --bg auto）
MAGENTA_MIN_M = 100.0

SIZES = (16, 32, 48, 64, 128, 180, 192, 256, 512)
ICO_SIZES = ((16, 16), (32, 32), (48, 48))

SIZE_LIMITS = {"icon-512.png": 300 * 1024}
SMALL_LIMIT = 3 * 1024  # 16 / 32


# --------------------------------------------------------------- 颜色基础


def edge_median(rgb: np.ndarray, band: int = 4) -> np.ndarray:
    """四边 band 像素带的中位色 = 背景色。"""
    strips = [
        rgb[0:band].reshape(-1, 3),
        rgb[-band:].reshape(-1, 3),
        rgb[:, 0:band].reshape(-1, 3),
        rgb[:, -band:].reshape(-1, 3),
    ]
    return np.median(np.concatenate(strips, axis=0), axis=0)


def magenta_metric(rgb: np.ndarray) -> np.ndarray:
    """洋红度量 m = min(R,B) - G。纯洋红约 255，青铜/金/玉都在 45 以下。"""
    r = rgb[:, :, 0]
    g = rgb[:, :, 1]
    b = rgb[:, :, 2]
    return np.minimum(r, b) - g


def detect_bg_mode(rgb: np.ndarray) -> str:
    bg = edge_median(rgb)
    m = float(np.minimum(bg[0], bg[2]) - bg[1])
    return "magenta" if m > MAGENTA_MIN_M else "dark"


# --------------------------------------------------------------- 抠图核心


def disk_structure(radius: int) -> np.ndarray:
    """半径 radius 的圆盘结构元，用于可选闭运算。"""
    y, x = np.ogrid[-radius : radius + 1, -radius : radius + 1]
    return x * x + y * y <= radius * radius


def _split_components(fg0: np.ndarray, center_id: int):
    """分离主体连通域与外围元素。返回 (face_raw, outer_keep, kept_ids)。"""
    labels, _n = ndimage.label(fg0)
    if center_id not in labels:
        raise SystemExit("中心点不在前景里：阈值过严，请调小 --t 后重试")
    face_raw = labels == center_id
    total = labels.max() + 1
    areas = ndimage.sum(fg0, labels, range(total))

    outer = np.zeros_like(fg0)
    kept = []
    for cid in range(1, total):
        if cid == center_id:
            continue
        area = float(areas[cid])
        if area <= MIN_OUTER_AREA:
            continue
        outer |= labels == cid
        kept.append((cid, int(area)))
    kept.sort(key=lambda kv: -kv[1])
    return face_raw, outer, kept


def key_dark(rgb: np.ndarray, t: float, close: int = 0) -> tuple[np.ndarray, np.ndarray, dict]:
    """近黑底：alpha0 = 到背景色的欧氏距离 > T。返回 (silhouette01, ramp01, info)。"""
    bg = edge_median(rgb)
    d = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    fg0 = d > t
    if not fg0.any():
        raise SystemExit("整图都在阈值内：T 太大或背景不纯，请调小 --t")

    h, w = fg0.shape
    labels, _n = ndimage.label(fg0)
    center_id = int(labels[h // 2, w // 2])
    if center_id == 0:
        raise SystemExit("中心点是背景：阈值 T 太小或主体偏心，请调大 --t")

    face_raw, outer, kept = _split_components(fg0, center_id)
    if close > 0:
        # 可选：先把同色细缝缝合再填洞（深色描边与背景同色时的补救手段）
        disk = disk_structure(close)
        face_raw = ndimage.binary_closing(face_raw, structure=disk)
    face_sil = ndimage.binary_fill_holes(face_raw)
    silk = face_sil | outer

    info = {
        "mode": "dark",
        "bg": tuple(int(round(v)) for v in bg),
        "param": f"T={t:.0f}",
        "fg_fraction": float(fg0.mean()),
        "face_raw": int(face_raw.sum()),
        "face_filled": int(face_sil.sum()),
        "holes": int(face_sil.sum() - face_raw.sum()),
        "outer": kept,
        "outer_area": int(outer.sum()),
        "soft_frac": 0.0,
    }
    ramp = silk.astype(np.float64)
    return silk.astype(np.float64), ramp, info


def key_magenta(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, dict]:
    """纯洋红底：m=min(R,B)-G，m<45 为主体核心，45~115 是软边，>115 是背景。"""
    m = magenta_metric(rgb)
    core = m <= MAG_ALPHA_ZERO
    if not core.any():
        raise SystemExit("没有像素满足 m<=45：这不是洋红底，换 --bg dark 试试")

    h, w = core.shape
    labels, _n = ndimage.label(core)
    center_id = int(labels[h // 2, w // 2])
    if center_id == 0:
        raise SystemExit("中心点是洋红：主体偏心或图太小，请换 --bg")

    face_raw, outer, kept = _split_components(core, center_id)
    face_sil = ndimage.binary_fill_holes(face_raw)
    silk = face_sil | outer

    # 被填洞补回来的像素：alpha 变成 255 了，但 RGB 还是洋红。
    # 这些像素必须换成邻近主体色，否则成品中间会顶着一块纯洋红（旧深色底
    # 没有这个问题 —— 那里洞内本来就是深色，补回来正好是暗部）。
    hole_fill = face_sil & ~face_raw

    # 软边：m 在 45~115 之间的是主体与洋红混合的过渡像素，给部分 alpha。
    ramp = np.clip(
        (MAG_ALPHA_FULL - m) / (MAG_ALPHA_FULL - MAG_ALPHA_ZERO), 0.0, 1.0
    )
    # 洋红底里可能散布低 m 的噪点；只保留「贴着主体」或「自己够大」的软边。
    near = ndimage.binary_dilation(silk, iterations=3)
    band = (ramp * 255.0) > MIN_RAMP
    rl, rn = ndimage.label(band)
    rareas = ndimage.sum(band, rl, range(rn + 1))
    keep_ramp = np.zeros_like(band)
    for cid in range(1, rn + 1):
        comp = rl == cid
        if (comp & near).any() or float(rareas[cid]) > MIN_OUTER_AREA:
            keep_ramp |= comp
    ramp = ramp * keep_ramp

    info = {
        "mode": "magenta",
        "bg": tuple(int(round(v)) for v in edge_median(rgb)),
        "param": f"m: {MAG_ALPHA_ZERO:.0f}→{MAG_ALPHA_FULL:.0f}",
        "fg_fraction": float(core.mean()),
        "face_raw": int(face_raw.sum()),
        "face_filled": int(face_sil.sum()),
        "holes": int(face_sil.sum() - face_raw.sum()),
        "outer": kept,
        "outer_area": int(outer.sum()),
        "soft_frac": float(((ramp > 0) & (ramp < 1)).mean()),
        "hole_fill": hole_fill,
        "color_src": core & silk,
    }
    return silk.astype(np.float64), ramp, info


def inpaint_from(
    rgb: np.ndarray, mask: np.ndarray, src: np.ndarray, erode: int = 4
) -> np.ndarray:
    """把 mask 区域的 RGB 换成最近 src 像素的颜色。

    用于「被 fill_holes 补回来的洞」：洞内原色是背景（洋红），填成主体
    邻近色后面具才不穿孔。

    src 先向内腐蚀 erode 像素：紧贴洞边的那些"核心"像素本来就是主体与洋红
    的混色（一片紫），直接当颜色源会把洞填成紫色。腐蚀到只剩很小的区域时
    退回未腐蚀版本，避免主体太细时无源可用。
    """
    if not mask.any() or not src.any():
        return rgb
    source = src
    if erode > 0:
        eroded = ndimage.binary_erosion(src, iterations=erode)
        if eroded.sum() > max(64, int(0.2 * src.sum())):
            source = eroded
    idx = ndimage.distance_transform_edt(
        ~source, return_distances=False, return_indices=True
    )
    out = rgb.copy()
    out[mask] = rgb[idx[0][mask], idx[1][mask]]
    # 外扩是辐射状条纹，轻微高斯抹一下过渡（只取回 mask 内的结果）
    smooth = ndimage.gaussian_filter(out.astype(np.float64), sigma=(3.0, 3.0, 0))
    out[mask] = np.clip(np.rint(smooth[mask]), 0, 255).astype(np.int16)
    return out


def decontaminate(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """边缘去色：把半透明像素的 RGB 换成最近的不透明像素颜色。

    比"R、B 压到 G+34"更彻底：洋红与主体按 50% 混出来的是 (158,59,173)，
    压到 G+34 之后仍然是一片暗紫（这正是 tools/README.md 里"边缘一圈紫"的
    来源，只是通常软边只 1~2px 宽，肉眼放过）。改用颜色外扩后，边缘 alpha
    保留、颜色干净。
    """
    opaque = alpha >= 250
    if not opaque.any():
        return rgb
    edge = alpha < 250
    if not edge.any():
        return rgb
    idx = ndimage.distance_transform_edt(
        ~opaque, return_distances=False, return_indices=True
    )
    out = rgb.copy()
    out[edge] = rgb[idx[0][edge], idx[1][edge]]
    return out


def combine_alpha(silk: np.ndarray, ramp: np.ndarray) -> np.ndarray:
    """剪影内部一律 255，外部取软边 ramp（洋红底才有非零）。"""
    return np.clip(np.maximum(silk, ramp), 0.0, 1.0)


def feather(alpha01: np.ndarray, sigma: float = FEATHER_SIGMA) -> np.ndarray:
    if sigma <= 0:
        return np.clip(np.rint(alpha01 * 255.0), 0, 255).astype(np.uint8)
    blurred = ndimage.gaussian_filter(alpha01, sigma=sigma)
    return np.clip(np.rint(blurred * 255.0), 0, 255).astype(np.uint8)


def despill_rgb(rgb: np.ndarray, alpha: np.ndarray, cap_delta: int = DESPILL) -> np.ndarray:
    """洋红溢色：半透明边缘把 R、B 压到 G+cap_delta 以内，否则边缘一圈紫。"""
    out = rgb.copy()
    edge = (alpha > 0) & (alpha < 250)
    g = out[:, :, 1]
    cap = g + cap_delta
    out[:, :, 0] = np.where(edge, np.minimum(out[:, :, 0], cap), out[:, :, 0])
    out[:, :, 2] = np.where(edge, np.minimum(out[:, :, 2], cap), out[:, :, 2])
    return out


# ------------------------------------------------------------ 缩放 / 输出


def bleed_colors(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """透明区的 RGB 换成最近的不透明像素颜色（颜色外扩）。

    不做这步，LANCZOS 下采样会把透明区残留的底色（近黑或洋红）混进边缘，
    小尺寸上表现为一圈脏边。
    """
    opaque = alpha > 0
    if not opaque.any() or opaque.all():
        return rgb
    idx = ndimage.distance_transform_edt(
        ~opaque, return_distances=False, return_indices=True
    )
    return rgb[idx[0], idx[1]]


def resize_rgba(img: Image.Image, size: int, hard_alpha: bool = False) -> Image.Image:
    """缩放。`hard_alpha` 用于 ≤32 的极小尺寸。

    极小尺寸必须给**硬边**：羽化过的 alpha 在 16px 上只有 1px 宽，与深色描边
    混在一起，在白底上读成一圈灰边（实测）。二值化之后是干净的像素台阶，
    比"柔和的灰边"清楚得多 —— 这也是各家 favicon 在 16px 上的通行做法。
    """
    rgb = np.asarray(img.convert("RGB"))
    alpha = np.asarray(img.getchannel("A"))
    rgb_bl = bleed_colors(rgb, alpha)
    rgb_img = Image.fromarray(rgb_bl, "RGB").resize((size, size), Image.LANCZOS)
    a_img = Image.fromarray(alpha, "L").resize((size, size), Image.LANCZOS)
    if hard_alpha:
        a = np.asarray(a_img)
        a_img = Image.fromarray(np.where(a >= 128, 255, 0).astype(np.uint8), "L")
    out = rgb_img.convert("RGBA")
    out.putalpha(a_img)
    return out


def sharpen_small(img: Image.Image) -> Image.Image:
    """≤32 的尺寸单独锐化一次（只锐 RGB，不动 alpha，免得 alpha 振铃出锯齿）。"""
    rgb = img.convert("RGB").filter(
        ImageFilter.UnsharpMask(radius=0.8, percent=70, threshold=0)
    )
    out = rgb.convert("RGBA")
    out.putalpha(img.getchannel("A"))
    return out


def zero_transparent_rgb(img: Image.Image) -> Image.Image:
    """把 alpha=0 处的 RGB 抹成 0：大幅提高 PNG 压缩率（透明区的杂色没信息量）。"""
    arr = np.array(img.convert("RGBA"))
    arr[arr[:, :, 3] == 0] = 0
    return Image.fromarray(arr, "RGBA")


def posterize(img: Image.Image, bits: int = 6, alpha_bits: int = 7) -> Image.Image:
    """按位截断（PNG 无有损模式，小尺寸上这是最省事又不出彩边的降体积手段）。"""
    arr = np.array(img.convert("RGBA"))
    rgb_mask = (0xFF << (8 - bits)) & 0xFF
    a_mask = (0xFF << (8 - alpha_bits)) & 0xFF
    arr[..., :3] &= rgb_mask
    arr[..., 3] &= a_mask
    return Image.fromarray(arr, "RGBA")


def save_png(img: Image.Image, path: Path, limit: int | None = None) -> tuple[int, str]:
    """存 PNG。超预算就按阶梯压：抹零透明区 RGB → 降位深。返回 (字节数, 用了哪档)。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format="PNG", optimize=True)
    n = path.stat().st_size
    if limit is None or n <= limit:
        return n, ""

    zero_transparent_rgb(img).save(path, format="PNG", optimize=True)
    n2 = path.stat().st_size
    if n2 <= limit:
        return n2, "透明区RGB抹零"
    if n2 < n:
        n = n2
    for bits in (6, 5):
        cand = posterize(zero_transparent_rgb(img), bits=bits)
        cand.save(path, format="PNG", optimize=True)
        n3 = path.stat().st_size
        if n3 <= limit:
            return n3, f"透明区RGB抹零+R/G/B降{bits}位"
        if n3 < n:
            n = n3
    # 全都不达标：留最小的那版，让体积自检如实报 FAIL
    posterize(zero_transparent_rgb(img), bits=4).save(path, format="PNG", optimize=True)
    return path.stat().st_size, "降4位（仍超预算）"


def composite(img: Image.Image, color: str) -> Image.Image:
    bg = Image.new("RGBA", img.size, color)
    return Image.alpha_composite(bg, img).convert("RGB")


def zero_fraction(img: Image.Image) -> float:
    return float((np.asarray(img.getchannel("A")) == 0).mean())


def normalize_square(img: Image.Image, margin: float = 0.04) -> Image.Image:
    """裁到不透明包围盒 → 居中补成正方形（透明补齐）。源图不是方图时才会用到。"""
    bb = img.getchannel("A").getbbox()
    if not bb:
        return img
    content = img.crop(bb)
    side = int(round(max(content.width, content.height) * (1.0 + 2 * margin)))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(content, ((side - content.width) // 2, (side - content.height) // 2))
    return canvas


# ------------------------------------------------------------------ main


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="图标源图 → 透明底 + 全套尺寸",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--src", type=Path, default=DEFAULT_SRC, help="源图（默认 assets/icon/_src.png）")
    p.add_argument(
        "--micro-src",
        type=Path,
        default=None,
        help="小尺寸专用源图（更简化的版本）。给了就由它出 <= --micro-max 的尺寸",
    )
    p.add_argument(
        "--micro-max",
        type=int,
        default=48,
        help="小尺寸源图接管的边长上限，含（默认 48）",
    )
    p.add_argument("--out-dir", type=Path, default=DEFAULT_OUT, help="输出目录（默认 assets/icon/）")
    p.add_argument("--preview-dir", type=Path, default=DEFAULT_PREVIEW, help="预览目录（默认 .tmp/）")
    p.add_argument(
        "--bg",
        choices=("auto", "dark", "magenta"),
        default="auto",
        help="底色类型（默认 auto：按四边中位色判断）",
    )
    p.add_argument("--t", type=float, default=DEFAULT_T, help="深色底阈值 T（默认 31）")
    p.add_argument(
        "--close",
        type=int,
        default=0,
        help="深色底可选：半径 r 的圆盘闭运算，先把同色细缝缝合再填洞（默认 0 关闭）",
    )
    p.add_argument("--sigma", type=float, default=FEATHER_SIGMA, help="边缘羽化 sigma（默认 0.6）")
    p.add_argument("--no-sharpen", action="store_true", help="不对 16/32 做 UnsharpMask")
    p.add_argument("--no-previews", action="store_true", help="不出白底/黑底预览")
    p.add_argument("--require-zero", type=float, default=0.50, help="512 的 alpha=0 占比下限（默认 0.5）")
    return p.parse_args(argv)


def prepare_master(
    src_path: Path, mode: str, t: float, close: int, sigma: float, label: str
) -> tuple[Image.Image, dict]:
    """读源图 → 抠图 → despill → 512 母版。返回 (master, info)。

    两级图标共用这一个函数：`label` 只用于打印，方便分辨"主体版 / 小尺寸简化版"。
    """
    src = Image.open(src_path).convert("RGBA")
    src_rgb = np.asarray(src.convert("RGB")).astype(np.float64)

    real_mode = mode if mode != "auto" else detect_bg_mode(src_rgb)
    if real_mode == "magenta":
        silk, ramp, info = key_magenta(src_rgb)
    else:
        silk, ramp, info = key_dark(src_rgb, t, close)

    alpha01 = combine_alpha(silk, ramp)
    alpha_master = feather(alpha01, sigma)

    rgb_work = np.asarray(src.convert("RGB")).astype(np.int16)
    if real_mode == "magenta":
        hole_mask = info.get("hole_fill")
        color_src = info.get("color_src")
        if hole_mask is not None and color_src is not None:
            rgb_work = inpaint_from(rgb_work, hole_mask, color_src)
        rgb_work = despill_rgb(rgb_work, alpha_master)

    master = Image.fromarray(
        np.clip(rgb_work, 0, 255).astype(np.uint8), "RGB"
    ).convert("RGBA")
    master.putalpha(Image.fromarray(alpha_master, "L"))

    normalized = False
    if master.size != (512, 512):
        normalized = True
        master = normalize_square(master)
        master = resize_rgba(master, 512)

    print(f"=== 抠图参数（{label}）===")
    print(f"  源图      {src_path}")
    print(f"  底色判定  {info['mode']}（{info['param']}）  边框中位色 rgb{info['bg']}")
    print(
        f"  前景占比  {info['fg_fraction']:.4f} → 剪影占比 {float(alpha01.mean()):.4f}"
        f"   软边像素 {info['soft_frac'] * 100:.2f}%"
    )
    print(
        f"  主体连通域 {info['face_raw']} px → 填洞后 {info['face_filled']} px"
        f"（内部同色暗区补回 {info['holes']} px）"
    )
    print(
        "  外围元素  %d 个（不填洞，合计 %d px）：%s"
        % (
            len(info["outer"]),
            info["outer_area"],
            ", ".join(f"#{cid}:{area}px" for cid, area in info["outer"]) or "无",
        )
    )
    if normalized:
        print("  [WARN] 源图非 512×512，已裁内容框并居中补成正方形")
    return master, info


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    args = parse_args(argv if argv is not None else sys.argv[1:])

    src_path: Path = args.src
    if not src_path.is_absolute():
        src_path = ROOT / src_path
    if not src_path.exists():
        print(f"[ERR] 源图不存在: {src_path}")
        return 2

    micro_path: Path | None = None
    if args.micro_src is not None:
        micro_path = args.micro_src
        if not micro_path.is_absolute():
            micro_path = ROOT / micro_path
        if not micro_path.exists():
            print(f"[ERR] 小尺寸源图不存在: {micro_path}")
            return 2

    out_dir: Path = args.out_dir
    if not out_dir.is_absolute():
        out_dir = ROOT / out_dir

    master, _info = prepare_master(
        src_path, args.bg, args.t, args.close, args.sigma, "主体版"
    )
    micro_master: Image.Image | None = None
    if micro_path is not None:
        micro_master, _ = prepare_master(
            micro_path, args.bg, args.t, args.close, args.sigma, "小尺寸简化版"
        )

    def master_for(size: int) -> Image.Image:
        """≤ micro_max 走简化版；没有简化版就一律用主体版。"""
        if micro_master is not None and size <= args.micro_max:
            return micro_master
        return master

    per_size: dict[int, Image.Image] = {}
    rows: list[tuple[str, int, int, float, int | None, str]] = []
    over: list[str] = []

    for size in SIZES:
        base = master_for(size)
        if size == base.width:
            img = base
        else:
            img = resize_rgba(base, size, hard_alpha=(size <= 32))
            if size <= 32 and not args.no_sharpen:
                img = sharpen_small(img)
        per_size[size] = img
        name = f"icon-{size}.png"
        limit = SIZE_LIMITS.get(name, SMALL_LIMIT if size <= 32 else None)
        n, note = save_png(img, out_dir / name, limit)
        rows.append((name, size, n, zero_fraction(img), limit, note))
        if limit is not None and n > limit:
            over.append(name)

    touch = per_size[180]
    n, note = save_png(touch, out_dir / "apple-touch-icon.png")
    rows.append(("apple-touch-icon.png", 180, n, zero_fraction(touch), None, note))

    # favicon.ico 内嵌 16/32/48 三档 PNG；用已下采样好、边缘已颜色外扩的版本，
    # 不让 Pillow 自己对 512 母版临时缩（那会在透明边缘混出黑边）。
    ico = out_dir / "favicon.ico"
    ico.parent.mkdir(parents=True, exist_ok=True)
    per_size[48].save(
        ico,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[per_size[32], per_size[16]],
    )
    rows.append(("favicon.ico", 48, ico.stat().st_size, 0.0, None, ""))

    print("=== 产物 ===")
    print(f"  {'文件':<22}{'标称':>6}{'体积':>10}{'alpha=0':>11}  说明")
    for name, size, n, zf, limit, note in rows:
        bits = []
        if limit is not None:
            bits.append("OK" if n <= limit else f"超预算(>{limit // 1024}KB)")
        if note:
            bits.append(note)
        print(f"  {name:<22}{size:>6}{n:>10}{zf * 100:>10.1f}%  {' / '.join(bits)}")

    if not args.no_previews:
        pdir = args.preview_dir
        if not pdir.is_absolute():
            pdir = ROOT / pdir
        pdir.mkdir(parents=True, exist_ok=True)
        previews = {
            "icon-white.png": composite(master, "#ffffff"),
            "icon-black.png": composite(master, "#000000"),
            "icon-16-white.png": composite(per_size[16], "#ffffff").resize((256, 256), Image.NEAREST),
            "icon-32-white.png": composite(per_size[32], "#ffffff").resize((256, 256), Image.NEAREST),
        }
        for name, im in previews.items():
            im.save(pdir / name, format="PNG")
        print("=== 预览 ===")
        for name in previews:
            print(f"  {pdir / name}")

    a512 = np.asarray(master.getchannel("A"))
    corners = [int(a512[y, x]) for y, x in ((0, 0), (0, -1), (-1, 0), (-1, -1))]
    checks = {
        "四角 alpha == 0": all(c == 0 for c in corners),
        f"512 的 alpha=0 占比 > {args.require_zero * 100:.0f}%": zero_fraction(master) > args.require_zero,
        "体积上限（512 ≤ 300KB，16/32 ≤ 3KB）": not over,
    }
    print("=== 自检 ===")
    for k, v in checks.items():
        print(f"  [{'OK' if v else 'FAIL'}] {k}")
    if over:
        print("  超预算文件: " + ", ".join(over))
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
