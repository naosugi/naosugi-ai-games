# ウォンバット☆さがしものたんてい のドット絵（主役・相棒・ことばカード）
# 使い方: python3 sprites.py <出力json> [プレビューpng]
import json, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../assets/animal-sprites/src'))
from raster import Cv, encode
K='#151515'; W='#FFFFFF'
S={}
def sp(id_, n):
    def deco(f): S[id_]=(n,f); return f
    return deco

# 主人公のウォンバットは シリーズ共通の描画コード（index.html 内、games/kami-wombat と同じ）を使う

# ---- 相棒：フクロモモンガの「モモ」（オリジナル） ----
MG='#B8B4C8'; MD='#7C7890'; ML='#F6F0F4'; MS='#4A4458'; SC='#FF8C5A'; SCD='#D9603A'; PK='#F4A6B8'
def momo_head(c,cx,cy,blink=False):
    c.ell(cx-3.2,cy-4.6,2.2,2.8,MG); c.ell(cx-3.2,cy-4.3,1.1,1.6,PK)   # みみ
    c.ell(cx+2.6,cy-4.8,2.2,2.8,MG); c.ell(cx+2.6,cy-4.5,1.1,1.6,PK)
    c.ell(cx,cy,5.4,4.6,MG); c.ell(cx+.4,cy+1.8,3.6,2.4,ML)
    c.line(cx,cy-4.6,cx,cy-1,MS,1)                                      # しま
    if blink:
        c.line(cx-3.4,cy,cx-1,cy,K); c.line(cx+1.4,cy,cx+3.8,cy,K)
    else:
        c.circ(cx-2.2,cy-.2,1.5,K); c.px(int(cx-2.6),int(cy-1),W)        # 大きな目
        c.circ(cx+2.6,cy-.2,1.5,K); c.px(int(cx+2.2),int(cy-1),W)
    c.px(int(cx+.3),int(cy+1.6),'#C06A7A')
    c.px(int(cx-4),int(cy+1.6),PK); c.px(int(cx+4.6),int(cy+1.6),PK)
def momo_sit(c,blink=False):
    c.path([(10,26),(5,24),(3,19),(4,14)],MD,3.2); c.px(4,13,MS)        # しっぽ
    c.ell(15,23,5.4,5,MG); c.ell(15.6,24,3.4,3.6,ML)
    c.rect(11,27,13,28,MD); c.rect(17,27,19,28,MD)
    momo_head(c,16,13,blink)
    c.ell(16,18.6,5,1.4,SC); c.poly([(11,18),(8,22),(10,23),(13,19)],SC); c.px(9,22,SCD); c.line(12,19.5,19,19.5,SCD)
@sp('momo',32)
def _(c): momo_sit(c)
@sp('momo_blink',32)
def _(c): momo_sit(c,True)
@sp('momo_fly',32)
def _(c):
    c.poly([(3,14),(14,10),(26,14),(28,19),(16,21),(4,19)],MG)          # ひまく
    c.poly([(5,16),(14,13),(25,16),(26,18),(16,19),(6,18)],ML)
    c.path([(6,18),(2,23),(1,27)],MD,3)
    for x,y in ((3,14),(26,14),(5,19),(27,19)): c.rect(x,y,x+1,y+1,MD)   # 手足
    momo_head(c,17,10)
    c.ell(17,15.2,4.6,1.2,SC); c.poly([(13,15),(7,13),(8,16),(13,16)],SC); c.px(8,14,SCD)

# ---- ことばカードの絵（16x16）----
@sp('i_hat',16)
def _(c):
    c.ell(8,11,7.4,2.6,'#E8C26A'); c.ell(8,8,4.2,3.6,'#F0D080'); c.rect(4,9,12,10,'#E05A6A'); c.px(12,8,'#E05A6A'); c.px(13,8,'#E05A6A')
    c.ell(8,11,4.4,1,'#D0A850')
@sp('i_feather',16)
def _(c):
    c.poly([(3,14),(6,8),(11,2),(13,3),(10,9),(5,14)],'#3A3A48'); c.line(3,14,12,3,'#7A7A90'); c.px(4,13,'#7A7A90')
@sp('i_acorn',16)
def _(c):
    c.ell(8,10,4,4.6,'#C07A3A'); c.ell(7,9,1.2,2,'#E0A060'); c.ell(8,5.6,5,2.4,'#7A5030'); c.px(6,5,'#A0703E'); c.px(9,5,'#A0703E'); c.rect(8,1,8,3,'#5A3A20')
