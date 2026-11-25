import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sprites
from raster import Cv, encode
from PIL import Image
out={}; ims=[]
for k,(n,f) in sprites.S.items():
    c=Cv(n); f(c); c.finish(); pal,rows=encode(c); out[k]={'n':n,'pal':pal,'rows':rows}
    im=Image.new('RGBA',(n,n),(250,240,220,255))
    for y,row in enumerate(c.p):
        for x,col in enumerate(row):
            if col: im.putpixel((x,y),tuple(int(col[i:i+2],16) for i in (1,3,5))+(255,))
    ims.append(im.resize((n*8 if n==32 else n*8, n*8),Image.NEAREST))
json.dump(out,open(sys.argv[1],'w'),separators=(',',':'))
if len(sys.argv)>2:
    W=sum(i.width+8 for i in ims[:4]); sheet=Image.new('RGBA',(max(W, 8*136),256+8+128*2+16),(255,255,255,255))
    x=0
    for i in ims[:4]: sheet.paste(i,(x,0)); x+=i.width+8
    x=0;y=264
    for i in ims[4:]:
        if x+i.width>sheet.width: x=0;y+=136
        sheet.paste(i,(x,y)); x+=i.width+8
    sheet.save(sys.argv[2])
