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
  pilot: { rate: 1.5, dmg: 1.2, range: 1.2, lockHoming: 1.6 }, // 自操作中の強化（連射・威力・射程）と、ロック対象への弾のわずかな追尾
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
  missile: { evo: true, base: 'homing', name: 'ミサイル', icon: '🚀', cost: 60, build: 5, type: 'gun', range: 8, dmg: 55, cd: 2.6, speed: 9, pellets: 1, fan: 0, blast: 2.6, cluster: true, desc: '敵が一番固まっている所を狙い、着弾で爆発。弾が遅く速い敵に弱い。装甲・盾を無視。爆風は味方も巻き込む' },
  laser: { name: 'レーザー', icon: '🔦', cost: 70, build: 5, type: 'beam', range: 10, dps: 15, width: .4, ffMul: 1.5, noBase: true, desc: '前方へビームを照射し続ける。直線上をすべて貫き、装甲・盾を無視。直線上の味方には1.5倍で当たる。敵拠点は自動では狙わない' },
  // ---- 進化パーツ（INFINITE SHOT 3D II の進化形）。アンロックして、出撃前の持ち込み枠に入れたものだけ使える ----
  // 全作戦クリア後に解禁する試作兵器：戦場全体へ衝撃波。誤射のルールはそのまま（自機以外の味方ロボットと拠点も巻き込む）
  nova: { special: true, name: '試作型ノヴァ', icon: '☄️', cost: 420, build: 18, type: 'nova', cd: 16, dmg: 160, ffMul: .5, homeDmg: 25, desc: '約16秒ごとに戦場全体へ衝撃波。すべての敵と敵拠点に大ダメージ。自機以外の味方ロボットと拠点も巻き込む。発動3秒前に警告' },
  magnum: { evo: true, base: 'blaster', name: 'マグナム', icon: '🔷', cost: 30, build: 2, type: 'gun', range: 6.5, dmg: 24, cd: .5, speed: 24, pellets: 1, fan: 0, pierce: 1, noArmor: true, size: .24, desc: '大きな弾で威力2倍以上。装甲を貫き2体まで貫通' },
  chain: { evo: true, base: 'blaster', name: 'チェイン', icon: '⚡', cost: 30, build: 2, type: 'gun', range: 6, dmg: 10, cd: .4, speed: 22, pellets: 1, fan: 0, chain: { n: 3, mul: .55, range: 3.2 }, desc: '命中すると近くの敵3体へ電撃が連鎖する（威力55%）。群体に強い' },
  flare: { evo: true, base: 'spread', name: 'フレア', icon: '🔥', cost: 45, build: 3, type: 'gun', range: 4.5, dmg: 14, cd: .9, speed: 16, pellets: 5, fan: .8, pierce: 1, splash: { r: 1.3, mul: .6 }, desc: '扇状の弾が命中すると炸裂し、周りも巻き込む。炸裂は味方にも当たる' },
  prism: { evo: true, base: 'laser', name: 'プリズム', icon: '🌈', cost: 80, build: 5, type: 'beam', range: 9, dps: 10, width: .35, beams: 3, spread: .32, slow: true, ffMul: 1.5, noBase: true, desc: 'ビームが3本に分かれて広がる。当たった敵は遅くなる。味方には1.5倍' },
  buster: { evo: true, base: 'heavy', name: 'バスター', icon: '💥', cost: 65, build: 4, type: 'gun', range: 12, dmg: 80, cd: 2.4, speed: 22, pellets: 1, fan: 0, noArmor: true, size: .32, pick: 'tough', splash: { r: 2.4, mul: .6 }, desc: '狙撃弾が着弾で爆発し、周りも巻き込む。爆発は味方にも当たる' },
  swarmer: { evo: true, base: 'homing', name: 'スウォーム', icon: '🐝', cost: 35, build: 2, type: 'gun', range: 7, dmg: 7, cd: .8, speed: 8, pellets: 4, fan: 1.4, homing: 3.5, noShield: true, desc: '追尾弾が4発に増える。盾に防がれない' },
  pile: { evo: true, base: 'breaker', name: 'パイル', icon: '📌', cost: 40, build: 3, type: 'gun', range: 12, dmg: 150, cd: 3.4, speed: 30, pellets: 1, fan: 0, pierce: 1, noArmor: true, noShield: true, size: .22, pick: 'tough', desc: '遠くまで届く杭を撃ち込む。射程内で一番硬い敵を狙い、装甲も盾も貫く' },
  rush: { evo: true, base: 'blaster', name: 'ラッシュ', icon: '💨', cost: 30, build: 2, type: 'gun', range: 6, dmg: 10, cd: .4, speed: 22, pellets: 1, fan: 0, streak: { max: 6, rate: .1, reset: 5 }, desc: '続けて倒すほど連射が上がる（最大+60%。5秒倒さないと戻る）' },
  storm: { evo: true, base: 'spread', name: 'ストーム', icon: '🌪', cost: 45, build: 3, type: 'gun', range: 4.5, dmg: 13, cd: .9, speed: 16, pellets: 5, fan: .9, pierce: 2, streak: { max: 6, rate: .06, reset: 4, pellets: true }, desc: '倒すほど弾数と連射が増える（最大+3発・+36%。4秒倒さないと戻る）' },
  wall: { evo: true, base: 'spread', name: 'ウォール', icon: '🧱', cost: 40, build: 3, type: 'gun', range: 4.5, dmg: 16, cd: .9, speed: 16, pellets: 5, fan: .8, pierce: 3, cancel: 1, desc: '弾が敵の弾を1発ずつ打ち消す。威力+15%。射撃型や模倣機の弾から味方を守る' },
  jackpot: { evo: true, base: 'heavy', name: 'ジャックポット', icon: '🎰', cost: 60, build: 4, type: 'gun', range: 14, dmg: 99, cd: 2.4, speed: 26, pellets: 1, fan: 0, pierce: 3, noArmor: true, size: .3, pick: 'tough', jackpot: true, desc: '1発で2体目以降を倒すと、その敵のポイントが2倍。威力+10%、4体まで貫通' },
  bulwark: { evo: true, base: 'heavy', name: 'ブルワーク', icon: '🛡', cost: 60, build: 4, type: 'gun', range: 12, dmg: 85, cd: 2.2, speed: 24, pellets: 1, fan: 0, pierce: 2, noArmor: true, size: .34, pick: 'tough', cancel: 3, stun: 1, desc: '弾が敵の弾を3つまで打ち消す。当たった敵は1秒止まる' },
  hunter: { evo: true, base: 'homing', name: 'ハンター', icon: '🦅', cost: 30, build: 2, type: 'gun', range: 8, dmg: 12, cd: .8, speed: 9, pellets: 2, fan: .9, homing: 4, noShield: true, pick: 'danger', desc: '危険な敵（射撃・突進・回復・機雷・特攻・砲撃・模倣機）を優先して追う。威力+20%' },
  drain: { evo: true, base: 'breaker', name: 'ドレイン', icon: '🩸', cost: 25, build: 2, type: 'gun', range: 2.8, dmg: 22, cd: .7, speed: 14, pellets: 6, fan: .9, noArmor: true, noShield: true, drain: 6, desc: 'このロボットが敵を倒すたびにHPが6回復する。威力+10%' },
  parry: { evo: true, base: 'breaker', name: 'パリィ', icon: '🤺', cost: 30, build: 2, type: 'gun', range: 2.8, dmg: 20, cd: .7, speed: 14, pellets: 6, fan: .9, noArmor: true, noShield: true, parry: true, desc: '正面近くに来た敵の弾を弾き返し、1.5倍にして敵へ返す' },
  drill: { evo: true, base: 'laser', name: 'ドリル', icon: '🔩', cost: 75, build: 5, type: 'beam', range: 10, dps: 14, width: .4, ffMul: 1.5, noBase: true, drill: true, desc: '同じ敵に当て続けるほど威力が上がる（最大1.8倍）。硬い敵やボスに。直線上の味方には1.5倍' },
  sniper: { evo: true, base: 'laser', name: 'スナイパー', icon: '🔭', cost: 75, build: 5, type: 'beam', range: 13, dps: 13, width: .3, ffMul: 1.5, noBase: true, sniper: true, desc: '射程が長く、遠くの敵ほど威力が上がる（最大1.5倍）。直線上の味方には1.5倍' },
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
  // 第3章：模倣兵（ロボットを真似た小型機。ボスと同じく武器で撃つ）
  mimic: { name: '模倣兵', hp: 90, speed: 1.2, r: .6, pts: 30, baseDps: 2, weapons: ['spread'], hold: 4, fireMul: 1.8, mscale: 1.15, desc: 'ロボットを真似た小型機。散弾で撃ってくる' },
  mimicArt: { name: '模倣砲', hp: 120, speed: 1, r: .7, pts: 45, baseDps: 2, weapons: ['missile'], hold: 7.5, fireMul: 1.6, mscale: 1.35, desc: 'ミサイルを撃つ模倣機。固まったロボットを爆風でまとめて削る' },
  boss2: { name: '模倣機・改', hp: 1300, speed: .8, noRamp: true, r: 1.2, pts: 400, baseDps: 0, fireMul: 1.4, hold: 6.5, boss: true, weapons: ['heavy', 'missile', 'spread'], mscale: 2.5, desc: '改良された模倣機。狙撃・ミサイル・散弾を使い分ける' },
  // 第4章：深淵の敵
  wraith: { name: '深淵体', hp: 35, speed: 2.3, r: .45, pts: 10, baseDps: 1.5, phase: { on: 2, off: 1 }, desc: '時々姿が揺らぎ、その間は攻撃が当たらない' },
  warper: { name: '跳躍体', hp: 70, speed: 1.2, r: .55, pts: 25, baseDps: 2, warp: { every: 4, dist: 5 }, desc: '数秒ごとに経路の先へ跳ぶ' },
  aegis: { name: '障壁体', hp: 140, speed: 1, r: .7, pts: 40, baseDps: 2, aura: { range: 3.2 }, desc: '周りの敵が受けるダメージを半分にする。先に倒したい' },
  omega: { name: 'OMEGA原型', hp: 3600, speed: .45, noRamp: true, r: 2, pts: 2000, baseDps: 3, fireMul: 1.6, hold: 9, boss: true, final: true, weapons: ['heavy', 'missile', 'spread'], mscale: 3.6, desc: '侵略者が我々を学習して作った最終機。損傷が進むと形を変え、深淵の敵を呼ぶ' },
  // ボス：こちらのロボットと同じ「ボディ＋武器」で組まれた敵。体当たりはせず、射撃でロボットと拠点を攻撃する
  boss: { name: '模倣機', hp: 1000, speed: .9, noRamp: true, r: 1.1, pts: 300, baseDps: 0, fireMul: 1.6, hold: 5.5, boss: true, body: 'fortress', weapons: ['blaster', 'missile'], desc: 'こちらのロボットを模倣した赤い機体。ロボットや拠点が射程に入ると立ち止まって撃つ' },
};

