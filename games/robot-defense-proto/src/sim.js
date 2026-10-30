/*SIM-BEGIN*/
// ===== ゲームロジック（描画に依存しない。ヘッドレスのシミュレーションでもそのまま使う） =====
const RD = (() => {
'use strict';
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- 調整用データ（数値はすべて仮） ----------
const CFG = {
  deployCap: 5,                        // 同時に出撃できるロボットの数
  queueMax: 5,                         // 建造の予約（建造中・出撃待ちを含む）の上限
  enemySpeedMul: .8,                   // 敵の移動速度の倍率（全敵共通）
  baseHP: 150,                         // 拠点HP
  baseStop: 2.3,                       // 敵が拠点の手前で止まって攻撃する距離
  missileSafety: 1.4,                  // AIがミサイルを撃つとき、爆風半径に足す安全距離（自操作では使わない＝自爆あり）
  critMul: 2.5,
  friendlyFire: 1,                     // 味方の弾・爆発が味方ロボットに当たるときの倍率（1=等倍）
  robotR: .55,                         // ロボットの当たり判定の半径
  armorFloor: .2,                      // 装甲で減らせるのは最大でこの割合まで（＝最低2割は通る）
  ebaseR: 1.6,                         // 敵拠点の当たり判定の半径
  homeR: 1.8,                          // 自拠点の当たり判定の半径（敵の弾・爆風が当たる）
  line2Cost: 150,                      // 2本目の建造ラインを開放するポイント
  loadoutSlots: 2,                     // 出撃前に持ち込める進化パーツの数
  homeShotMul: .4,                     // 敵の弾・爆風が自拠点に当たるときの倍率（拠点は硬い）
  captureTime: 4,                      // 前線拠点の占領にかかる秒数（敵がいない状態でロボットが近くにいる）
  liberatePts: 60,                     // 敵占領の陣地を確保したときのポイント
  outpostR: 2.6,                       // 前線拠点の占領範囲
  deadSpawnRate: .35,                  // 敵拠点を壊した経路から、それでも出てくる割合（bases ステージでは0）
};

const TIER = {
  low: { name: '低', scale: .85 },
  mid: { name: '中', scale: 1 },
  high: { name: '高', scale: 1.2 },
};

// プラスアルファ（INFINITE SHOT 3D II のパッシブを読み替え）
const PLUS = {
  dmg: { icon: '🔥', name: '火力', fmt: v => '+' + Math.round(v * 100) + '%' },
  rate: { icon: '⚡', name: '連射', fmt: v => '+' + Math.round(v * 100) + '%' },
  crit: { icon: '💥', name: 'クリティカル', fmt: v => Math.round(v * 100) + '%' },
  range: { icon: '🎯', name: '射程', fmt: v => '+' + Math.round(v * 100) + '%' },
  pts: { icon: '⭐', name: '獲得ポイント', fmt: v => '+' + Math.round(v * 100) + '%' },
};

// ボディのプリセット。ステージ開始時に価格帯ごとに抽選される
const BODIES = [
  // 低価格帯：安いが脆い。数で押す・使い捨てる・偵察する
  { id: 'scrap', name: 'スクラップ', tier: 'low', cost: 10, hp: 30, speed: 2.2, build: 2, plus: {} },
  { id: 'runner', name: 'ランナー', tier: 'low', cost: 25, hp: 30, speed: 6, build: 2, plus: { pts: .3 } },
  { id: 'worker', name: 'ワーカー', tier: 'low', cost: 30, hp: 70, speed: 2.5, build: 3, plus: { rate: .15 } },
  // 中価格帯：役割がはっきりした主力
  { id: 'guard', name: 'ガード', tier: 'mid', cost: 60, hp: 220, speed: 2, build: 6, plus: {} },
  { id: 'striker', name: 'ストライカー', tier: 'mid', cost: 70, hp: 100, speed: 4, build: 5, plus: { dmg: .4 } },
  { id: 'gunner', name: 'ガンナー', tier: 'mid', cost: 80, hp: 120, speed: 3, build: 6, plus: { rate: .4 } },
  { id: 'seeker', name: 'シーカー', tier: 'mid', cost: 75, hp: 100, speed: 3.2, build: 5, plus: { range: .35, crit: .15 } },
  { id: 'shieldbody', name: 'シールドフレーム', tier: 'mid', cost: 85, hp: 100, speed: 2.4, build: 6, shield: 90, plus: {}, note: '🛡シールド90（4秒被弾しないと毎秒8回復）' },
  { id: 'mass', name: '量産フレーム', tier: 'mid', cost: 65, hp: 70, speed: 3, build: 1, wbMul: .4, plus: {}, note: '武器の建造時間 -60%' },
  // 高価格帯：高いが一騎当千
  { id: 'fortress', name: 'フォートレス', tier: 'high', cost: 160, hp: 650, speed: 1.2, build: 12, plus: { dmg: .3 } },
  { id: 'ace', name: 'エース', tier: 'high', cost: 180, hp: 260, speed: 5.5, build: 10, plus: { rate: .4, crit: .25 } },
  { id: 'vanguard', name: 'ヴァンガード', tier: 'high', cost: 150, hp: 350, speed: 3.2, build: 9, plus: { dmg: 1 } },
];

// 武器パーツ（自爆以外は INFINITE SHOT 3D II から）。爆風（blast）は装甲・盾を無視する
const WEAPONS = {
  blaster: { name: 'ブラスター', icon: '🔷', cost: 15, build: 1, type: 'gun', range: 6, dmg: 10, cd: .4, speed: 22, pellets: 1, fan: 0, desc: '安くて扱いやすい単発連射。決め手はなく、装甲に弱い' },
  breaker: { name: 'ブレイカー', icon: '💢', cost: 20, build: 2, type: 'gun', range: 2.8, dmg: 20, cd: .7, speed: 14, pellets: 6, fan: .9, noArmor: true, noShield: true, desc: '安い超短射程の散弾。威力は最大で、装甲を貫き盾も割る。遠くには届かない' },
  homing: { name: 'ホーミング', icon: '🌀', cost: 25, build: 2, type: 'gun', range: 7, dmg: 10, cd: .8, speed: 8, pellets: 2, fan: .9, homing: 3.5, noShield: true, desc: '敵を追いかける遅い弾を2発。盾に防がれない。威力は低く装甲に弱い' },
  spread: { name: 'スプレッド', icon: '🔱', cost: 30, build: 3, type: 'gun', range: 4.5, dmg: 14, cd: .9, speed: 16, pellets: 5, fan: .8, pierce: 3, desc: '扇状に5発、4体まで貫通。群れと速い敵に強いが射程が短い' },
  heavy: { name: 'ヘビーショット', icon: '🎯', cost: 55, build: 4, type: 'gun', range: 14, dmg: 90, cd: 2.4, speed: 26, pellets: 1, fan: 0, pierce: 2, noArmor: true, size: .3, pick: 'tough', desc: '狙撃用の大口径砲。射程が非常に長く、射程内で一番硬い敵（ボス・装甲・輸送艦など）を狙う。装甲を貫き3体まで貫通。連射が遅い' },
  missile: { name: 'ミサイル', icon: '🚀', cost: 60, build: 5, type: 'gun', range: 8, dmg: 55, cd: 2.6, speed: 9, pellets: 1, fan: 0, blast: 2.6, cluster: true, desc: '敵が一番固まっている所を狙い、着弾で爆発。弾が遅く速い敵に弱い。装甲・盾を無視。爆風は味方も巻き込む' },
  laser: { name: 'レーザー', icon: '🔦', cost: 70, build: 5, type: 'beam', range: 10, dps: 15, width: .4, ffMul: 1.5, noBase: true, desc: '前方へビームを照射し続ける。直線上をすべて貫き、装甲・盾を無視。直線上の味方には1.5倍で当たる。敵拠点は自動では狙わない' },
  // ---- 進化パーツ（INFINITE SHOT 3D II の進化形）。アンロックして、出撃前の持ち込み枠に入れたものだけ使える ----
  magnum: { evo: true, base: 'blaster', name: 'マグナム', icon: '🔷', cost: 30, build: 2, type: 'gun', range: 6.5, dmg: 24, cd: .5, speed: 24, pellets: 1, fan: 0, pierce: 1, noArmor: true, size: .24, desc: '大きな弾で威力2倍以上。装甲を貫き2体まで貫通' },
  chain: { evo: true, base: 'blaster', name: 'チェイン', icon: '⚡', cost: 30, build: 2, type: 'gun', range: 6, dmg: 10, cd: .4, speed: 22, pellets: 1, fan: 0, chain: { n: 3, mul: .55, range: 3.2 }, desc: '命中すると近くの敵3体へ電撃が連鎖する（威力55%）。群体に強い' },
  flare: { evo: true, base: 'spread', name: 'フレア', icon: '🔥', cost: 45, build: 3, type: 'gun', range: 4.5, dmg: 14, cd: .9, speed: 16, pellets: 5, fan: .8, pierce: 1, splash: { r: 1.3, mul: .6 }, desc: '扇状の弾が命中すると炸裂し、周りも巻き込む。炸裂は味方にも当たる' },
  prism: { evo: true, base: 'laser', name: 'プリズム', icon: '🌈', cost: 80, build: 5, type: 'beam', range: 9, dps: 10, width: .35, beams: 3, spread: .32, slow: true, ffMul: 1.5, noBase: true, desc: 'ビームが3本に分かれて広がる。当たった敵は遅くなる。味方には1.5倍' },
  buster: { evo: true, base: 'heavy', name: 'バスター', icon: '💥', cost: 65, build: 4, type: 'gun', range: 12, dmg: 80, cd: 2.4, speed: 22, pellets: 1, fan: 0, noArmor: true, size: .32, pick: 'tough', splash: { r: 2.4, mul: .6 }, desc: '狙撃弾が着弾で爆発し、周りも巻き込む。爆発は味方にも当たる' },
  swarmer: { evo: true, base: 'homing', name: 'スウォーム', icon: '🐝', cost: 35, build: 2, type: 'gun', range: 7, dmg: 7, cd: .8, speed: 8, pellets: 4, fan: 1.4, homing: 3.5, noShield: true, desc: '追尾弾が4発に増える。盾に防がれない' },
  pile: { evo: true, base: 'breaker', name: 'パイル', icon: '📌', cost: 40, build: 3, type: 'gun', range: 12, dmg: 150, cd: 3.4, speed: 30, pellets: 1, fan: 0, pierce: 1, noArmor: true, noShield: true, size: .22, pick: 'tough', desc: '遠くまで届く杭を撃ち込む。射程内で一番硬い敵を狙い、装甲も盾も貫く' },
  bomb: { name: '自爆ユニット', icon: '💣', cost: 5, build: 1, type: 'bomb', trigger: 1.4, radius: 5, dmg: 300, desc: '敵が近づくと広範囲を吹き飛ばして自爆する。近くの味方も巻き込む' },
};

// 敵（INFINITE SHOT 3D II の敵をTD向けに読み替え）。baseDps＝拠点に取り付いたときの毎秒ダメージ
const ENEMIES = {
  normal: { name: '通常型', hp: 40, speed: 1.6, r: .5, pts: 8, baseDps: 1.2, desc: '経路を進んで拠点を攻撃する' },
  shooter: { name: '射撃型', hp: 50, speed: 1.3, r: .6, pts: 15, baseDps: 2, range: 5, dmg: 8, cd: 1.3, shotSpeed: 9, desc: 'ロボットが射程に入ると立ち止まって撃つ' },
  dasher: { name: '突進型', hp: 35, speed: 1.5, r: .48, pts: 15, baseDps: 1.5, dash: { sense: 4.5, aim: .7, speed: 9, len: 6, dmg: 30, cd: 4 }, desc: '近くのロボットに狙いを定め、一直線に体当たりする' },
  armor: { name: '装甲型', hp: 110, speed: 1, r: .75, pts: 25, baseDps: 3, armor: 6, desc: '1発ごとのダメージを6減らす。爆風は防げない' },
  shield: { name: '盾持ち', hp: 70, speed: 1.2, r: .65, pts: 25, baseDps: 2, shield: 1.1, desc: '正面からの弾を防ぐ。横や後ろ、爆風には無力' },
  splitter: { name: '分裂型', hp: 60, speed: 1.3, r: .65, pts: 12, baseDps: 1.5, split: { type: 'mini', n: 3 }, desc: '倒すと小型3体に分かれる' },
  mini: { name: '分裂片', hp: 14, speed: 2.3, r: .35, pts: 4, baseDps: .6, desc: '' },
  healer: { name: '回復ドローン', hp: 45, speed: 1.1, r: .5, pts: 30, baseDps: .5, heal: { range: 3.2, hps: 8 }, desc: '周りの敵を回復し続ける' },
  kamikaze: { name: '特攻型', hp: 18, speed: 4.2, r: .42, pts: 6, baseDps: 0, kamikaze: { sense: 5, dmg: 28, radius: 1.6, baseDmg: 5 }, desc: '速い。近くのロボットへ突っ込んで自爆する' },
  mine: { name: '機雷', hp: 30, speed: 1.9, r: .5, pts: 10, baseDps: 0, mine: { trigger: 1.6, radius: 2.6, dmg: 45, baseDmg: 8 }, desc: 'ロボットに近づくと爆発する' },
  swarm: { name: '群体', hp: 8, speed: 2.2, r: .32, pts: 1, baseDps: .25, inst: true, desc: '弱いが、とにかく数が多い' },
  swarmFast: { name: '俊足群体', hp: 5, speed: 3.8, r: .28, pts: 1, baseDps: .2, inst: true, desc: '脆いが速い。遅い弾をすり抜ける' },
  swarmHeavy: { name: '重群体', hp: 26, speed: 1.5, r: .42, pts: 2, baseDps: .5, armor: 3, inst: true, desc: '硬い群体。弱い弾のダメージを3減らす' },
  swarmBomb: { name: '自爆群体', hp: 6, speed: 2.6, r: .3, pts: 1, baseDps: 0, inst: true, kamikaze: { sense: 2.2, dmg: 9, radius: 1.1, baseDmg: 1 }, desc: 'ロボットに近づくと小さく自爆する' },
  swarmFly: { name: '飛行群体', hp: 6, speed: 3, r: .3, pts: 1, baseDps: .2, inst: true, fly: true, desc: '経路を無視して拠点へ飛んでくる群体' },
  flyer: { name: '飛行型', hp: 30, speed: 2.4, r: .5, pts: 12, baseDps: .8, fly: true, desc: '経路を無視して、拠点へ一直線に飛んでくる' },
  carrier: { name: '輸送艦', hp: 320, speed: .8, r: 1.2, pts: 60, baseDps: 3, drop: { type: 'swarm', n: 5, every: 3.5 }, desc: '経路を進みながら群体を降ろし続ける' },
  artillery: { name: '砲撃型', hp: 90, speed: 1.1, r: .7, pts: 40, baseDps: 2, artillery: { range: 15, dmg: 14, cd: 3.2, shotSpeed: 7 }, desc: '拠点から遠くで止まり、拠点を砲撃し続ける' },
  engineer: { name: '工兵', hp: 60, speed: 1.4, r: .5, pts: 35, baseDps: .5, rebuild: { time: 8, hpRate: .5 }, desc: '壊された敵拠点を再建する。出撃が止まった方面からでも現れる' },
  // ボス：こちらのロボットと同じ「ボディ＋武器」で組まれた敵。体当たりはせず、射撃でロボットと拠点を攻撃する
  boss: { name: '模倣機', hp: 1000, speed: .9, noRamp: true, r: 1.1, pts: 300, baseDps: 0, fireMul: 1.6, hold: 5.5, boss: true, body: 'fortress', weapons: ['blaster', 'missile'], desc: 'こちらのロボットを模倣した赤い機体。ロボットや拠点が射程に入ると立ち止まって撃つ' },
};

// ステージ。自拠点は地図の中央（0,0）。敵は外周の敵拠点から中央へ向かう
// goal: time＝時間まで守る / points＝所持ポイントを目標まで貯める / bases＝敵拠点をすべて壊す
// 敵拠点：壊すと大量ポイント。その経路からの出現が減る（bases ステージでは止まる）
// waves: [出現開始秒, 種類, 数, 間隔秒, 経路番号（'*'は経路を順番に使う）]
const STAGES = [
  {
    id: 's1', name: '第1戦区', sub: '一本道', goal: 'time', time: 120, startPoints: 120, hpRamp: 1.2,
    intro: '敵の経路は1本。拠点の周りを回り込んでくる。まずはここで戦い方を覚える。',
    map: { minX: -11, maxX: 11, minZ: -17, maxZ: 15 }, base: { x: 0, z: 0 }, factory: { x: -2.6, z: -2.4 },
    paths: [[[-8, -15], [-8, -6], [6, -6], [6, 12], [-5, 12], [-5, 4], [0, 4], [0, 0]]],
    ebases: [{ path: 0, hp: 450, pts: 120 }],
    waves: [
      [1, 'normal', 4, 1.4], [10, 'normal', 6, 1], [22, 'shooter', 2, 2.5], [28, 'normal', 8, .8], [42, 'shooter', 3, 2],
      [48, 'normal', 10, .7], [62, 'normal', 6, .5], [64, 'shooter', 4, 1.6], [78, 'normal', 14, .55], [90, 'shooter', 5, 1.4],
      [98, 'normal', 18, .45], [104, 'shooter', 4, 1.5], [36, 'swarm', 20, .2], [86, 'swarm', 30, .15],
    ],
  },
  {
    id: 's2', name: '第2戦区', sub: '挟撃', goal: 'time', time: 120, startPoints: 110, hpRamp: 1,
    intro: '北西と南東の2方向から挟み撃ち。突進型・装甲型・特攻型が現れる。',
    map: { minX: -13, maxX: 13, minZ: -18, maxZ: 18 }, base: { x: 0, z: 0 }, factory: { x: 2.4, z: -2.2 },
    paths: [
      [[-11, -16], [-11, 4], [-5, 4], [-5, -4], [0, -4], [0, 0]],
      [[11, 16], [11, -4], [5, -4], [5, 4], [0, 4], [0, 0]],
    ],
    ebases: [{ path: 0, hp: 500, pts: 120 }, { path: 1, hp: 500, pts: 120, turret: { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } }],
    waves: [
      [1, 'normal', 4, 1.4, 0], [4, 'normal', 4, 1.4, 1], [14, 'normal', 6, 1, '*'], [24, 'dasher', 3, 2, 1], [30, 'armor', 2, 3, 0],
      [40, 'normal', 10, .7, '*'], [52, 'shooter', 3, 2, 0], [56, 'dasher', 4, 1.5, 1], [60, 'kamikaze', 8, .25, 0], [66, 'armor', 3, 2.5, '*'],
      [72, 'normal', 12, .55, '*'], [86, 'shooter', 4, 1.6, 1], [90, 'dasher', 5, 1.2, 0], [94, 'kamikaze', 10, .25, 1], [98, 'normal', 16, .45, '*'], [104, 'armor', 4, 2, '*'], [46, 'swarm', 24, .15, '*'], [80, 'swarmFast', 20, .15, '*'],
    ],
  },
  {
    id: 's3', name: '第3戦区', sub: '補給線', goal: 'points', goalPts: 350, time: 140, startPoints: 60, hpRamp: 1,
    drawCount: { low: 3, mid: 3, high: 1 },
    intro: '補給が途絶えた。拠点を渦巻くように回る長い経路。時間内にポイントを貯めよ（所持ポイントで判定）。',
    map: { minX: -13, maxX: 13, minZ: -18.5, maxZ: 13 }, base: { x: 0, z: 0 }, factory: { x: 2.6, z: -2.6 },
    paths: [[[-11, -17.5], [-11, 10], [8, 10], [8, -10], [-5, -10], [-5, 4], [0, 4], [0, 0]]],
    ebases: [{ path: 0, hp: 600, pts: 150 }],
    waves: [
      [1, 'normal', 5, 1.2], [10, 'splitter', 3, 2.5], [20, 'normal', 8, .8], [30, 'healer', 1, 0], [31, 'normal', 8, .8], [44, 'splitter', 5, 1.6],
      [50, 'kamikaze', 8, .3], [56, 'shooter', 3, 2], [62, 'healer', 2, 3], [64, 'normal', 12, .6], [80, 'splitter', 6, 1.2],
      [94, 'normal', 14, .5], [100, 'kamikaze', 12, .25], [104, 'healer', 2, 3], [106, 'shooter', 4, 1.5], [115, 'splitter', 8, 1], [125, 'normal', 16, .4], [40, 'swarm', 30, .15], [90, 'swarmHeavy', 15, .4], [120, 'swarm', 40, .1],
    ],
  },
  {
    id: 's4', name: '第4戦区', sub: '逆侵攻', goal: 'bases', time: 150, startPoints: 160, hpRamp: 1,
    intro: '三方に敵拠点。すべて壊せば勝ち。壊した拠点からは出撃が止まる。北と南東の拠点は砲台付き。',
    map: { minX: -16, maxX: 16, minZ: -22, maxZ: 20 }, base: { x: 0, z: 0 }, factory: { x: -2.8, z: -2.2 },
    paths: [
      [[0, -21], [0, -16], [-9, -16], [-9, -8], [4, -8], [4, -3], [0, -3], [0, 0]],
      [[-15, 19], [-15, 10], [-9, 10], [-9, 14], [-4, 14], [-4, 4], [0, 4], [0, 0]],
      [[15, 19], [15, 6], [7, 6], [7, 11], [4, 11], [4, 2], [0, 2], [0, 0]],
    ],
    ebases: [
      { path: 0, hp: 600, pts: 100, turret: { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } },
      { path: 1, hp: 500, pts: 100 },
      { path: 2, hp: 700, pts: 120, turret: { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } },
    ],
    waves: [
      [6, 'normal', 4, 1.3, 0], [7, 'normal', 4, 1.3, 1], [8, 'normal', 4, 1.3, 2], [14, 'shooter', 2, 2.5, '*'], [22, 'shield', 3, 2, 0], [30, 'normal', 8, .8, '*'],
      [42, 'shield', 3, 2, 1], [48, 'shooter', 3, 2, '*'], [58, 'normal', 10, .6, '*'], [64, 'kamikaze', 8, .3, '*'], [70, 'shield', 4, 1.6, '*'], [80, 'shooter', 4, 1.6, '*'],
      [90, 'normal', 14, .5, '*'], [105, 'shield', 5, 1.4, '*'], [115, 'normal', 16, .45, '*'], [128, 'shooter', 5, 1.2, '*'], [52, 'swarm', 24, .15, '*'], [96, 'swarmBomb', 20, .15, '*'],
    ],
  },
  {
    id: 's5', name: '第5戦区', sub: '三方面', goal: 'time', time: 150, startPoints: 200, hpRamp: 1,
    intro: '北・南西・東の三方から。75秒で模倣機（ボス）が北から来る。',
    map: { minX: -17, maxX: 17, minZ: -23, maxZ: 22 }, base: { x: 0, z: 0 }, factory: { x: 2.6, z: -2.8 },
    paths: [
      [[0, -22], [0, -15], [-9, -15], [-9, -6], [-2, -6], [-2, 0], [0, 0]],
      [[-16, 20], [-16, 7], [-7, 7], [-7, 12], [-3, 12], [-3, 3], [0, 3], [0, 0]],
      [[16, -12], [10, -12], [10, 8], [4, 8], [4, 0], [0, 0]],
    ],
    ebases: [
      { path: 0, hp: 700, pts: 150, turret: { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } },
      { path: 1, hp: 700, pts: 150 },
      { path: 2, hp: 700, pts: 150, turret: { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } },
    ],
    waves: [
      [5, 'normal', 4, 1.2, 0], [7, 'normal', 4, 1.2, 2], [12, 'mine', 3, 1.5, 1], [18, 'shield', 3, 2, '*'], [26, 'normal', 9, .7, '*'],
      [34, 'armor', 3, 2.5, '*'], [44, 'splitter', 4, 1.6, '*'], [52, 'mine', 4, 1.2, '*'], [56, 'kamikaze', 9, .25, '*'], [60, 'shooter', 4, 1.5, '*'],
      [68, 'normal', 12, .55, '*'], [75, 'boss', 1, 0, 0], [78, 'shield', 4, 1.5, '*'], [84, 'dasher', 5, 1.2, '*'],
      [100, 'normal', 16, .45, '*'], [108, 'kamikaze', 12, .2, '*'], [110, 'armor', 4, 2, '*'], [118, 'mine', 6, 1, '*'], [126, 'splitter', 6, 1.1, '*'], [135, 'normal', 18, .4, '*'], [40, 'swarm', 30, .12, '*'], [90, 'swarmFly', 20, .2, '*'], [115, 'swarmHeavy', 18, .3, '*'],
    ],
  },
];
// ---------- 本編（地図移動が前提の広いステージ） ----------
STAGES.push({
  id: 'w1', name: '本編1', sub: '四方の前線', goal: 'time', time: 180, startPoints: 300, hpRamp: .8, wide: true,
  intro: '広い戦場。四方の敵拠点から長い経路で押し寄せる。地図を動かして戦況を見よ。100秒で模倣機が北から来る。',
  map: { minX: -30, maxX: 30, minZ: -40, maxZ: 40 }, base: { x: 0, z: 0 }, factory: { x: 2.5, z: -2.5 },
  view: { zoom: 2.6 },
  // 陣地：[x, z, 名前, 状態]。p＝最初から確保済み（拠点寄り）/ 省略＝中立 / e＝敵占領（守備隊が居座る。敵拠点寄り）
  outposts: [[-8, -12, 'A', 'p'], [15, -4, 'B'], [9, 9, 'C', 'p'], [-15, 4, 'D'], [4, -30, 'E', 'e'], [24, 0, 'F', 'e'], [-4, 30, 'G', 'e'], [-24, 0, 'H', 'e']],
  garrison: ['shooter', 'shooter', 'armor', 'normal', 'normal', 'normal'],
  paths: [
    [[0, -38], [0, -28], [-14, -28], [-14, -16], [-4, -16], [-4, -4], [0, -4], [0, 0]],
    [[28, 4], [20, 4], [20, -12], [10, -12], [10, 2], [3, 2], [0, 0]],
    [[0, 38], [0, 26], [14, 26], [14, 14], [4, 14], [4, 5], [0, 5], [0, 0]],
    [[-28, -4], [-20, -4], [-20, 12], [-10, 12], [-10, 3], [-3, 3], [0, 0]],
  ],
  ebases: [
    { path: 0, hp: 800, pts: 180, turret: { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } },
    { path: 1, hp: 700, pts: 150 },
    { path: 2, hp: 800, pts: 180, turret: { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } },
    { path: 3, hp: 700, pts: 150 },
  ],
  waves: [
    [3, 'normal', 3, 1.4, 0], [8, 'normal', 3, 1.4, 2], [14, 'normal', 3, 1.4, 1], [19, 'normal', 3, 1.4, 3],
    [24, 'shooter', 4, 2, '*'], [32, 'dasher', 4, 1.5, '*'], [40, 'kamikaze', 10, .25, 1], [44, 'shield', 4, 1.6, '*'],
    [52, 'armor', 4, 2.2, '*'], [58, 'splitter', 4, 1.5, '*'], [64, 'healer', 2, 4, '*'], [66, 'normal', 16, .5, '*'],
    [74, 'mine', 6, 1, '*'], [80, 'kamikaze', 12, .2, 3], [88, 'shooter', 6, 1.2, '*'], [100, 'boss', 1, 0, 0],
    [104, 'shield', 6, 1.2, '*'], [112, 'armor', 6, 1.6, '*'], [120, 'normal', 24, .35, '*'], [130, 'kamikaze', 16, .2, '*'],
    [140, 'splitter', 8, 1, '*'], [150, 'dasher', 8, .9, '*'], [160, 'normal', 28, .3, '*'], [168, 'armor', 6, 1.2, '*'],
    [70, 'flyer', 5, .8, '*'], [90, 'artillery', 1, 0, 1], [110, 'engineer', 2, 5, '*'], [150, 'engineer', 2, 5, '*'],
    [50, 'swarm', 40, .1, '*'], [95, 'swarmFast', 40, .08, '*'], [135, 'swarmBomb', 30, .1, '*'], [155, 'swarmFly', 30, .12, '*'],
  ],
});
STAGES.push({
  id: 'w2', name: '本編2', sub: '大群', goal: 'time', time: 120, startPoints: 300, hpRamp: .5, wide: true,
  intro: '2分間で約1000体が押し寄せる。範囲攻撃と前線拠点で一網打尽にせよ。輸送艦・飛行型・砲撃型・工兵も来る。',
  map: { minX: -26, maxX: 26, minZ: -34, maxZ: 34 }, base: { x: 0, z: 0 }, factory: { x: 3, z: -3 },
  view: { zoom: 2.2 },
  outposts: [[-8, -6, 'A', 'p'], [10, -4, 'B', 'p'], [0, 12, 'C', 'p']],
  paths: [
    [[0, -32], [0, -22], [-10, -22], [-10, -10], [-3, -10], [-3, -3], [0, 0]],
    [[24, 30], [24, 16], [12, 16], [12, 6], [4, 6], [0, 0]],
    [[-24, 30], [-24, 14], [-12, 14], [-12, 4], [-4, 4], [0, 0]],
  ],
  ebases: [
    { path: 0, hp: 900, pts: 200, turret: { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } },
    { path: 1, hp: 900, pts: 200 },
    { path: 2, hp: 900, pts: 200 },
  ],
  waves: [
    [2, 'swarm', 30, .15, 0], [4, 'swarm', 30, .15, 1], [6, 'swarm', 30, .15, 2],
    [14, 'swarm', 45, .12, '*'], [20, 'flyer', 6, .8, '*'], [24, 'swarm', 60, .1, '*'], [30, 'carrier', 1, 0, 0], [32, 'shooter', 6, 1, '*'],
    [38, 'swarm', 60, .1, '*'], [44, 'kamikaze', 15, .15, '*'], [50, 'swarm', 70, .08, '*'], [55, 'carrier', 1, 0, 1], [56, 'carrier', 1, 0, 2],
    [60, 'armor', 6, 1.5, '*'], [64, 'swarmFast', 80, .07, '*'], [70, 'flyer', 10, .5, '*'], [74, 'artillery', 3, 3, '*'], [78, 'swarm', 90, .06, '*'],
    [84, 'engineer', 3, 4, '*'], [88, 'carrier', 1, 0, 0], [90, 'swarm', 100, .05, '*'], [96, 'kamikaze', 20, .12, '*'], [100, 'swarmHeavy', 60, .06, '*'], [104, 'swarmBomb', 40, .1, '*'], [108, 'swarm', 100, .05, '*'], [112, 'swarmFly', 40, .1, '*'],
  ],
});
(() => {
  // 本編3：経路8本の包囲。経路は自拠点を中心に45度ずつ。少し曲げて互い違いにする
  const P = (r, a) => [Math.round(Math.sin(a) * r * 10) / 10, Math.round(-Math.cos(a) * r * 10) / 10];
  const paths = [];
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; paths.push([P(30, a), P(22, a), P(22, a + .18), P(13, a + .18), P(13, a - .1), P(6, a - .1), P(3, a), [0, 0]]); }
  const waves = [], kinds = ['swarm', 'swarmFast', 'swarm', 'swarmHeavy', 'swarmBomb', 'swarm', 'swarmFly'];
  for (let k = 0, t = 3; t <= 140; t += 7, k++) waves.push([t, kinds[k % kinds.length], Math.round(40 + t * .5), .04, '*']);
  waves.push([40, 'carrier', 2, 2, '*'], [80, 'carrier', 2, 2, '*'], [120, 'carrier', 2, 2, '*'], [60, 'flyer', 10, .4, '*'], [110, 'flyer', 14, .3, '*'],
    [90, 'boss', 1, 0, 0], [100, 'artillery', 2, 3, '*'], [70, 'engineer', 3, 3, '*'], [130, 'engineer', 3, 3, '*'], [30, 'shooter', 8, .8, '*'], [75, 'armor', 6, 1, '*'], [95, 'kamikaze', 24, .1, '*']);
  STAGES.push({
    id: 'w3', name: '本編3', sub: '包囲', goal: 'time', time: 150, startPoints: 400, hpRamp: .6, wide: true,
    intro: '八方から2分半で1500体以上。群体の全種が来る。前線拠点は経路のすぐ脇にあり、奪い合いになる。90秒で模倣機。',
    map: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 }, base: { x: 0, z: 0 }, factory: { x: 1.7, z: -3.6 },
    view: { zoom: 2.2 },
    outposts: [0, 1, 2, 3].map(k => P(11, Math.PI / 8 + k * Math.PI / 2).concat(['ABCD'[k], 'p'])),
    paths,
    ebases: paths.map((_, i) => ({ path: i, hp: 500, pts: 120, turret: i % 2 ? null : { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } })),
    waves,
  });
})();

