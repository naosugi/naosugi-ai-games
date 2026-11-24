# 図形を 24x24 のドットに落とし込む小さな描画エンジン
import math
N = 24
OUTLINE = '#2B2220'.upper()

class Cv:
    def __init__(s, n=N):
        s.n = n
        s.p = [[None]*n for _ in range(n)]
    def _set(s, x, y, c):
        if c and len(c) == 4: c = '#' + ''.join(ch*2 for ch in c[1:])  # #333 → #333333
        if c: c = c.upper()
        if 0 <= x < s.n and 0 <= y < s.n:
            s.p[y][x] = c
    def px(s, x, y, c): s._set(int(x), int(y), c)
    def ell(s, cx, cy, rx, ry, c):
        for y in range(s.n):
            for x in range(s.n):
                if ((x+.5-cx)/rx)**2 + ((y+.5-cy)/ry)**2 <= 1: s._set(x, y, c)
    def circ(s, cx, cy, r, c): s.ell(cx, cy, r, r, c)
    def rect(s, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1)+1):
            for x in range(int(x0), int(x1)+1): s._set(x, y, c)
    def poly(s, pts, c):
        for y in range(s.n):
            for x in range(s.n):
                px_, py_ = x+.5, y+.5; inside = False; j = len(pts)-1
                for i in range(len(pts)):
                    xi, yi = pts[i]; xj, yj = pts[j]
                    if (yi > py_) != (yj > py_) and px_ < (xj-xi)*(py_-yi)/(yj-yi+1e-9)+xi: inside = not inside
                    j = i
                if inside: s._set(x, y, c)
    def line(s, x0, y0, x1, y1, c, w=1.0):
        steps = int(max(abs(x1-x0), abs(y1-y0))*3)+1
        for i in range(steps+1):
            t = i/steps; x = x0+(x1-x0)*t; y = y0+(y1-y0)*t
            if w <= 1.0: s._set(int(x), int(y), c)
            else:
                r = w/2
                for yy in range(int(y-r)-1, int(y+r)+2):
                    for xx in range(int(x-r)-1, int(x+r)+2):
                        if (xx+.5-x)**2+(yy+.5-y)**2 <= r*r: s._set(xx, yy, c)
    def path(s, pts, c, w=1.0):
        for a, b in zip(pts, pts[1:]): s.line(a[0], a[1], b[0], b[1], c, w)
    def blob(s, pts, r, c):  # 点列にそって太い体（ヘビ・ミミズなど）
        for a, b in zip(pts, pts[1:]):
            steps = 8
            for i in range(steps+1):
                t = i/steps; s.circ(a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, r, c)
    def finish(s):
        # 輪郭：塗られたマスの上下左右にある空きマスを輪郭色にする
        out = [row[:] for row in s.p]
        for y in range(s.n):
            for x in range(s.n):
                if s.p[y][x] is None:
                    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                        xx, yy = x+dx, y+dy
                        if 0 <= xx < s.n and 0 <= yy < s.n and s.p[yy][xx] not in (None, OUTLINE):
                            out[y][x] = OUTLINE; break
        s.p = out
        return s

def encode(cv):
    """色の一覧と、1文字=1色の行データに変換する（'.' は透明）"""
    keys = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    pal = []; rows = []
    for row in cv.p:
        r = ''
        for c in row:
            if c is None: r += '.'; continue
            c = c.upper()
            if c not in pal: pal.append(c)
            r += keys[pal.index(c)]
        rows.append(r)
    return pal, rows