// ステージ。自拠点は地図の中央（0,0）。敵は外周の敵拠点から中央へ向かう
// goal: time＝時間まで守る / points＝所持ポイントを目標まで貯める / bases＝敵拠点をすべて壊す
// 敵拠点：壊すと大量ポイント。その経路からの出現が減る（bases ステージでは止まる）
// waves: [出現開始秒, 種類, 数, 間隔秒, 経路番号（'*'は経路を順番に使う）]
const STAGES = [
  {
    id: 's1', name: '序章-1', sub: '起動', goal: 'points', goalPts: 260, time: 150, startPoints: 100, hpRamp: .4,
    brief: ['敵影、北西より接近。経路は一本。', '残存機材にて機体を組み、迎撃せよ。撃破した敵機より資源を回収する。'], win: '資源、目標量に到達。防衛機能、正常。',
    intro: '敵の経路は1本。ロボットを作って、経路の脇に置こう。倒した敵がポイントになる。',
    drawCount: { low: 3 },
    map: { minX: -11, maxX: 11, minZ: -17, maxZ: 15 }, base: { x: 0, z: 0 }, factory: { x: -2.6, z: -2.4 },
    paths: [[[-8, -15], [-8, -6], [6, -6], [6, 12], [-5, 12], [-5, 4], [0, 4], [0, 0]]],
    waves: [
      [2, 'normal', 3, 1.6], [12, 'normal', 5, 1.2], [24, 'normal', 6, 1], [38, 'normal', 8, .85], [52, 'normal', 9, .75],
      [66, 'normal', 10, .7], [80, 'normal', 12, .6], [96, 'normal', 13, .55], [112, 'normal', 15, .5], [128, 'normal', 16, .45],
    ],
  },
  {
    id: 's2', name: '序章-2', sub: '群れ', goal: 'points', goalPts: 340, time: 160, startPoints: 110, hpRamp: .4,
    brief: ['北西および南東より侵攻。', '小型の群体を確認。数が多い。広く撃てる武器が有効と推定。'], win: '群体、退けた。',
    intro: '敵が2方向から来る。小さな群体がまとめて押し寄せる。スプレッドのような範囲攻撃が効く。',
    drawCount: { low: 3, mid: 2 },
    map: { minX: -13, maxX: 13, minZ: -18, maxZ: 18 }, base: { x: 0, z: 0 }, factory: { x: 2.4, z: -2.2 },
    paths: [
      [[-11, -16], [-11, 4], [-5, 4], [-5, -4], [0, -4], [0, 0]],
      [[11, 16], [11, -4], [5, -4], [5, 4], [0, 4], [0, 0]],
    ],
    waves: [
      [2, 'normal', 3, 1.5, 0], [6, 'normal', 3, 1.5, 1], [16, 'normal', 6, 1, '*'], [26, 'swarm', 16, .2, 0], [36, 'normal', 8, .8, '*'],
      [46, 'swarm', 20, .18, 1], [56, 'normal', 10, .7, '*'], [66, 'swarm', 24, .15, '*'], [78, 'normal', 12, .6, '*'], [90, 'swarm', 30, .13, '*'],
      [102, 'normal', 14, .5, '*'], [114, 'swarm', 36, .12, '*'], [126, 'normal', 16, .45, '*'], [138, 'swarm', 40, .1, '*'],
    ],
  },
  {
    id: 's3', name: '序章-3', sub: '接続', goal: 'points', goalPts: 300, time: 190, startPoints: 120, hpRamp: .4,
    brief: ['機体数、不足。', '指揮官ユニットより機体への直接接続を許可する。射撃型を確認。距離を取って撃ってくる。'], win: '直接接続、良好。資源、目標量に到達。',
    intro: 'ロボットに「乗って」自分で戦えるようになる。乗ると連射・威力・射程が上がる。射撃型は立ち止まって撃ってくる。',
    drawCount: { low: 3, mid: 3 },
    map: { minX: -13, maxX: 13, minZ: -18.5, maxZ: 13 }, base: { x: 0, z: 0 }, factory: { x: 2.6, z: -2.6 },
    paths: [[[-11, -17.5], [-11, 10], [8, 10], [8, -10], [-5, -10], [-5, 4], [0, 4], [0, 0]]],
    waves: [
      [2, 'normal', 6, 1.1], [14, 'shooter', 2, 2.5], [22, 'normal', 12, .6], [32, 'swarm', 24, .15], [42, 'shooter', 2, 2],
      [50, 'normal', 14, .5], [62, 'swarm', 30, .13], [72, 'shooter', 3, 1.8], [82, 'normal', 18, .45], [94, 'swarm', 36, .12],
      [104, 'shooter', 3, 1.6], [114, 'normal', 20, .4], [126, 'swarm', 40, .1], [136, 'shooter', 4, 1.4], [148, 'normal', 24, .35], [165, 'normal', 20, .4],
    ],
  },
  {
    id: 's4', name: '序章-4', sub: '逆侵攻', goal: 'bases', time: 180, startPoints: 200, hpRamp: 1,
    brief: ['敵拠点三か所を特定。攻勢に転じる。', '敵拠点内部に高密度の反応あり。破壊せよ。突進型に注意。'], win: '敵拠点、全壊。内部の反応体を回収した。解析は後とする。',
    intro: '三方に敵拠点。すべて壊せば勝ち。壊した拠点からは敵が来なくなる。北と南東の拠点は砲台付き。突進型はロボットに体当たりする。',
    drawCount: { low: 2, mid: 3, high: 1 },
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
      [6, 'normal', 4, 1.3, 0], [7, 'normal', 4, 1.3, 1], [8, 'normal', 4, 1.3, 2], [16, 'shooter', 3, 2, '*'], [24, 'dasher', 3, 2, '*'], [32, 'swarm', 24, .15, '*'],
      [42, 'normal', 9, .7, '*'], [50, 'dasher', 4, 1.6, '*'], [58, 'shooter', 4, 1.6, '*'], [66, 'swarm', 30, .12, '*'], [76, 'normal', 12, .55, '*'],
      [86, 'dasher', 5, 1.3, '*'], [96, 'shooter', 5, 1.4, '*'], [106, 'swarm', 36, .1, '*'], [118, 'normal', 15, .45, '*'], [130, 'dasher', 6, 1.1, '*'],
      [142, 'shooter', 6, 1.2, '*'], [154, 'swarm', 40, .1, '*'], [166, 'normal', 18, .4, '*'],
    ],
  },
  {
    id: 's5', name: '序章-5', sub: '模倣', goal: 'boss', time: 210, startPoints: 220, hpRamp: .5, bossHp: 700,
    brief: ['三方向より侵攻。北方に大型反応。', '照合中。……我が方の機体と構造が一致する。これを撃破せよ。'], win: '大型機、撃破。侵略者は、我々を学習している。我々も学習する。使用兵装の改良型、試作に着手。',
    intro: '40秒ごろ、こちらのロボットを真似た模倣機が北から来る。倒せば勝ち。乗って戦えば強い。この作戦から、使った武器でクリアするとその進化パーツが解禁される。',
    drawCount: { low: 2, mid: 3, high: 2 },
    map: { minX: -17, maxX: 17, minZ: -23, maxZ: 22 }, base: { x: 0, z: 0 }, factory: { x: 2.6, z: -2.8 },
    paths: [
      [[0, -22], [0, -15], [-9, -15], [-9, -6], [-2, -6], [-2, 0], [0, 0]],
      [[-16, 20], [-16, 7], [-7, 7], [-7, 12], [-3, 12], [-3, 3], [0, 3], [0, 0]],
      [[16, -12], [10, -12], [10, 8], [4, 8], [4, 0], [0, 0]],
    ],
    ebases: [
      { path: 1, hp: 600, pts: 120 },
      { path: 2, hp: 600, pts: 120, turret: { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } },
    ],
    waves: [
      [4, 'normal', 4, 1.2, 1], [6, 'normal', 4, 1.2, 2], [14, 'shooter', 3, 2, '*'], [22, 'swarm', 24, .15, '*'], [30, 'dasher', 4, 1.5, '*'],
      [40, 'boss', 1, 0, 0], [46, 'normal', 10, .6, '*'], [56, 'swarm', 30, .12, '*'], [66, 'shooter', 5, 1.4, '*'], [76, 'dasher', 5, 1.3, '*'],
      [88, 'normal', 14, .5, '*'], [100, 'swarm', 36, .1, '*'], [112, 'shooter', 6, 1.2, '*'], [124, 'dasher', 6, 1.1, '*'], [138, 'normal', 18, .4, '*'],
      [152, 'swarm', 40, .1, '*'], [166, 'shooter', 8, 1, '*'], [180, 'normal', 20, .35, '*'],
    ],
  },
];
// ---------- 本編（地図移動が前提の広いステージ） ----------
STAGES.push({
  id: 'w1', name: '1-1', sub: '四方の前線', brief: ['包囲網、四方に展開。戦域、拡大。', '陣地を確保し、出撃地点とせよ。装甲型と盾持ちを確認。'], win: '資源、目標量に到達。前線、維持。', goal: 'points', goalPts: 600, time: 240, startPoints: 300, hpRamp: .6, wide: true,
  intro: '広い戦場。四方の敵拠点から長い経路で押し寄せる。青い陣地は出撃地点に選べる。装甲型は弱い弾を減らし、盾持ちは正面の弾を防ぐ。100秒で模倣機。',
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
    [3, 'normal', 4, 1.4, 0], [8, 'normal', 4, 1.4, 2], [14, 'normal', 4, 1.4, 1], [19, 'normal', 4, 1.4, 3], [26, 'shooter', 4, 2, '*'], [34, 'swarm', 40, .1, '*'],
    [42, 'armor', 4, 2.2, '*'], [50, 'dasher', 4, 1.5, '*'], [58, 'normal', 16, .5, '*'], [66, 'shield', 4, 1.6, '*'], [76, 'swarm', 50, .08, '*'], [86, 'shooter', 6, 1.2, '*'],
    [100, 'boss', 1, 0, 0], [106, 'armor', 6, 1.6, '*'], [116, 'normal', 24, .35, '*'], [128, 'shield', 6, 1.2, '*'], [140, 'swarm', 60, .07, '*'], [152, 'dasher', 8, .9, '*'],
    [164, 'normal', 28, .3, '*'], [176, 'armor', 6, 1.2, '*'], [188, 'shooter', 8, 1, '*'], [200, 'swarm', 70, .06, '*'], [212, 'shield', 8, 1, '*'], [224, 'normal', 30, .3, '*'],
  ],
});
STAGES.push({
  id: 'w2', name: '1-2', sub: '大群', brief: ['敵、物量戦に移行。推定、千体以上。', '範囲兵器の使用を許可する。友軍の損耗は許容範囲内とする。殲滅せよ。'], win: '大群、殲滅。損耗率、許容範囲内。', goal: 'clear', time: 170, startPoints: 300, hpRamp: .5, wide: true,
  intro: '約1000体が押し寄せる。すべて倒せば勝ち。特攻型はロボットに突っ込んで自爆し、分裂型は倒すと3体に分かれる。範囲攻撃で一網打尽にせよ。',
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
    [2, 'swarm', 30, .15, 0], [4, 'swarm', 30, .15, 1], [6, 'swarm', 30, .15, 2], [14, 'swarm', 45, .12, '*'], [20, 'kamikaze', 8, .3, '*'], [24, 'swarm', 60, .1, '*'],
    [30, 'splitter', 6, 1, '*'], [32, 'shooter', 6, 1, '*'], [38, 'swarm', 60, .1, '*'], [44, 'kamikaze', 15, .15, '*'], [50, 'swarm', 70, .08, '*'], [55, 'splitter', 8, .8, '*'],
    [60, 'armor', 6, 1.5, '*'], [64, 'swarmFast', 80, .07, '*'], [70, 'kamikaze', 12, .2, '*'], [74, 'armor', 4, 1.5, '*'], [78, 'swarm', 90, .06, '*'], [84, 'shooter', 6, 1, '*'],
    [88, 'splitter', 8, .8, '*'], [90, 'swarm', 100, .05, '*'], [96, 'kamikaze', 20, .12, '*'], [100, 'swarmHeavy', 60, .06, '*'], [108, 'swarm', 100, .05, '*'],
  ],
});
(() => {
  // 本編3：経路8本の包囲。経路は自拠点を中心に45度ずつ。少し曲げて互い違いにする
  const P = (r, a) => [Math.round(Math.sin(a) * r * 10) / 10, Math.round(-Math.cos(a) * r * 10) / 10];
  const paths = [];
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; paths.push([P(30, a), P(22, a), P(22, a + .18), P(13, a + .18), P(13, a - .1), P(6, a - .1), P(3, a), [0, 0]]); }
  const waves = [], kinds = ['swarm', 'swarmFast', 'swarm', 'swarmHeavy', 'swarmBomb', 'swarm', 'swarmFly'];
  for (let k = 0, t = 3; t <= 140; t += 7, k++) waves.push([t, kinds[k % kinds.length], Math.round(40 + t * .5), .04, '*']);
  waves.push([40, 'splitter', 8, .6, '*'], [80, 'splitter', 8, .6, '*'], [120, 'armor', 8, .8, '*'], [60, 'flyer', 10, .4, '*'], [110, 'flyer', 14, .3, '*'],
    [90, 'boss', 1, 0, 0], [100, 'shield', 8, .8, '*'], [30, 'shooter', 8, .8, '*'], [75, 'armor', 6, 1, '*'], [95, 'kamikaze', 24, .1, '*']);
  STAGES.push({
    id: 'w3', name: '1-3', sub: '包囲', brief: ['八方より侵攻。完全包囲。', '長距離中継器を再起動する。完了まで二分半。持ちこたえよ。'], win: '中継器、再起動。北端に指揮拠点の反応を捕捉。', holdWhy: '中継器の再起動まで拠点を守る', goal: 'time', time: 150, startPoints: 400, hpRamp: .6, wide: true,
    intro: '八方から2分半で1500体以上。飛行型・飛行群体は経路を無視して拠点へ飛んでくる。自爆群体はロボットのそばで弾ける。陣地は経路のすぐ脇で、奪い合いになる。90秒で模倣機。',
    map: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 }, base: { x: 0, z: 0 }, factory: { x: 1.7, z: -3.6 },
    view: { zoom: 2.2 },
    outposts: [0, 1, 2, 3].map(k => P(11, Math.PI / 8 + k * Math.PI / 2).concat(['ABCD'[k], 'p'])),
    paths,
    ebases: paths.map((_, i) => ({ path: i, hp: 500, pts: 120, turret: i % 2 ? null : { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } })),
    waves,
  });
})();