// ---------- アンロック（ステージをまたいで残る。強化は持ち越さず、使えるパーツが増えるだけ） ----------
const UNLOCKS = [
  { id: 'magnum', cond: '第1戦区をクリア', stage: 's1' },
  { id: 'chain', cond: '第2戦区をクリア', stage: 's2' },
  { id: 'swarmer', cond: '第3戦区をクリア', stage: 's3' },
  { id: 'pile', cond: '第4戦区をクリア', stage: 's4' },
  { id: 'buster', cond: '模倣機（ボス）を撃破する', boss: true },
  { id: 'flare', cond: '群体を累計500体倒す', swarmKills: 500 },
  { id: 'prism', cond: '本編2「大群」をクリア', stage: 'w2' },
];
// 1回のプレイの結果と、これまでの累計からアンロックを判定。新しく解禁したものを返す
function checkUnlocks(S, save) {
  save.unlocked = save.unlocked || {}; save.swarmKills = (save.swarmKills || 0) + S.swarmKills;
  const got = [];
  for (const u of UNLOCKS) {
    if (save.unlocked[u.id]) continue;
    const ok = u.stage ? (S.over === 'win' && S.st.id === u.stage) : u.boss ? S.bossKilled : u.swarmKills ? save.swarmKills >= u.swarmKills : false;
    if (ok) { save.unlocked[u.id] = true; got.push(u.id); }
  }
  return got;
}
const DRAW_DEFAULT = { low: 2, mid: 3, high: 2 };

