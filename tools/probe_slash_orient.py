# -*- coding: utf-8 -*-
"""分析刀光朝向探针截图：两个朝向是否互为镜像、凸背是否朝前。

输入由 Playwright 截图得到（PNG），所以不需要 getImageData，
也就绕开了 file:// 的 canvas 跨源污染。
"""
import sys

from PIL import Image

BG = (16, 16, 20)          # 探针画布底色 #101014
ANCHOR_X = 240             # facing=+1 的锚点
ANCHOR_X2 = 660            # facing=-1 的锚点
ANCHOR_Y = 230
HALF = 210                 # 每侧分析半径


def bright(px):
    r, g, b = px[0], px[1], px[2]
    return max(r, g, b)


def analyze(im, cx, cy):
    px = im.load()
    w, h = im.size
    x0, x1 = max(0, cx - HALF), min(w, cx + HALF)
    y0, y1 = max(0, cy - HALF), min(h, cy + HALF)
    sx = sy = wsum = 0.0
    minx, maxx, miny, maxy = 10 ** 9, -10 ** 9, 10 ** 9, -10 ** 9
    for y in range(y0, y1):
        for x in range(x0, x1):
            p = px[x, y]
            if p == BG:
                continue
            # 排除锚点竖线（纯绿 #2a6 = (34,170,102)）
            if p[1] > 120 and p[0] < 80 and p[2] > 70 and p[2] < 140:
                continue
            b = bright(p)
            if b <= 40:
                continue
            sx += (x - cx) * b
            sy += (y - cy) * b
            wsum += b
            minx, maxx = min(minx, x), max(maxx, x)
            miny, maxy = min(miny, y), max(maxy, y)
    if wsum <= 0:
        return None
    return {
        "mass_x": sx / wsum,
        "mass_y": sy / wsum,
        "bbox": (minx - cx, miny - cy, maxx - cx, maxy - cy),
        "mass": wsum,
    }


def main(path):
    im = Image.open(path).convert("RGB")
    a = analyze(im, ANCHOR_X, ANCHOR_Y)    # facing = +1
    b = analyze(im, ANCHOR_X2, ANCHOR_Y)   # facing = -1
    print("screenshot:", im.size)
    for name, r in (("facing=+1", a), ("facing=-1", b)):
        if not r:
            print(name, "无可测像素")
            continue
        side = "前（右）" if r["mass_x"] > 0 else "后（左）"
        print("%s  mass_x=%+7.2f  mass_y=%+6.2f  bbox=%s  亮肚在%s"
              % (name, r["mass_x"], r["mass_y"], r["bbox"], side))

    if not a or not b:
        sys.exit(1)

    # 断言 1：facing=+1 的亮肚必须在锚点右侧（朝前）
    ok1 = a["mass_x"] > 0
    # 断言 2：facing=-1 的亮肚必须在锚点左侧（朝前）
    ok2 = b["mass_x"] < 0
    # 断言 3：两者互为镜像（质量重心 x 反号，y 相同，误差 3px）
    ok3 = abs(a["mass_x"] + b["mass_x"]) < 3 and abs(a["mass_y"] - b["mass_y"]) < 3
    # 断言 4：包围盒也镜像
    ab, bb = a["bbox"], b["bbox"]
    ok4 = (abs(ab[0] + bb[2]) < 4 and abs(ab[2] + bb[0]) < 4
           and abs(ab[1] - bb[1]) < 4 and abs(ab[3] - bb[3]) < 4)

    print()
    print("  朝右时亮肚在前:", "PASS" if ok1 else "FAIL")
    print("  朝左时亮肚在前:", "PASS" if ok2 else "FAIL")
    print("  两朝向互为镜像:", "PASS" if ok3 else "FAIL",
          "(dx=%.2f dy=%.2f)" % (a["mass_x"] + b["mass_x"], a["mass_y"] - b["mass_y"]))
    print("  包围盒镜像:", "PASS" if ok4 else "FAIL", ab, bb)
    sys.exit(0 if (ok1 and ok2 and ok3 and ok4) else 1)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "slash-compare.png")
