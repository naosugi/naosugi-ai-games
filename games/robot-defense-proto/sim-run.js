// ヘッドレス試走：node run.js <sim.jsまたはindex.html> [回数] [ステージid]
// 簡易AI：決めた戦略でボディと武器を選んで建造し、ステージごとの守備位置（ai.spots）・攻撃位置（ai.attack）のうち
// 一番手薄な所へ送るだけ。人間の動かし方（危ない所への移動、誤射を避ける配置、自操作）は再現していない。
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync(process.argv[2], 'utf8');
const ctx = { Math, console }; vm.createContext(ctx);
vm.runInContext(src.slice(src.indexOf('/*SIM-BEGIN*/'), src.indexOf('/*SIM-END*/')) + ';this.RD=RD;', ctx);
const RD = ctx.RD, N = +process.argv[3] || 200, ONLY = process.argv[4];
if (process.env.MISSILE_COST) RD.WEAPONS.missile.cost = +process.env.MISSILE_COST;

const cheapest = (S, tier) => S.bodies.filter(b => b.tier === tier).sort((a, b) => a.cost - b.cost)[0] || S.bodies.filter(b => b.tier !== 'high').slice(-1)[0] || S.bodies[0];
const strategies = {
  'なにもしない': () => null,
  '安+ブラスター': S => [cheapest(S, 'low'), ['blaster']],
  '安+スプレッド': S => [cheapest(S, 'low'), ['spread']],
  '安+ミサイル': S => [cheapest(S, 'low'), ['missile']],
  '安+レーザー': S => [cheapest(S, 'low'), ['laser']],
  '安+ヘビー': S => [cheapest(S, 'low'), ['heavy']],
  '安+ホーミング': S => [cheapest(S, 'low'), ['homing']],
  '安+ブレイカー': S => [cheapest(S, 'low'), ['breaker']],
  '交互 安ブラ/安ミサ': S => [cheapest(S, 'low'), S.built % 2 ? ['missile'] : ['blaster']],
  '中+ブラ+スプ': S => [cheapest(S, 'mid'), ['blaster', 'spread']],
  '中+ブラ+ミサ': S => [cheapest(S, 'mid'), ['blaster', 'missile']],
  '中+スプ+ミサ': S => [cheapest(S, 'mid'), ['spread', 'missile']],
  '中+レーザー+スプ': S => [cheapest(S, 'mid'), ['laser', 'spread']],
  '高+ブラ+ミサ': S => [cheapest(S, 'high'), ['blaster', 'missile']],
  '高+レーザー+ヘビー': S => [cheapest(S, 'high'), ['laser', 'heavy']],
  '段階 安2機→高+ヘビ+ミサ': S => (S.robots.length + S.queue.length < 2 ? [cheapest(S, 'low'), ['blaster', 'spread']] : [cheapest(S, 'high'), ['heavy', 'missile']]),
  '段階 安2機→中+ブラ+スプ': S => (S.robots.length + S.queue.length < 2 ? [cheapest(S, 'low'), ['blaster', 'spread']] : [cheapest(S, 'mid'), ['blaster', 'spread']]),
  '量産+スプ+ミサ': S => [S.bodies.find(b => b.id === 'mass') || cheapest(S, 'mid'), ['spread', 'missile']],
  '量産+スプ+ミサ+ライン2': S => [S.bodies.find(b => b.id === 'mass') || cheapest(S, 'mid'), ['spread', 'missile'], true],
  '中+ブラ+スプ+ライン2': S => [cheapest(S, 'mid'), ['blaster', 'spread'], true],
  '[進化] 量産+フレア+ミサ+ライン2': S => [S.bodies.find(b => b.id === 'mass') || cheapest(S, 'mid'), ['flare', 'missile'], true],
  '[進化] 中+チェイン+フレア+ライン2': S => [cheapest(S, 'mid'), ['chain', 'flare'], true],
  '[進化] 量産+プリズム+ライン2': S => [S.bodies.find(b => b.id === 'mass') || cheapest(S, 'mid'), ['prism'], true],
  '[進化] 段階 安2→高+パイル+バスター': S => (S.robots.length + S.queue.length < 2 ? [cheapest(S, 'low'), ['blaster', 'spread']] : [cheapest(S, 'high'), ['pile', 'buster']]),
  '量産+スプ+ミサ+ライン2+修理': S => [S.bodies.find(b => b.id === 'mass') || cheapest(S, 'mid'), ['spread', 'missile'], true, 'repair'],
  '量産+スプ+ミサ+ライン2+砲台盾': S => [S.bodies.find(b => b.id === 'mass') || cheapest(S, 'mid'), ['spread', 'missile'], true, 'fort'],
  '盾+スプ+ミサ+ライン2': S => [S.bodies.find(b => b.id === 'shieldbody') || cheapest(S, 'mid'), ['spread', 'missile'], true],
  '節約 安ブラ2機まで': S => (S.robots.length + S.queue.length < 2 ? [cheapest(S, 'low'), ['blaster']] : null),
};

