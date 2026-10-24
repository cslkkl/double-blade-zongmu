# -*- coding: utf-8 -*-
"""新增武器素材一次性流水线：持械帧 / 攻击姿态帧 / 武器特效 / 打击材质。

七张源图 -> 三类产物 + 四个数据块（就地写 js/anim-data.js）：
  window.ANIM_HOLD      追加 short / blade / jar / bell（原有 7 键原样保留）
  window.WEAPON_ATTACK  short dagger sword axe hammer spear bow rock blade jar
  window.WEAPON_FX      short dagger sword axe hammer spear bow rock blade jar bell
  window.HIT_MATERIAL   jade bronze blunt airy

scaleFix 用「腰带锚定」反算，不用内容包围盒高 —— 攻击姿态里武器尖端高过头顶，
包围盒高会把角色算成小人。腰带在腰上，任何姿态都够不到：
    scaleFix = idle_beltToFoot / cell_beltToFoot
同一张图的多格由同一次生图画出，人物比例一致，所以对同一张图做一致性校验：
偏离中位数 > 6% 的格判为误检，用该图中位数替换并在报告里标出来。

用法：
  python tools/slice_weapon_assets.py            # 正常跑
  python tools/slice_weapon_assets.py --debug    # 额外把腰带/锚点叠加图写到 _dbg/
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import slice_anim as SA  # noqa: E402

SRC = r"C:\Users\11965\Desktop\imagegen无限\output\sanxingdui-weapon"
OUT_IMG = Path(SA.OUT_IMG)                      # assets/anim
OUT_FX = HERE.parent / "assets" / "fx"          # assets/fx（新目录）
OUT_JS = Path(SA.OUT_JS)
DBG = HERE.parent / "_dbg"

MAX_SIDE = 560          # 人物帧画布长边上限（与 slice_anim_hold 一致）
FX_MAX_SIDE = 420       # 刀光 / 爆炸环长边上限
HIT_MAX_SIDE = 280      # 打击火花长边上限
TARGET_H = 252          # char-rig.js 里的 TARGET_H
TOL_PCT = 2.0           # 腰带到脚底屏幕长度允许偏差（%）
SHEET_SPREAD = 0.06     # 同图一致性阈值

# ---------------------------------------------------------------- 源图契约
# (源 PNG, [(key, 格序号)], 产物类型)
HOLD_SHEETS = [
    ("hold-extra.png", [("short", 0), ("blade", 1), ("jar", 2), ("bell", 3)]),
]
ATK_SHEETS = [
    ("atk-melee-a.png", [("short", 0), ("dagger", 1), ("spear", 2)]),
    ("atk-melee-b.png", [("sword", 0), ("axe", 1), ("hammer", 2)]),
    ("atk-ranged.png",  [("bow", 0), ("rock", 1), ("blade", 2), ("jar", 3)]),
]
FX_SHEETS = [
    ("fx-melee-a.png", [("short", 0), ("dagger", 1), ("spear", 2)]),
    ("fx-melee-b.png", [("sword", 0), ("axe", 1), ("hammer", 2)]),
    ("fx-ranged.png",  [("bow", 0), ("rock", 1), ("burst", 2)]),
]
HIT_SHEET = ("fx-hit-material.png", [("jade", 0), ("bronze", 1), ("blunt", 2), ("airy", 3)])

# 键顺序固定（上层渲染代码按这些键写好了）
ATK_ORDER = ["short", "dagger", "sword", "axe", "hammer",
             "spear", "bow", "rock", "blade", "jar"]
FX_ORDER = ATK_ORDER + ["bell"]
HIT_ORDER = ["jade", "bronze", "blunt", "airy"]

# bell 的攻击姿态沿用 jar，不单独出图；bell / jar / blade 共用 burst 那张
ATK_ALIAS = {"bell": "jar"}
FX_FILE_ALIAS = {"bell": "burst", "jar": "burst", "blade": "burst"}

# 建议半径（可按切出来的实际形状微调，报告里说明）
FX_R = {
    "short": 98, "dagger": 84, "sword": 112, "axe": 126, "hammer": 132,
    "spear": 130, "bow": 100, "rock": 92, "blade": 96, "jar": 112, "bell": 108,
}
# 挥砍弧张开角度（弧度）：突刺类小、劈砍类大
FX_ARC = {
    "short": 1.15, "dagger": 0.75, "sword": 1.45, "axe": 1.85, "hammer": 1.95,
    "spear": 0.45, "bow": 0.90, "rock": 1.00, "blade": 1.30, "jar": 1.05,
    "bell": 1.20,
}

# ---------------------------------------------------------------- 腰带检测
BELT_BAND = (0.32, 0.84)   # 腰带在内容高度上的搜索带
GROUND_BAND = 0.68         # 脚底行的搜索起点（内容高度占比）
BELT_H_MIN = 0.010         # 腰带厚度下限（占内容高）
BELT_H_MAX = 0.070         # 腰带厚度上限
BELT_LEN_MIN = 0.20        # 腰带连续长度下限（占内容宽）
BELT_OFF_MAX = 0.24        # 腰带水平中心偏离身体中线的上限（占内容宽）


def _brown(a):
    """皮革棕：暖色、R>G>B、有一定饱和度。"""
    R = a[..., 0].astype(np.int16)
    G = a[..., 1].astype(np.int16)
    B = a[..., 2].astype(np.int16)
    A = a[..., 3]
    return ((A > 170) & (R > G) & (G >= B - 6) & ((R - B) >= 26)
            & (R >= 45) & (R <= 220) & (G <= R * 0.88) & (B <= G * 0.95))


def _runs(row, gap=4):
    idx = np.where(row)[0]
    if not len(idx):
        return []
    out, s, p = [], idx[0], idx[0]
    for i in idx[1:]:
        if i - p > gap:
            out.append((int(s), int(p)))
            s = i
        p = i
    out.append((int(s), int(p)))
    return out


def _longest(row, gap=4):
    rs = _runs(row, gap)
    if not rs:
        return None
    return max(rs, key=lambda t: t[1] - t[0])


def content_bbox(a):
    A = a[..., 3]
    ys = np.where((A > 24).any(axis=1))[0]
    xs = np.where((A > 24).any(axis=0))[0]
    if not len(ys) or not len(xs):
        return None
    return int(xs[0]), int(xs[-1]), int(ys[0]), int(ys[-1])


def ground_row(a, bbox):
    """脚底行：底部 32% 里仍然足够宽的最低一行（排除剑尖这类细长突出）。"""
    x0, x1, y0, y1 = bbox
    cw = x1 - x0 + 1
    ch = y1 - y0 + 1
    A = a[..., 3]
    widths = (A > 24).sum(axis=1)
    lo = y0 + int(GROUND_BAND * ch)
    cand = [y for y in range(lo, y1 + 1) if widths[y] >= 0.16 * cw]
    return max(cand) if cand else y1


def detect_belt(a):
    """腰带行 = 身体中段最长的棕色横条（腰带水平贯穿腰身）。

    不用「长度 / 内容宽」当判据 —— 攻击姿态里武器把内容宽撑大，腰身没变长。
    返回 beltY / beltCx / 以及腰带横条长度（用于同图一致性校验）。
    找不到返回 beltY=None。
    """
    bbox = content_bbox(a)
    if bbox is None:
        return dict(beltY=None, beltCx=None, L=0)
    x0, x1, y0, y1 = bbox
    W = a.shape[1]
    cw = x1 - x0 + 1
    ch = y1 - y0 + 1
    A = a[..., 3]
    cx = int(np.median(np.where(A > 140)[1])) if (A > 140).any() else (x0 + x1) // 2

    m = _brown(a)
    rows = {}
    lo = y0 + int(BELT_BAND[0] * ch)
    hi = y0 + int(BELT_BAND[1] * ch)
    for y in range(lo, min(hi, a.shape[0] - 1) + 1):
        r = _longest(m[y, :], gap=5)
        if not r:
            continue
        s, e = r
        L = e - s + 1
        if L < 8 or abs((s + e) / 2.0 - cx) > 0.50 * cw:
            continue
        rows[y] = (L, s, e)
    if not rows:
        return dict(beltY=None, beltCx=None, L=0)

    ymax = max(rows, key=lambda y: rows[y][0])
    Lmax = rows[ymax][0]
    tol = max(6, int(0.07 * ch))
    sel = [y for y in rows if rows[y][0] >= 0.70 * Lmax and abs(y - ymax) <= tol]
    ws = np.array([rows[y][0] for y in sel], np.float32)
    ys = np.array(sel, np.float32)
    beltY = float((ws * ys).sum() / ws.sum())
    beltCx = float(np.median([(rows[y][1] + rows[y][2]) / 2.0 for y in sel]))
    return dict(beltY=beltY, beltCx=beltCx, L=int(Lmax))


def detect_head(a):
    """头冠顶（金色椭圆上沿）。头永远不被武器遮住，是比腰带更稳的锚。

    金色：R>=180 G>=145 B<=160 且 R-B>=65 / G-B>=40。
    返回 crownTop（头冠顶行）与 crownCx（头冠水平中线）。
    """
    bbox = content_bbox(a)
    if bbox is None:
        return dict(crownTop=None, crownCx=None)
    x0, x1, y0, y1 = bbox
    cw = x1 - x0 + 1
    ch = y1 - y0 + 1
    R = a[..., 0].astype(np.int16)
    G = a[..., 1].astype(np.int16)
    B = a[..., 2].astype(np.int16)
    A = a[..., 3]
    m = ((A > 200) & (R >= 180) & (G >= 145) & (B <= 160)
         & ((R - B) >= 65) & ((G - B) >= 40))
    rows = {}
    for y in range(y0, min(y0 + int(0.45 * ch), a.shape[0] - 1) + 1):
        r = _longest(m[y, :], gap=6)
        if r and (r[1] - r[0] + 1) >= 0.10 * cw:
            rows[y] = r
    if not rows:
        return dict(crownTop=None, crownCx=None)
    run = []
    for y in sorted(rows):
        if run and y - run[-1] > 1:
            break
        run.append(y)
    if len(run) < 5:
        return dict(crownTop=None, crownCx=None)
    cxs = [(rows[y][0] + rows[y][1]) / 2.0 for y in run]
    return dict(crownTop=float(run[0]), crownCx=float(np.median(cxs)))


# ---------------------------------------------------------------- 画布
def cell_crop(rgba, alpha, x0, x1, pad=4):
    sub = rgba[:, x0:x1]
    al = alpha[:, x0:x1]
    ys = np.where((al > 24).any(axis=1))[0]
    if not len(ys):
        return None
    return sub[max(0, int(ys[0]) - pad): int(ys[-1]) + pad + 1]


def to_canvas(crop, max_side=MAX_SIDE):
    """做统一画布：横向留白居中、底部贴齐、预乘缩放、去溢色。
    返回 (PIL 图, 累计缩放系数 sc)。sc 用来把画布上的长度还原成源图长度。"""
    c = crop
    pad = None
    sc_all = 1.0
    while True:
        H, W = c.shape[0], c.shape[1]
        canvas_w = max(W, int(H * 0.62))
        pad = np.zeros((H, canvas_w, 4), np.uint8)
        ox = (canvas_w - W) // 2
        pad[:, ox:ox + W] = c
        sc = min(max_side / max(canvas_w, H), 1.0)
        if sc >= 0.999:
            break
        cw, chh = max(1, int(round(canvas_w * sc))), max(1, int(round(H * sc)))
        c = SA.resize_rgba_premul(pad, (cw, chh))
        sc_all *= sc
    return SA.defringe_rgba(Image.fromarray(pad, "RGBA")), sc_all


def metrics(im, sc):
    """一张画布上的两个锚点，长度一律折算回源图像素（同图可比）。"""
    a = np.array(im)
    bbox = content_bbox(a)
    if bbox is None:
        return None
    ground = ground_row(a, bbox)
    belt = detect_belt(a)
    head = detect_head(a)
    return dict(
        ground=ground, H=im.height, W=im.width, sc=sc,
        beltY=belt["beltY"], beltCx=belt["beltCx"],
        belt_px=(ground - belt["beltY"]) / sc if belt["beltY"] is not None else None,
        crownTop=head["crownTop"], crownCx=head["crownCx"],
        crown_px=(ground - head["crownTop"]) / sc if head["crownTop"] is not None else None,
        content_h=measure_content_h(im),
    )


def consensus(vals, spread=SHEET_SPREAD):
    """同图多格取中位数；偏离中位数超过 spread 的判为误检。
    vals: [(key, 源图像素长度或 None)] -> (median, {key: 是否可信})"""
    ok = [(k, v) for k, v in vals if v]
    if not ok:
        return None, {}
    med = float(np.median([v for _, v in ok]))
    flags = {}
    for k, v in vals:
        if v is None:
            flags[k] = "none"
        elif abs(v - med) / med > spread:
            flags[k] = "suspect"
        else:
            flags[k] = "ok"
    return med, flags


def measure_content_h(im):
    a = np.array(im.convert("RGBA"))[:, :, 3]
    ys = np.where((a > 24).any(axis=1))[0]
    return int(ys[-1] - ys[0] + 1) if len(ys) else 0


def bbox_ratio(im):
    """回退用：内容高 / 画布高。"""
    ch = measure_content_h(im)
    return ch / float(im.height) if ch else 0.0


def idle_baseline():
    """idle-0.webp 的腰带到脚底 / 头冠到脚底，各自除以画布高，作为身高校正基准。"""
    im = Image.open(OUT_IMG / "idle-0.webp").convert("RGBA")
    a = np.array(im)
    bbox = content_bbox(a)
    if bbox is None:
        raise SystemExit("!! idle-0.webp 全透明")
    ground = ground_row(a, bbox)
    belt = detect_belt(a)
    head = detect_head(a)
    out = dict(H=im.height, ground=ground, contentH=measure_content_h(im),
               beltY=belt["beltY"], crownTop=head["crownTop"],
               ratio_belt=None, ratio_crown=None)
    if belt["beltY"] is not None:
        out["ratio_belt"] = (ground - belt["beltY"]) / float(im.height)
    if head["crownTop"] is not None:
        out["ratio_crown"] = (ground - head["crownTop"]) / float(im.height)
    if out["ratio_belt"] is None:
        raise SystemExit("!! idle-0.webp 腰带检测失败，无法建立基准")
    return out


# ---------------------------------------------------------------- 洋红（特效）
def fx_key(img, lo=45, hi=115, despill=22):
    """与 prep_fx.py 同款：lo=45 / hi=115 / despill=22。"""
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


def fx_crop(img, pad=4):
    bb = img.split()[3].getbbox()
    if not bb:
        return img
    x0, y0, x1, y1 = bb
    return img.crop((max(0, x0 - pad), max(0, y0 - pad),
                     min(img.width, x1 + pad), min(img.height, y1 + pad)))


def split_cols(img, min_gap=14, min_w=60):
    """按列 alpha 投影切成独立对象（与 prep_fx.py 同款；此处复制，
    不 import prep_fx —— 那个脚本是顶层直跑型，import 会顺手重写 assets/ 根目录。"""
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


def fx_resize(im, max_side):
    sc = min(max_side / float(max(im.width, im.height)), 1.0)
    if sc >= 0.999:
        return im
    nw, nh = max(1, int(round(im.width * sc))), max(1, int(round(im.height * sc)))
    arr = SA.resize_rgba_premul(np.array(im.convert("RGBA")), (nw, nh))
    return SA.defringe_rgba(Image.fromarray(arr, "RGBA"))


def residue(im):
    """洋红残留：min(R,B)-G > 40 且 alpha > 20 的像素数。"""
    a = np.array(im.convert("RGBA")).astype(np.int16)
    m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    return int(((m > 40) & (a[..., 3] > 20)).sum())


def purify_magenta(im, rb=48, thr=10, cap=20):
    """定向去洋红：只压「R≈B 且都明显高于 G」的紫像素。

    源图里描边与洋红底相接处会留一圈深紫（如 #300030），min(R,B)-G≈48，
    刚好卡在残留阈值上；而金饰 R-B 很大、玉器 R<G，都不会被这道判据误伤。
    """
    a = np.array(im.convert("RGBA")).astype(np.int16)
    R, G, B, AL = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    m = np.minimum(R, B) - G
    near = (np.abs(R - B) <= rb) & (m > thr) & (AL > 8)
    c = G + cap
    a[..., 0] = np.where(near, np.minimum(a[..., 0], c), a[..., 0])
    a[..., 2] = np.where(near, np.minimum(a[..., 2], c), a[..., 2])
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")


def save_clean(im, path, budget=200, quality=92, caps=(20, 12, 8, 4)):
    """存盘 → 读回统计残留；超过预算就在「读回的图」上反复定向去洋红再存。

    必须在读回的图上迭代：WebP 有损压缩带色度二次采样，只对内存图处理一次，
    邻近的紫像素会在重采样时被抹回来（实测 971 → 719，迭代后 → 20 以下）。
    返回 (最终残留, 首存残留)。
    """
    im.save(path, "WEBP", quality=quality, method=6, alpha_quality=100)
    first = residue(Image.open(path))
    if first <= budget:
        return first, first
    now = first
    for cap in caps:
        if now <= budget:
            break
        purify_magenta(Image.open(path), cap=cap).save(
            path, "WEBP", quality=quality, method=6, alpha_quality=100)
        now = residue(Image.open(path))
    return now, first


# ---------------------------------------------------------------- 写数据文件
MARK = "slice_weapon_assets"


def _drop_block(src, name):
    """删掉自己写过的数据块，连带块两侧的空行一起吃掉 —— 否则每跑一次多几行空行。"""
    pat = re.compile(r"\n*/\* >>> %s: %s >>> \*/[\s\S]*?/\* <<< %s: %s <<< \*/[ \t]*\n*"
                     % (MARK, name, MARK, name))
    return pat.sub("\n", src)


def _block(name, body):
    return ("/* >>> %s: %s >>> */\n%s/* <<< %s: %s <<< */\n"
            % (MARK, name, body, MARK, name))


def write_hold_entries(src, entries):
    """只手术式增删 ANIM_HOLD 里的 4 个新键，原有 7 键原样不动。"""
    keys = [k for k, _ in entries]
    pat = re.compile(r"window\.ANIM_HOLD\s*=\s*\{[\s\S]*?\n\};")
    m = pat.search(src)
    if not m:
        raise SystemExit("!! 找不到 window.ANIM_HOLD 块")

    block = m.group(0)
    head = block[:block.index("{") + 1]
    tail = "\n};"
    inner = block[len(head): -len(tail)]

    # 逐个删掉同名旧条目（条目内无嵌套花括号）
    for k in keys:
        inner = re.sub(r"[ \t]*\b%s\b[ \t]*:[ \t]*\{[^{}]*\}[ \t]*,?[ \t]*\n?" % re.escape(k),
                       "", inner)
    inner = inner.strip()
    if inner.endswith(","):
        inner = inner[:-1]
    rows = []
    for k, e in entries:
        rows.append('  %-8s: { w: %d, h: %d, anchorX: %s, footY: 1.0, scaleFix: %s,\n'
                    '            file: "%s" },'
                    % (k, e["w"], e["h"], e["anchorX"], e["scaleFix"], e["file"]))
    new_inner = inner.rstrip()
    if new_inner:
        if not new_inner.endswith(","):
            new_inner += ","
        new_inner += "\n" + "\n".join(rows)
    else:
        new_inner = "\n" + "\n".join(rows)
    new_block = head + "\n" + new_inner.rstrip().rstrip(",") + tail
    return src[:m.start()] + new_block + src[m.end():]


def fmt_attack(recs):
    rows = []
    for k in ATK_ORDER:
        e = recs[k]
        rows.append('  %-8s: { w: %d, h: %d, anchorX: %s, footY: 1.0, scaleFix: %s,\n'
                    '            file: "%s" }' % (k, e["w"], e["h"], e["anchorX"],
                                                 e["scaleFix"], e["file"]))
    body = ("/* 攻击姿态帧：键集合固定，bell 不在其中（沿用 jar 姿态，由上层兜底）。\n"
            "   scaleFix 按「头冠顶 → 脚底」反算：身体高度的屏幕长度与 idle 一致。\n"
            "   武器举过头顶的格（axe/hammer）画布会高很多，scaleFix 因此偏大，属正常。 */\n"
            "window.WEAPON_ATTACK = {\n" + ",\n".join(rows) + "\n};\n")
    return _block("WEAPON_ATTACK", body)


def fmt_fx(recs):
    rows = []
    for k in FX_ORDER:
        e = recs[k]
        rows.append('  %-8s: { file: "%s", scale: %s, r: %d, arc: %s }'
                    % (k, e["file"], e["scale"], e["r"], e["arc"]))
    body = ("/* 武器刀光：r 为建议半径，arc 为挥砍弧张开角度（弧度）。\n"
            "   bell 与 jar 共用 burst 那张爆炸环。 */\n"
            "window.WEAPON_FX = {\n" + ",\n".join(rows) + "\n};\n")
    return _block("WEAPON_FX", body)


def fmt_hit(recs):
    rows = []
    for k in HIT_ORDER:
        rows.append('  %-7s: "%s"' % (k, recs[k]))
    body = ("/* 打击火花四张：按材质选图。 */\n"
            "window.HIT_MATERIAL = {\n" + ",\n".join(rows) + "\n};\n")
    return _block("HIT_MATERIAL", body)


def node_check():
    r = subprocess.run(["node", "--check", str(OUT_JS)], capture_output=True, text=True)
    if r.returncode != 0:
        print("!! anim-data.js 语法错误：")
        print(r.stderr.strip()[:800])
        raise SystemExit(1)
    print("  node --check js/anim-data.js 通过")


# ---------------------------------------------------------------- 主流程
def load_cells(png, n):
    path = Path(SRC) / png
    rgb = np.array(Image.open(path).convert("RGB"))
    rgba, a = SA.cut_magenta(rgb)
    bounds, segs = SA.frame_bounds(a, n)
    cells = []
    for x0, x1 in zip(bounds[:-1], bounds[1:]):
        c = cell_crop(rgba, a, int(x0), int(x1))
        cells.append(c)
    return cells, bounds, segs


def main(debug=False):
    if not os.path.isdir(SRC):
        print("!! 源图目录不存在：%s" % SRC)
        return 1
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    OUT_FX.mkdir(parents=True, exist_ok=True)
    if debug:
        DBG.mkdir(parents=True, exist_ok=True)

    base = idle_baseline()
    print("基准 idle-0.webp：%dx%d 内容高 %d  腰带 y=%.1f  头冠顶 y=%s  脚底 y=%d"
          % (560, base["H"], base["contentH"], base["beltY"],
             None if base["crownTop"] is None else round(base["crownTop"], 1),
             base["ground"]))
    print("  腰带→脚底/画布高 = %.4f  → 基准屏幕长度 %.2f px"
          % (base["ratio_belt"], TARGET_H * base["ratio_belt"]))
    if base["ratio_crown"]:
        print("  头冠→脚底/画布高 = %.4f  → 基准屏幕长度 %.2f px（交叉校验用）\n"
              % (base["ratio_crown"], TARGET_H * base["ratio_crown"]))
    else:
        print()

    missing, used_sheets = [], []
    hold_recs, atk_recs = [], {}
    dbg_tiles = []
    resid_rows = []
    all_ok = True

    def build_sheet(png, jobs, kind):
        """切一张人物图，返回 {key: 记录}。

        scaleFix 用「腰带锚定」：腰带 → 脚底 的屏幕长度与 idle 一致。
        同一次生图的多格人物比例一致，所以对同一张图做源图像素长度的一致性校验，
        偏离中位数 > 6% 的格判为误检（如陶罐遮住腰带），改用该图中位数。
        头冠锚（金色头冠顶 → 脚底）作为交叉校验一并打印，两套数字都进报告。
        """
        nonlocal all_ok
        path = Path(SRC) / png
        if not path.exists():
            print("  缺图 %s → 跳过 %d 个键：%s" % (png, len(jobs), ", ".join(k for k, _ in jobs)))
            missing.append(png)
            return {}
        n = max(i for _, i in jobs) + 1
        cells, bounds, segs = load_cells(png, n)
        used_sheets.append((png, len(cells), segs, bounds))

        built = {}
        for key, idx in jobs:
            if idx >= len(cells) or cells[idx] is None:
                print("  %s 第 %d 格为空 → 跳过 %s" % (png, idx, key))
                missing.append("%s#%s" % (png, idx))
                continue
            im, sc = to_canvas(cells[idx])
            built[key] = dict(img=im, m=metrics(im, sc), bbox=bbox_ratio(im))
        if not built:
            return {}

        belt_med, belt_flag = consensus([(k, v["m"]["belt_px"]) for k, v in built.items()])
        crown_med, crown_flag = consensus([(k, v["m"]["crown_px"]) for k, v in built.items()])

        recs = {}
        for key, _ in jobs:
            if key not in built:
                continue
            v = built[key]
            im, m, br = v["img"], v["m"], v["bbox"]

            # ---- 头冠锚优先 ----
            # 头冠→脚底 = 身体高度，这是唯一跨代稳定的量：既有 7 个 hold 帧
            # 与 idle 都落在 177.0~177.1 px。腰带→脚底在这批新图里比旧图短 10%
            # （新图腿更长），用它会把角色缩到 158~161 px，所以只当备胎。
            src_tag = "头冠"
            crown_px = None
            if crown_flag.get(key) == "ok":
                crown_px = m["crown_px"]
            elif crown_med is not None and crown_flag.get(key) in ("none", "suspect"):
                crown_px = crown_med
                src_tag = ("同图中位数替换(原%.0fpx)" % m["crown_px"]
                           if crown_flag.get(key) == "suspect" else "同图中位数补齐")
                all_ok = False

            if crown_px is not None and base["ratio_crown"]:
                ratio_used = crown_px * m["sc"] / float(im.height)
                fix = round(base["ratio_crown"] / ratio_used, 3)
            elif belt_flag.get(key) == "ok":
                ratio_used = m["belt_px"] * m["sc"] / float(im.height)
                fix = round(base["ratio_crown"] / ratio_used, 3)
                src_tag = "回退-腰带锚"
                all_ok = False
            elif belt_med is not None:
                ratio_used = belt_med * m["sc"] / float(im.height)
                fix = round(base["ratio_crown"] / ratio_used, 3)
                src_tag = "回退-腰带同图中位数"
                all_ok = False
            else:
                ratio_used = br
                fix = round(base["ratio_belt"] / br, 3)
                src_tag = "回退-包围盒"
                all_ok = False

            # anchorX：身体中线。头冠中线最稳（头永不被武器挡），腰带中心次之。
            if src_tag.startswith("头冠") and m["crownCx"] is not None:
                anchor_tag = "头冠中线"
                anchor = round(float(m["crownCx"]) / im.width, 4)
            elif m["beltCx"] is not None:
                anchor_tag = "腰带中心"
                anchor = round(float(m["beltCx"]) / im.width, 4)
            else:
                anchor_tag = "回退0.5"
                anchor = 0.5
                all_ok = False

            content_h = m["content_h"]
            name = ("hold-%s.webp" if kind == "hold" else "atk-%s.webp") % key
            out_path = OUT_IMG / name
            # 残留必须对「写盘后再读回」的图统计：内存里干净不代表落地干净
            now_r, first_r = save_clean(im, out_path)
            resid_rows.append((name, now_r, first_r))

            screen_body = TARGET_H * fix * ratio_used
            want = TARGET_H * base["ratio_crown"]
            dev = (screen_body - want) / want * 100.0
            if abs(dev) > TOL_PCT:
                all_ok = False

            bbox_body = TARGET_H * fix * (content_h / float(im.height))
            print("  %-8s %4dx%-4d 内容高 %3d  scaleFix %-6s 锚点%-8s(%.4f) "
                  "屏幕身高 %6.1f (%+.1f%%)  包围盒视高 %5.1f  [%s]"
                  % (key, im.width, im.height, content_h, fix, anchor_tag, anchor,
                     screen_body, dev, bbox_body, src_tag))
            print("           头冠 %s px / 腰带 %s px（源图像素，供核对）"
                  % (None if m["crown_px"] is None else round(m["crown_px"], 1),
                     None if m["belt_px"] is None else round(m["belt_px"], 1)))
            if src_tag.startswith("同图") or src_tag.startswith("回退"):
                print("           本格腰带实测 %s px / 同图中位数 %s px / "
                      "包围盒比值 %.4f（→ scaleFix %s）"
                      % (None if m["belt_px"] is None else round(m["belt_px"], 1),
                         None if belt_med is None else round(belt_med, 1), br,
                         round(base["ratio_belt"] / br, 3) if br > 0 else None))

            recs[key] = dict(w=im.width, h=im.height, anchorX=anchor,
                             scaleFix=fix, content_h=content_h,
                             screen_body=screen_body, screen_belt=screen_body,
                             dev=dev, file="assets/anim/" + name, src=src_tag,
                             ratio=ratio_used, sc=m["sc"],
                             belt_px=m["belt_px"], crown_px=m["crown_px"])
            if debug:
                px = np.array(im.convert("RGB")).copy()
                if m["beltY"] is not None:
                    yy = int(round(m["beltY"]))
                    px[max(0, yy - 1):yy + 2, :, :] = [255, 0, 160]
                if m["beltCx"] is not None:
                    xx = int(round(m["beltCx"]))
                    px[:, max(0, xx - 1):xx + 2, :] = [0, 110, 255]
                if m["crownTop"] is not None:
                    yy = int(round(m["crownTop"]))
                    px[max(0, yy - 1):yy + 2, :, :] = [255, 220, 0]
                gy = int(round(m["ground"]))
                px[max(0, gy - 1):gy + 2, :, :] = [40, 210, 60]
                dbg_tiles.append(Image.fromarray(px, "RGB"))
        return recs

    print("=== 站定持械帧 hold ===")
    for png, jobs in HOLD_SHEETS:
        got = build_sheet(png, jobs, "hold")
        for key, _ in jobs:
            if key in got:
                hold_recs.append((key, got[key]))
            elif not any(png in str(m) for m in missing):
                missing.append("%s#%s" % (png, key))

    print("\n=== 攻击姿态帧 atk ===")
    for png, jobs in ATK_SHEETS:
        got = build_sheet(png, jobs, "atk")
        for key, _ in jobs:
            if key in got:
                atk_recs[key] = got[key]
            else:
                missing.append("%s#%s" % (png, key))

    # ---------------------------------------------------------------- 特效
    print("\n=== 武器刀光 wp-slash-* ===")
    fx_recs = {}
    for png, jobs in FX_SHEETS:
        path = Path(SRC) / png
        if not path.exists():
            print("  缺图 %s → 跳过 %s" % (png, ", ".join(k for k, _ in jobs)))
            missing.append(png)
            continue
        n = max(i for _, i in jobs) + 1
        rgb = Image.open(path).convert("RGB")
        keyed = fx_key(rgb)
        # 按列投影切对象；切不出就用 SA.frame_bounds 兜底
        parts = split_cols(fx_crop(keyed))
        if not parts or len(parts) < n:
            a = np.array(keyed.convert("RGBA"))[:, :, 3].astype(np.float32)
            bounds, _ = SA.frame_bounds(a, n)
            parts = []
            for x0, x1 in zip(bounds[:-1], bounds[1:]):
                sub = keyed.crop((int(x0), 0, int(x1), keyed.height))
                parts.append(fx_crop(sub))
        print("  %s 切出 %d 个对象，需要 %d" % (png, len(parts), n))
        for key, idx in jobs:
            if idx >= len(parts):
                print("    %s 第 %d 格缺失 → 跳过" % (key, idx))
                missing.append("%s#%d" % (png, idx))
                continue
            im = fx_resize(fx_crop(parts[idx]), FX_MAX_SIDE)
            name = "wp-slash-%s.webp" % key
            p_out = OUT_FX / name
            now_r, first_r = save_clean(im, p_out)
            resid_rows.append(("fx/" + name, now_r, first_r))
            fx_recs[key] = dict(file="assets/fx/" + name, w=im.width, h=im.height)

    print("\n=== 打击材质 hit-* ===")
    hit_recs = {}
    png, jobs = HIT_SHEET
    path = Path(SRC) / png
    if not path.exists():
        print("  缺图 %s" % png)
        missing.append(png)
    else:
        n = max(i for _, i in jobs) + 1
        keyed = fx_key(Image.open(path).convert("RGB"))
        parts = split_cols(fx_crop(keyed))
        if not parts or len(parts) < n:
            a = np.array(keyed.convert("RGBA"))[:, :, 3].astype(np.float32)
            bounds, _ = SA.frame_bounds(a, n)
            parts = [fx_crop(keyed.crop((int(x0), 0, int(x1), keyed.height)))
                     for x0, x1 in zip(bounds[:-1], bounds[1:])]
        print("  %s 切出 %d 个对象，需要 %d" % (png, len(parts), n))
        for key, idx in jobs:
            if idx >= len(parts):
                missing.append("%s#%d" % (png, idx))
                continue
            im = fx_resize(fx_crop(parts[idx]), HIT_MAX_SIDE)
            name = "hit-%s.webp" % key
            p_out = OUT_FX / name
            now_r, first_r = save_clean(im, p_out)
            resid_rows.append(("fx/" + name, now_r, first_r))
            hit_recs[key] = "assets/fx/" + name

    # ---------------------------------------------------------------- 写 js
    print("\n=== 写 js/anim-data.js ===")
    src = OUT_JS.read_text(encoding="utf-8")
    if hold_recs:
        src = write_hold_entries(src, hold_recs)
        print("  ANIM_HOLD：追加/替换 %d 个键：%s" % (len(hold_recs),
                                              ", ".join(k for k, _ in hold_recs)))

    atk_blocks = {}
    for k in ATK_ORDER:
        if k in atk_recs:
            atk_blocks[k] = atk_recs[k]
        elif k in ATK_ALIAS and ATK_ALIAS[k] in atk_recs:
            atk_blocks[k] = atk_recs[ATK_ALIAS[k]]

    fx_blocks = {}
    for k in FX_ORDER:
        src_key = FX_FILE_ALIAS.get(k, k)
        e = fx_recs.get(src_key)
        if not e:
            continue
        fx_blocks[k] = dict(file=e["file"], scale=1.0, r=FX_R[k], arc=FX_ARC[k])

    hit_blocks = {k: hit_recs[k] for k in HIT_ORDER if k in hit_recs}

    # 先把三个旧块全删掉，再按固定顺序重建 —— 保证任意次重跑结果字节一致
    for name in ("WEAPON_ATTACK", "WEAPON_FX", "HIT_MATERIAL"):
        src = _drop_block(src, name)
    src = src.rstrip()

    if atk_blocks:
        src += "\n\n" + fmt_attack(atk_blocks)
        print("  WEAPON_ATTACK：%d 个键 %s" % (len(atk_blocks), ", ".join(atk_blocks)))
    if fx_blocks:
        src += "\n\n" + fmt_fx(fx_blocks)
        print("  WEAPON_FX：%d 个键 %s" % (len(fx_blocks), ", ".join(fx_blocks)))
        if "bell" in fx_blocks:
            print("    bell → %s" % fx_blocks["bell"]["file"])
    if hit_blocks:
        src += "\n\n" + fmt_hit(hit_blocks)
        print("  HIT_MATERIAL：%d 个键 %s" % (len(hit_blocks), ", ".join(hit_blocks)))

    OUT_JS.write_text(src.rstrip() + "\n", encoding="utf-8")
    node_check()

    if debug and dbg_tiles:
        W = max(t.width for t in dbg_tiles)
        H = max(t.height for t in dbg_tiles)
        cols = min(7, len(dbg_tiles))
        rws = (len(dbg_tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * (W + 6), rws * (H + 6)), (30, 30, 30))
        for i, t in enumerate(dbg_tiles):
            sheet.paste(t, ((i % cols) * (W + 6), (i // cols) * (H + 6)))
        p = DBG / "weapon-overlay.png"
        sheet.save(p)
        print("  叠加调试图（品红=腰带行 蓝=锚点x 绿=脚底行）→ %s" % p)

    # ---------------------------------------------------------------- 报告
    print("\n=== 洋红残留（min(R,B)-G>40 且 alpha>20，写盘后读回统计）===")
    worst = []
    cleaned = []
    for name, now_r, first_r in resid_rows:
        flag = ""
        if now_r > 200:
            flag = "  <<偏大"
            worst.append(name)
        if first_r != now_r:
            cleaned.append("%s %d→%d" % (name, first_r, now_r))
        print("  %-26s %5d%s" % (name, now_r, flag))
    if cleaned:
        print("  定向去洋红后达标：%s" % ", ".join(cleaned))
    if worst:
        print("  残留仍偏大：%s" % ", ".join(worst))
    else:
        print("  全部产物残留 ≤ 200")

    print("\n=== 汇总 ===")
    print("  缺图/跳过：%s" % (", ".join(missing) if missing else "无"))
    print("  同图切分：%s" % "; ".join("%s→%d格(段%d)" % (p, c, s)
                                  for p, c, s, _ in used_sheets))
    devs = [r["dev"] for _, r in hold_recs] + [r["dev"] for r in atk_recs.values()]
    if devs:
        print("  屏幕身高偏离基准：%+.2f%% ~ %+.2f%%（容差 ±%.0f%%，基准 %.1f px）"
              % (min(devs), max(devs), TOL_PCT, TARGET_H * base["ratio_crown"]))
    bodies = [r["screen_body"] for _, r in hold_recs] + [r["screen_body"] for r in atk_recs.values()]
    if bodies:
        print("  屏幕身高（头冠→脚底）：%.1f ~ %.1f px" % (min(bodies), max(bodies)))
    print("  结论：%s" % ("全部通过" if all_ok and not missing else "有回退或缺图，见上"))
    return 0 if not missing else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true", help="写腰带/锚点叠加调试图到 _dbg/")
    a = ap.parse_args()
    sys.exit(main(debug=a.debug))
