# -*- coding: utf-8 -*-
"""量刀光素材的几何：不透明包围盒、质量重心、凸背方向、脊线弧心。

为什么要脚本：素材左右不对称，任何「按包围盒居中」的假设都会把月牙放歪。
朝向、锚点这两个结论必须由像素数字给出，不能靠肉眼。

输出 JSON，供 js/fx.js 的锚定常量与 tools/selftest_weapons.mjs 的断言共用。
只读 assets/，不写任何文件（除 stdout）。
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TARGETS = [
    "assets/slash-1.webp",
    "assets/slash-2.webp",
    "assets/slash-3.webp",
    "assets/fx/wp-slash-short.webp",
    "assets/fx/wp-slash-dagger.webp",
    "assets/fx/wp-slash-sword.webp",
    "assets/fx/wp-slash-axe.webp",
    "assets/fx/wp-slash-hammer.webp",
    "assets/fx/wp-slash-spear.webp",
]


def measure(path):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()

    # ---- 1. 不透明包围盒 + 质量重心（alpha 加权）----
    min_x, min_y, max_x, max_y = w, h, -1, -1
    sum_a = 0.0
    sum_x = 0.0
    sum_y = 0.0
    # 每列的 alpha 总量：找「最厚点」（月牙亮肚）
    col_mass = [0.0] * w
    for y in range(h):
        for x in range(w):
            a = px[x, y][3]
            if a <= 24:
                continue
            if x < min_x:
                min_x = x
            if y < min_y:
                min_y = y
            if x > max_x:
                max_x = x
            if y > max_y:
                max_y = y
            sum_a += a
            sum_x += a * x
            sum_y += a * y
            col_mass[x] += a

    if max_x < min_x:
        return None

    thick_x = col_mass.index(max(col_mass))
    cx = sum_x / sum_a
    cy = sum_y / sum_a

    # ---- 2. 逐行脊线（最长游程中点）→ 最小二乘圆拟合（Kåsa）----
    pts = []
    for y in range(min_y, max_y + 1):
        best_len = 0
        best_mid = None
        run_start = None
        for x in range(min_x, max_x + 2):
            opaque = x <= max_x and px[x, y][3] > 24
            if opaque and run_start is None:
                run_start = x
            elif not opaque and run_start is not None:
                length = x - run_start
                if length > best_len:
                    best_len = length
                    best_mid = (run_start + x - 1) / 2.0
                run_start = None
        if best_mid is not None:
            pts.append((best_mid, y))

    arc_cx = arc_cy = arc_r = None
    if len(pts) >= 8:
        # Kåsa: 解 x²+y² + D·x + E·y + F = 0
        n = len(pts)
        sx = sy = sxx = syy = sxy = sz = sxz = syz = 0.0
        for (x, y) in pts:
            z = x * x + y * y
            sx += x
            sy += y
            sxx += x * x
            syy += y * y
            sxy += x * y
            sz += z
            sxz += x * z
            syz += y * z
        # 正规方程
        a11, a12, a13 = sxx, sxy, sx
        a21, a22, a23 = sxy, syy, sy
        a31, a32, a33 = sx, sy, float(n)
        b1, b2, b3 = -sxz, -syz, -sz
        det = (a11 * (a22 * a33 - a23 * a32)
               - a12 * (a21 * a33 - a23 * a31)
               + a13 * (a21 * a32 - a22 * a31))
        if abs(det) > 1e-9:
            d = (b1 * (a22 * a33 - a23 * a32)
                 - a12 * (b2 * a33 - a23 * b3)
                 + a13 * (b2 * a32 - a22 * b3)) / det
            e = (a11 * (b2 * a33 - a23 * b3)
                 - b1 * (a21 * a33 - a23 * a31)
                 + a13 * (a21 * b3 - b2 * a31)) / det
            f = (a11 * (a22 * b3 - b2 * a32)
                 - a12 * (a21 * b3 - b2 * a31)
                 + b1 * (a21 * a32 - a22 * a31)) / det
            arc_cx = -d / 2.0
            arc_cy = -e / 2.0
            rr = arc_cx * arc_cx + arc_cy * arc_cy - f
            if rr > 0:
                arc_r = rr ** 0.5

    return {
        "file": path.replace("\\", "/"),
        "w": w, "h": h,
        "bbox": [min_x, min_y, max_x, max_y],
        # 归一化：0 = 左/上，1 = 右/下
        "bbox_n": [round(min_x / w, 4), round(min_y / h, 4),
                   round(max_x / w, 4), round(max_y / h, 4)],
        "mass_cx_n": round(cx / w, 4),
        "mass_cy_n": round(cy / h, 4),
        "thick_x_n": round(thick_x / w, 4),
        "arc_cx_n": None if arc_cx is None else round(arc_cx / w, 4),
        "arc_cy_n": None if arc_cy is None else round(arc_cy / h, 4),
        "arc_r_n": None if arc_r is None else round(arc_r / w, 4),
        # 凸背方向：背离弧心的一侧。弧心在右 → 凸背朝左
        "convex_dir": None if arc_cx is None else (
            -1 if arc_cx / w > 0.5 else 1),
    }


def main():
    out = []
    missing = []
    for rel in TARGETS:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            missing.append(rel)
            continue
        m = measure(path)
        if m:
            out.append(m)
        else:
            missing.append(rel + " (全透明)")
    json.dump({"items": out, "missing": missing},
              sys.stdout, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
