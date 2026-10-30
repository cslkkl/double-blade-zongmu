# -*- coding: utf-8 -*-
"""把五段图生视频拼成 20 秒竖屏宣传短片。

产物：assets/promo/short.mp4
中间文件：assets/promo/text、assets/promo/work
"""
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PROMO = ROOT / "assets" / "promo"
TEXT = PROMO / "text"
WORK = PROMO / "work"
W, H = 720, 1280
FPS = 30
CLIP = 3.5
END = 2.8
TOTAL = CLIP * 5 + END

# 系统字体按系统路径找：这两个文件名随 Windows 版本可能不同
# （msyhbd.ttc / msyh.ttc 是 Win10/11 的微软雅黑常规与粗体），换系统先确认文件在。
FONT_B = "C:/Windows/Fonts/msyhbd.ttc"
FONT_R = "C:/Windows/Fonts/msyh.ttc"
CREAM = (242, 226, 182)
BODY = (206, 196, 174)
DIM = (150, 140, 120)


def font(size, bold=True):
    return ImageFont.truetype(FONT_B if bold else FONT_R, size)


def center_text(draw, y, text, f, fill, shadow=True):
    box = draw.textbbox((0, 0), text, font=f)
    x = (W - (box[2] - box[0])) // 2
    if shadow:
        draw.text((x + 2, y + 2), text, font=f, fill=(0, 0, 0, 180))
    draw.text((x, y), text, font=f, fill=fill)


