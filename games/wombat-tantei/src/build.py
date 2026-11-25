"""ドット絵データを ../index.html の /*PX*/ 〜 /*/PX*/ の間に書き込む
使い方: python3 build.py   （Pillow 不要）"""
import json, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import sprites
from raster import Cv, encode
ANIMALS = ['koala','crow','sparrow','hedgehog','boar','rabbit','fox','owl','frog','snail']
px = {}
for k,(n,f) in sprites.S.items():
    c = Cv(n); f(c); c.finish(); pal, rows = encode(c); px[k] = {'n':n,'pal':pal,'rows':rows}
src = json.load(open(os.path.join(here,'../../../assets/animal-sprites/animals.json')))['sprites']
for a in ANIMALS:
    px[a] = {'n':24,'pal':src[a]['pal'],'rows':src[a]['rows']}
p = os.path.join(here,'../index.html'); h = open(p,encoding='utf-8').read()
h = re.sub(r'/\*PX\*/.*?/\*/PX\*/', lambda m: '/*PX*/'+json.dumps(px,separators=(',',':'))+'/*/PX*/', h, flags=re.S)
open(p,'w',encoding='utf-8').write(h); print('sprites:', len(px))