// ---------- 経路 ----------
function makePath(p) {
  const segs = []; let L = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1], len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, len, d0: L, ux: (bx - ax) / len, uz: (bz - az) / len }); L += len;
  }
  return { segs, len: L, pts: p };
}
function pathPos(P, d, off) {
  let s = P.segs[P.segs.length - 1];
  for (const g of P.segs) if (d < g.d0 + g.len) { s = g; break; }
  const t = clamp(d - s.d0, 0, s.len);
  return { x: s.ax + s.ux * t - s.uz * off, z: s.az + s.uz * t + s.ux * off, dx: s.ux, dz: s.uz };
}

// ---------- 状態 ----------
function drawBodies(dc) {
  const out = [];
  for (const tier in dc) out.push(...shuffle(BODIES.filter(b => b.tier === tier)).slice(0, dc[tier]));
  return out.sort((a, b) => a.cost - b.cost);
}
function newState(stageId, opt) {
  const S = newState0(stageId, opt);
  // 敵占領の陣地に守備隊を置く（その場から動かない）
  for (const o of S.outposts) if (o.owner === 'e') (S.st.garrison || []).forEach((type, k) => {
    const a = k / S.st.garrison.length * Math.PI * 2, def = ENEMIES[type];
    const e = { id: S.nid++, type, def, pi: 0, d: 0, off: 0, hp: def.hp, maxHp: def.hp, r: def.r, cd: rnd(.4, 1), x: o.x + Math.sin(a) * 1.4, z: o.z + Math.cos(a) * 1.4, face: 0, dead: false, flash: 0, firing: false, state: 'guard', armed: true };
    S.enemies.push(e);
  });
  return S;
}
function newState0(stageId, opt) {
  opt = opt || {};
  const st = STAGES.find(s => s.id === stageId) || STAGES[0];
  return {
    st, paths: st.paths.map(makePath), waves: st.waves.slice().sort((a, b) => a[0] - b[0]), // 出現表は時刻順に並べ直して使う
    ebases: (st.ebases || []).map((b, i) => ({ id: 'eb' + i, x: st.paths[b.path][0][0], z: st.paths[b.path][0][1], ...b, maxHp: b.hp, cd: 1, dead: false, flash: 0, ebase: true, r: CFG.ebaseR })),
    home: { x: st.base.x, z: st.base.z, r: CFG.homeR, home: true },
    homeObj: { id: 'home', name: '拠点砲台', x: st.base.x, z: st.base.z, cd: 0, face: 0, ptsMul: 1 }, homeGun: 0, homeShield: 0, homeShieldMax: 0, works: {},
    outposts: (st.outposts || []).map((o, i) => ({ id: 'op' + i, x: o[0], z: o[1], owner: o[3] || null, prog: o[3] === 'p' ? 1 : o[3] === 'e' ? -1 : 0, enemyOrig: o[3] === 'e', label: o[2] || String.fromCharCode(65 + i) })),
    spawned: 0,
    t: 0, pts: st.startPoints, baseHP: CFG.baseHP,
    robots: [], enemies: [], shots: [], queue: [], spawners: [], waveIdx: 0,
    bodies: drawBodies(st.drawCount || DRAW_DEFAULT), nid: 1, serial: 0, lines: 1, loadout: (opt.loadout || []).filter(id => WEAPONS[id] && WEAPONS[id].evo),
    kills: 0, swarmKills: 0, built: 0, lost: 0, bombs: 0, ffDmg: 0, ffKills: 0, leaked: 0, earned: 0, spent: 0, ebKills: 0, bossKilled: false,
    over: null, fx: [], msgs: [], warnT: 0, baseWarnT: 0, baseDmg: 0,
  };
}
const say = (S, text, kind = 'info') => S.msgs.push({ text, kind });
const activeCount = S => S.robots.length + S.queue.length;
const queueCount = S => S.queue.length;

