/* 全カードを同じ方式にしたボットで、方式ごとのクリア率と負け方を比べる。
   node dev/modes.js [回数=300] [警報に命じる割合=0.3] [乱数の種=1]
   回数が少ないと誤差が大きい。方式の比較には1000回ほど要る。ボットの数字は傾向として見る。 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const ctx = {module: {exports: {}}, Math, Object, JSON};
vm.createContext(ctx);
vm.runInContext(html.match(/<script id="core">([\s\S]*?)<\/script>/)[1], ctx);
const C = ctx.module.exports;
const N = +process.argv[2] || 300, vetoRate = +process.argv[3] || .3, seed = +process.argv[4] || 1;
const rec = {}; for (let i = 0; i < 8; i++) rec['k' + i] = {count: 1};
const meta = {runs: 3, records: rec};

function run(mode) {
  let x = 7 + seed;
  const r = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(r() * a.length)];
  const modeOf = () => mode === 'mix' ? pick(['in', 'on', 'auto']) : mode;
  const ends = {}, gaps = [];
  for (let i = 0; i < N; i++) {
    const s = C.newRun(i * 13 + 1 + seed * 100003, meta, {});
    const cards = [];
    while (cards.length < s.offers.pick) cards.push(pick(s.offers.monitors.filter(z => !cards.includes(z))));
    C.chooseStart(s, cards, s.offers.llms[0], Object.fromEntries(cards.map(id => [id, modeOf()])));
    for (let g = 0; s.phase !== 'ended' && g < 9000; g++) {
      if (s.phase === 'stage_select') {
        const v = C.view(s), o = v.offers.stages, next = o.map((_, k) => k).filter(k => !o[k].recover), rec = o.findIndex(q => q.recover);
        const low = Math.min(v.metrics.economy, v.metrics.power) < 25 || v.vuln >= 44 || v.metrics.order < 30;
        C.enterStage(s, low && rec >= 0 ? rec : next.length ? pick(next) : 0);
      } else if (s.phase === 'running') {
        C.tick(s);
        if (s.phase === 'running' || s.phase === 'decision') for (const d of C.view(s).vetoes) if (d.conf >= 58 && r() < vetoRate) C.veto(s, d.vid);
      } else if (s.phase === 'decision') {
        const d = C.view(s).decision;
        C.decide(s, d.patchOrder ? (r() < .7 ? 'act' : 'dismiss') : d.conf >= 58 ? 'act' : 'dismiss');
      } else if (s.phase === 'result') C.ackResult(s);
      else if (s.phase === 'event') C.ackEvent(s);
      else if (s.phase === 'reward') C.chooseReward(s, pick(s.offers.rewards), modeOf());
      else if (s.phase === 'llm_pick') C.chooseLlm(s, null);
    }
    const k = s.end.kind === 'ending' ? 'clear' : s.end.type;
    ends[k] = (ends[k] || 0) + 1;
    if (k === 'clear') gaps.push(s.truth.gap);
  }
  gaps.sort((a, b) => a - b);
  return {clear: (ends.clear || 0) / N * 100, gap: Math.round(gaps[gaps.length >> 1] || 0), ends};
}
for (const [name, mode] of [['決裁', 'in'], ['介入', 'on'], ['AI任せ', 'auto'], ['混在', 'mix']]) {
  const m = run(mode);
  console.log(`${name}\tクリア ${m.clear.toFixed(1)}%\t差の中央値 ${m.gap}\t${JSON.stringify(m.ends)}`);
}
