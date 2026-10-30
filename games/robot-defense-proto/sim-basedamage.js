// 拠点ダメージの内訳（敵の種類別）：node sim-basedamage.js ステージid [index.html]
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[3] || 'index.html', 'utf8'); const ctx = { Math, console }; vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('/*SIM-BEGIN*/'), src.indexOf('/*SIM-END*/')) + ';this.RD=RD;', ctx);
const RD = ctx.RD, st = process.argv[2], n = 20; const by = {}; let endT = 0;
for (let i = 0; i < n; i++) {
  const S = RD.newState(st); const spots = []; for (const f of [.85, .55, .3]) for (const P of S.paths) { const q = RD.pathPos(P, P.len * f, 2.6); spots.push([q.x, q.z]); }
  let k = 0;
  while (!S.over) {
    const low = S.bodies.filter(b => b.tier === 'low')[0], mid = S.bodies.filter(b => b.tier === 'mid').sort((a, b) => a.cost - b.cost)[0];
    const c = S.robots.length + S.queue.length < 2 ? [low, ['blaster', 'spread']] : [mid, ['blaster', 'spread']];
    if (!RD.buildCheck(S, c[0], c[1])) RD.orderBuild(S, c[0], c[1]);
    const hp0 = S.baseHP, before = new Map(S.enemies.filter(e => e.atBase).map(e => [e, 1]));
    RD.step(S, 1 / 30);
    const d = hp0 - S.baseHP;
    if (d > 0) { const at = S.enemies.filter(e => e.atBase); const tot = at.reduce((a, e) => a + e.def.baseDps, 0) || 1; let rest = d;
      for (const e of at) { const v = d * e.def.baseDps / tot; by[e.type] = (by[e.type] || 0) + v; rest -= v; } if (rest > .01) by['弾・爆風/単発'] = (by['弾・爆風/単発'] || 0) + rest; }
    for (const r of S.robots) if (!r.sp) { r.sp = 1; const s = spots[k++ % spots.length]; RD.moveRobot(r, s[0], s[1], S); }
  }
  endT += S.t;
}
console.log('平均終了', (endT / n).toFixed(0) + 's', Object.fromEntries(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, (v / n).toFixed(1)])));