@sp('i_hoof',16)
def _(c):
    B='#6A4E36'
    c.ell(5,7.5,1.9,4.2,B); c.ell(11,7.5,1.9,4.2,B); c.px(3,14,B); c.px(4,14,B); c.px(12,14,B); c.px(13,14,B)
@sp('i_apple',16)
def _(c):
    c.circ(8,9.4,5.4,'#E0403A'); c.ell(6,7.6,1.4,1.8,'#F49080'); c.line(8,4,9,1,'#6A4020'); c.ell(11,3,2,1,'#5EAE4A')
@sp('i_fur',16)
def _(c):
    O='#F08A3A'; c.path([(2,13),(6,8),(9,4),(12,2)],O,2.4); c.path([(5,14),(9,9),(13,6)],O,2.2); c.path([(9,13),(12,10),(14,9)],'#FFE6CC',1.8)
@sp('i_sticks',16)
def _(c):
    c.line(2,14,12,3,'#C8964A',1.8); c.line(5,15,14,5,'#C8964A',1.8); c.circ(12.4,3,1.8,'#F4E6D0'); c.circ(14,5,1.8,'#F4E6D0')
@sp('i_drum',16)
def _(c):
    c.rect(2,5,13,12,'#D04040'); c.ell(7.5,5,6,2,'#F4E6D0'); c.ell(7.5,12.5,6,1.6,'#D04040')
    for x in (3,6,9,12): c.line(x,6,x+1.5,12,'#F4D25A')
@sp('i_sound',16)
def _(c):
    N='#3A3A58'
    c.ell(4.5,12.5,2.6,2,N); c.ell(11.5,11,2.6,2,N); c.rect(6,3,6,12,N); c.rect(13,2,13,11,N); c.poly([(6,3),(13,1),(14,4),(6,6)],N)
    c.px(1,2,'#F4D25A'); c.px(2,4,'#F4D25A'); c.px(15,13,'#F4D25A')
@sp('i_nest',16)
def _(c):
    c.ell(8,10,7,3.6,'#8A6038'); c.ell(8,8.6,5,1.6,'#4A3020')
    for x in (2,5,9,12): c.line(x,9,x+3,12,'#B08050')

# ---- いいわけの絵（16x16）----
@sp('i_tree',16)
def _(c):
    c.rect(7,9,9,15,'#7A5030'); c.circ(8,6,5.6,'#4E9A3E'); c.circ(6,5,2,'#7CC060'); c.circ(11,8,1.4,'#7CC060')
@sp('i_stump',16)
def _(c):
    c.rect(3,7,12,14,'#8A5A30'); c.ell(7.5,7,5,2,'#E0B070'); c.ell(7.5,7,2.4,0.9,'#B07A40'); c.line(5,10,5,13,'#6A4020'); c.line(10,9,10,13,'#6A4020')
@sp('i_house',16)
def _(c):
    c.rect(3,8,12,14,'#F0E0C0'); c.poly([(1,9),(8,2),(15,9)],'#D05A4A'); c.rect(6,10,9,14,'#8A5A30'); c.circ(10.5,5,0.1,'#D05A4A')
@sp('i_cloud',16)
def _(c):
    c.ell(8,10,6.5,3,'#FFFFFF'); c.circ(6,8,3,'#FFFFFF'); c.circ(10,7,3.4,'#FFFFFF'); c.ell(8,12,5,1,'#D8E8F4')
@sp('i_moon',16)
def _(c):
    c.circ(8,8,6,'#F4D25A'); c.circ(11,6,5,None) if False else None
    for y in range(16):
        for x in range(16):
            if ((x+.5-11)**2+(y+.5-6)**2)<=4.6**2: c.p[y][x]=None
@sp('i_sleep',16)
def _(c):
    B='#5A6ABE'
    c.rect(1,3,6,3,B); c.line(6,3,1,8,B); c.rect(1,8,6,8,B)
    c.rect(9,8,13,8,B); c.line(13,8,9,12,B); c.rect(9,12,13,12,B)
@sp('i_hill',16)
def _(c):
    c.poly([(0,14),(6,4),(10,8),(12,6),(16,14)],'#6A9A4A'); c.poly([(6,4),(8,6.5),(4.5,6.5)],'#F4F4F4')

@sp('i_loupe',16)
def _(c):
    c.line(10,10,14,14,'#7A4E2A',2.4); c.circ(6.5,6.5,5,'#5E6A78'); c.circ(6.5,6.5,3.6,'#CDEBFA'); c.px(4,4,W); c.px(5,4,W); c.px(4,5,W)
