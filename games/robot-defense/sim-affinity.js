// 武器ごとの相性確認：中ボディ1機（ガード固定）を経路脇に置き、同じ種類の敵の群れ1組と戦わせる
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
const ctx = { Math, console }; vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('/*SIM-BEGIN*/'), src.indexOf('/*SIM-END*/')) + ';this.RD=RD;', ctx);
const RD = ctx.RD, guard = RD.BODIES.find(b => b.id === 'guard');
const foes = [['normal', 14, .4], ['kamikaze', 12, .2], ['armor', 5, 1], ['shield', 6, .8], ['splitter', 6, .8]];
const ws = ['blaster', 'spread', 'missile', 'laser', 'heavy', 'homing', 'breaker'];
const N = 60;
console.log('敵＼武器'.padEnd(10, '　'), ws.map(w => RD.WEAPONS[w].name.slice(0, 5).padStart(6, '　')).join(''));
for (const [type, n, gap] of foes) {
  const row = [];
  for (const w of ws) {
    let killed = 0, total = 0, alive = 0;
    for (let i = 0; i < N; i++) {
      const S = RD.newState('s1'); S.waves = [[0, type, n, gap]]; S.pts = 999;
      RD.orderBuild(S, guard, [w]); while (!S.robots.length) { S.t = 0; RD.step(S, 1 / 30); S.waveIdx = 0; S.spawners = []; S.enemies = []; }
      const r = S.robots[0]; r.x = r.tx = -5.8; r.z = r.tz = -10.5; S.t = 0; S.waveIdx = 0;
      const k0 = S.kills; let spawned = 0;
      for (let t = 0; t < 60 * 30 && !S.over; t++) { RD.step(S, 1 / 30); }
      // 倒した数 ÷ 出てきた数（分裂片も含む）。ロボットが生き残ったか
      killed += S.kills - k0; total += S.kills - k0 + S.enemies.length + S.leaked; alive += S.robots.length;
    }
    row.push((Math.round(killed / total * 100) + '%' + (alive / N < .5 ? '✖' : '')).padStart(6));
  }
  console.log(RD.ENEMIES[type].name.padEnd(10, '　'), row.join(''));
}
console.log('数字＝群れのうち倒せた割合（30秒）。✖＝半分以上の試行でロボットが撃破された');
