# -*- coding: utf-8 -*-
"""武器「每把一套独立动作」切片：<key>-<sheet>.png → <state>-<key>-*.webp + WEAPON_CLIP。

核心设计：**同一把武器的所有状态共用一张画布、一个 scaleFix**
------------------------------------------------------------
早先的版本按「每个状态各自归一化到 174.6px」来算 scaleFix，这是错的：
跳跃是蹲姿、拾取是弯腰、受击是后仰，这些姿态的身体本来就短。把它们各自
拉到 174.6px，等于蹲着的人被放大成和站着一样高 —— 表现就是换状态时人物
忽大忽小。真出过这个 bug。

正确做法：同一把武器把**所有状态的格子**放进同一张画布（底边贴齐、水平居中），
用「站立相」（walk）测出身体像素高，算出一个 scaleFix 给全部状态共用。
这样：
  - 站立 → 屏幕 174.6px
  - 蹲姿 → 屏幕上就是矮的（正确）
  - 任何状态之间像素比例恒定（不会忽大忽小）

数据块：window.WEAPON_CLIP[key][state] = { frames, loop, fps, w, h,
                                           scaleFix, footY, anchorX[], files[] }

输入条带（纯洋红底、朝右、横向均匀 N 格）：
  <key>-walk.png    4 格   行走循环
  <key>-jump.png    2 格   屈膝起跳 / 滞空收腿
  <key>-attack.png  4 格   蓄力 → 挥出 → 收势 → 复位
  <key>-aux.png     2 格   第0格 受击后仰  第1格 弯腰拾取

  walk / jump / attack：一张条带的 N 格都属于同一状态 → 文件名带帧号
  aux：2 格里塞了两个状态（hurt / pickup）→ 每个状态 1 帧，文件名不带帧号

用法
----
  python tools/slice_weapon_states.py                       # 默认 $SD_IMG_SRC/weapon-states
  python tools/slice_weapon_states.py --src <条带目录>
  python tools/slice_weapon_states.py --src <目录> --only axe,hammer
  python tools/slice_weapon_states.py --src <目录> --sheets walk,attack
  python tools/slice_weapon_states.py --src <目录> --debug
"""
import argparse
import os
import re
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
OUT_IMG = ROOT / "assets" / "anim"
OUT_JS = ROOT / "js" / "anim-data.js"
DBG = ROOT / "_dbg"
WA.OUT_IMG = OUT_IMG
WA.OUT_JS = OUT_JS

BLOCK = "WEAPON_CLIP"
MAX_SIDE = SQ.MAX_SIDE
TARGET_H = WA.TARGET_H
PAD = SQ.PAD

WEAPON_KEYS = ["short", "dagger", "sword", "axe", "hammer",
               "spear", "bow", "rock", "blade", "jar", "bell"]

# sheet -> (格数, 产物状态列表, 是否循环, 参考 fps)
SHEETS = {
    "walk":   (4, ["walk"],           True,  10),
    "jump":   (2, ["jump"],           False, 0),
    "attack": (4, ["attack"],         False, 0),
    "aux":    (2, ["hurt", "pickup"], False, 0),
}
STATE_ORDER = ["walk", "jump", "attack", "hurt", "pickup"]


def body_top(a, bbox):
    """兜底的身高锚：肩线以上、轮廓中心 ±0.30 宽的竖带里最上面那个有内容的行。

    WA.detect_head 找的是原画那顶**金色**头冠（R>=180 G>=145 B<=160）。
    图生图的青铜绿面具素材经常不满足该条件（实测 11 把里 8 把失败），
    所以这里改看轮廓：不猜颜色，举过头顶的武器也落在竖带之外、不计入身高。
    """
    x0, x1, y0, y1 = bbox
    cw = x1 - x0 + 1
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


