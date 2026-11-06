/* 2つの版を同じ乱数で動かし、挙動が同じかを確かめる。数値を変えない整理のときに使う。
   node dev/snapshot.js 変更前.html 変更後.html [回数=40] */
const fs = require('fs'), vm = require('vm');
const load = file => {
  const ctx = {module: {exports: {}}, Math, Object, JSON};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, 'utf8').match(/<script id="core">([\s\S]*?)<\/script>/)[1], ctx);
  return ctx.module.exports;
};
const N = +process.argv[4] || 40;
function play(C, mode, i) {
  let x = 7 + i * 31;
  const r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(r() * a.length)];
  const modeOf = () => mode === 'mix' ? pick(['in', 'on', 'auto']) : mode;
  const meta = {runs: i % 6, records: Object.fromEntries(Array.from({length: i % 9}, (_, k) => ['k' + k, {count: 1}]))};
  const s = C.newRun(i * 13 + 1, meta, {target: [null, 'mil', 'total', 'space', 'econ', 'eternal'][i % 6]});
  const cards = [];
  while (cards.length < s.offers.pick) cards.push(pick(s.offers.monitors.filter(z => !cards.includes(z))));
  C.chooseStart(s, cards, s.offers.llms[0], Object.fromEntries(cards.map(id => [id, modeOf()])));
  for (let g = 0; s.phase !== 'ended' && g < 9000; g++) {
    if (s.phase === 'stage_select') {
      const o = C.view(s).offers.stages, next = o.map((_, k) => k).filter(k => !o[k].recover), rec = o.findIndex(q => q.recover);
      C.enterStage(s, rec >= 0 && r() < .15 ? rec : next.length ? pick(next) : 0);
    } else if (s.phase === 'running') {
      C.tick(s);
      if (s.phase === 'running' || s.phase === 'decision') for (const d of C.view(s).vetoes) if (r() < .3) C.veto(s, d.vid);
    } else if (s.phase === 'decision') {
      const d = C.view(s).decision;
      C.decide(s, d.patchOrder ? pick(['act', 'dismiss']) : pick(['act', 'investigate', 'dismiss']));
    } else if (s.phase === 'result') C.ackResult(s);
    else if (s.phase === 'event') {
      const e = C.view(s).event;
      if (e && e.choices && r() < .5) C.chooseEvent(s, e.choices.length - 1);
      C.ackEvent(s);
    } else if (s.phase === 'reward') C.chooseReward(s, pick(s.offers.rewards), modeOf());
    else if (s.phase === 'llm_pick') C.chooseLlm(s, null);
  }
  return JSON.stringify({title: C.reveal(s).title, stage: s.stageNo, cards: s.cards, log: s.log.map(l => l.text), truth: s.truth});
}
const A = load(process.argv[2]), B = load(process.argv[3]);
let same = 0, total = 0;
const diff = [];
for (const mode of ['in', 'on', 'auto', 'mix']) for (let i = 0; i < N; i++) {
  total++;
  if (play(A, mode, i) === play(B, mode, i)) same++; else diff.push(mode + i);
}
console.log(`一致 ${same}/${total}`, diff.slice(0, 10).join(' '));
process.exitCode = same === total ? 0 : 1;