// 1-4 突破：縦長の戦場。北端の指揮拠点（硬い・砲台付き）と左右の拠点を壊す。陣地を北へ伝って攻め上がる
STAGES.push({
  id: 'w4', name: '1-4', sub: '突破', goal: 'bases', time: 210, startPoints: 350, hpRamp: .8, wide: true,
  brief: ['包囲網の北端に指揮拠点を確認。', '陣地を伝って北上し、これを破壊せよ。突破口を開く。'], win: '指揮拠点、破壊。包囲網に穴が開いた。反攻に移る。',
  intro: '縦に長い戦場。北端の指揮拠点はとても硬く、砲台付き。左右の拠点も壊せば勝ち。北へ進むほど陣地は敵の手にある。回復ドローンは周りの敵を治し、機雷は近づくと爆発する。',
  map: { minX: -26, maxX: 26, minZ: -40, maxZ: 32 }, base: { x: 0, z: 26 }, factory: { x: 2.5, z: 23.5 },
  view: { zoom: 2.4 },
  outposts: [[-8, 12, 'A', 'p'], [10, 10, 'B', 'p'], [0, -4, 'C'], [-14, -16, 'D', 'e'], [14, -16, 'E', 'e'], [8, -30, 'F', 'e']],
  garrison: ['shooter', 'shooter', 'armor', 'shield', 'normal', 'normal'],
  paths: [
    [[0, -36], [0, -24], [-8, -24], [-8, -10], [6, -10], [6, 6], [-2, 6], [-2, 16], [0, 16], [0, 26]],
    [[-22, -20], [-22, 0], [-14, 0], [-14, 18], [-6, 18], [-6, 24], [0, 26]],
    [[22, -20], [22, 2], [14, 2], [14, 20], [6, 20], [6, 24], [0, 26]],
  ],
  ebases: [
    { path: 0, hp: 1500, pts: 400, turret: { range: 7, dmg: 11, cd: .9, shotSpeed: 11 } },
    { path: 1, hp: 700, pts: 160, turret: { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 } },
    { path: 2, hp: 700, pts: 160 },
  ],
  waves: [
    [3, 'normal', 4, 1.2, '*'], [10, 'shooter', 3, 1.8, '*'], [16, 'swarm', 30, .12, '*'], [24, 'dasher', 4, 1.4, '*'], [30, 'shield', 4, 1.5, '*'],
    [38, 'kamikaze', 10, .25, 0], [44, 'armor', 4, 2, '*'], [50, 'swarmFast', 40, .08, '*'], [56, 'splitter', 5, 1.2, '*'], [62, 'healer', 2, 4, '*'],
    [68, 'flyer', 6, .8, '*'], [74, 'normal', 18, .4, '*'], [80, 'healer', 2, 3, '*'], [86, 'mine', 6, 1, '*'], [92, 'swarm', 50, .08, '*'],
    [100, 'shooter', 6, 1, '*'], [110, 'boss', 1, 0, 0], [116, 'shield', 6, 1.2, '*'], [124, 'swarmHeavy', 40, .08, '*'], [132, 'kamikaze', 14, .2, '*'],
    [140, 'armor', 6, 1.4, '*'], [148, 'swarmBomb', 30, .1, '*'], [156, 'shooter', 8, 1, '*'], [164, 'swarmFly', 30, .12, '*'], [172, 'normal', 30, .3, '*'],
    [180, 'healer', 2, 3, '*'], [186, 'dasher', 8, .8, '*'], [194, 'swarm', 70, .06, '*'], [200, 'armor', 8, 1, '*'],
  ],
});
// ---------- 第2〜4章 ----------
// 出現表をまとめて作る：[種類, 開始秒, 終了秒, 間隔秒, 数, 出現間隔, 経路]。後半ほど数が少し増える
function waveGen(list) {
  const out = [];
  for (const [type, t0, t1, every, n, gap, path] of list) {
    for (let t = t0; t <= t1; t += every) out.push([t, type, Math.max(1, Math.round(n * (1 + .6 * (t - t0) / Math.max(1, t1 - t0)))), gap, path === undefined ? '*' : path]);
  }
  return out;
}
// 中央の拠点へ放射状に伸びる経路（途中で2回曲がる）
function radialPaths(n, R, rot, bend) {
  const P = (r, a) => [Math.round(Math.sin(a) * r * 10) / 10, Math.round(-Math.cos(a) * r * 10) / 10];
  const out = [];
  for (let i = 0; i < n; i++) { const a = rot + i * Math.PI * 2 / n; out.push([P(R, a), P(R * .72, a), P(R * .72, a + bend), P(R * .42, a + bend), P(R * .42, a - bend * .6), P(R * .18, a - bend * .6), P(3, a), [0, 0]]); }
  return out;
}
const TUR = { range: 6.5, dmg: 9, cd: 1.1, shotSpeed: 10 };
(() => {
  // ===== 第2章 反攻 =====
  STAGES.push({
    id: 'a1', name: '2-1', sub: '回収', goal: 'points', goalPts: 900, time: 240, startPoints: 320, hpRamp: .6, wide: true,
    brief: ['敵拠点群より、コア反応を多数確認。', '輸送艦を確認。群体を降ろし続ける。優先して撃破せよ。資源を回収し、反攻の準備を整える。'], win: '資源、確保。反攻準備、完了。',
    intro: '輸送艦は経路を進みながら群体を降ろし続ける。硬いので狙撃やミサイルで早めに落としたい。',
    map: { minX: -26, maxX: 26, minZ: -30, maxZ: 30 }, base: { x: 0, z: 0 }, factory: { x: 2.5, z: -2.5 }, view: { zoom: 2.1 },
    outposts: [[-8, -3, 'A', 'p'], [8, -6, 'B', 'p'], [0, 12, 'C'], [-18, -16, 'D', 'e'], [18, 20, 'E', 'e']],
    garrison: ['shooter', 'shooter', 'armor', 'normal', 'normal'],
    paths: [
      [[0, -28], [0, -18], [-12, -18], [-12, -8], [-3, -8], [-3, -2], [0, 0]],
      [[24, 26], [24, 12], [10, 12], [10, 4], [3, 4], [0, 0]],
      [[-24, 26], [-24, 14], [-14, 14], [-14, 5], [-4, 5], [0, 0]],
    ],
    ebases: [{ path: 0, hp: 800, pts: 180, turret: TUR }, { path: 1, hp: 700, pts: 150 }, { path: 2, hp: 700, pts: 150 }],
    waves: waveGen([
      ['normal', 3, 220, 18, 10, .5], ['shooter', 12, 220, 26, 3, 1.4], ['swarm', 20, 220, 22, 30, .1], ['armor', 40, 220, 34, 3, 1.6],
      ['carrier', 30, 200, 45, 1, 0], ['kamikaze', 50, 220, 40, 8, .25], ['shield', 70, 220, 38, 4, 1.2], ['dasher', 90, 220, 30, 4, 1.2],
    ]),
  });
  STAGES.push({
    id: 'a2', name: '2-2', sub: '補給路', goal: 'escort', time: 260, startPoints: 340, hpRamp: .6, wide: true,
    brief: ['北の前線陣地へ、解析用のコアを輸送する。', '補給車を護衛せよ。砲撃型を確認。遠くから拠点を撃ってくる。'], win: '補給車、到着。コアの解析に着手する。',
    intro: '補給車は点線の道を北へ進む。敵が近くにいると止まって攻撃を受ける。道を空けてやろう。砲撃型は遠くで止まって拠点を砲撃する。',
    map: { minX: -24, maxX: 24, minZ: -36, maxZ: 30 }, base: { x: 0, z: 26 }, factory: { x: 2.5, z: 23.5 }, view: { zoom: 2.2 },
    convoy: { path: [[0, 22], [0, 14], [-8, 14], [-8, 0], [6, 0], [6, -14], [0, -14], [0, -31]], hp: 500, speed: .6 },
    outposts: [[-14, 20, 'A', 'p'], [12, 16, 'B', 'p'], [14, -6, 'C'], [-14, -18, 'D', 'e']],
    garrison: ['shooter', 'shooter', 'armor', 'normal'],
    paths: [
      [[-22, -30], [-22, -6], [-12, -6], [-12, 8], [-4, 8], [-4, 20], [0, 26]],
      [[22, -34], [22, -20], [12, -20], [12, 6], [2, 6], [2, 18], [0, 26]],
      [[20, 28], [20, 22], [8, 22], [8, 26], [0, 26]],
    ],
    ebases: [{ path: 0, hp: 750, pts: 160, turret: TUR }, { path: 1, hp: 750, pts: 160 }],
    waves: waveGen([
      ['normal', 3, 240, 16, 8, .55], ['shooter', 14, 240, 28, 3, 1.4], ['swarm', 24, 240, 24, 26, .12], ['armor', 44, 240, 36, 3, 1.6],
      ['artillery', 60, 220, 55, 1, 0], ['dasher', 30, 240, 32, 4, 1.2], ['kamikaze', 70, 240, 44, 8, .25], ['carrier', 100, 220, 70, 1, 0],
    ]),
  });
  (() => {
    const paths = radialPaths(4, 30, Math.PI / 4, .3);
    STAGES.push({
      id: 'a3', name: '2-3', sub: '解析', goal: 'time', time: 180, holdWhy: 'コアの解析完了まで拠点を守る', startPoints: 420, hpRamp: .5, wide: true,
      brief: ['コアの解析を開始。完了まで三分。', '解析中は基地の処理能力が落ちる。持ちこたえよ。工兵を確認。壊した敵拠点を再建する。'], win: '解析、完了。コアは、侵略者の学習器官と推定。',
      intro: '時間まで拠点を守れば勝ち。工兵は壊された敵拠点を建て直す。再建されると、その方面の敵がまた増える。',
      map: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 }, base: { x: 0, z: 0 }, factory: { x: 2, z: -3.4 }, view: { zoom: 2.3 },
      outposts: [0, 1, 2, 3].map(k => [Math.round(Math.sin(k * Math.PI / 2) * 11), Math.round(-Math.cos(k * Math.PI / 2) * 11), 'ABCD'[k], 'p']),
      paths,
      ebases: paths.map((_, i) => ({ path: i, hp: 600, pts: 140, turret: i % 2 ? null : TUR })),
      waves: waveGen([
        ['normal', 3, 170, 16, 7, .5], ['swarm', 10, 170, 20, 28, .09], ['shooter', 16, 170, 28, 3, 1.3], ['engineer', 50, 160, 40, 2, 3],
        ['carrier', 50, 150, 60, 1, 0], ['artillery', 90, 160, 80, 1, 0], ['splitter', 30, 170, 34, 4, .9], ['shield', 60, 170, 34, 3, 1.1], ['flyer', 100, 170, 34, 5, .5],
      ]),
    });
  })();
  STAGES.push({
    id: 'a4', name: '2-4', sub: '楔', goal: 'boss', bossName: '模倣機・改', time: 240, startPoints: 380, hpRamp: .6, wide: true,
    brief: ['敵前線に大型反応。照合……模倣機の改良型。', '侵略者の学習速度、想定以上。これを撃破し、反攻の楔とする。'], win: '改良型、撃破。だが、敵の学習は止まらない。',
    intro: '60秒ごろ、改良された模倣機が北から来る。狙撃・ミサイル・散弾を使い分ける。倒せば勝ち。',
    map: { minX: -24, maxX: 24, minZ: -38, maxZ: 26 }, base: { x: 0, z: 20 }, factory: { x: 2.5, z: 17.5 }, view: { zoom: 2.3 },
    outposts: [[-9, 8, 'A', 'p'], [9, 8, 'B', 'p'], [0, -8, 'C'], [-14, -22, 'D', 'e'], [14, -22, 'E', 'e']],
    garrison: ['shooter', 'shooter', 'shield', 'armor'],
    paths: [
      [[0, -36], [0, -26], [-6, -26], [-6, -14], [6, -14], [6, 0], [-3, 0], [-3, 12], [0, 20]],
      [[-22, -30], [-22, -6], [-14, -6], [-14, 14], [-5, 14], [0, 20]],
      [[22, -30], [22, -6], [14, -6], [14, 14], [5, 14], [0, 20]],
    ],
    ebases: [{ path: 1, hp: 700, pts: 160, turret: TUR }, { path: 2, hp: 700, pts: 160, turret: TUR }],
    waves: [[60, 'boss2', 1, 0, 0]].concat(waveGen([
      ['normal', 3, 230, 16, 9, .5], ['shooter', 12, 230, 24, 4, 1.2], ['swarm', 20, 230, 22, 34, .1], ['armor', 40, 230, 34, 4, 1.4],
      ['dasher', 30, 230, 30, 5, 1], ['artillery', 80, 220, 60, 1, 0], ['engineer', 100, 220, 50, 2, 3], ['healer', 70, 230, 40, 2, 3], ['carrier', 120, 200, 60, 1, 0],
    ])),
  });
  // ===== 第3章 模倣 =====
  STAGES.push({
    id: 'm1', name: '3-1', sub: '写し身', goal: 'points', goalPts: 800, time: 240, startPoints: 360, hpRamp: .6, wide: true,
    brief: ['敵、小型の模倣機を量産。我が方の兵装を使用している。', '模倣兵と呼称する。散弾を撃つ。距離を取って対処せよ。'], win: '資源、確保。模倣兵の構造を記録した。',
    intro: '模倣兵はロボットを真似た小型機で、散弾で撃ってくる。射程の外から削るか、乗って一気に倒そう。',
    map: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 }, base: { x: 0, z: 0 }, factory: { x: 2.5, z: -2.5 }, view: { zoom: 2.2 },
    outposts: [[-9, -4, 'A', 'p'], [9, 5, 'B', 'p'], [-14, 14, 'C'], [16, -16, 'D', 'e']],
    garrison: ['mimic', 'mimic', 'shooter', 'armor'],
    paths: radialPaths(3, 30, Math.PI / 6, .35),
    ebases: [{ path: 0, hp: 800, pts: 170, turret: TUR }, { path: 1, hp: 800, pts: 170 }, { path: 2, hp: 800, pts: 170 }],
    waves: waveGen([
      ['normal', 3, 230, 16, 10, .45], ['mimic', 20, 230, 26, 3, 1.4], ['swarm', 14, 230, 20, 36, .09], ['shooter', 30, 230, 30, 4, 1.2],
      ['armor', 50, 230, 36, 4, 1.3], ['kamikaze', 60, 230, 40, 10, .2], ['flyer', 80, 230, 36, 6, .5], ['carrier', 70, 200, 60, 1, 0],
    ]),
  });
  STAGES.push({
    id: 'm2', name: '3-2', sub: '砲列', goal: 'bases', time: 240, startPoints: 400, hpRamp: .6, wide: true,
    brief: ['敵、ミサイル装備の模倣機を配備。', '模倣砲と呼称する。爆風で密集した機体をまとめて狙う。散開して敵拠点を叩け。'], win: '砲列、沈黙。敵拠点、全壊。',
    intro: '敵拠点3つをすべて壊せば勝ち。模倣砲はミサイルを撃つ。ロボットを固めて置くと、まとめてやられる。',
    map: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, base: { x: 0, z: 0 }, factory: { x: 2.5, z: -2.5 }, view: { zoom: 2.2 },
    outposts: [[-8, 8, 'A', 'p'], [8, 8, 'B', 'p'], [0, -12, 'C'], [-18, -14, 'D', 'e'], [18, -14, 'E', 'e']],
    garrison: ['mimicArt', 'mimic', 'shooter', 'armor'],
    paths: radialPaths(3, 28, 0, .4),
    ebases: [{ path: 0, hp: 800, pts: 200, turret: TUR }, { path: 1, hp: 700, pts: 180, turret: TUR }, { path: 2, hp: 700, pts: 180 }],
    waves: waveGen([
      ['normal', 3, 230, 16, 8, .5], ['mimicArt', 40, 230, 46, 1, 0], ['mimic', 16, 230, 28, 3, 1.3], ['swarm', 20, 230, 22, 34, .1],
      ['shield', 40, 230, 32, 4, 1.2], ['healer', 60, 230, 44, 2, 3], ['engineer', 90, 220, 50, 2, 3], ['splitter', 50, 230, 34, 5, .9],
    ]),
  });
  STAGES.push({
    id: 'm3', name: '3-3', sub: '双子', goal: 'boss', bossCount: 2, bossName: '模倣機', time: 270, startPoints: 420, hpRamp: .6, wide: true,
    brief: ['大型反応、二。模倣機と、その改良型。', '同時に相手取るのは危険。片方ずつ、確実に撃破せよ。'], win: '二機、撃破。損耗率、許容範囲内。',
    intro: '40秒に模倣機、100秒に模倣機・改が別の方向から来る。2機とも倒せば勝ち。',
    map: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, base: { x: 0, z: 0 }, factory: { x: 2.5, z: -2.5 }, view: { zoom: 2.2 },
    outposts: [[-10, 0, 'A', 'p'], [10, 0, 'B', 'p'], [0, 12, 'C', 'p'], [0, -16, 'D', 'e']],
    garrison: ['mimic', 'mimic', 'mimicArt', 'shooter'],
    paths: radialPaths(4, 28, 0, .3),
    ebases: [{ path: 1, hp: 800, pts: 170 }, { path: 3, hp: 800, pts: 170, turret: TUR }],
    waves: [[40, 'boss', 1, 0, 0], [100, 'boss2', 1, 0, 2]].concat(waveGen([
      ['normal', 3, 260, 18, 7, .5], ['mimic', 24, 260, 40, 2, 1.3], ['swarm', 12, 260, 22, 30, .09], ['mimicArt', 90, 260, 70, 1, 0],
      ['dasher', 30, 260, 36, 4, 1], ['kamikaze', 50, 260, 44, 8, .2], ['armor', 70, 260, 40, 3, 1.3],
    ])),
  });
  STAGES.push({
    id: 'm4', name: '3-4', sub: '工場', goal: 'clear', time: 230, startPoints: 420, hpRamp: .5, wide: true,
    brief: ['模倣機の生産拠点を特定。', '内部より大量に出撃中。すべて撃破せよ。一機も残すな。'], win: '生産拠点、沈黙。最後の通信を傍受。発信源は、地下深部。',
    intro: '押し寄せる敵をすべて倒せば勝ち。模倣兵と模倣砲が大量に混ざる。',
    map: { minX: -32, maxX: 32, minZ: -32, maxZ: 32 }, base: { x: 0, z: 0 }, factory: { x: 2, z: -3.4 }, view: { zoom: 2.3 },
    outposts: [0, 1, 2, 3].map(k => [Math.round(Math.sin(Math.PI / 4 + k * Math.PI / 2) * 11), Math.round(-Math.cos(Math.PI / 4 + k * Math.PI / 2) * 11), 'ABCD'[k], 'p']),
    paths: radialPaths(4, 30, 0, .3),
    ebases: [0, 1, 2, 3].map(i => ({ path: i, hp: 700, pts: 150, turret: i % 2 ? TUR : null })),
    waves: waveGen([
      ['swarm', 2, 150, 10, 40, .06], ['mimic', 10, 150, 16, 4, 1], ['mimicArt', 30, 150, 30, 2, 1.5], ['normal', 5, 150, 14, 10, .4],
      ['swarmFast', 40, 150, 26, 40, .06], ['kamikaze', 25, 150, 30, 10, .2], ['armor', 50, 150, 30, 4, 1.2], ['swarmHeavy', 80, 150, 30, 30, .08],
    ]),
  });
  // ===== 第4章 深淵 =====
  STAGES.push({
    id: 'v1', name: '4-1', sub: '裂け目', goal: 'points', goalPts: 1100, time: 240, startPoints: 420, hpRamp: .6, wide: true,
    pathOpen: { 2: 70, 3: 140 },
    brief: ['地下深部より、未知の反応。地表に裂け目が開きつつある。', '深淵体と呼称する。時々、攻撃が通らない。新たな裂け目に備えよ。'], win: '資源、確保。裂け目の拡大、継続中。',
    intro: '途中で新しい裂け目（敵の出口）が開く。深淵体は姿が揺らいでいる間、攻撃が当たらない。',
    map: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, base: { x: 0, z: 0 }, factory: { x: 2.5, z: -2.5 }, view: { zoom: 2.2 },
    outposts: [[-9, -5, 'A', 'p'], [9, 5, 'B', 'p'], [-12, 14, 'C'], [14, -14, 'D']],
    paths: radialPaths(4, 28, Math.PI / 8, .35),
    waves: waveGen([
      ['normal', 3, 230, 14, 10, .45], ['wraith', 10, 230, 18, 6, .5], ['swarm', 16, 230, 20, 36, .09], ['mimic', 30, 230, 30, 3, 1.3],
      ['shooter', 24, 230, 28, 4, 1.2], ['armor', 50, 230, 34, 4, 1.3], ['wraith', 90, 230, 22, 10, .3], ['flyer', 70, 230, 36, 6, .5],
    ]),
  });
  STAGES.push({
    id: 'v2', name: '4-2', sub: '闇', goal: 'time', time: 180, holdWhy: '裂け目が閉じるまで拠点を守る', dark: 7.5, startPoints: 420, hpRamp: .7, wide: true,
    pathOpen: { 3: 60 },
    brief: ['裂け目より黒い霧。視界、著しく低下。', '敵は、ロボットと拠点の近くでしか視認できない。跳躍体を確認。経路を跳んで迫る。裂け目が閉じるまで持ちこたえよ。'], win: '裂け目、閉鎖。霧が晴れる。',
    intro: '暗い戦場。敵はロボット・拠点・陣地の近くでしか見えない。跳躍体は数秒ごとに経路の先へ跳ぶ。時間まで拠点を守れば勝ち。',
    map: { minX: -28, maxX: 28, minZ: -28, maxZ: 28 }, base: { x: 0, z: 0 }, factory: { x: 2.5, z: -2.5 }, view: { zoom: 2.2 },
    outposts: [[-10, 0, 'A', 'p'], [10, 0, 'B', 'p'], [0, 12, 'C', 'p'], [0, -12, 'D', 'p']],
    paths: radialPaths(4, 26, 0, .32),
    waves: waveGen([
      ['normal', 3, 170, 11, 14, .4], ['wraith', 8, 170, 14, 12, .35], ['warper', 20, 170, 20, 5, 1], ['swarm', 14, 170, 16, 50, .07], ['armor', 40, 170, 30, 4, 1.2],
      ['kamikaze', 30, 170, 26, 10, .2], ['mimic', 40, 170, 30, 3, 1.2], ['flyer', 50, 170, 30, 6, .5], ['swarmFly', 80, 170, 30, 30, .1],
    ]),
  });
  STAGES.push({
    id: 'v3', name: '4-3', sub: '障壁', goal: 'bases', time: 260, startPoints: 440, hpRamp: .6, wide: true,
    pathOpen: { 3: 90 },
    brief: ['裂け目の奥に、敵拠点を確認。', '障壁体を確認。周りの敵の損傷を半減させる。先に排除せよ。敵拠点を破壊し、深部への道を開く。'], win: '敵拠点、全壊。深部への進路、確保。',
    intro: '敵拠点3つをすべて壊せば勝ち。障壁体の周りの敵はダメージが半分になる。先に倒そう。90秒で新しい裂け目が開く。',
    map: { minX: -30, maxX: 30, minZ: -30, maxZ: 30 }, base: { x: 0, z: 0 }, factory: { x: 2.5, z: -2.5 }, view: { zoom: 2.2 },
    outposts: [[-9, 6, 'A', 'p'], [9, 6, 'B', 'p'], [0, -10, 'C'], [-16, -16, 'D', 'e'], [16, -16, 'E', 'e']],
    garrison: ['aegis', 'mimic', 'mimic', 'shooter'],
    paths: radialPaths(4, 28, Math.PI / 4, .3),
    ebases: [{ path: 0, hp: 1000, pts: 200, turret: TUR }, { path: 1, hp: 900, pts: 180, turret: TUR }, { path: 2, hp: 900, pts: 180 }],
    waves: waveGen([
      ['normal', 3, 250, 14, 10, .45], ['aegis', 20, 250, 30, 1, 0], ['wraith', 10, 250, 18, 8, .4], ['warper', 30, 250, 26, 3, 1.2],
      ['mimic', 24, 250, 28, 3, 1.2], ['mimicArt', 50, 250, 44, 1, 0], ['swarm', 14, 250, 20, 38, .08], ['healer', 60, 250, 40, 2, 3], ['armor', 40, 250, 34, 4, 1.3],
    ]),
  });
  STAGES.push({
    id: 'v4', name: '4-4', sub: 'OMEGA', goal: 'boss', bossName: 'OMEGA原型', time: 420, startPoints: 600, hpRamp: .5, wide: true, dark: 9,
    pathOpen: { 1: 100, 3: 200 },
    brief: ['深部より、最大級の反応。', '照合……我が方の全機体、全兵装の特徴を含む。侵略者は、これを「OMEGA」と呼んでいる。', '全機、出撃。これを止めよ。'],
    win: 'OMEGA原型、沈黙。……反応、消失せず。深淵へ、後退していく。',
    intro: '最終作戦。OMEGA原型は損傷が進むと形を変え、深淵の敵を呼ぶ。暗い戦場で、途中に裂け目も開く。倒せば作戦完了。',
    map: { minX: -32, maxX: 32, minZ: -36, maxZ: 32 }, base: { x: 0, z: 4 }, factory: { x: 2.5, z: 1.5 }, view: { zoom: 2.3 },
    outposts: [[-10, 8, 'A', 'p'], [10, 8, 'B', 'p'], [0, -8, 'C', 'p'], [-18, -14, 'D'], [18, -14, 'E']],
    paths: [
      [[0, -34], [0, -22], [-8, -22], [-8, -12], [4, -12], [4, -2], [0, -2], [0, 4]],
      [[-30, -20], [-20, -20], [-20, 0], [-10, 0], [-10, 6], [0, 4]],
      [[30, -20], [20, -20], [20, 0], [10, 0], [10, 6], [0, 4]],
      [[0, 30], [0, 20], [-8, 20], [-8, 12], [0, 12], [0, 4]],
    ],
    waves: [[30, 'omega', 1, 0, 0]].concat(waveGen([
      ['normal', 3, 400, 16, 7, .45], ['wraith', 10, 400, 20, 6, .4], ['swarm', 16, 400, 24, 30, .09], ['mimic', 30, 400, 40, 2, 1.3],
      ['warper', 40, 400, 28, 3, 1.2], ['aegis', 60, 400, 50, 1, 0], ['mimicArt', 80, 400, 50, 1, 0], ['kamikaze', 50, 400, 36, 10, .2], ['flyer', 90, 400, 40, 6, .5],
    ])),
  });
})();

