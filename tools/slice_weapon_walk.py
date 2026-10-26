# -*- coding: utf-8 -*-
"""武器「4 帧行走循环」切片：walk-<key>.png（横向 4 格）-> walk-<key>-<i>.webp + WEAPON_WALK_CLIP。

与其它两期的关系：
  slice_weapon_assets.py  每把武器 1 张持械站立（hold-<key>.webp，写 ANIM_HOLD）
  slice_weapon_seq.py     每把武器 4 帧出招（atk-<key>-<i>.webp，写 WEAPON_ATTACK_CLIP）
  本脚本                  每把武器 4 帧行走（walk-<key>-<i>.webp，写 WEAPON_WALK_CLIP）

为什么走路要单独一套：
  走路原来落回通用 walk clip（12 个动作共用、手上没武器），于是「站着有武器、
  一走就空手」——连续性断在最常发生的那一帧。程序化浮沉只能遮一时，
  走路必须有逐帧素材，所以单开这一条数据通道。

统一画布：与出招序列同一套做法（4 格并集外扩 4px、底边贴齐、水平居中、
等比缩到长边 ≤ 560）。scaleFix 一把武器一个（4 帧共用），anchorX 逐帧一个。

用法：
  python tools/slice_weapon_walk.py                          # 默认 $SD_IMG_SRC/weapon-walk
  python tools/slice_weapon_walk.py --src <条带目录>
  python tools/slice_weapon_walk.py --src <目录> --only axe,hammer
  python tools/slice_weapon_walk.py --src <目录> --debug
"""
import argparse
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import slice_anim as SA                     # noqa: E402
import slice_weapon_assets as WA            # noqa: E402
import slice_weapon_seq as SQ               # noqa: E402

ROOT = HERE.parent
# 产物路径一律落仓库内（ASSETS / ROOT），不含盘符。
OUT_IMG = ROOT / "assets" / "anim"
OUT_JS = ROOT / "js" / "anim-data.js"
DBG = ROOT / "_dbg"

# WA.idle_baseline() 读的是 WA.OUT_IMG，把它也指到仓库内，
# 这样基准检测在任何机器上都成立。
WA.OUT_IMG = OUT_IMG
WA.OUT_JS = OUT_JS

# 源条带目录：--src > $SD_IMG_SRC/weapon-walk > 报错
SRC = None

FRAMES = SQ.FRAMES
MAX_SIDE = SQ.MAX_SIDE
TARGET_H = WA.TARGET_H

KEYS = ["short", "dagger", "sword", "axe", "hammer",
        "spear", "bow", "rock", "blade", "jar", "bell"]

BLOCK = "WEAPON_WALK_CLIP"


def body_top(a, bbox):
    """兜底的身高锚：从肩线往上取「躯干正上方」那一竖条的最上行。

    为什么需要它：WA.detect_head 找的是原画那顶**金色**头冠
    （R>=180 G>=145 B<=160），而这批新素材是青铜面具色调，金冠条件直接不成立，
    11 把里有 8 把检测失败。这里不猜颜色，只看轮廓：

      1. 肩线 = 从脚底往上扫，第一个宽度 >= 最大宽 50% 的行（躯干最宽处）
      2. 头 = 以肩线行的轮廓中心为轴、左右各 0.30 倍宽度的一条竖带，
         从顶部往下第一个有内容的行
      3. 举过头顶的武器（锤 / 钺）通常偏向一侧，落在竖带之外，不计入身高

    返回 (top_row, center_x)；找不到返回 (None, None)。
    """
    x0, x1, y0, y1 = bbox
    cw = x1 - x0 + 1
    ch = y1 - y0 + 1
    alpha = a[..., 3]
    on = alpha > 40

    widths, spans = {}, {}
    for y in range(y0, y1 + 1):
        r = WA._longest(on[y, :], gap=6)
        if not r:
            continue
        widths[y] = r[1] - r[0] + 1
        spans[y] = r
    if not widths:
        return None, None

    maxw = max(widths.values())
    shoulder = None
    for y in sorted(widths, reverse=True):
        if widths[y] >= 0.50 * maxw:
            shoulder = y
            break
    if shoulder is None:
        return None, None

    sx0, sx1 = spans[shoulder]
    cx = (sx0 + sx1) / 2.0
    half = 0.30 * cw
    bx0 = int(max(x0, cx - half))
    bx1 = int(min(x1, cx + half))

    for y in range(y0, shoulder):
        if on[y, bx0:bx1 + 1].any():
            return float(y), float(cx)
    return None, None


def fmt_walk(recs):
    rows = []
    for k in KEYS:
        e = recs.get(k)
        if not e:
            continue
        ax = ", ".join(str(x) for x in e["anchorX"])
        fl = ", ".join('"%s"' % f for f in e["files"])
        rows.append(
            '  %-8s: { frames: %d, fps: %d, loop: true, w: %d, h: %d, scaleFix: %s, footY: 1.0,\n'
            '            anchorX: [%s],\n'
            '            files: [%s] }'
            % (k, e["frames"], e["fps"], e["w"], e["h"], e["scaleFix"], ax, fl))
    body = ("/* 4 帧行走循环。有它的武器，走路时画这一套（手里有武器），\n"
            "   没有就落回 ANIM_HOLD 的静帧，再没有才落回通用 walk clip。\n"
            "   帧号由 p.walk（累计位移）推导，不按时间自由播放 —— 原地踏步会\n"
            "   和实际移动对不上，看起来像滑步。\n"
            "   同一把武器 4 帧共用画布 w/h 与 scaleFix；anchorX 逐帧一个。 */\n"
            "window.%s = {\n" % BLOCK + ",\n".join(rows) + "\n};\n")
    return WA._block(BLOCK, body)


