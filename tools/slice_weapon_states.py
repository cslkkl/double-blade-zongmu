# -*- coding: utf-8 -*-
"""武器「每把一套独立动作」切片：<key>-<state>.png（横向 N 格）-> <state>-<key>-<i>.webp + WEAPON_CLIP。

为什么要有这个脚本
------------------
早先的实现里，走路 / 跳跃 / 受击 / 拾取都复用**公共 clip**（12 个动作全角色共用、
手上没武器），只有站定和出招有武器专属图。结果是「站着有武器、一走一空手、
一跳更空手」，连续性断在最常发生的几个动作上。

这里把「每把武器 × 每个动作」都做成独立素材，写进一个统一的数据块
`window.WEAPON_CLIP`，渲染层按状态查表，查不到才逐级回落。

输入
----
  <key>-<state>.png   横向 N 格条带，纯洋红底，角色朝右

  state 与格数（与 art-a/b/c 三组的交付口径一致）：
    idle   1    站定（缺省直接用 hold-<key>，一般不用生成）
    walk   4    行走循环
    jump   2    起跳 / 滞空
    attack 4    蓄力 → 挥出 → 收势 → 复位
    hurt   1    受击后仰
    pickup 1    弯腰拾取

输出
----
  assets/anim/<state>-<key>-<i>.webp
  js/anim-data.js 里的 window.WEAPON_CLIP 数据块

用法
----
  python tools/slice_weapon_states.py --src <条带目录>
  python tools/slice_weapon_states.py --src <目录> --only axe,hammer
  python tools/slice_weapon_states.py --src <目录> --states walk,jump
  python tools/slice_weapon_states.py --src <目录> --debug
"""
import argparse
import io
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
# 产物路径显式指到仓库内 —— 不复用 slice_anim 的 OUT_IMG（那个是相对硬编码
# SRC 拼的，换机器就没有该目录）。
OUT_IMG = ROOT / "assets" / "anim"
OUT_JS = ROOT / "js" / "anim-data.js"
DBG = ROOT / "_dbg"
WA.OUT_IMG = OUT_IMG
WA.OUT_JS = OUT_JS

BLOCK = "WEAPON_CLIP"
MAX_SIDE = SQ.MAX_SIDE
TARGET_H = WA.TARGET_H

WEAPON_KEYS = ["short", "dagger", "sword", "axe", "hammer",
               "spear", "bow", "rock", "blade", "jar", "bell"]

# 条带规格 sheet -> (格数, 这一张切出的产物状态列表, 是否循环, 数据里的参考 fps)
#
# 注意 aux 这一条：它不是「一个叫 aux 的状态」，而是**一张 2 格的条带里塞了
# 两个独立状态** —— 第 0 格受击、第 1 格拾取。渲染层要的是 hurt / pickup 两个
# 各自的记录，所以这里按格号拆开写进数据块，而不是把 aux 当成一个状态塞进去。
# （早先版本就把 aux 当状态用了，结果 char-rig 查 hurt 查不到、一路掉回公共 clip。）
SHEETS = {
    "idle":   (1, ["idle"],             False, 0),
    "walk":   (4, ["walk"],             True, 10),
    "jump":   (2, ["jump"],             False, 0),
    "attack": (4, ["attack"],           False, 0),
    "aux":    (2, ["hurt", "pickup"],   False, 0),   # 第 0 格 → hurt，第 1 格 → pickup
}
STATE_ORDER = ["idle", "walk", "jump", "attack", "hurt", "pickup"]


