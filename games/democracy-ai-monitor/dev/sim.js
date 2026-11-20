#!/usr/bin/env node
/* 画面なしの自動プレイ。
   使い方: node dev/sim.js [方針あたりの回数]
   index.html があればその中の <script id="core"> を、なければ core.src.js を読む。
   画面で遊ぶものと同じ計算を測る。数字は傾向として扱い、最後は遊んで判断する。 */
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
const C = loadCore();
const N = +process.argv[2] || 300;
const ids = a => a.map(x => x.id);
const pickR = (s, a) => a[Math.floor(C.rnd({seed: s.seed ^ 0x5bd1e995}) * a.length)];

/* 方針：毎期のカードの選び方 */
const POLICIES = {
  random: (s, r) => ({base: r(ids(C.BASES)), meas: r(ids(C.MEASURES)), rule: r(ids(C.RULES))}),
  hands_off: () => ({base: 'election', meas: 'ask', rule: 'none'}),
  hard: () => ({base: 'council', meas: 'logs', rule: 'restrict'}),
  restrict_poll: () => ({base: 'poll', meas: 'swap', rule: 'restrict'}),
  label: () => ({base: 'election', meas: 'logs', rule: 'label'}),
  audit: () => ({base: 'election', meas: 'swap', rule: 'audit'}),
  noadvice: () => ({base: 'poll', meas: 'panel', rule: 'noadvice'}),
  rotate: s => ({base: 'election', meas: 'logs', rule: ['label', 'audit', 'restrict', 'label', 'audit'][s.term - 1]}),
  rotate2: s => ({base: 'poll', meas: 'swap', rule: ['label', 'restrict', 'audit', 'noadvice', 'label'][s.term - 1]}),
  rotate3: s => ({base: ['election', 'pubcom', 'media', 'election', 'poll'][s.term - 1], meas: 'panel', rule: ['audit', 'label', 'restrict', 'audit', 'label'][s.term - 1]}),
};

/* 隠し情報の漏れ：報告に本当の値が入っていないか */
function leakCheck(rep) {
  if (!rep) return null;
  const bad = ['trueO', 'trueAct', 'shift', 'backlash', 'o', 'truth'];
  for (const k of bad) if (k in rep) return k;
  for (const i of rep.incidents) if ('truth' in i) return 'incident.truth';
  for (const c of rep.clues) if ('kind' in c) return 'clue.kind';
  return null;
}

/* 調べる疑いの選び方 */
const INV = {
  none: () => null,
  random: (s, r) => r(C.HYPS.map(h => h.id).filter(id => !s.tried[id] && !s.found[id]).concat([null])),
  // 兆しの多い疑いを調べる（証拠か噂かは見分けない）
  detective: s => {
    const c = C.HYPS.map(h => h.id).filter(id => !s.tried[id] && !s.found[id] && (s.clues[id] || []).length);
    c.sort((a, b) => s.clues[b].length - s.clues[a].length);
    return c[0] || null;
  },
  // 証拠と噂を見分けられる人（文面を覚えた人）
  reader: s => {
    const c = C.HYPS.map(h => h.id).filter(id => !s.tried[id] && !s.found[id] && (s.clues[id] || []).some(x => x.kind === 'clue'));
    return c[0] || null;
  },
};
const INV_MODE = (process.argv.find(a => a.startsWith('--inv=')) || '--inv=reader').slice(6);
const DEC_MODE = (process.argv.find(a => a.startsWith('--dec=')) || '--dec=random').slice(6);

function run(policy, seed) {
  const s = C.newGame(seed);
  let r = (() => { let x = seed * 7 + 3; return a => { x = (Math.imul(x, 1103515245) + 12345) | 0; return a[(x >>> 8) % a.length]; }; })();
  let leak = null, resumeOk = true;
  while (s.phase !== 'end') {
    if (s.phase === 'plan') C.startTerm(s, {...POLICIES[policy](s, r), inv: INV[INV_MODE](s, r)});
    while (s.phase === 'watch') {
      if (s.pending) { C.decide(s, DEC_MODE === 'random' ? r(['a', 'b']) : DEC_MODE); continue; }
      // 保存からの再開：JSONを通しても同じ結果になるか
      if (s.year === 2 && s.term === 2) {
        const copy = JSON.parse(JSON.stringify(s));
        const a = C.stepYear(s), b = C.stepYear(copy);
        if (JSON.stringify(a) !== JSON.stringify(b)) resumeOk = false;
        leak = leak || leakCheck(a);
        continue;
      }
      leak = leak || leakCheck(C.stepYear(s));
    }
    if (s.phase === 'election') C.election(s);
  }
  return {ending: s.ending, term: s.term, s, leak, resumeOk};
}

const pct = (n, d) => (100 * n / d).toFixed(0).padStart(3) + '%';
const endKeys = Object.keys(C.ENDINGS);
console.log('方針'.padEnd(14), endKeys.map(k => k.slice(0, 7).padStart(8)).join(''), ' 平均期');
let leaks = 0, resumes = 0;
for (const p of Object.keys(POLICIES)) {
  const cnt = {}; let terms = 0;
  for (let i = 0; i < N; i++) {
    const res = run(p, 1000 + i * 17);
    cnt[res.ending] = (cnt[res.ending] || 0) + 1; terms += res.term;
    if (res.leak) leaks++;
    if (!res.resumeOk) resumes++;
  }
  console.log(p.padEnd(14), endKeys.map(k => pct(cnt[k] || 0, N).padStart(8)).join(''), (terms / N).toFixed(2).padStart(6));
}
console.log(`\n調べ方: ${INV_MODE}  決裁: ${DEC_MODE}`);
console.log(`隠し情報の漏れ: ${leaks}  保存からの再開の不一致: ${resumes}`);

/* 1回分の推移（調整用） */
if (process.argv.includes('--trace')) {
  const p = process.argv[process.argv.indexOf('--trace') + 1] || 'hands_off';
  const res = run(p, 4242);
  for (const t of res.s.terms) {
    for (const y of t.years) console.log(`期${t.term} 年${y.year} 本当の世論 ${y.trueO} 基準線 ${y.L} 動き ${y.shift}+反発${y.backlash} 白樺 ${y.shares.shirakaba}%`);
    if (t.vote) console.log(`  選挙 新党 ${t.vote.nw} 与党 ${t.vote.ruling}`);
  }
  const s = res.s;
  console.log('結末', res.ending, '信頼', s.trust.toFixed(0), '分断', s.polar.toFixed(0), '浸透', s.infil.toFixed(0), '自由', s.free.toFixed(0));
}
