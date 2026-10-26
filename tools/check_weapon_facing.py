# -*- coding: utf-8 -*-
"""素材朝向自检：所有武器条带的每一格，是否与原画参考图**同向**（朝右）。

为什么需要这个工具
------------------
条带是图生图产物，同一批里出现过镜像、白底、比例漂移。肉眼逐张看 44 张 ×
2~4 格容易漏，而且「看起来对」这件事没法交接。这里把「朝向」变成可执行判据：

    角色是左右不对称的（鼻子、面具朝向、武器在一侧、披风在后），所以把
    alpha 的列投影当作「侧影指纹」。拿每一格和参考图比两次相关：
      - 原样比      → 同向时的相似度
      - 镜像后比    → 反向时的相似度
    镜像那侧明显更高 = 这一格被画反了。

    判据：score_same - score_mirror > MARGIN 才算同向；
          < -MARGIN 判反向；中间地带判「不确定」，交人工看。

为什么不用颜色/五官检测
----------------------
原画的头冠是金色、新素材是青铜色，颜色阈值在这批里不可靠（detect_head 就栽在
这上面）。列投影只看轮廓，与配色、光影、描边粗细都无关，跨批次也能用。

用法
----
  python tools/check_weapon_facing.py                 # 查默认源目录
  python tools/check_weapon_facing.py --src <目录>
  python tools/check_weapon_facing.py --cells 4       # 强制每张按 4 格等分
  python tools/check_weapon_facing.py --json          # 机器可读

退出码：全同向 0；有任何反向或不确定 1。
"""
import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import slice_anim as SA             # noqa: E402

ROOT = HERE.parent
REF_DIR = ROOT / "_refs" / "hold-png"
# 源条带目录：--src > $SD_IMG_SRC/weapon-states > 报错
DEFAULT_SRC = SA.IMG_SRC / "weapon-states"

WEAPON_KEYS = ["short", "dagger", "sword", "axe", "hammer",
               "spear", "bow", "rock", "blade", "jar", "bell"]

# 条带 -> 格数（与 slice_weapon_states.py 的 SHEETS 保持一致）
SHEET_CELLS = {"walk": 4, "jump": 2, "attack": 4, "aux": 2}

MARGIN = 0.10        # 同向 / 反向的判定间隔
MIN_PIXELS = 200     # 内容太少不判（空帧 / 切坏）


def profile_of(alpha):
    """列投影指纹：每列 alpha 之和，按总量归一化。

    只看轮廓左右分布，不看颜色 —— 换配色、换描边粗细都不影响。
    """
    col = alpha.astype(np.float32).sum(axis=0)
    total = col.sum()
    if total <= 0:
        return None
    return col / total


def resample(p, n=128):
    """统一采样到固定长度，两张图尺寸不同也能比。"""
    if p is None:
        return None
    idx = np.linspace(0, len(p) - 1, n)
    return np.interp(idx, np.arange(len(p)), p)


def corr(a, b):
    a = a - a.mean()
    b = b - b.mean()
    d = np.sqrt((a * a).sum() * (b * b).sum())
    if d <= 1e-9:
        return 0.0
    return float((a * b).sum() / d)


def cell_alphas(rgb, cells):
    """把条带切成 cells 格，返回每格的 alpha（已抠洋红）。"""
    rgba, a = SA.cut_magenta(rgb)
    bounds, _n = SA.frame_bounds(a, cells)
    out = []
    for x0, x1 in zip(bounds[:-1], bounds[1:]):
        x0, x1 = int(x0), int(x1)
        out.append(a[:, x0:x1])
    return out