function buildCost(body, wids) {
  let cost = body.cost, time = body.build;
  for (const w of wids) { cost += WEAPONS[w].cost; time += WEAPONS[w].build * (body.wbMul || 1); }
  time = Math.round(time * 10) / 10;
  return { cost, time };
}
function buildCheck(S, body, wids) {
  if (!body) return 'ボディを選んでください';
  if (!wids.length) return '武器を1つ以上選んでください';
  if (S.queue.length >= CFG.queueMax) return '予約は' + CFG.queueMax + '機までです';
  if (S.pts < buildCost(body, wids).cost) return 'ポイントが足りません';
  return null;
}
// ---------- 拠点工事：建造ラインの時間を使うが、出撃数には数えない。ロボットが主役なので控えめな性能 ----------
const WORKS = {
  repair: { name: '拠点修理', icon: '🔧', cost: 60, costUp: 20, build: 6, desc: '拠点HPを30回復する。頼むたびに費用が20上がる' },
  turret: { name: '拠点砲台', icon: '🗼', cost: 80, build: 8, max: 2, desc: '拠点に簡易砲台を付ける（射程6・威力7）。2段階まで。弾は味方にも当たる' },
  shield: { name: '拠点シールド', icon: '🛡', cost: 70, build: 6, desc: '拠点に60の盾を張る。ダメージを先に受け止める。張り直すと満タンに戻る' },
};
const HOME_GUN = { name: '拠点砲台', range: 6, dmg: 7, cd: .7, speed: 20, pellets: 1, fan: 0 };
function workCost(S, id) { const w = WORKS[id]; return w.cost + (w.costUp || 0) * (S.works[id] || 0); }
function workCheck(S, id) {
  const w = WORKS[id];
  if (S.queue.length >= CFG.queueMax) return '予約は' + CFG.queueMax + '機までです';
  if (w.max && (S.works[id] || 0) >= w.max) return '最大まで強化済みです';
  if (w.max && (S.works[id] || 0) + S.queue.filter(q => q.work === id).length >= w.max) return '予約分を含めて最大です';
  if (S.pts < workCost(S, id)) return 'ポイントが足りません';
  return null;
}
function orderWork(S, id) {
  const err = workCheck(S, id); if (err) return err;
  const c = workCost(S, id); S.pts -= c; S.spent += c;
  S.queue.push({ work: id, body: { name: WORKS[id].name }, wids: [], time: WORKS[id].build, prog: 0, no: ++S.serial, at: -1 });
  return null;
}
function finishWork(S, id) {
  S.works[id] = (S.works[id] || 0) + 1;
  if (id === 'repair') { const h = Math.min(30, CFG.baseHP - S.baseHP); S.baseHP += h; say(S, '🔧 拠点を修理（+' + Math.round(h) + '）', 'good'); }
  if (id === 'turret') { S.homeGun = Math.min(2, S.homeGun + 1); say(S, '🗼 拠点砲台 ' + S.homeGun + '段階', 'good'); }
  if (id === 'shield') { S.homeShield = S.homeShieldMax = 60; say(S, '🛡 拠点シールドを展開', 'good'); }
  S.fx.push({ type: 'work', id });
}
// 拠点の砲台：射程内の最寄りの敵を撃つ（段階が上がると連射が速くなる）
function updHomeGun(S, dt) {
  if (!S.homeGun) return;
  const H = S.homeObj; H.cd -= dt; if (H.cd > 0) return;
  const tg = nearest(S.enemies, H.x, H.z, HOME_GUN.range, true); if (!tg) return;
  H.face = fireWeapon(S, H, HOME_GUN, tg, 'p', {}); H.cd = HOME_GUN.cd / S.homeGun;
}
function buyLine(S) {
  if (S.lines >= 2) return '開放済みです';
  if (S.pts < CFG.line2Cost) return 'ポイントが足りません';
  S.pts -= CFG.line2Cost; S.spent += CFG.line2Cost; S.lines = 2; say(S, '🏗 建造ライン2を開放。2機同時に建造できる', 'good');
  return null;
}
function orderBuild(S, body, wids, at) {
  const err = buildCheck(S, body, wids); if (err) return err;
  const { cost, time } = buildCost(body, wids);
  S.pts -= cost; S.spent += cost;
  S.queue.push({ body, wids: [...wids], time, prog: 0, no: ++S.serial, at: at === undefined ? -1 : at });
  return null;
}