def caption(name, lines, size=32):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    f = font(size)
    widths = [draw.textbbox((0, 0), s, font=f)[2] for s in lines]
    pad_x, pad_y, gap = 26, 18, 10
    box_w = min(W - 80, max(widths) + pad_x * 2)
    line_h = size + 10
    box_h = pad_y * 2 + line_h * len(lines) + gap * (len(lines) - 1)
    x0 = (W - box_w) // 2
    y0 = 916 - box_h // 2
    draw.rounded_rectangle((x0, y0, x0 + box_w, y0 + box_h), radius=14, fill=(0, 0, 0, 128))
    y = y0 + pad_y
    for s in lines:
        w = draw.textbbox((0, 0), s, font=f)[2]
        draw.text(((W - w) // 2, y), s, font=f, fill=(255, 255, 255, 255))
        y += line_h + gap
    img.save(TEXT / name)


def gamelabel():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    center_text(draw, 372, "第 一 阵 · 锈 蚀 试 探", font(20, False), (201, 167, 101))
    img.save(TEXT / "gamelabel.png")


def brand():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    f = font(20, False)
    draw.text((44, 58), "《双刃战士 · 纵目》", font=f, fill=(201, 167, 101, 220))
    draw.line((44, 92, 300, 92), fill=(201, 167, 101, 90), width=1)
    img.save(TEXT / "brand.png")


def endcard():
    bg = Image.open(PROMO / "endcard_bronze_clean.jpg").convert("RGB")
    scale = max(W / bg.width, H / bg.height)
    bg = bg.resize((round(bg.width * scale), round(bg.height * scale)), Image.LANCZOS)
    left = (bg.width - W) // 2
    top = (bg.height - H) // 2
    bg = bg.crop((left, top, left + W, top + H)).convert("RGBA")
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shade).rounded_rectangle((48, 300, W - 48, 1010), radius=26, fill=(6, 8, 10, 118))
    bg = Image.alpha_composite(bg, shade)
    draw = ImageDraw.Draw(bg)

    center_text(draw, 948, "《双刃战士 · 纵目》", font(18, False), (201, 167, 101))
    center_text(draw, 340, "吉金万里", font(66), CREAM)
    draw.line((W // 2 - 80, 445, W // 2 + 80, 445), fill=(201, 167, 101, 170), width=1)
    center_text(draw, 480, "中国西南及岭南地区青铜文明特展", font(21, False), BODY)
    center_text(draw, 566, "东莞市博物馆新馆 1F", font(30), CREAM)
    center_text(draw, 622, "展期至 2027.01", font(23, False), BODY)
    center_text(draw, 720, "去 看 真 的", font(40), (245, 217, 142))
    center_text(draw, 826, "6 省 18 家文博机构 · 202 件文物", font(19, False), DIM)
    center_text(draw, 1092, "文化依据：馆方《吉金万里 重点文物说明》", font(15, False), DIM)
    center_text(draw, 1122, "AI 生成画面，非考古复原", font(15, False), DIM)
    bg.convert("RGB").save(TEXT / "endcard.jpg", quality=94)


def ambient():
    sr = 44100
    t = np.arange(int(sr * TOTAL)) / sr
    drone = (0.10 * np.sin(2 * np.pi * 55 * t)
             + 0.05 * np.sin(2 * np.pi * 110 * t)
             + 0.03 * np.sin(2 * np.pi * 164.81 * t))
    drone *= 0.75 + 0.25 * np.sin(2 * np.pi * 0.08 * t)
    rng = np.random.default_rng(7)
    noise = rng.standard_normal(len(t))
    smooth = np.empty_like(noise)
    acc = 0.0
    for i, v in enumerate(noise):
        acc = 0.995 * acc + 0.005 * v
        smooth[i] = acc
    mix = drone + smooth * 0.10
    for start in (0.0, CLIP, CLIP * 2, CLIP * 3, CLIP * 4, CLIP * 5):
        n = int(sr * 0.7)
        tt = np.arange(n) / sr
        hit = (0.30 * np.sin(2 * np.pi * 220 * tt)
               + 0.18 * np.sin(2 * np.pi * 329.63 * tt)
               + 0.12 * np.sin(2 * np.pi * 440 * tt)) * np.exp(-tt * 9)
        hit += 0.45 * np.sin(2 * np.pi * 60 * tt) * np.exp(-tt * 12)
        idx = int(start * sr)
        mix[idx:idx + n] += hit
    fade = np.ones_like(mix)
    n_in, n_out = int(sr * 0.4), int(sr * 1.2)
    fade[:n_in] = np.linspace(0, 1, n_in)
    fade[-n_out:] = np.linspace(1, 0, n_out)
    mix *= fade
    mix /= max(1e-6, np.max(np.abs(mix))) * 1.15
    pcm = (mix * 32767).astype(np.int16)
    stereo = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(str(PROMO / "ambient.wav"), "wb") as fp:
        fp.setnchannels(2)
        fp.setsampwidth(2)
        fp.setframerate(sr)
        fp.writeframes(stereo.tobytes())


def run(args):
    subprocess.run(args, check=True)


def build():
    TEXT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)

    caption("cap1.png", ["青铜器最怕的一种病"])
    caption("cap2.png", ["它叫青铜病", "绿色粉状锈，会传染"])
    caption("cap3.png", ["我们把这种病，做成了敌人"])
    caption("cap4.png", ["潮湿有氧，它自己一直在加速"])
    caption("cap5.png", ["但那张脸，是按馆方原文画的"])
    brand()
    gamelabel()
    endcard()
    ambient()

    clips = ["clip_01_corrosion.mp4", "clip_02_spread.mp4", "clip_03_game.mp4",
             "clip_04_enemy.mp4", "clip_05_face2.mp4"]
    norm = []
    for i, name in enumerate(clips, 1):
        out = WORK / f"n{i:02d}.mp4"
        run(["ffmpeg", "-v", "error", "-y", "-i", str(PROMO / name), "-t", str(CLIP),
             "-vf", "crop=iw*0.94:ih*0.94:0:0,scale=720:1280,setsar=1,fps=30",
             "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(out)])
        norm.append(out)

    end_clip = WORK / "n06.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", str(TEXT / "endcard.jpg"),
         "-t", str(END), "-vf", "fps=30", "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", str(end_clip)])
    norm.append(end_clip)

    lines = "\n".join(f"file '{p.as_posix()}'" for p in norm)
    (WORK / "concat.txt").write_text(lines, encoding="utf-8")
    base = WORK / "base.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0",
         "-i", str(WORK / "concat.txt"), "-c", "copy", str(base)])

    timed = WORK / "timed.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(base),
         "-i", str(TEXT / "cap1.png"), "-i", str(TEXT / "cap2.png"),
         "-i", str(TEXT / "cap3.png"), "-i", str(TEXT / "cap4.png"),
         "-i", str(TEXT / "cap5.png"), "-i", str(TEXT / "brand.png"),
         "-i", str(TEXT / "gamelabel.png"),
         "-filter_complex",
         "[0:v][1:v]overlay=0:0:enable='between(t,0.4,3.2)'[v1];"
         "[v1][2:v]overlay=0:0:enable='between(t,3.9,6.9)'[v2];"
         "[v2][3:v]overlay=0:0:enable='between(t,7.4,10.4)'[v3];"
         "[v3][4:v]overlay=0:0:enable='between(t,10.9,13.9)'[v4];"
         "[v4][5:v]overlay=0:0:enable='between(t,14.4,17.4)'[v5];"
         "[v5][6:v]overlay=0:0:enable='between(t,0.5,17.4)'[v6];"
         "[v6][7:v]overlay=0:0:enable='between(t,7.0,10.4)'[v7]",
         "-map", "[v7]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
         "-r", "30", str(timed)])

    out = PROMO / "short.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(timed), "-i", str(PROMO / "ambient.wav"),
         "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
         "-shortest", "-movflags", "+faststart", str(out)])
    print(out, out.stat().st_size)


if __name__ == "__main__":
    build()
