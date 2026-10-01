"""Validate real raster formats, transparency, dimensions, and icon palettes."""
from pathlib import Path
import json, sys
from PIL import Image

def verify(root):
    root=Path(root).resolve()
    manifest=json.loads((root/'tools/brand-source/prompts.json').read_text(encoding='utf-8'))
    brand=root/manifest['output']; favicon=root/manifest['favicon']
    checks=[]
    def check(file,size=None,alpha=False):
        image=Image.open(file)
        assert image.format in ['PNG','WEBP','ICO'],str(file)
        image.load()
        if size: assert image.size==size,(str(file),image.size,size)
        if alpha:
            assert image.mode=='RGBA',(str(file),image.mode)
            lo,hi=image.getchannel('A').getextrema()
            assert lo==0 and hi>=200,(str(file),lo,hi)
            assert 0 < image.getchannel('A').histogram()[0] < image.width*image.height,str(file)
        checks.append({'path':file.relative_to(root).as_posix(),'format':image.format,'size':image.size,'mode':image.mode,'transparent':alpha})
    for name in ['mascot.png','avatar.png','home-hero.png','home-hero.webp','mascot-512.webp','mascot-1024.webp']:
        check(brand/name,alpha=True)
    check(brand/'avatar.png',(512,512),True)
    check(brand/'home-hero.png',(1536,1024),True)
    check(brand/'home-hero-768.webp',(768,512),True)
    for name in ['og-image.png','og-image.webp']: check(brand/name,(1200,630))
    for size in [16,32,48,64]: check(favicon/f'favicon-{size}.png',(size,size),True)
    check(favicon/'apple-touch-icon.png',(180,180))
    ico=Image.open(favicon/'favicon.ico')
    assert ico.ico.sizes()=={(16,16),(32,32),(48,48),(64,64)}
    for name,details in manifest['assets'].items():
        assert details['prompt'] and details['imagegenOutput']
        check(root/details['master'],alpha=name!='share')
    icons=root/'static/edgepress/icons'
    names=sorted(p.name for p in icons.glob('*.png'))
    assert len(names)==28,len(names)
    assert names==sorted(p.name for p in (icons/'dark').glob('*.png'))
    for name in names:
        check(icons/name,(96,96),True); check(icons/'dark'/name,(96,96),True)
        assert Image.open(icons/name).getchannel('A').tobytes()==Image.open(icons/'dark'/name).getchannel('A').tobytes()
        for size in [16,20,24,32]:
            scaled=Image.open(icons/name).resize((size,size),Image.Resampling.LANCZOS)
            assert scaled.getchannel('A').getbbox()
    report={'status':'pass','iconCount':28,'iconDisplaySizes':[16,20,24,32],'checks':checks}
    (root/'tools/brand-assets-verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(root.name+': '+str(len(checks))+' raster checks passed')

for arg in sys.argv[1:]: verify(arg)