function makeRobot(S, q) {
  const b = q.body, p = b.plus, op = S.outposts[q.at];
  // 陣地から出撃する予定だったのに、その陣地が落ちていたら出撃失敗（機体は失われ、ポイントも戻らない）
  if (op && op.owner !== 'p') {
    S.lost++; S.failed = (S.failed || 0) + 1;
    S.fx.push({ type: 'robodie', x: op.x, z: op.z });
    say(S, '✖ 出撃失敗：陣地' + op.label + 'が落ちている（' + b.name + 'は失われた）', 'bad');
    return null;
  }
  const used = new Set(S.robots.map(r => r.slot)); let slot = 1; while (used.has(slot)) slot++;
  q.slot = slot;
  // 自拠点から出るときは拠点に重なる位置、陣地から出るときは陣地の上
  const a = rnd(0, Math.PI * 2), f = op ? { x: op.x + Math.sin(a) * .8, z: op.z + Math.cos(a) * .8 } : { x: S.home.x + Math.sin(a) * 1.6, z: S.home.z + Math.cos(a) * 1.6 };
  const r = {
    id: S.nid++, slot: q.slot, name: q.slot + '番 ' + b.name, body: b,
    x: f.x, z: f.z, tx: 0, tz: 0,
    hp: b.hp, maxHp: b.hp, spd: b.speed, shield: b.shield || 0, maxShield: b.shield || 0,
    dmgMul: 1 + (p.dmg || 0), rateMul: 1 + (p.rate || 0), crit: p.crit || 0, ptsMul: 1 + (p.pts || 0), rangeMul: 1 + (p.range || 0),
    weapons: q.wids.map(w => ({ id: w, def: WEAPONS[w], cd: rnd(0, .3) })),
    face: Math.PI, moving: false, warned: false, dead: false, flash: 0, fireT: -9, hitT: -9,
  };
  r.tx = r.x; r.tz = r.z;
  S.robots.push(r); S.built++; S.fx.push({ type: 'spawn', x: r.x, z: r.z, id: r.id });
  say(S, '🔧 ' + r.name + ' 完成' + (op && op.owner === 'p' ? '（陣地' + op.label + 'から出撃）' : ''));
  return r;
}
function moveRobot(r, x, z, S) {
  const m = S ? S.st.map : null;
  r.tx = m ? clamp(x, m.minX, m.maxX) : x; r.tz = m ? clamp(z, m.minZ, m.maxZ) : z;
}

function nearest(list, x, z, range, extraR) {
  let best = null, bd = Infinity;
  for (const e of list) {
    if (e.dead) continue;
    const rr = range + (extraR ? e.r : 0), d = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (d <= rr * rr && d < bd) { bd = d; best = e; }
  }
  return best;
}
// 着弾時点の自分の位置（移動先へ直進すると仮定）が爆風の外にあるか
function blastSafe(r, tg, d) {
  const t = Math.hypot(tg.x - r.x, tg.z - r.z) / d.speed + .1;
  const dx = r.tx - r.x, dz = r.tz - r.z, dist = Math.hypot(dx, dz), m = Math.min(dist, r.spd * t);
  const px = dist > 0 ? r.x + dx / dist * m : r.x, pz = dist > 0 ? r.z + dz / dist * m : r.z;
  return Math.hypot(tg.x - px, tg.z - pz) >= d.blast + CFG.missileSafety;
}
function densest(list, x, z, range, rad, minDist) {
  let best = null, bc = 0;
  for (const e of list) {
    if (e.dead) continue;
    const dd = (e.x - x) ** 2 + (e.z - z) ** 2;
    if (dd > range * range || dd < minDist * minDist) continue;
    let c = 0; for (const o of list) if (!o.dead && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 <= rad * rad) c++;
    if (c > bc) { bc = c; best = e; }
  }
  return best;
}

// ---------- ダメージ ----------
// 範囲ダメージ。味方側の爆発は敵・敵拠点・味方ロボットに当たる。敵側の爆発はロボットにだけ当たる
function blast(S, x, z, rad, dmg, owner, team) {
  if (team === 'e') {
    for (const r of S.robots) if (!r.dead && Math.hypot(r.x - x, r.z - z) <= rad + CFG.robotR) hurtRobot(S, r, dmg, null);
    if (Math.hypot(S.home.x - x, S.home.z - z) <= rad + S.home.r) hurtHome(S, dmg, x, z);
  } else {
    for (const e of S.enemies) if (!e.dead && Math.hypot(e.x - x, e.z - z) <= rad + e.r) hurtEnemy(S, e, dmg, owner, true);
    for (const b of S.ebases) if (!b.dead && Math.hypot(b.x - x, b.z - z) <= rad + b.r) hurtEbase(S, b, dmg);
    for (const r of S.robots) if (!r.dead && Math.hypot(r.x - x, r.z - z) <= rad + CFG.robotR) hurtRobot(S, r, dmg * CFG.friendlyFire, owner);
  }
  S.fx.push({ type: 'blast', x, z, rad, team: team || 'p' });
}
function hurtEnemy(S, e, dmg, owner, noArmor) {
  if (e.dead) return;
  if (e.def.armor && !noArmor) dmg = Math.max(dmg * CFG.armorFloor, dmg - e.def.armor);
  e.hp -= dmg; e.flash = .08;
  if (e.hp <= 0) killEnemy(S, e, owner);
}
function killEnemy(S, e, owner) {
  e.dead = true; S.kills++; if (e.def.inst) S.swarmKills++;
  const g = Math.round(e.def.pts * (owner ? owner.ptsMul : 1));
  S.pts += g; S.earned += g;
  S.fx.push({ type: 'kill', x: e.x, z: e.z, pts: g, big: !!e.def.boss, small: !!e.def.inst, kind: e.type });
  if (e.def.boss) { S.bossKilled = true; say(S, '★ 模倣機を撃破', 'good'); }
  if (e.def.split) for (let i = 0; i < e.def.split.n; i++) spawnEnemy(S, e.def.split.type, e.pi, e.d - i * .5, e);
  if (e.def.mine && e.armed) mineBlast(S, e);
}
function hurtEbase(S, b, dmg) {
  if (b.dead) return;
  b.hp -= dmg; b.flash = .08;
  if (b.hp <= 0) {
    b.dead = true; S.ebKills++; S.pts += b.pts; S.earned += b.pts;
    S.fx.push({ type: 'ebase', x: b.x, z: b.z, pts: b.pts });
    say(S, '🏭 敵拠点を破壊（残り ' + S.ebases.filter(x => !x.dead).length + '）' + (S.st.goal === 'bases' ? '' : ' この方面の敵が減る'), 'good');
  }
}
// 拠点へのダメージ。盾があれば先に盾が受け止める
function homeTake(S, dmg) {
  if (S.homeShield > 0) { const a = Math.min(S.homeShield, dmg); S.homeShield -= a; dmg -= a; if (S.homeShield <= 0) { S.homeShield = 0; say(S, '🛡 拠点シールドが破れた', 'bad'); } }
  S.baseHP -= dmg; S.baseDmg += dmg;
}
function hurtHome(S, dmg, x, z) {
  dmg *= CFG.homeShotMul;
  homeTake(S, dmg); S.fx.push({ type: 'basehit', x, z });
  if (S.baseWarnT <= 0) { S.baseWarnT = 6; say(S, '🚨 拠点が攻撃を受けている', 'bad'); }
}
function hurtRobot(S, r, dmg, by) {
  if (r.dead || dmg <= 0) return;
  r.flash = .1; r.hitT = S.t;
  if (r.shield > 0) { const a = Math.min(r.shield, dmg); r.shield -= a; dmg -= a; if (dmg <= 0) return; }
  r.hp -= dmg;
  const ff = !!by;
  if (ff) { S.ffDmg += Math.min(dmg, r.hp + dmg); if (S.t - (r.ffMsgT || -9) > 4) { r.ffMsgT = S.t; say(S, '⚡ ' + r.name + ' 誤射を受けた（' + by.name + '）', 'warn'); } }
  if (r.hp <= 0) {
    r.dead = true; S.lost++; if (ff) S.ffKills++;
    S.fx.push({ type: 'robodie', x: r.x, z: r.z });
    say(S, '✖ ' + r.name + (ff ? ' 味方の攻撃で撃破' : ' 撃破された'), 'bad');
  } else if (!r.warned && r.hp < r.maxHp * .3) {
    r.warned = true; say(S, '⚠ ' + r.name + ' 損傷大', 'warn');
  }
}
function explode(S, r, d) {
  r.dead = true; S.bombs++;
  blast(S, r.x, r.z, d.radius, d.dmg * r.dmgMul, r, 'p');
  S.fx.push({ type: 'boom', x: r.x, z: r.z, rad: d.radius });
  say(S, '💣 ' + r.name + ' 自爆');
}
function mineBlast(S, e) {
  e.armed = false;
  const m = e.def.mine;
  blast(S, e.x, e.z, m.radius, m.dmg, null, 'e');
  S.fx.push({ type: 'boom', x: e.x, z: e.z, rad: m.radius, team: 'e' });
}