def read_cells(png, cells):
    """读一张条带 → [(rgba裁剪, 内容框宽, 内容框高, 相对格左的x0, y0), ...] + alpha。"""
    rgb = np.array(Image.open(png).convert("RGB"))
    rgba, a = SA.cut_magenta(rgb)
    bounds, _n = SA.frame_bounds(a, cells)
    out = []
    for x0, x1 in zip(bounds[:-1], bounds[1:]):
        x0, x1 = int(x0), int(x1)
        sub_a = a[:, x0:x1]
        ys = np.where((sub_a > 24).any(axis=1))[0]
        xs = np.where((sub_a > 24).any(axis=0))[0]
        if not len(ys) or not len(xs):
            out.append(None)
            continue
        ys0, ys1 = int(ys[0]), int(ys[-1])
        xs0, xs1 = int(xs[0]), int(xs[-1])
        crop = rgba[ys0:ys1 + 1, x0 + xs0:x0 + xs1 + 1]
        # 头冠中线（相对裁剪宽度）：逐帧 anchorX
        bbox = (0, crop.shape[1] - 1, 0, crop.shape[0] - 1)
        _top, cx = body_top(crop, bbox)
        ax = (cx / float(crop.shape[1])) if cx is not None else None
        out.append(dict(crop=crop, w=crop.shape[1], h=crop.shape[0], anchor=ax))
    return out


def build_shared_canvas(cells_all):
    """把一把武器所有状态的格子放进同一张画布：底边贴齐 + 水平居中。

    返回 (跨状态统一画布尺寸 (cw, ch), 缩放系数 sc)。
    """
    ws = [c["w"] for c in cells_all if c]
    hs = [c["h"] for c in cells_all if c]
    if not ws:
        return None
    cw = max(ws) + PAD * 2
    ch = max(hs) + PAD * 2
    sc = min(MAX_SIDE / float(max(cw, ch)), 1.0)
    return (cw, ch), sc


def place(cell, cw, ch, sc):
    """一格的裁剪 → 统一画布上的一张图（底边贴齐、水平居中）。"""
    canvas = np.zeros((ch, cw, 4), np.uint8)
    ox = (cw - cell["w"]) // 2
    oy = ch - PAD - cell["h"]
    canvas[oy:oy + cell["h"], ox:ox + cell["w"]] = cell["crop"]
    im = Image.fromarray(canvas, "RGBA")
    if sc < 0.999:
        tw = max(1, int(round(cw * sc)))
        th = max(1, int(round(ch * sc)))
        arr = SA.resize_rgba_premul(np.array(im), (tw, th))
        im = Image.fromarray(arr, "RGBA")
    return SA.defringe_rgba(im)


def measure_standing(frames):
    """在站立相上量身体像素高（ground - 头顶）。只用 walk 的几帧。"""
    vals = []
    for im in frames:
        arr = np.array(im)
        bbox = WA.content_bbox(arr)
        if bbox is None:
            continue
        g = WA.ground_row(arr, bbox)
        top, _cx = body_top(arr, bbox)
        if g is None or top is None:
            continue
        vals.append(g - top)
    if not vals:
        return None
    return float(np.median(vals))