// ---------- 段階的な解禁：その作戦から使える（それより後の作戦、またはその作戦をクリア済みなら使える） ----------
const FEATURES = {
  blaster: 's1', spread: 's1', heavy: 's2', homing: 's4', breaker: 'w1', bomb: 'w2', laser: 'w3',
  tier_low: 's1', tier_mid: 's2', tier_high: 's4', mass: 'w2', shieldbody: 'w3',
  pilot: 's3', evolve: 's5', slot3: 'm1', repair: 'w1', reserve: 'w1', line2: 'w2', turret: 'w3', shield: 'w3', loadout: 'w1',
};
// 解禁したときに見せる説明（武器・ボディ以外）
const FEATURE_INFO = {
  pilot: { icon: '🎮', name: '自操作', desc: 'ロボットに乗って自分で戦う。連射・威力・射程が上がるが、機体は動かず前しか見えない' },
  slot3: { icon: '🧬', name: '持ち込み枠 +1', desc: '進化パーツを3つまで持ち込める' },
  evolve: { icon: '🧬', name: '進化パーツの開発', desc: '使った武器でクリアすると、その武器の進化パーツが解禁される（持ち込みは第1章から）' },
  repair: { icon: '🔧', name: '拠点修理', desc: '建造画面の「拠点工事」で、拠点のHPを回復できる' },
  reserve: { icon: '📋', name: '予約', desc: '出撃中が上限でも作れる。誰かが倒れたら、すぐ出撃する' },
  line2: { icon: '🏗', name: '建造ライン2本目', desc: 'ポイントで開放すると、2機同時に建造できる' },
  turret: { icon: '🗼', name: '拠点砲台', desc: '拠点に簡易砲台を付けられる' },
  shield: { icon: '🛡', name: '拠点シールド', desc: '拠点に盾を張れる' },
  loadout: { icon: '🧬', name: '進化パーツの持ち込み', desc: '解禁した進化パーツを、出撃前に選んで持ち込める' },
  tier_mid: { icon: '🤖', name: '中ランクのボディ', desc: '配備されるボディに中ランクが混ざる' },
  tier_high: { icon: '🤖', name: '高ランクのボディ', desc: '配備されるボディに高ランクが混ざる' },
  mass: { icon: '🤖', name: '量産フレーム', desc: '武器の建造時間が短いボディが配備されるようになる' },
  shieldbody: { icon: '🤖', name: 'シールドフレーム', desc: 'シールド付きのボディが配備されるようになる' },
};
// その作戦で使えるもの。cleared(id) はクリア済みか、all は全解禁（試作用）
function allowFor(stId, cleared, all) {
  const order = CHAPTERS.flatMap(c => c.stages), idx = order.indexOf(stId), a = {};
  for (const f in FEATURES) a[f] = !!all || order.indexOf(FEATURES[f]) <= idx || (cleared ? !!cleared(FEATURES[f]) : false);
  a.nova = !!all || (cleared ? order.every(cleared) : false); // 全作戦クリア後
  return a;
}
const ALLOW_ALL = (() => { const a = { nova: true }; for (const f in FEATURES) a[f] = true; return a; })();
function bodyAllowed(S, b) { const A = S.allow; return A['tier_' + b.tier] && (FEATURES[b.id] ? A[b.id] : true); }