// ---------- ロボット ----------
// 狙い：射程内の敵（最寄り。ミサイルは一番固まっている所）。敵がいなければ射程内の敵拠点
function toughest(list, x, z, range) {
  let best = null, bh = 0;
  for (const e of list) { if (e.dead || (e.x - x) ** 2 + (e.z - z) ** 2 > (range + (e.r || 0)) ** 2) continue; if (e.hp > bh) { bh = e.hp; best = e; } }
  return best;
}
function robotTarget(S, r, d, range) {
  if (d.pick === 'tough') return toughest(S.enemies, r.x, r.z, range) || nearest(S.ebases, r.x, r.z, range, true);
  if (d.noBase) return d.cluster ? densest(S.enemies, r.x, r.z, range, d.blast, d.blast + CFG.missileSafety) : nearest(S.enemies, r.x, r.z, range);
  let tg = d.cluster ? densest(S.enemies, r.x, r.z, range, d.blast, d.blast + CFG.missileSafety) : nearest(S.enemies, r.x, r.z, range);
  if (!tg) { const b = nearest(S.ebases, r.x, r.z, range, true); if (b && (!d.blast || Math.hypot(b.x - r.x, b.z - r.z) >= d.blast + CFG.missileSafety)) tg = b; }
  return tg;
}
function fireWeapon(S, src, d, tg, team, mul) {
  const a = Math.atan2(tg.x - src.x, tg.z - src.z);
  if (team === 'p') S.fx.push({ type: 'fire', x: src.x, z: src.z, a, kind: d.blast ? 'm' : d.size ? 'h' : d.pellets > 1 ? 's' : 'b', id: src.id });
  const range = d.range * (mul.range || 1);
  for (let i = 0; i < d.pellets; i++) {
    const aa = a + (d.pellets > 1 ? (i / (d.pellets - 1) - .5) * d.fan : 0);
    const dmg = d.dmg * (mul.dmg || 1) * (Math.random() < (mul.crit || 0) ? CFG.critMul : 1);
    S.shots.push({
      id: S.nid++, team, x: src.x, z: src.z, vx: Math.sin(aa) * d.speed, vz: Math.cos(aa) * d.speed, dmg,
      life: (d.blast ? Math.hypot(tg.x - src.x, tg.z - src.z) : range) / d.speed * (d.homing ? 1.6 : 1) + .05, r: d.size || (d.blast ? .25 : .18),
      owner: team === 'p' ? src : null, src, pierce: d.pierce || 0, hits: [], w: d.name, blast: d.blast || 0,
      arm: d.blast ? (d.blast + CFG.missileSafety) / d.speed : 0,
      noArmor: !!d.noArmor, noShield: !!d.noShield, homing: d.homing || 0, tg: d.homing ? tg : null, size: d.size || 0, chain: d.chain || null, splash: d.splash || null,
    });
  }
  return a;
}
// レーザー：最寄りの敵へ向けて照射し続ける。直線上の敵・敵拠点・味方ロボットすべてに毎秒ダメージ
function beam(S, r, w, d, dt) {
  const range = d.range * r.rangeMul, tg = robotTarget(S, r, d, range);
  if (!tg) { w.beam = null; return; }
  const a0 = Math.atan2(tg.x - r.x, tg.z - r.z), n = d.beams || 1; r.fireT = S.t; if (!r.moving) r.face = a0;
  const dmg = d.dps * dt * r.dmgMul * (1 + r.crit * (CFG.critMul - 1));
  w.beam = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (n > 1 ? (k / (n - 1) - .5) * 2 * d.spread : 0), ux = Math.sin(a), uz = Math.cos(a);
    w.beam.push({ x2: r.x + ux * range, z2: r.z + uz * range });
    const onLine = (t, rr) => { const px = t.x - r.x, pz = t.z - r.z, along = px * ux + pz * uz; return along > 0 && along < range + rr && Math.abs(px * uz - pz * ux) < d.width + rr; };
    for (const e of S.enemies) if (!e.dead && onLine(e, e.r)) { hurtEnemy(S, e, dmg, r, true); if (d.slow) e.slowT = .6; }
    for (const b of S.ebases) if (!b.dead && onLine(b, b.r)) hurtEbase(S, b, dmg);
    for (const o of S.robots) if (o !== r && !o.dead && onLine(o, CFG.robotR)) hurtRobot(S, o, dmg * CFG.friendlyFire * (d.ffMul || 1), r);
  }
}
function updRobot(S, r, dt) {
  r.flash = Math.max(0, r.flash - dt);
  if (r.maxShield && S.t - r.hitT > 4) r.shield = Math.min(r.maxShield, r.shield + 8 * dt); // 盾：3秒被弾しないと回復
  const dx = r.tx - r.x, dz = r.tz - r.z, dist = Math.hypot(dx, dz);
  r.moving = dist > .05;
  if (r.moving) { const m = Math.min(dist, r.spd * dt); r.x += dx / dist * m; r.z += dz / dist * m; r.face = Math.atan2(dx, dz); }
  for (const w of r.weapons) {
    const d = w.def;
    if (d.type === 'bomb') { if (nearest(S.enemies, r.x, r.z, d.trigger, true)) { explode(S, r, d); return; } continue; }
    if (d.type === 'beam') { beam(S, r, w, d, dt); continue; }
    w.cd -= dt; if (w.cd > 0) continue;
    const tg = robotTarget(S, r, d, d.range * r.rangeMul);
    if (!tg) { w.cd = 0; continue; }
    if (d.blast && r.moving && !blastSafe(r, tg, d)) { w.cd = .1; continue; } // 移動中：着弾時に自分が爆風に入るなら撃たない
    const a = fireWeapon(S, r, d, tg, 'p', { dmg: r.dmgMul, crit: r.crit, range: r.rangeMul });
    w.cd = d.cd / r.rateMul; r.fireT = S.t;
    if (!r.moving) r.face = a;
  }
}

