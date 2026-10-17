"""Produce clearly marked temporary card illustrations for Manyi V1.1."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1] / "public/assets/cards"
for subfolder, name, colors in [
    ("common", "CA07", ((39, 58, 64), (89, 110, 107))),
    ("common", "CA08", ((54, 62, 69), (126, 117, 99))),
    ("feichuan", "FC04", ((92, 37, 35), (178, 91, 55))),
    ("burden", "ZN03", ((40, 38, 45), (86, 71, 79))),
]:
    width, height = 800, 1000
    image = Image.new("RGB", (width, height))
    pixels = image.load()
    for y in range(height):
        t = y / (height - 1)
        color = tuple(round(a * (1 - t) + b * t) for a, b in zip(*colors))
        for x in range(width):
            pixels[x, y] = color
    draw = ImageDraw.Draw(image)
    draw.ellipse((120, 200, 680, 760), outline=(210, 191, 151), width=8)
    draw.ellipse((180, 260, 620, 700), outline=(145, 154, 145), width=3)
    font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 65)
    small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 34)
    draw.text((400, 420), name, anchor="mm", fill=(242, 225, 184), font=font)
    draw.text((400, 540), "TEMP ART", anchor="mm", fill=(240, 219, 182), font=small)
    target = root / subfolder / f"{name}.png"
    if not target.exists():
        image.save(target, optimize=True)
        print(target.relative_to(root.parents[2]))

story = Path(__file__).resolve().parents[1] / "public/assets/story/manyi"
story.mkdir(parents=True, exist_ok=True)
portrait = Image.new("RGBA", (1024, 1536), (0, 0, 0, 0))
draw = ImageDraw.Draw(portrait)
draw.ellipse((212, 156, 812, 756), fill=(75, 90, 91, 190), outline=(218, 196, 153, 220), width=8)
draw.rounded_rectangle((110, 700, 914, 1490), 240, fill=(59, 74, 78, 190), outline=(218, 196, 153, 220), width=8)
draw.text((512, 920), "TEMP", anchor="mm", fill=(240, 220, 181), font=ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 90))
portrait.save(story / "portrait-placeholder.png", optimize=True)
voucher = Image.new("RGBA", (960, 620), (0, 0, 0, 0))
draw = ImageDraw.Draw(voucher)
draw.rounded_rectangle((50, 50, 910, 570), 24, fill=(223, 202, 157, 245), outline=(94, 67, 42, 255), width=14)
draw.line((110, 210, 850, 210), fill=(123, 88, 56), width=5)
draw.line((110, 390, 850, 390), fill=(123, 88, 56), width=5)
draw.text((480, 305), "PR1-03 TEMP", anchor="mm", fill=(79, 56, 38), font=ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 60))
voucher.save(story / "return-voucher-placeholder.png", optimize=True)

for prop in ("PR1-01", "PR1-02", "PR1-04", "PR1-05", "PR1-06"):
    image = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((58, 85, 454, 427), 22, fill=(183, 165, 127, 223), outline=(235, 209, 152, 255), width=9)
    draw.text((256, 225), prop, anchor="mm", fill=(63, 47, 36), font=ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 51))
    draw.text((256, 310), "TEMP", anchor="mm", fill=(83, 60, 45), font=ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 38))
    image.save(story / f"{prop}-placeholder.png", optimize=True)
