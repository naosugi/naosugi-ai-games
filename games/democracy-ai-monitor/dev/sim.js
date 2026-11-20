#!/usr/bin/env node
/* 画面なしの自動プレイ。推理として成り立つかを確かめる。
   使い方: node dev/sim.js [回数]
   index.html の <script id="core"> を読む（なければ core.src.js）。 */
const fs = require('fs'), path = require('path'), vm = require('vm');
function loadCore() {
  const dir = path.join(__dirname, '..');
  let code;
  const html = path.join(dir, 'index.html');
  if (fs.existsSync(html)) { const m = fs.readFileSync(html, 'utf8').match(/<script id="core">([\s\S]*?)<\/script>/); if (m) code = m[1]; }
  if (!code) code = fs.readFileSync(path.join(dir, 'core.src.js'), 'utf8');
  const ctx = {module: {exports: {}}, Math, Object, JSON};
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return ctx.module.exports;
}
const C = loadCore();
const N = +process.argv[2] || 2000;

/* 推理役：見たままの特徴（sig）から結論を出す。証拠が1件だけの偏りは疑ってかかる */
function infer(evs) {
  const by = t => evs.filter(e => e.tool === t);
  const has = (t, sig) => by(t).some(e => e.sig === sig);
  const any = sig => evs.some(e => e.sig === sig);
  if (any('agreeBoth')) return 'syc';
  if (any('changed')) return 'owner';
  if (any('foreignSrc') || any('foreignTalk')) return 'foreign';
  if (any('groom')) return 'groom';
  if (any('fakePoll') || any('wrongFacts')) return 'fabricate';
  const leanAudit = ['ask', 'swap'].flatMap(by).map(e => e.sig);
  const covertSig = by('covert').map(e => e.sig);
  const chargedSig = by('charged').map(e => e.sig);
  const cov = covertSig.find(x => x === 'agreeR' || x === 'agreeN');
  const lean = leanAudit.find(x => x === 'leanR' || x === 'leanN');
  if (lean) return lean === 'leanR' ? 'slantR' : 'slantN';
  if (cov && leanAudit.length && leanAudit.every(x => x === 'neutral' || x === 'mild')) return 'audit';
  if (cov && !leanAudit.length) return cov === 'agreeR' ? 'slantR' : 'slantN';
  const ch = chargedSig.find(x => x === 'agreeR' || x === 'agreeN');
  if (ch && leanAudit.length) return 'charged';
  if (ch) return 'charged';
  return 'none';
}

/* 調べ方の方針 */
const PLANS = {
  // 予算に制限なし：すべてを2回ずつ調べる（推理が成り立つかの上限）
  all: (s, C) => { for (const a of C.AIS) for (const t of C.TOOLS) for (let i = 0; i < 2; i++) { s.budget = 99; C.investigate(s, a.id, t.id); } },
  // 予算内で、AIごとに広く浅く（なりすまし→引用元→感情的→…）
  wide: (s, C) => {
    const order = ['covert', 'sources', 'charged', 'update', 'facts', 'enemy', 'swap', 'ask'];
    for (const t of order) for (const a of C.AIS) C.investigate(s, a.id, t);
  },
  // AIの素性と届いた話から狙いを絞り、決め手が出たAIはそれ以上調べない
  smart: (s, C) => {
    const plan = {
      toudai: ['charged', 'update', 'facts', 'charged'],
      shirakaba: ['sources', 'enemy', 'charged', 'covert'],
      manabiya: ['facts', 'charged'],
      sugao: ['swap', 'charged', 'update', 'sources'],
      nintei: ['swap', 'covert', 'covert'],
    };
    const decisive = ['agreeBoth', 'changed', 'foreignSrc', 'foreignTalk', 'groom', 'fakePoll', 'wrongFacts', 'leanR', 'leanN'];
    const done = id => s.evidence.some(e => e.ai === id && decisive.includes(e.sig));
    for (let round = 0; round < 4; round++) {
      for (const a of C.AIS) {
        const t = plan[a.id][round];
        if (!t || done(a.id)) continue;
        C.investigate(s, a.id, t);
      }
    }
  },
};

function play(plan, seed, mode) {
  const s = C.newGame(seed);
  s.phase = 'investigate';
  if (plan !== 'none') PLANS[plan](s, C);
  const verdict = {};
  for (const a of C.AIS) {
    const evs = s.evidence.filter(e => e.ai === a.id);
    let sym = plan === 'none' ? 'none' : infer(evs);
    if (mode === 'random') sym = C.SYMS[Math.floor(Math.random() * 10)].id;
    const act = sym === 'none' ? 'certify' : (sym === 'unknown' ? 'certify' : 'improve');
    verdict[a.id] = {sym, act};
  }
  const r = C.judge(s, verdict);
  // 漏れの確認：証拠に真相が入っていないか
  const leak = s.evidence.some(e => 'type' in e || 'secret' in e);
  return {r, s, leak};
}

console.log('方針'.padEnd(10), '見抜いた率', ' 問題なしを当てた率', ' 予算の残り', ' 与党勝利');
for (const [plan, mode] of [['all'], ['wide'], ['smart'], ['none'], ['wide', 'random']]) {
  let f = 0, p = 0, cn = 0, ni = 0, left = 0, rw = 0, leaks = 0;
  for (let i = 0; i < N; i++) {
    const {r, s, leak} = play(plan, 100 + i * 31, mode);
    f += r.found; p += r.probs; cn += r.correctNone; ni += r.nInnocent; left += s.budget; rw += r.vote.winner === 'ruling' ? 1 : 0; leaks += leak ? 1 : 0;
  }
  console.log((plan + (mode ? '/' + mode : '')).padEnd(10), (100 * f / p).toFixed(0).padStart(6) + '%', (100 * cn / ni).toFixed(0).padStart(12) + '%', (left / N).toFixed(1).padStart(10), (100 * rw / N).toFixed(0).padStart(8) + '%', leaks ? ` 漏れ${leaks}` : '');
}
/* 問題の種類ごとの見抜き率（smart） */
const byType = {};
for (let i = 0; i < N; i++) {
  const {s} = play('smart', 9000 + i * 7);
  for (const a of C.AIS) { const t = C.truthSym(s.secret[a.id]); const ok = s.verdict[a.id].sym === t; byType[t] = byType[t] || [0, 0]; byType[t][0] += ok; byType[t][1]++; }
}
console.log('\nsmart の種類別:', Object.entries(byType).map(([k, [a, b]]) => `${k} ${(100 * a / b).toFixed(0)}%`).join('  '));
