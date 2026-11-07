#!/usr/bin/env python3
"""一覧ページとQRコードを作り直す。

collections.json に載っているフォルダ（samples/、events/<id>/ など）ごとに
  - index.html（一覧）と print.html（印刷用QRシート）をひな形から書き出す
  - qr/_page.png（一覧ページ）と qr/<ゲームid>.png（各ゲーム）を作る

使い方:  pip install segno  →  python3 tools/build.py
"""
import json, os, posixpath, segno

BASE_URL = 'https://naosugi.github.io/naosugi-ai-games/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LIST = '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ゲーム一覧 - 作ってみたゲームの発表会（仮）</title>
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
  <div class="bar">
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


def qr(url, path):
    segno.make(url, error='m').save(path, scale=12, border=4)


def main():
    cols = json.load(open(os.path.join(ROOT, 'collections.json'), encoding='utf8'))
    for c in cols:
        rel = c['path'].strip('/')
        d = os.path.join(ROOT, rel)
        up = '../' * (rel.count('/') + 1)
        os.makedirs(os.path.join(d, 'qr'), exist_ok=True)
        for name, tpl in (('index.html', LIST), ('print.html', PRINT)):
            open(os.path.join(d, name), 'w', encoding='utf8').write(tpl.format(up=up))
        page_url = BASE_URL + rel + '/'
        qr(page_url, os.path.join(d, 'qr', '_page.png'))
        data = json.load(open(os.path.join(d, 'games.json'), encoding='utf8'))
        keep = {'_page.png'}
        for g in data.get('games', []):
            url = BASE_URL + posixpath.normpath(rel + '/' + g['path']) + '/'
            qr(url, os.path.join(d, 'qr', g['id'] + '.png'))
            keep.add(g['id'] + '.png')
        for f in os.listdir(os.path.join(d, 'qr')):
            if f.endswith('.png') and f not in keep:
                os.remove(os.path.join(d, 'qr', f))
        print(f'{rel}: {len(keep) - 1} games')


if __name__ == '__main__':
    main()
