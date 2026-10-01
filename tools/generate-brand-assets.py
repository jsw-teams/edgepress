"""Build EdgePress brand derivatives and functional PNG icon bitmaps.

Requires Pillow. The mascot PNG passed on the command line stays untouched as
the generated master; this script only makes derivative assets from it.
"""

from __future__ import annotations

import argparse
import math
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


INK = (55, 65, 59, 255)
PALE = (247, 240, 225)
ACCENT = (228, 128, 99)
ICON_NAMES = (
    "home", "book-open", "rocket", "newspaper", "search", "shield-check", "rss", "file-text",
    "layers", "code", "puzzle", "plug", "cloud", "palette", "globe", "help-circle",
    "arrow-up-right", "check-circle", "layout-grid", "terminal", "settings", "sparkles", "cpu",
    "mail", "github", "check", "x", "arrow-right",
)


def scale_point(point, scale):
    return tuple(round(value * scale) for value in point)


def make_icon(name: str) -> Image.Image:
    scale = 8
    width = 24 * scale
    image = Image.new("RGBA", (width, width), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    color = INK
    stroke = round(2.0 * scale)

    def line(points, fill=color, weight=stroke, joint="curve"):
        points = [scale_point(point, scale) for point in points]
        draw.line(points, fill=fill, width=weight, joint=joint)
        radius = weight // 2
        for x, y in points:
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)

    def rect(box, radius=1, outline=color, fill=None, weight=stroke):
        box = tuple(round(value * scale) for value in box)
        draw.rounded_rectangle(box, radius=round(radius * scale), outline=outline, fill=fill, width=weight)

    def ellipse(box, outline=color, fill=None, weight=stroke):
        box = tuple(round(value * scale) for value in box)
        draw.ellipse(box, outline=outline, fill=fill, width=weight)

    def polygon(points, fill=None, outline=color, weight=stroke):
        if fill is not None:
            draw.polygon([scale_point(point, scale) for point in points], fill=fill)
        if outline is not None:
            line(points + [points[0]], outline, weight)

    def arc(box, start, end, weight=stroke):
        box = tuple(round(value * scale) for value in box)
        draw.arc(box, start, end, fill=color, width=weight)

    def cubic(start, control1, control2, end, steps=20):
        points = []
        for index in range(steps + 1):
            t = index / steps
            u = 1 - t
            x = u**3 * start[0] + 3 * u**2 * t * control1[0] + 3 * u * t**2 * control2[0] + t**3 * end[0]
            y = u**3 * start[1] + 3 * u**2 * t * control1[1] + 3 * u * t**2 * control2[1] + t**3 * end[1]
            points.append((x, y))
        line(points)

    if name == "check":
        line([(5, 12), (9, 16), (19, 6)])
    elif name == "x":
        line([(6, 6), (18, 18)])
        line([(18, 6), (6, 18)])
    elif name == "arrow-right":
        line([(5, 12), (19, 12), (13, 6)])
        line([(19, 12), (13, 18)])
    elif name == "home":
        line([(3, 10), (12, 3), (21, 10)])
        line([(5, 9), (5, 20), (19, 20), (19, 9)])
        line([(10, 20), (10, 14), (14, 14), (14, 20)])
    elif name == "book-open":
        line([(12, 8), (12, 21)])
        line([(12, 9), (9, 7), (4, 6), (3, 6), (3, 19), (8, 19), (12, 21)])
        line([(12, 9), (15, 7), (20, 6), (21, 6), (21, 19), (16, 19), (12, 21)])
        line([(6, 10), (9, 11)])
        line([(15, 11), (18, 10)])
        line([(6, 14), (9, 15)])
        line([(15, 15), (18, 14)])
    elif name == "rocket":
        polygon([(12, 15), (8, 12), (9, 8), (12, 4), (17, 2), (21, 2), (21, 6), (19, 11), (15, 14)])
        ellipse((14, 6, 18, 10))
        line([(8, 12), (4, 13), (2, 18), (8, 17)])
        line([(15, 14), (16, 19), (21, 21), (20, 16)])
        line([(8, 17), (6, 21), (3, 22)])
    elif name == "newspaper":
        rect((4, 3, 20, 21), 2)
        rect((6, 6, 10, 12), 0.5)
        line([(13, 7), (17, 7)])
        line([(13, 10), (17, 10)])
        line([(6, 15), (18, 15)])
        line([(6, 18), (18, 18)])
    elif name == "search":
        ellipse((3, 3, 17, 17))
        line([(15, 15), (21, 21)])
    elif name == "shield-check":
        polygon([(12, 3), (20, 6), (20, 11), (18, 16), (12, 21), (6, 16), (4, 11), (4, 6)])
        line([(8, 12), (11, 15), (16, 9)])
    elif name == "rss":
        ellipse((3, 18, 6, 21), fill=color, outline=None)
        cubic((4, 11), (9, 11), (13, 15), (13, 20))
        cubic((4, 5), (12, 5), (19, 12), (19, 20))
    elif name == "file-text":
        line([(6, 3), (14, 3), (19, 8), (19, 20), (5, 20), (5, 4), (6, 3)])
        line([(14, 3), (14, 8), (19, 8)])
        line([(8, 12), (16, 12)])
        line([(8, 16), (16, 16)])
    elif name == "layers":
        line([(12, 3), (21, 8), (12, 13), (3, 8), (12, 3)])
        line([(3, 12), (12, 17), (21, 12)])
        line([(3, 16), (12, 21), (21, 16)])
    elif name == "code":
        line([(8, 6), (3, 12), (8, 18)])
        line([(16, 6), (21, 12), (16, 18)])
        line([(14, 4), (10, 20)])
    elif name == "puzzle":
        line([(4, 4), (9, 4)])
        cubic((9, 4), (8, 0.5), (16, 0.5), (15, 4))
        line([(15, 4), (20, 4), (20, 9)])
        cubic((20, 9), (23.5, 8), (23.5, 16), (20, 15))
        line([(20, 15), (20, 20), (15, 20)])
        cubic((15, 20), (16, 23.5), (8, 23.5), (9, 20))
        line([(9, 20), (4, 20), (4, 15)])
        cubic((4, 15), (0.5, 16), (0.5, 8), (4, 9))
        line([(4, 9), (4, 4)])
    elif name == "plug":
        line([(9, 3), (9, 9)])
        line([(15, 3), (15, 9)])
        line([(6, 9), (18, 9), (18, 12)])
        cubic((18, 12), (18, 16), (15, 18), (12, 18))
        cubic((12, 18), (9, 18), (6, 16), (6, 12))
        line([(6, 12), (6, 9)])
        line([(12, 18), (12, 21)])
    elif name == "cloud":
        cubic((7, 18), (2, 18), (2, 11), (6, 9))
        cubic((6, 9), (7, 3), (15, 3), (17, 9))
        cubic((17, 9), (23, 9), (23, 18), (18, 18))
        line([(18, 18), (7, 18)])
        line([(12, 16), (12, 10), (9, 13)])
        line([(12, 10), (15, 13)])
    elif name == "palette":
        cubic((18, 5), (14, 2), (7, 3), (4, 8))
        cubic((4, 8), (0, 14), (5, 21), (12, 21))
        cubic((12, 21), (14, 21), (15, 19), (14, 17))
        cubic((14, 17), (12, 14), (15, 13), (17, 14))
        cubic((17, 14), (22, 15), (22, 10), (18, 5))
        for x, y in [(7, 11), (10, 7), (15, 8)]:
            ellipse((x - 0.7, y - 0.7, x + 0.7, y + 0.7), fill=color, outline=None)
    elif name == "globe":
        ellipse((3, 3, 21, 21))
        line([(3, 12), (21, 12)])
        cubic((12, 3), (7, 7), (7, 17), (12, 21))
        cubic((12, 3), (17, 7), (17, 17), (12, 21))
    elif name == "help-circle":
        ellipse((3, 3, 21, 21))
        cubic((9, 9), (9, 5), (16, 5), (16, 9))
        cubic((16, 9), (16, 12), (12, 12), (12, 15))
        ellipse((11.4, 18, 12.6, 19.2), fill=color, outline=None, weight=1)
    elif name == "arrow-up-right":
        line([(6, 18), (18, 6), (18, 15)])
        line([(18, 6), (9, 6)])
    elif name == "check-circle":
        ellipse((3, 3, 21, 21))
        line([(7, 12), (10.5, 15.5), (17, 8.5)])
    elif name == "layout-grid":
        rect((3, 3, 10, 10), 1.4)
        rect((14, 3, 21, 8), 1.4)
        rect((14, 11, 21, 21), 1.4)
        rect((3, 14, 10, 21), 1.4)
    elif name == "terminal":
        rect((3, 4, 21, 20), 2)
        line([(7, 9), (10, 12), (7, 15)])
        line([(13, 15), (17, 15)])
    elif name == "settings":
        points = []
        for index in range(32):
            angle = -math.pi / 2 + index * math.pi / 16
            radius = 10 if index % 4 in (0, 1) else 8
            points.append((12 + math.cos(angle) * radius, 12 + math.sin(angle) * radius))
        polygon(points)
        ellipse((9, 9, 15, 15))
    elif name == "sparkles":
        line([(11, 3), (12.5, 8.5), (18, 10), (12.5, 11.5), (11, 17), (9.5, 11.5), (4, 10), (9.5, 8.5), (11, 3)])
        line([(19, 15), (20, 18), (22, 19), (20, 20), (19, 22), (18, 20), (16, 19), (18, 18), (19, 15)])
    elif name == "cpu":
        rect((5, 5, 19, 19), 2)
        rect((9, 9, 15, 15), 1)
        for value in (9, 15):
            line([(value, 2), (value, 5)])
            line([(value, 19), (value, 22)])
            line([(2, value), (5, value)])
            line([(19, value), (22, value)])
    elif name == "mail":
        rect((3, 5, 21, 19), 2)
        line([(4, 7), (12, 13), (20, 7)])
    elif name == "check":
        line([(4, 12), (10, 18), (20, 6)])
    elif name == "x":
        line([(6, 6), (18, 18)])
        line([(18, 6), (6, 18)])
    elif name == "arrow-right":
        line([(3, 12), (21, 12), (15, 6)])
        line([(21, 12), (15, 18)])
    elif name == "github":
        polygon([(7, 5), (9, 2), (12, 5), (15, 2), (17, 5), (19, 8), (19, 14), (17, 18), (14, 20), (14, 22), (10, 22), (10, 20), (7, 18), (5, 14), (5, 8)])
        line([(5, 13), (3, 13), (2, 11), (2, 9)])
        line([(10, 19), (10, 16), (8, 15)])
        line([(14, 19), (14, 16), (16, 15)])
        ellipse((8, 9, 9, 10), fill=(255, 255, 255, 255), outline=None, weight=1)
        ellipse((15, 9, 16, 10), fill=(255, 255, 255, 255), outline=None, weight=1)
    else:
        raise ValueError(f"No drawing is defined for {name}")

    return image.resize((128, 128), Image.Resampling.LANCZOS)


