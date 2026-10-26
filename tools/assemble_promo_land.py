# -*- coding: utf-8 -*-
"""横屏 1600x900 宣传短片：字幕卡、配乐、拼接。

产物：assets/promo/short_land.mp4
中间文件：assets/promo/land/text、assets/promo/land/work
"""
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LAND = ROOT / "assets" / "promo" / "land"
TEXT = LAND / "text"
WORK = LAND / "work"
W, H = 1600, 900
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
GOLD = (201, 167, 101)

SCALE = [293.66, 349.23, 392.0, 440.0, 523.25]   # D F G A C，与游戏 BGM 同音阶
SR = 44100


def font(size, bold=True):
    return ImageFont.truetype(FONT_B if bold else FONT_R, size)


def center_text(draw, y, text, f, fill):
    box = draw.textbbox((0, 0), text, font=f)
    x = (W - (box[2] - box[0])) // 2
    draw.text((x + 2, y + 2), text, font=f, fill=(0, 0, 0, 170))
    draw.text((x, y), text, font=f, fill=fill)


def caption(name, lines, size=34):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    f = font(size)
    widths = [draw.textbbox((0, 0), s, font=f)[2] for s in lines]
    pad_x, pad_y, gap = 30, 18, 10
    box_w = min(W - 120, max(widths) + pad_x * 2)
    line_h = size + 10
    box_h = pad_y * 2 + line_h * len(lines) + gap * (len(lines) - 1)
    x0 = (W - box_w) // 2
    y0 = 792 - box_h // 2
    draw.rounded_rectangle((x0, y0, x0 + box_w, y0 + box_h), radius=14, fill=(0, 0, 0, 128))
    y = y0 + pad_y
    for s in lines:
        w = draw.textbbox((0, 0), s, font=f)[2]
        draw.text(((W - w) // 2, y), s, font=f, fill=(255, 255, 255, 255))
        y += line_h + gap
    img.save(TEXT / name)


def brand():
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.text((62, 52), "《双刃战士 · 纵目》", font=font(25, False), fill=(201, 167, 101, 225))
    draw.line((62, 92, 372, 92), fill=(201, 167, 101, 90), width=1)
    img.save(TEXT / "brand.png")


def vignette():
    """轻微暗角，统一实拍感与扁平画风的观感。"""
    yy, xx = np.mgrid[0:H, 0:W]
    r = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) / 1.414
    a = np.clip((r - 0.52) / 0.48, 0, 1) ** 1.8 * 118
    img = np.zeros((H, W, 4), np.uint8)
    img[..., 3] = a.astype(np.uint8)
    Image.fromarray(img, "RGBA").save(TEXT / "vig.png")


def endcard():
    tex = Image.open(LAND / "corrosion_spread_clean.jpg").convert("RGB")
    tw, th = int(tex.width * 0.64), int(tex.height * 0.62)
    tex = tex.crop(((tex.width - tw) // 2, (tex.height - th) // 2,
                    (tex.width + tw) // 2, (tex.height + th) // 2))
    tex = tex.resize((W, H), Image.LANCZOS)
    tex = Image.eval(tex.filter(ImageFilter.GaussianBlur(26)), lambda v: int(v * 0.32)).convert("RGBA")
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((440, 60, 1160, 800), fill=(26, 96, 86, 100))
    bg = Image.alpha_composite(tex, glow.filter(ImageFilter.GaussianBlur(180)))
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shade).rounded_rectangle((260, 40, 1340, 860), radius=70, fill=(5, 7, 9, 150))
    bg = Image.alpha_composite(bg, shade.filter(ImageFilter.GaussianBlur(52)))
    draw = ImageDraw.Draw(bg)

    center_text(draw, 96, "《双刃战士 · 纵目》", font(19, False), GOLD)
    center_text(draw, 150, "吉金万里", font(80), CREAM)
    draw.line((W // 2 - 90, 272, W // 2 + 90, 272), fill=(201, 167, 101, 170), width=1)
    center_text(draw, 294, "中国西南及岭南地区青铜文明特展", font(26, False), BODY)
    center_text(draw, 382, "东莞市博物馆新馆 1F", font(38), CREAM)
    center_text(draw, 436, "展期至 2027.01", font(26, False), BODY)
    center_text(draw, 512, "去 看 真 的", font(48), (245, 217, 142))
    center_text(draw, 600, "6 省 18 家文博机构 · 202 件文物", font(20, False), DIM)
    center_text(draw, 758, "文化依据：馆方《吉金万里 重点文物说明》", font(16, False), DIM)
    center_text(draw, 786, "AI 生成画面，非考古复原", font(16, False), DIM)
    bg.convert("RGB").save(TEXT / "endcard.jpg", quality=94)


def fft_convolve(x, h):
    n = 1 << int(np.ceil(np.log2(len(x) + len(h) - 1)))
    y = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(h, n), n)
    return y[:len(x)]


def music():
    n = int(SR * TOTAL)
    t = np.arange(n) / SR
    mono = np.zeros(n)
    left = np.zeros(n)
    right = np.zeros(n)

    # 低频持续音：55Hz 基频加三次谐波，缓慢起伏
    drone = (0.100 * np.sin(2 * np.pi * 55 * t)
             + 0.052 * np.sin(2 * np.pi * 110 * t)
             + 0.030 * np.sin(2 * np.pi * 165 * t)
             + 0.018 * np.sin(2 * np.pi * 220 * t))
    drone *= 0.72 + 0.28 * np.sin(2 * np.pi * 0.07 * t - 1.2)
    mono += drone

    def add(buf, start, sig, pan=0.0):
        i = int(start * SR)
        seg = sig[:max(0, n - i)]
        if len(seg) == 0:
            return
        gl = 0.5 * (1 - pan)
        gr = 0.5 * (1 + pan)
        buf[0][i:i + len(seg)] += seg * gl * 2
        buf[1][i:i + len(seg)] += seg * gr * 2

    def kick(gain=1.0, dur=0.34):
        m = int(SR * dur)
        tt = np.arange(m) / SR
        f = 62 * np.exp(-tt * 6.5) + 38
        sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 11)
        return sig * 0.10 * gain

    def gong(gain=1.0):
        m = int(SR * 1.7)
        tt = np.arange(m) / SR
        base = 1080
        sig = (np.sin(2 * np.pi * base * tt) * np.exp(-tt * 2.6) * 0.030
               + np.sin(2 * np.pi * base * 1.414 * tt) * np.exp(-tt * 3.4) * 0.015
               + np.sin(2 * np.pi * base * 2.09 * tt) * np.exp(-tt * 4.6) * 0.011)
        return sig * gain

    def tom(gain=1.0):
        m = int(SR * 0.75)
        tt = np.arange(m) / SR
        f = 74 * np.exp(-tt * 4.2) + 48
        sig = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 6.5)
        return sig * 0.085 * gain

    def pluck(freq, gain=1.0):
        m = int(SR * 0.62)
        tt = np.arange(m) / SR
        sig = (np.sin(2 * np.pi * freq * tt) * 0.032
               + np.sin(2 * np.pi * freq * 3 * tt) * 0.012
               + np.sin(2 * np.pi * freq * 5 * tt) * 0.005)
        return sig * np.exp(-tt * 7.5) * gain

    add((mono, mono), 0.20, kick(1.15, 1.0))
    add((mono, mono), 0.30, gong(0.7))
    add((mono, mono), 3.50, gong(0.55))
    for s in (3.6, 4.6, 5.6, 6.6):
        add((mono, mono), s, kick(0.62))
    for s in np.arange(7.0, 10.5, 1.0):
        add((mono, mono), s, kick(0.78))
    add((mono, mono), 7.4, gong(0.34))
    for s in (7.9, 9.4):
        add((mono, mono), s, gong(0.20))
    add((mono, mono), 10.50, gong(1.0))
    for s in np.arange(10.5, 14.0, 0.5):
        add((mono, mono), s, tom(1.25))
        add((mono, mono), s, kick(1.05, 0.55))
    for s in (11.4, 12.8):
        add((mono, mono), s, gong(0.34))
    add((mono, mono), 14.00, gong(0.85))
    for s in (14.2, 15.2, 16.2, 17.0):
        add((mono, mono), s, kick(0.7))
    add((mono, mono), 17.55, gong(1.0))
    add((mono, mono), 17.55, kick(0.9, 1.2))

    motif = [0, 3, 1, 4, 3, 2, 0, 1]
    times = [0.85, 2.2, 3.05, 4.2, 5.35, 6.2, 7.8, 8.65, 9.5,
             11.05, 12.2, 13.35, 15.2, 16.35]
    for i, s in enumerate(times):
        add((left, right), s, pluck(SCALE[motif[i % len(motif)]], 1.0),
            0.42 if i % 2 == 0 else -0.42)

    # 收尾前的噪声上扬
    m = int(SR * 1.0)
    tt = np.arange(m) / SR
    rng = np.random.default_rng(11)
    noise = rng.standard_normal(m)
    ramp = (tt / tt[-1]) ** 2.2
    hi = np.zeros(m)
    acc = 0.0
    for i in range(m):
        a = 1 - np.exp(-2 * np.pi * (600 + 5200 * tt[i]) / SR)
        acc += a * (noise[i] - acc)
        hi[i] = acc
    add((mono, mono), 16.5, hi * ramp * 0.055)

    # 混响：合成一段指数衰减脉冲
    m = int(SR * 0.9)
    tt = np.arange(m) / SR
    rng = np.random.default_rng(5)
    ir = rng.standard_normal(m) * np.exp(-tt / 0.28)
    ir[0] = 1.0
    ir /= np.sqrt(np.sum(ir ** 2))
    mono = fft_convolve(mono, ir) * 1.35
    left = fft_convolve(left + mono * 0.55, ir) * 0.55
    right = fft_convolve(right + mono * 0.55, ir) * 0.55

    stereo = np.stack([left, right], axis=1)
    build = np.interp(t, [0, 3.5, 7, 10.5, 14, 17.5, 20.3],
                      [0.62, 0.72, 0.82, 0.95, 1.02, 1.10, 0.98])
    fade = np.ones(n)
    n_in, n_out = int(SR * 0.5), int(SR * 1.6)
    fade[:n_in] = np.linspace(0, 1, n_in)
    fade[-n_out:] = np.linspace(1, 0, n_out) ** 1.4
    stereo *= (fade * build)[:, None]
    stereo /= np.max(np.abs(stereo)) * 1.18
    pcm = (stereo * 32767).astype(np.int16)
    with wave.open(str(LAND / "bgm.wav"), "wb") as fp:
        fp.setnchannels(2)
        fp.setsampwidth(2)
        fp.setframerate(SR)
        fp.writeframes(pcm.tobytes())


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
    vignette()
    endcard()
    music()

    clips = ["clip_01_corrosion.mp4", "clip_02_spread.mp4"]
    norm = []
    for i, name in enumerate(clips, 1):
        out = WORK / f"n{i:02d}.mp4"
        run(["ffmpeg", "-v", "error", "-y", "-i", str(LAND / name), "-t", str(CLIP),
             "-vf", "crop=iw*0.875:ih*0.875:0:0,scale=1600:900,setsar=1,fps=30",
             "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(out)])
        norm.append(out)

    # 游戏画面用原图缓推，保住像素与文字；角色、敌人同理，避免生成模型改写画风
    for i, (src, zoom) in enumerate(
            [(LAND / "game_frame.jpg", 1.035), (LAND / "enemy_frame.jpg", 1.07),
             (LAND / "face_frame.jpg", 1.07)], 3):
        out = WORK / f"n{i:02d}.mp4"
        run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", str(src), "-t", str(CLIP),
             "-vf", (f"scale=3200:1800,"
                     f"zoompan=z='min(1+{zoom - 1:.4f}*on/105,{zoom})'"
                     f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
                     f":d=1:s=1600x900:fps=30"),
             "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", str(out)])
        norm.append(out)

    end_clip = WORK / "n06.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", str(TEXT / "endcard.jpg"),
         "-t", str(END), "-vf", "fps=30", "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", str(end_clip)])
    norm.append(end_clip)

    (WORK / "concat.txt").write_text(
        "\n".join(f"file '{p.as_posix()}'" for p in norm), encoding="utf-8")
    base = WORK / "base.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0",
         "-i", str(WORK / "concat.txt"), "-c", "copy", str(base)])

    timed = WORK / "timed.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(base),
         "-i", str(TEXT / "cap1.png"), "-i", str(TEXT / "cap2.png"),
         "-i", str(TEXT / "cap3.png"), "-i", str(TEXT / "cap4.png"),
         "-i", str(TEXT / "cap5.png"), "-i", str(TEXT / "brand.png"),
         "-i", str(TEXT / "vig.png"),
         "-filter_complex",
         "[0:v][7:v]overlay=0:0:enable='between(t,0,17.5)'[v0];"
         "[v0][1:v]overlay=0:0:enable='between(t,0.4,3.2)'[v1];"
         "[v1][2:v]overlay=0:0:enable='between(t,3.9,6.9)'[v2];"
         "[v2][3:v]overlay=0:0:enable='between(t,7.4,10.4)'[v3];"
         "[v3][4:v]overlay=0:0:enable='between(t,10.9,13.9)'[v4];"
         "[v4][5:v]overlay=0:0:enable='between(t,14.4,17.4)'[v5];"
         "[v5][6:v]overlay=0:0:enable='between(t,0.5,6.9)+between(t,10.9,17.4)'[v6]",
         "-map", "[v6]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
         "-r", "30", str(timed)])

    out = LAND / "short_land.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-i", str(timed), "-i", str(LAND / "bgm.wav"),
         "-map", "0:v", "-map", "1:a", "-af", "volume=-4dB", "-c:v", "copy",
         "-c:a", "aac", "-b:a", "192k",
         "-shortest", "-movflags", "+faststart", str(out)])
    print(out, out.stat().st_size)


if __name__ == "__main__":
    build()
