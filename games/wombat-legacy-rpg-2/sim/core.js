// ===== ウォンバット☆レガシーRPG 2: data & rules (DOMを使わない) =====
// 画面を作るときは、このファイルの中身を index.html の <script> にそのまま入れる（前作と同じ形）。
// Node.js からは require('./core.js') で読める。シミュレーター（sim.js）とテスト（test.js）が使う。
//
// 数字はすべて仮。シミュレーションで調整する前提で、調整しやすい値は CONFIG にまとめている。

function rng(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// ---------- 調整用の値 ----------
const CONFIG={
  // 職業に関係なく共通の伸び方 [Lv1の値, 1レベルごとの増え方]。これに職業の倍率をかける
  base:{hp:[30,8],mp:[8,2.4],atk:[8,2.2],def:[6,1.7],mag:[8,2.2],spd:[6,1.3]},
  expBase:[5,5],            // 必要経験値 = 職業の係数 × (a×lv² + b×lv)
  poisonDot:.08,            // 仲間の毒：最大HPに対する毎ターンのダメージ
  poisonDefDown:.75,        // 毒のあいだ、ぼうぎょ×この値
  enemyPoisonDot:.06,       // 敵の毒：最大HPに対する毎ターンのダメージ
  // ボスへの からめて（2026-11-22 見直し）
  //  デバフ（こうげき↓・ぼうぎょ↓・のろい・めつぶし）は、ボスにも わざの確率のまま きく。どくは ×0.9。かけ直しても 下がらない
  //  うごきを止める状態異常（ねむり・まひ・こんらん）は ボスに ×bossStatusRate、かかるたびに ×bossStatusRepeat。ボスの ねむり・まひは 1ターン
  bossDebuffRate:1, bossPoisonRate:.9,
  bossStatusRate:.6,
  bossStatusRepeat:.7,
  bossPoisonDot:.6,         // ボスへの毒ダメージ×この値
  buff:{atk:1.3,def:1.5,spd:1.3,eva:1,turns:3},
  debuff:{atk:.7,def:.6,turns:3},
  kiaiMax:3, kiaiPow:.2,    // きあい1段ごとに物理ダメージ+20%
  counterRate:.25, evadeBase:.03,
  guardCut:.5,
  // 敵の強さ：この階での値を決め、あいだはなめらかにつなぐ（ふつうの敵の値）
  enemyCurve:{
    floor:[1, 10, 20, 30, 40, 50],
    // B40〜50は、ほかの区間より急に伸ばす（決定）
    hp:   [16,55, 150,340,460,1000],
    atk:  [10,29, 64, 110,135,220],
    def:  [3, 8,  18, 36, 50, 80],
    spd:  [6, 9,  13, 17, 21, 25],
    exp:  [8, 29, 78, 168,311,930],
    gold: [5, 14, 31, 60, 95, 230],
  },
  // 表から計算せず、個別に決めるボス。B50は、表どおりだと超上級職Lv40でも勝てないため。上級職Lv30では勝ちにくい強さにする
  bossOverride:{50:{hp:7500,atk:320,def:90}},
  // ボスは強め（人間は自動プレイより上手に戦うため）。めやす：上限レベル・満タンで勝率6〜8割
  boss:{mid:{hp:10,atk:2.2,def:1.2,exp:12,gold:15},big:{hp:9,atk:1.55,def:1.3,exp:25,gold:30}},
};
function floorScale(f){return 1+.11*(f-1)+.0035*(f-1)*(f-1);}
// 階 f での敵の値（決めた点のあいだを、比で補間する）
function curve(k,f){const F=CONFIG.enemyCurve.floor,V=CONFIG.enemyCurve[k];
  if(f<=F[0])return V[0];for(let i=1;i<F.length;i++)if(f<=F[i]){const t=(f-F[i-1])/(F[i]-F[i-1]);return V[i-1]*Math.pow(V[i]/V[i-1],t);}
  return V[V.length-1]*Math.pow(V[V.length-1]/V[V.length-2],(f-F[F.length-1])/(F[F.length-1]-F[F.length-2]));}

// ---------- 職業 ----------
// mult: ステータスの倍率 / expK: 必要経験値の係数 / cap: レベル上限 / req: 解放条件（1匹ずつ数える）
// expK は、強いスキルを持つ職業ほど重く、それ以外は軽くする（決定。値は仮）
const JOBS={
  // ぼうぎょは職業で変えない（決定）。かたさの差はHPの倍率でつける
  war:{name:'戦士',     tier:1,cap:20,expK:0.6,mult:{hp:1.45,mp:.4, atk:1.15,mag:.3, spd:.8}},
  kar:{name:'空手家',   tier:1,cap:20,expK:1.1,mult:{hp:.95, mp:.4, atk:1.1, mag:.3, spd:1.2}},
  mag:{name:'魔法使い', tier:1,cap:20,expK:1.2,mult:{hp:.6,  mp:1.4,atk:.5,  mag:1.3,spd:1.0}},
  pri:{name:'僧侶',     tier:1,cap:20,expK:1.3,mult:{hp:.8,  mp:1.2,atk:.7,  mag:1.1,spd:.9}},
  poi:{name:'毒使い',   tier:1,cap:20,expK:0.6,mult:{hp:.8,  mp:1.0,atk:.85, mag:1.0,spd:1.1}},
  sin:{name:'歌い手',   tier:1,cap:20,expK:0.6,mult:{hp:.8,  mp:1.1,atk:.7,  mag:1.0,spd:1.05}},
  // 上級職（基本職2つを極めると解放）
  hwar:{name:'上級戦士',tier:2,cap:30,expK:2.0,req:['war','kar']},
  ber: {name:'狂戦士',  tier:2,cap:30,expK:2.0,req:['war','poi']},
  pal: {name:'聖騎士',  tier:2,cap:30,expK:2.0,req:['war','pri']},
  mfi: {name:'魔拳士',  tier:2,cap:30,expK:2.0,req:['kar','mag']},
  dan: {name:'舞闘家',  tier:2,cap:30,expK:2.0,req:['kar','sin']},
  ill: {name:'幻術師',  tier:2,cap:30,expK:2.0,req:['mag','sin']},
  cur: {name:'呪術師',  tier:2,cap:30,expK:2.0,req:['mag','poi']},
  hym: {name:'聖歌士',  tier:2,cap:30,expK:2.0,req:['pri','sin']},
  apo: {name:'薬師',    tier:2,cap:30,expK:2.0,req:['pri','poi']},
  // 超上級職（上級職4つを極めると解放）
  kNin:{name:'忍者王',    tier:3,cap:40,expK:3.5,req:['dan','mfi','ill','apo']},
  kAll:{name:'万能王',    tier:3,cap:40,expK:3.5,req:['hwar','pal','mfi','hym']},
  kMag:{name:'魔道王',    tier:3,cap:40,expK:3.5,req:['ill','cur','hym','apo']},
  kAtk:{name:'突撃王',    tier:3,cap:40,expK:3.5,req:['hwar','ber','mfi','cur']},
  kIdl:{name:'アイドル王',tier:3,cap:40,expK:3.5,req:['dan','ill','hym','pal']},
  kDig:{name:'あなほり王',tier:3,cap:40,expK:3.5,req:['hwar','ber','dan','apo']},
};
// 上級職・超上級職の倍率は仮に「条件の職業の平均×係数」で作る（あとで1つずつ決める）
(function(){
  const keys=['hp','mp','atk','mag','spd'];
  const mk=(id,k)=>{const J=JOBS[id];if(J.mult)return;
    J.req.forEach(r=>mk(r,k));
    J.mult={};for(const s of keys){let sum=0,mx=0;for(const r of J.req){sum+=JOBS[r].mult[s];mx=Math.max(mx,JOBS[r].mult[s]);}
      J.mult[s]=+((sum/J.req.length*.5+mx*.5)*(J.tier===2?1.12:1.12)).toFixed(3);}};
  for(const id in JOBS)mk(id);
})();
const BASIC_JOBS=Object.keys(JOBS).filter(k=>JOBS[k].tier===1);

function expNext(job,lv){const [a,b]=CONFIG.expBase;return Math.floor(JOBS[job].expK*(a*lv*lv+b*lv));}

// ---------- スキル ----------
// 配分は SKILLS.md。基本職は5つ＋上限（Lv1,4,8,12,16,20）、上級職は5つ＋上限（Lv1,6,12,18,24,30）、超上級職は4つ＋上限（Lv1,10,20,30,40）
// kind:
//  phys 物理（pow倍。hits 回数、el 属性、kiaiCost きあいを使う、ignoreDef ぼうぎょ無視、selfDmg 自分も最大HPの割合だけ傷つく、fist 属性のこぶし）
//  finisher きあいを全部使う大技（pow + perKiai×きあい。hitsPerKiai なら きあいの数だけ連続）
//  mag 魔法（base + まりょく×k。el 属性、el:'best' 弱点をつく、drain 与えたダメージの割合だけ回復）
//  heal 回復 / cure 1匹の どく・ねむり・まひを治す / cureAll 全員 / mpheal 全員のMPを回復 / revive 起こす
//  mark ふっかつのいのり（えらんだ仲間が倒れたとき1度だけ起きる）
//  guard かばう（cut 受けるダメージの割合） / stance 構え（counter 必ず反撃、hide 攻撃を受けない。turns があれば そのターン数つづく）
//  status 状態異常・デバフ（st, rate, st2 もう1つ） / buff 全員にバフ（atk def spd eva all）
//  extend バフを延ばす（turns、kiai:true なら きあいを使って その段数だけ）/ cheer 仲間1匹の次の行動を強くする / taunt 敵をひきつける
//  rage 自分をどくにして こうげき↑ / berserk 守りをすてて こうげき↑ / passive 持っているだけで効く（eff）
// tgt: self enemy enemies ally allies dead
const SKILLS={
  // ===== 基本職 =====
  // 戦士（前作どおりの守り役）
  guard:  {name:'おしりガード',job:'war',lv:1,mp:0,tgt:'self',kind:'guard'},
  dig:    {name:'ほりほりアタック',job:'war',lv:4,mp:2,tgt:'enemy',kind:'phys',pow:1.6},
  hpup1:  {name:'がんじょう',job:'war',lv:8,tgt:'self',kind:'passive',eff:{hp:.1}},
  roll:   {name:'ころがりタックル',job:'war',lv:12,mp:4,tgt:'enemies',kind:'phys',pow:.85},
  quake:  {name:'だいちのいちげき',job:'war',lv:16,mp:7,tgt:'enemy',kind:'phys',pow:2.6},
  ironbutt:{name:'てつのおしり',job:'war',master:true,tgt:'self',kind:'passive',eff:{guardCut:.3,hp:.1}},
  // 空手家（自分を強くする・カウンター）
  kiai:   {name:'きあい',job:'kar',lv:1,tgt:'self',kind:'passive',eff:{kiai:1}},
  seiken: {name:'せいけんづき',job:'kar',lv:4,mp:2,tgt:'enemy',kind:'phys',pow:1.4},
  counter:{name:'カウンター',job:'kar',lv:8,tgt:'self',kind:'passive',eff:{counter:CONFIG.counterRate}},
  finish: {name:'ひっさつせいけん',job:'kar',lv:12,mp:6,tgt:'enemy',kind:'finisher',pow:1.3,perKiai:.8},
  dodge:  {name:'みきり',job:'kar',lv:16,tgt:'self',kind:'passive',eff:{evade:.1}},
  ironfist:{name:'てっけん',job:'kar',master:true,tgt:'self',kind:'passive',eff:{kiaiMax:2,counter:.15}},
  // 魔法使い（無属性は上級職から）
  thunder:{name:'ピリリ',job:'mag',lv:1,mp:2,tgt:'enemy',kind:'mag',el:'thunder',base:6,k:.9},
  ice:    {name:'ヒエヒエ',job:'mag',lv:4,mp:4,tgt:'enemies',kind:'mag',el:'ice',base:5,k:.6},
  sleep:  {name:'ねむねむ',job:'mag',lv:8,mp:3,tgt:'enemies',kind:'status',st:'sleep',rate:.7},
  fire:   {name:'メラメラ',job:'mag',lv:12,mp:6,tgt:'enemies',kind:'mag',el:'fire',base:14,k:.9},
  bolt:   {name:'ゴロゴロ',job:'mag',lv:16,mp:6,tgt:'enemy',kind:'mag',el:'thunder',base:30,k:1.5},
  awaken: {name:'まりょくかくせい',job:'mag',master:true,tgt:'self',kind:'passive',eff:{mag:.2,mp:.15}},
  // 僧侶（回復）
  heal:   {name:'いやし',job:'pri',lv:1,mp:2,tgt:'ally',kind:'heal',base:18,k:1.2},
  cure:   {name:'きよめ',job:'pri',lv:4,mp:1,tgt:'ally',kind:'cure'},
  light:  {name:'ひかり',job:'pri',lv:8,mp:3,tgt:'enemy',kind:'mag',el:'light',base:10,k:.9},
  healall:{name:'みんないやし',job:'pri',lv:12,mp:6,tgt:'allies',kind:'heal',base:22,k:1.0},
  revive: {name:'めざめ',job:'pri',lv:16,mp:8,tgt:'dead',kind:'revive'},
  autorev:{name:'ふっかつのいのり',job:'pri',master:true,mp:8,tgt:'ally',kind:'mark'},
  // 毒使い（状態異常とデバフ）
  venom:  {name:'どくばり',job:'poi',lv:1,mp:2,tgt:'enemy',kind:'status',st:'poison',rate:.85,pow:.6},
  weaken: {name:'よわりごな',job:'poi',lv:4,mp:3,tgt:'enemy',kind:'status',st:'atkdn',rate:.9},
  mist:   {name:'どくのきり',job:'poi',lv:8,mp:5,tgt:'enemies',kind:'status',st:'poison',rate:.6},
  crack:  {name:'よろいくだき',job:'poi',lv:12,mp:4,tgt:'enemy',kind:'status',st:'defdn',rate:.9,pow:.6},
  stun:   {name:'まひのきば',job:'poi',lv:16,mp:5,tgt:'enemy',kind:'status',st:'stun',rate:.6,pow:.8},
  plague: {name:'しのびよる毒',job:'poi',master:true,tgt:'self',kind:'passive',eff:{statusRate:.25,debuffTurns:2}},
  // 歌い手（バフ）
  sAtk:   {name:'いさましの歌',job:'sin',lv:1,mp:3,tgt:'allies',kind:'buff',buff:'atk'},
  sDef:   {name:'まもりの歌',job:'sin',lv:4,mp:3,tgt:'allies',kind:'buff',buff:'def'},
  sSpd:   {name:'はやての歌',job:'sin',lv:8,mp:3,tgt:'allies',kind:'buff',buff:'spd'},
  sHeal:  {name:'いやしの歌',job:'sin',lv:12,mp:5,tgt:'allies',kind:'heal',base:12,k:.7},
  sSleep: {name:'ねむりの歌',job:'sin',lv:16,mp:4,tgt:'enemies',kind:'status',st:'sleep',rate:.6},
  echo:   {name:'ひびく声',job:'sin',master:true,tgt:'self',kind:'passive',eff:{buffPow:.5}},

  // ===== 上級職 =====
  // 上級戦士（戦士＋空手家）：かばう守りと反撃。きあいを守りにも使う
  defup1: {name:'あついけがわ',job:'hwar',lv:1,tgt:'self',kind:'passive',eff:{def:.15}},
  funbari:{name:'ふんばり',job:'hwar',lv:6,tgt:'self',kind:'passive',eff:{kiaiDef:.1}},
  fumikomi:{name:'ふみこみ',job:'hwar',lv:12,mp:4,tgt:'enemies',kind:'phys',pow:1.1,kiaiCost:1},
  kamae:  {name:'かまえ',job:'hwar',lv:18,mp:3,tgt:'self',kind:'stance',stance:'counter',turns:5},
  teppeki:{name:'てっぺき',job:'hwar',lv:24,mp:5,tgt:'self',kind:'guard',cut:.3},
  fudou:  {name:'ふどうのかまえ',job:'hwar',master:true,tgt:'self',kind:'passive',eff:{guardCounter:1}},
  // 狂戦士（戦士＋毒使い）：自分を毒にして強くなる
  rage:   {name:'いかり',job:'ber',lv:1,mp:3,tgt:'self',kind:'rage'},
  painPow:{name:'いたみをちからに',job:'ber',lv:6,tgt:'self',kind:'passive',eff:{hurtKiai:1}},
  bousou: {name:'ぼうそう',job:'ber',lv:12,mp:6,tgt:'enemies',kind:'phys',pow:1.5,selfDmg:.1},
  fang:   {name:'どくのきば',job:'ber',lv:18,tgt:'self',kind:'passive',eff:{atkPoison:.3}},
  chimeguri:{name:'ちのめぐり',job:'ber',lv:24,tgt:'self',kind:'passive',eff:{poisonAtk:.3}},
  poisonHeal:{name:'どくのいやし',job:'ber',master:true,tgt:'self',kind:'passive',eff:{poisonRegen:.05}},
  // 聖騎士（戦士＋僧侶）：かばう・守り・回復
  healup: {name:'いのりの心',job:'pal',lv:1,tgt:'self',kind:'passive',eff:{healPow:.2}},
  lightBlade:{name:'ひかりのけん',job:'pal',lv:6,mp:4,tgt:'enemy',kind:'phys',pow:1.5,el:'light'},
  mamoriInori:{name:'まもりのいのり',job:'pal',lv:12,mp:4,tgt:'allies',kind:'buff',buff:'def'},
  healHand:{name:'いやしのて',job:'pal',lv:18,mp:4,tgt:'ally',kind:'heal',base:30,k:1.0},
  holyShield:{name:'せいなるたて',job:'pal',lv:24,mp:5,tgt:'self',kind:'guard',cut:.35},
  guardHeal:{name:'まもりのめぐみ',job:'pal',master:true,tgt:'self',kind:'passive',eff:{guardHeal:.1}},
  // 魔拳士（空手家＋魔法使い）：属性のこぶし。きあいで魔法も強くなる
  fireFist:{name:'ほのおのこぶし',job:'mfi',lv:1,mp:3,tgt:'enemy',kind:'phys',pow:1.5,el:'fire',fist:true},
  iceFist:{name:'こおりのこぶし',job:'mfi',lv:6,mp:3,tgt:'enemy',kind:'phys',pow:1.5,el:'ice',fist:true},
  thunderFist:{name:'かみなりのこぶし',job:'mfi',lv:12,mp:3,tgt:'enemy',kind:'phys',pow:1.5,el:'thunder',fist:true},
  magup1: {name:'まりょくのめばえ',job:'mfi',lv:18,tgt:'self',kind:'passive',eff:{mag:.1}},
  kiaiMag:{name:'きあいまほう',job:'mfi',lv:24,tgt:'self',kind:'passive',eff:{kiaiMag:.15}},
  fistAll:{name:'まけんのうず',job:'mfi',master:true,tgt:'self',kind:'passive',eff:{fistAll:1}},
  // 舞闘家（空手家＋歌い手）：踊りながら戦う。きあいと歌をつなぐ
  rush:   {name:'れんぞくげり',job:'dan',lv:1,mp:5,tgt:'enemy',kind:'phys',pow:.6,hits:3},
  spdup1: {name:'しゅんそく',job:'dan',lv:6,tgt:'self',kind:'passive',eff:{spd:.15}},
  dancing:{name:'まいおどる',job:'dan',lv:12,tgt:'self',kind:'passive',eff:{evade:.1}},
  hayashi:{name:'はやしたて',job:'dan',lv:18,tgt:'self',kind:'passive',eff:{singKiai:1}},
  kiaiDance:{name:'きあいのまい',job:'dan',lv:24,mp:4,tgt:'allies',kind:'extend',kiai:true},
  danceRing:{name:'おどりのわ',job:'dan',master:true,tgt:'self',kind:'passive',eff:{danceKiai:1}},
  // 幻術師（魔法使い＋歌い手）：敵をみだす
  madowashi:{name:'まどわし',job:'ill',lv:1,mp:4,tgt:'enemies',kind:'status',st:'confuse',rate:.6},
  bunshin:{name:'ぶんしん',job:'ill',lv:6,mp:4,tgt:'allies',kind:'buff',buff:'eva'},
  dreamMist:{name:'ゆめのきり',job:'ill',lv:12,mp:6,tgt:'enemies',kind:'status',st:'sleep',rate:.85},
  longv:  {name:'のびやかな声',job:'ill',lv:18,tgt:'self',kind:'passive',eff:{buffTurns:2}},
  maboroshi:{name:'まぼろし',job:'ill',lv:24,mp:5,tgt:'enemies',kind:'status',st:'blind',rate:.6},
  magEcho:{name:'こだまのまほう',job:'ill',master:true,tgt:'self',kind:'passive',eff:{magEcho:.3}},
  // 呪術師（魔法使い＋毒使い）：強いデバフと無属性魔法
  noroi:  {name:'のろい',job:'cur',lv:1,mp:4,tgt:'enemy',kind:'status',st:'curse',rate:.8},
  strongp:{name:'もうどく',job:'cur',lv:6,tgt:'self',kind:'passive',eff:{poisonPow:.5}},
  boom:   {name:'ドカーン',job:'cur',lv:12,mp:12,tgt:'enemies',kind:'mag',el:null,base:40,k:1.3},
  lifeSuck:{name:'いのちすい',job:'cur',lv:18,mp:6,tgt:'enemy',kind:'mag',el:null,base:30,k:1.15,drain:.5},
  jiwajiwa:{name:'じわじわ',job:'cur',lv:24,tgt:'self',kind:'passive',eff:{statusMagPow:.3}},
  curseMax:{name:'のろいのきわみ',job:'cur',master:true,tgt:'self',kind:'passive',eff:{debuffPow:.1,statusMagPow:.2}},
  // 聖歌士（僧侶＋歌い手）：回復とバフ
  mpup1:  {name:'めいそう',job:'hym',lv:1,tgt:'self',kind:'passive',eff:{mp:.15}},
  prayerSong:{name:'いのりの歌',job:'hym',lv:6,mp:7,tgt:'allies',kind:'heal',base:25,k:1.0},
  cleanSong:{name:'きよめの歌',job:'hym',lv:12,mp:5,tgt:'allies',kind:'cureAll'},
  genkiSong:{name:'げんきの歌',job:'hym',lv:18,mp:2,tgt:'allies',kind:'mpheal',amt:20},
  kokoro: {name:'こころのうた',job:'hym',lv:24,tgt:'self',kind:'passive',eff:{statusResist:.5}},
  songHeal:{name:'うたのめぐみ',job:'hym',master:true,tgt:'self',kind:'passive',eff:{songHeal:.08}},
  // 薬師（僧侶＋毒使い）：かけるのも治すのも得意
  itemPow:{name:'くすりのちしき',job:'apo',lv:1,tgt:'self',kind:'passive',eff:{itemPow:.5}},
  panacea:{name:'ばんのうやく',job:'apo',lv:6,mp:4,tgt:'allies',kind:'cureAll'},
  poisonKill:{name:'どくのくすり',job:'apo',lv:12,tgt:'self',kind:'passive',eff:{poisonKillHeal:.08}},
  sleepDrug:{name:'ねむりぐすり',job:'apo',lv:18,mp:3,tgt:'enemy',kind:'status',st:'sleep',rate:.95},
  numbDrug:{name:'しびれぐすり',job:'apo',lv:24,mp:6,tgt:'enemies',kind:'status',st:'stun',rate:.45},
  startCure:{name:'よぼうの心得',job:'apo',master:true,tgt:'self',kind:'passive',eff:{startCure:1,statusResist:1}},

  // ===== 超上級職 =====
  kagebunshin:{name:'かげぶんしん',job:'kNin',lv:1,mp:6,tgt:'allies',kind:'buff',buff:'eva'},
  shuriken:{name:'しゅりけん',job:'kNin',lv:10,mp:6,tgt:'enemies',kind:'phys',pow:.8,hits:2},
  kiaiRen:{name:'きあいの連撃',job:'kNin',lv:20,mp:6,tgt:'enemy',kind:'finisher',pow:.9,perKiai:0,hitsPerKiai:true},
  smoke:  {name:'どくけむり',job:'kNin',lv:30,mp:7,tgt:'enemies',kind:'status',st:'poison',rate:.7,st2:'stun',rate2:.4},
  extraAct:{name:'かげの身のこなし',job:'kNin',master:true,tgt:'self',kind:'passive',eff:{extraAct:.3}},
  allElem:{name:'ばんのうのひかり',job:'kAll',lv:1,mp:8,tgt:'enemies',kind:'mag',el:'best',base:30,k:1.0},
  allHeal:{name:'だいいやし',job:'kAll',lv:10,mp:9,tgt:'allies',kind:'heal',base:40,k:1.2},
  allGuard:{name:'みんなをまもる',job:'kAll',lv:20,mp:4,tgt:'self',kind:'guard',cut:.3},
  pinch:  {name:'ふくつ',job:'kAll',lv:30,tgt:'self',kind:'passive',eff:{pinch:.3}},
  pinchRegen:{name:'ふくつのいのち',job:'kAll',master:true,tgt:'self',kind:'passive',eff:{pinchRegen:.08}},
  bigMagic:{name:'だいまほう',job:'kMag',lv:1,mp:20,tgt:'enemies',kind:'mag',el:null,base:80,k:1.8},
  bigHeal:{name:'おおいやし',job:'kMag',lv:10,mp:14,tgt:'allies',kind:'heal',base:60,k:1.5},
  magCure:{name:'ひかりのしずく',job:'kMag',lv:20,mp:5,tgt:'allies',kind:'cureAll'},
  magupBig:{name:'まりょくのうみ',job:'kMag',lv:30,tgt:'self',kind:'passive',eff:{mag:.3}},
  eternal:{name:'えいえんのいのり',job:'kMag',master:true,tgt:'self',kind:'passive',eff:{autoRevive:1}},
  startKiai:{name:'もえるたましい',job:'kAtk',lv:1,tgt:'self',kind:'passive',eff:{startKiai:1}},
  zenryoku:{name:'ぜんりょく',job:'kAtk',lv:10,mp:8,tgt:'enemies',kind:'finisher',pow:1.0,perKiai:.5},
  totsugeki:{name:'とつげき',job:'kAtk',lv:20,mp:4,tgt:'self',kind:'berserk'},
  tsuranuki:{name:'つらぬき',job:'kAtk',lv:30,mp:6,tgt:'enemy',kind:'phys',pow:1.6,ignoreDef:true},
  killAtk:{name:'かちどき',job:'kAtk',master:true,tgt:'self',kind:'passive',eff:{killAtk:.1}},
  sAll:   {name:'かっさいの歌',job:'kIdl',lv:1,mp:10,tgt:'allies',kind:'buff',buff:'all'},
  encore: {name:'アンコール',job:'kIdl',lv:10,mp:5,tgt:'allies',kind:'extend',turns:3},
  ouen:   {name:'おうえん',job:'kIdl',lv:20,mp:3,tgt:'ally',kind:'cheer'},
  stage:  {name:'ステージ',job:'kIdl',lv:30,mp:3,tgt:'self',kind:'taunt'},
  forever:{name:'えいえんのステージ',job:'kIdl',master:true,tgt:'self',kind:'passive',eff:{buffForever:1}},
  // あなほり王（2026-11-25 見直し）：掘る・からめて・みんなを守る・長く もぐる
  digLuck:{name:'おたからさがし',job:'kDig',lv:1,tgt:'self',kind:'passive',eff:{digLuck:1,itemFind:1}},
  sandSmoke:{name:'すなけむり',job:'kDig',lv:10,mp:4,tgt:'enemies',kind:'status',st:'blind',rate:.7},
  jihibiki:{name:'じひびき',job:'kDig',lv:20,mp:6,tgt:'enemies',kind:'phys',pow:1.3,stun:.3},
  hideHole:{name:'あなぐらに にげこむ',job:'kDig',lv:30,mp:8,tgt:'allies',kind:'shelter',cut:.5},
  daichi:{name:'だいちの めぐみ',job:'kDig',master:true,tgt:'self',kind:'passive',eff:{partyRegen:.05}},
};
for(const id in SKILLS)SKILLS[id].id=id;
const EL_NAME={fire:'ほのお',ice:'こおり',thunder:'かみなり',light:'ひかり'};
const ST_NAME={poison:'どく',sleep:'ねむり',stun:'まひ',atkdn:'こうげき↓',defdn:'ぼうぎょ↓',curse:'のろい',confuse:'こんらん',blind:'めつぶし'};
const SLOT_MAX=6;

// 今の職業で使えるスキル
function jobSkills(m){return Object.keys(SKILLS).filter(k=>{const S=SKILLS[k];return S.job===m.job&&(S.master?!!m.mastered[m.job]||m.lv>=JOBS[m.job].cap:S.lv<=m.lv);});}
// 引き継ぎ枠に入れられるスキル（覚えたことがあり、今の職業のものではない）
function slotCandidates(m){return Object.keys(m.learned).filter(k=>SKILLS[k].job!==m.job);}
function skillsOf(m){const s=new Set(jobSkills(m));for(const k of m.slots)if(SKILLS[k].job!==m.job)s.add(k);return [...s];}
function setSlots(m,list){
  const c=new Set(slotCandidates(m));const out=[];
  for(const k of list){if(out.length>=SLOT_MAX)break;if(c.has(k)&&!out.includes(k))out.push(k);}
  m.slots=out;return out;
}
// パッシブの効果を足し合わせる
function passives(m){
  const e={};for(const k of skillsOf(m)){const S=SKILLS[k];if(S.kind!=='passive')continue;
    for(const x in S.eff){if(x==='guardCut')e[x]=Math.min(e[x]??1,S.eff[x]);else e[x]=(e[x]||0)+S.eff[x];}}
  return e;
}

// ---------- 装備 ----------
// 武器は3系統。どの職業でも装備できる。防具は1系統。強さは段階（番号）で決まる
//   ツメ：こうげき / つえ：まりょく（＋こうげき少し） / ふえ：こうげきとまりょくの両方に7割ずつ
// 名前は仮。素材から並ぶ装備（あなほり王）はまだ入れていない
// 11番目（番号10）までが店と宝箱。12番目（番号11）は、あなほり王の素材を持ち帰ると店に並ぶ最強装備（STAGE3.md）
const WEAPON_POW=[3,8,15,24,36,50,66,84,104,126,150,180];
const WEAPON_PRICE=[0,90,320,900,2400,5200,9800,16000,26000,40000,60000,90000];
const SHOP_TOP=10;
const WEAPON_LINES={
  claw: {name:'ツメ',names:['木のツメ','石のツメ','鉄のツメ','ユーカリのツメ','オパールのツメ','水晶のツメ','化石のツメ','いにしえのツメ','ほろびのツメ','レガシーのツメ','レガシーのツメ+','ほりおうのツメ'],atk:1,mag:0},
  staff:{name:'つえ',names:['木のつえ','石のつえ','鉄のつえ','ユーカリのつえ','オパールのつえ','水晶のつえ','化石のつえ','いにしえのつえ','ほろびのつえ','レガシーのつえ','レガシーのつえ+','ほりおうのつえ'],atk:.25,mag:1},
  flute:{name:'ふえ',names:['木のふえ','石のふえ','鉄のふえ','ユーカリのふえ','オパールのふえ','水晶のふえ','化石のふえ','いにしえのふえ','ほろびのふえ','レガシーのふえ','レガシーのふえ+','ほりおうのふえ'],atk:.7,mag:.7},
};
const ARMORS=[['草のふく',2,0],['かわのよろい',6,80],['いわのよろい',12,300],['こうらのよろい',19,850],['オパールのよろい',28,2200],
  ['水晶のよろい',38,4800],['化石のよろい',50,9000],['いにしえのよろい',63,15000],['ほろびのよろい',78,24000],['レガシーのよろい',94,38000],['レガシーのよろい+',112,56000],['ほりおうのよろい',135,80000]];
const WEAPONS=WEAPON_POW.map((p,i)=>[WEAPON_LINES.claw.names[i],p,WEAPON_PRICE[i]]); // 旧形式（段階の数を数えるのに使う）
function weaponName(m){return WEAPON_LINES[m.wl].names[m.w];}
// 職業に合う系統（おまかせで装備を選ぶときに使う）
function bestLine(job){const M=JOBS[job].mult;let best='claw',bs=-1;
  for(const l in WEAPON_LINES){const L=WEAPON_LINES[l];const sc=L.atk*M.atk+L.mag*M.mag;if(sc>bs){bs=sc;best=l;}}return best;}
const ITEMS={
  herb: {name:'やくそう',price:8,heal:30},
  herb2:{name:'上やくそう',price:30,heal:90},
  herb3:{name:'特上やくそう',price:120,heal:300},
  antidote:{name:'どくけし草',price:6,cure:true},
  water:{name:'まほうのしずく',price:40,mp:20},
  leaf: {name:'めざめの葉',price:80,revive:true},
  water2:{name:'まほうのしずく大',price:220,mp:80},
  lure:{name:'アリづかの かけら',price:600,lure:15,field:true}, // ダンジョンで使う。15回の戦闘のあいだ ハリモグラが よく出る
};

// おまもり：1匹に1つ。決まった状態異常に かかる確率を 1/4 にする（STAGE3.md）
const CHARMS={
  sleep:  {name:'ねむらずの はっぱ',st:'sleep',  price:1200},
  stun:   {name:'しびれよけの いし',st:'stun',   price:1200},
  poison: {name:'どくよけの はね',  st:'poison', price:900},
  silence:{name:'こえまもりの すず',st:'silence',price:1500},
};
const ST_JP2={sleep:'ねむり',stun:'まひ',poison:'どく',silence:'ふういん'};
function charmMul(m,st){return m.charm&&CHARMS[m.charm]&&CHARMS[m.charm].st===st?.25:1;}

// ---------- 仲間 ----------
function baseStat(m,k){const b=CONFIG.base[k];return (b[0]+b[1]*(m.lv-1))*(JOBS[m.job].mult[k]??1);}
function derived(m){
  const p=passives(m),w=WEAPON_POW[m.w],L=WEAPON_LINES[m.wl||'claw'],a=ARMORS[m.a][1];
  const st=k=>Math.floor(baseStat(m,k)*(1+(p[k]||0)));
  const d={maxhp:st('hp'),maxmp:st('mp'),atk:st('atk')+Math.floor(w*L.atk),def:st('def')+a,mag:st('mag')+Math.floor(w*L.mag),spd:st('spd')};
  d.p=p;return d;
}
function newMember(job,name){
  const m={name,job,lv:1,exp:0,wl:bestLine(job),w:0,a:0,own:{claw:0,staff:0,flute:0},hp:1,mp:0,poison:false,mastered:{},jobLv:{},learned:{},slots:[],totalExp:0};
  learnUpTo(m);const d=derived(m);m.hp=d.maxhp;m.mp=d.maxmp;return m;
}
function learnUpTo(m){const got=[];for(const k of jobSkills(m))if(!m.learned[k]){m.learned[k]=1;got.push(k);}return got;}
// 1匹ずつ数える解放条件
function jobUnlocked(m,job,G){
  const J=JOBS[job];if(J.tier===1)return true;
  return J.req.every(r=>m.mastered[r]);
}
function canChangeJob(G){return !!(G&&G.flags&&G.flags.jobChange);}
// 転職したとき、その職業で何レベルから始まるか
function jobStartLv(m,job){if(m.mastered[job])return JOBS[job].cap;const p=(m.jobLv||{})[job];return p?Math.min(p.lv,JOBS[job].cap):1;}
function changeJob(m,job){
  if(!jobUnlocked(m,job))return false;
  // 職業ごとのレベルを覚えておく。戻ったときは前回のレベルから（極めた職業はレベル上限のまま）
  m.jobLv=m.jobLv||{};
  if(m.job)m.jobLv[m.job]={lv:m.lv,exp:m.exp};
  const prev=m.jobLv[job];
  m.job=job;
  if(m.mastered[job]){m.lv=JOBS[job].cap;m.exp=0;}
  else if(prev){m.lv=Math.min(prev.lv,JOBS[job].cap);m.exp=prev.exp||0;}
  else{m.lv=1;m.exp=0;}
  learnUpTo(m);
  // 今の職業のスキルが枠にあったら外す
  m.slots=m.slots.filter(k=>SKILLS[k].job!==job);
  const d=derived(m);m.hp=d.maxhp;m.mp=d.maxmp;m.poison=false;return true;
}
// 経験値。返り値はメッセージ
// 経験者ボーナス：上級職を 1つでも 極めた仲間は、基本職の 経験値が 3倍（2回目以降の 基本職育成を 短くする）
const VET_MUL=3;
function vetBonus(m){return JOBS[m.job].tier===1&&Object.keys(m.mastered||{}).some(j=>m.mastered[j]&&JOBS[j]&&JOBS[j].tier>=2);}
function gainExp(m,amt){
  const out=[],J=JOBS[m.job];if(m.hp<=0)return out;
  if(vetBonus(m))amt*=VET_MUL;
  m.totalExp+=amt;
  if(m.lv>=J.cap)return out;
  m.exp+=amt;
  while(m.lv<J.cap&&m.exp>=expNext(m.job,m.lv)){
    m.exp-=expNext(m.job,m.lv);const before=derived(m);m.lv++;const after=derived(m);
    out.push(`${m.name}は レベル${m.lv}に あがった！`);
    m.hp=after.maxhp;m.mp=after.maxmp; // 前作と同じく、レベルアップで全回復（テンポのため）
    if(m.lv>=J.cap){const before=Object.keys(JOBS).filter(j=>jobUnlocked(m,j));m.mastered[m.job]=true;m.exp=0;out.push(`${m.name}は ${J.name}を きわめた！`);
      for(const j of Object.keys(JOBS))if(!before.includes(j)&&jobUnlocked(m,j))out.push(`${m.name}は ${JOBS[j].name}に 転職できるように なった！`);}
    for(const k of learnUpTo(m))out.push(`${m.name}は「${SKILLS[k].name}」を おぼえた！`);
  }
  return out;
}

// ---------- 敵 ----------
// 種類（archetype）ごとの倍率。名前と図鑑は、エリアごとに実在の動物を当てはめて決める（未定）
const ARCH={
  normal:{hp:1,  atk:1,  def:1,  spd:1},
  tank:  {hp:1.8,atk:.9, def:2.0,spd:.6},
  fast:  {hp:.7, atk:.95,def:.8, spd:1.6},
  heavy: {hp:1.3,atk:1.4,def:1.1,spd:.6},
  poison:{hp:.9, atk:.9, def:.9, spd:1.1,moves:[{n:'こうげき',k:'atk',w:2},{n:'どくのキバ',k:'atk',poison:.5,w:2}]},
  caller:{hp:1,  atk:1,  def:.9, spd:1.2,moves:[{n:'こうげき',k:'atk',w:4},{n:'なかまをよぶ',k:'call',w:1}]},
  wide:  {hp:.9, atk:.9, def:.9, spd:1,  moves:[{n:'こうげき',k:'atk',w:2},{n:'なぎはらう',k:'all',pow:.6,w:1}]},
  twice: {hp:.8, atk:.8, def:.8, spd:1.4,acts:2},
  metal: {metal:1},metal2:{metal:2},metal3:{metal:3},
  // 特徴的な攻撃をする敵（名前は仮。エリアごとに実在の動物を当てはめる）
  sleeper:{hp:.9,atk:.8, def:.9, spd:1.1,moves:[{n:'こうげき',k:'atk',w:2},{n:'ねむりのこな',k:'sleepAll',rate:.35,w:1}]},
  stunner:{hp:1, atk:.9, def:1,  spd:1,  moves:[{n:'こうげき',k:'atk',w:2},{n:'しびれのしっぽ',k:'atk',pow:.9,stun:.45,w:2}]},
  jammer: {hp:.9,atk:.8, def:.9, spd:1.3,moves:[{n:'こうげき',k:'atk',w:2},{n:'いやなおと',k:'dispel',w:1},{n:'MPをすいとる',k:'drain',w:1}]},
  bomber: {hp:.8,atk:1,  def:.8, spd:.9, moves:[{n:'こうげき',k:'atk',w:3},{n:'じばく',k:'boom',pow:1.8,w:1}]},
  medic:  {hp:.9,atk:.7, def:.9, spd:1.2,prio:true,moves:[{n:'こうげき',k:'atk',w:2},{n:'なかまをなおす',k:'healAlly',w:2}]},
  sniper: {hp:.8,atk:1.1,def:.8, spd:1.3,moves:[{n:'ねらいうち',k:'snipe',pow:1.3,w:2},{n:'こうげき',k:'atk',w:1}]},
  counter:{hp:1.1,atk:1, def:1.1,spd:.9, counter:.35},
  mirror: {hp:1, atk:.9, def:1.2,spd:1,  reflect:true},
  charger:{hp:1.2,atk:1.1,def:1, spd:.8, moves:[{n:'ちからをためる',k:'charge',w:2},{n:'こうげき',k:'atk',w:1}]},
  evasive:{hp:.7,atk:.9, def:.7, spd:1.6,evade:.4},
  // 魔法系・デバフ系（魔法とブレスは、ぼうぎょに関係なくダメージ）
  mage:   {hp:.8,atk:.6, def:.8, spd:1.1,mag:1.0,moves:[{n:'こうげき',k:'atk',w:1},{n:'でんげき',k:'magic',pow:1.0,w:2},{n:'ほうでん',k:'magicAll',pow:.6,w:1}]},
  hexer:  {hp:.9,atk:.8, def:.9, spd:1.2,moves:[{n:'こうげき',k:'atk',w:2},{n:'わらいごえ',k:'debuffAll',st:'atk',w:1}]},
  frill:  {hp:1, atk:.9, def:1,  spd:1,  moves:[{n:'こうげき',k:'atk',w:2},{n:'いかく',k:'debuffAll',st:'def',w:1}]},
  silencer:{hp:.9,atk:.8,def:.9, spd:1.3,moves:[{n:'こうげき',k:'atk',w:2},{n:'ものまね',k:'silence',rate:.5,w:1}]},
  // コアラ（強敵。強力な魔法。職業別コアラもいる）
  koala:  {hp:5,atk:.7,def:1.2,spd:1.4,mag:2.6,moves:[{n:'ひっかく',k:'atk',w:1},{n:'こおりのまほう',k:'magic',pow:1.2,w:2},{n:'ねむけを さそう',k:'sleepAll',rate:.35,w:1}]},
  kMage:  {hp:3.6,atk:.6,def:1.2,spd:1.5,mag:2.4,moves:[{n:'ほのおのまほう',k:'magic',pow:1.3,w:2},{n:'だいばくはつ',k:'magicAll',pow:.9,w:2},{n:'ねむけを さそう',k:'sleepAll',rate:.3,w:1}]},
  kPriest:{hp:3.2,atk:.6,def:1.3,spd:1.4,mag:1.3,prio:true,moves:[{n:'なかまを なおす',k:'healAlly',w:2},{n:'なかまを よみがえらせる',k:'reviveAlly',w:2},{n:'ひかりのまほう',k:'magic',pow:1.0,w:1}]},
  kSinger:{hp:3.2,atk:.9,def:1.2,spd:1.5,mag:1.2,prio:true,moves:[{n:'はげましの歌',k:'ebuff',w:2},{n:'ねむりの歌',k:'sleepAll',rate:.35,w:1},{n:'ひっかく',k:'atk',w:1}]},
  kPoison:{hp:3.2,atk:.8,def:1.2,spd:1.5,mag:1.4,moves:[{n:'どくのきり',k:'magicAll',pow:.5,poison:.6,w:2},{n:'ふういんの歌',k:'silence',rate:.6,w:1},{n:'のろい',k:'debuffAll',st:'def',w:1}]},
  kWarrior:{hp:4.5,atk:1.2,def:1.6,spd:1.2,moves:[{n:'なかまを かばう',k:'eguard',w:2},{n:'つよいこうげき',k:'atk',pow:1.4,w:2}]},
  kKarate:{hp:3.0,atk:1.1,def:1.2,spd:1.5,counter:.35,acts:2,moves:[{n:'せいけんづき',k:'atk',pow:1.2,w:3},{n:'きあいを ためる',k:'charge',w:1}]},
};
// ハリモグラ（1発 1ダメージ、すぐ にげる、経験値が 多い）。2・3 は深い階だけに出る すごい ハリモグラ
const METAL={1:{hp:5,flee:.35,spd:3,exp:12,gold:3},2:{hp:8,flee:.38,spd:3.5,exp:40,gold:10},3:{hp:9,flee:.38,spd:4,exp:100,gold:40}};
// 出る確率（アリづかの かけらを 使っている間は LURE_MUL 倍）
const METAL_RATE={echidna:.04,opalEchidna:.02,goldEchidna:.01},LURE_MUL=4;
function mkEnemy(f,arch,opt){
  opt=opt||{};const A=ARCH[arch];
  const v=(k)=>curve(k,f);
  let e;
  if(A.metal){const M=METAL[A.metal];e={hp:M.hp,max:M.hp,atk:Math.round(v('atk')*1.2),def:0,spd:Math.round(v('spd')*M.spd),exp:Math.round(v('exp')*M.exp),gold:Math.round(v('gold')*M.gold),metal:A.metal,flee:M.flee};}
  else e={hp:Math.round(v('hp')*A.hp),atk:Math.round(v('atk')*A.atk),def:Math.round(v('def')*A.def),spd:Math.round(v('spd')*A.spd),
    exp:Math.round(v('exp')*Math.max(1,A.hp)),gold:Math.round(v('gold')*Math.max(1,A.hp)),acts:A.acts||1,moves:A.moves,
    counter:A.counter,reflect:A.reflect,evade:A.evade,prio:A.prio,mag:Math.round(v('atk')*.55*(A.mag||0))};
  if(opt.boss){const B=CONFIG.boss[opt.boss];e.hp=Math.round(v('hp')*B.hp);e.atk=Math.round(v('atk')*B.atk);e.def=Math.round(v('def')*B.def);e.spd=Math.round(v('spd')*1.1);
    e.exp=Math.round(v('exp')*B.exp);e.gold=Math.round(v('gold')*B.gold);e.boss=true;e.acts=opt.boss==='big'&&f>=20?2:1;
    e.moves=[{n:'こうげき',k:'atk',w:3},{n:'つよいこうげき',k:'atk',pow:1.6,w:2},{n:'あばれまわる',k:'all',pow:.7,w:2},{n:'どくのいき',k:'all',pow:.4,poison:.35,w:f>=10?1:0}];
    // エリアが深いほど、ボスの技が増える
    if(f>=15)e.moves.push({n:'ねむりのうた',k:'sleepAll',rate:.25,w:1});
    if(f>=25)e.moves.push({n:'かきけす',k:'dispel',w:1});
    if(f>=30)e.moves.push({n:'ちからをためる',k:'charge',w:1});
    if(f>=40)e.moves.push({n:'ねらいうち',k:'snipe',pow:1.5,w:1});
    // 魔法とデバフも深いほど増える
    e.mag=Math.round(v('atk')*.55*1.2);
    if(f>=25)e.moves.push({n:'まほうの あらし',k:'magicAll',pow:.7,w:1});
    if(f>=30)e.moves.push({n:'よわらせる',k:'debuffAll',st:'atk',w:1});
    if(f>=35)e.moves.push({n:'ふういん',k:'silence',rate:.4,w:1});}
  if(opt.boss&&CONFIG.bossOverride[f])Object.assign(e,CONFIG.bossOverride[f]);
  e.max=e.hp;e.arch=arch;e.f=f;e.name=opt.name||(opt.boss?`B${f}のボス`:`${arch}(B${f})`);e.st={};e.res={};e.weak=opt.weak||[];
  return e;
}
// その階に出る敵の組み合わせ（仮）
// ---------- 動物（敵）：STAGE2.md の表 ----------
// arch: 種類（ARCH）。関数なら階で変わる / spr・pal・s: ドット絵 / weak: 弱点 / moves: 技の名前を動物らしく
// from: その階から出る / fic: 空想の生き物（図鑑にそう書く）
const ANIMALS={
  ant:   {name:'ブルドッグアリ',arch:'normal',spr:'ant',pal:'antR',weak:['fire'],moves:[{n:'かみつく',k:'atk',w:1}]},
  fox:   {name:'アカギツネ',arch:'fast',spr:'fox',pal:'fox',weak:['ice']},
  spider:{name:'ハンツマン',arch:'fast',spr:'spider',pal:'spid',weak:['fire']},
  goanna:{name:'ゴアナ',arch:'wide',spr:'croc',pal:'goanna',s:.8,weak:['ice'],moves:[{n:'かみつく',k:'atk',w:2},{n:'しっぽで なぎはらう',k:'all',pow:.6,w:1}]},
  tiger: {name:'タイガースネーク',arch:'poison',spr:'snake',pal:'tiger',weak:['ice'],moves:[{n:'かみつく',k:'atk',w:2},{n:'どくのキバ',k:'atk',poison:.5,w:2}]},
  toad:  {name:'オオヒキガエル',arch:'heavy',spr:'toad',pal:'toad',weak:['thunder'],moves:[{n:'たいあたり',k:'atk',w:3},{n:'どくのしるを とばす',k:'all',pow:.5,poison:.35,w:1}]},
  koala: {name:'コアラ',arch:'koala',spr:'koala',pal:'koalaN',weak:['fire']},
  wantr: {name:'ツムギアリ',arch:'caller',spr:'ant',pal:'antG',weak:['fire'],moves:[{n:'かみつく',k:'atk',w:4},{n:'なかまを よぶ',k:'call',w:1}]},
  eagle: {name:'オナガイヌワシ',arch:'sniper',spr:'eagle',pal:'eagle',weak:['thunder'],moves:[{n:'ねらいうち',k:'snipe',pow:1.3,w:2},{n:'つめで ひっかく',k:'atk',w:1}]},
  kooka: {name:'ワライカワセミ',arch:'hexer',spr:'eagle',pal:'kooka',s:.75,weak:['ice']},
  crab:  {name:'ノコギリガザミ',arch:f=>f<11?'tank':'counter',spr:'crab',pal:'crab',weak:['thunder'],moves:[{n:'はさむ',k:'atk',w:3},{n:'おおばさみ',k:'atk',pow:1.4,w:1}]},
  honey: {name:'ミツツボアリ',arch:'medic',spr:'ant',pal:'honey',weak:['fire'],moves:[{n:'かみつく',k:'atk',w:2},{n:'ミツを わける',k:'healAlly',w:2}]},
  dingo: {name:'ディンゴ',arch:'twice',spr:'dingo',pal:'dingo',weak:['fire'],moves:[{n:'かみつく',k:'atk',w:1}]},
  frill: {name:'エリマキトカゲ',arch:'frill',spr:'croc',pal:'frill',s:.7,weak:['ice']},
  echidna:{name:'ハリモグラ',arch:'metal',spr:'echidna',pal:'echidna'},
  opalEchidna:{name:'オパールハリモグラ',arch:'metal2',spr:'echidna',pal:'opalE',s:1.05},
  goldEchidna:{name:'おうごんハリモグラ',arch:'metal3',spr:'echidna',pal:'goldE',s:1.12},
  devil: {name:'タスマニアデビル',arch:'jammer',spr:'devil',pal:'devil',weak:['light'],moves:[{n:'かみつく',k:'atk',w:2},{n:'さけびごえ',k:'dispel',w:1},{n:'MPを すいとる',k:'drain',w:1}]},
  octo:  {name:'ヒョウモンダコ',arch:'stunner',spr:'octo',pal:'octo',weak:['thunder'],moves:[{n:'からみつく',k:'atk',w:2},{n:'かみついて まひさせる',k:'atk',pow:.9,stun:.45,w:2}]},
  lyre:  {name:'コトドリ',arch:'silencer',spr:'eagle',pal:'lyre',s:.75,weak:['thunder']},
  ssnake:{name:'ウミヘビ',arch:'poison',spr:'snake',pal:'sea',weak:['thunder'],moves:[{n:'かみつく',k:'atk',w:2},{n:'どくのキバ',k:'atk',poison:.6,w:2}]},
  ray:   {name:'シビレエイ',arch:'mage',spr:'ray',pal:'ray',weak:['ice']},
  perentie:{name:'ペレンティ',arch:'wide',spr:'croc',pal:'perentie',weak:['ice'],moves:[{n:'かみつく',k:'atk',w:2},{n:'しっぽで なぎはらう',k:'all',pow:.6,w:1},{n:'どくのよだれ',k:'atk',poison:.5,w:1}]},
  ffox:  {name:'オオコウモリ',arch:'evasive',spr:'bat',pal:'bat',weak:['ice']},
  croc:  {name:'イリエワニ',arch:'charger',spr:'croc',pal:'croc',weak:['thunder'],moves:[{n:'ちからを ためる',k:'charge',w:2},{n:'かみつく',k:'atk',w:1}]},
  kMage: {name:'まほうつかいコアラ',arch:'kMage',spr:'koala',pal:'kMage',weak:['light']},
  kPriest:{name:'そうりょコアラ',arch:'kPriest',spr:'koala',pal:'kPriest',weak:['thunder']},
  kSinger:{name:'うたいてコアラ',arch:'kSinger',spr:'koala',pal:'kSinger',weak:['ice']},
  kPoison:{name:'どくつかいコアラ',arch:'kPoison',spr:'koala',pal:'kPoison',weak:['fire']},
  kWarrior:{name:'せんしコアラ',arch:'kWarrior',spr:'koala',pal:'kWarrior',weak:['thunder']},
  kKarate:{name:'からてかコアラ',arch:'kKarate',spr:'koala',pal:'kKarate',weak:['ice']},
  // B21〜30 地下水脈の層（STAGE3.md）
  platy: {name:'カモノハシ',arch:'poison',spr:'platy',pal:'platy',weak:['ice'],moves:[{n:'かみつく',k:'atk',w:2},{n:'けづめの どく',k:'atk',pow:1.1,poison:.6,w:2}]},
  yabby: {name:'ヤビー',arch:'counter',spr:'crab',pal:'yabby',s:.85,weak:['thunder'],moves:[{n:'はさむ',k:'atk',w:3},{n:'おおばさみ',k:'atk',pow:1.4,w:1}]},
  rakali:{name:'ラカリ',arch:'twice',spr:'rat',pal:'rakali',weak:['ice'],moves:[{n:'かみつく',k:'atk',w:1}]},
  archer:{name:'テッポウウオ',arch:'sniper',spr:'fish',pal:'archer',s:.8,weak:['thunder'],moves:[{n:'みずでっぽう',k:'snipe',pow:1.3,w:2},{n:'たいあたり',k:'atk',w:1}]},
  glow:  {name:'ツチボタル',arch:'stunner',spr:'glow',pal:'glow',weak:['fire'],moves:[{n:'あおい ひかりで さそう',k:'sleepAll',rate:.3,w:1},{n:'ねばねばの いと',k:'atk',pow:.8,stun:.45,w:2}]},
  ghost: {name:'ゴーストコウモリ',arch:'evasive',spr:'bat',pal:'ghost',weak:['light'],moves:[{n:'かみつく',k:'atk',w:2},{n:'ねらいうち',k:'snipe',pow:1.3,w:1}]},
  cod:   {name:'マーレーコッド',arch:'heavy',spr:'fish',pal:'cod',weak:['thunder'],moves:[{n:'たいあたり',k:'atk',w:2},{n:'まるのみ',k:'atk',pow:1.8,w:1}]},
  turtle:{name:'ナガクビガメ',arch:'tank',spr:'turtle',pal:'turtle',weak:['thunder'],moves:[{n:'かみつく',k:'atk',w:2},{n:'くさい しる',k:'debuffAll',st:'atk',w:1}]},
  fwcroc:{name:'ジョンストンワニ',arch:'charger',spr:'croc',pal:'fwcroc',s:.85,weak:['thunder'],moves:[{n:'ちからを ためる',k:'charge',w:2},{n:'かみつく',k:'atk',w:1}]},
  // B31〜40 オパールの層
  thorny:{name:'モロクトカゲ',arch:'counter',spr:'croc',pal:'thorny',s:.6,weak:['ice'],moves:[{n:'トゲで つつく',k:'atk',w:1}]},
  redroo:{name:'アカカンガルー',arch:'twice',spr:'roo',pal:'redroo',weak:['ice'],moves:[{n:'キック',k:'atk',pow:1.2,w:2},{n:'ボクシング',k:'atk',w:1}]},
  emu:   {name:'エミュー',arch:'fast',spr:'emu',pal:'emu',weak:['thunder'],moves:[{n:'けりとばす',k:'atk',pow:1.2,w:2},{n:'つつく',k:'atk',w:1}]},
  bilby: {name:'ミミナガバンディクート',arch:'evasive',spr:'bilby',pal:'bilby',weak:['ice'],moves:[{n:'ひっかく',k:'atk',w:1}]},
  taipan:{name:'ナイリクタイパン',arch:'poison',spr:'snake',pal:'taipan',weak:['ice'],moves:[{n:'かみつく',k:'atk',w:1},{n:'もうどくの キバ',k:'atk',poison:.7,w:2}]},
  scorp: {name:'サソリ',arch:'stunner',spr:'scorp',pal:'scorp',weak:['ice'],moves:[{n:'はさむ',k:'atk',w:2},{n:'どくばり',k:'atk',pow:.9,stun:.4,poison:.3,w:2}]},
  galah: {name:'モモイロインコ',arch:'caller',spr:'eagle',pal:'galah',s:.7,weak:['thunder'],moves:[{n:'つつく',k:'atk',w:3},{n:'なかまを よぶ',k:'call',w:1},{n:'さわぎたてる',k:'debuffAll',st:'atk',w:1}]},
  shingle:{name:'マツカサトカゲ',arch:'tank',spr:'croc',pal:'shingle',s:.65,weak:['ice'],moves:[{n:'かみつく',k:'atk',w:2},{n:'あおい したで おどかす',k:'debuffAll',st:'def',w:1}]},
  // B41〜50 太古の層（化石から よみがえった すがた＝空想）
  thyla: {name:'フクロオオカミ',arch:'twice',spr:'thyla',pal:'thyla',weak:['fire'],fic:true,moves:[{n:'かみつく',k:'atk',w:1}]},
  procop:{name:'プロコプトドン',arch:'heavy',spr:'roo',pal:'procop',s:1.25,weak:['ice'],fic:true,moves:[{n:'けりとばす',k:'atk',pow:1.3,w:2},{n:'のしかかる',k:'all',pow:.6,w:1}]},
  genyo: {name:'ゲニオルニス',arch:'wide',spr:'emu',pal:'genyo',s:1.25,weak:['thunder'],fic:true,moves:[{n:'つつく',k:'atk',w:2},{n:'ふみならす',k:'all',pow:.6,w:1}]},
  meio:  {name:'メイオラニア',arch:'mirror',spr:'hturtle',pal:'meio',s:1.2,weak:['thunder'],fic:true,moves:[{n:'ツノで つく',k:'atk',w:2},{n:'しっぽの こんぼう',k:'atk',pow:1.4,w:1}]},
  wonambi:{name:'ウォナンビ',arch:'stunner',spr:'snake',pal:'wonambi',s:1.2,weak:['ice'],fic:true,moves:[{n:'しめつける',k:'atk',stun:.45,w:2},{n:'かみつく',k:'atk',w:1}]},
  quink: {name:'クインカナ',arch:'sniper',spr:'croc',pal:'quink',weak:['thunder'],fic:true,moves:[{n:'おいかける',k:'snipe',pow:1.3,w:2},{n:'きりさく',k:'atk',pow:1.2,w:1}]},
  thyleo:{name:'フクロライオン',arch:'charger',spr:'lion',pal:'thyleo',weak:['ice'],fic:true,moves:[{n:'かみくだく',k:'atk',pow:1.5,w:2},{n:'ちからを ためる',k:'charge',w:1}]},
};
// B1〜20 の出かた [この階から, この階まで, 組み合わせ]
const POOL20=[
  // B1〜10：前作の動物とコアラ（B10で出なくなる。10階ごとに大きく入れかえる＝決定）
  [1,6,['ant','ant']],[1,7,['fox']],[1,8,['ant','fox']],
  [2,9,['spider']],[2,9,['ant','spider']],
  [3,10,['goanna']],[3,10,['tiger']],[3,8,['ant','ant','ant']],
  [4,10,['toad']],[4,10,['koala']],[4,10,['tiger','ant']],
  [5,10,['wantr']],[5,10,['wantr','fox']],
  [6,10,['eagle','ant']],[6,10,['kooka','fox']],
  [7,10,['crab']],[7,10,['crab','spider']],
  [8,10,['honey','crab']],[8,10,['dingo']],
  [9,10,['frill','dingo']],[9,10,['frill','goanna']],
  // B11〜20：ユーカリの根の層（デビル・タコ・コトドリ・コアラ一族など）
  [11,20,['devil']],[11,20,['devil','octo']],[11,20,['octo','octo']],[11,20,['ssnake']],[11,16,['crab']],[11,20,['crab','ssnake']],[11,20,['kMage']],
  [12,20,['lyre','devil']],[12,20,['perentie']],[13,20,['ray','ray']],[13,20,['kPriest','crab']],[13,20,['perentie','ssnake']],
  [14,20,['ffox','ffox']],[14,20,['lyre','octo']],[15,20,['kSinger','perentie']],[15,20,['croc']],[16,20,['croc','ray']],[16,20,['kPoison','devil']],
  [18,20,['kWarrior','ssnake']],[18,20,['kKarate']],
  // B21〜30：地下水脈の層（c: は色違い）
  [21,30,['platy']],[21,30,['platy','yabby']],[21,26,['rakali','rakali']],[21,30,['yabby']],[21,25,['c:dingo']],[21,30,['c:koala']],
  [22,30,['archer','archer']],[22,30,['archer','yabby']],[22,30,['c:kMage']],
  [23,30,['glow','glow']],[23,30,['glow','rakali']],[23,30,['c:kPriest','rakali']],
  [24,30,['ghost']],[24,30,['ghost','c:ray']],[24,30,['c:kSinger','cod']],
  [25,30,['cod']],[25,30,['cod','archer']],[25,30,['c:kWarrior','c:kMage']],
  [26,30,['turtle','platy']],[26,30,['turtle','c:ssnake']],[26,30,['c:kPoison','yabby']],
  [27,30,['fwcroc']],[27,30,['fwcroc','glow']],[28,30,['c:kKarate']],[28,30,['c:octo','ghost']],
  // B31〜40：オパールの層
  [31,40,['thorny']],[31,40,['thorny','redroo']],[31,36,['redroo']],[31,40,['c:goanna','c:frill']],[31,40,['c:koala']],
  [32,40,['emu','emu']],[32,40,['bilby','emu']],[32,40,['c:kMage','c:kPriest']],
  [33,40,['taipan']],[33,40,['scorp','scorp']],[33,40,['taipan','bilby']],[33,40,['c:devil','emu']],
  [34,40,['galah','galah']],[34,40,['galah','thorny']],[34,40,['c:lyre','redroo']],
  [35,40,['shingle','scorp']],[35,40,['shingle','redroo']],[35,40,['c:kSinger','c:kKarate']],
  [36,40,['c:kWarrior','c:kMage']],[37,40,['c:eagle','c:eagle']],[37,40,['c:kPoison','taipan']],
  // B41〜50：太古の層
  [41,50,['thyla']],[41,50,['thyla','thyla']],[41,50,['procop']],[41,50,['c:koala','c:honey']],[41,50,['c:kMage','c:kMage']],
  [42,50,['genyo','thyla']],[42,50,['genyo','genyo']],[42,50,['c:kPriest','thyla']],
  [43,50,['meio']],[43,50,['meio','procop']],[43,50,['c:devil','procop']],
  [44,50,['wonambi']],[44,50,['wonambi','genyo']],[44,50,['c:kooka','c:croc']],
  [45,50,['quink']],[45,50,['quink','thyla']],[45,50,['c:kPoison','c:lyre']],
  [46,50,['thyleo']],[46,50,['c:kSinger','c:kKarate']],[47,50,['thyleo','meio']],[47,50,['c:ray','c:ray','wonambi']],
];
// B21〜：種類から、色違いの動物を当てる（名前と色は仮）
const ARCH_ANIMAL={normal:'dingo',tank:'crab',fast:'fox',heavy:'toad',poison:'tiger',caller:'wantr',wide:'goanna',twice:'dingo',sleeper:'koala',
  stunner:'octo',jammer:'devil',bomber:'toad',medic:'honey',sniper:'eagle',counter:'crab',mirror:'lyre',charger:'croc',evasive:'ffox',mage:'ray',
  hexer:'kooka',frill:'frill',silencer:'lyre',koala:'koala',kMage:'kMage',kPriest:'kPriest',kSinger:'kSinger',kPoison:'kPoison',kWarrior:'kWarrior',kKarate:'kKarate'};
// 色違いの名前（エリアごと）。B21〜 で前作などの動物が色違いで出る。技を1つ足す（STAGE3.md）
const AREA_COLOR=['','','あお','きん','くろ'];
const COLOR_MOVE={'あお':{n:'みずを はく',k:'magic',pow:.8,w:1},'きん':{n:'まぶしい ひかり',k:'debuffAll',st:'atk',w:1},'くろ':{n:'やみの いき',k:'magicAll',pow:.5,w:1}};
const areaIdx=f=>Math.min(4,Math.floor((f-1)/10));
function floorGroups(f){
  return {pool:POOL20.filter(([a,b])=>f>=a&&f<=b).map(x=>x[2]),metalRate:.04};
}
// 動物か種類から、敵を1体つくる。'c:動物' は色違い。どれでもなければ種類（ARCH）に動物を当てる
function mkMob(f,key){
  let id=key,arch,A,color='';
  if(key.startsWith('c:')){id=key.slice(2);A=ANIMALS[id];color=AREA_COLOR[areaIdx(f)];}
  else A=ANIMALS[key];
  if(A)arch=typeof A.arch==='function'?A.arch(f):A.arch;
  else{arch=key;id=ARCH_ANIMAL[key]||'dingo';A=ANIMALS[id];color=AREA_COLOR[areaIdx(f)];}
  const e=mkEnemy(f,arch,{name:color+A.name,weak:A.weak||[]});
  e.id=id;e.color=color;e.look={spr:A.spr,pal:A.pal,s:A.s||1,tint:color};
  if(A.moves&&!ARCH[arch].metal)e.moves=A.moves;
  if(color&&COLOR_MOVE[color]&&e.moves){e.moves=e.moves.concat([COLOR_MOVE[color]]);if(!e.mag)e.mag=Math.round(curve('atk',f)*.55*.8);}
  if(f>=31&&f<=40)e.gold=Math.round(e.gold*1.5); // オパールの層はお金が多い
  return e;
}
function rollGroup(f,r,lure){
  const G=floorGroups(f),mul=lure?LURE_MUL:1;
  if(f>=31&&r()<METAL_RATE.goldEchidna*mul)return [mkMob(f,'goldEchidna')];
  if(f>=21&&r()<METAL_RATE.opalEchidna*mul)return [mkMob(f,'opalEchidna')];
  if(r()<G.metalRate*mul){const n=f>=11&&r()<.3?2+(r()<.4?1:0):1;return Array.from({length:n},()=>mkMob(f,'echidna'));}
  const g=G.pool[Math.floor(r()*G.pool.length)];
  return g.map(a=>mkMob(f,a));
}
// 名前と技を決めたボス（STAGE2.md）。ほかの階は、ふつうのボスの技
const BOSS_DEF={
  5: {name:'ツムギアリの女王',look:{spr:'ant',pal:'antQ',s:1.6},weak:['fire'],arch:'normal',moves:[{n:'かみつく',k:'atk',w:3},{n:'なかまを よぶ',k:'call',w:2},{n:'ぎ酸を とばす',k:'debuffAll',st:'def',w:1}]},
  10:{name:'ディンゴのおやぶん',look:{spr:'dingo',pal:'dboss',s:1.45},weak:['fire'],arch:'normal',moves:[{n:'とびかかる',k:'atk',pow:1.4,w:3},{n:'とおぼえ',k:'debuffAll',st:'atk',w:1},{n:'むれで おそう',k:'all',pow:.7,w:2},{n:'なかまを よぶ',k:'call',w:1}]},
  15:{name:'コアラのだいまどうし',look:{spr:'koala',pal:'kMageB',s:1.5},weak:['light'],arch:'kMage',mag:2.2,moves:[{n:'だいばくはつ',k:'magicAll',pow:.8,w:3},{n:'こおりのまほう',k:'magic',pow:1.3,w:2},{n:'ねむけを さそう',k:'sleepAll',rate:.3,w:1},{n:'ふういんの歌',k:'silence',rate:.5,w:1}]},
  25:{name:'カモノハシのぬし',hpMul:1.3,atkMul:1.3,look:{spr:'platy',pal:'platyB',s:1.5},weak:['ice'],arch:'normal',moves:[{n:'けづめの どく',k:'atk',pow:1.3,poison:.6,w:3},{n:'でんきを かんじる',k:'snipe',pow:1.5,w:2},{n:'みずを はねあげる',k:'magicAll',pow:.6,w:2},{n:'もぐって ちからを ためる',k:'charge',w:1}]},
  30:{name:'マーレーコッドのおおぬし',hpMul:1.56,atkMul:1.28,look:{spr:'fish',pal:'codB',s:1.6},weak:['thunder'],arch:'normal',moves:[{n:'まるのみ',k:'atk',pow:1.9,w:2},{n:'うずしお',k:'magicAll',pow:.8,w:2},{n:'しっぽで たたく',k:'atk',pow:1.2,w:2},{n:'なかまを よぶ',k:'call',w:1},{n:'どろを まきあげる',k:'debuffAll',st:'atk',w:1}]},
  35:{name:'アカカンガルーのチャンピオン',hpMul:1.17,atkMul:1.08,look:{spr:'roo',pal:'redrooB',s:1.5},weak:['ice'],arch:'normal',counter:.35,moves:[{n:'キック',k:'atk',pow:1.5,w:3},{n:'ジャブ',k:'atk',w:2},{n:'しっぽで たつ',k:'charge',w:1},{n:'ボクシングの かまえ',k:'ebuff',w:1}]},
  40:{name:'オパールのうみりゅう',hpMul:1.52,atkMul:1.27,look:{spr:'plesio',pal:'opal',s:1.4},weak:['thunder'],arch:'normal',fic:true,moves:[{n:'かみつく',k:'atk',pow:1.3,w:3},{n:'にじいろの ひかり',k:'magicAll',pow:.8,w:2},{n:'まぶしい ひかり',k:'debuffAll',st:'atk',w:1},{n:'ふういん',k:'silence',rate:.4,w:1},{n:'ちからを ためる',k:'charge',w:1}]},
  45:{name:'フクロライオンのぬし',hpMul:1.85,atkMul:1.36,look:{spr:'lion',pal:'thyleoB',s:1.5},weak:['ice'],arch:'normal',fic:true,evade:.25,moves:[{n:'かみくだく',k:'atk',pow:1.7,w:3},{n:'おやゆびの ツメ',k:'snipe',pow:1.5,w:2},{n:'ちからを ためる',k:'charge',w:1},{n:'ほえる',k:'debuffAll',st:'atk',w:1}]},
  50:{name:'メガラニア',hpMul:1.07,atkMul:.93,debuffRes:.5,look:{spr:'croc',pal:'megal',s:1.5},weak:[],arch:'normal',fic:true,moves:[{n:'かみつく',k:'atk',pow:1.4,w:3},{n:'しっぽで なぎはらう',k:'all',pow:.8,w:2},{n:'どくの よだれ',k:'all',pow:.5,poison:.5,w:1},{n:'ちからを ためる',k:'charge',w:1},{n:'いかく',k:'debuffAll',st:'def',w:1},{n:'ふういん',k:'silence',rate:.4,w:1}]},
  20:{name:'イリエワニのぬし',look:{spr:'croc',pal:'crocB',s:1.3},weak:['thunder'],arch:'normal',moves:[{n:'かみつく',k:'atk',pow:1.2,w:3},{n:'ちからを ためる',k:'charge',w:2},{n:'しっぽで なぎはらう',k:'all',pow:.7,w:2},{n:'いかく',k:'debuffAll',st:'def',w:1}]},
};
// 光る宝箱の番人（前作と同じく、ボスより強いことがある）。エリアに1体。倒すと店より1段上の装備
// めやす：その段階の上限レベル・満タンで勝率4〜6割（hp・atk はそのエリアの大ボスに対する倍率）
// 何度でも使える回復の道具（前作の「いやしの石」のようなもの）は出さない
const GUARDIANS={
  8: {name:'ゴアナの番人',     hp:1.3,atk:1.15,acts:2,look:{spr:'croc',pal:'goanna',s:1.1},reward:{line:'claw'},
      moves:[{n:'かみつく',k:'atk',pow:1.3,w:3},{n:'しっぽで なぎはらう',k:'all',pow:.8,w:2},{n:'いかく',k:'debuffAll',st:'def',w:1}]},
  18:{name:'ペレンティの番人', hp:1.0,atk:.85,acts:2,look:{spr:'croc',pal:'perentie',s:1.2},reward:{line:'staff'},
      moves:[{n:'かみつく',k:'atk',pow:1.3,w:3},{n:'どくのよだれ',k:'all',pow:.6,poison:.5,w:2},{n:'しっぽで なぎはらう',k:'all',pow:.8,w:1}]},
  28:{name:'しおだまりのぬし', hp:1.17,atk:1.09,acts:2,look:{spr:'crab',pal:'tide',s:1.4},reward:{line:'flute'},fic:true,
      moves:[{n:'おおばさみ',k:'atk',pow:1.5,w:3},{n:'あわを ふきかける',k:'magicAll',pow:.7,w:2},{n:'かたく なる',k:'eguard',w:1}]},
  38:{name:'コアラの大けんじゃ',hp:1.26,atk:1.16,acts:2,look:{spr:'koala',pal:'koalaG',s:1.5},mag:1.15,reward:{armor:true},
      moves:[{n:'だいばくはつ',k:'magicAll',pow:.9,w:3},{n:'ふういんの歌',k:'silence',rate:.6,w:1},{n:'まりょくを たかめる',k:'ebuff',w:1},{n:'ねむけを さそう',k:'sleepAll',rate:.35,w:1}]},
  48:{name:'いにしえの番人',   hp:1.29,atk:1.23,acts:2,look:{spr:'dingo',pal:'ancient',s:1.45},reward:{line:'best'},fic:true,
      moves:[{n:'かみつく',k:'atk',pow:1.4,w:3},{n:'とびかかる',k:'atk',pow:1.8,w:1},{n:'とおぼえ',k:'debuffAll',st:'atk',w:1},{n:'ちからを ためる',k:'charge',w:1}]},
};
// ---------- コアラ討伐（STAGE3.md の8d） ----------
// 村の近くに出るようになったコアラを、長老の依頼で追い返す。ダンジョンとは別の寄り道。会話はしない
// plan：決まった順番の行動。tele つきの技は、前のターンの終わりに予告する
const A=(n,o)=>Object.assign({n,k:'atk'},o||{}),M=(n,pow,o)=>Object.assign({n,k:'magic',pow},o||{}),MA=(n,pow,o)=>Object.assign({n,k:'magicAll',pow},o||{});
const RAIDS=[
  {id:'r1',unlock:15,f:16,name:'村はずれの コアラたち',hint:'せんしコアラが まほうつかいを かばい、そうりょコアラが 回復する。まほうつかいコアラは ときどき 大魔法を ためる。',
   members:[
    {name:'せんしコアラ',pal:'kWarrior',hp:4.2,atk:1.2,def:1.6,plan:[{n:'なかまを かばう',k:'eguard'},A('つよいこうげき',{pow:1.3}),{n:'なかまを かばう',k:'eguard'},A('こうげき')]},
    {name:'まほうつかいコアラ',pal:'kMage',hp:3.0,mag:2.1,plan:[M('ほのおのまほう',1.0),M('こおりのまほう',1.0),MA('ほのおの だいまほう',1.5,{tele:'まほうの ちからを ためている…'})]},
    {name:'そうりょコアラ',pal:'kPriest',hp:3.0,mag:1.4,plan:[{n:'いやしの まほう',k:'healAllE',pct:.16},M('ひかりのまほう',.8),{n:'なかまを よみがえらせる',k:'reviveAlly'},{n:'いやしの まほう',k:'healAllE',pct:.16}]}]},
  {id:'r2',unlock:20,f:21,name:'畑を あらす コアラたち',hint:'うたいてコアラが 歌で 仲間を 強くし、からてかコアラが ちからを ためて 大わざを ねらう。どくつかいコアラは のろいで こちらの まもりを 下げる。',
   members:[
    {name:'うたいてコアラ',pal:'kSinger',hp:3.0,mag:1.3,plan:[{n:'はげましの歌',k:'ebuff',tele:'歌う じゅんびを している…'},A('ひっかく'),{n:'ねむりの歌',k:'sleepAll',rate:.3},A('ひっかく')]},
    {name:'からてかコアラ',pal:'kKarate',hp:3.4,atk:1.25,counter:.3,plan:[A('せいけんづき',{pow:1.1}),A('まわしげり'),{n:'きあいを ためる',k:'charge'}]},
    {name:'どくつかいコアラ',pal:'kPoison',hp:3.0,mag:1.5,plan:[MA('どくのきり',.5,{poison:.5}),{n:'のろい',k:'debuffAll',st:'def'},A('ひっかく')]}]},
  {id:'r3',unlock:30,f:31,name:'井戸を ふさぐ 上級コアラたち',hint:'かたくて、反撃し、みんなで 回復する。物理こうげきは 反撃されやすい。',
   members:[
    {name:'じょうきゅうせんしコアラ',pal:'kHwar',acc:'band',hp:4.4,atk:1.25,def:1.5,counter:.4,plan:[A('こうげき',{pow:1.2}),{n:'ふみこみ',k:'all',pow:.7},A('こうげき')]},
    {name:'せいきしコアラ',pal:'kPal',acc:'band',hp:4.6,def:1.8,mag:1.3,counter:.3,plan:[{n:'せいなる たてで かばう',k:'eguard'},M('ひかりのけん',1.0),{n:'せいなる たてで かばう',k:'eguard'},{n:'いやしのて',k:'healAllE',pct:.12}]},
    {name:'せいかしコアラ',pal:'kHym',acc:'band',hp:3.4,mag:1.4,plan:[{n:'いのりの歌',k:'healAllE',pct:.2,tele:'いのりの 歌を うたおうとしている…'},{n:'きよめの歌',k:'ecure'},{n:'げんきの歌',k:'ebuff'},M('ひかりのまほう',.9)]}]},
  {id:'r4',unlock:40,f:41,name:'森を まどわす 上級コアラたち',hint:'ねむらせたり、こうげきを 下げたりして みだし、状態異常に かかった 仲間を 呪術師コアラの 魔法が ねらう。薬師コアラは なかまの 状態異常を なおす。',
   members:[
    {name:'げんじゅつしコアラ',pal:'kIll',acc:'band',hp:3.2,mag:1.6,plan:[{n:'ゆめのきり',k:'sleepAll',rate:.35},{n:'まぼろし',k:'debuffAll',st:'atk'},M('まどわしの まほう',1.0)]},
    {name:'じゅじゅつしコアラ',pal:'kCur',acc:'band',hp:3.2,mag:2.0,plan:[{n:'のろい',k:'debuffAll',st:'def'},M('じわじわ',1.3,{vsStatus:true}),MA('ドカーン',.95,{tele:'ぶきみな ちからを あつめている…'})]},
    {name:'くすしコアラ',pal:'kApo',acc:'band',hp:3.6,mag:1.4,plan:[{n:'ばんのうやく',k:'ecure'},MA('どくのくすり',.5,{poison:.6}),{n:'くすり',k:'healAllE',pct:.15}]}]},
  {id:'r5',unlock:45,f:46,name:'夜に あらわれる コアラの 王たち',hint:'アイドル王コアラの 歌が つづくあいだ、忍者王コアラが 何度も おそってくる。あなほり王コアラが いると、コアラたちは 毎ターン 回復し、あなぐらで ダメージを へらす。',
   members:[
    {name:'アイドルおうコアラ',pal:'kIdl',acc:'crown',hp:3.6,mag:1.4,plan:[{n:'かっさいの歌',k:'ebuff',tele:'ステージの じゅんびを している…'},A('ひっかく'),A('ひっかく')]},
    {name:'にんじゃおうコアラ',pal:'kNin',acc:'crown',hp:3.4,atk:1.1,acts:2,plan:[{n:'しゅりけん',k:'all',pow:.55},A('かげうち',{pow:1.1}),{n:'ねらいうち',k:'snipe',pow:1.3}]},
    {name:'あなほりおうコアラ',pal:'kDig',acc:'crown',hp:4.4,atk:1.2,def:1.4,eregen:.05,plan:[{n:'じひびき',k:'all',pow:.8,stun:.3,tele:'じめんを たたこうとしている…'},{n:'あなぐらほり',k:'eshelter',tele:'あなぐらを ほっている…'},A('つめで ほりかえす',{pow:1.2})]}]},
  {id:'r6',unlock:'clear',f:50,name:'コアラの 王たちの 総大将',hint:'力・魔法・守りを ぜんぶ もつ。突撃王コアラは ちからを ためて 大わざ、魔道王コアラは だいまほうと 回復、万能王コアラは 仲間を まもる。',
   members:[
    {name:'とつげきおうコアラ',pal:'kAtk',acc:'crown',hp:4.0,atk:1.3,plan:[A('とつげき',{pow:1.3}),{n:'ぜんりょくを ためる',k:'charge'},{n:'あばれまわる',k:'all',pow:.8}]},
    {name:'まどうおうコアラ',pal:'kMagK',acc:'crown',hp:3.6,mag:2.2,plan:[MA('だいまほう',1.0,{tele:'だいまほうの じゅもんを となえている…'}),{n:'おおいなる いやし',k:'healAllE',pct:.18},M('いかずち',1.2)]},
    {name:'ばんのうおうコアラ',pal:'kAllK',acc:'crown',hp:4.8,def:1.6,mag:1.4,counter:.3,plan:[{n:'みんなを まもる',k:'eguard'},M('すべての ぞくせい',1.1),{n:'いやしの ひかり',k:'healAllE',pct:.12}]}]},
];
// 解放されたころのパーティ（sim.js の raid）で 勝率4〜6割に なるよう シミュレーションで決めた倍率
const RAID_SCALE={r1:{hp:.99,atk:.97},r2:{hp:1.04,atk:1.07},r3:{hp:1.23,atk:1.51},r4:{hp:.96,atk:.83},r5:{hp:.81,atk:.72},r6:{hp:1.01,atk:.77}};
function raidUnlocked(G,R){return R.unlock==='clear'?!!G.cleared:!!(G.bossDown&&G.bossDown[R.unlock]);}
function raidEnemies(R){const S=RAID_SCALE[R.id]||{hp:1,atk:1};
  return R.members.map((o,i)=>raidKoala(o,R.f,S,R.id+'_'+i));}
function raidKoala(o,f,S,id){{const R={f};const e=mkEnemy(R.f,'normal',{name:o.name});const v=k=>curve(k,R.f);
    e.hp=e.max=Math.round(v('hp')*o.hp*S.hp);e.atk=Math.round(v('atk')*(o.atk||1)*S.atk);e.def=Math.round(v('def')*(o.def||1.2));e.spd=Math.round(v('spd')*1.3);
    e.mag=Math.round(v('atk')*.55*(o.mag||1)*S.atk);e.plan=o.plan;e.moves=o.plan;e.acts=o.acts||1;e.counter=o.counter||0;e.eregen=o.eregen||0;e.statusMul=.55;e.raid=true;
    e.exp=0;e.gold=0;e.look={spr:'koala',pal:o.pal,s:o.acc==='crown'?1.15:1.05,acc:o.acc||null};e.id=id;e.weak=[];return e;}}
function raidReward(R,first){const f=R.f;return {exp:Math.round(curve('exp',f)*(first?15:4)*expFloorMul(f)),gold:Math.round(curve('gold',f)*(first?20:6))};}

// クリア後の隠しボス（STAGE3.md）。前作の最後のぬし ドロップベア（旅行者をからかう作り話の動物）。超上級職Lv40・最強装備で勝率4〜6割をめやすにする
const SECRET_BOSS={name:'ドロップベア',look:{spr:'koala',pal:'koala',s:1.6},weak:['light'],stats:{hp:10560,atk:254,def:95,mag:202},acts:2,
  moves:[{n:'ひっかく',k:'atk',w:3},{n:'木の上から とびかかる',k:'snipe',pow:1.8,w:2},{n:'だきついて はなさない',k:'atk',pow:.9,stun:.45,w:2},
    {n:'ユーカリの においで ねむくなる',k:'sleepAll',rate:.3,w:1},{n:'あばれまわる',k:'all',pow:.8,w:2},{n:'ふしぎな ちからを かきけす',k:'dispel',w:1}]};
// ドロップベアは 超上級職の コアラを 1体ずつ 順番に よぶ（場に 出るのは いつも1体。たおすと 次の 行動で 次を よぶ）
// コアラ（HP・攻撃の倍率）。6体 すべて たおすまで ドロップベアは たおれない（HP1で こらえる）。6体目を たおすと きあいで HP20%回復、行動3回
const SECRET_CALLS=['kAllK','kNin','kAtk','kIdl','kMagK','kDig'],SECRET_KOALA={hp:.35,atk:.45},SECRET_FINAL={heal:.2,acts:3};
function secretKoala(n){const pal=SECRET_CALLS[n];const o=RAIDS.flatMap(R=>R.members).find(m=>m.pal===pal);const e=raidKoala(o,50,SECRET_KOALA,'dbk'+n);e.prio=true;return e;}
function secretBoss(){const D=SECRET_BOSS;const e=mkEnemy(50,'normal',{boss:'big',name:D.name,weak:D.weak});Object.assign(e,D.stats);e.max=e.hp;e.acts=D.acts;e.moves=D.moves;e.look=D.look;e.id='dropbear';e.secret=true;e.callN=1;return [e,secretKoala(0)];}
function guardianFor(f){const D=GUARDIANS[f];if(!D)return null;
  const big=10*Math.ceil(f/10);const e=mkEnemy(f,'normal',{boss:'big',name:D.name});
  const B=bossFor(big)[0];e.hp=e.max=Math.round(B.max*D.hp);e.atk=Math.round(B.atk*D.atk);e.def=B.def;e.spd=B.spd;
  e.mag=Math.round((D.mag?curve('atk',f)*.55*D.mag:B.mag||curve('atk',f)*.55*1.2));e.acts=D.acts;e.moves=D.moves;e.guardian=true;e.look=D.look;e.id='guard'+f;e.weak=[];
  e.exp=Math.round(B.exp*1.2);e.gold=Math.round(B.gold*1.2);return [e];}
function bossFor(f){
  const D=BOSS_DEF[f];
  if(D){const e=mkEnemy(f,'normal',{boss:f%10===0?'big':'mid',weak:D.weak||[],name:D.name});e.moves=D.moves;e.look=D.look;e.id='boss'+f;if(D.mag)e.mag=Math.round(curve('atk',f)*.55*D.mag);if(D.debuffRes)e.debuffRes=D.debuffRes;if(D.counter)e.counter=D.counter;if(D.evade)e.evade=D.evade;if(D.hpMul){e.hp=e.max=Math.round(e.hp*D.hpMul);}if(D.atkMul){e.atk=Math.round(e.atk*D.atkMul);e.mag=Math.round(e.mag*D.atkMul);}return [e];}const look=[{spr:'crab',pal:'tide',s:1.4},{spr:'croc',pal:'perentie',s:1.3},{spr:'devil',pal:'devil',s:1.5},{spr:'eagle',pal:'eagle',s:1.4},{spr:'dingo',pal:'ancient',s:1.45}][Math.floor((f-1)/10)];
  const e=mkEnemy(f,'normal',{boss:f%10===0?'big':'mid'});e.look=look;e.id='boss'+f;return f%5===0?[e]:null;}

// ---------- 戦闘 ----------
function aliveParty(B){return B.party.map((m,i)=>i).filter(i=>B.party[i].hp>0);}
function aliveEnemies(B){return B.enemies.map((e,i)=>i).filter(i=>B.enemies[i].hp>0);}
function newBattle(G,enemies){
  const cnt={};enemies.forEach(e=>cnt[e.name]=(cnt[e.name]||0)+1);const used={};
  enemies.forEach(e=>{if(cnt[e.name]>1){used[e.name]=(used[e.name]||0)+1;e.name+=' '+'ABCD'[used[e.name]-1];}});
  G.party.forEach(m=>{m.kiai=0;m.bst={};m.cheer=0;});
  const B={party:G.party,inv:G.inv,enemies,buff:{},pdebuff:{},over:null,turn:0,boss:enemies.some(e=>e.boss),revived:{},marks:{},stance:{},kamae:{},shelter:0,taunt:null,eguard:null};
  const ps=G.party.filter(m=>m.hp>0).map(m=>derived(m).p);
  G.party.forEach(m=>{if(derived(m).p.startKiai)m.kiai=kiaiCap(m);});
  if(ps.some(p=>p.startCure))G.party.forEach(m=>{m.poison=false;});
  return B;
}
function elemMult(e,el){if(!el)return 1;return e.weak.includes(el)?1.5:1;}
// 物理ダメージ：前作と同じ「こうげき − ぼうぎょ÷2」（決定）。足りないときは1〜2
function rawDmg(atk,def){return atk-def/2;}
// 1ダメージ（1〜2）になった攻撃の数を数える（シミュレーター用）。side: 'p'=仲間が受けた, 'e'=敵が受けた
const DMG_STATS={p:[0,0],e:[0,0]};
function physDmg(atk,def,pow,r,side){let b=rawDmg(atk,def);if(side){DMG_STATS[side][1]++;if(b<2)DMG_STATS[side][0]++;}if(b<2)b=1+r()*1.5;return Math.max(1,Math.round(b*(.85+r()*.3)*(pow||1)));}
function buffPow(B,k,party){const t=B.buff[k];if(!t||t.turns<=0)return 1;return 1+(CONFIG.buff[k]-1)*(1+t.pow);}
function buffEva(B){const t=B.buff.eva;return t&&t.turns>0?.25*(1+t.pow):0;}
function bstOf(m){return m.bst||(m.bst={});}
function pinchMul(m,d){return d.p.pinch&&m.hp>0&&m.hp<d.maxhp*.3?1+d.p.pinch:1;}
function memberAtk(B,m){const d=derived(m),b=bstOf(m);
  return d.atk*buffPow(B,'atk')*(B.pdebuff&&B.pdebuff.atk>0?CONFIG.debuff.atk:1)*(1+CONFIG.kiaiPow*(m.kiai||0))*(b.rage>0?1.4:1)*(b.berserk>0?1.6:1)*(m.poison&&d.p.poisonAtk?1+d.p.poisonAtk:1)*(1+(d.p.killAtk||0)*(b.kills||0))*pinchMul(m,d);}
function memberDef(B,m){const d=derived(m),b=bstOf(m);
  return d.def*buffPow(B,'def')*(B.pdebuff&&B.pdebuff.def>0?CONFIG.debuff.def:1)*(m.poison?CONFIG.poisonDefDown:1)*(1+(d.p.kiaiDef||0)*(m.kiai||0))*(b.berserk>0?.5:1)*pinchMul(m,d);}
function memberSpd(B,m){const d=derived(m);return d.spd*buffPow(B,'spd')*pinchMul(m,d);}
function memberMag(B,m,e){const d=derived(m);
  return d.mag*(1+(d.p.kiaiMag||0)*(m.kiai||0))*pinchMul(m,d)*(e&&d.p.statusMagPow&&Object.keys(e.st).some(k=>e.st[k]>0)?1+d.p.statusMagPow:1);}
function kiaiCap(m){return CONFIG.kiaiMax+(derived(m).p.kiaiMax||0);}
function bestEl(e){return e.weak[0]||null;}
function enemyDef(e){return e.def*(e.st.defdn>0?CONFIG.debuff.def-(e.dpow||0):1)*(e.st.poison>0?CONFIG.poisonDefDown:1);}
function enemyAtk(e){return e.atk*(e.st.atkdn>0?CONFIG.debuff.atk-(e.dpow||0):1)*(e.ebuff>0?1.3:1);}
function enemyMag(e){return (e.mag||0)*(e.st.atkdn>0?CONFIG.debuff.atk:1)*(e.ebuff>0?1.3:1);}
// 状態異常がかかる確率（画面にも出す予定）
const DEBUFF_ST={atkdn:1,defdn:1,curse:1,blind:1};
function statusChance(B,m,S,e){
  if(e.metal)return 0;
  const p=m?passives(m):{};
  let c=S.rate*(1+(p.statusRate||0));
  if(e.boss||e.statusMul){
    if(DEBUFF_ST[S.st])c*=CONFIG.bossDebuffRate*(e.debuffRes||1);
    else if(S.st==='poison')c*=CONFIG.bossPoisonRate*(e.debuffRes||1);
    else c*=(e.boss?CONFIG.bossStatusRate:e.statusMul)*Math.pow(CONFIG.bossStatusRepeat,e.res[S.st]||0);
  }
  return Math.min(.95,c);
}
function skillDmgEstimate(B,m,S,e){
  const d=derived(m);
  if(S.kind==='mag'){if(e.metal||e.reflect)return 0;const el=S.el==='best'?bestEl(e):S.el;return (S.base+memberMag(B,m,e)*S.k)*elemMult(e,el);}
  if(S.kind==='phys'||S.kind==='finisher'){if(e.metal)return 1;
    const pow=S.kind==='finisher'?(S.hitsPerKiai?S.pow*(1+(m.kiai||0)):S.pow+S.perKiai*(m.kiai||0)):S.pow*(S.hits||1);
    const def=S.ignoreDef?0:enemyDef(e);
    return Math.max(1,rawDmg(memberAtk(B,m),def))*pow*elemMult(e,S.el)*(1-(e.evade||0))*(e.counter?.7:1);}
  return 0;
}

// おまかせ（どの職業・引き継ぎスキルの組み合わせでも動くよう、スキルの種類で判断する）
function autoCmd(B,i){
  const m=B.party[i],d=derived(m),en=aliveEnemies(B),sk=skillsOf(m);
  const P=B.party;
  const low=j=>P[j].hp/derived(P[j]).maxhp;
  const silenced=m.bst&&m.bst.silence>0;
  const can=k=>sk.includes(k)&&m.mp>=(SKILLS[k].mp||0)&&SKILLS[k].kind!=='passive'&&!(silenced&&(SKILLS[k].mp||0)>0);
  const ofKind=(kind,f)=>sk.filter(k=>SKILLS[k].kind===kind&&can(k)&&(!f||f(SKILLS[k])));
  const E=j=>B.enemies[j];
  const metal=en.find(j=>E(j).metal);
  const saveMp=!B.boss&&m.mp<d.maxmp*.3;
  // ふつうの攻撃の相手：回復役などを先に。反撃・よける敵は後回し
  const weakest=()=>en.slice().sort((a,b)=>{const pa=(E(a).prio?-1e6:0)+(E(a).counter||E(a).evade?1e6:0),pb=(E(b).prio?-1e6:0)+(E(b).counter||E(b).evade?1e6:0);return pa+E(a).hp-(pb+E(b).hp);})[0];
  const strongest=()=>en.slice().sort((a,b)=>E(b).hp-E(a).hp)[0];
  // 1. たおれた仲間
  const dead=P.map((x,j)=>j).filter(j=>P[j].hp<=0);
  if(dead.length){const rv=ofKind('revive');if(rv.length)return {k:'skill',s:rv[0],t:dead[0]};if(B.inv.leaf>0&&aliveParty(B).length<=2)return {k:'item',item:'leaf',t:dead[0]};}
  // 2. 回復
  const hurt=aliveParty(B).filter(j=>low(j)<.5).sort((a,b)=>low(a)-low(b));
  const heals=ofKind('heal');
  if(hurt.length>=2){const h=heals.filter(k=>SKILLS[k].tgt==='allies').sort((a,b)=>SKILLS[b].base-SKILLS[a].base);if(h.length)return {k:'skill',s:h[0]};}
  if(hurt.length){const h=heals.filter(k=>SKILLS[k].tgt==='ally');if(h.length)return {k:'skill',s:h[0],t:hurt[0]};
    const ha=heals.filter(k=>SKILLS[k].tgt==='allies');if(ha.length)return {k:'skill',s:ha[0]};
    if(low(hurt[0])<.3){for(const it of ['herb3','herb2','herb'])if(B.inv[it]>0&&(hurt[0]===i||!heals.length))return {k:'item',item:it,t:hurt[0]};}}
  // 3. ねむり・まひ・毒をなおす
  const bs=j=>P[j].bst||{};
  const stuck=aliveParty(B).filter(j=>j!==i&&(bs(j).sleep>0||bs(j).stun>0||(bs(j).silence>0&&skillsOf(P[j]).some(k=>SKILLS[k].kind==='heal'))));
  const cures=ofKind('cure'),cureAlls=ofKind('cureAll');
  const poi=aliveParty(B).filter(j=>P[j].poison&&!(bs(j).rage>0)&&!derived(P[j]).p.poisonAtk);
  if(cureAlls.length&&stuck.length+poi.length>=2)return {k:'skill',s:cureAlls[0]};
  if(stuck.length&&(cures.length||cureAlls.length))return cures.length?{k:'skill',s:cures[0],t:stuck[0]}:{k:'skill',s:cureAlls[0]};
  if(poi.length&&(cures.length||cureAlls.length)&&(B.boss||poi.length>=2||low(poi[0])<.6))return cures.length?{k:'skill',s:cures[0],t:poi[0]}:{k:'skill',s:cureAlls[0]};
  // 3b. ふっかつのいのり：ボス戦や敵が多いとき、HPがいちばん少ない仲間に
  const marks=ofKind('mark');
  if(marks.length&&(B.boss||en.length>=3)&&!aliveParty(B).some(j=>B.marks[j])){
    const t=aliveParty(B).sort((a,b)=>derived(P[a]).maxhp-derived(P[b]).maxhp)[0];return {k:'skill',s:marks[0],t};}
  // 3c. 回復役のMP
  const mph=ofKind('mpheal');
  if(mph.length&&aliveParty(B).some(j=>j!==i&&((skillsOf(P[j]).some(k=>SKILLS[k].kind==='heal')&&P[j].mp<derived(P[j]).maxmp*.35)||P[j].mp<derived(P[j]).maxmp*.2)))return {k:'skill',s:mph[0]};
  // 3d. いのちすい：自分が弱っているとき
  const drains=ofKind('mag',S=>S.drain);if(drains.length&&low(i)<.55&&en.length)return {k:'skill',s:drains[0],t:B.boss?en[0]:strongest()};
  // 4. メタル
  if(metal!==undefined)return {k:'attack',t:metal};
  // 5. 自分を強くする・歌・応援（ボス戦、または敵が多いとき）
  const tough0=B.boss||en.some(j=>E(j).hp>d.atk*3);
  if(ofKind('rage').length&&!m.poison&&!(bs(i).rage>0)&&tough0&&low(i)>.5)return {k:'skill',s:ofKind('rage')[0]};
  if(ofKind('berserk').length&&B.boss&&!(bs(i).berserk>0)&&low(i)>.6)return {k:'skill',s:ofKind('berserk')[0]};
  if(B.boss||en.length>=3){
    const songs=ofKind('buff');
    const need=b=>!(B.buff[b]&&B.buff[b].turns>1);
    const allS=songs.find(k=>SKILLS[k].buff==='all');
    if(allS&&['atk','def','spd'].filter(need).length>=2)return {k:'skill',s:allS};
    for(const b of ['atk','def','spd','eva']){const s=songs.find(k=>SKILLS[k].buff===b);if(s&&need(b)&&(!saveMp||B.boss))return {k:'skill',s};}
    const ext=ofKind('extend').filter(k=>!SKILLS[k].kiai||(m.kiai||0)>=2);
    if(ext.length&&!P.some(x=>x.hp>0&&derived(x).p.buffForever)&&Object.values(B.buff).some(b=>b.turns>0&&b.turns<=1)&&Object.values(B.buff).filter(b=>b.turns>0).length>=(B.boss?1:2))return {k:'skill',s:ext[0]};
    const ch=ofKind('cheer');
    if(ch.length&&B.boss&&!P.some(x=>x.cheer)){const t=aliveParty(B).filter(j=>j!==i).sort((a,b)=>Math.max(derived(P[b]).atk,derived(P[b]).mag)-Math.max(derived(P[a]).atk,derived(P[a]).mag))[0];if(t!==undefined)return {k:'skill',s:ch[0],t};}
  }
  // 6. かばう・みをまもる（力をためた敵がいるときも）
  const charged=en.some(j=>E(j).charged);
  const guards=ofKind('guard').sort((a,b)=>(SKILLS[a].cut??1)-(SKILLS[b].cut??1));
  const hasGuard=x=>skillsOf(x).some(k=>SKILLS[k].kind==='guard');
  if(guards.length&&low(i)>.5&&(charged||(aliveParty(B).some(j=>j!==i&&low(j)<.35)&&(en.length>=2||B.boss))||(B.boss&&(SKILLS[guards[0]].cut??1)<=.4&&low(i)>.7&&B.turn%3===2)))return {k:'skill',s:guards[0]};
  if(charged&&!guards.length&&low(i)<.6&&!aliveParty(B).some(j=>j!==i&&hasGuard(P[j])))return {k:'defend'};
  // あなぐら：大わざの 予告・ためている敵・ボス戦で みんな 弱っているとき
  const sh=ofKind('shelter');
  if(sh.length){const tele=en.some(j=>{const e=B.enemies[j];return e.plan&&e.plan[(e.pi||0)%e.plan.length].tele;});const avg=aliveParty(B).reduce((a,j)=>a+low(j),0)/aliveParty(B).length;
    if(tele||charged||(B.boss&&avg<.5&&B.turn>1))return {k:'skill',s:sh[0]};}
  // 構え：かまえ（ボス戦）
  const st=ofKind('stance');
  const hide=st.find(k=>SKILLS[k].stance==='hide');if(hide&&low(i)<.25&&!heals.length)return {k:'skill',s:hide};
  const kam=st.find(k=>SKILLS[k].stance==='counter');if(kam&&!(B.kamae[i]>0)&&low(i)>.6&&B.boss&&B.turn>1)return {k:'skill',s:kam};
  // ひきつける：かたい仲間が、弱った仲間を守る
  const tn=ofKind('taunt');if(tn.length&&low(i)>.6&&!(B.taunt&&B.taunt.turns>0)&&(aliveParty(B).some(j=>j!==i&&low(j)<.35)||(charged&&B.boss)))return {k:'skill',s:tn[0]};
  // 7. 状態異常・デバフ（ボスや強い敵に）
  const sts=ofKind('status');
  if(sts.length&&!saveMp){
    const tough=B.boss?en:en.filter(j=>E(j).hp>d.atk*2.5);
    let best=null,bs=0;
    for(const k of sts){const S=SKILLS[k];
      const ts=S.tgt==='enemies'?en:tough;
      let sc=0;for(const j of ts){const e=E(j);if(e.st[S.st]>0)continue;const c=statusChance(B,m,S,e);
        const val={poison:B.boss?3:1.6,defdn:B.boss?2.2:1,atkdn:B.boss?2:1,stun:B.boss?2.5:1.4,sleep:B.boss?1.5:1.6,curse:B.boss?3.5:1.6,confuse:B.boss?1.5:1.3,blind:B.boss?2.5:1.2}[S.st]||1;sc+=c*val;}
      if(S.tgt==='enemies'&&en.length<2&&!B.boss)sc*=.5;
      if(sc>bs){bs=sc;best=k;}}
    if(best&&bs>=(B.boss?.5:.9)){const S=SKILLS[best];const t=S.tgt==='enemies'?null:(B.boss?en[0]:tough.find(j=>!(E(j).st[S.st]>0)));if(S.tgt==='enemies'||t!==undefined)return {k:'skill',s:best,t};}
  }
  // 8. 攻撃スキル
  if(!saveMp||B.boss){
    let best=null,bs=0,bt=null;
    const atkLike=sk.filter(k=>['phys','mag','finisher'].includes(SKILLS[k].kind)&&can(k));
    const plain=en.reduce((s,j)=>Math.max(s,Math.max(1,rawDmg(memberAtk(B,m),enemyDef(E(j))))),0);
    for(const k of atkLike){const S=SKILLS[k];
      if(S.kind==='finisher'&&(m.kiai||0)<Math.min(3,kiaiCap(m)))continue;
      if(S.kiaiCost&&(m.kiai||0)<S.kiaiCost)continue;
      if(S.tgt==='enemies'){let sc=0;for(const j of en)sc+=Math.min(E(j).hp,skillDmgEstimate(B,m,S,E(j)));if(sc>bs){bs=sc;best=k;bt=null;}}
      else{const t=B.boss?en[0]:strongest();const sc=Math.min(E(t).hp,skillDmgEstimate(B,m,S,E(t)));if(sc>bs){bs=sc;best=k;bt=t;}}}
    if(best&&bs>plain*1.25)return {k:'skill',s:best,t:bt};
  }
  return {k:'attack',t:weakest()};
}

// 画面用：その時点の、仲間カードに出す状態（バフ・デバフ・ねむりなど）。B.track のときだけ記録する
function visState(B){return {pd:{atk:B.pdebuff.atk||0,def:B.pdebuff.def||0},bf:Object.fromEntries(Object.keys(B.buff).map(k=>[k,B.buff[k].turns||0])),mk:Object.assign({},B.marks),
  m:B.party.map((m,i)=>({kamae:(B.kamae&&B.kamae[i])||0,sleep:(m.bst&&m.bst.sleep)||0,stun:(m.bst&&m.bst.stun)||0,silence:(m.bst&&m.bst.silence)||0,rage:(m.bst&&m.bst.rage)||0,kiai:m.kiai||0}))};}
const STAT_JP={atk:'こうげき',def:'ぼうぎょ',spd:'すばやさ'};
// かまえ（5ターン）：うける 物理ダメージ×cut、はんげき×pow
const KAMAE={cut:.7,pow:2};
function battleTurn(B,cmds,r){
  const ev=[],P=B.party,EN=B.enemies;B.turn++;
  if(B.track){const push=ev.push.bind(ev);ev.push=(...xs)=>{for(const x of xs)x.vs=visState(B);return push(...xs);};}
  const acts=[];
  B.stance={};B.shelter=0;
  P.forEach((m,i)=>{if(m.hp>0&&cmds[i]){const c=cmds[i];const S=c.k==='skill'?SKILLS[c.s]:null;
    const pri=(S&&['guard','stance','shelter'].includes(S.kind))||c.k==='defend'?100:0;acts.push({side:'p',i,c,o:pri+memberSpd(B,m)*(.75+r()*.5)});
    const xa=derived(m).p.extraAct;if(xa&&r()<xa)acts.push({side:'p',i,c:{k:'attack',t:c.t},o:memberSpd(B,m)*(.5+r()*.3),extra:true});}});
  EN.forEach((e,i)=>{if(e.hp>0){const n=e.secret&&EN.some(z=>z!==e&&z.hp>0)?1:e.acts||1; // ドロップベアは コアラが いる あいだ 1回（指示を 出している）。最後は 3回
    for(let k=0;k<n;k++)acts.push({side:'e',i,o:e.spd*(.75+r()*.5)-k*30});}});
  acts.sort((a,b)=>b.o-a.o);
  const guard={},defend={},partyP=()=>P.filter(x=>x.hp>0).map(x=>derived(x).p);
  const resist=()=>partyP().some(p=>p.statusResist)?.5:1;
  // 状態異常が かかるか。おまもりで ふせいだときは 知らせる
  const tryStatus=(m,st,rate)=>{const x=r();if(x<rate*charmMul(m,st))return true;if(x<rate&&charmMul(m,st)<1)ev.push({t:'msg',text:`${m.name}の ${CHARMS[m.charm].name}が ${ST_JP2[st]}を ふせいだ！`});return false;};
  for(const a of acts)if(a.side==='p'&&a.c.k==='defend')defend[a.i]=1;
  const checkEnd=()=>{
    {const sb=EN.find(z=>z.secret);if(sb&&sb.hp>0&&!sb.final&&sb.callN>=SECRET_CALLS.length&&!EN.some(z=>z!==sb&&z.hp>0)){
      sb.final=true;sb.acts=SECRET_FINAL.acts;const amt=Math.min(sb.max-sb.hp,Math.round(sb.max*SECRET_FINAL.heal));sb.hp+=amt;
      ev.push({t:'msg',text:`コアラたちが みんな たおれた…\n${sb.name}は きあいで 立ちあがった！`,dbFinal:true});ev.push({t:'heal',side:'e',i:EN.indexOf(sb),amt});
      ev.push({t:'msg',text:`${sb.name}の いかりが ばくはつした！ ${SECRET_FINAL.acts}回 行動するように なった！`});}}
    if(!aliveEnemies(B).length){B.over=EN.every(e=>e.fled)?'fled':'win';return true;}
    if(!aliveParty(B).length){B.over='lose';return true;}return false;};
  const metalDmg=(e,dmg,crit)=>e.metal?(crit?3:1):dmg;
  const addKiai=(m,n)=>{const p=derived(m).p;if(p.kiai||n)m.kiai=Math.min(kiaiCap(m),(m.kiai||0)+(n||p.kiai));};
  const hitEnemy=(i,dmg,extra)=>{const e=EN[i];if(e.hp<=0)return;if(e.secret&&!e.final&&dmg>=e.hp){dmg=e.hp-1;if(!B.dbHoldMsg){B.dbHoldMsg=1;ev.push({t:'msg',text:`${e.name}は こらえた！ コアラたちが ささえている！`});}}if(e.hidden){ev.push({t:'msg',text:`${e.name}は あなに かくれている！`});return;}if(B.eshelter>0&&!e.metal)dmg=Math.max(1,Math.round(dmg*.5));e.hp=Math.max(0,e.hp-dmg);ev.push(Object.assign({t:'hit',side:'e',i,dmg,hp:e.hp},extra||{}));
    if(e.st.sleep>0&&e.hp>0&&r()<.5){e.st.sleep=0;ev.push({t:'msg',text:`${e.name}は めをさました！`});}
    if(e.hp<=0){ev.push({t:'die',side:'e',i});
      if(extra&&extra.by){bstOf(extra.by).kills=(bstOf(extra.by).kills||0)+1;}
      if(e.st.poison>0){const ph=partyP().reduce((a,p)=>Math.max(a,p.poisonKillHeal||0),0);if(ph)for(const x of P)if(x.hp>0)x.hp=Math.min(derived(x).maxhp,x.hp+Math.ceil(derived(x).maxhp*ph));}}};
  const applyStatus=(m,S,i)=>{const e=EN[i];if(e.hp<=0)return;
    if(S.st2&&!(e.st[S.st2]>0)&&r()<statusChance(B,m,{rate:S.rate2,st:S.st2},e)){e.st[S.st2]=e.boss?1:2;if(e.boss)e.res[S.st2]=(e.res[S.st2]||0)+1;ev.push({t:'status',side:'e',i,st:S.st2,text:`${e.name}は ${ST_NAME[S.st2]}に なった！`});}
    if(e.st[S.st]>0){ev.push({t:'msg',text:`${e.name}は すでに ${ST_NAME[S.st]}だ。`});return;}
    const c=statusChance(B,m,S,e);
    // 敵の こうげきアップと こうげきダウンは 打ち消しあう
    if(S.st==='atkdn'&&e.ebuff>0){if(r()<c){e.ebuff=0;ev.push({t:'status',side:'e',i,st:'atkdn',text:`${e.name}の こうげきアップが 打ち消された！`});}else ev.push({t:'msg',text:`${e.name}には きかなかった。`});return;}
    if(r()<c){const turns=S.st==='poison'?99:S.st==='sleep'?(e.boss?1:2+Math.floor(r()*2)):S.st==='stun'?(e.boss?1:2):CONFIG.debuff.turns+(DEBUFF_ST[S.st]&&m?passives(m).debuffTurns||0:0);
      e.st[S.st]=turns;if(e.boss||e.statusMul)e.res[S.st]=(e.res[S.st]||0)+1;
      if(S.st==='curse'){if(e.ebuff>0)e.ebuff=0;else e.st.atkdn=turns;e.st.defdn=turns;}
      if(S.st==='poison')e.poisonPow=1+(m?passives(m).poisonPow||0:0);
      if(DEBUFF_ST[S.st]&&m)e.dpow=Math.max(e.dpow||0,passives(m).debuffPow||0);
      ev.push({t:'status',side:'e',i,st:S.st,text:`${e.name}は ${ST_NAME[S.st]}に なった！`});}
    else ev.push({t:'msg',text:`${e.name}には きかなかった。`});};
  const autoRevive=()=>{ // ふっかつのいのり（とくぎ）、えいえんのいのり（パッシブ）
    for(let j=0;j<P.length;j++){const x=P[j];if(x.hp>0||!B.marks[j])continue;
      delete B.marks[j];x.hp=Math.ceil(derived(x).maxhp/2);ev.push({t:'revive',i:j,hp:x.hp,text:`いのりが とどき、${x.name}は おきあがった！`});}
    for(let j=0;j<P.length;j++){const x=P[j];if(x.hp>0||B.revived[j])continue;
      const holder=P.find(y=>y.hp>0&&derived(y).p.autoRevive);if(!holder)return;
      B.revived[j]=1;x.hp=Math.ceil(derived(x).maxhp/2);ev.push({t:'revive',i:j,hp:x.hp,text:`いのりが とどき、${x.name}は おきあがった！`});}};
  // 必ず はんげき（かまえ・ふどうのかまえ）：単体でも 全体でも、かわしても。ねむり・まひの あいだは しない。同じ敵の 1回の行動には 1度だけ
  const ctrDone=new Set();
  const sureCounter=(tgt,ei,guarded,dp)=>{const m=P[tgt];if(ei===undefined||ctrDone.has(tgt+':'+ei))return false;if(m.bst&&(m.bst.sleep>0||m.bst.stun>0))return false;
    return B.stance[tgt]==='counter'||B.kamae[tgt]>0||(guarded&&!!dp.guardCounter);};
  const doCounter=(tgt,ei)=>{ctrDone.add(tgt+':'+ei);counter(tgt,ei);};
  const hitParty=(i,dmg,extra,poison,phys,ei,stun,allPhys)=>{
    let tgt=i;
    if(phys&&ei!==undefined&&EN[ei]&&EN[ei].st.blind>0&&r()<.5){ev.push({t:'msg',text:`${EN[ei].name}の こうげきは はずれた！`});return;}
    let guarded=false;
    if(guard.who!==undefined&&guard.who!==i&&P[guard.who].hp>0){tgt=guard.who;guarded=true;const gp=derived(P[tgt]).p;
      const cut=Math.min(guard.cut??1,gp.guardCut??CONFIG.guardCut);dmg=Math.max(1,Math.round(dmg*cut));ev.push({t:'msg',text:`${P[tgt].name}が おしりで かばった！`});
      if(gp.guardHeal&&P[i].hp>0){const x=P[i];x.hp=Math.min(derived(x).maxhp,x.hp+Math.ceil(derived(x).maxhp*gp.guardHeal));}}
    else if(defend[i])dmg=Math.max(1,Math.round(dmg*.5));
    const m=P[tgt],dp=derived(m).p;
    if(B.stance[tgt]==='hide'){ev.push({t:'msg',text:`${m.name}は あなに かくれている！`});return;}
    if(B.kamae[tgt]>0&&(phys||allPhys))dmg=Math.max(1,Math.round(dmg*KAMAE.cut));
    if(B.shelter)dmg=Math.max(1,Math.round(dmg*B.shelter));
    if(phys&&r()<CONFIG.evadeBase+(dp.evade||0)+buffEva(B)){ev.push({t:'msg',text:`${m.name}は ひらりと かわした！`});
      if(sureCounter(tgt,ei,guarded,dp))doCounter(tgt,ei);else if(dp.counter&&ei!==undefined&&r()<dp.counter)counter(tgt,ei);return;}
    m.hp=Math.max(0,m.hp-dmg);ev.push(Object.assign({t:'hit',side:'p',i:tgt,dmg,hp:m.hp},extra||{}));
    if(m.hp<=0){m.poison=false;m.kiai=0;ev.push({t:'die',side:'p',i:tgt});autoRevive();return;}
    if(dp.hurtKiai)addKiai(m,dp.hurtKiai);
    poison=poison?poison*resist():0;stun=stun?stun*resist():0;
    if(poison&&!m.poison&&tryStatus(m,'poison',poison)){m.poison=true;ev.push({t:'status',side:'p',i:tgt,st:'poison',text:`${m.name}は どくに おかされた！`});}
    m.bst=m.bst||{};
    if(m.bst.sleep>0&&r()<.5){m.bst.sleep=0;ev.push({t:'msg',text:`${m.name}は めをさました！`});}
    if(stun&&tryStatus(m,'stun',stun)){m.bst.stun=1;ev.push({t:'status',side:'p',i:tgt,st:'stun',text:`${m.name}は しびれた！`});}
    if((phys||allPhys)&&sureCounter(tgt,ei,guarded,dp))doCounter(tgt,ei);
    else if(phys&&ei!==undefined&&dp.counter&&r()<dp.counter)counter(tgt,ei);};
  const counter=(pi,ei)=>{const m=P[pi],e=EN[ei];if(!e||e.hp<=0||m.hp<=0)return;
    ev.push({t:'act',side:'p',i:pi,text:`${m.name}の カウンター！`});
    const dmg=metalDmg(e,physDmg(memberAtk(B,m),enemyDef(e),B.kamae[pi]>0?KAMAE.pow:1,r,'e'));hitEnemy(ei,dmg,{by:m,text:`${e.name}に ${dmg}の ダメージ！`});addKiai(m);};
  const pickEnemy=t=>{const al=aliveEnemies(B);
    if(B.eguard!=null&&EN[B.eguard]&&EN[B.eguard].hp>0&&B.eguard!==t&&al.includes(t)){ev.push({t:'msg',text:`${EN[B.eguard].name}が なかまを かばった！`});return B.eguard;}
    if(al.includes(t))return t;return al[Math.floor(r()*al.length)];};
  const physHit=(m,t,pow,o)=>{const e=EN[t];o=o||{};if(!e||e.hp<=0)return;
    if(e.evade&&r()<e.evade){ev.push({t:'msg',text:`${e.name}は すばやく よけた！`});return;}
    const crit=r()<1/20;const atk=memberAtk(B,m)*(m.cheer?1.6:1);pow*=elemMult(e,o.el);
    const dmg=metalDmg(e,crit?Math.round(atk*(1.4+r()*.2)*pow):physDmg(atk,o.ignoreDef?0:enemyDef(e),pow,r,'e'),crit);
    hitEnemy(t,dmg,{crit,by:m,weak:elemMult(e,o.el)>1,text:`${e.name}に ${dmg}の ダメージ！`});
    const p=derived(m).p;if(p.atkPoison&&e.hp>0&&!e.st.poison&&r()<statusChance(B,m,{rate:p.atkPoison,st:'poison'},e)){e.st.poison=99;if(e.boss)e.res.poison=(e.res.poison||0)+1;e.poisonPow=1+(p.poisonPow||0);ev.push({t:'status',side:'e',i:t,st:'poison',text:`${e.name}は どくに なった！`});}
    if(e.counter&&e.hp>0&&!(e.st.sleep>0)&&!(e.st.stun>0)&&r()<e.counter){ev.push({t:'act',side:'e',i:t,text:`${e.name}の はんげき！`});
      const pi=P.indexOf(m);hitParty(pi,physDmg(enemyAtk(e),memberDef(B,m),1,r,'p'),null,0,false);}};
  // 画面用：直前の行動で 変わった HP・MP・どくを 仲間カードに 反映させる（回復の出来事が ない変化も ふくむ）
  const sync=()=>{if(B.track)ev.push({t:'sync',p:P.map(x=>({hp:x.hp,mp:x.mp,poison:!!x.poison}))});};
  for(const a of acts){
    sync();ctrDone.clear();
    if(B.over)break;
    if(a.side==='p'){
      const m=P[a.i];if(m.hp<=0)continue;const d=derived(m),c=a.c;m.bst=m.bst||{};
      if(m.bst.sleep>0){m.bst.sleep--;ev.push({t:'act',side:'p',i:a.i,text:`${m.name}は ねむっている。`});continue;}
      if(m.bst.stun>0){m.bst.stun--;ev.push({t:'act',side:'p',i:a.i,text:`${m.name}は しびれて うごけない！`});continue;}
      const usedCheer=m.cheer;
      if(c.k==='attack'){const t=pickEnemy(c.t);ev.push({t:'act',side:'p',i:a.i,text:`${m.name}の こうげき！`});physHit(m,t,1);addKiai(m);}
      else if(c.k==='defend'){ev.push({t:'act',side:'p',i:a.i,text:`${m.name}は みをまもっている。`});}
      else if(c.k==='run'){
        if(B.boss){ev.push({t:'msg',text:'しかし まわりこまれてしまった！'});continue;}
        const ps=aliveParty(B).reduce((s,j)=>s+memberSpd(B,P[j]),0)/aliveParty(B).length;
        const es=aliveEnemies(B).reduce((s,j)=>s+EN[j].spd,0)/aliveEnemies(B).length;
        if(r()<Math.max(.35,Math.min(.9,.6+.04*(ps-es)))){B.over='run';break;}
      } else if(c.k==='item'){
        const it=ITEMS[c.item];if(!(B.inv[c.item]>0))continue;let t=c.t;
        if(it.revive){if(P[t].hp>0){const dd=P.findIndex(x=>x.hp<=0);if(dd<0)continue;t=dd;}}
        else if(P[t].hp<=0)t=a.i;
        B.inv[c.item]--;ev.push({t:'act',side:'p',i:a.i,text:`${m.name}は ${it.name}を つかった！`});
        const tm=P[t],td=derived(tm),ip=1+(d.p.itemPow||0);
        if(it.revive){tm.hp=Math.ceil(td.maxhp/2);ev.push({t:'revive',i:t,hp:tm.hp});}
        if(it.heal){const h0=tm.hp;tm.hp=Math.min(td.maxhp,tm.hp+Math.round(it.heal*ip));ev.push({t:'heal',side:'p',i:t,amt:tm.hp-h0,hp:tm.hp});}
        if(it.mp)tm.mp=Math.min(td.maxmp,tm.mp+Math.round(it.mp*ip));
        if(it.cure)tm.poison=false;
      } else if(c.k==='skill'){
        const S=SKILLS[c.s];
        if(!skillsOf(m).includes(c.s)||S.kind==='passive')continue;
        if(m.bst.silence>0&&(S.mp||0)>0){ev.push({t:'act',side:'p',i:a.i,text:`${m.name}は ふういんされていて ${S.name}を つかえない！`});continue;}
        if(m.mp<(S.mp||0)){ev.push({t:'act',side:'p',i:a.i,text:`${m.name}は ${S.name}を つかおうとしたが MPが たりない！`});continue;}
        if(S.kiaiCost&&(m.kiai||0)<S.kiaiCost){ev.push({t:'act',side:'p',i:a.i,text:`${m.name}は きあいが たりない！`});continue;}
        if(S.kind==='extend'&&S.kiai&&!(m.kiai>0)){ev.push({t:'act',side:'p',i:a.i,text:`${m.name}は きあいが たりない！`});continue;}
        m.mp-=S.mp||0;ev.push({t:'act',side:'p',i:a.i,s:c.s,text:`${m.name}は ${S.name}を つかった！`});
        const castMag=()=>{const ts=S.tgt==='enemies'?aliveEnemies(B):[pickEnemy(c.t)];
          for(const t of ts){const e=EN[t];if(!e||e.hp<=0)continue;if(e.metal){ev.push({t:'msg',text:`${e.name}は まほうを はじいた！`});continue;}
            const el=S.el==='best'?bestEl(e):S.el;const mu=elemMult(e,el);
            const dmg=Math.max(1,Math.round((S.base+memberMag(B,m,e)*S.k)*(.9+r()*.2)*mu*(m.cheer?1.6:1)));
            if(e.reflect){const back=Math.max(1,Math.round(dmg*.5));m.hp=Math.max(0,m.hp-back);ev.push({t:'hit',side:'p',i:a.i,dmg:back,hp:m.hp,text:`${e.name}は まほうを はねかえした！`});
              if(m.hp<=0){m.poison=false;m.kiai=0;ev.push({t:'die',side:'p',i:a.i});autoRevive();return;}continue;}
            hitEnemy(t,dmg,{by:m,weak:mu>1,text:`${e.name}に ${dmg}の ダメージ！`});
            if(S.drain)m.hp=Math.min(d.maxhp,m.hp+Math.round(dmg*S.drain));}};
        if(S.kind==='guard'){guard.who=a.i;guard.cut=S.cut;}
        else if(S.kind==='shelter'){B.shelter=S.cut;ev.push({t:'msg',text:'みんなは あなぐらに にげこんだ！ このターン うける ダメージが 半分に なる。'});}
        else if(S.kind==='stance'){if(S.turns){B.kamae[a.i]=S.turns;ev.push({t:'msg',text:`${m.name}は ${S.turns}ターンの あいだ かまえている。`});}else B.stance[a.i]=S.stance;}
        else if(S.kind==='phys'){
          const ts=S.tgt==='enemies'||(S.fist&&d.p.fistAll)?aliveEnemies(B):[pickEnemy(c.t)];
          if(S.kiaiCost)m.kiai-=S.kiaiCost;
          for(const t of ts)for(let h=0;h<(S.hits||1);h++){if(!EN[t]||EN[t].hp<=0)break;physHit(m,t,S.pow,{el:S.el,ignoreDef:S.ignoreDef});}
          if(S.stun)for(const t of ts){const e=EN[t];if(e&&e.hp>0&&!(e.st.stun>0)&&r()<statusChance(B,m,{st:'stun',rate:S.stun},e)){e.st.stun=e.boss?1:2;if(e.boss)e.res.stun=(e.res.stun||0)+1;ev.push({t:'status',side:'e',i:t,st:'stun',text:`${e.name}は まひした！`});}}
          if(S.selfDmg&&m.hp>0)m.hp=Math.max(1,m.hp-Math.ceil(d.maxhp*S.selfDmg));
          if(!S.kiaiCost)addKiai(m);}
        else if(S.kind==='finisher'){const k=m.kiai||0;m.kiai=0;
          const ts=S.tgt==='enemies'?aliveEnemies(B):[pickEnemy(c.t)];
          for(const t of ts){if(S.hitsPerKiai){for(let h=0;h<1+k;h++){if(!EN[t]||EN[t].hp<=0)break;physHit(m,t,S.pow);}}else physHit(m,t,S.pow+S.perKiai*k);}}
        else if(S.kind==='mag'){castMag();if(m.hp>0&&d.p.magEcho&&r()<d.p.magEcho&&aliveEnemies(B).length){ev.push({t:'msg',text:'まほうが こだました！'});castMag();}}
        else if(S.kind==='status'){const ts=S.tgt==='enemies'?aliveEnemies(B):[pickEnemy(c.t)];
          for(const t of ts){if(S.pow){const e=EN[t];physHit(m,t,S.pow);if(!e||e.hp<=0)continue;}applyStatus(m,S,t);}}
        else if(S.kind==='heal'){let ts=S.tgt==='allies'?aliveParty(B):[c.t];
          if(S.tgt==='ally'&&(ts[0]===undefined||P[ts[0]].hp<=0)){ts=[aliveParty(B).sort((x,y)=>P[x].hp/derived(P[x]).maxhp-P[y].hp/derived(P[y]).maxhp)[0]];}
          for(const t of ts){const tm=P[t],td=derived(tm);const amt=Math.min(Math.round((S.base+memberMag(B,m)*S.k)*(1+(d.p.healPow||0))*(.9+r()*.2)),td.maxhp-tm.hp);tm.hp+=amt;ev.push({t:'heal',side:'p',i:t,amt,hp:tm.hp});}}
        else if(S.kind==='cure'||S.kind==='cureAll'){const bad=j=>P[j]&&P[j].hp>0&&(P[j].poison||(P[j].bst&&(P[j].bst.sleep>0||P[j].bst.stun>0||P[j].bst.silence>0)));
          let ts=S.kind==='cureAll'?aliveParty(B).filter(bad):[c.t];
          if(S.kind==='cure'&&!bad(ts[0])){const pp=aliveParty(B).find(bad);if(pp===undefined)continue;ts=[pp];}
          for(const t of ts){P[t].poison=false;const b=bstOf(P[t]);b.sleep=0;b.stun=0;b.silence=0;}}
        else if(S.kind==='mpheal'){for(const t of aliveParty(B)){if(t===a.i)continue;const x=P[t];x.mp=Math.min(derived(x).maxmp,x.mp+S.amt);}}
        else if(S.kind==='buff'){const turns=CONFIG.buff.turns+(d.p.buffTurns||0)+1,pow=d.p.buffPow||0;
          // バフと デバフは 打ち消しあう：さがっている能力は もとに もどるだけ
          const fixed=[];for(const b of S.buff==='all'?['atk','def','spd']:[S.buff]){if(B.pdebuff[b]>0){B.pdebuff[b]=0;fixed.push(b);}else B.buff[b]={turns,pow};}
          ev.push({t:'buff',buff:S.buff});if(fixed.length)ev.push({t:'msg',text:`みんなの ${fixed.map(b=>STAT_JP[b]).join('と ')}が もとに もどった！`});
          if(d.p.singKiai)addKiai(m,d.p.singKiai);
          if(d.p.songHeal)for(const x of P)if(x.hp>0)x.hp=Math.min(derived(x).maxhp,x.hp+Math.ceil(derived(x).maxhp*d.p.songHeal));}
        else if(S.kind==='extend'){const n=S.kiai?m.kiai:S.turns;if(S.kiai)m.kiai=0;for(const k in B.buff)if(B.buff[k].turns>0)B.buff[k].turns+=n;ev.push({t:'msg',text:'バフが のびた！'});}
        else if(S.kind==='cheer'){let t=c.t;if(t===undefined||!P[t]||P[t].hp<=0)t=a.i;P[t].cheer=1;ev.push({t:'msg',text:`${P[t].name}は やる気に なった！`});}
        else if(S.kind==='taunt'){B.taunt={i:a.i,turns:2};}
        else if(S.kind==='mark'){let t=c.t;if(t===undefined||!P[t]||P[t].hp<=0)t=a.i;B.marks[t]=1;ev.push({t:'msg',text:`${P[t].name}に いのりが こめられた。`});}
        else if(S.kind==='rage'){m.poison=true;bstOf(m).rage=3;ev.push({t:'msg',text:`${m.name}は どくを のみ、いかりに もえた！`});}
        else if(S.kind==='berserk'){bstOf(m).berserk=3;ev.push({t:'msg',text:`${m.name}は まもりを すてた！`});}
        else if(S.kind==='revive'){let t=c.t;if(P[t].hp>0){const dd=P.findIndex(x=>x.hp<=0);if(dd<0)continue;t=dd;}
          P[t].hp=Math.ceil(derived(P[t]).maxhp/2);ev.push({t:'revive',i:t,hp:P[t].hp});}
      }
      if(usedCheer&&c.k!=='defend')m.cheer=0;
      if(d.p.danceKiai&&!a.extra)for(const x of P)if(x.hp>0)addKiai(x,1);
    } else {
      const e=EN[a.i];if(e.hp<=0)continue;
      if(e.st.sleep>0){e.st.sleep--;continue;}
      if(e.st.stun>0){e.st.stun--;ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は しびれて うごけない！`});continue;}
      if(e.st.confuse>0&&r()<.5){const others=aliveEnemies(B).filter(j=>j!==a.i);
        if(others.length){const o=others[Math.floor(r()*others.length)];ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は こんらんして なかまを こうげきした！`});
          hitEnemy(o,physDmg(enemyAtk(e),enemyDef(EN[o]),1,r),{});if(checkEnd())break;continue;}}
      const moves=(e.moves||[{n:'こうげき',k:'atk',w:1}]).filter(x=>x.w>0);
      if(e.charged){e.charged=false;const al0=aliveParty(B);const t=al0[Math.floor(r()*al0.length)];
        ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ためた いちげき！`});hitParty(t,physDmg(enemyAtk(e),memberDef(B,P[t]),2.4,r,'p'),null,0,true,a.i);if(checkEnd())break;continue;}
      if(e.flee&&r()<e.flee){e.hp=0;e.fled=true;ev.push({t:'die',side:'e',i:a.i,fled:true});if(checkEnd())break;continue;}
      e.hidden=false;
      let tw=moves.reduce((s,x)=>s+x.w,0),x=r()*tw,mv=moves[0];for(const mm of moves){x-=mm.w;if(x<0){mv=mm;break;}}
      // 決まった順番で動く敵（コアラ討伐の連携）。眠ったり しびれたりすると 順番は すすまない
      if(e.plan){mv=e.plan[(e.pi||0)%e.plan.length];e.pi=(e.pi||0)+1;if(mv.k==='eguard'&&aliveEnemies(B).length<2)mv={n:'こうげき',k:'atk'};}
      if(mv.k==='call'&&EN.filter(z=>z.hp>0).length>=3)mv=moves[0];
      if(e.secret&&e.callN<SECRET_CALLS.length&&!EN.some(z=>z!==e&&z.hp>0))mv={n:'なかまを よぶ',k:'summon'};
      const al=aliveParty(B);if(!al.length)break;
      // 狙い：戦士系（かばう持ち）を少し狙いやすい。HPの割合は見ない（弱った仲間ばかり狙わない）
      const pick=()=>{if(B.taunt&&B.taunt.turns>0&&P[B.taunt.i].hp>0)return B.taunt.i;const w=al.map(j=>skillsOf(P[j]).some(k=>SKILLS[k].kind==='guard')?4:3);let s=w.reduce((p,q)=>p+q,0)*r();for(let k=0;k<al.length;k++){s-=w[k];if(s<0)return al[k];}return al[0];};
      if(mv.k==='healAllE'){ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！`});
        for(const j of aliveEnemies(B)){const x=EN[j];const amt=Math.min(x.max-x.hp,Math.round(x.max*(mv.pct||.2)));if(amt>0){x.hp+=amt;ev.push({t:'heal',side:'e',i:j,amt});}}}
      else if(mv.k==='ecure'){ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！ なかまの 状態異常が なおった！`});for(const j of aliveEnemies(B))for(const k in EN[j].st)EN[j].st[k]=0;}
      else if(mv.k==='eshelter'){B.eshelter=2;ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！ コアラたちは あなぐらに にげこんだ！（つぎの ターンの おわりまで うける ダメージ 半分）`});}
      else if(mv.k==='ehide'){e.hidden=true;ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は ${mv.n}！`});}
      else if(mv.k==='atk'){const t=pick();ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！`});
        hitParty(t,physDmg(enemyAtk(e),memberDef(B,P[t]),mv.pow||1,r,'p'),null,mv.poison,true,a.i,mv.stun);}
      else if(mv.k==='all'){ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は ${mv.n}！`});
        for(const t of al){if(P[t].hp<=0)continue;hitParty(t,physDmg(enemyAtk(e),memberDef(B,P[t]),mv.pow,r,'p'),null,mv.poison,false,a.i,mv.stun||0,true);if(checkEnd())break;}}
      else if(mv.k==='snipe'){const t=al.slice().sort((x,y)=>P[x].hp-P[y].hp)[0];ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！ ${P[t].name}を ねらっている！`});
        hitParty(t,physDmg(enemyAtk(e),memberDef(B,P[t]),mv.pow||1,r,'p'),null,0,true,a.i);}
      else if(mv.k==='sleepAll'){ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は ${mv.n}を まいた！`});
        for(const t of al){const m=P[t];m.bst=m.bst||{};if(tryStatus(m,'sleep',mv.rate*resist())){m.bst.sleep=1+Math.floor(r()*2);ev.push({t:'status',side:'p',i:t,st:'sleep',text:`${m.name}は ねむってしまった！`});}}}
      else if(mv.k==='dispel'){ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！ バフと きあいが きえた！`});B.buff={};P.forEach(m=>m.kiai=0);}
      else if(mv.k==='drain'){const t=al.slice().sort((x,y)=>P[y].mp-P[x].mp)[0];const amt=Math.min(P[t].mp,6+Math.floor(e.f*.6));P[t].mp-=amt;ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は ${P[t].name}の MPを ${amt} すいとった！`});}
      else if(mv.k==='boom'){ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は じばくした！`});
        for(const t of al){if(P[t].hp<=0)continue;hitParty(t,physDmg(enemyAtk(e),memberDef(B,P[t]),mv.pow,r,'p'),null,0,false,a.i,0,true);}
        e.hp=0;ev.push({t:'die',side:'e',i:a.i});}
      else if(mv.k==='healAlly'){const hurt=aliveEnemies(B).filter(j=>EN[j].hp<EN[j].max).sort((x,y)=>EN[x].hp/EN[x].max-EN[y].hp/EN[y].max);
        if(hurt.length){const j=hurt[0];const amt=Math.min(EN[j].max-EN[j].hp,Math.round(EN[j].max*.4));EN[j].hp+=amt;ev.push({t:'heal',side:'e',i:j,amt,text:`${e.name}は ${EN[j].name}の きずを なおした！`});}
        else{const t=pick();ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の こうげき！`});hitParty(t,physDmg(enemyAtk(e),memberDef(B,P[t]),1,r,'p'),null,0,true,a.i);}}
      else if(mv.k==='magic'||mv.k==='magicAll'){const ts=mv.k==='magic'?[pick()]:al;ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！`});
        for(const t of ts){if(P[t].hp<=0)continue;const vs=mv.vsStatus&&(P[t].poison||(P[t].bst&&(P[t].bst.sleep>0||P[t].bst.stun>0)))?1.6:1;const dmg=Math.max(1,Math.round(enemyMag(e)*(mv.pow||1)*vs*(.9+r()*.2)));hitParty(t,dmg,{magic:true},mv.poison,false);if(checkEnd())break;}}
      else if(mv.k==='debuffAll'){
        if(B.buff[mv.st]&&B.buff[mv.st].turns>0){delete B.buff[mv.st];ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！ みんなの ${STAT_JP[mv.st]}アップが 打ち消された！`});}
        else{B.pdebuff[mv.st]=CONFIG.debuff.turns+1;ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！ みんなの ${STAT_JP[mv.st]}が さがった！`});}}
      else if(mv.k==='silence'){const t=pick();const m=P[t];const c=mv.rate*(partyP().some(p=>p.statusResist)?.5:1);ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！`});
        if(tryStatus(m,'silence',c)){bstOf(m).silence=2;ev.push({t:'status',side:'p',i:t,st:'silence',text:`${m.name}は ふういんされた！`});}else ev.push({t:'msg',text:`${m.name}は ふういんされなかった。`});}
      else if(mv.k==='ebuff'){let fx=0;for(const j of aliveEnemies(B)){const x=EN[j];if(x.st.atkdn>0){x.st.atkdn=0;fx++;}else x.ebuff=3;}
        ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！ `+(fx&&fx===aliveEnemies(B).length?'さげた こうげきが もとに もどった！':fx?'敵が ちからを ました！（さげた こうげきは もとに もどった）':'敵が ちからを ました！')});}
      else if(mv.k==='eguard'){B.eguard=a.i;B.eguardT=2;ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は なかまを まもっている。`});}
      else if(mv.k==='reviveAlly'){const dead=EN.map((x,j)=>j).filter(j=>EN[j].hp<=0&&!EN[j].fled&&!EN[j].revivedOnce&&j!==a.i);
        if(dead.length){const j=dead[0];EN[j].hp=Math.ceil(EN[j].max/2);EN[j].revivedOnce=true;EN[j].st={};ev.push({t:'add',i:j,text:`${e.name}は ${EN[j].name}を よみがえらせた！`});}
        else{const t=pick();ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の こうげき！`});hitParty(t,physDmg(enemyAtk(e),memberDef(B,P[t]),1,r,'p'),null,0,true,a.i);}}
      else if(mv.k==='charge'){e.charged=true;ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は ちからを ためている！`});}
      else if(mv.k==='summon'){const ne=secretKoala(e.callN++);EN.push(ne);B.dbHoldMsg=0;ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は ${ne.name}を よんだ！`});ev.push({t:'add',i:EN.length-1,summon:ne.name});}
      else if(mv.k==='call'){const ne=e.id&&!e.boss?mkMob(e.f,e.color?'c:'+e.id:e.id):mkEnemy(e.f,'normal',{weak:e.weak});if(!ne.look&&e.look)ne.look=Object.assign({},e.look,{s:1});ne.name=(e.boss?e.name.replace(/の.*$/,'').replace(/ [A-E]$/,''):e.name.replace(/ [A-E]$/,''))+' '+'ABCDE'[EN.length%5];ne.exp=Math.round(ne.exp*.6);ne.gold=Math.round(ne.gold*.6);EN.push(ne);ev.push({t:'add',i:EN.length-1});}
    }
    if(checkEnd())break;
  }
  if(!B.over){
    for(const i of aliveParty(B)){const m=P[i];if(!m.poison)continue;const dm=Math.min(m.hp-1,Math.max(1,Math.floor(derived(m).maxhp*CONFIG.poisonDot)));if(dm>0){m.hp-=dm;ev.push({t:'hit',side:'p',i,dmg:dm,hp:m.hp,poison:true});}}
    for(const i of aliveEnemies(B)){const e=EN[i];if(!(e.st.poison>0))continue;
      const dm=Math.max(1,Math.floor(e.max*CONFIG.enemyPoisonDot*(e.boss?CONFIG.bossPoisonDot:1)*(e.poisonPow||1)));hitEnemy(i,dm,{poison:true});}
    for(const e of EN)for(const k of ['atkdn','defdn','curse','confuse','blind'])if(e.st[k]>0)e.st[k]--;
    const forever=partyP().some(p=>p.buffForever);
    if(!forever)for(const k in B.buff)if(B.buff[k].turns>0)B.buff[k].turns--;
    if(B.taunt&&B.taunt.turns>0)B.taunt.turns--;
    for(const k in B.pdebuff)if(B.pdebuff[k]>0)B.pdebuff[k]--;
    for(const k in B.kamae)if(B.kamae[k]>0)B.kamae[k]--;
    for(const e of EN)if(e.ebuff>0)e.ebuff--;
    // 予告：つぎに 大きな連携を する敵を 知らせる
    for(const j of aliveEnemies(B)){const e=EN[j];if(!e.plan||e.st.sleep>0||e.st.stun>0)continue;const nx=e.plan[(e.pi||0)%e.plan.length];if(nx.tele)ev.push({t:'msg',text:`${e.name}は ${nx.tele}`,tele:true});}
    if(B.eguard!=null&&--B.eguardT<=0)B.eguard=null;
    for(const x of P)if(x.bst&&x.bst.silence>0)x.bst.silence--;
    for(const i of aliveParty(B)){const m=P[i],b=bstOf(m),dd=derived(m);
      for(const k of ['rage','berserk'])if(b[k]>0)b[k]--;
      if(m.poison&&dd.p.poisonRegen)m.hp=Math.min(dd.maxhp,m.hp+Math.ceil(dd.maxhp*(dd.p.poisonRegen+CONFIG.poisonDot)));
      if(dd.p.pinchRegen&&m.hp<dd.maxhp*.3)m.hp=Math.min(dd.maxhp,m.hp+Math.ceil(dd.maxhp*dd.p.pinchRegen));}
    // だいちの めぐみ：持っている仲間が 立っていれば、仲間みんなの HP・MP が 毎ターン 回復（何人 持っていても 1回）
    {const rg=Math.max(0,...aliveParty(B).map(i=>passives(P[i]).partyRegen||0));
     if(rg>0){for(const i of aliveParty(B)){const m=P[i],dd=derived(m);m.hp=Math.min(dd.maxhp,m.hp+Math.ceil(dd.maxhp*rg));m.mp=Math.min(dd.maxmp,m.mp+Math.ceil(dd.maxmp*rg));}ev.push({t:'msg',text:'だいちの めぐみで みんなが すこし 回復した。'});}}
    // コアラの だいちの めぐみ・あなぐら
    {const kd=aliveEnemies(B).map(j=>EN[j]).find(e=>e.eregen);if(kd){for(const j of aliveEnemies(B)){const e=EN[j];e.hp=Math.min(e.max,e.hp+Math.ceil(e.max*kd.eregen));}ev.push({t:'msg',text:`${kd.name}の だいちの めぐみで コアラたちが 回復した。`});}}
    if(B.eshelter>0)B.eshelter--;
    checkEnd();
  }
  sync();
  return ev;
}
// 深い層ほど 経験値を ふやす（育成のテンポのため。オパールの層 1.5倍、B41〜 2倍）
const expFloorMul=f=>f>=41?2:f>=31?1.5:1;
function battleRewards(B){let exp=0,gold=0;for(const e of B.enemies){if(e.fled||e.hp>0)continue;exp+=Math.round(e.exp*expFloorMul(e.f||0));gold+=e.gold;}return {exp,gold};}
// 勝ったら、生きている仲間それぞれに経験値（倒れた仲間には入らない）
// 連戦ボーナス：村に もどらずに 勝ちつづけると 経験値が ふえる（1勝ごとに +10%、最大3倍）。村に もどる・全滅で 1倍に もどる
const STREAK={step:.1,max:3};
// B20の ぬしを たおしたあと、村で 長老に 教えてもらった ときから 有効（G.flags.streakTold）
const streakReady=G=>!!(G.bossDown&&G.bossDown[20]);
const streakOn=G=>!!(G.flags&&G.flags.streakTold);
const streakMul=n=>Math.min(STREAK.max,Math.round((1+STREAK.step*(n||0))*10)/10);
function giveRewards(G,B,mul=1){let {exp,gold}=battleRewards(B);exp=Math.round(exp*mul);G.gold+=gold;const msgs=[];for(const m of G.party)if(m.hp>0)msgs.push(...gainExp(m,exp));return {exp,gold,msgs};}