// ---------- 敵 ----------
function spawnEnemy(S, type, pi, d0, from) {
  const def = ENEMIES[type], hm = def.noRamp ? 1 : 1 + S.st.hpRamp * Math.min(1, S.t / S.st.time);
  const e = {
    id: S.nid++, type, def, pi, d: Math.max(0, d0 || 0), off: rnd(-.45, .45), hp: def.hp * hm, maxHp: def.hp * hm, r: def.r,
    cd: rnd(.4, 1), x: 0, z: 0, face: 0, dead: false, flash: 0, firing: false, state: 'path', armed: true,
  };
  if (def.boss) { e.off = 0; e.weapons = def.weapons.map(w => ({ id: w, def: WEAPONS[w], cd: rnd(.5, 1.5) })); say(S, '🚨 模倣機（ボス）が出現', 'bad'); S.fx.push({ type: 'boss' }); }
  const p = pathPos(S.paths[pi], e.d, e.off); e.x = from ? from.x + rnd(-.5, .5) : p.x; e.z = from ? from.z + rnd(-.5, .5) : p.z;
  if (from) e.state = 'return';
  if (def.fly) e.state = 'fly';
  if (def.drop) e.dropT = def.drop.every * .5;
  if (def.rebuild) { const eb = S.ebases.find(b => b.path === pi); if (eb && eb.dead) { e.state = 'build'; e.buildT = def.rebuild.time; e.eb = eb; say(S, '🛠 工兵が敵拠点を再建中（' + dirName(S, [eb.x, eb.z]) + '）', 'warn'); } }
  S.enemies.push(e); S.spawned++;
}
// 拠点から見た方角（画面の上が北）
function dirName(S, p) {
  const dx = p[0] - S.st.base.x, dz = p[1] - S.st.base.z, a = Math.atan2(dx, -dz) * 180 / Math.PI;
  return ['北', '北東', '東', '南東', '南', '南西', '西', '北西'][((Math.round(a / 45) % 8) + 8) % 8];
}
function goAlongPath(S, e, dt, speed) {
  speed *= CFG.enemySpeedMul;
  if (e.slowT > 0) speed *= .5;
  const P = S.paths[e.pi], stop = P.len - CFG.baseStop;
  if (e.d >= stop) return true;
  e.d = Math.min(stop, e.d + speed * dt);
  const p = pathPos(P, e.d, e.off); e.x = p.x; e.z = p.z; e.face = Math.atan2(p.dx, p.dz);
  if (stop - e.d < 6 && S.warnT <= 0) { S.warnT = 8; say(S, '⚠ 敵が拠点に接近（' + dirName(S, S.st.paths[e.pi][0]) + '）', 'warn'); }
  return e.d >= stop;
}
function attackBase(S, e, dt) {
  if (!e.atBase) {
    e.atBase = true; e.atkT = 0; S.leaked++;
    const once = e.def.mine ? e.def.mine.baseDmg : e.def.kamikaze ? e.def.kamikaze.baseDmg : 0;
    if (once) { homeTake(S, once); e.dead = true; S.fx.push({ type: 'boom', x: e.x, z: e.z, rad: 2, team: 'e' }); return; }
  }
  homeTake(S, e.def.baseDps * dt);
  e.face = Math.atan2(S.st.base.x - e.x, S.st.base.z - e.z);
  e.atkT -= dt; if (e.atkT <= 0) { e.atkT = 1; S.fx.push({ type: 'basehit', x: e.x, z: e.z }); }
  if (S.baseWarnT <= 0) { S.baseWarnT = 6; say(S, '🚨 拠点が攻撃を受けている', 'bad'); }
}
function updEnemy(S, e, dt) {
  const def = e.def;
  e.flash = Math.max(0, e.flash - dt); if (e.slowT > 0) e.slowT -= dt;
  // 回復ドローン：周りの敵を回復
  if (def.heal) {
    for (const o of S.enemies) if (o !== e && !o.dead && o.hp < o.maxHp && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 <= def.heal.range ** 2) o.hp = Math.min(o.maxHp, o.hp + def.heal.hps * dt);
  }
  // 守備隊：陣地から動かない。射撃型は撃ち、それ以外は触れたロボットを殴る
  if (e.state === 'guard') {
    const tg = nearest(S.robots, e.x, e.z, def.range || 6);
    if (tg) e.face = Math.atan2(tg.x - e.x, tg.z - e.z);
    if (def.range) {
      e.cd -= dt; e.firing = !!tg;
      if (tg && e.cd <= 0) { e.cd = def.cd; S.shots.push({ id: S.nid++, team: 'e', x: e.x, z: e.z, vx: Math.sin(e.face) * def.shotSpeed, vz: Math.cos(e.face) * def.shotSpeed, dmg: def.dmg, life: def.range / def.shotSpeed + .3, r: .22, pierce: 0, hits: [] }); }
    } else if (tg && Math.hypot(tg.x - e.x, tg.z - e.z) < e.r + CFG.robotR + .4) hurtRobot(S, tg, 8 * dt, null);
    return;
  }
  // 飛行型：経路を無視して拠点へ直進
  if (def.fly) {
    if (e.atBase) { attackBase(S, e, dt); return; }
    const dx = S.home.x - e.x, dz = S.home.z - e.z, dd = Math.hypot(dx, dz);
    if (dd <= S.home.r + 1.2) { attackBase(S, e, dt); return; }
    const m = Math.min(dd, def.speed * CFG.enemySpeedMul * (e.slowT > 0 ? .5 : 1) * dt); e.x += dx / dd * m; e.z += dz / dd * m; e.face = Math.atan2(dx, dz);
    if (dd < 8 && S.warnT <= 0) { S.warnT = 8; say(S, '⚠ 飛行型が拠点に接近', 'warn'); }
    return;
  }
  // 工兵：壊された敵拠点の跡地で再建する
  if (e.state === 'build') {
    if (!e.eb.dead) { e.state = 'path'; }
    else { e.buildT -= dt; if (e.buildT <= 0) { const b = e.eb; b.dead = false; b.hp = b.maxHp * def.rebuild.hpRate; S.ebKills--; e.state = 'path'; say(S, '🏭 敵拠点が再建された（' + dirName(S, [b.x, b.z]) + '）', 'bad'); S.fx.push({ type: 'rebuild', x: b.x, z: b.z }); } return; }
  }
  // 輸送艦：群体を降ろし続ける
  if (def.drop && !e.atBase) {
    e.dropT -= dt;
    if (e.dropT <= 0) { e.dropT = def.drop.every; for (let i = 0; i < def.drop.n; i++) spawnEnemy(S, def.drop.type, e.pi, e.d, e); }
  }
  // 砲撃型：拠点が射程に入ったら止まって砲撃
  if (def.artillery) {
    const A = def.artillery, dd = Math.hypot(S.home.x - e.x, S.home.z - e.z);
    if (dd - S.home.r <= A.range && e.state === 'path') {
      e.face = Math.atan2(S.home.x - e.x, S.home.z - e.z); e.cd -= dt; e.firing = true;
      if (e.cd <= 0) { e.cd = A.cd; S.shots.push({ id: S.nid++, team: 'e', x: e.x, z: e.z, vx: Math.sin(e.face) * A.shotSpeed, vz: Math.cos(e.face) * A.shotSpeed, dmg: A.dmg, life: dd / A.shotSpeed + .5, r: .3, pierce: 0, hits: [], shell: true }); }
      if (S.t - (S.artWarnT || -99) > 10) { S.artWarnT = S.t; say(S, '💥 砲撃型が拠点を砲撃中（' + dirName(S, [e.x, e.z]) + '）', 'bad'); }
      return;
    }
  }
  // 機雷：ロボットに近づくと爆発
  if (def.mine && nearest(S.robots, e.x, e.z, def.mine.trigger)) { e.dead = true; mineBlast(S, e); return; }
  // ボス：歩きながら武器で撃つ（拠点に着いたら拠点も攻撃）
  if (def.boss) {
    // 狙い：射程内のロボット、いなければ射程内の自拠点
    const homeIn = r => Math.hypot(S.home.x - e.x, S.home.z - e.z) - S.home.r <= r;
    for (const w of e.weapons) {
      w.cd -= dt; if (w.cd > 0) continue;
      const tg = nearest(S.robots, e.x, e.z, w.def.range) || (homeIn(w.def.range - .5) ? S.home : null);
      if (!tg) { w.cd = 0; continue; }
      e.face = fireWeapon(S, e, w.def, tg, 'e', {}); w.cd = w.def.cd * (def.fireMul || 1);
    }
    // ロボットか拠点が射程に入ったら立ち止まって撃つ。体当たりはしない
    if (nearest(S.robots, e.x, e.z, def.hold) || homeIn(def.hold)) return;
    goAlongPath(S, e, dt, def.speed);
    return;
  }
  // 突進型
  if (def.dash) {
    const D = def.dash;
    if (e.state === 'aim') { e.aimT -= dt; if (e.aimT <= 0) { e.state = 'dash'; e.left = D.len; e.hits = []; } return; }
    if (e.state === 'dash') {
      const m = Math.min(e.left, D.speed * CFG.enemySpeedMul * dt); e.x += e.dvx * m; e.z += e.dvz * m; e.left -= m;
      for (const r of S.robots) if (!r.dead && !e.hits.includes(r) && (r.x - e.x) ** 2 + (r.z - e.z) ** 2 < (CFG.robotR + e.r) ** 2) { e.hits.push(r); hurtRobot(S, r, D.dmg, null); }
      if (e.left <= 0) { e.state = 'return'; e.cd = D.cd; }
      return;
    }
    e.cd -= dt;
    if (e.state === 'path' && !e.atBase && e.cd <= 0) {
      const tg = nearest(S.robots, e.x, e.z, D.sense);
      if (tg) { const a = Math.atan2(tg.x - e.x, tg.z - e.z); e.face = a; e.dvx = Math.sin(a); e.dvz = Math.cos(a); e.state = 'aim'; e.aimT = D.aim; return; }
    }
  }
  // 特攻型：近くのロボットへ突っ込み、触れたら自爆
  if (def.kamikaze) {
    const K = def.kamikaze;
    const tg = e.atBase ? null : nearest(S.robots, e.x, e.z, K.sense);
    if (tg) {
      const dx = tg.x - e.x, dz = tg.z - e.z, dd = Math.hypot(dx, dz);
      if (dd < CFG.robotR + e.r + .15) { e.dead = true; blast(S, e.x, e.z, K.radius, K.dmg, null, 'e'); return; }
      const m = Math.min(dd, def.speed * CFG.enemySpeedMul * 1.2 * dt); e.x += dx / dd * m; e.z += dz / dd * m; e.face = Math.atan2(dx, dz); e.state = 'return';
      return;
    }
  }
  // 経路から外れた敵（突進後・分裂直後）は経路に戻る
  if (e.state === 'return') {
    const p = pathPos(S.paths[e.pi], e.d, e.off), dx = p.x - e.x, dz = p.z - e.z, dd = Math.hypot(dx, dz);
    if (dd < .15) e.state = 'path';
    else { const m = Math.min(dd, def.speed * CFG.enemySpeedMul * 1.5 * dt); e.x += dx / dd * m; e.z += dz / dd * m; e.face = Math.atan2(dx, dz); }
    return;
  }
  // 射撃型：ロボットが射程内なら立ち止まって撃つ
  if (def.range) {
    e.cd -= dt;
    const tg = nearest(S.robots, e.x, e.z, def.range);
    if (tg) {
      e.face = Math.atan2(tg.x - e.x, tg.z - e.z); e.firing = true;
      if (e.cd <= 0) {
        e.cd = def.cd;
        S.shots.push({ id: S.nid++, team: 'e', x: e.x, z: e.z, vx: Math.sin(e.face) * def.shotSpeed, vz: Math.cos(e.face) * def.shotSpeed, dmg: def.dmg, life: def.range / def.shotSpeed + .3, r: .22, pierce: 0, hits: [] });
      }
      return;
    }
    e.firing = false;
  }
  if (goAlongPath(S, e, dt, def.speed)) attackBase(S, e, dt);
}
function updEbase(S, b, dt) {
  b.flash = Math.max(0, b.flash - dt);
  if (!b.turret) return;
  b.cd -= dt; if (b.cd > 0) return;
  const tg = nearest(S.robots, b.x, b.z, b.turret.range); if (!tg) return;
  b.cd = b.turret.cd; b.face = Math.atan2(tg.x - b.x, tg.z - b.z);
  S.shots.push({ id: S.nid++, team: 'e', x: b.x, z: b.z, vx: Math.sin(b.face) * b.turret.shotSpeed, vz: Math.cos(b.face) * b.turret.shotSpeed, dmg: b.turret.dmg, life: b.turret.range / b.turret.shotSpeed + .3, r: .24, pierce: 0, hits: [] });
}

