# -*- coding: utf-8 -*-
"""每阵场景的三层切图：远景 / 中景 / 地面。

输入（生图产物，纯洋红底）：
    SRC/wave<N>/w<N>-far.png      远景：整幅天空 + 极淡地平线剪影（不需要洋红底）
    SRC/wave<N>/w<N>-mid.png      中景：洋红底上的接地建筑带
    SRC/wave<N>/w<N>-ground.png   地面：洋红底上的地表条

输出（写进 assets/bg/，只写这三类文件，不碰别的）：
    assets/bg/far-<N>.webp        1600x900，RGB（远景是整幅画面，不带 alpha）
    assets/bg/mid-<N>.webp        宽 1600，RGBA（裁到内容框，底部接地）
    assets/bg/ground-<N>.webp     宽 1672，RGBA（裁到内容框，底部接地）

为什么尺寸是这三个数：与 index.html + background.js 的现有几何对齐 ——
远景按宽度等比缩到 W、中景按素材原尺寸平铺、地面高度恒等于 H - GROUND。
换成不同的宽高会让「远景等比、中景原尺寸」这条加宽规则失配。

用法：
    python tools/prep_scene.py --waves 1
    python tools/prep_scene.py --waves 1,2,3,4,5,6
缺哪一阵的生图就跳过哪一阵，并打印提示（不报错）。

洋红配方与 prep_assets.py 完全一致（mag = min(R,B) - G，双阈值 45/115），
抠完做 decontaminate 去溢色 —— 不另写第二套，否则边缘紫边又会各批不一致。
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(r"C:\Users\11965\Desktop\imagegen无限\output\三星堆-场景")
DST = Path(r"C:\Users\11965\Desktop\三星堆\assets\bg")

FAR_W, FAR_H = 1600, 900
MID_W = 1600
GROUND_W = 1672


# ---------------------------------------------------------------- 抠图（同 prep_assets）

def decontaminate(a: np.ndarray, passes: int = 4) -> np.ndarray:
    """把半透明边缘像素的颜色向邻近不透明像素靠拢，消除洋红污染。"""
    rgb = a[..., :3].astype(np.float32)
    alpha = a[..., 3].astype(np.float32)

    for _ in range(passes):
        up = np.roll(rgb, -1, axis=0); up_w = np.roll(alpha, -1, axis=0)
        dn = np.roll(rgb, 1, axis=0);  dn_w = np.roll(alpha, 1, axis=0)
        lf = np.roll(rgb, -1, axis=1); lf_w = np.roll(alpha, -1, axis=1)
        rt = np.roll(rgb, 1, axis=1);  rt_w = np.roll(alpha, 1, axis=1)

        stack_c = np.stack([up, dn, lf, rt], axis=2)
        stack_a = np.stack([up_w, dn_w, lf_w, rt_w], axis=2)

        valid = stack_a > np.maximum(alpha[..., None], 200)
        wsum = valid.sum(axis=2)

        need = (alpha > 0) & (alpha < 250) & (wsum > 0)
        if not need.any():
            break

        weighted = (stack_c * valid[..., None]).sum(axis=2)
        avg = weighted / np.maximum(wsum, 1)[..., None]
        rgb[need] = rgb[need] * 0.35 + avg[need] * 0.65

    out = a.copy()
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out


def key_magenta(img: Image.Image, lo=45, hi=115) -> Image.Image:
    a = np.array(img.convert("RGBA")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = np.minimum(r, b) - g

    alpha = a[..., 3].astype(np.float32)

    full = mag > hi
    alpha[full] = 0

    t = np.clip((mag - lo) / float(hi - lo), 0, 1)
    soft = (mag > lo) & (~full)
    alpha[soft] = alpha[soft] * (1.0 - t[soft])

    purple = (mag > 12) & (alpha > 0)
    a[..., 0] = np.where(purple, np.minimum(a[..., 0], a[..., 1] + 34), a[..., 0])
    a[..., 2] = np.where(purple, np.minimum(a[..., 2], a[..., 1] + 34), a[..., 2])

    a[..., 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    a = decontaminate(a.astype(np.uint8), passes=5)
    return Image.fromarray(a, "RGBA")


def magenta_residue(img: Image.Image) -> int:
    """不透明处仍明显偏洋红的像素数（min(R,B)-G > 40 且 alpha > 20）。"""
    a = np.array(img.convert("RGBA")).astype(np.int16)
    mag = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    return int(((mag > 40) & (a[..., 3] > 20)).sum())


def crop_content(img: Image.Image) -> Image.Image:
    bbox = img.split()[3].getbbox()
    if not bbox:
        return img
    return img.crop(bbox)


def resize_w(img: Image.Image, w: int) -> Image.Image:
    h = max(1, int(round(img.height * w / float(img.width))))
    return img.resize((w, h), Image.LANCZOS)


def save(img: Image.Image, path: Path, q=88):
    img.save(path, "WEBP", quality=q, method=6)
    kb = path.stat().st_size / 1024
    print("    %-22s %4dx%-4d %7.1f KB  %s" % (
        path.name, img.width, img.height, kb,
        "RGBA" if img.mode == "RGBA" else "RGB"))
    return kb


# ---------------------------------------------------------------- 每阵

def do_wave(n: int) -> float:
    src = SRC / ("wave%d" % n)
    print("\n=== 第 %d 阵  %s ===" % (n, src))
    total = 0.0

    # 远景：整幅天空，没有洋红底，只裁成 16:9 再缩到 1600x900
    far_src = src / ("w%d-far.png" % n)
    if far_src.exists():
        im = Image.open(far_src).convert("RGB")
        # 居中裁成 FAR_W:FAR_H，再缩到目标尺寸（避免非等比拉伸）
        tr = FAR_W / FAR_H
        w, h = im.size
        if w / h > tr:
            cut = int(round(h * tr))
            x0 = (w - cut) // 2
            im = im.crop((x0, 0, x0 + cut, h))
        else:
            cut = int(round(w / tr))
            y0 = (h - cut) // 2
            im = im.crop((0, y0, w, y0 + cut))
        im = im.resize((FAR_W, FAR_H), Image.LANCZOS)
        total += save(im, DST / ("far-%d.webp" % n), 86)
    else:
        print("    跳过远景：没有 %s" % far_src.name)

    # 中景：洋红底接地建筑带，裁到内容框后固定宽度
    mid_src = src / ("w%d-mid.png" % n)
    if mid_src.exists():
        im = crop_content(key_magenta(Image.open(mid_src)))
        im = resize_w(im, MID_W)
        total += save(im, DST / ("mid-%d.webp" % n), 88)
        print("    中景洋红残留 %d" % magenta_residue(Image.open(DST / ("mid-%d.webp" % n))))
    else:
        print("    跳过中景：没有 %s" % mid_src.name)

    # 地面：洋红底地表条，裁到内容框后固定宽度
    gd_src = src / ("w%d-ground.png" % n)
    if gd_src.exists():
        im = crop_content(key_magenta(Image.open(gd_src)))
        im = resize_w(im, GROUND_W)
        total += save(im, DST / ("ground-%d.webp" % n), 88)
        print("    地面洋红残留 %d" % magenta_residue(Image.open(DST / ("ground-%d.webp" % n))))
    else:
        print("    跳过地面：没有 %s" % gd_src.name)

    return total


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--waves", default="1",
                    help="逗号分隔的阵次，例如 1,2,3")
    args = ap.parse_args()

    DST.mkdir(parents=True, exist_ok=True)
    waves = [int(x) for x in args.waves.split(",") if x.strip()]
    total = 0.0
    for n in waves:
        total += do_wave(n)

    print("\n=== 合计 %.1f KB ===" % total)
    print("下一步：node tools/selftest_enemies.mjs 之外，另跑 selftest_drop 与 check-inline；")
    print("       场景层不参与帧数据，但 assets.js 的 MANIFEST 与 background.js 的降级链要一起改。")


if __name__ == "__main__":
    sys.exit(main())
