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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&family=Zen+Maru+Gothic:wght@700;900&family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap">
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
/* ポスターに合わせた見た目（section に class="px" を付けたスライド） */
.px{--navy:#1C2A5B;--ink:#191B2B;--yel:#FFD95A;--org:#F2A33A;--red:#E8613C;--grass:#5DB548;--muted:#BFD0F0;
  flex-direction:column;gap:34px;padding:60px 110px 150px;color:#fff;font-family:'Zen Kaku Gothic New',system-ui,sans-serif;font-weight:700;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 8' shape-rendering='crispEdges'%3E%3Cpath fill='%23fff' d='M6 0h5v1h2v1h3v1h2v2h2v3H0V5h1V3h2V2h3z'/%3E%3Cpath fill='%23d7ecfb' d='M0 7h20v1H0z'/%3E%3C/svg%3E") no-repeat 1490px 70px/300px 120px,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 8' shape-rendering='crispEdges'%3E%3Cpath fill='%23fff' d='M6 0h5v1h2v1h3v1h2v2h2v3H0V5h1V3h2V2h3z'/%3E%3Cpath fill='%23d7ecfb' d='M0 7h20v1H0z'/%3E%3C/svg%3E") no-repeat 70px 40px/200px 80px,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 8' shape-rendering='crispEdges'%3E%3Cpath fill='%23fff' d='M6 0h5v1h2v1h3v1h2v2h2v3H0V5h1V3h2V2h3z'/%3E%3Cpath fill='%23d7ecfb' d='M0 7h20v1H0z'/%3E%3C/svg%3E") no-repeat 960px 22px/150px 60px,linear-gradient(180deg,#3E8BD9 0%,#6FB6EC 70%,#92CDF3 100%)}
.px::after{content:'';position:absolute;left:0;right:0;bottom:0;height:110px;background:linear-gradient(#3F9A3A,#3F9A3A) top/100% 6px no-repeat,linear-gradient(var(--grass),var(--grass)) 0 6px/100% 18px no-repeat,url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='80' shape-rendering='crispEdges'%3E%3Crect width='160' height='80' fill='%23A86A37'/%3E%3Cg fill='%23C4824A'%3E%3Crect x='4' y='4' width='72' height='3'/%3E%3Crect x='84' y='4' width='72' height='3'/%3E%3Crect x='44' y='44' width='72' height='3'/%3E%3Crect x='0' y='44' width='36' height='3'/%3E%3Crect x='124' y='44' width='36' height='3'/%3E%3C/g%3E%3Cg fill='%237A4520'%3E%3Crect y='0' width='160' height='4'/%3E%3Crect y='40' width='160' height='4'/%3E%3Crect x='0' y='0' width='4' height='40'/%3E%3Crect x='80' y='0' width='4' height='40'/%3E%3Crect x='40' y='40' width='4' height='40'/%3E%3Crect x='120' y='40' width='4' height='40'/%3E%3C/g%3E%3C/svg%3E") 0 24px/160px 80px repeat-x,#A86A37}
.px .dot,.px h1,.px h2,.px h3,.px .kick,.px .num{font-family:'DotGothic16','Zen Kaku Gothic New',sans-serif;font-weight:400}
.px .hd{display:flex;flex-direction:column;align-items:flex-start;gap:16px}
.px .kick{display:inline-flex;align-items:center;gap:14px;background:var(--yel);color:var(--ink);font-size:32px;padding:6px 22px;border:5px solid var(--ink);box-shadow:6px 6px 0 var(--ink)}
.px h1,.px h2{color:#fff;letter-spacing:2px;text-shadow:-4px 0 0 var(--ink),4px 0 0 var(--ink),0 -4px 0 var(--ink),0 4px 0 var(--ink),-4px -4px 0 var(--ink),4px 4px 0 var(--ink),-4px 4px 0 var(--ink),4px -4px 0 var(--ink),8px 8px 0 #0e1440}
.px h2{font-size:66px;line-height:1.22}
.px h1{font-size:120px;line-height:1.15}
.px .y{color:var(--yel)}
.px .o{color:var(--org)}
.px .panel{background:var(--navy);border:6px solid #fff;box-shadow:0 0 0 6px var(--ink),10px 10px 0 6px #0e144066;padding:32px 42px;font-size:38px;line-height:1.55;min-height:0}
.px .panel h3{color:var(--yel);font-size:44px;line-height:1.3;margin-bottom:14px}
.px .panel b,.px .panel .y{color:var(--yel)}
.px .panel .s{font-size:28px;color:var(--muted);font-weight:500}
.px .panel p+p{margin-top:12px}
.px ul{list-style:none;padding:0}
.px li{position:relative;padding-left:1.15em;margin:.18em 0}
.px li::before{content:'▸';position:absolute;left:0;color:var(--yel)}
.px .cols{display:grid;grid-template-columns:1fr 1fr;gap:44px;flex:1;min-height:0}
.px .cols3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;flex:1;min-height:0}
.px .ybox{background:var(--yel);color:var(--ink);border:6px solid var(--ink);box-shadow:8px 8px 0 #0e144088;padding:18px 34px;font-size:34px;line-height:1.5}
.px .ybox b{color:#B3361A}
.px .wip{background:var(--red);color:#fff;font-size:22px;padding:2px 12px;border:3px solid var(--ink);font-family:'DotGothic16',sans-serif}
.px .todo{border:5px dashed var(--yel);background:#1C2A5BCC;color:var(--yel);padding:16px 28px;font-size:28px;line-height:1.5}
.px table{border-collapse:collapse;width:100%;border-radius:0}
.px th,.px td{padding:10px 22px;border-bottom:3px dashed #3E5394;font-size:32px;line-height:1.45;text-align:left;vertical-align:top}
.px th{background:var(--ink);color:var(--yel);font-family:'DotGothic16',sans-serif;font-weight:400;border-bottom:none}
.px td:first-child{color:var(--yel);white-space:nowrap}
.px tr:last-child td{border-bottom:none}
.px .center,.px.center{align-items:center;justify-content:center;text-align:center}
.px .kick{align-self:flex-start}
.px.center .kick,.px .center .kick{align-self:center}
.px .card{display:flex;flex-direction:column;gap:14px}
.px .card img{width:100%;aspect-ratio:2/1;object-fit:cover;border:5px solid #fff;image-rendering:auto}
.px .code{font-family:'DotGothic16',monospace;white-space:pre-wrap;font-size:30px;line-height:1.55}
.px .flow{display:flex;gap:22px;align-items:stretch}
.px .flow>.panel{flex:1;padding:24px 26px;font-size:30px}
.px .num{display:inline-block;background:var(--yel);color:var(--ink);min-width:1.6em;text-align:center;margin-right:10px;padding:0 6px}
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