def slice_weapon(src, key, sheets, base_ratio, debug):
    """切一把武器的全部状态。返回 {state: rec} 或 (None, 原因)。"""
    per_sheet = {}
    for sheet in sheets:
        if sheet not in SHEETS:
            continue
        cells_n = SHEETS[sheet][0]
        png = src / ("%s-%s.png" % (key, sheet))
        if not png.exists():
            continue
        cells = read_cells(png, cells_n)
        if all(c is None for c in cells):
            print("    %s 切不出内容，跳过" % png.name)
            continue
        per_sheet[sheet] = cells

    if not per_sheet:
        return None, "没有任何可用条带"

    all_cells = [c for cells in per_sheet.values() for c in cells if c]
    built = build_shared_canvas(all_cells)
    if not built:
        return None, "统一画布建不出来"
    (cw, ch), sc = built

    # 先落盘，再在「站立相」上量身高 —— 用同一张画布，所以量出来就是最终像素
    placed = {}
    for sheet, cells in per_sheet.items():
        out_states = SHEETS[sheet][1]
        split_each = len(out_states) > 1
        groups = {}
        for i, cell in enumerate(cells):
            if cell is None:
                continue
            im = place(cell, cw, ch, sc)
            state = out_states[i] if split_each else out_states[0]
            groups.setdefault(state, []).append(dict(im=im, anchor=cell["anchor"]))
        placed[sheet] = groups

    stand = placed.get("walk") or []
    stand_frames = [g["im"] for g in stand] if isinstance(stand, list) else []
    if not stand_frames:
        # 没有 walk 就用任意第一个状态的帧兜底（比例可能略偏，但不会崩）
        for gs in placed.values():
            for st in gs.values():
                stand_frames.extend([x["im"] for x in st])
            if stand_frames:
                break
    body_px = measure_standing(stand_frames)
    if not body_px:
        return None, "站立相量不出身高"

    H, W = stand_frames[0].height, stand_frames[0].width
    fix = round(base_ratio / (body_px / float(H)), 3)

    recs = {}
    for sheet, groups in placed.items():
        loop, fps = SHEETS[sheet][2], SHEETS[sheet][3]
        for state, items in groups.items():
            multi = len(items) > 1
            files, anchors = [], []
            for j, it in enumerate(items):
                name = ("%s-%s-%d.webp" % (state, key, j)) if multi else ("%s-%s.webp" % (state, key))
                it["im"].save(OUT_IMG / name, "WEBP", quality=90, alpha_quality=100, method=6)
                files.append("assets/anim/" + name)
                anchors.append(round(it["anchor"], 4) if it["anchor"] is not None else 0.5)
                if debug:
                    DBG.mkdir(parents=True, exist_ok=True)
                    it["im"].save(DBG / ("%s_%s_%d.png" % (state, key, j)))
            recs[state] = dict(frames=len(files), w=W, h=H, scaleFix=fix,
                               anchorX=anchors, files=files, loop=loop, fps=fps)
    return recs, None


