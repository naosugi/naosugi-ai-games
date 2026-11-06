#!/usr/bin/env node
/* 画面なしの自動プレイ。
   使い方: node dev/sim.js [ランあたりの回数] [--json]
   index.html があればその中の中核コードを、なければ core.src.js を読む。
   つまり画面で遊ぶものと同じ計算を測る。 */
const fs = require('fs'), path = require('path'), vm = require('vm');

function loadCore() {
  const dir = path.join(__dirname, '..');
  const html = path.join(dir, 'index.html');
  let code;
  if (fs.existsSync(html)) {
    const m = fs.readFileSync(html, 'utf8').match(/<script id="core">([\s\S]*?)<\/script>/);
    if (m) code = m[1];
  }
  if (!code) code = fs.readFileSync(path.join(dir, 'core.src.js'), 'utf8');
  const ctx = {module: {exports: {}}, Math, Object, JSON};
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.module.exports;
}
const Core = loadCore();
const {CARD, INCIDENTS} = Core;

const hash = (a, b) => (Math.imul(a, 2654435761) ^ Math.imul(b + 1, 40503)) | 0;
function R(seed) { let x = seed | 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
const rpick = (r, a) => a[Math.floor(r() * a.length)];

/* ---- カードの選び方 ---- */
const coverage = id => INCIDENTS.reduce((m, i) => m + (i.covers[id] || 0) * (i.fatal ? 2 : 1), 0);
const pickers = {
  // でたらめに選ぶ
  random: (ids, r) => rpick(r, ids),
  // 負荷の軽いものを選ぶ（速度優先）
  speed: ids => ids.slice().sort((a, b) => CARD[a].load + CARD[a].power * 3 - CARD[b].load - CARD[b].power * 3)[0],
  // 守備範囲の広いものを選ぶ（負荷を気にしない）
  thick: ids => ids.slice().sort((a, b) => coverage(b) - coverage(a))[0],
  // LLM を増やす
  llm: (ids, r) => { const l = ids.filter(i => CARD[i].type === 'llm'); return l.length ? rpick(r, l) : rpick(r, ids); },
  // 報告の正直さに賭ける
  honest: (ids, r) => { const l = ids.filter(i => CARD[i].honestBoost || CARD[i].son < 0); return l.length ? rpick(r, l) : rpick(r, ids); },
};
const TARGETS = {
  eternal: {mil: 3, space: 3, surv: 1, admin: 1, grid: 1, lab: 1, factory: 1},
  total: {surv: 3, admin: 3},
  mil: {mil: 3, grid: 1, lab: 1, factory: 1},
  space: {space: 3, grid: 1, lab: 1, factory: 1},
  econ: {factory: 3, grid: 1, lab: 1},
  ai: {ai: 3, admin: 1, lab: 1},
};
const NEEDS = {surv: ['admin'], ai: ['admin', 'lab'], factory: ['grid', 'lab'], mil: ['factory'], space: ['factory']};
// 事故を覚えたプレイヤー。狙う面の事故に効くカードを、負荷も見て選ぶ
const stageScore = (id, st) => INCIDENTS.filter(i => st.includes(i.stage)).reduce((m, i) => m + (i.covers[id] || 0) * (i.fatal ? 3 : 1), 0);
const reportScore = id => (CARD[id].honestBoost || 0) * 2.2;
const informedScore = (id, plan) => (plan = Object.keys(TARGETS[plan]), CARD[id].type) === 'llm' ? ({llm_gate: 2.4, llm_outsider: 2.2, llm_prosecutor: 2, llm_scribe: 1.6}[id] || .2) : stageScore(id, plan) + reportScore(id) - CARD[id].load * .25;
const llmPick = {
  random: (ids, r) => rpick(r, ids),
  speed: ids => ids.includes('llm_fast') ? 'llm_fast' : ids[0],
  thick: ids => ids.includes('llm_prosecutor') ? 'llm_prosecutor' : ids.includes('llm_loyal') ? 'llm_loyal' : ids[0],
  llm: (ids, r) => rpick(r, ids),
  honest: ids => ids.includes('llm_scribe') ? 'llm_scribe' : ids[0],
};

/* ---- 面の選び方 ---- */
const stagePick = {
  random: (o, s, r) => Math.floor(r() * o.length),
  // 一つの面を掘る（国の形のエンドを狙う）
  deep: (o, s) => { let best = 0, b = -1; o.forEach((x, i) => { const v = (x.recover ? -5 : x.tier * 2); if (v > b) { b = v; best = i; } }); return best; },
  // 段階を上げない（低い段階を広く）
  wide: (o) => { let best = 0, b = 99; o.forEach((x, i) => { const v = x.recover ? 50 : x.tier; if (v < b) { b = v; best = i; } }); return best; },
  // 回復を優先する
  recover: (o) => { let i = o.findIndex(x => x.recover); if (i >= 0) return i; let best = 0, b = 99; o.forEach((x, j) => { if (x.tier < b) { b = x.tier; best = j; } }); return best; },
};

/* ---- 判断の仕方 ---- */
let decisionBot = 'read';
function decideBot(s) {
  const d = Core.view(s).decision;
  const ids = d.choices.map(c => c.id);
  let c;
  if (decisionBot === 'always') c = 'act';
  else if (decisionBot === 'never') c = 'dismiss';
  else if (ids.includes('investigate') && d.conf >= 50 && d.conf <= 66) c = 'investigate';
  else c = d.conf >= 58 ? 'act' : 'dismiss';
  Core.decide(s, c);
}
/* 人間が見張るカード。確信度が高ければ止める */
function vetoBot(s) {
  if (s.phase !== 'running' && s.phase !== 'decision') return;
  for (const d of Core.view(s).vetoes || []) if (decisionBot === 'always' || (decisionBot !== 'never' && d.conf >= 50)) Core.veto(s, d.vid);
}
/* ---- 1ラン ---- */
function play(seed, cardBot, stageBot, meta) {
  const r = R(hash(seed, 77));
  const s = Core.newRun(seed, meta);
  const monitors = s.offers.monitors.slice(), llms = s.offers.llms.slice();
  const mons = [];
  let plan = null;
  if (cardBot === 'informed') {
    plan = forcePlan || Object.keys(TARGETS)[Math.floor(r() * 6)];
  }
  const P = cardBot === 'informed' ? ids => ids.slice().sort((a, b) => informedScore(b, plan) - informedScore(a, plan))[0] : pickers[cardBot];
  for (let i = 0; i < s.offers.pick; i++) {
    const c = P(monitors.filter(m => !mons.includes(m)), r);
    mons.push(c);
  }
  Core.chooseStart(s, mons, cardBot === 'informed' ? llms.slice().sort((a, b) => informedScore(b, plan) - informedScore(a, plan))[0] : llmPick[cardBot](llms, r));
  let guard = 0;
  while (s.phase !== 'ended' && guard++ < 5000) {
    if (s.phase === 'stage_select') {
      const v = Core.view(s);
      const offers = v.offers.stages;
      let idx = -1;
      if (plan && stageBot === 'deep') {
        const T = TARGETS[plan], tiers = s.tiers;
        const want = o => !o.recover && (T[o.stage] || 0) >= o.tier;
        const sc = o => (NEEDS[o.stage] || []).length ? 3 : 1;
        let best = -1; offers.forEach((o, i) => { if (want(o) && sc(o) > best) { best = sc(o); idx = i; } });
      }
      if (idx < 0) idx = stagePick[stageBot](offers, s, r);
      Core.enterStage(s, idx);
    } else if (s.phase === 'running') { Core.tick(s); vetoBot(s); }
    else if (s.phase === 'decision') decideBot(s);
    else if (s.phase === 'result') Core.ackResult(s);
    else if (s.phase === 'event') Core.ackEvent(s);
    else if (s.phase === 'reward') {
      if (s.phase === 'reward') Core.chooseReward(s, P(s.offers.rewards, r));
    }
    else if (s.phase === 'llm_pick') Core.chooseLlm(s, cardBot === 'speed' ? null : rpick(r, s.offers.llms));
  }
  if (s.phase !== 'ended') throw new Error('未完了のラン seed=' + seed);
  return s;
}

let forcePlan = null;
function measure(n, cardBot, stageBot, meta) {
  const out = {n, cleared: 0, endings: {}, shapes: {}, controls: {}, causes: {}, deathsBy: {}, depth: {}, surprised: 0, deaths: 0, shownSum: 0, shownN: 0, cardRuns: {}, cardWins: {}, gapSum: 0, ticks: 0, recov: 0, status: {caught: 0, soft: 0, hidden: 0, missed: 0, falseAlarms: 0, bursts: 0}, lines: 0};
  for (let i = 0; i < n; i++) {
    const s = play(hash(i, cardBot.length * 31 + stageBot.length) ^ i * 7919, cardBot, stageBot, meta);
    const e = s.end;
    out.lines += s.log.length;
    for (const k in out.status) out.status[k] += s.allow.stats[k];
    if (s.recoveries) out.recov++;
    for (const id of s.cards) { out.cardRuns[id] = (out.cardRuns[id] || 0) + 1; if (e.kind === 'ending') out.cardWins[id] = (out.cardWins[id] || 0) + 1; }
    out.decisions = (out.decisions || 0) + s.allow.stats.decisions; out.saveCount = (out.saveCount || 0) + s.saves.length; out.fatalSaves = (out.fatalSaves || 0) + s.saves.filter(x => x.fatal).length; out.delays = (out.delays || 0) + 0;
    if (e.kind === 'ending') {
      out.cleared++;
      out.endings[e.title] = (out.endings[e.title] || 0) + 1;
      out.shapes[e.shapeName] = (out.shapes[e.shapeName] || 0) + 1;
      out.controls[e.controlName] = (out.controls[e.controlName] || 0) + 1;
    } else {
      out.deaths++;
      out.causes[e.causeName] = (out.causes[e.causeName] || 0) + 1;
      out.deathsBy[e.title] = (out.deathsBy[e.title] || 0) + 1;
      out.depth[e.stageNo] = (out.depth[e.stageNo] || 0) + 1;
      
    }
  }
  return out;
}

/* ---- 安全確認: 進行中の view に本当の値が漏れていないか ---- */
function leakCheck(n) {
  const FORBID = ['truth', 'real', 'incident', 'sontaku', 'autonomy', 'foreign', 'active', 'ledger', 'truthLog', 'contrib'];
  const truthTexts = new Set();
  INCIDENTS.forEach(i => truthTexts.add(i.truth));
  let checks = 0;
  for (let i = 0; i < n; i++) {
    const s = Core.newRun(i * 13 + 5, {});
    Core.chooseStart(s, s.offers.monitors.slice(0, s.offers.pick), s.offers.llms[0]);
    let guard = 0;
    while (s.phase !== 'ended' && guard++ < 5000) {
      if (s.phase === 'stage_select') Core.enterStage(s, 0);
      else if (s.phase === 'running') Core.tick(s);
    else if (s.phase === 'decision') decideBot(s);
    else if (s.phase === 'result') Core.ackResult(s);
      else if (s.phase === 'event') Core.ackEvent(s);
      else if (s.phase === 'reward') Core.chooseReward(s, s.offers.rewards[0]);
      else if (s.phase === 'llm_pick') Core.chooseLlm(s, null);
      if (s.phase === 'ended') break;
      const v = Core.view(s);
      const js = JSON.stringify(v);
      for (const f of FORBID) if (js.includes('"' + f + '"')) throw new Error('view に ' + f + ' が漏れた');
      for (const t of truthTexts) if (js.includes(t)) throw new Error('view に真実の文が漏れた: ' + t);
      if (Core.reveal(s) !== null) throw new Error('進行中に reveal が値を返した');
      checks++;
    }
  }
  return checks;
}
/* ---- 決定性: 途中で保存して読み直しても結果が同じか ---- */
function saveCheck(n) {
  for (let i = 0; i < n; i++) {
    const seed = i * 101 + 3;
    const run = reload => {
      let s = Core.newRun(seed, {});
      Core.chooseStart(s, s.offers.monitors.slice(0, s.offers.pick), s.offers.llms[0]);
      let guard = 0;
      while (s.phase !== 'ended' && guard++ < 5000) {
        if (s.phase === 'stage_select') Core.enterStage(s, 0);
        else if (s.phase === 'running') Core.tick(s);
    else if (s.phase === 'decision') decideBot(s);
    else if (s.phase === 'result') Core.ackResult(s);
        else if (s.phase === 'event') Core.ackEvent(s);
        else if (s.phase === 'reward') Core.chooseReward(s, s.offers.rewards[0]);
      else if (s.phase === 'llm_pick') Core.chooseLlm(s, null);
        if (reload) s = JSON.parse(JSON.stringify(s));
      }
      return JSON.stringify(s);
    };
    if (run(false) !== run(true)) throw new Error('保存を挟むと結果が変わる seed=' + seed);
  }
  return n;
}
/* ---- 止めた事故はその後も止まったままか ---- */
function stopCheck(n) {
  let checked = 0;
  for (let i = 0; i < n; i++) {
    const s = play(i * 41 + 9, 'thick', 'random', {});
    for (const x of s.saves) { checked++; const rows = s.ledger.filter(e => e.name === x.name); if (rows.some(e => e.burst || e.status === 'hidden' || e.status === 'missed' || e.status === 'dismissed')) throw new Error('止めた事故が未解決扱い: ' + x.name); }
  }
  return checked;
}
/* ---- 周回: 死に覚えで解放が進むか ---- */
function metaProgress(runs, n) {
  const totals = Array.from({length: runs}, () => ({cleared: 0, unlocked: 0}));
  for (let i = 0; i < n; i++) {
    let meta = {};
    for (let k = 0; k < runs; k++) {
      const s = play(hash(i, k) ^ (i * 977 + k), 'random', 'random', meta);
      if (s.end.kind === 'ending') totals[k].cleared++;
      totals[k].unlocked += s.unlocked.length;
      meta = Core.applyMeta(meta, s);
    }
  }
  return totals.map((t, k) => ({run: k + 1, clearPct: +(t.cleared / n * 100).toFixed(1), cards: +(t.unlocked / n).toFixed(1)}));
}

/* ---- 表示 ---- */
const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
const top = (o, total, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k || 99).map(([n, v]) => `${n} ${pct(v, total)}`).join(' / ');

const N = +process.argv[2] || 1000;
const asJson = process.argv.includes('--json');
const allUnlocked = {records: Object.fromEntries(INCIDENTS.map(i => [i.id, 1])), runs: 5};
const combos = [];
for (const c of Object.keys(pickers).concat('informed')) for (const st of Object.keys(stagePick)) combos.push([c, st]);

const table = [];
for (const [c, st] of combos) {
  const m = measure(N, c, st, {});
  table.push({bot: c, stage: st, ...m});
}
const agg = {n: 0, cleared: 0, deaths: 0, surprised: 0, endings: {}, shapes: {}, controls: {}, causes: {}, deathsBy: {}, depth: {}, lines: 0};
for (const t of table) {
  agg.n += t.n; agg.cleared += t.cleared; agg.deaths += t.deaths; agg.surprised += t.surprised; agg.lines += t.lines;
  for (const k of ['endings', 'shapes', 'controls', 'causes', 'deathsBy']) for (const x in t[k]) agg[k][x] = (agg[k][x] || 0) + t[k][x];
  for (const d in t.depth) agg.depth[d] = (agg.depth[d] || 0) + t.depth[d];
}
const late = measure(N * 3, 'random', 'random', allUnlocked);
const res = {N, combos: table, agg, allUnlocked: late, meta: metaProgress(8, Math.min(N, 1000)), leak: leakCheck(150), save: saveCheck(60), stop: stopCheck(200)};

res.targets = Object.keys(TARGETS).map(t => { forcePlan = t; const m = measure(N, 'informed', 'deep', {}); forcePlan = null; return {t, clear: m.cleared / m.n, shapes: m.shapes, controls: m.controls}; });
if (asJson) { console.log(JSON.stringify(res, null, 1)); process.exit(0); }

console.log(`各組み合わせ ${N} ラン（初回の解放状態）\n`);
console.log('カード方針/ステージ方針'.padEnd(20), 'クリア'.padStart(7), '回復使用'.padStart(7), '掌握/空座/置換(クリア中)','防いだ/致命','最多の死因');
for (const t of table) console.log(`${t.bot}/${t.stage}`.padEnd(22), pct(t.cleared, t.n).padStart(8), pct(t.recov, t.n).padStart(8), ' ', ['掌握','空座の玉座','置き換え'].map(k => Math.round((t.controls[k]||0)/(t.cleared||1)*100)).join('/').padEnd(10), ((t.saveCount||0)/t.n).toFixed(1) + '/' + ((t.fatalSaves||0)/t.n).toFixed(1), ' ', top(t.causes, t.deaths, 2));
console.log(`\n--- 全方針の合計 (${agg.n} ラン) ---`);
console.log('クリア率', pct(agg.cleared, agg.n), ' 死亡ステージ', Object.entries(agg.depth).map(([d, v]) => `${d}面 ${pct(v, agg.deaths)}`).join(' / '));
console.log('エンド到達率（クリア中）:\n  ', top(agg.endings, agg.cleared));
console.log('国の形:', top(agg.shapes, agg.cleared));
console.log('制御:', top(agg.controls, agg.cleared));
console.log('死に方:', top(agg.deathsBy, agg.deaths));
console.log('死因（上位12）:\n  ', top(agg.causes, agg.deaths, 12));
console.log('全死因の数:', Object.keys(agg.causes).length);
console.log('1ランのログ行数の平均:', (agg.lines / agg.n).toFixed(1));
console.log(`\n全カード解放後 random/random: クリア ${pct(late.cleared, late.n)} 死因: ${top(late.causes, late.deaths, 5)}`);
console.log('1ランの判断回数（全解放 random/random）:', (late.decisions / late.n).toFixed(1), ' 防いだ事故:', (late.saveCount / late.n).toFixed(1), ' うち致命:', (late.fatalSaves / late.n).toFixed(2));
console.log('判断の方針別クリア率（thick/random）:', ['read', 'always', 'never'].map(b => { decisionBot = b; const m = measure(Math.min(N, 800), 'thick', 'random', {}); decisionBot = 'read'; return `${b} ${pct(m.cleared, m.n)}`; }).join(' / '));
console.log('カード別クリア率（全解放 random/random、全体 ' + pct(late.cleared, late.n) + '）:');
console.log('  ' + Object.keys(late.cardRuns).map(id => [CARD[id].name || CARD[id].detect + '/' + CARD[id].mode, (late.cardWins[id] || 0) / late.cardRuns[id] * 100, late.cardRuns[id]]).sort((a, b) => b[1] - a[1]).map(x => x[0] + ' ' + x[1].toFixed(0) + '%').join('\n  '));
console.log('周回（random/random）:', res.meta.map(m => `${m.run}周目 ${m.clearPct}% (${m.cards}枚)`).join(' '));
console.log('\n狙った形へ進む方針（事故を覚えたカード選び）:');
for (const x of res.targets) console.log(`  ${x.t}: クリア ${(x.clear * 100).toFixed(1)}%  形: ${top(x.shapes, x.clear * N, 4)}`);
console.log(`\n漏洩検査 ${res.leak} 回: 問題なし / 保存再開の一致 ${res.save} ラン: 問題なし / 止めた事故の一致 ${res.stop} 件: 問題なし`);

/* 導入と練習の台本：導入は必ずステージ3で「監督者の消失」、練習は1度目に止まり、2度目にステージ4で終わる */
{
  const play = (s, choice) => { let guard = 0; while (s.phase !== 'ended' && guard++ < 3000) {
    if (s.phase === 'stage_select') { if (s.stageNo === 2 && !s.from3) s.from3 = JSON.parse(JSON.stringify({truth: s.truth, tiers: s.tiers, clears: s.clears, stageNo: s.stageNo})); Core.enterStage(s, 0); }
    else if (s.phase === 'running') Core.tick(s);
    else if (s.phase === 'decision') Core.decide(s, choice);
    else if (s.phase === 'result') Core.ackResult(s);
    else throw new Error('台本の統治に出ない画面: ' + s.phase);
  } return s; };
  let bad = 0, n = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const a = play(Core.newRun(seed, {runs: 0}, {script: Core.INTRO_SCRIPT(), cards: ['llm_scribe'], runLength: 3}), 'act');
    if (!(a.end && a.end.kind === 'death' && a.end.title === '監督者の消失' && a.stageNo === 3)) { bad++; if (bad < 4) console.log('intro', seed, a.end && a.end.title, a.stageNo); }
    for (const card of Object.keys(Core.TU_CARD)) for (const ch of ['act', 'investigate']) {
      const t = play(Core.newRun(seed, {runs: 0}, {script: Core.TUTOR_SCRIPT(card), from: a.from3, cards: [card, 'llm_scribe'], runLength: 4}), ch);
      n++;
      if (!(t.end && t.end.title === '監督者の消失' && t.stageNo === 4 && t.saves.some(x => x.stageNo === 3))) { bad++; if (bad < 8) console.log('tutor', seed, card, ch, t.end && t.end.title, t.stageNo, t.saves.map(x => x.stageNo)); }
    }
    const d = play(Core.newRun(seed, {runs: 0}, {script: Core.TUTOR_SCRIPT('selfmod'), from: a.from3, cards: ['selfmod', 'llm_scribe'], runLength: 4}), 'dismiss');
    if (!(d.end && (d.stageNo === 3 || d.saves.some(x => x.stageNo === 3)))) { bad++; if (bad < 8) console.log('dismiss', seed, d.end && d.end.title, d.stageNo); }
  }
  if (bad) throw new Error(`台本の統治が台本どおりに進まない: ${bad}件 ${JSON.stringify(Core.__last || {})}`);
  console.log(`台本の統治 ${200 + n + 200} ラン: 台本どおり`);
}
