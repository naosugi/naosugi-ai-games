#!/usr/bin/env python3
"""src/ の部品を1つの index.html にまとめる。

  python3 games/wombat-legacy-rpg-2/build.py

ゲームのルールは sim/core.js（シミュレーターと同じもの）を使う。
index.html は直接編集しない（OGP の部分だけは tools/build.py が書きかえる）。
"""
import os, re
D = os.path.dirname(os.path.abspath(__file__))
def read(p): return open(os.path.join(D, p), encoding='utf-8').read()
parts = [('sim/core.js', read('sim/core.js')), ('src/render.js', read('src/render.js')),
         ('src/game.js', read('src/game.js')), ('src/ui.js', read('src/ui.js'))]
js = '\n'.join(f'// ---- {name} ----\n{src}' for name, src in parts)
tpl = read('src/template.html')
out_path = os.path.join(D, 'index.html')
# 既存の index.html の OGP（tools/build.py が書いたもの）を引きつぐ
if os.path.exists(out_path):
    old = open(out_path, encoding='utf-8').read()
    m = re.search(r'<!-- OGP.*?<!-- /OGP -->', old, re.S)
    if m: tpl = re.sub(r'<!-- OGP.*?<!-- /OGP -->', lambda _: m.group(0), tpl, flags=re.S)
html = tpl.replace('/*@@BUILD@@*/', js)
open(out_path, 'w', encoding='utf-8').write(html)
print('wrote', out_path, len(html), 'bytes')