def alpha_bbox(image: Image.Image):
    alpha = image.getchannel("A").point(lambda value: 255 if value > 8 else 0)
    return alpha.getbbox()


def contained(image: Image.Image, size: tuple[int, int], padding: int = 0) -> Image.Image:
    image = image.copy()
    image.thumbnail((size[0] - padding * 2, size[1] - padding * 2), Image.Resampling.LANCZOS)
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    layer.alpha_composite(image, ((size[0] - image.width) // 2, (size[1] - image.height) // 2))
    return layer


def font(size: int, bold: bool = False, cjk: bool = False):
    candidates = (
        [r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\msyh.ttc"] if cjk else
        [r"C:\Windows\Fonts\seguisb.ttf", r"C:\Windows\Fonts\segoeui.ttf"] if bold else
        [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\arial.ttf"]
    )
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font_face, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else current + " " + word
        if current and draw.textlength(candidate, font=font_face) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def share_image(master: Image.Image, brand: str) -> Image.Image:
    canvas = Image.new("RGBA", (1200, 630), (250, 247, 238, 255))
    draw = ImageDraw.Draw(canvas)
    if brand == "edgepress":
        title = "EdgePress"
        title_font = font(64, bold=True)
        body_font = font(31)
        body_lines = ["Build for the edge.", "Publish with clarity."]
        detail = "Markdown posts, editable pages, themes, and Workers."
        art_size, art_x = (600, 540), 600
    elif brand == "blackbear":
        title = "技述｜JS.GRIPE"
        title_font = font(51, bold=True, cjk=True)
        body_font = font(27)
        body_lines = ["Technical field notes,", "research, and open source."]
        detail = "Practice and ideas from JS.GRIPE."
        art_size, art_x = (580, 580), 620
    else:
        title = "技术网"
        title_font = font(74, bold=True, cjk=True)
        body_font = font(31, cjk=True)
        body_lines = ["记录服务器运维、技术学习", "与问题解决过程。"]
        detail = "可复现、可回看的技术笔记"
        art_size, art_x = (580, 580), 620

    mascot = contained(master, art_size, 0)
    canvas.alpha_composite(mascot, (art_x + (art_size[0] - mascot.width) // 2, (630 - mascot.height) // 2))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((76, 92, 124, 100), radius=4, fill=ACCENT)
    draw.text((76, 129), title, font=title_font, fill=(36, 56, 45, 255))
    y = 235 if brand == "edgepress" else 225
    for line_text in body_lines:
        draw.text((78, y), line_text, font=body_font, fill=(49, 94, 73, 255))
        y += 58 if brand == "edgepress" else 50
    detail_font = font(23, cjk=brand == "panda")
    for line_text in wrap_text(draw, detail, detail_font, 540):
        draw.text((80, y + 20), line_text, font=detail_font, fill=(99, 111, 100, 255))
        y += 35
    return canvas.convert("RGB")


def generate(master_path: Path, avatar_path: Path, home_path: Path, output_dir: Path, icons_dir: Path | None, favicon_dir: Path | None, brand: str):
    output_dir.mkdir(parents=True, exist_ok=True)
    if icons_dir:
        icons_dir.mkdir(parents=True, exist_ok=True)
    if favicon_dir:
        favicon_dir.mkdir(parents=True, exist_ok=True)
    master_path = master_path.resolve()
    master_target = output_dir / "mascot.png"
    if master_path != master_target.resolve():
        shutil.copyfile(master_path, master_target)
    master = Image.open(master_target).convert("RGBA")

    mascot = master.copy()
    mascot.thumbnail((768, 1152), Image.Resampling.LANCZOS)
    mascot.save(output_dir / "mascot.webp", format="WEBP", quality=88, method=4)

    avatar_master = Image.open(avatar_path).convert("RGBA")
    avatar = contained(avatar_master.crop(alpha_bbox(avatar_master)), (512, 512), 20)
    avatar.save(output_dir / "avatar.png", optimize=True)
    shutil.copyfile(home_path, output_dir / "home-hero.png")
    home = Image.open(home_path).convert("RGBA")
    home.save(output_dir / "home-hero.webp", format="WEBP", quality=88, method=4)
    small_home = home.copy()
    small_home.thumbnail((768, 512), Image.Resampling.LANCZOS)
    small_home.save(output_dir / "home-hero-768.webp", format="WEBP", quality=88, method=4)
    share = share_image(home, brand)
    share.save(output_dir / "og-image.png", optimize=True)
    share.save(output_dir / "og-image.webp", format="WEBP", quality=88, method=6)

    if icons_dir:
        for icon_name in ICON_NAMES:
            make_icon(icon_name).save(icons_dir / f"{icon_name}.png", optimize=True)

    if favicon_dir:
        favicon = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        ImageDraw.Draw(favicon).ellipse((4, 4, 508, 508), fill=(246, 236, 215, 255))
        favicon.alpha_composite(contained(avatar, (512, 512), 18))
        for size in (16, 32, 48, 64):
            favicon.resize((size, size), Image.Resampling.LANCZOS).save(favicon_dir / f"favicon-{size}.png", optimize=True)
        favicon.save(favicon_dir / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
        touch = Image.new("RGBA", (180, 180), (244, 235, 218, 255))
        touch.alpha_composite(avatar.resize((168, 168), Image.Resampling.LANCZOS), (6, 6))
        touch.save(favicon_dir / "apple-touch-icon.png", optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", required=True, type=Path)
    parser.add_argument("--avatar-master", required=True, type=Path)
    parser.add_argument("--home-master", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--icons-dir", type=Path)
    parser.add_argument("--favicon-dir", type=Path)
    parser.add_argument("--brand", required=True, choices=("panda", "blackbear", "edgepress"))
    args = parser.parse_args()
    generate(args.master, args.avatar_master, args.home_master, args.output_dir, args.icons_dir, args.favicon_dir, args.brand)


if __name__ == "__main__":
    main()