function runOne(stId, pol) {
  // 初めて遊ぶ人と同じ解禁状態（ALL=1 なら全解禁）。進化パーツは、持ち込みが解禁されていればすべて持ち込める前提
  const allow = RD.allowFor(stId, null, !!process.env.ALL);
  const S = RD.newState(stId, { hard: !!process.env.HARD, allow, loadout: Object.keys(RD.WEAPONS).filter(k => RD.WEAPONS[k].evo) }), spots = [];
  // 戦略が使えない武器・ボディを指定したら、使えるもので代える
  const fix = c => { if (!c || !c[0]) return c; let [b, w, ...rest] = c; if (!RD.bodyAllowed(S, b)) b = S.bodies.filter(x => x.tier === b.tier)[0] || S.bodies[S.bodies.length - 1];
    w = w.filter(x => RD.weaponAllowed(S, x)); if (!w.length) w = [RD.weaponAllowed(S, 'spread') ? 'spread' : 'blaster']; return [b, w, ...rest]; };
  // 守備位置は経路から自動で作る：各経路の拠点寄り・中ほど・手前の3か所（経路の脇2.6）
  // bases ステージでは、各敵拠点の手前（経路沿い5.5）を攻撃位置にする
  if (S.st.goal === 'bases') for (const b of S.ebases) { const q = RD.pathPos(S.paths[b.path], 5.5, 2.4); spots.push({ p: [q.x, q.z], atk: true }); }
  for (const f of [.85, .55, .3]) for (const P of S.paths) { const q = RD.pathPos(P, P.len * f, 2.6); spots.push({ p: [q.x, q.z] }); }
  let reT = 0;
  const assign = r => {
    const live = spots.filter(s => !s.atk || S.ebases.some(b => !b.dead && Math.hypot(b.x - s.p[0], b.z - s.p[1]) < 8));
    let best = live[0], bc = 1e9;
    for (const s of live) { const c = S.robots.filter(o => o !== r && o.spot === s).length; if (c < bc) { bc = c; best = s; } }
    r.spot = best; RD.moveRobot(r, best.p[0] + (Math.random() - .5), best.p[1] + (Math.random() - .5), S);
  };
  while (!S.over) {
    let c = fix(pol(S));
    // 立ち上がり：狙いの構成が買えず、ロボットも1機もいないときは最安ボディ＋ブラスターで稼ぐ（買えないまま詰むのを防ぐ）
    if (c && c[0] && !S.robots.length && !S.queue.length && S.pts < RD.buildCost(c[0], c[1]).cost) c = [S.bodies[0], ['blaster']];
    // ライン2：作れる機体がいっぱいでも建造待ちが出る場面に備え、余裕があれば開放する
    if (c && c[2] && S.lines < 2 && S.pts >= RD.CFG.line2Cost + 60 && S.robots.length >= 1) RD.buyLine(S);
    // 拠点工事：修理はHPが半分を切ったら、砲台・盾は余裕があるとき
    if (c && c[3] === 'repair' && S.baseHP < RD.CFG.baseHP * .5 && !S.queue.some(q => q.work)) RD.orderWork(S, 'repair');
    if (c && c[3] === 'fort' && S.pts >= 200 && !S.queue.some(q => q.work)) { if ((S.works.turret || 0) < 2) RD.orderWork(S, 'turret'); else if (S.homeShield <= 0) RD.orderWork(S, 'shield'); else if (S.baseHP < 75) RD.orderWork(S, 'repair'); }
    if (c && c[0] && !RD.buildCheck(S, c[0], c[1])) RD.orderBuild(S, c[0], c[1]);
    RD.step(S, 1 / 30);
    for (const r of S.robots) if (!r.spot) assign(r);
    // 拠点の守り：拠点に取り付いた敵がいて、拠点の近くにロボットがいなければ、一番近いロボットを拠点へ戻す
    if ((reT - 1 / 30) <= 0 && S.enemies.some(e => e.atBase) && !S.robots.some(r => Math.hypot(r.x - S.home.x, r.z - S.home.z) < 5)) {
      let best = null, bd = 1e9; for (const r of S.robots) { const d = Math.hypot(r.x - S.home.x, r.z - S.home.z); if (d < bd) { bd = d; best = r; } }
      if (best) { best.spot = { p: [S.home.x + 2.5, S.home.z + 2.5], guard: true }; RD.moveRobot(best, S.home.x + 2.5, S.home.z + 2.5, S); }
    }
    if ((reT -= 1 / 30) <= 0) { reT = 1; for (const r of S.robots) if (r.spot.atk && !S.ebases.some(b => !b.dead && Math.hypot(b.x - r.spot.p[0], b.z - r.spot.p[1]) < 8)) assign(r); }
  }
  return S;
}

