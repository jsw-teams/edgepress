"""Export imagegen PNG masters without SVG rasterization. Requires Pillow.

Usage: python tools/export-brand-assets.py tools/brand-source/prompts.json
Raw imagegen masters and exact prompts remain in the repository. Functional
icons are drawn directly into transparent raster canvases by the companion
generate-brand-assets.py; neither exporter reads an SVG.
"""
from pathlib import Path
import argparse
import importlib.util
import json
from PIL import Image, ImageOps


def contain(image, size, padding=0):
    image = image.copy()
    image.thumbnail((size[0]-2*padding, size[1]-2*padding), Image.Resampling.LANCZOS)
    result = Image.new('RGBA', size)
    result.alpha_composite(image, ((size[0]-image.width)//2, (size[1]-image.height)//2))
    return result


def export(manifest_path):
    data = json.loads(manifest_path.read_text(encoding='utf-8'))
    root = manifest_path.resolve().parent.parent.parent
    output = root/data['output']
    output.mkdir(parents=True, exist_ok=True)
    sources = data['assets']
    mascot = Image.open(root/sources['mascot']['master']).convert('RGBA')
    for width in [512, 1024]:
        height = round(mascot.height*width/mascot.width)
        mascot.resize((width,height),Image.Resampling.LANCZOS).save(output/f'mascot-{width}.webp', quality=88, method=6)
    avatar = contain(Image.open(root/sources['avatar']['master']).convert('RGBA'),(512,512),16)
    avatar.save(output/'avatar.png', optimize=True)
    hero = contain(Image.open(root/sources['hero']['master']).convert('RGBA'),(1536,1024))
    hero.save(output/'home-hero.png',optimize=True)
    hero.save(output/'home-hero.webp',quality=88,method=6)
    hero.resize((768,512),Image.Resampling.LANCZOS).save(output/'home-hero-768.webp',quality=88,method=6)
    share = ImageOps.fit(Image.open(root/sources['share']['master']).convert('RGB'),(1200,630),Image.Resampling.LANCZOS)
    share.save(output/'og-image.png',optimize=True)
    share.save(output/'og-image.webp',quality=90,method=6)
    favicon=root/data['favicon']
    favicon.mkdir(parents=True,exist_ok=True)
    for size in [16,32,48,64]:
        avatar.resize((size,size),Image.Resampling.LANCZOS).save(favicon/f'favicon-{size}.png',optimize=True)
    avatar.save(favicon/'favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64)])
    touch=Image.new('RGBA',(180,180),(247,240,225,255))
    touch.alpha_composite(avatar.resize((168,168),Image.Resampling.LANCZOS),(6,6))
    touch.convert('RGB').save(favicon/'apple-touch-icon.png',optimize=True)
    print('Exported',output)


def export_icons(root):
    spec=importlib.util.spec_from_file_location('raster_icons',Path(__file__).with_name('generate-brand-assets.py'))
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    folder=root/'static/edgepress/icons'
    (folder/'dark').mkdir(parents=True,exist_ok=True)
    for name in module.ICON_NAMES:
        icon=module.make_icon(name)
        icon.save(folder/f'{name}.png',optimize=True)
        dark=Image.new('RGBA',icon.size,(202,228,209,255))
        dark.putalpha(icon.getchannel('A'))
        dark.save(folder/'dark'/f'{name}.png',optimize=True)
    print('Exported',len(module.ICON_NAMES),'icons in light and dark palettes')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('manifest',type=Path,nargs='?')
    parser.add_argument('--icons-root',type=Path)
    args=parser.parse_args()
    if args.manifest: export(args.manifest)
    if args.icons_root: export_icons(args.icons_root)