def check_one(png, ref_profile, cells):
    """返回 (verdict, same, mirror, 每格明细)"""
    rgb = np.array(Image.open(png).convert("RGB"))
    alphas = cell_alphas(rgb, cells)
    detail = []
    worst = None
    for i, al in enumerate(alphas):
        if (al > 24).sum() < MIN_PIXELS:
            detail.append(dict(cell=i, verdict="empty", same=None, mirror=None))
            continue
        p = resample(profile_of(al))
        same = corr(p, ref_profile)
        mirror = corr(p, ref_profile[::-1])
        if same - mirror > MARGIN:
            v = "same"
        elif mirror - same > MARGIN:
            v = "MIRRORED"
        else:
            v = "unclear"
        detail.append(dict(cell=i, verdict=v, same=round(same, 3), mirror=round(mirror, 3)))
        # 取最像参考图的那一格作为整张的代表（有些姿势武器换手，单格不可靠）
        score = same - mirror
        if worst is None or score < worst[0]:
            worst = (score, i)

    if worst is None:
        return "empty", None, None, detail
    score, _i = worst
    verdict = "same" if score > MARGIN else ("MIRRORED" if score < -MARGIN else "unclear")
    return verdict, detail[0]["same"], detail[0]["mirror"], detail


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="",
                    help="源条带目录（默认 $SD_IMG_SRC/weapon-states）")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--cells", type=int, default=0, help="强制格数（默认按条带名推断）")
    args = ap.parse_args()

    if args.src:
        src = Path(args.src).expanduser()
    elif os.environ.get("SD_IMG_SRC"):
        src = DEFAULT_SRC
    else:
        raise SystemExit("缺少生图源目录：设置环境变量 SD_IMG_SRC 指向 imagegen 的 output 目录，或用 --src 指定。")
    if not src.is_dir():
        raise SystemExit("源图目录不存在：%s（检查 SD_IMG_SRC 或 --src）" % src)
    if not REF_DIR.is_dir():
        print("!! 参考图目录不存在：%s" % REF_DIR)
        return 1

    rows, bad = [], []
    for key in WEAPON_KEYS:
        ref = REF_DIR / ("ref-hold-%s.png" % key)
        if not ref.exists():
            rows.append(dict(key=key, sheet="-", verdict="NO_REF"))
            bad.append((key, "-", "NO_REF"))
            continue
        rgb = np.array(Image.open(ref).convert("RGB"))
        _rgba, ra = SA.cut_magenta(rgb)
        ref_profile = resample(profile_of(ra))
        if ref_profile is None:
            rows.append(dict(key=key, sheet="-", verdict="BAD_REF"))
            bad.append((key, "-", "BAD_REF"))
            continue

        for sheet, cells in SHEET_CELLS.items():
            png = src / ("%s-%s.png" % (key, sheet))
            if not png.exists():
                rows.append(dict(key=key, sheet=sheet, verdict="MISSING"))
                continue
            n = args.cells or cells
            verdict, same, mirror, detail = check_one(png, ref_profile, n)
            rows.append(dict(key=key, sheet=sheet, verdict=verdict,
                             same=same, mirror=mirror, cells=detail))
            if verdict != "same":
                bad.append((key, sheet, verdict))

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=1))
    else:
        print("参照：_refs/hold-png/ref-hold-<key>.png（原画站立帧，一律朝右）")
        print("判据：列投影相关，same-mirror > %.2f 判同向\n" % MARGIN)
        print("%-8s %-7s %-9s %s" % ("武器", "条带", "判定", "各格 same/mirror"))
        for r in rows:
            if "cells" in r:
                cells_txt = " ".join("%s(%s/%s)" % (c["cell"], c["same"], c["mirror"])
                                     for c in r["cells"])
                print("%-8s %-7s %-9s %s" % (r["key"], r["sheet"], r["verdict"], cells_txt))
            else:
                print("%-8s %-7s %-9s" % (r["key"], r["sheet"], r["verdict"]))
        print()
        if bad:
            print("!! %d 项需要处理：" % len(bad))
            for k, s, v in bad:
                print("   %-8s %-7s %s" % (k, s, v))
        else:
            print("全部同向（朝右），可以切片。")
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