for (const st of RD.STAGES) {
  if (ONLY && st.id !== ONLY) continue;
  console.log('\n■ ' + st.id + ' ' + st.name + '「' + st.sub + '」 勝利条件：' + RD.goalText(st) + ' 開始⭐' + st.startPoints);
  console.log('戦略'.padEnd(18, '　') + ' 勝率  拠点HP  終了  撃破  建造  損失(誤射)  ' + (st.goal === 'points' ? '最終⭐' : st.goal === 'bases' ? '敵拠点破壊' : st.goal === 'clear' ? '残り敵' : st.waves.some(w => w[1] === 'boss') ? 'ボス撃破' : ''));
  for (const [name, pol] of Object.entries(strategies)) {
    if (name.startsWith('節約') && st.goal !== 'points') continue;
    const a = { win: 0, hp: 0, t: 0, kills: 0, built: 0, lost: 0, ffk: 0, pts: 0, eb: 0, boss: 0 };
    for (let i = 0; i < N; i++) {
      const S = runOne(st.id, pol);
      a.win += S.over === 'win'; a.hp += S.baseHP; a.t += S.t; a.kills += S.kills; a.built += S.built; a.lost += S.lost; a.ffk += S.ffKills;
      a.pts += S.pts; a.eb += S.ebKills; a.boss += S.bossKilled;
    }
    const f = (v, d = 0) => (v / N).toFixed(d);
    const extra = st.goal === 'points' ? f(a.pts) : st.goal === 'bases' ? f(a.eb, 2) : st.waves.some(w => w[1] === 'boss') ? f(a.boss * 100) + '%' : '';
    console.log(name.padEnd(18, '　'), (f(a.win * 100) + '%').padStart(4), f(a.hp).padStart(6), (f(a.t) + 's').padStart(5), f(a.kills).padStart(5), f(a.built, 1).padStart(5), (f(a.lost, 1) + '(' + f(a.ffk, 1) + ')').padStart(10), '  ' + extra);
  }
}