// ---------- 章（物語の区切り。作戦は順に並べる。分岐はしない） ----------
// 語り手は基地の管制AI「アイ」。硬い無線の調子で話す
const CHAPTERS = [
  { id: 'c0', no: '序章', title: '着任', stages: ['s1', 's2', 's3', 's4', 's5'],
    intro: ['指揮官ユニット、再起動を確認。', '前線基地は孤立状態。補給線、途絶。', '残存機材にて防衛を継続せよ。'],
    outro: ['敵大型機は、我が方の機体構造を模倣していた。', '侵略者は学習している。', '包囲網、拡大中。戦域を広げる。'] },
  { id: 'c1', no: '第1章', title: '四方の前線', stages: ['w1', 'w2', 'w3', 'w4'],
    intro: ['包囲網、四方に展開。', '敵拠点群を確認。戦域を拡大する。', '前線を維持し、突破口を開け。'],
    outro: ['包囲網、北端を突破。', '敵拠点より回収した反応体を「コア」と呼称する。', '解析を開始。反攻に移る。'] },
  { id: 'c2', no: '第2章', title: '反攻', stages: ['a1', 'a2', 'a3', 'a4'],
    intro: ['コアの解析に着手する。', '侵略者の拠点から、さらにコアを回収せよ。', '反攻を開始する。'],
    outro: ['コアは、侵略者の学習器官と判明。', '侵略者は、倒した相手を学び、写し取る。', '敵の生産拠点より、模倣機の量産を確認。'] },
  { id: 'c3', no: '第3章', title: '模倣', stages: ['m1', 'm2', 'm3', 'm4'],
    intro: ['敵、我が方の兵装を写した機体を量産。', '戦うほど、敵は我々に似ていく。', '生産拠点を叩け。'],
    outro: ['生産拠点、沈黙。', '傍受した通信の発信源は、地下深部。', '地表に、裂け目が開き始めている。'] },
  { id: 'c4', no: '第4章', title: '深淵', stages: ['v1', 'v2', 'v3', 'v4'],
    intro: ['裂け目の奥、深部より未知の反応。', '侵略者の中枢と推定。', '最終作戦に移行する。'],
    outro: ['OMEGA原型、深淵へ後退。追跡、不能。', '前線基地、防衛完了。', '……指揮官ユニット、任務継続を推奨する。'] },
];

