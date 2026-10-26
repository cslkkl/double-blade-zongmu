# -*- coding: utf-8 -*-
"""武器「4 帧出招序列」切片：seq-<key>.png（横向 4 格）-> atk-<key>-<i>.webp + WEAPON_ATTACK_CLIP。

与第一期 slice_weapon_assets.py 的关系：
  第一期每把武器只有 1 张出招姿态（atk-<key>.webp，写 WEAPON_ATTACK），
  保留作单帧降级；本脚本产出 4 帧序列，写新的 window.WEAPON_ATTACK_CLIP。
  抠图 / 去溢色 / 头冠锚 / 洋红自检 全部复用第一期，不另写一套。

统一画布（防抖动）：
  同一把武器的 4 帧必须同尺寸，否则播放时会跳。做法是取 4 格内容包围盒的
  并集外扩 4px 做底板，每帧按「底边贴齐 + 水平居中」放进去，再等比缩到长边 ≤ 560。
  底边贴齐 -> 脚底落点一致；水平居中 + 逐帧 anchorX -> 身体轴线一致。

scaleFix 每把武器一个（4 帧共用），按头冠锚取 4 格中位数 —— 逐帧各算会让角色忽大忽小。
anchorX 逐帧一个，偏离 4 帧中位数 > 8% 判误检，用中位数替换并在报告里标出。

用法：
  python tools/slice_weapon_seq.py           # 正常跑
  python tools/slice_weapon_seq.py --debug   # 额外写对齐调试图到 _dbg/
  python tools/slice_weapon_seq.py --src <目录>   # 默认 $SD_IMG_SRC/sanxingdui-weapon-seq
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

# 路径口径与 slice_anim.py 一致：源图走 $SD_IMG_SRC，产物落仓库内。
SRC = SA.IMG_SRC / "sanxingdui-weapon-seq"  # <SD_IMG_SRC>/sanxingdui-weapon-seq
OUT_IMG = Path(SA.OUT_IMG)
OUT_JS = Path(SA.OUT_JS)
DBG = SA.ROOT / "_dbg"

MAX_SIDE = 560
PAD = 4
FRAMES = 4
TARGET_H = WA.TARGET_H
TOL_RANGE = 3.0        # 4 帧屏幕身高极差上限（%）
ANCHOR_SPREAD = 0.08   # anchorX 偏离中位数上限（相对）

KEYS = ["short", "dagger", "sword", "axe", "hammer",
        "spear", "bow", "rock", "blade", "jar"]


# ---------------------------------------------------------------- 统一画布
def cell_bboxes(rgba, alpha, bounds):
    """每格内容的局部包围盒（相对该格左边界）。"""
    out = []
    for x0, x1 in zip(bounds[:-1], bounds[1:]):
        x0, x1 = int(x0), int(x1)
        sub = alpha[:, x0:x1]
        ys = np.where((sub > 24).any(axis=1))[0]
        xs = np.where((sub > 24).any(axis=0))[0]
        if not len(ys) or not len(xs):
            out.append(None)
            continue
        out.append(dict(x0=int(xs[0]), x1=int(xs[-1]),
                        y0=int(ys[0]), y1=int(ys[-1]),
                        cell_x0=x0, cell_x1=x1))
    return out


def build_canvas(rgba, boxes):
    """并集底板：底边贴齐 + 水平居中，再等比缩到长边 ≤ 560。"""
    sizes = [(b["x1"] - b["x0"] + 1, b["y1"] - b["y0"] + 1) for b in boxes if b]
    if not sizes:
        return None
    union_w = max(s[0] for s in sizes)
    union_h = max(s[1] for s in sizes)
    cw = union_w + PAD * 2
    chh = union_h + PAD * 2
    sc = min(MAX_SIDE / float(max(cw, chh)), 1.0)

    frames = []
    for b in boxes:
        if b is None:
            frames.append(None)
            continue
        crop = rgba[b["y0"]:b["y1"] + 1, b["cell_x0"] + b["x0"]:b["cell_x0"] + b["x1"] + 1]
        fw = b["x1"] - b["x0"] + 1
        fh = b["y1"] - b["y0"] + 1
        canvas = np.zeros((chh, cw, 4), np.uint8)
        ox = (cw - fw) // 2
        oy = chh - PAD - fh
        canvas[oy:oy + fh, ox:ox + fw] = crop
        im = Image.fromarray(canvas, "RGBA")
        if sc < 0.999:
            tw = max(1, int(round(cw * sc)))
            th = max(1, int(round(chh * sc)))
            arr = SA.resize_rgba_premul(np.array(im), (tw, th))
            im = Image.fromarray(arr, "RGBA")
        frames.append(SA.defringe_rgba(im))
    return frames, sc


def measure(im):
    """该帧在统一画布上的地面行 / 头冠。"""
    a = np.array(im)
    bbox = WA.content_bbox(a)
    if bbox is None:
        return None
    ground = WA.ground_row(a, bbox)
    head = WA.detect_head(a)
    return dict(H=im.height, W=im.width, ground=ground,
                crownTop=head["crownTop"], crownCx=head["crownCx"],
                crown_px=(ground - head["crownTop"]) if head["crownTop"] is not None else None)


def median_or_none(vals):
    v = [x for x in vals if x is not None]
    return float(np.median(v)) if v else None


# ---------------------------------------------------------------- 数据块
def fmt_clip(recs):
    rows = []
    for k in KEYS:
        e = recs[k]
        ax = ", ".join(str(x) for x in e["anchorX"])
        fl = ", ".join('"%s"' % f for f in e["files"])
        rows.append(
            '  %-8s: { frames: %d, w: %d, h: %d, scaleFix: %s, footY: 1.0,\n'
            '            anchorX: [%s],\n'
            '            files: [%s] }'
            % (k, e["frames"], e["w"], e["h"], e["scaleFix"], ax, fl))
    body = ("/* 4 帧出招序列。与 WEAPON_ATTACK（单帧降级）并存。\n"
            "   同一把武器的 4 帧共用同一画布 w/h 与同一个 scaleFix（否则播放会跳）。\n"
            "   anchorX 逐帧一个：身体轴线随姿势前后移，逐帧取才不漂。 */\n"
            "window.WEAPON_ATTACK_CLIP = {\n" + ",\n".join(rows) + "\n};\n")
    return WA._block("WEAPON_ATTACK_CLIP", body)


# ---------------------------------------------------------------- 主流程
def main(debug=False, src=None):
    global SRC
    if src:
        SRC = Path(src).expanduser()
    if not SRC.is_dir():
        if src is None and not os.environ.get("SD_IMG_SRC"):
            raise SystemExit("缺少生图源目录：设置环境变量 SD_IMG_SRC 指向 imagegen 的 output 目录，或用 --src 指定。")
        raise SystemExit("源图目录不存在：%s（检查 SD_IMG_SRC 或 --src）" % SRC)
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    if debug:
        DBG.mkdir(parents=True, exist_ok=True)

    base = WA.idle_baseline()
    if not base.get("ratio_crown"):
        print("!! idle-0.webp 头冠检测失败，无法建立基准")
        return 1
    print("基准 idle-0.webp：头冠→脚底 / 画布高 = %.4f  → 屏幕 %.2f px"
          % (base["ratio_crown"], TARGET_H * base["ratio_crown"]))
    print("（scaleFix 沿用第一期的头冠锚：既有 7 个 hold 帧实渲 177.1px，与此基准同源）\n")

    recs, missing, resid_rows = {}, [], []
    tiles = []
    all_ok = True

    for key in KEYS:
        png = "seq-%s.png" % key
        path = Path(SRC) / png
        if not path.exists():
            print("缺图 %s → 跳过 %s" % (png, key))
            missing.append(key)
            continue

        rgb = np.array(Image.open(path).convert("RGB"))
        rgba, a = SA.cut_magenta(rgb)
        bounds, nseg = SA.frame_bounds(a, FRAMES)
        boxes = cell_bboxes(rgba, a, bounds)
        built = build_canvas(rgba, boxes)
        if not built:
            print("%s 切不出内容 → 跳过" % key)
            missing.append(key)
            continue
        frames, sc = built
        ms = [measure(im) for im in frames]

        crown_med = median_or_none([m["crown_px"] if m else None for m in ms])
        cx_all = [m["crownCx"] / m["W"] if m and m["crownCx"] is not None else None
                  for m in ms]
        cx_med = median_or_none(cx_all)

        if crown_med is None:
            print("%s 4 帧全部头冠检测失败 → 跳过（不造假数据）" % key)
            missing.append(key)
            continue

        H = frames[0].height
        W = frames[0].width
        fix = round(base["ratio_crown"] / (crown_med / float(H)), 3)

        # anchorX：逐帧头冠中心，>8% 偏离用中位数替换
        anchors, anchor_flags = [], []
        for i, cx in enumerate(cx_all):
            if cx is None:
                anchors.append(round(cx_med, 4))
                anchor_flags.append("缺测→中位数")
                all_ok = False
            elif cx_med and abs(cx - cx_med) / cx_med > ANCHOR_SPREAD:
                anchors.append(round(cx_med, 4))
                anchor_flags.append("%.4f→中位数" % cx)
                all_ok = False
            else:
                anchors.append(round(cx, 4))
                anchor_flags.append("ok")

        files = []
        sizes_ok = True
        for i, im in enumerate(frames):
            if im is None:
                missing.append("%s#%d" % (key, i))
                continue
            name = "atk-%s-%d.webp" % (key, i)
            p_out = OUT_IMG / name
            now_r, first_r = WA.save_clean(im, p_out)
            resid_rows.append((name, now_r, first_r))
            files.append("assets/anim/" + name)
            if (im.width, im.height) != (W, H):
                sizes_ok = False

        recs[key] = dict(frames=len(files), w=W, h=H, scaleFix=fix,
                         anchorX=anchors, files=files)

        # ---- 验收数字 ----
        heights = [TARGET_H * fix * (m["crown_px"] / float(H)) for m in ms
                   if m and m["crown_px"]]
        rng = (max(heights) - min(heights)) / (sum(heights) / len(heights)) * 100 if heights else 0.0
        ax_ok = [v for v, f in zip(anchors, anchor_flags)]
        ax_spread = (max(ax_ok) - min(ax_ok))
        ax_spread_pct = ax_spread / (sum(ax_ok) / len(ax_ok)) * 100

        print("  %-8s 画布 %3dx%-3d  scaleFix %-6s  屏幕身高 %s  px  极差 %.2f%%%s"
              % (key, W, H, fix,
                 " / ".join("%.1f" % h for h in heights), rng,
                 "" if rng <= TOL_RANGE else "  <<超差"))
        print("           anchorX %s  离散 %.4f (%.1f%%)  同尺寸 %s"
              % (anchors, ax_spread, ax_spread_pct, "是" if sizes_ok else "**否**"))
        if any(f != "ok" for f in anchor_flags):
            print("           anchorX 修正：%s" % ", ".join(
                "f%d %s" % (i, f) for i, f in enumerate(anchor_flags) if f != "ok"))
        if rng > TOL_RANGE:
            all_ok = False
        if not sizes_ok:
            all_ok = False
        if nseg != FRAMES:
            print("           注意：列投影只切出 %d 段（需要 4），已按几何均分兜底" % nseg)

        if debug:
            for i, im in enumerate(frames):
                px = np.array(im.convert("RGB")).copy()
                m = ms[i]
                if m and m["crownTop"] is not None:
                    y = int(round(m["crownTop"]))
                    px[max(0, y - 1):y + 2, :, :] = [255, 215, 0]
                if m and m["crownCx"] is not None:
                    x = int(round(m["crownCx"]))
                    px[:, max(0, x - 1):x + 2, :] = [0, 110, 255]
                if m:
                    y = int(round(m["ground"]))
                    px[max(0, y - 1):y + 2, :, :] = [40, 210, 60]
                tiles.append((key, i, Image.fromarray(px, "RGB")))

    # ---------------------------------------------------------------- 写 js
    print("\n=== 写 js/anim-data.js ===")
    src = OUT_JS.read_text(encoding="utf-8")
    src = WA._drop_block(src, "WEAPON_ATTACK_CLIP").rstrip()
    if recs:
        src += "\n\n" + fmt_clip(recs)
        print("  WEAPON_ATTACK_CLIP：%d 个武器 %s"
              % (len(recs), ", ".join(k for k in KEYS if k in recs)))
    OUT_JS.write_text(src + "\n", encoding="utf-8")
    WA.node_check()

    if debug and tiles:
        cols = 8
        tw = max(t[2].width for t in tiles)
        th = max(t[2].height for t in tiles)
        rows = (len(tiles) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * (tw + 6), rows * (th + 6)), (30, 30, 34))
        for i, (k, fi, t) in enumerate(tiles):
            sheet.paste(t, ((i % cols) * (tw + 6), (i // cols) * (th + 6)))
        p = DBG / "seq-overlay.png"
        sheet.save(p)
        print("  对齐调试图（金=头冠顶 蓝=头冠中线 绿=脚底行）→ %s" % p)

    # ---------------------------------------------------------------- 残留 / 汇总
    print("\n=== 洋红残留（min(R,B)-G>40 且 alpha>20，写盘后读回）===")
    worst, cleaned = [], []
    for name, now_r, first_r in resid_rows:
        if now_r > 200:
            worst.append(name)
        if first_r != now_r:
            cleaned.append("%s %d→%d" % (name, first_r, now_r))
        print("  %-24s %5d%s" % (name, now_r, "  <<偏大" if now_r > 200 else ""))
    if cleaned:
        print("  定向去洋红：%s" % ", ".join(cleaned))
    print("  %s" % ("全部 ≤ 200" if not worst else "仍偏大：%s" % ", ".join(worst)))

    print("\n=== 汇总 ===")
    print("  缺图/跳过：%s" % (", ".join(missing) if missing else "无"))
    print("  帧数：%d 把武器 × 4 帧 = %d 张"
          % (len(recs), sum(len(r["files"]) for r in recs.values())))
    print("  结论：%s" % ("全部通过" if all_ok and not missing else "有修正项，见上"))
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true", help="写对齐调试图到 _dbg/")
    ap.add_argument("--src", default="",
                    help="源图目录（默认 $SD_IMG_SRC/sanxingdui-weapon-seq）")
    a = ap.parse_args()
    sys.exit(main(debug=a.debug, src=a.src or None))
