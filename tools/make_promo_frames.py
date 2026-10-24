# -*- coding: utf-8 -*-
"""生成宣传短片用的竖屏首帧。

输入：assets/promo 下的三张生成图 + docs/screenshot.webp + 角色帧
输出：assets/promo 下的 *_clean.jpg / game_frame.jpg / face_frame.jpg
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
PROMO = ROOT / "assets" / "promo"
W, H = 1440, 2560


def cover(img, w, h):
    scale = max(w / img.width, h / img.height)
    resized = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = (resized.width - w) // 2
    top = (resized.height - h) // 2
    return resized.crop((left, top, left + w, top + h))


def clean(path, name):
    """裁掉右下角水印：从左上角取 90% 再放大回 9:16。"""
    img = Image.open(path).convert("RGB")
    cut_w, cut_h = round(img.width * 0.90), round(img.height * 0.90)
    img = img.crop((0, 0, cut_w, cut_h)).resize((W, H), Image.LANCZOS)
    img.save(PROMO / f"{name}_clean.jpg", quality=92)


def game_frame():
    shot = Image.open(ROOT / "docs" / "screenshot.webp").convert("RGB")
    bg = cover(shot, W, H).filter(ImageFilter.GaussianBlur(48))
    bg = Image.eval(bg, lambda v: int(v * 0.34))
    fg = shot.resize((W, round(W * shot.height / shot.width)), Image.LANCZOS)
    top = (H - fg.height) // 2
    bg.paste(fg, (0, top))
    draw = ImageDraw.Draw(bg)
    draw.rectangle((0, top - 1, W - 1, top + fg.height), outline=(201, 167, 101))
    bg.save(PROMO / "game_frame.jpg", quality=92)


def face_frame():
    shot = Image.open(ROOT / "docs" / "screenshot.webp").convert("RGB")
    bg = cover(shot, W, H).filter(ImageFilter.GaussianBlur(44))
    bg = Image.eval(bg, lambda v: int(v * 0.30))
    hero = Image.open(ROOT / "assets" / "anim" / "idle-0.webp").convert("RGBA")
    hero = hero.resize((round(hero.width * 1000 / hero.height), 1000), Image.LANCZOS)
    x = (W - hero.width) // 2
    y = 980
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((x + 70, y + hero.height - 40, x + hero.width - 70, y + hero.height + 70),
                                   fill=(0, 0, 0, 130))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    bg = Image.alpha_composite(bg.convert("RGBA"), shadow).convert("RGB")
    bg.paste(hero, (x, y), hero)
    bg.save(PROMO / "face_frame.jpg", quality=92)


def enemy_frame():
    shot = Image.open(ROOT / "docs" / "screenshot.webp").convert("RGB")
    bg = cover(shot, W, H).filter(ImageFilter.GaussianBlur(52))
    bg = Image.eval(bg, lambda v: int(v * 0.26))
    foe = Image.open(ROOT / "assets" / "anim" / "enemy-walker-0.webp").convert("RGBA")
    foe = foe.resize((round(foe.width * 1150 / foe.height), 1150), Image.LANCZOS)
    x = (W - foe.width) // 2
    y = 860
    bg.paste(foe, (x, y), foe)
    bg.save(PROMO / "enemy_frame.jpg", quality=92)


if __name__ == "__main__":
    clean(PROMO / "corrosion_macro.jpg", "corrosion_macro")
    clean(PROMO / "corrosion_spread.jpg", "corrosion_spread")
    clean(PROMO / "endcard_bronze.jpg", "endcard_bronze")
    game_frame()
    face_frame()
    enemy_frame()
    for f in sorted(PROMO.glob("*.jpg")):
        print(f.name, Image.open(f).size)
