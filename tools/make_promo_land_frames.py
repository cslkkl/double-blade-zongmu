# -*- coding: utf-8 -*-
"""生成横屏 1600x900 宣传短片用的首帧。"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LAND = ROOT / "assets" / "promo" / "land"
W, H = 1600, 900


def cover(img, w, h):
    scale = max(w / img.width, h / img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = (resized.width - w) // 2
    top = (resized.height - h) // 2
    return resized.crop((left, top, left + w, top + h))


def clean(path, name):
    """裁掉右下角水印：取左上 94%，再还原到 16:9。"""
    img = Image.open(path).convert("RGB")
    cut_w, cut_h = round(img.width * 0.94), round(img.height * 0.94)
    img.crop((0, 0, cut_w, cut_h)).resize((W, H), Image.LANCZOS).save(
        LAND / f"{name}_clean.jpg", quality=92)


def game_frame():
    shot = Image.open(ROOT / "docs" / "screenshot.webp").convert("RGB")
    shot.resize((W, H), Image.LANCZOS).save(LAND / "game_frame.jpg", quality=94)


def enemy_frame():
    bg = cover(Image.open(LAND / "endcard_bronze_clean.jpg").convert("RGB"), W, H)
    bg = Image.eval(bg, lambda v: int(v * 0.42)).convert("RGBA")
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((420, -80, 1180, 720), fill=(24, 96, 84, 96))
    bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(150)))
    foe = Image.open(ROOT / "assets" / "anim" / "enemy-walker-0.webp").convert("RGBA")
    foe = foe.resize((round(foe.width * 620 / foe.height), 620), Image.LANCZOS)
    foe = foe.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    bg.alpha_composite(foe, ((W - foe.width) // 2, 80))
    bg.convert("RGB").save(LAND / "enemy_frame.jpg", quality=94)


def face_frame():
    bg = cover(Image.open(LAND / "endcard_bronze_clean.jpg").convert("RGB"), W, H)
    bg = Image.eval(bg, lambda v: int(v * 0.46)).convert("RGBA")
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((560, -140, 1120, 700), fill=(24, 92, 82, 104))
    bg = Image.alpha_composite(bg, glow.filter(ImageFilter.GaussianBlur(140)))
    hero = Image.open(ROOT / "assets" / "char" / "front.webp").convert("RGBA")
    hero = hero.crop((100, 0, 520, 400))
    hero = hero.resize((round(420 * 600 / 400), 600), Image.LANCZOS)
    hero = hero.filter(ImageFilter.UnsharpMask(radius=2, percent=55, threshold=2))
    ramp = Image.new("L", (1, hero.height), 255)
    for y in range(hero.height - 120, hero.height):
        ramp.putpixel((0, y), int(255 * (hero.height - y) / 120))
    hero.putalpha(ImageChops.multiply(hero.getchannel("A"), ramp.resize(hero.size)))
    bg.alpha_composite(hero, ((W - hero.width) // 2, 80))
    bg.convert("RGB").save(LAND / "face_frame.jpg", quality=94)


if __name__ == "__main__":
    clean(LAND / "corrosion_macro.jpg", "corrosion_macro")
    clean(LAND / "corrosion_spread.jpg", "corrosion_spread")
    clean(LAND / "endcard_bronze.jpg", "endcard_bronze")
    game_frame()
    enemy_frame()
    face_frame()
    for f in sorted(LAND.glob("*_frame.jpg")) + sorted(LAND.glob("*_clean.jpg")):
        print(f.name, Image.open(f).size)
