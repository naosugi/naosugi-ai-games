#!/usr/bin/env python3
"""一覧ページとQRコードを作り直す。

collections.json に載っているフォルダ（samples/、events/<id>/ など）ごとに
  - index.html（一覧）と print.html（印刷用QRシート）をひな形から書き出す
  - qr/_page.png（一覧ページ）と qr/<ゲームid>.png（各ゲーム）を作る
  - 各ゲームの index.html にSNS共有用のOGPタグ（タイトル・説明・サムネイル）を入れる
    （<!-- OGP --> 〜 <!-- /OGP --> の間を毎回書き換える）
  - assets/og.jpg（トップと一覧ページの共有用画像。サムネイルを並べたもの）を作る

使い方:  pip install segno pillow  →  python3 tools/build.py
"""
import html, json, os, posixpath, re, segno
from PIL import Image

BASE_URL = 'https://naosugi.github.io/naosugi-ai-games/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LIST = '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ゲーム一覧 - 作ってみたゲームの発表会（仮）</title>
{ogp}
<link rel="stylesheet" href="{up}assets/site.css">
</head>
<body data-mode="list">
<!-- このファイルは tools/build.py が書き出します。直接編集しないでください -->
<div class="wrap">
  <header>
    <a class="toplink" href="{up}">← 作ってみたゲームの発表会（仮）</a>
    <div class="pagehead">
      <div class="txt">
        <h1 id="title"></h1>
        <div class="evmeta" id="evmeta"></div>
        <p class="lead" id="lead"></p>
      </div>
      <a class="pageqr" href="print.html" style="text-decoration:none">
        <img src="qr/_page.png" alt="このページのQRコード">
        <div>このページのQRコード<br>🖨 印刷用シートを開く</div>
      </a>
    </div>
    <p class="note">⬇ ダウンロードしたファイルは、インターネットにつながっていなくても遊べます（パソコン・Android）。iPhone・iPad では開けないことがあります。記録はWeb版とは別に保存されます。</p>
  </header>
  <section class="about" id="about" hidden></section>
  <h2 class="sec" id="gamesh" hidden>作られたゲーム</h2>
  <div class="bar" id="bar">
    <input class="search" id="q" type="search" placeholder="ゲームを検索" aria-label="ゲームを検索">
    <div class="tags" id="tags"></div>
  </div>
  <div class="count" id="count"></div>
  <main class="grid" id="grid"></main>
  <footer>記録やランキングは各ブラウザ内に保存されます。各ゲームのQRコードは、押すと画像で開けます（保存・印刷用）。</footer>
</div>
<script src="{up}assets/collection.js"></script>
</body>
</html>
'''

PRINT = '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>印刷用QRシート</title>
<style>
@page{{size:A4;margin:12mm}}
*{{box-sizing:border-box}}
body{{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;color:#111;background:#fff}}
.wrap{{max-width:186mm;margin:0 auto;padding:16px}}
.tools{{margin-bottom:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:14px}}
.tools button{{font:inherit;font-weight:700;padding:8px 16px;border-radius:8px;border:1px solid #333;background:#fff;cursor:pointer}}
.head{{display:flex;gap:16px;align-items:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}}
.head img{{width:34mm;height:34mm}}
.head h1{{margin:0;font-size:20px}}
.head p{{margin:4px 0 0;font-size:12px}}
.sheet{{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm 4mm}}
.item{{border:1px dashed #999;border-radius:3mm;padding:3mm;text-align:center;break-inside:avoid}}
.item img{{width:36mm;height:36mm;display:block;margin:0 auto}}
.t{{font-weight:700;font-size:13px;margin-top:2mm;line-height:1.3}}
.a{{font-size:11px;margin-top:1mm}}
.u{{font-size:8px;color:#555;margin-top:1mm;word-break:break-all}}
@media print{{.tools{{display:none}}.wrap{{padding:0;max-width:none}}}}
</style>
</head>
<body data-mode="print">
<!-- このファイルは tools/build.py が書き出します。直接編集しないでください -->
<div class="wrap">
  <div class="tools"><a href="./">← 一覧へ戻る</a><button onclick="print()">🖨 印刷する</button><span>A4・点線で切り分けられます</span></div>
  <div class="head">
    <img src="qr/_page.png" alt="">
    <div><h1 id="title"></h1><p id="evmeta"></p><p id="pageurl"></p><p id="lead" hidden></p></div>
  </div>
  <div class="sheet" id="sheet"></div>
</div>
<script src="{up}assets/collection.js"></script>
</body>
</html>
'''


SITE_NAME = '作ってみたゲームの発表会（仮）'
OG_IMAGE = 'assets/og.jpg'


