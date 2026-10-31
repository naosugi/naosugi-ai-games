// 最終作戦の診断：拠点前に機体を置くだけの簡易策で、時間ごとの拠点HP・OMEGAのHPと距離を見る
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(__dirname + '/src/sim.js', 'utf8'); const ctx = { Math, console }; vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('/*SIM-BEGIN*/'), src.indexOf('/*SIM-END*/')) + ';this.RD=RD;', ctx);
const R = ctx.RD, S = R.newState(process.argv[2] || 'v4', {}), log = [];
for (let i = 0; i < 60 * 420 && !S.over; i++) {
  if (S.robots.length + S.queue.length < 5) { const b = S.bodies[S.bodies.length - 1]; if (!R.buildCheck(S, b, ['heavy', 'spread'])) R.orderBuild(S, b, ['heavy', 'spread']); else if (!R.buildCheck(S, S.bodies[2], ['spread'])) R.orderBuild(S, S.bodies[2], ['spread']); }
  R.step(S, 1 / 60);
  for (const r of S.robots) if (!r.sp) { r.sp = 1; const a = Math.random() * 6.28; R.moveRobot(r, S.home.x + Math.sin(a) * 4, S.home.z + Math.cos(a) * 4, S); }
  if (i % (60 * 20) === 0) { const o = S.enemies.find(e => e.type === 'omega'); log.push(Math.round(S.t) + 's base' + Math.round(S.baseHP) + ' omega' + (o ? Math.round(o.hp) + '@' + Math.round(Math.hypot(o.x - S.home.x, o.z - S.home.z)) : '-') + ' en' + S.enemies.length + ' rob' + S.robots.length + ' lost' + S.lost + ' pts' + S.pts); }
}
console.log(log.join('\n')); console.log('over', S.over, S.t.toFixed(0), 'kills', S.kills, 'leaked', S.leaked, 'baseDmg', Math.round(S.baseDmg));