def measure_body(im, use_fallback=True):
    """一帧的身高锚：先走原画的头冠检测，失败再用 body_top 兜底。"""
    a = np.array(im)
    bbox = WA.content_bbox(a)
    if bbox is None:
        return None
    ground = WA.ground_row(a, bbox)
    head = WA.detect_head(a)
    top, cx = head["crownTop"], head["crownCx"]
    src = "crown"
    if top is None and use_fallback:
        top, cx = body_top(a, bbox)
        src = "body"
    return dict(H=im.height, W=im.width, ground=ground, top=top, cx=cx, src=src)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="",
                    help="条带目录（含 walk-<key>.png）；默认 $SD_IMG_SRC/weapon-walk")
    ap.add_argument("--only", default="", help="只切这几把（逗号分隔）")
    ap.add_argument("--fps", type=int, default=10, help="数据里的 fps 仅作参考值")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    global SRC
    if args.src:
        SRC = Path(args.src).expanduser()
    elif os.environ.get("SD_IMG_SRC"):
        SRC = SA.IMG_SRC / "weapon-walk"
    else:
        raise SystemExit("缺少生图源目录：设置环境变量 SD_IMG_SRC 指向 imagegen 的 output 目录，或用 --src 指定。")
    src = Path(SRC)
    if not src.is_dir():
        raise SystemExit("源图目录不存在：%s（检查 SD_IMG_SRC 或 --src）" % src)

    only = [x.strip() for x in args.only.split(",") if x.strip()]
    keys = [k for k in KEYS if (not only or k in only)]

    OUT_IMG.mkdir(parents=True, exist_ok=True)
    if args.debug:
        DBG.mkdir(parents=True, exist_ok=True)

    base = WA.idle_baseline()
    if not base.get("ratio_crown"):
        print("!! idle-0.webp 头冠检测失败，无法建立身高基准")
        return 1
    print("基准 idle-0.webp：头冠→脚底 / 画布高 = %.4f → 屏幕 %.2f px\n"
          % (base["ratio_crown"], TARGET_H * base["ratio_crown"]))

    recs, missing = {}, []
    for key in keys:
        path = src / ("walk-%s.png" % key)
        if not path.exists():
            print("缺图 %s → 跳过 %s" % (path.name, key))
            missing.append(key)
            continue

        rgb = np.array(Image.open(path).convert("RGB"))
        rgba, a = SA.cut_magenta(rgb)
        bounds, nseg = SA.frame_bounds(a, FRAMES)
        boxes = SQ.cell_bboxes(rgba, a, bounds)
        built = SQ.build_canvas(rgba, boxes)
        if not built:
            print("%s 切不出内容 → 跳过" % key)
            missing.append(key)
            continue
        frames, sc = built
        ms = [measure_body(im) for im in frames]

        # 身高锚：优先头冠，缺测的帧用兜底锚；两套都不成立的武器跳过
        tops = [m["top"] if m else None for m in ms]
        grounds = [m["ground"] if m else None for m in ms]
        if any(t is None for t in tops) or any(g is None for g in grounds):
            crown_med = SQ.median_or_none(tops)
            ground_med = SQ.median_or_none(grounds)
        else:
            crown_med = SQ.median_or_none(tops)
            ground_med = SQ.median_or_none(grounds)

        if crown_med is None or ground_med is None:
            print("%s 4 帧身高锚全部失败 → 跳过（不造假数据）" % key)
            missing.append(key)
            continue

        H, W = frames[0].height, frames[0].width
        body_px = float(ground_med - crown_med)
        fix = round(base["ratio_crown"] / (body_px / float(H)), 3)

        cx_all = [m["cx"] / m["W"] if m and m["cx"] is not None else None
                  for m in ms]
        cx_med = SQ.median_or_none(cx_all)
        anchors = []
        for cx in cx_all:
            if cx is None:
                anchors.append(round(cx_med, 4))
            elif cx_med and abs(cx - cx_med) / cx_med > SQ.ANCHOR_SPREAD:
                anchors.append(round(cx_med, 4))
            else:
                anchors.append(round(cx, 4))

        files, ok = [], True
        for i, im in enumerate(frames):
            if im is None:
                missing.append("%s#%d" % (key, i))
                ok = False
                continue
            name = "walk-%s-%d.webp" % (key, i)
            im.save(OUT_IMG / name, "WEBP", quality=90, alpha_quality=100, method=6)
            files.append("assets/anim/" + name)
            if args.debug:
                im.save(DBG / ("walk_%s_%d.png" % (key, i)))
        if not ok:
            continue

        recs[key] = dict(frames=len(files), fps=args.fps, w=W, h=H,
                         scaleFix=fix, anchorX=anchors, files=files)
        print("%-8s %d 帧 %dx%d scaleFix=%.3f 身高锚 %s 身体 %.0fpx→实渲 %.1fpx"
              % (key, len(files), W, H, fix, ms[0]["src"], body_px,
                 TARGET_H * fix * (body_px / float(H))))

    if not recs:
        print("\n!! 没有任何武器切出帧，anim-data.js 未改动")
        return 1

    print("\n=== 写 js/anim-data.js ===")
    src_js = OUT_JS.read_text(encoding="utf-8")
    src_js = WA._drop_block(src_js, BLOCK).rstrip()
    src_js = src_js + "\n\n" + fmt_walk(recs)
    OUT_JS.write_text(src_js, encoding="utf-8")
    print("  %s：%d 把武器" % (BLOCK, len(recs)))
    if missing:
        print("  跳过：%s" % ", ".join(missing))
    print("\n记得：node --check js/anim-data.js && node tools/selftest_weapons.mjs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