def ogp(title, desc, url, image_rel):
    """SNS共有用のタグ。image_rel はリポジトリ直下から見た画像の位置"""
    w, h = Image.open(os.path.join(ROOT, image_rel)).size
    e = lambda v: html.escape(str(v), quote=True)
    rows = [
        ('property', 'og:type', 'website'),
        ('property', 'og:site_name', SITE_NAME),
        ('property', 'og:locale', 'ja_JP'),
        ('property', 'og:title', title),
        ('property', 'og:description', desc),
        ('property', 'og:url', url),
        ('property', 'og:image', BASE_URL + image_rel),
        ('property', 'og:image:width', w),
        ('property', 'og:image:height', h),
        ('name', 'twitter:card', 'summary_large_image'),
    ]
    tags = '\n'.join(f'<meta {k}="{n}" content="{e(v)}">' for k, n, v in rows)
    return f'<!-- OGP: tools/build.py が書き出します -->\n{tags}\n<!-- /OGP -->'


OGP_RE = re.compile(r'<!-- OGP[: ].*?<!-- /OGP -->', re.S)


def put_ogp(path, block):
    """ファイル内の OGP ブロックを差し替える。無ければ </title> の直後に入れる"""
    if not os.path.exists(path):
        return
    s = open(path, encoding='utf8').read()
    if OGP_RE.search(s):
        t = OGP_RE.sub(lambda m: block, s, count=1)
    else:
        t = re.sub(r'(</title>[^\n]*\n)', lambda m: m.group(1) + block + '\n', s, count=1)
    if t != s:
        open(path, 'w', encoding='utf8').write(t)


def make_og_image(thumbs):
    """サムネイルを3×3に並べた 1200×630 の共有用画像を作る"""
    W, H, cols, rows = 1200, 630, 3, 3
    tw, th = W // cols, H // rows
    out = Image.new('RGB', (W, H), (16, 20, 40))
    for i, f in enumerate(thumbs[:cols * rows]):
        im = Image.open(os.path.join(ROOT, f)).convert('RGB')
        sc = max(tw / im.width, th / im.height)
        im = im.resize((round(im.width * sc), round(im.height * sc)), Image.LANCZOS)
        l, t = (im.width - tw) // 2, (im.height - th) // 2
        out.paste(im.crop((l, t, l + tw, t + th)), ((i % cols) * tw, (i // cols) * th))
    out.save(os.path.join(ROOT, OG_IMAGE), quality=85, optimize=True, progressive=True)


def qr(url, path):
    segno.make(url, error='m').save(path, scale=12, border=4)


def main():
    cols = json.load(open(os.path.join(ROOT, 'collections.json'), encoding='utf8'))
    # 共有用画像（新しいサンプルから順にサムネイルを並べる）
    thumbs = []
    for c in cols:
        rel = c['path'].strip('/')
        data = json.load(open(os.path.join(ROOT, rel, 'games.json'), encoding='utf8'))
        gs = [g for g in data.get('games', []) if g.get('thumbnail')]
        if c.get('kind') == 'sample':
            gs.sort(key=lambda g: g.get('added', ''), reverse=True)
        thumbs += [posixpath.normpath(rel + '/' + g['thumbnail']) for g in gs]
    if thumbs:
        make_og_image(thumbs)
    put_ogp(os.path.join(ROOT, 'index.html'),
            ogp(SITE_NAME, '令和の技術で令和の発想を平成初期風ゲームに。個人開発のHTMLゲーム置き場', BASE_URL, OG_IMAGE))
    for c in cols:
        rel = c['path'].strip('/')
        d = os.path.join(ROOT, rel)
        up = '../' * (rel.count('/') + 1)
        os.makedirs(os.path.join(d, 'qr'), exist_ok=True)
        page_url = BASE_URL + rel + '/'
        block = ogp(c['title'] + ' - ' + SITE_NAME, c.get('lead', ''), page_url, OG_IMAGE)
        for name, tpl in (('index.html', LIST), ('print.html', PRINT)):
            open(os.path.join(d, name), 'w', encoding='utf8').write(tpl.format(up=up, ogp=block))
        qr(page_url, os.path.join(d, 'qr', '_page.png'))
        data = json.load(open(os.path.join(d, 'games.json'), encoding='utf8'))
        keep = {'_page.png'}
        for g in data.get('games', []):
            url = BASE_URL + posixpath.normpath(rel + '/' + g['path']) + '/'
            qr(url, os.path.join(d, 'qr', g['id'] + '.png'))
            gdir = os.path.join(ROOT, posixpath.normpath(rel + '/' + g['path']))
            img = posixpath.normpath(rel + '/' + g['thumbnail']) if g.get('thumbnail') else OG_IMAGE
            block = ogp(g['title'], g.get('description', ''), url, img)
            put_ogp(os.path.join(gdir, 'index.html'), block)
            put_ogp(os.path.join(gdir, 'src', 'head.html'), block)  # 分割して作っているゲーム用（入っていれば）
            keep.add(g['id'] + '.png')
        for f in os.listdir(os.path.join(d, 'qr')):
            if f.endswith('.png') and f not in keep:
                os.remove(os.path.join(d, 'qr', f))
        print(f'{rel}: {len(keep) - 1} games')


if __name__ == '__main__':
    main()
