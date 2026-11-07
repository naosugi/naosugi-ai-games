#!/usr/bin/env python3
"""講座スライドを、1ファイルで完結するHTMLにまとめる。

events/<イベント>/slides/src/<番号>/deck.json と、そこに並べたスライド（<section>…</section> の断片）から
events/<イベント>/slides/<番号>.html を書き出す。

deck.json: {"title": "…", "wip": "（任意）上に出す注意書き", "order": ["cover", "agenda", …]}
使い方:  python3 tools/build_slides.py
"""
import glob, html, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TPL = r'''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>__TITLE__</title>
<!-- このファイルは tools/build_slides.py が書き出します。直接編集せず slides/src/ を直してください -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@700;900&family=Zen+Kaku+Gothic+New:wght@500;700&display=swap">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:#0b1220;overflow:hidden;font-family:'Zen Kaku Gothic New',system-ui,-apple-system,"Hiragino Sans",sans-serif}
#stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform-origin:0 0}
#stage>section{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;display:none!important}
#stage>section.on{display:flex!important}
section ul{padding-left:1.3em}
section li{margin:.15em 0}
section table{border-collapse:collapse;width:100%;border-radius:16px;overflow:hidden}
section th,section td{text-align:left;vertical-align:top;padding:18px 28px;border-bottom:2px solid #D5DDE3;line-height:1.45}
section th{background:#1D2A36;color:#FBFCFD;font-weight:700}
#wip{position:fixed;top:0;left:0;right:0;background:#FFE066;color:#1D2A36;font-size:13px;font-weight:700;text-align:center;padding:6px 10px;padding-top:max(6px,env(safe-area-inset-top));z-index:3}
#bar{position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;gap:8px;padding:8px 12px;padding-bottom:max(8px,env(safe-area-inset-bottom));background:#0b1220cc;color:#cfe0f7;font-size:13px;z-index:3}
#bar a,#bar button{white-space:nowrap;font:inherit;color:#cfe0f7;background:#1b2a44;border:1px solid #2a4670;border-radius:8px;padding:6px 12px;text-decoration:none;cursor:pointer}
#bar .sp{flex:1}
#count{min-width:4.5em;text-align:center}
@media print{
  @page{size:1920px 1080px;margin:0}
  html,body{overflow:visible;background:#fff;height:auto}
  #bar,#wip{display:none}
  #stage{position:static;transform:none!important;width:auto;height:auto}
  #stage>section{position:relative;display:flex!important;break-after:page}
}
</style>
</head>
<body>
__WIP__
<div id="stage">
__SLIDES__
</div>
<div id="bar">
  <a href="../">← 講座のページ</a>
  <span class="sp"></span>
  <button id="prev" aria-label="前へ">◀</button><span id="count"></span><button id="next" aria-label="次へ">▶</button>
  <span class="sp"></span>
  <button id="fs">全画面</button>
</div>
<script>
(() => {
  const st = document.getElementById('stage'), s = [...st.children];
  let i = Math.min(Math.max((parseInt(location.hash.slice(1)) || 1) - 1, 0), s.length - 1);
  function fit() {
    const top = document.getElementById('wip') ? document.getElementById('wip').offsetHeight : 0;
    const bot = document.getElementById('bar').offsetHeight;
    const w = innerWidth, h = innerHeight - top - bot;
    const k = Math.min(w / 1920, h / 1080);
    st.style.transform = `translate(${-960 * k}px, ${-540 * k + (top - bot) / 2}px) scale(${k})`;
  }
  function show(n) {
    i = Math.min(Math.max(n, 0), s.length - 1);
    s.forEach((e, j) => e.classList.toggle('on', j === i));
    document.getElementById('count').textContent = (i + 1) + ' / ' + s.length;
    try { history.replaceState(null, '', '#' + (i + 1)); } catch (e) {}
  }
  addEventListener('keydown', e => {
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); show(i + 1); }
    if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); show(i - 1); }
    if (e.key === 'Home') show(0);
    if (e.key === 'End') show(s.length - 1);
  });
  document.getElementById('prev').onclick = () => show(i - 1);
  document.getElementById('next').onclick = () => show(i + 1);
  document.getElementById('fs').onclick = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) {} };
  st.addEventListener('click', e => show(e.clientX > innerWidth / 2 ? i + 1 : i - 1));
  let x0 = null;
  addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(dx < 0 ? i + 1 : i - 1); x0 = null; });
  addEventListener('resize', fit);
  fit(); show(i);
})();
</script>
</body>
</html>
'''


def main():
    for deck in sorted(glob.glob(os.path.join(ROOT, 'events', '*', 'slides', 'src', '*', 'deck.json'))):
        src = os.path.dirname(deck)
        d = json.load(open(deck, encoding='utf8'))
        slides = '\n'.join(open(os.path.join(src, k + '.html'), encoding='utf8').read().strip() for k in d['order'])
        wip = f'<div id="wip">{html.escape(d["wip"])}</div>' if d.get('wip') else ''
        out = TPL.replace('__TITLE__', html.escape(d['title'])).replace('__WIP__', wip).replace('__SLIDES__', slides)
        dst = os.path.join(os.path.dirname(os.path.dirname(src)), os.path.basename(src) + '.html')
        open(dst, 'w', encoding='utf8').write(out)
        print(os.path.relpath(dst, ROOT), len(d['order']), 'slides')


if __name__ == '__main__':
    main()
