# -*- coding: utf-8 -*-
"""素材污染自检：切片帧里有没有「上游把参考图原样回传」的废图。

为什么要有这个
--------------
图生图有时会静默失败 —— 上游不报错，直接把参考图返回。这种图肉眼看
「挺正常的」（因为它就是参考图），但姿势根本不对，切进游戏就是一个
站着不动的人在「挥砍」。实测出现过两次：

    walk-dagger-2-2.png  与参考图轮廓 IoU = 0.992
    walk-rock-2.png      与参考图轮廓 IoU = 0.984

判据：把每一帧归一化到固定尺寸后，和**同武器**的参考图比轮廓 IoU。
动作帧一定和站姿差很多（挥手、迈步、后仰），IoU 通常在 0.3~0.7；
**IoU > 0.93 基本只可能是原图回传**。

用法
----
  python tools/check_weapon_dup.py
  python tools/check_weapon_dup.py --thresh 0.90
  python tools/check_weapon_dup.py --json

退出码：无污染 0；发现疑似回传 1。
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
REF_DIR = ROOT / "_refs" / "hold-png"
ANIM = ROOT / "assets" / "anim"

KEYS = ["short", "dagger", "sword", "axe", "hammer",
        "spear", "bow", "rock", "blade", "jar", "bell"]

# 状态 -> 帧数
STATES = {"walk": 4, "jump": 2, "attack": 4, "hurt": 1, "pickup": 1}

N_W, N_H = 96, 192
DUP_IOU = 0.93      # 超过这个值基本等于「同一张图」


def silhouette(path):
    """读一张带 alpha 的 webp/png，裁到内容包围盒，归一化成固定尺寸二值图。"""
    im = Image.open(path).convert("RGBA")
    a = np.array(im)[..., 3]
    ys = np.where((a > 24).any(axis=1))[0]
    xs = np.where((a > 24).any(axis=0))[0]
    if not len(ys) or not len(xs):
        return None
    sub = (a[ys[0]:ys[-1] + 1, xs[0]:xs[-1] + 1] > 40).astype(np.uint8) * 255
    small = Image.fromarray(sub, "L").resize((N_W, N_H), Image.BILINEAR)
    return np.array(small) > 127


def iou(x, y):
    inter = np.logical_and(x, y).sum()
    union = np.logical_or(x, y).sum()
    return float(inter) / float(union) if union else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--thresh", type=float, default=DUP_IOU)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if not REF_DIR.is_dir():
        print("!! 参考图目录不存在：%s" % REF_DIR)
        return 1

    rows, hits = [], []
    for key in KEYS:
        ref_png = REF_DIR / ("ref-hold-%s.png" % key)
        if not ref_png.exists():
            rows.append(dict(key=key, state="-", frame="-", iou=None, verdict="NO_REF"))
            continue
        ref = silhouette(ref_png)
        if ref is None:
            rows.append(dict(key=key, state="-", frame="-", iou=None, verdict="BAD_REF"))
            continue

        for state, n in STATES.items():
            for i in range(n):
                f = ANIM / (("%s-%s-%d.webp" % (state, key, i)) if n > 1
                            else ("%s-%s.webp" % (state, key)))
                if not f.exists():
                    rows.append(dict(key=key, state=state, frame=i, iou=None,
                                     verdict="MISSING", file=f.name))
                    continue
                sil = silhouette(f)
                if sil is None:
                    rows.append(dict(key=key, state=state, frame=i, iou=None,
                                     verdict="EMPTY", file=f.name))
                    continue
                v = iou(sil, ref)
                verdict = "DUP" if v >= args.thresh else "ok"
                rows.append(dict(key=key, state=state, frame=i, iou=round(v, 3),
                                 verdict=verdict, file=f.name))
                if verdict == "DUP":
                    hits.append((key, state, i, v, f.name))

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
    else:
        print("判据：与同武器参考图的轮廓 IoU >= %.2f 判为「上游回传原图」\n" % args.thresh)
        dup = [r for r in rows if r["verdict"] == "DUP"]
        miss = [r for r in rows if r["verdict"] == "MISSING"]
        vals = [r["iou"] for r in rows if r.get("iou") is not None]
        if vals:
            print("全量 IoU：最小 %.3f / 中位 %.3f / 最大 %.3f（%d 帧）"
                  % (min(vals), float(np.median(vals)), max(vals), len(vals)))
        print("疑似回传：%d 帧；缺文件：%d 帧\n" % (len(dup), len(miss)))
        if dup:
            for r in dup:
                print("  !! %-8s %-7s #%d  IoU=%.3f  %s"
                      % (r["key"], r["state"], r["frame"], r["iou"], r["file"]))
        else:
            print("  没有发现原图回传的帧。")
    return 0 if not hits else 1


if __name__ == "__main__":
    sys.exit(main())