// ---------- 弾 ----------
function shieldBlocks(e, s) {
  const sp = Math.hypot(s.vx, s.vz) || 1;
  return (Math.sin(e.face) * -s.vx + Math.cos(e.face) * -s.vz) / sp > Math.cos(e.def.shield);
}
// 命中時の追加効果：連鎖（近くの敵へ電撃）と炸裂（周りを巻き込む。味方にも当たる）
function onHitExtra(S, s, t) {
  if (s.chain) {
    const C = s.chain, got = [];
    for (let k = 0; k < C.n; k++) {
      let best = null, bd = C.range * C.range; const from = got.length ? got[got.length - 1] : t;
      for (const e of S.enemies) { if (e.dead || e === t || got.includes(e)) continue; const d = (e.x - from.x) ** 2 + (e.z - from.z) ** 2; if (d < bd) { bd = d; best = e; } }
      if (!best) break; got.push(best); S.fx.push({ type: 'chain', x: from.x, z: from.z, x2: best.x, z2: best.z }); hurtEnemy(S, best, s.dmg * C.mul, s.owner, false);
    }
  }
  if (s.splash) {
    const P = s.splash, dm = s.dmg * P.mul;
    for (const e of S.enemies) if (!e.dead && e !== t && Math.hypot(e.x - s.x, e.z - s.z) <= P.r + e.r) hurtEnemy(S, e, dm, s.owner, true);
    for (const o of S.robots) if (!o.dead && o !== s.owner && Math.hypot(o.x - s.x, o.z - s.z) <= P.r + CFG.robotR) hurtRobot(S, o, dm * CFG.friendlyFire, s.owner);
    S.fx.push({ type: 'splash', x: s.x, z: s.z, rad: P.r });
  }
}
function updShots(S, dt) {
  for (const s of S.shots) {
    if (s.homing && s.tg && !s.tg.dead) {
      const sp = Math.hypot(s.vx, s.vz), a = Math.atan2(s.vx, s.vz), want = Math.atan2(s.tg.x - s.x, s.tg.z - s.z);
      let da = want - a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      const na = a + Math.max(-s.homing * dt, Math.min(s.homing * dt, da)); s.vx = Math.sin(na) * sp; s.vz = Math.cos(na) * sp;
    }
    s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt;
    if (s.life <= 0) { s.dead = true; if (s.blast) blast(S, s.x, s.z, s.blast, s.dmg, s.owner, s.team); continue; }
    if (s.blast) { // ミサイル：安全距離を飛ぶまでは何にも当たらない。その後は当たった所で爆発
      s.arm -= dt; if (s.arm > 0) continue;
      const tgts = s.team === 'p' ? S.enemies.concat(S.ebases, S.robots) : S.robots.concat([S.home]);
      for (const t of tgts) {
        if (t.dead || t === s.src) continue;
        const rr = t.def || t.ebase || t.home ? t.r : CFG.robotR;
        if ((t.x - s.x) ** 2 + (t.z - s.z) ** 2 < (rr + s.r) ** 2) { s.dead = true; blast(S, s.x, s.z, s.blast, s.dmg, s.owner, s.team); break; }
      }
      continue;
    }
    if (s.team === 'p') {
      // 敵・敵拠点・味方ロボットのうち、当たったものすべて（貫通数まで）
      const lists = [S.enemies, S.ebases, S.robots];
      for (let li = 0; li < 3 && !s.dead; li++) for (const t of lists[li]) {
        if (t.dead || t === s.owner) continue;
        const rr = li === 2 ? CFG.robotR : t.r, dx = t.x - s.x, dz = t.z - s.z;
        if (dx * dx + dz * dz >= (rr + s.r) ** 2 || s.hits.includes(t)) continue;
        if (li === 0 && t.def.shield && !s.noShield && shieldBlocks(t, s)) { s.dead = true; S.fx.push({ type: 'block', x: s.x, z: s.z }); break; }
        if (li === 2) hurtRobot(S, t, s.dmg * CFG.friendlyFire, s.owner);
        else if (li === 1) hurtEbase(S, t, s.dmg);
        else hurtEnemy(S, t, s.dmg, s.owner, s.noArmor);
        if (li !== 2) onHitExtra(S, s, t);
        if (s.pierce > 0) { s.pierce--; s.hits.push(t); } else { s.dead = true; break; }
      }
    } else {
      for (const r of S.robots) {
        if (r.dead) continue;
        if ((r.x - s.x) ** 2 + (r.z - s.z) ** 2 < (CFG.robotR + s.r) ** 2) { hurtRobot(S, r, s.dmg, null); s.dead = true; break; }
      }
      if (!s.dead && (S.home.x - s.x) ** 2 + (S.home.z - s.z) ** 2 < (S.home.r + s.r) ** 2) { hurtHome(S, s.dmg, s.x, s.z); s.dead = true; }
    }
  }
}

// ---------- 前線拠点：敵がいない状態でロボットが近くにいると占領。敵だけが近くにいると奪われる ----------
function updOutpost(S, o, dt) {
  const R = CFG.outpostR, rob = !!nearest(S.robots, o.x, o.z, R), en = !!nearest(S.enemies, o.x, o.z, R, true), v = dt / CFG.captureTime;
  if (rob && !en && o.prog < 1) {
    o.prog = Math.min(1, o.prog + v);
    if (o.owner === 'e' && o.prog >= 0) { o.owner = null; say(S, '🚩 敵占領の陣地' + o.label + 'を制圧。このまま確保する', 'good'); }
    if (o.prog >= 1) { o.owner = 'p'; if (o.enemyOrig && !o.freed) { o.freed = true; S.pts += CFG.liberatePts; S.earned += CFG.liberatePts; } S.fx.push({ type: 'capture', x: o.x, z: o.z }); say(S, '🚩 陣地' + o.label + 'を確保。ここから出撃できる' + (o.enemyOrig && o.freed ? '（+' + CFG.liberatePts + '）' : ''), 'good'); }
  } else if (en && !rob) {
    const floor = o.enemyOrig ? -1 : 0; // 敵占領だった陣地は、敵に取り返される
    if (o.prog > floor) {
      o.prog = Math.max(floor, o.prog - v);
      if (o.owner === 'p' && o.prog <= 0) { o.owner = null; say(S, '🚩 陣地' + o.label + 'を奪われた', 'bad'); }
      if (o.enemyOrig && o.prog <= -1) o.owner = 'e';
    }
  }
}

// ---------- 1ステップ ----------
function pickPath(S, sp) {
  const n = S.paths.length, pi = sp.path === '*' ? (sp.k++ % n) : sp.path;
  const eb = S.ebases.find(b => b.path === pi);
  if (eb && eb.dead && !ENEMIES[sp.type].rebuild) { // 壊した敵拠点の経路：出現が減る（bases ステージでは止まる）
    const rate = S.st.goal === 'bases' ? 0 : CFG.deadSpawnRate;
    if (Math.random() >= rate) return -1;
  }
  return pi;
}
function step(S, dt) {
  if (S.over) return;
  S.t += dt; S.warnT -= dt; S.baseWarnT -= dt;
  const W = S.waves;
  while (S.waveIdx < W.length && W[S.waveIdx][0] <= S.t) {
    const [, type, n, gap, path] = W[S.waveIdx++];
    S.spawners.push({ type, n, gap, next: 0, path: path === undefined ? 0 : path, k: S.waveIdx });
  }
  for (const sp of S.spawners) {
    sp.next -= dt;
    while (sp.next <= 0 && sp.n > 0) { const pi = pickPath(S, sp); if (pi >= 0) spawnEnemy(S, sp.type, pi, 0); sp.n--; sp.next += sp.gap; if (sp.gap <= 0) sp.next = 0; }
  }
  S.spawners = S.spawners.filter(s => s.n > 0);
  // 建造：完成していない予約を先頭からライン数ぶん同時に進める。完成したものは出撃枠が空き次第すぐ出撃
  let busy = 0;
  for (const q of S.queue) { if (q.prog >= q.time) continue; if (busy++ >= S.lines) break; q.prog = Math.min(q.time, q.prog + dt); }
  for (let i = 0; i < S.queue.length; i++) {
    const q = S.queue[i];
    if (q.prog < q.time) continue;
    if (q.work) { S.queue.splice(i--, 1); finishWork(S, q.work); continue; }
    if (S.robots.length >= CFG.deployCap) { if (!q.waitSaid) { q.waitSaid = true; say(S, '🔧 ' + q.body.name + ' 完成。出撃枠が空き次第すぐ出撃'); } continue; }
    S.queue.splice(i--, 1); makeRobot(S, q);
  }
  for (const r of S.robots) if (!r.dead) updRobot(S, r, dt);
  for (let i = 0; i < S.enemies.length; i++) { const e = S.enemies[i]; if (!e.dead) updEnemy(S, e, dt); }
  for (const b of S.ebases) if (!b.dead) updEbase(S, b, dt);
  for (const o of S.outposts) updOutpost(S, o, dt);
  updHomeGun(S, dt);
  updShots(S, dt);
  S.robots = S.robots.filter(r => !r.dead);
  S.enemies = S.enemies.filter(e => !e.dead);
  S.shots = S.shots.filter(s => !s.dead);
  const g = S.st.goal;
  if (S.baseHP <= 0) { S.baseHP = 0; S.over = 'lose'; }
  else if (g === 'points' && S.pts >= S.st.goalPts) S.over = 'win';
  else if (g === 'bases' && S.ebases.every(b => b.dead)) S.over = 'win';
  else if (S.t >= S.st.time) { S.t = S.st.time; S.over = g === 'time' ? 'win' : 'lose'; }
}
function goalText(st) {
  if (st.goal === 'points') return '所持ポイントを ⭐' + st.goalPts + ' まで貯める（制限 ' + Math.floor(st.time / 60) + ':' + String(st.time % 60).padStart(2, '0') + '）';
  if (st.goal === 'bases') return '敵拠点 ' + st.ebases.length + ' つをすべて破壊（制限 ' + Math.floor(st.time / 60) + ':' + String(st.time % 60).padStart(2, '0') + '）';
  return Math.floor(st.time / 60) + ':' + String(st.time % 60).padStart(2, '0') + ' 拠点を守り抜く';
}

return { WORKS, workCost, workCheck, orderWork, queueCount, CFG, TIER, PLUS, BODIES, WEAPONS, ENEMIES, STAGES, UNLOCKS, checkUnlocks, pathPos, dirName, newState, step, buildCost, buildCheck, orderBuild, buyLine, moveRobot, activeCount, goalText };
})();
/*SIM-END*/