def body_top(a, bbox):
    """兜底的身高锚：从肩线往上取「躯干正上方」那一条竖带的最上行。

    为什么需要它：WA.detect_head 找的是原画那顶**金色**头冠
    （R>=180 G>=145 B<=160）。图生图新出的素材即使是同一角色，金冠条件也
    经常不成立（实测 11 把里 8 把失败）。这里不猜颜色，只看轮廓：

      1. 肩线 = 从脚底往上扫，第一个宽度 >= 最大宽 50% 的行
      2. 头 = 以肩线行的轮廓中心为轴、左右各 0.30 倍宽度的一条竖带，
         从顶部往下第一个有内容的行
      3. 举过头顶的武器（锤 / 钺 / 矛）通常偏向一侧，落在竖带之外，不计入身高
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


def measure_body(im):
    """一帧的身高锚：先走原画的头冠检测，失败再用 body_top 兜底。"""
    a = np.array(im)
    bbox = WA.content_bbox(a)
    if bbox is None:
        return None
    ground = WA.ground_row(a, bbox)
    head = WA.detect_head(a)
    top, cx = head["crownTop"], head["crownCx"]
    src = "crown"
    if top is None:
        top, cx = body_top(a, bbox)
        src = "body"
    return dict(H=im.height, W=im.width, ground=ground, top=top, cx=cx, src=src)


def slice_sheet(path, cells_n, base_ratio, key, sheet, debug):
    """切一张条带，按状态分组落盘。

    返回 (recs, None) 或 (None, 原因)。recs 是 {state: 数据记录}。

    分组规则（这里踩过一个坑，必须写清楚）：
      - `walk` / `jump` / `attack`：一张条带的 N 格都属于**同一个**状态，
        文件名必须带帧号 `<state>-<key>-<i>.webp`，否则 4 格会互相覆盖，
        最后只剩 1 个文件（真出过这个 bug：44 张被压成 11 张）。
      - `aux`：2 格里塞了**两个不同状态**（第 0 格 hurt、第 1 格 pickup），
        每个状态只有 1 帧，文件名不带帧号 `<state>-<key>.webp`。
    """
    rgb = np.array(Image.open(path).convert("RGB"))
    rgba, a = SA.cut_magenta(rgb)
    bounds, _nseg = SA.frame_bounds(a, cells_n)
    boxes = SQ.cell_bboxes(rgba, a, bounds)
    built = SQ.build_canvas(rgba, boxes)
    if not built:
        return None, "切不出内容"
    imgs, _sc = built
    ms = [measure_body(im) for im in imgs]

    tops = [m["top"] if m else None for m in ms]
    grounds = [m["ground"] if m else None for m in ms]
    top_med = SQ.median_or_none(tops)
    ground_med = SQ.median_or_none(grounds)
    if top_med is None or ground_med is None:
        return None, "身高锚全部失败"

    H, W = imgs[0].height, imgs[0].width
    body_px = float(ground_med - top_med)
    fix = round(base_ratio / (body_px / float(H)), 3)

    cx_all = [m["cx"] / m["W"] if m and m["cx"] is not None else None for m in ms]
    cx_med = SQ.median_or_none(cx_all)
    anchors = []
    for cx in cx_all:
        if cx is None or (cx_med and abs(cx - cx_med) / cx_med > SQ.ANCHOR_SPREAD):
            anchors.append(round(cx_med, 4))
        else:
            anchors.append(round(cx, 4))

    out_states = SHEETS[sheet][1]
    split_each = len(out_states) > 1          # aux 这种「一格一个状态」
    groups = {}
    for i, im in enumerate(imgs):
        if im is None:
            return None, "第 %d 格为空" % i
        state = out_states[i] if split_each else out_states[0]
        groups.setdefault(state, []).append((i, im, anchors[i]))

    recs = {}
    for state, items in groups.items():
        loop, fps = (True, 10) if state == "walk" else (False, 0)
        files = []
        multi = len(items) > 1
        for j, (cell_i, im, _anc) in enumerate(items):
            name = ("%s-%s-%d.webp" % (state, key, j)) if multi else ("%s-%s.webp" % (state, key))
            im.save(OUT_IMG / name, "WEBP", quality=90, alpha_quality=100, method=6)
            files.append("assets/anim/" + name)
            if debug:
                DBG.mkdir(parents=True, exist_ok=True)
                im.save(DBG / ("%s_%s_%d.png" % (state, key, j)))
        recs[state] = dict(frames=len(files), w=W, h=H, scaleFix=fix,
                           anchorX=[it[2] for it in items], files=files,
                           loop=loop, fps=fps,
                           anchor_src=ms[0]["src"], body_px=body_px)
    return recs, None


def fmt_clip(recs):
    """recs: key -> {state -> rec}"""
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
    body = ("/* 每把武器一套独立动作。查不到某个 state 时，渲染层逐级回落到\n"
            "   公共 clip（见 char-rig.js 的 weaponClipDef / drawWeaponState）。\n"
            "   - 同一把武器同一 state 的所有帧共用画布 w/h 与一个 scaleFix\n"
            "   - anchorX 逐帧一个：身体轴线随姿势前后移，逐帧才不漂\n"
            "   - walk 是循环（帧号跟 p.walk 位移走）；attack 跟 swingT；\n"
            "     jump / hurt / pickup 是单次播放\n"
            "   生成方式：图生图，参考 _refs/hold-png/ref-hold-<key>.png，\n"
            "   保证 11 把武器之间画风一致。 */\n"
            "window.%s = {\n" % BLOCK + ",\n".join(out) + "\n};\n")
    return WA._block(BLOCK, body)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="条带目录（含 <key>-<sheet>.png）")
    ap.add_argument("--only", default="", help="只切这几把（逗号分隔）")
    ap.add_argument("--sheets", default="", help="只切这几张条带（walk,jump,attack,aux）")
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    src = Path(args.src)
    if not src.is_dir():
        print("!! 源目录不存在：%s" % src)
        return 1

    only = [x.strip() for x in args.only.split(",") if x.strip()]
    keys = [k for k in WEAPON_KEYS if (not only or k in only)]
    sheets = [x.strip() for x in args.sheets.split(",") if x.strip()] or list(SHEETS)

    OUT_IMG.mkdir(parents=True, exist_ok=True)

    base = WA.idle_baseline()
    if not base.get("ratio_crown"):
        print("!! idle-0.webp 头冠检测失败，无法建立身高基准")
        return 1
    print("基准 idle-0.webp：头冠→脚底 / 画布高 = %.4f → 屏幕 %.2f px\n"
          % (base["ratio_crown"], TARGET_H * base["ratio_crown"]))

    recs, skipped = {}, []
    for key in keys:
        for sheet in sheets:
            if sheet not in SHEETS:
                continue
            cells, out_states, loop, fps = SHEETS[sheet]
            path = src / ("%s-%s.png" % (key, sheet))
            if not path.exists():
                continue
            res = slice_sheet(path, cells, base["ratio_crown"], key, sheet, args.debug)
            if res[0] is None:
                print("  %-8s %-7s 跳过：%s" % (key, sheet, res[1]))
                skipped.append("%s-%s" % (key, sheet))
                continue
            got = res[0]
            for state, rec in got.items():
                recs.setdefault(key, {})[state] = rec
            print("  %-8s %-7s %d 格 → %s  %dx%d scaleFix=%.3f 锚=%s 实渲 %.1fpx"
                  % (key, sheet, cells, "/".join(got.keys()),
                     got[list(got)[0]]["w"], got[list(got)[0]]["h"],
                     got[list(got)[0]]["scaleFix"],
                     got[list(got)[0]]["anchor_src"],
                     TARGET_H * got[list(got)[0]]["scaleFix"]
                     * (got[list(got)[0]]["body_px"] / float(got[list(got)[0]]["h"]))))

    if not recs:
        print("\n!! 一张都没切出来，anim-data.js 未改动")
        return 1

    print("\n=== 写 js/anim-data.js ===")
    s = OUT_JS.read_text(encoding="utf-8")
    s = WA._drop_block(s, BLOCK).rstrip()
    s = s + "\n\n" + fmt_clip(recs)
    OUT_JS.write_text(s, encoding="utf-8")
    total = sum(len(v) for v in recs.values())
    print("  %s：%d 把武器 / %d 个状态块" % (BLOCK, len(recs), total))
    if skipped:
        print("  跳过：%s" % ", ".join(skipped))
    print("\n记得：node --check js/anim-data.js && node tools/selftest_weapons.mjs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
