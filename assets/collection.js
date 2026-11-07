// ゲーム一覧ページ（サンプル・イベント共通）。同じフォルダの games.json を読んで表示する。
// <body data-mode="list"> … 一覧 / <body data-mode="print"> … 印刷用QRシート
(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NEW_DAYS = 14;
  const mode = document.body.dataset.mode || 'list';
  let info = {}, games = [], activeTag = '';

  const isNew = g => { const t = Date.parse(g.added); return !isNaN(t) && Date.now() - t < NEW_DAYS * 864e5; };
  const gameUrl = g => new URL(g.path, location.href).href;
  const href = p => p.endsWith('/') ? p : p + '/';

  function renderHead() {
    document.title = (info.title || 'ゲーム一覧') + ' - 作ってみたゲームの発表会（仮）';
    $('title').textContent = info.title || '';
    $('lead').textContent = info.lead || '';
    $('evmeta').innerHTML = [info.date && '📅 ' + esc(info.date), info.place && '📍 ' + esc(info.place)].filter(Boolean).map(s => '<span>' + s + '</span>').join('');
  }

  // about: [{h, p:[...], ul:[...], tables:[{caption, goal, rows:[[...]]}]}]。**太字** と [文字](URL) だけ使える
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  function renderAbout() {
    const a = info.about;
    if (!Array.isArray(a) || !a.length || !$('about')) return;
    $('about').innerHTML = a.map(s => `<div class="sect"><h2>${esc(s.h)}</h2>` +
      (s.p || []).map(t => '<p>' + inline(t) + '</p>').join('') +
      (s.ul && s.ul.length ? '<ul>' + s.ul.map(t => '<li>' + inline(t) + '</li>').join('') + '</ul>' : '') +
      (s.tables || []).map(t => `<div class="tbl"><h3>${esc(t.caption)}</h3>` +
        (t.goal ? `<div class="goal">到達点：${inline(t.goal)}</div>` : '') +
        '<table>' + (t.rows || []).map(r => '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('') + '</table></div>').join('') +
      '</div>').join('');
    $('about').hidden = false;
    $('gamesh').hidden = false;
  }

  function card(g) {
    const p = href(g.path);
    return `
      <div class="card">
        <a class="thumb" href="${esc(p)}" ${g.thumbnail ? `style="background-image:url('${esc(g.thumbnail)}')"` : ''}>
          ${g.thumbnail ? '' : '<div class="ph">🎮</div>'}${isNew(g) ? '<span class="new">NEW</span>' : ''}
        </a>
        <div class="body">
          <h2><a href="${esc(p)}">${esc(g.title)}</a></h2>
          ${g.author ? `<div class="author">制作者: ${esc(g.author)}</div>` : ''}
          <p>${esc(g.description)}</p>
          <div class="meta">${g.playtime ? '<span>⏱ ' + esc(g.playtime) + '</span>' : ''}${g.controls ? '<span>🕹 ' + esc(g.controls) + '</span>' : ''}</div>
          <div class="chips">${(g.tags || []).map(t => '<span class="chip">' + esc(t) + '</span>').join('')}</div>
          <div class="acts">
            <div class="btns">
              <a class="play" href="${esc(p)}">遊ぶ ▶</a>
              <a class="dl" href="${esc(p)}index.html" download="${esc(g.id)}.html">⬇ ダウンロード</a>
            </div>
            <a class="qr" href="qr/${esc(g.id)}.png" target="_blank" title="QRコード（画像を開く）"><img src="qr/${esc(g.id)}.png" alt="${esc(g.title)} のQRコード" loading="lazy"></a>
          </div>
        </div>
      </div>`;
  }

  function renderList() {
    const q = $('q').value.trim().toLowerCase();
    const list = games.filter(g => (!activeTag || (g.tags || []).includes(activeTag)) &&
      (!q || [g.title, g.description, g.author, ...(g.tags || [])].join(' ').toLowerCase().includes(q)));
    $('count').textContent = list.length + ' / ' + games.length + ' 本';
    $('grid').innerHTML = !games.length
      ? '<div class="msg">ゲームはまだありません。<br>講座のあとに掲載します。</div>'
      : list.length ? list.map(card).join('') : '<div class="msg">該当するゲームがありません</div>';
  }
  function renderTags() {
    const all = [...new Set(games.flatMap(g => g.tags || []))];
    $('tags').innerHTML = all.length ? ['', ...all].map(t => `<button class="tag${t === activeTag ? ' on' : ''}" data-t="${esc(t)}">${t ? esc(t) : 'すべて'}</button>`).join('') : '';
  }

  function renderPrint() {
    $('sheet').innerHTML = games.length ? games.map(g => `
      <div class="item">
        <img src="qr/${esc(g.id)}.png" alt="">
        <div class="t">${esc(g.title)}</div>
        ${g.author ? `<div class="a">制作者: ${esc(g.author)}</div>` : ''}
        <div class="u">${esc(gameUrl(g).replace(/^https?:\/\//, ''))}</div>
      </div>`).join('') : '<p>ゲームはまだありません。</p>';
    $('pageurl').textContent = location.href.replace(/print\.html.*$/, '').replace(/^https?:\/\//, '');
  }

  fetch('games.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(data => {
      info = data || {};
      games = (info.games || []).slice();
      if (info.kind !== 'event') games.sort((a, b) => String(b.added || '').localeCompare(String(a.added || '')));
      renderHead();
      if (mode === 'print') { renderPrint(); return; }
      $('tags').addEventListener('click', e => { const b = e.target.closest('.tag'); if (!b) return; activeTag = b.dataset.t; renderTags(); renderList(); });
      $('q').addEventListener('input', renderList);
      renderAbout();
      if (!games.length) { $('bar').hidden = true; $('count').hidden = true; }
      renderTags(); renderList();
    })
    .catch(() => {
      const el = $('grid') || $('sheet');
      el.innerHTML = '<div class="msg">ゲーム一覧を読み込めませんでした。<br>ファイルを直接開いた場合（file://）は読み込めません。Web サーバー経由で開いてください。</div>';
    });
})();