// ---------- アンロック（ステージをまたいで残る。強化は持ち越さず、使えるパーツが増えるだけ） ----------
// 進化パーツ：進化元の武器を使って（その武器を積んだロボットを建造して）作戦をクリアすると解禁。序章-5から。
// 進化元が同じものが複数あるとき（ブラスター→マグナム・チェイン）は、クリアするたびに1つずつ解禁する
const UNLOCKS = Object.keys(WEAPONS).filter(k => WEAPONS[k].evo).map(id => ({ id, base: WEAPONS[id].base, cond: WEAPONS[WEAPONS[id].base].name + 'を使って作戦をクリア' }));
function checkUnlocks(S, save) {
  save.unlocked = save.unlocked || {}; save.swarmKills = (save.swarmKills || 0) + S.swarmKills;
  const got = [];
  if (S.over !== 'win' || !S.allow.evolve) return got;
  for (const base of S.usedBase) {
    const u = UNLOCKS.find(x => x.base === base && !save.unlocked[x.id]);
    if (u) { save.unlocked[u.id] = true; got.push(u.id); }
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
function drawBodies(dc, allow) {
  const out = [], ok = b => !allow || (allow['tier_' + b.tier] && (FEATURES[b.id] ? allow[b.id] : true));
  for (const tier in dc) out.push(...shuffle(BODIES.filter(b => b.tier === tier && ok(b))).slice(0, dc[tier]));
  if (!out.length) out.push(...shuffle(BODIES.filter(b => b.tier === 'low')).slice(0, 3));
  return out.sort((a, b) => a.cost - b.cost);
}
function newState(stageId, opt) {
  const S = newState0(stageId, opt);
  // 敵占領の陣地に守備隊を置く（その場から動かない）
  for (const o of S.outposts) if (o.owner === 'e') (S.st.garrison || []).forEach((type, k) => {
    const a = k / S.st.garrison.length * Math.PI * 2, def = ENEMIES[type];
    const e = { id: S.nid++, type, def, pi: 0, d: 0, off: 0, hp: def.hp * (S.st.hpMul || 1), maxHp: def.hp * (S.st.hpMul || 1), r: def.r, cd: rnd(.4, 1), x: o.x + Math.sin(a) * 1.4, z: o.z + Math.cos(a) * 1.4, face: 0, dead: false, flash: 0, firing: false, state: 'guard', armed: true };
    if (def.weapons) e.weapons = def.weapons.map(w => ({ id: w, def: WEAPONS[w], cd: rnd(.5, 1.5) }));
    S.enemies.push(e);
  });
  return S;
}
// 高難度（全作戦クリア後のやりこみ）：敵が多く・硬く・攻撃が重い。倒したときのポイントは少し多い。数値はおおまか
const HARD = { count: 1.25, hp: 1.5, dmg: 1.3, pts: 1.2, goal: 1.4, ebase: 1.5, boss: 1.6, start: 1.4 };
function hardStage(st) {
  return Object.assign({}, st, {
    hard: true, hpMul: HARD.hp, dmgMul: HARD.dmg, ptsMul: HARD.pts, startPoints: Math.round(st.startPoints * HARD.start),
    waves: st.waves.map(w => [w[0], w[1], w[1] === 'boss' ? w[2] : Math.ceil(w[2] * HARD.count), w[3] / HARD.count, w[4]]),
    goalPts: st.goalPts ? Math.round(st.goalPts * HARD.goal / 10) * 10 : st.goalPts,
    bossHp: (st.bossHp || ENEMIES.boss.hp) * HARD.boss / HARD.hp, // ボスは hpMul も掛かるので、合わせて HARD.boss 倍
    ebases: (st.ebases || []).map(b => Object.assign({}, b, { hp: Math.round(b.hp * HARD.ebase) })),
  });
}
function newState0(stageId, opt) {
  opt = opt || {};
  const st0 = STAGES.find(s => s.id === stageId) || STAGES[0], st = opt.hard ? hardStage(st0) : st0;
  return {
    st, paths: st.paths.map(makePath), waves: st.waves.slice().sort((a, b) => a[0] - b[0]), // 出現表は時刻順に並べ直して使う
    ebases: (st.ebases || []).map((b, i) => ({ id: 'eb' + i, x: st.paths[b.path][0][0], z: st.paths[b.path][0][1], ...b, maxHp: b.hp, cd: 1, dead: false, flash: 0, ebase: true, r: CFG.ebaseR })),
    home: { x: st.base.x, z: st.base.z, r: CFG.homeR, home: true },
    homeObj: { id: 'home', name: '拠点砲台', x: st.base.x, z: st.base.z, cd: 0, face: 0, ptsMul: 1 }, homeGun: 0, homeShield: 0, homeShieldMax: 0, works: {},
    outposts: (st.outposts || []).map((o, i) => ({ id: 'op' + i, x: o[0], z: o[1], owner: o[3] || null, prog: o[3] === 'p' ? 1 : o[3] === 'e' ? -1 : 0, enemyOrig: o[3] === 'e', label: o[2] || String.fromCharCode(65 + i) })),
    spawned: 0, opened: {}, bossKills: 0,
    convoy: st.convoy ? (() => { const P = makePath(st.convoy.path); return { P, d: 0, x: st.convoy.path[0][0], z: st.convoy.path[0][1], face: 0, hp: st.convoy.hp, maxHp: st.convoy.hp, speed: st.convoy.speed, done: false }; })() : null,
    t: 0, pts: st.startPoints, baseHP: CFG.baseHP,
    robots: [], enemies: [], shots: [], queue: [], spawners: [], waveIdx: 0,
    allow: opt.allow || ALLOW_ALL, bodies: drawBodies(st.drawCount || DRAW_DEFAULT, opt.allow), nid: 1, serial: 0, lines: 1, loadout: (opt.loadout || []).filter(id => WEAPONS[id] && WEAPONS[id].evo && (!opt.allow || opt.allow.loadout)),
    usedBase: new Set(), kills: 0, swarmKills: 0, built: 0, lost: 0, bombs: 0, ffDmg: 0, ffKills: 0, leaked: 0, earned: 0, spent: 0, ebKills: 0, bossKilled: false,
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
function weaponAllowed(S, w) { const d = WEAPONS[w]; return d.special ? !!S.allow.nova : d.evo ? S.loadout.includes(w) : FEATURES[w] ? !!S.allow[w] : true; }
function buildCheck(S, body, wids) {
  if (!body) return 'ボディを選んでください';
  if (!wids.length) return '武器を1つ以上選んでください';
  if (!bodyAllowed(S, body)) return 'このボディはまだ使えません';
  for (const w of wids) if (!weaponAllowed(S, w)) return WEAPONS[w].name + 'はまだ使えません';
  if (!S.allow.reserve && S.robots.length + S.queue.filter(q => !q.work).length >= CFG.deployCap) return '出撃枠がいっぱいです（' + CFG.deployCap + '機）';
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
  if (!S.allow[id]) return 'まだ使えません';
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
  if (!S.allow.line2) return 'まだ使えません';
  if (S.pts < CFG.line2Cost) return 'ポイントが足りません';
  S.pts -= CFG.line2Cost; S.spent += CFG.line2Cost; S.lines = 2; say(S, '🏗 建造ライン2を開放。2機同時に建造できる', 'good');
  return null;
}
function orderBuild(S, body, wids, at) {
  const err = buildCheck(S, body, wids); if (err) return err;
  const { cost, time } = buildCost(body, wids);
  S.pts -= cost; S.spent += cost; for (const w of wids) S.usedBase.add(WEAPONS[w].base || w);
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
    weapons: q.wids.map(w => ({ id: w, def: WEAPONS[w], cd: WEAPONS[w].type === 'nova' ? WEAPONS[w].cd : rnd(0, .3), cdMax: WEAPONS[w].type === 'nova' ? WEAPONS[w].cd : 0 })),
    face: Math.PI, moving: false, warned: false, dead: false, flash: 0, fireT: -9, hitT: -9,
  };
  r.drain = r.weapons.reduce((a, w) => a + (w.def.drain || 0), 0); r.parry = r.weapons.some(w => w.def.parry); r.streak = 0; r.lastKill = -99;
  r.tx = r.x; r.tz = r.z;
  S.robots.push(r); S.built++; S.fx.push({ type: 'spawn', x: r.x, z: r.z, id: r.id });
  say(S, '🔧 ' + r.name + ' 完成' + (op && op.owner === 'p' ? '（陣地' + op.label + 'から出撃）' : ''));
  return r;
}
function moveRobot(r, x, z, S) {
  const m = S ? S.st.map : null;
  r.tx = m ? clamp(x, m.minX, m.maxX) : x; r.tz = m ? clamp(z, m.minZ, m.maxZ) : z;
}

function nearestIf(list, x, z, range, pred) {
  let best = null, bd = Infinity;
  for (const e of list) { if (e.dead || !pred(e)) continue; const rr = range + e.r, d = (e.x - x) ** 2 + (e.z - z) ** 2; if (d <= rr * rr && d < bd) { bd = d; best = e; } }
  return best;
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
    if (S.convoy && Math.hypot(S.convoy.x - x, S.convoy.z - z) <= rad + 1) S.convoy.hp -= dmg * .5;
  } else {
    for (const e of S.enemies) if (!e.dead && Math.hypot(e.x - x, e.z - z) <= rad + e.r) hurtEnemy(S, e, dmg, owner, true);
    for (const b of S.ebases) if (!b.dead && Math.hypot(b.x - x, b.z - z) <= rad + b.r) hurtEbase(S, b, dmg);
    for (const r of S.robots) if (!r.dead && Math.hypot(r.x - x, r.z - z) <= rad + CFG.robotR) hurtRobot(S, r, dmg * CFG.friendlyFire, owner);
  }
  S.fx.push({ type: 'blast', x, z, rad, team: team || 'p' });
}
function hurtEnemy(S, e, dmg, owner, noArmor) {
  if (e.dead) return;
  if (e.phased) return; // 深淵体：姿が揺らいでいる間は当たらない
  if (e.auraT > 0) dmg *= .5; // 障壁体の近く：半減
  if (e.guardMul) dmg *= e.guardMul;
  if (e.def.armor && !noArmor) dmg = Math.max(dmg * CFG.armorFloor, dmg - e.def.armor);
  e.hp -= dmg; e.flash = .08;
  if (e.hp <= 0) killEnemy(S, e, owner);
}
function killEnemy(S, e, owner) {
  e.dead = true; S.kills++; if (e.def.inst) S.swarmKills++;
  const g = Math.round(e.def.pts * (owner ? owner.ptsMul : 1) * (S.st.ptsMul || 1));
  S.pts += g; S.earned += g;
  S.fx.push({ type: 'kill', x: e.x, z: e.z, pts: g, big: !!e.def.boss, small: !!e.def.inst, kind: e.type });
  if (owner && owner.weapons) { owner.streak = (S.t - owner.lastKill < 5 ? owner.streak : 0) + 1; owner.lastKill = S.t; if (owner.drain && !owner.dead) owner.hp = Math.min(owner.maxHp, owner.hp + owner.drain); }
  if (e.def.boss) { S.bossKilled = true; S.bossKills = (S.bossKills || 0) + 1; say(S, e.def.final ? '★ ' + e.def.name + '、沈黙' : '★ ' + e.def.name + 'を撃破', 'good'); }
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
function homeTake(S, dmg, raw) {
  if (!raw) dmg *= S.st.dmgMul || 1; // 高難度：敵の攻撃が重い
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
  if (!by) dmg *= S.st.dmgMul || 1;
  if (r.shield > 0) { const a = Math.min(r.shield, dmg); r.shield -= a; dmg -= a; if (dmg <= 0) return; }
  r.hp -= dmg;
  const ff = !!by;
  if (ff) { S.ffDmg += Math.min(dmg, r.hp + dmg); if (S.t - (r.ffMsgT || -9) > 4) { r.ffMsgT = S.t; say(S, '⚡ ' + r.name + ' 誤射を受けた（' + by.name + '）', 'warn'); } }
  if (r.hp <= 0) {
    r.dead = true; S.lost++; if (ff) S.ffKills++; if (r.piloted) S.fx.push({ type: 'pilotDown' });
    S.fx.push({ type: 'robodie', x: r.x, z: r.z });
    say(S, '✖ ' + r.name + (ff ? ' 味方の攻撃で撃破' : ' 撃破された'), 'bad');
  } else if (!r.warned && r.hp < r.maxHp * .3) {
    r.warned = true; say(S, '⚠ ' + r.name + ' 損傷大', 'warn');
  }
}
function novaBlast(S, r, d) {
  for (const e of S.enemies) if (!e.dead) hurtEnemy(S, e, d.dmg, r, true);
  for (const b of S.ebases) if (!b.dead) hurtEbase(S, b, d.dmg);
  for (const o of S.robots) if (o !== r && !o.dead) hurtRobot(S, o, d.dmg * d.ffMul * CFG.friendlyFire, r);
  homeTake(S, d.homeDmg, true); S.fx.push({ type: 'basehit', x: S.home.x, z: S.home.z });
  S.fx.push({ type: 'nova', x: r.x, z: r.z }); say(S, '☄ 試作型ノヴァ 発動', 'bad');
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
const isDanger = e => { const d = e.def; return !!(d.range || d.dash || d.heal || d.mine || d.kamikaze || d.artillery || d.weapons || d.aura || d.warp); };
function robotTarget(S, r, d, range) {
  if (d.pick === 'danger') return nearestIf(S.enemies, r.x, r.z, range, isDanger) || nearest(S.enemies, r.x, r.z, range) || nearest(S.ebases, r.x, r.z, range, true);
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
  const np = d.pellets + (mul.extra || 0), fan = d.fan + (mul.extra ? .12 * mul.extra : 0);
  for (let i = 0; i < np; i++) {
    const aa = a + (np > 1 ? (i / (np - 1) - .5) * fan : 0);
    const dmg = d.dmg * (mul.dmg || 1) * (Math.random() < (mul.crit || 0) ? CFG.critMul : 1);
    S.shots.push({
      id: S.nid++, team, x: src.x, z: src.z, vx: Math.sin(aa) * d.speed, vz: Math.cos(aa) * d.speed, dmg,
      life: (d.blast ? Math.hypot(tg.x - src.x, tg.z - src.z) : range) / d.speed * (d.homing ? 1.6 : 1) + .05, r: d.size || (d.blast ? .25 : .18),
      owner: team === 'p' ? src : null, src, pierce: d.pierce || 0, hits: [], w: d.name, blast: d.blast || 0,
      arm: d.blast ? (d.blast + CFG.missileSafety) / d.speed : 0,
      noArmor: !!d.noArmor, noShield: !!d.noShield, homing: d.homing || (mul.lock ? CFG.pilot.lockHoming : 0), tg: d.homing || mul.lock ? tg : null, size: d.size || 0, chain: d.chain || null, splash: d.splash || null, cancel: d.cancel || 0, stun: d.stun || 0, jackpot: !!d.jackpot, kc: 0,
    });
  }
  return a;
}
// レーザー：最寄りの敵へ向けて照射し続ける。直線上の敵・敵拠点・味方ロボットすべてに毎秒ダメージ
// 自操作：ロック対象がこの武器の射程内なら、それを狙う。射程外の武器はAIのまま最寄りを狙う
// （ミサイルも最低距離を無視する＝近い敵をロックすると自爆の危険がある）
function lockTarget(S, r, d, range) {
  const L = r.lock;
  if (!r.piloted || !L || L.dead || d.type === 'bomb') return null;
  return Math.hypot(L.x - r.x, L.z - r.z) - (L.r || (L.def && L.def.r) || 0) <= range ? L : null;
}
function pmul(r) { const P = r.piloted ? CFG.pilot : null; return { rate: r.rateMul * (P ? P.rate : 1), dmg: r.dmgMul * (P ? P.dmg : 1), range: r.rangeMul * (P ? P.range : 1) }; }
function setPilot(S, r) {
  if (r && !S.allow.pilot) return;
  for (const o of S.robots) { o.piloted = false; o.lock = null; }
  if (r && !r.dead) { r.piloted = true; r.tx = r.x; r.tz = r.z; r.aimYaw = r.face; }
}
function setLock(r, t) { if (r) r.lock = t || null; }
function beam(S, r, w, d, dt) {
  const m = pmul(r), range = d.range * m.range, tg = lockTarget(S, r, d, range) || robotTarget(S, r, d, range);
  if (!tg) { w.beam = null; return; }
  const a0 = Math.atan2(tg.x - r.x, tg.z - r.z), n = d.beams || 1; r.fireT = S.t; if (!r.moving && !r.piloted) r.face = a0;
  if (d.drill) { if (w.drillTg === tg) w.drillT += dt; else { w.drillTg = tg; w.drillT = 0; } }
  const drillMul = d.drill ? 1 + Math.min(tg.def && tg.def.boss ? .45 : .8, w.drillT * .25) : 1;
  const dmg = d.dps * dt * m.dmg * (1 + r.crit * (CFG.critMul - 1)) * drillMul;
  w.beam = [];
  for (let k = 0; k < n; k++) {
    const a = a0 + (n > 1 ? (k / (n - 1) - .5) * 2 * d.spread : 0), ux = Math.sin(a), uz = Math.cos(a);
    w.beam.push({ x2: r.x + ux * range, z2: r.z + uz * range });
    const onLine = (t, rr) => { const px = t.x - r.x, pz = t.z - r.z, along = px * ux + pz * uz; return along > 0 && along < range + rr && Math.abs(px * uz - pz * ux) < d.width + rr; };
    for (const e of S.enemies) if (!e.dead && onLine(e, e.r)) { hurtEnemy(S, e, d.sniper ? dmg * (1 + .5 * Math.min(1, Math.hypot(e.x - r.x, e.z - r.z) / range)) : dmg, r, true); if (d.slow) e.slowT = .6; }
    for (const b of S.ebases) if (!b.dead && onLine(b, b.r)) hurtEbase(S, b, dmg);
    for (const o of S.robots) if (o !== r && !o.dead && onLine(o, CFG.robotR)) hurtRobot(S, o, dmg * CFG.friendlyFire * (d.ffMul || 1), r);
  }
}
function updRobot(S, r, dt) {
  r.flash = Math.max(0, r.flash - dt);
  if (r.maxShield && S.t - r.hitT > 4) r.shield = Math.min(r.maxShield, r.shield + 8 * dt); // 盾：3秒被弾しないと回復
  const dx = r.tx - r.x, dz = r.tz - r.z, dist = Math.hypot(dx, dz);
  r.moving = dist > .05;
  if (r.piloted) { r.moving = false; r.tx = r.x; r.tz = r.z; if (r.aimYaw !== undefined) r.face = r.aimYaw; } // 乗っている間は動かない
  if (r.moving) { const m = Math.min(dist, r.spd * dt); r.x += dx / dist * m; r.z += dz / dist * m; r.face = Math.atan2(dx, dz); }
  const pm = pmul(r);
  for (const w of r.weapons) {
    const d = w.def;
    if (d.type === 'bomb') { if (nearest(S.enemies, r.x, r.z, d.trigger, true)) { explode(S, r, d); return; } continue; }
    if (d.type === 'beam') { beam(S, r, w, d, dt); continue; }
    if (d.type === 'nova') { // 試作型ノヴァ：溜めて、戦場全体へ
      const any = S.enemies.length || S.ebases.some(b => !b.dead);
      if (!any) { w.cd = Math.max(w.cd, 3.2); continue; } // 敵がいないときは発動直前で待つ
      w.cd -= dt;
      if (!w.warned && w.cd <= 3) { w.warned = true; S.fx.push({ type: 'novaWarn', x: r.x, z: r.z }); say(S, '☄ ' + r.name + ' 試作型ノヴァ、発動まで3秒（味方と拠点も巻き込む）', 'warn'); }
      if (w.cd <= 0) { novaBlast(S, r, d); w.cd = w.cdMax = d.cd; w.warned = false; r.fireT = S.t; }
      continue;
    }
    w.cd -= dt; if (w.cd > 0) continue;
    const lk = lockTarget(S, r, d, d.range * pm.range), tg = lk || robotTarget(S, r, d, d.range * pm.range);
    w.onLock = !!lk;
    if (!tg) { w.cd = 0; continue; }
    if (d.blast && r.moving && !blastSafe(r, tg, d)) { w.cd = .1; continue; } // 移動中：着弾時に自分が爆風に入るなら撃たない
    const stk = d.streak && S.t - r.lastKill < d.streak.reset ? Math.min(d.streak.max, r.streak) : 0;
    const a = fireWeapon(S, r, d, tg, 'p', { dmg: pm.dmg, crit: r.crit, range: pm.range, lock: !!lk, extra: d.streak && d.streak.pellets ? Math.min(3, Math.floor(stk / 2)) : 0 });
    w.cd = d.cd / (pm.rate * (1 + stk * (d.streak ? d.streak.rate : 0))); w.cdMax = w.cd; r.fireT = S.t;
    if (!r.moving && !r.piloted) r.face = a;
  }
}

// ---------- 敵 ----------
function spawnEnemy(S, type, pi, d0, from) {
  const def = ENEMIES[type], hm = (def.noRamp ? 1 : 1 + S.st.hpRamp * Math.min(1, S.t / S.st.time)) * (S.st.hpMul || 1), hp0 = def.boss && S.st.bossHp ? S.st.bossHp : def.hp; // bossHp：作戦ごとのボスの硬さ
  const e = {
    id: S.nid++, type, def, pi, d: Math.max(0, d0 || 0), off: rnd(-.45, .45), hp: hp0 * hm, maxHp: hp0 * hm, r: def.r,
    cd: rnd(.4, 1), x: 0, z: 0, face: 0, dead: false, flash: 0, firing: false, state: 'path', armed: true,
  };
  if (def.weapons) { e.weapons = def.weapons.map(w => ({ id: w, def: WEAPONS[w], cd: rnd(.5, 1.5) })); }
  if (def.boss) { e.off = 0; e.phaseN = 0; say(S, '🚨 ' + def.name + 'が出現', 'bad'); S.fx.push({ type: 'boss', final: !!def.final, name: def.name }); }
  if (def.phase) e.phaseT = rnd(0, def.phase.on);
  if (def.warp) e.warpT = def.warp.every;
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
// 最終ボス：HPが2/3・1/3を切るたびに形を変え、深淵の敵を呼ぶ
function omegaPhase(S, e) {
  const k = e.hp / e.maxHp, want = k < .34 ? 2 : k < .67 ? 1 : 0;
  if (want <= e.phaseN) return;
  e.phaseN = want;
  const call = (type, n) => { for (let i = 0; i < n; i++) spawnEnemy(S, type, e.pi, Math.max(0, e.d - 1 - i * .4), e); };
  if (want === 1) { e.weapons.push({ id: 'swarmer', def: WEAPONS.swarmer, cd: 1 }); call('wraith', 8); call('aegis', 1); say(S, '⚠ OMEGA原型、形態変化。深淵体を呼んだ', 'bad'); }
  if (want === 2) { e.guardMul = .6; e.weapons.push({ id: 'missile', def: WEAPONS.missile, cd: .5 }); call('warper', 4); call('wraith', 12); call('mimicArt', 1); say(S, '⚠ OMEGA原型、最終形態。装甲が硬くなった', 'bad'); }
  S.fx.push({ type: 'omegaPhase', x: e.x, z: e.z, n: want });
}
function updEnemy(S, e, dt) {
  const def = e.def;
  e.flash = Math.max(0, e.flash - dt); if (e.slowT > 0) e.slowT -= dt; if (e.auraT > 0) e.auraT -= dt;
  if (e.stunT > 0) { e.stunT -= dt; return; } // ブルワークで止まっている
  if (def.phase) { e.phaseT -= dt; if (e.phaseT <= 0) { e.phased = !e.phased; e.phaseT = e.phased ? def.phase.off : def.phase.on; } }
  if (def.aura) for (const o of S.enemies) if (o !== e && !o.dead && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 <= def.aura.range ** 2) o.auraT = .25;
  if (def.warp && e.state === 'path') { e.warpT -= dt; if (e.warpT <= 0) { e.warpT = def.warp.every; const fx0 = { x: e.x, z: e.z }; e.d = Math.min(S.paths[e.pi].len - 1, e.d + def.warp.dist); const p = pathPos(S.paths[e.pi], e.d, e.off); e.x = p.x; e.z = p.z; S.fx.push({ type: 'warp', x: fx0.x, z: fx0.z, x2: e.x, z2: e.z }); } }
  if (def.final) omegaPhase(S, e);
  // 回復ドローン：周りの敵を回復
  if (def.heal) {
    for (const o of S.enemies) if (o !== e && !o.dead && o.hp < o.maxHp && (o.x - e.x) ** 2 + (o.z - e.z) ** 2 <= def.heal.range ** 2) o.hp = Math.min(o.maxHp, o.hp + def.heal.hps * dt);
  }
  // 守備隊：陣地から動かない。射撃型は撃ち、それ以外は触れたロボットを殴る
  if (e.state === 'guard' && def.weapons) {
    for (const w of e.weapons) { w.cd -= dt; if (w.cd > 0) continue; const tg = nearest(S.robots, e.x, e.z, w.def.range); if (!tg) { w.cd = 0; continue; } e.face = fireWeapon(S, e, w.def, tg, 'e', {}); w.cd = w.def.cd * (def.fireMul || 1); }
    return;
  }
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
  // ボス・模倣兵：歩きながら武器で撃つ（拠点に着いたら拠点も攻撃）
  if (def.weapons) {
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
    if (s.team === 'p' && s.cancel > 0) { // ウォール・ブルワーク：敵の弾を打ち消す
      for (const o of S.shots) if (!o.dead && o.team === 'e' && (o.x - s.x) ** 2 + (o.z - s.z) ** 2 < (o.r + s.r + .2) ** 2) { o.dead = true; s.cancel--; S.fx.push({ type: 'block', x: o.x, z: o.z }); if (s.cancel <= 0) break; }
    }
    if (s.team === 'e' && !s.parried) { // パリィ：正面近くの敵弾を弾き返す
      let pr = null;
      for (const r of S.robots) if (r.parry && !r.dead && (r.x - s.x) ** 2 + (r.z - s.z) ** 2 < 3.6) { let da = Math.atan2(s.x - r.x, s.z - r.z) - r.face; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; if (Math.abs(da) < 1.2) { pr = r; break; } }
      if (pr) { s.team = 'p'; s.parried = true; s.owner = pr; s.src = pr; s.vx = -s.vx; s.vz = -s.vz; s.dmg *= 1.5; s.life = 1.4; s.hits = []; s.pierce = 0; s.arm = 0; S.fx.push({ type: 'block', x: s.x, z: s.z }); continue; }
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
        else { const was = t.dead; hurtEnemy(S, t, s.dmg, s.owner, s.noArmor); if (s.stun && !t.def.boss) t.stunT = s.stun; if (!was && t.dead && ++s.kc >= 2 && s.jackpot) { const g = Math.round(t.def.pts * (S.st.ptsMul || 1)); S.pts += g; S.earned += g; S.fx.push({ type: 'kill', x: t.x, z: t.z, pts: g, jackpot: true }); } }
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
const pathOpen = (S, i) => !S.st.pathOpen || !(S.st.pathOpen[i] > S.t);
function pickPath(S, sp) {
  const n = S.paths.length;
  let pi = sp.path === '*' ? (sp.k++ % n) : sp.path;
  if (!pathOpen(S, pi)) { if (sp.path !== '*') return -1; for (let k = 0; k < n && !pathOpen(S, pi); k++) pi = sp.k++ % n; if (!pathOpen(S, pi)) return -1; } // まだ開いていない裂け目からは出ない
  const eb = S.ebases.find(b => b.path === pi);
  if (eb && eb.dead && !ENEMIES[sp.type].rebuild) { // 壊した敵拠点の経路：出現が減る（bases ステージでは止まる）
    const rate = S.st.goal === 'bases' ? 0 : CFG.deadSpawnRate;
    if (Math.random() >= rate) return -1;
  }
  return pi;
}
// 補給車：決まった道を進む。敵が近くにいると止まって攻撃を受ける。終点に着けば勝ち
function updConvoy(S, dt) {
  const C = S.convoy; if (C.done || C.hp <= 0) return;
  let block = false, dps = 0;
  for (const e of S.enemies) if (!e.dead && e.state !== 'guard' && (e.x - C.x) ** 2 + (e.z - C.z) ** 2 < (e.r + 1.1) ** 2) { block = true; dps += Math.max(1, e.def.baseDps) * 2; }
  if (dps) { C.hp -= dps * dt * (S.st.dmgMul || 1); C.hitT = S.t; if (S.t - (C.warnT || -9) > 6) { C.warnT = S.t; say(S, '🚚 補給車が攻撃を受けている', 'bad'); } }
  C.blocked = block;
  if (!block) { C.d = Math.min(C.P.len, C.d + C.speed * dt); const p = pathPos(C.P, C.d, 0); C.face = Math.atan2(p.dx, p.dz); C.x = p.x; C.z = p.z; }
  if (C.d >= C.P.len - .01) { C.done = true; say(S, '🚚 補給車、到着', 'good'); }
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
    while (sp.next <= 0 && sp.n > 0) { const pi = pickPath(S, sp); if (pi === -1 && sp.path !== '*' && !pathOpen(S, sp.path)) { sp.next = .5; break; } if (pi >= 0) spawnEnemy(S, sp.type, pi, 0); sp.n--; sp.next += sp.gap; if (sp.gap <= 0) sp.next = 0; }
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
  if (S.convoy) updConvoy(S, dt);
  if (S.st.pathOpen) for (const i in S.st.pathOpen) if (!S.opened[i] && S.t >= S.st.pathOpen[i]) { S.opened[i] = true; say(S, '🌀 新たな裂け目が開いた（' + dirName(S, S.st.paths[i][0]) + '）', 'bad'); S.fx.push({ type: 'rift', i: +i }); }
  updHomeGun(S, dt);
  updShots(S, dt);
  S.robots = S.robots.filter(r => !r.dead);
  S.enemies = S.enemies.filter(e => !e.dead);
  S.shots = S.shots.filter(s => !s.dead);
  const g = S.st.goal;
  if (S.baseHP <= 0) { S.baseHP = 0; S.over = 'lose'; }
  else if (g === 'points' && S.pts >= S.st.goalPts) S.over = 'win';
  else if (g === 'bases' && S.ebases.every(b => b.dead)) S.over = 'win';
  else if (g === 'boss' && (S.bossKills || 0) >= (S.st.bossCount || 1)) S.over = 'win';
  else if (g === 'escort' && S.convoy && S.convoy.done) S.over = 'win';
  else if (S.convoy && S.convoy.hp <= 0) { S.convoy.hp = 0; S.over = 'lose'; S.loseWhy = '補給車が破壊された'; }
  else if (g === 'clear' && S.waveIdx >= W.length && !S.spawners.length && !S.enemies.some(e => e.state !== 'guard')) S.over = 'win';
  else if (S.t >= S.st.time) { S.t = S.st.time; S.over = g === 'time' ? 'win' : 'lose'; }
}
function waveTotal(st) { return st.waves.reduce((a, w) => a + w[2], 0); }
function goalText(st) {
  if (st.goal === 'points') return '所持ポイントを ⭐' + st.goalPts + ' まで貯める（制限 ' + Math.floor(st.time / 60) + ':' + String(st.time % 60).padStart(2, '0') + '）';
  if (st.goal === 'bases') return '敵拠点 ' + st.ebases.length + ' つをすべて破壊（制限 ' + Math.floor(st.time / 60) + ':' + String(st.time % 60).padStart(2, '0') + '）';
  const lim = '（制限 ' + Math.floor(st.time / 60) + ':' + String(st.time % 60).padStart(2, '0') + '）';
  if (st.goal === 'boss') return (st.bossName || '模倣機') + (st.bossCount > 1 ? 'を' + st.bossCount + '機すべて' : 'を') + '撃破する' + lim;
  if (st.goal === 'escort') return '補給車を目的地まで護衛する' + lim;
  if (st.goal === 'clear') return '押し寄せる敵をすべて倒す' + lim;
  return Math.floor(st.time / 60) + ':' + String(st.time % 60).padStart(2, '0') + ' ' + (st.holdWhy || '拠点を守り抜く');
}

return { hardStage, HARD, FEATURES, FEATURE_INFO, allowFor, weaponAllowed, bodyAllowed, waveTotal, CHAPTERS, setPilot, setLock, WORKS, workCost, workCheck, orderWork, queueCount, CFG, TIER, PLUS, BODIES, WEAPONS, ENEMIES, STAGES, UNLOCKS, checkUnlocks, pathPos, dirName, newState, step, buildCost, buildCheck, orderBuild, buyLine, moveRobot, activeCount, goalText };
})();
/*SIM-END*/
