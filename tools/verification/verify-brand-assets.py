from pathlib import Path
import hashlib
import json
import re
import sys
from PIL import Image, ImageDraw, ImageFont

SITES = [Path(arg).resolve() for arg in sys.argv[1:]] or [Path.cwd()]
names = re.findall(r"'([^']+)'", (Path(__file__).resolve().parents[2] / 'src/icons.js').read_text(encoding='utf-8').split('new Set([')[1].split(']);')[0])
assert len(names) == len(set(names)) == 28
for index, site in enumerate(SITES):
    index = 1 if (site / 'content/assets/images/brand').is_dir() else 0
    assets = site / 'content/assets'
    brand = assets / ('images/brand' if index == 1 else 'edgepress/brand')
    favicon = assets / ('favicon' if index == 1 else 'edgepress/favicon')
    icon_dir = assets / 'edgepress/icons'
    assert set(path.stem for path in icon_dir.glob('*.svg')) == set(names)
    assert not any(path.suffix.lower() in {'.png', '.svg', '.webp', '.ico', '.jpg', '.jpeg', '.mp4', '.webm'} for path in (site / 'static').rglob('*') if path.is_file())
    for path in icon_dir.glob('*.svg'):
        assert '<svg' in path.read_text(encoding='utf-8'), path
    assert (icon_dir / 'LICENSE.txt').is_file()
    checked = []
    for path in list(brand.rglob('*.png')) + list(brand.rglob('*.webp')) + list(favicon.glob('*.png')):
        with Image.open(path) as im:
            im.load()
            assert im.format in {'PNG', 'WEBP'}, path
            if path.name == 'og-image.png' or path.name == 'og-image.webp':
                assert im.size == (1200, 630), path
            elif path.name == 'avatar.png':
                assert im.size == (512, 512), path
            elif path.name == 'apple-touch-icon.png':
                assert im.size == (180, 180), path
            elif path.name.startswith('favicon-'):
                size = int(path.stem.split('-')[1])
                assert im.size == (size, size), path
            elif path.parent == icon_dir:
                assert im.size == (128, 128), path
            elif path.name == 'home-hero.png' or path.name == 'home-hero.webp':
                assert im.size == (1536, 1024), path
            elif path.name == 'home-hero-768.webp':
                assert im.size == (768, 512), path
            alpha = im.getchannel('A').getextrema() if 'A' in im.getbands() else None
            if path.name not in {'og-image.png', 'og-image.webp', 'apple-touch-icon.png'}:
                assert alpha and alpha[0] == 0 and alpha[1] > 0, path
                assert im.getpixel((0, 0))[-1] == 0, path
            checked.append({'path': str(path.relative_to(site)).replace('\\', '/'), 'format': im.format,
                            'dimensions': list(im.size), 'alphaRange': list(alpha) if alpha else None,
                            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    with Image.open(favicon / 'favicon.ico') as im:
        assert im.ico.sizes() == {(16, 16), (32, 32), (48, 48), (64, 64)}
    (site / 'content/assets/edgepress/brand/sources/export-manifest.json').write_text(json.dumps({'iconCount': len(names), 'assets': checked}, indent=2) + '\n', encoding='utf-8')
    print(site.name + ': verified ' + str(len(checked)) + ' real raster assets, transparent channels and required dimensions.')