def fmt_clip(recs):
    out = []
    for k in WEAPON_KEYS:
        st = recs.get(k)
        if not st:
            continue
        rows = []
        for state in STATE_ORDER:
            e = st.get(state)
            if not e:
                continue
            ax = ", ".join(str(x) for x in e["anchorX"])
            fl = ", ".join('"%s"' % f for f in e["files"])
            rows.append(
                '    %-8s { frames: %d, loop: %s, fps: %d, w: %d, h: %d, scaleFix: %s,\n'
                '              footY: 1.0, anchorX: [%s],\n'
                '              files: [%s] }'
                % (state + ":", e["frames"],
                   "true" if e["loop"] else "false", e["fps"],
                   e["w"], e["h"], e["scaleFix"], ax, fl))
        out.append("  %-8s {\n%s\n  }" % (k + ":", ",\n".join(rows)))
    body = ("/* 每把武器一套独立动作。查不到某个 state 时，渲染层逐级回落到公共 clip。\n"
            "   ★ 同一把武器所有状态共用**同一张画布 w/h 与同一个 scaleFix**：\n"
            "     蹲姿 / 弯腰 / 后仰的身体本来就短，若各自归一化到同一屏幕身高，\n"
            "     换状态时人会忽大忽小（这是踩过的 bug）。共用画布保证像素比例恒定。\n"
            "   anchorX 逐帧一个：身体轴线随姿势前后移。\n"
            "   帧号来源：walk 跟 p.walk 位移、attack 跟 swingT 判定、\n"
            "             jump 看 vy、hurt/pickup 跟各自计时器。 */\n"
            "window.%s = {\n" % BLOCK + ",\n".join(out) + "\n};\n")
    return WA._block(BLOCK, body)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="",
                    help="条带目录（含 <key>-<sheet>.png）；默认 $SD_IMG_SRC/weapon-states")
    ap.add_argument("--only", default="")
    ap.add_argument("--sheets", default="")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    if args.src:
        src = Path(args.src).expanduser()
    elif os.environ.get("SD_IMG_SRC"):
        src = SA.IMG_SRC / "weapon-states"
    else:
        raise SystemExit("缺少生图源目录：设置环境变量 SD_IMG_SRC 指向 imagegen 的 output 目录，或用 --src 指定。")
    if not src.is_dir():
        raise SystemExit("源图目录不存在：%s（检查 SD_IMG_SRC 或 --src）" % src)

    only = [x.strip() for x in args.only.split(",") if x.strip()]
    keys = [k for k in WEAPON_KEYS if (not only or k in only)]
    sheets = [x.strip() for x in args.sheets.split(",") if x.strip()] or list(SHEETS)

    OUT_IMG.mkdir(parents=True, exist_ok=True)
    base = WA.idle_baseline()
    if not base.get("ratio_crown"):
        print("!! idle-0.webp 头冠检测失败，无法建立身高基准")
        return 1
    print("基准：头冠→脚底 / 画布高 = %.4f → 屏幕 %.2f px"
          % (base["ratio_crown"], TARGET_H * base["ratio_crown"]))
    print("口径：同一把武器所有状态共用一张画布 + 一个 scaleFix（站立相量身高）\n")

    recs, skipped = {}, []
    for key in keys:
        got, why = slice_weapon(src, key, sheets, base["ratio_crown"], args.debug)
        if got is None:
            print("  %-8s 跳过：%s" % (key, why))
            skipped.append(key)
            continue
        recs[key] = got
        st = got[list(got)[0]]
        # 站立身高按构造恒等于 TARGET_H × 基准比例 —— scaleFix 就是为此外推的，
        # 直接把构造目标印出来，别再用某个硬编码比例倒算（那样会印出误导性数字）。
        print("  %-8s %d 状态  画布 %dx%d  scaleFix=%.3f  站立站立 %.1fpx  状态=%s"
              % (key, len(got), st["w"], st["h"], st["scaleFix"],
                 TARGET_H * base["ratio_crown"], "/".join(got.keys())))

    if not recs:
        print("\n!! 一张都没切出来，anim-data.js 未改动")
        return 1

    print("\n=== 写 js/anim-data.js ===")
    s = OUT_JS.read_text(encoding="utf-8")
    s = WA._drop_block(s, BLOCK).rstrip()
    s = s + "\n\n" + fmt_clip(recs)
    OUT_JS.write_text(s, encoding="utf-8")
    print("  %s：%d 把武器 / %d 个状态块" % (BLOCK, len(recs), sum(len(v) for v in recs.values())))
    if skipped:
        print("  跳过：%s" % ", ".join(skipped))

    # ---- 公共 clip 保护 ----
    # 本脚本只该新增 <state>-<key>-* 与 <state>-<key>，绝不该碰公共动画帧
    # （attack-<i> / attack-heavy-<i> / attack-thrust-<i> / walk-<i> / hurt-<i> ...）。
    # 命名空间撞车过一次：早期把 attack-<key>-<i> 写对之前，误删过 20 张公共帧。
    # 这里把「数据里还引用着、但磁盘上没有」的帧列出来，交付前必须为空。
    missing = []
    for m in re.finditer(r'"(assets/anim/[^"]+)"', OUT_JS.read_text(encoding="utf-8")):
        rel = m.group(1)
        if not (ROOT / rel).exists():
            missing.append(rel)
    if missing:
        print("\n!! 数据引用但磁盘缺失 %d 个文件（可能是公共 clip 被误删）：" % len(missing))
        for rel in missing[:20]:
            print("   " + rel)
        return 1

    print("\n记得：node --check js/anim-data.js && node tools/selftest_weapons.mjs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
