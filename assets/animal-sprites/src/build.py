"""動物ドット絵を書き出す: animals.json / animals.js / png/ / png@4x/ / sheet.png
使い方: python3 build.py <出力先ディレクトリ> <meta.json>
meta.json は {id:{name,rank,special}}（名前の一覧用）"""
import json, os, sys
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from raster import Cv, encode, OUTLINE
import animals_src

out = sys.argv[1]; meta = json.load(open(sys.argv[2]))
order = sorted(animals_src.D, key=lambda k: (meta.get(k, {}).get('special', False), meta.get(k, {}).get('rank', 9), k))
os.makedirs(f'{out}/png', exist_ok=True); os.makedirs(f'{out}/png@4x', exist_ok=True)
data = {'size': 24, 'note': '右向き・全身。rows の1文字が pal の番号（0-9,a-z…）、"." は透明', 'sprites': {}}
imgs = {}
for k in order:
    c = Cv(); animals_src.D[k](c); c.finish()
    pal, rows = encode(c)
    data['sprites'][k] = {'name': meta.get(k, {}).get('name', k), 'pal': pal, 'rows': rows}
    im = Image.new('RGBA', (24, 24), (0, 0, 0, 0))
    for y, row in enumerate(c.p):
        for x, col in enumerate(row):
            if col: im.putpixel((x, y), tuple(int(col[i:i+2], 16) for i in (1, 3, 5)) + (255,))
    im.save(f'{out}/png/{k}.png'); im.resize((96, 96), Image.NEAREST).save(f'{out}/png@4x/{k}.png')
    imgs[k] = im
# 一覧画像（8列、透明背景、名前なし）
cols = 8; rows_n = (len(order)+cols-1)//cols
sheet = Image.new('RGBA', (cols*24, rows_n*24), (0, 0, 0, 0))
index = []
for i, k in enumerate(order):
    sheet.paste(imgs[k], ((i % cols)*24, (i//cols)*24)); index.append({'id': k, 'x': (i % cols)*24, 'y': (i//cols)*24})
sheet.save(f'{out}/sheet.png'); sheet.resize((cols*96, rows_n*96), Image.NEAREST).save(f'{out}/sheet@4x.png')
data['sheet'] = {'file': 'sheet.png', 'cell': 24, 'cols': cols, 'index': index}
json.dump(data, open(f'{out}/animals.json', 'w'), ensure_ascii=False, separators=(',', ':'))
js = '''/* 動物ドット絵（24x24・右向き）。データ込みでこのファイルだけで使える。
 *   drawAnimal(ctx, id, x, y, scale=1, flip=false)   … canvas に描く（flip=true で左向き）
 *   animalCanvas(id, scale=1, flip=false)           … 描いた canvas を返す
 *   animalDataURL(id, scale=1, flip=false)          … PNG の dataURL を返す（<img src> 用）
 *   ANIMAL_SPRITES.sprites[id] = {name, pal:[色...], rows:[24文字×24行]}
 * 表示するときは CSS で image-rendering: pixelated; を付けるとくっきりする */
(function(root){
const ANIMAL_SPRITES=%s;
const KEYS='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function drawAnimal(ctx,id,x,y,scale,flip){
  const s=ANIMAL_SPRITES.sprites[id]; if(!s) return false; scale=scale||1; x=x||0; y=y||0;
  const n=ANIMAL_SPRITES.size;
  for(let r=0;r<n;r++){ const row=s.rows[r];
    for(let q=0;q<n;q++){ const ch=row[q]; if(ch==='.') continue;
      ctx.fillStyle=s.pal[KEYS.indexOf(ch)];
      ctx.fillRect(x+(flip?(n-1-q):q)*scale, y+r*scale, scale, scale); } }
  return true;
}
function animalCanvas(id,scale,flip){
  scale=scale||1; const n=ANIMAL_SPRITES.size;
  const c=(typeof document!=='undefined')?document.createElement('canvas'):null; if(!c) return null;
  c.width=c.height=n*scale; drawAnimal(c.getContext('2d'),id,0,0,scale,flip); return c;
}
const _cache={};
function animalDataURL(id,scale,flip){
  const k=id+'|'+(scale||1)+'|'+(flip?1:0);
  if(!_cache[k]){ const c=animalCanvas(id,scale,flip); _cache[k]=c?c.toDataURL('image/png'):''; }
  return _cache[k];
}
const api={ANIMAL_SPRITES,drawAnimal,animalCanvas,animalDataURL};
if(typeof module!=='undefined'&&module.exports) module.exports=api; else Object.assign(root,api);
})(typeof window!=='undefined'?window:globalThis);
''' % json.dumps({k: v for k, v in data.items() if k != 'sheet'}, ensure_ascii=False, separators=(',', ':'))
open(f'{out}/animals.js', 'w').write(js)
print('wrote', len(order), 'sprites to', out)
