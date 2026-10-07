"""Build EdgePress brand derivatives. Functional icons are sourced separately from Lucide.

Requires Pillow. The mascot PNG passed on the command line stays untouched as
the generated master; this script only makes derivative assets from it.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


INK = (55, 65, 59, 255)
PALE = (247, 240, 225)
ACCENT = (228, 128, 99)
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
    if home_path.resolve() != (output_dir / "home-hero.png").resolve():
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
        raise ValueError("Use npm run icons:sync for licensed Lucide SVG icons; omit --icons-dir here")

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