function newGame(){
  return {v:1,party:[newMember('war','ガッシJr'),newMember('mag','ユーカJr'),newMember('pri','モフJr')],
    gold:100,inv:{herb:3,antidote:1},shopTier:1,reached:0,checkpoints:[0],bossDown:{},flags:{},battles:0};
}

const CORE={SECRET_FINAL,SECRET_CALLS,SECRET_KOALA,secretKoala,raidKoala,STREAK,streakMul,streakOn,streakReady,KAMAE,METAL,METAL_RATE,LURE_MUL,expFloorMul,vetBonus,VET_MUL,RAIDS,RAID_SCALE,raidUnlocked,raidEnemies,raidReward,CHARMS,charmMul,SECRET_BOSS,secretBoss,ANIMALS,POOL20,mkMob,SHOP_TOP,AREA_COLOR,GUARDIANS,guardianFor,BOSS_DEF,DMG_STATS,CONFIG,floorScale,curve,rng,JOBS,BASIC_JOBS,SKILLS,SLOT_MAX,ITEMS,WEAPONS,WEAPON_POW,WEAPON_PRICE,WEAPON_LINES,weaponName,bestLine,ARMORS,ARCH,expNext,jobSkills,slotCandidates,skillsOf,setSlots,passives,derived,
  newMember,learnUpTo,jobUnlocked,canChangeJob,changeJob,jobStartLv,gainExp,mkEnemy,floorGroups,rollGroup,bossFor,newBattle,battleTurn,visState,autoCmd,battleRewards,giveRewards,
  aliveParty,aliveEnemies,statusChance,enemyAtk,enemyDef,newGame,ST_NAME,EL_NAME};
if(typeof module!=='undefined')module.exports=CORE;
