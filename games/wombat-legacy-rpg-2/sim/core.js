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
  bossStatusRate:.4,        // ボスには状態異常の確率×この値
  bossStatusRepeat:.7,      // ボスに同じ状態異常がかかるたびに、次の確率×この値
  bossPoisonDot:.5,         // ボスへの毒ダメージ×この値
  buff:{atk:1.3,def:1.5,spd:1.3,turns:3},
  debuff:{atk:.7,def:.6,turns:3},
  kiaiMax:3, kiaiPow:.2,    // きあい1段ごとに物理ダメージ+20%
  counterRate:.25, evadeBase:.03,
  guardCut:.5,
  // 敵の強さ：floorScale(f) をもとに決める
  enemy:{hp:[16,1.45],atk:[9,1.0],def:[3,1.0],spd:[6,.35],exp:[8,1.55],gold:[5,1.25]},
  boss:{mid:{hp:14,atk:1.3,def:1.2,exp:12,gold:15},big:{hp:26,atk:1.4,def:1.3,exp:25,gold:30}},
};
function floorScale(f){return 1+.11*(f-1)+.0035*(f-1)*(f-1);}

// ---------- 職業 ----------
// mult: ステータスの倍率 / expK: 必要経験値の係数 / cap: レベル上限 / req: 解放条件（1匹ずつ数える）
// wmode: 武器の強さがどこに入るか（phys=こうげき, mag=まりょく, mix=こうげき＋まりょく半分）
const JOBS={
  war:{name:'戦士',     tier:1,cap:20,expK:1.0,wmode:'phys',mult:{hp:1.2, mp:.4, atk:1.15,def:1.2, mag:.3, spd:.8}},
  kar:{name:'空手家',   tier:1,cap:20,expK:1.0,wmode:'phys',mult:{hp:1.0, mp:.4, atk:1.1, def:.8,  mag:.3, spd:1.2}},
  mag:{name:'魔法使い', tier:1,cap:20,expK:1.1,wmode:'mag', mult:{hp:.7,  mp:1.4,atk:.5,  def:.6,  mag:1.3,spd:1.0}},
  pri:{name:'僧侶',     tier:1,cap:20,expK:1.1,wmode:'mix', mult:{hp:.85, mp:1.2,atk:.7,  def:.8,  mag:1.1,spd:.9}},
  poi:{name:'毒使い',   tier:1,cap:20,expK:1.0,wmode:'mix', mult:{hp:.85, mp:1.0,atk:.85, def:.75, mag:1.0,spd:1.1}},
  sin:{name:'歌い手',   tier:1,cap:20,expK:1.0,wmode:'mix', mult:{hp:.85, mp:1.1,atk:.7,  def:.8,  mag:1.0,spd:1.05}},
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
  const keys=['hp','mp','atk','def','mag','spd'];
  const mk=(id,k)=>{const J=JOBS[id];if(J.mult)return;
    J.req.forEach(r=>mk(r,k));
    J.mult={};for(const s of keys){let sum=0,mx=0;for(const r of J.req){sum+=JOBS[r].mult[s];mx=Math.max(mx,JOBS[r].mult[s]);}
      J.mult[s]=+((sum/J.req.length*.5+mx*.5)*(J.tier===2?1.12:1.12)).toFixed(3);}
    const w=J.req.map(r=>JOBS[r].wmode);J.wmode=w.every(x=>x==='phys')?'phys':w.every(x=>x==='mag')?'mag':'mix';};
  for(const id in JOBS)mk(id);
})();
const BASIC_JOBS=Object.keys(JOBS).filter(k=>JOBS[k].tier===1);

function expNext(job,lv){const [a,b]=CONFIG.expBase;return Math.floor(JOBS[job].expK*(a*lv*lv+b*lv));}

// ---------- スキル ----------
// kind:
//  phys  物理（pow倍） / mag 魔法（base + まりょく×k、el=属性） / heal 回復 / cure 状態異常をなおす / revive 生きかえらせる
//  guard かばう / status 状態異常・デバフ（st, rate） / buff 歌（buff: atk|def|spd|all）
//  kiai きあいをためる / finisher きあいを全部つかう大技 / passive 持っているだけで効く（eff）
// tgt: self enemy enemies ally allies dead poisoned
// lv: その職業で覚えるレベル。master: レベル上限で手に入る強いスキル
const SKILLS={
  // 戦士（前作どおりの守り役）
  guard:  {name:'おしりガード',job:'war',lv:1, mp:0, tgt:'self',kind:'guard'},
  dig:    {name:'ほりほりアタック',job:'war',lv:3,mp:2,tgt:'enemy',kind:'phys',pow:1.6},
  hpup1:  {name:'がんじょう',job:'war',lv:5,tgt:'self',kind:'passive',eff:{hp:.1}},
  roll:   {name:'ころがりタックル',job:'war',lv:7,mp:4,tgt:'enemies',kind:'phys',pow:.85},
  quake:  {name:'だいちのいちげき',job:'war',lv:12,mp:7,tgt:'enemy',kind:'phys',pow:2.6},
  defup1: {name:'あついけがわ',job:'war',lv:16,tgt:'self',kind:'passive',eff:{def:.15}},
  ironbutt:{name:'てつのおしり',job:'war',master:true,tgt:'self',kind:'passive',eff:{guardCut:.3,hp:.1}},
  // 空手家（自分を強くする・カウンター）
  kiai:   {name:'きあい',job:'kar',lv:1,tgt:'self',kind:'passive',eff:{kiai:1}},  // 物理で攻撃するたびにきあいが1段たまる
  seiken: {name:'せいけんづき',job:'kar',lv:2,mp:2,tgt:'enemy',kind:'phys',pow:1.4},
  counter:{name:'カウンター',job:'kar',lv:4,tgt:'self',kind:'passive',eff:{counter:CONFIG.counterRate}},
  dodge:  {name:'みきり',job:'kar',lv:6,tgt:'self',kind:'passive',eff:{evade:.1}},
  rush:   {name:'れんぞくげり',job:'kar',lv:8,mp:5,tgt:'enemy',kind:'phys',pow:.6,hits:3},
  finish: {name:'ひっさつせいけん',job:'kar',lv:12,mp:6,tgt:'enemy',kind:'finisher',pow:1.3,perKiai:.8},
  spdup1: {name:'しゅんそく',job:'kar',lv:16,tgt:'self',kind:'passive',eff:{spd:.15}},
  ironfist:{name:'てっけん',job:'kar',master:true,tgt:'self',kind:'passive',eff:{kiaiMax:2,counter:.15}},
  // 魔法使い
  thunder:{name:'ピリリ',job:'mag',lv:1,mp:2,tgt:'enemy',kind:'mag',el:'thunder',base:6,k:.9},
  ice:    {name:'ヒエヒエ',job:'mag',lv:3,mp:4,tgt:'enemies',kind:'mag',el:'ice',base:5,k:.6},
  sleep:  {name:'ねむねむ',job:'mag',lv:5,mp:3,tgt:'enemies',kind:'status',st:'sleep',rate:.6},
  fire:   {name:'メラメラ',job:'mag',lv:8,mp:6,tgt:'enemies',kind:'mag',el:'fire',base:14,k:.9},
  magup1: {name:'まりょくのめばえ',job:'mag',lv:10,tgt:'self',kind:'passive',eff:{mag:.1}},
  bolt:   {name:'ゴロゴロ',job:'mag',lv:12,mp:6,tgt:'enemy',kind:'mag',el:'thunder',base:30,k:1.5},
  boom:   {name:'ドカーン',job:'mag',lv:17,mp:12,tgt:'enemies',kind:'mag',el:null,base:40,k:1.3},
  awaken: {name:'まりょくかくせい',job:'mag',master:true,tgt:'self',kind:'passive',eff:{mag:.2,mp:.15}},
  // 僧侶（回復。前作の「まもりの葉」は歌い手に役目をゆずる）
  heal:   {name:'いやし',job:'pri',lv:1,mp:2,tgt:'ally',kind:'heal',base:18,k:1.2},
  cure:   {name:'きよめ',job:'pri',lv:2,mp:1,tgt:'poisoned',kind:'cure'},
  mpup1:  {name:'めいそう',job:'pri',lv:4,tgt:'self',kind:'passive',eff:{mp:.15}},
  light:  {name:'ひかり',job:'pri',lv:5,mp:3,tgt:'enemy',kind:'mag',el:'light',base:10,k:.9},
  healall:{name:'みんないやし',job:'pri',lv:7,mp:6,tgt:'allies',kind:'heal',base:22,k:1.0},
  revive: {name:'めざめ',job:'pri',lv:10,mp:8,tgt:'dead',kind:'revive'},
  healup: {name:'いのりの心',job:'pri',lv:15,tgt:'self',kind:'passive',eff:{healPow:.2}},
  autorev:{name:'ふっかつのいのり',job:'pri',master:true,tgt:'self',kind:'passive',eff:{autoRevive:1}}, // 1回の戦闘で1度、倒れた仲間がHP半分で起きる
  // 毒使い（状態異常とデバフ）
  venom:  {name:'どくばり',job:'poi',lv:1,mp:2,tgt:'enemy',kind:'status',st:'poison',rate:.75,pow:.6},
  weaken: {name:'しびれごな',job:'poi',lv:3,mp:3,tgt:'enemy',kind:'status',st:'atkdn',rate:.8},
  mist:   {name:'どくのきり',job:'poi',lv:5,mp:5,tgt:'enemies',kind:'status',st:'poison',rate:.5},
  crack:  {name:'よろいくだき',job:'poi',lv:7,mp:4,tgt:'enemy',kind:'status',st:'defdn',rate:.8,pow:.6},
  stun:   {name:'まひのきば',job:'poi',lv:10,mp:5,tgt:'enemy',kind:'status',st:'stun',rate:.5,pow:.8},
  fang:   {name:'どくのきば',job:'poi',lv:12,tgt:'self',kind:'passive',eff:{atkPoison:.25}},
  strongp:{name:'もうどく',job:'poi',lv:16,tgt:'self',kind:'passive',eff:{poisonPow:.5}},
  plague: {name:'しのびよる毒',job:'poi',master:true,tgt:'self',kind:'passive',eff:{statusRate:.25}},
  // 歌い手（バフ）
  sAtk:   {name:'いさましの歌',job:'sin',lv:1,mp:3,tgt:'allies',kind:'buff',buff:'atk'},
  sDef:   {name:'まもりの歌',job:'sin',lv:3,mp:3,tgt:'allies',kind:'buff',buff:'def'},
  sSpd:   {name:'はやての歌',job:'sin',lv:6,mp:3,tgt:'allies',kind:'buff',buff:'spd'},
  sHeal:  {name:'いやしの歌',job:'sin',lv:8,mp:5,tgt:'allies',kind:'heal',base:12,k:.7},
  sSleep: {name:'ねむりの歌',job:'sin',lv:10,mp:4,tgt:'enemies',kind:'status',st:'sleep',rate:.5},
  longv:  {name:'のびやかな声',job:'sin',lv:12,tgt:'self',kind:'passive',eff:{buffTurns:2}},
  sAll:   {name:'かっさいの歌',job:'sin',lv:16,mp:10,tgt:'allies',kind:'buff',buff:'all'},
  echo:   {name:'ひびく声',job:'sin',master:true,tgt:'self',kind:'passive',eff:{buffPow:.5}},
};
for(const id in SKILLS)SKILLS[id].id=id;
const EL_NAME={fire:'ほのお',ice:'こおり',thunder:'かみなり',light:'ひかり'};
const ST_NAME={poison:'どく',sleep:'ねむり',stun:'まひ',atkdn:'こうげき↓',defdn:'ぼうぎょ↓'};
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

// ---------- 装備（仮：店の段階ごとに1つ） ----------
// 職業が変わっても持ちかえなくてすむよう、武器と防具は1種類ずつ。強さは段階で決まる
const WEAPONS=[[ '木のぼう',3,0],['石のツメ',8,90],['鉄のツメ',15,320],['ユーカリの大剣',24,900],['オパールのツメ',36,2400],
  ['水晶のツメ',50,5200],['化石のツメ',66,9800],['いにしえのツメ',84,16000],['ほろびの大ツメ',104,26000],['レガシーのツメ',126,40000],['レガシーのツメ+',150,60000]];
const ARMORS=[['草のふく',2,0],['かわのよろい',6,80],['いわのよろい',12,300],['こうらのよろい',19,850],['オパールのよろい',28,2200],
  ['水晶のよろい',38,4800],['化石のよろい',50,9000],['いにしえのよろい',63,15000],['ほろびのよろい',78,24000],['レガシーのよろい',94,38000],['レガシーのよろい+',112,56000]];
const ITEMS={
  herb: {name:'やくそう',price:8,heal:30},
  herb2:{name:'上やくそう',price:30,heal:90},
  herb3:{name:'特上やくそう',price:120,heal:300},
  antidote:{name:'どくけし草',price:6,cure:true},
  water:{name:'まほうのしずく',price:40,mp:20},
  leaf: {name:'めざめの葉',price:80,revive:true},
};

// ---------- 仲間 ----------
function baseStat(m,k){const b=CONFIG.base[k];return (b[0]+b[1]*(m.lv-1))*JOBS[m.job].mult[k];}
function derived(m){
  const p=passives(m),J=JOBS[m.job],w=WEAPONS[m.w][1],a=ARMORS[m.a][1];
  const st=k=>Math.floor(baseStat(m,k)*(1+(p[k]||0)));
  const d={maxhp:st('hp'),maxmp:st('mp'),atk:st('atk'),def:st('def')+a,mag:st('mag'),spd:st('spd')};
  if(J.wmode==='phys')d.atk+=w;else if(J.wmode==='mag'){d.mag+=w;d.atk+=Math.floor(w/2);}else{d.atk+=w;d.mag+=Math.floor(w/2);}
  d.p=p;return d;
}
function newMember(job,name){
  const m={name,job,lv:1,exp:0,w:0,a:0,hp:1,mp:0,poison:false,mastered:{},learned:{},slots:[],totalExp:0};
  learnUpTo(m);const d=derived(m);m.hp=d.maxhp;m.mp=d.maxmp;return m;
}
function learnUpTo(m){const got=[];for(const k of jobSkills(m))if(!m.learned[k]){m.learned[k]=1;got.push(k);}return got;}
// 1匹ずつ数える解放条件
function jobUnlocked(m,job,G){
  const J=JOBS[job];if(J.tier===1)return true;
  return J.req.every(r=>m.mastered[r]);
}
function canChangeJob(G){return !!(G&&G.flags&&G.flags.jobChange);}
function changeJob(m,job){
  if(!jobUnlocked(m,job))return false;
  m.job=job;m.lv=1;m.exp=0;learnUpTo(m);
  // 今の職業のスキルが枠にあったら外す
  m.slots=m.slots.filter(k=>SKILLS[k].job!==job);
  const d=derived(m);m.hp=d.maxhp;m.mp=d.maxmp;m.poison=false;return true;
}
// 経験値。返り値はメッセージ
function gainExp(m,amt){
  const out=[],J=JOBS[m.job];if(m.hp<=0)return out;
  m.totalExp+=amt;
  if(m.lv>=J.cap)return out;
  m.exp+=amt;
  while(m.lv<J.cap&&m.exp>=expNext(m.job,m.lv)){
    m.exp-=expNext(m.job,m.lv);const before=derived(m);m.lv++;const after=derived(m);
    out.push(`${m.name}は レベル${m.lv}に あがった！`);
    m.hp=Math.min(after.maxhp,m.hp+(after.maxhp-before.maxhp));m.mp=Math.min(after.maxmp,m.mp+(after.maxmp-before.maxmp));
    if(m.lv>=J.cap){m.mastered[m.job]=true;m.exp=0;out.push(`${m.name}は ${J.name}を きわめた！`);}
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
  metal: {metal:true},
};
function mkEnemy(f,arch,opt){
  opt=opt||{};const A=ARCH[arch],s=floorScale(f),C=CONFIG.enemy;
  const v=(k)=>C[k][0]*Math.pow(s,C[k][1]);
  let e;
  if(A.metal){e={hp:5,max:5,atk:Math.round(v('atk')*1.2),def:0,spd:Math.round(v('spd')*3),exp:Math.round(v('exp')*12),gold:Math.round(v('gold')*3),metal:true,flee:.35};}
  else e={hp:Math.round(v('hp')*A.hp),atk:Math.round(v('atk')*A.atk),def:Math.round(v('def')*A.def),spd:Math.round(v('spd')*A.spd),
    exp:Math.round(v('exp')*A.hp),gold:Math.round(v('gold')*A.hp),acts:A.acts||1,moves:A.moves};
  if(opt.boss){const B=CONFIG.boss[opt.boss];e.hp=Math.round(v('hp')*B.hp);e.atk=Math.round(v('atk')*B.atk);e.def=Math.round(v('def')*B.def);e.spd=Math.round(v('spd')*1.1);
    e.exp=Math.round(v('exp')*B.exp);e.gold=Math.round(v('gold')*B.gold);e.boss=true;e.acts=opt.boss==='big'&&f>=20?2:1;
    e.moves=[{n:'こうげき',k:'atk',w:3},{n:'つよいこうげき',k:'atk',pow:1.6,w:2},{n:'あばれまわる',k:'all',pow:.7,w:2},{n:'どくのいき',k:'all',pow:.4,poison:.35,w:f>=10?1:0}];}
  e.max=e.hp;e.arch=arch;e.f=f;e.name=opt.name||(opt.boss?`B${f}のボス`:`${arch}(B${f})`);e.st={};e.res={};e.weak=opt.weak||[];
  return e;
}
// その階に出る敵の組み合わせ（仮）
function floorGroups(f){
  const area=Math.floor((f-1)/10);
  const pool=[['normal','normal'],['tank'],['fast','normal'],['poison'],['normal','normal','normal'],['wide','normal'],['caller'],['heavy']];
  if(f>=8)pool.push(['twice']);
  if(f>=15)pool.push(['tank','poison'],['heavy','fast']);
  if(f>=25)pool.push(['twice','wide'],['caller','poison','normal']);
  return {pool,weak:[['fire'],['ice'],['thunder'],['light'],['fire','light']][area%5],metalRate:.04};
}
function rollGroup(f,r){
  const G=floorGroups(f);
  if(r()<G.metalRate)return [mkEnemy(f,'metal',{name:'ハリモグラ'})];
  const g=G.pool[Math.floor(r()*G.pool.length)];
  return g.map(a=>mkEnemy(f,a,{weak:G.weak}));
}
function bossFor(f){if(f%10===0)return [mkEnemy(f,'normal',{boss:'big',weak:floorGroups(f).weak})];if(f%5===0)return [mkEnemy(f,'normal',{boss:'mid',weak:floorGroups(f).weak})];return null;}

// ---------- 戦闘 ----------
function aliveParty(B){return B.party.map((m,i)=>i).filter(i=>B.party[i].hp>0);}
function aliveEnemies(B){return B.enemies.map((e,i)=>i).filter(i=>B.enemies[i].hp>0);}
function newBattle(G,enemies){
  const cnt={};enemies.forEach(e=>cnt[e.name]=(cnt[e.name]||0)+1);const used={};
  enemies.forEach(e=>{if(cnt[e.name]>1){used[e.name]=(used[e.name]||0)+1;e.name+=' '+'ABCD'[used[e.name]-1];}});
  G.party.forEach(m=>{m.kiai=0;});
  return {party:G.party,inv:G.inv,enemies,buff:{},over:null,turn:0,boss:enemies.some(e=>e.boss),revived:{}};
}
function elemMult(e,el){if(!el)return 1;return e.weak.includes(el)?1.5:1;}
function physDmg(atk,def,pow,r){let b=atk-def/2;if(b<2)b=1+r()*1.5;return Math.max(1,Math.round(b*(.85+r()*.3)*(pow||1)));}
function buffPow(B,k,party){const t=B.buff[k];if(!t||t.turns<=0)return 1;return 1+(CONFIG.buff[k]-1)*(1+t.pow);}
function memberAtk(B,m){const d=derived(m);return d.atk*buffPow(B,'atk')*(1+CONFIG.kiaiPow*(m.kiai||0));}
function memberDef(B,m){const d=derived(m);return d.def*buffPow(B,'def')*(m.poison?CONFIG.poisonDefDown:1);}
function memberSpd(B,m){return derived(m).spd*buffPow(B,'spd');}
function enemyDef(e){return e.def*(e.st.defdn>0?CONFIG.debuff.def:1)*(e.st.poison>0?CONFIG.poisonDefDown:1);}
function enemyAtk(e){return e.atk*(e.st.atkdn>0?CONFIG.debuff.atk:1);}
// 状態異常がかかる確率（画面にも出す予定）
function statusChance(B,m,S,e){
  if(e.metal)return 0;
  const p=m?passives(m):{};
  let c=S.rate*(1+(p.statusRate||0));
  if(e.boss)c*=CONFIG.bossStatusRate*Math.pow(CONFIG.bossStatusRepeat,e.res[S.st]||0);
  return Math.min(.95,c);
}
function skillDmgEstimate(B,m,S,e){
  const d=derived(m);
  if(S.kind==='mag'){if(e.metal)return 0;return (S.base+d.mag*S.k)*elemMult(e,S.el)*(1+(d.p.magPow||0));}
  if(S.kind==='phys'||S.kind==='finisher'){if(e.metal)return 1;const pow=S.kind==='finisher'?S.pow+S.perKiai*(m.kiai||0):S.pow*(S.hits||1);return Math.max(1,memberAtk(B,m)-enemyDef(e)/2)*pow;}
  return 0;
}

// おまかせ（どの職業・引き継ぎスキルの組み合わせでも動くよう、スキルの種類で判断する）
function autoCmd(B,i){
  const m=B.party[i],d=derived(m),en=aliveEnemies(B),sk=skillsOf(m);
  const P=B.party;
  const low=j=>P[j].hp/derived(P[j]).maxhp;
  const can=k=>sk.includes(k)&&m.mp>=(SKILLS[k].mp||0)&&SKILLS[k].kind!=='passive';
  const ofKind=(kind,f)=>sk.filter(k=>SKILLS[k].kind===kind&&can(k)&&(!f||f(SKILLS[k])));
  const E=j=>B.enemies[j];
  const metal=en.find(j=>E(j).metal);
  const saveMp=!B.boss&&m.mp<d.maxmp*.3;
  const weakest=()=>en.slice().sort((a,b)=>E(a).hp-E(b).hp)[0];
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
  // 3. 毒をなおす
  const poi=aliveParty(B).filter(j=>P[j].poison);
  if(poi.length&&ofKind('cure').length&&(B.boss||poi.length>=2||low(poi[0])<.6))return {k:'skill',s:ofKind('cure')[0],t:poi[0]};
  // 4. メタル
  if(metal!==undefined)return {k:'attack',t:metal};
  // 5. 歌（ボス戦、または敵が多いとき）
  if(B.boss||en.length>=3){
    const songs=ofKind('buff');
    const need=b=>!(B.buff[b]&&B.buff[b].turns>1);
    if(songs.includes('sAll')&&['atk','def','spd'].filter(need).length>=2)return {k:'skill',s:'sAll'};
    for(const b of ['atk','def','spd']){const s=songs.find(k=>SKILLS[k].buff===b);if(s&&need(b)&&(!saveMp||B.boss))return {k:'skill',s};}
  }
  // 6. かばう
  if(sk.includes('guard')&&low(i)>.5&&aliveParty(B).some(j=>j!==i&&low(j)<.35)&&(en.length>=2||B.boss))return {k:'skill',s:'guard'};
  // 7. 状態異常・デバフ（ボスや強い敵に）
  const sts=ofKind('status');
  if(sts.length&&!saveMp){
    const tough=B.boss?en:en.filter(j=>E(j).hp>d.atk*2.5);
    let best=null,bs=0;
    for(const k of sts){const S=SKILLS[k];
      const ts=S.tgt==='enemies'?en:tough;
      let sc=0;for(const j of ts){const e=E(j);if(e.st[S.st]>0)continue;const c=statusChance(B,m,S,e);
        const val={poison:B.boss?3:1.6,defdn:B.boss?2.2:1,atkdn:B.boss?2:1,stun:B.boss?2.5:1.4,sleep:B.boss?1.5:1.6}[S.st]||1;sc+=c*val;}
      if(S.tgt==='enemies'&&en.length<2&&!B.boss)sc*=.5;
      if(sc>bs){bs=sc;best=k;}}
    if(best&&bs>=(B.boss?.5:.9)){const S=SKILLS[best];const t=S.tgt==='enemies'?null:(B.boss?en[0]:tough.find(j=>!(E(j).st[S.st]>0)));if(S.tgt==='enemies'||t!==undefined)return {k:'skill',s:best,t};}
  }
  // 8. 攻撃スキル
  if(!saveMp||B.boss){
    let best=null,bs=0,bt=null;
    const atkLike=sk.filter(k=>['phys','mag','finisher'].includes(SKILLS[k].kind)&&can(k));
    const plain=en.reduce((s,j)=>Math.max(s,Math.max(1,memberAtk(B,m)-enemyDef(E(j))/2)),0);
    for(const k of atkLike){const S=SKILLS[k];
      if(S.kind==='finisher'&&(m.kiai||0)<Math.min(3,(CONFIG.kiaiMax+(d.p.kiaiMax||0))))continue;
      if(S.tgt==='enemies'){let sc=0;for(const j of en)sc+=Math.min(E(j).hp,skillDmgEstimate(B,m,S,E(j)));if(sc>bs){bs=sc;best=k;bt=null;}}
      else{const t=B.boss?en[0]:strongest();const sc=Math.min(E(t).hp,skillDmgEstimate(B,m,S,E(t)));if(sc>bs){bs=sc;best=k;bt=t;}}}
    if(best&&bs>plain*1.25)return {k:'skill',s:best,t:bt};
  }
  return {k:'attack',t:weakest()};
}

function battleTurn(B,cmds,r){
  const ev=[],P=B.party,EN=B.enemies;B.turn++;
  const acts=[];
  P.forEach((m,i)=>{if(m.hp>0&&cmds[i]){const c=cmds[i];const pri=(c.k==='skill'&&c.s==='guard')||c.k==='defend'?100:0;acts.push({side:'p',i,c,o:pri+memberSpd(B,m)*(.75+r()*.5)});}});
  EN.forEach((e,i)=>{if(e.hp>0){const n=e.acts||1;for(let k=0;k<n;k++)acts.push({side:'e',i,o:e.spd*(.75+r()*.5)-k*30});}});
  acts.sort((a,b)=>b.o-a.o);
  const guard={},defend={};
  for(const a of acts)if(a.side==='p'&&a.c.k==='defend')defend[a.i]=1;
  const checkEnd=()=>{
    if(!aliveEnemies(B).length){B.over=EN.every(e=>e.fled)?'fled':'win';return true;}
    if(!aliveParty(B).length){B.over='lose';return true;}return false;};
  const metalDmg=(e,dmg,crit)=>e.metal?(crit?3:1):dmg;
  const addKiai=m=>{const p=derived(m).p;if(p.kiai)m.kiai=Math.min(CONFIG.kiaiMax+(p.kiaiMax||0),(m.kiai||0)+p.kiai);};
  const hitEnemy=(i,dmg,extra)=>{const e=EN[i];if(e.hp<=0)return;e.hp=Math.max(0,e.hp-dmg);ev.push(Object.assign({t:'hit',side:'e',i,dmg,hp:e.hp},extra||{}));
    if(e.st.sleep>0&&e.hp>0&&r()<.5){e.st.sleep=0;ev.push({t:'msg',text:`${e.name}は めをさました！`});}
    if(e.hp<=0){ev.push({t:'die',side:'e',i});}};
  const applyStatus=(m,S,i)=>{const e=EN[i];if(e.hp<=0)return;
    if(e.st[S.st]>0){ev.push({t:'msg',text:`${e.name}は すでに ${ST_NAME[S.st]}だ。`});return;}
    const c=statusChance(B,m,S,e);
    if(r()<c){const turns=S.st==='poison'?99:S.st==='sleep'?2+Math.floor(r()*2):S.st==='stun'?(e.boss?1:2):CONFIG.debuff.turns;
      e.st[S.st]=turns;if(e.boss)e.res[S.st]=(e.res[S.st]||0)+1;
      if(S.st==='poison')e.poisonPow=1+(m?passives(m).poisonPow||0:0);
      ev.push({t:'status',side:'e',i,st:S.st,text:`${e.name}は ${ST_NAME[S.st]}に なった！`});}
    else ev.push({t:'msg',text:`${e.name}には きかなかった。`});};
  const autoRevive=()=>{ // ふっかつのいのり
    for(let j=0;j<P.length;j++){const x=P[j];if(x.hp>0||B.revived[j])continue;
      const holder=P.find(y=>y.hp>0&&derived(y).p.autoRevive);if(!holder)return;
      B.revived[j]=1;x.hp=Math.ceil(derived(x).maxhp/2);ev.push({t:'revive',i:j,hp:x.hp,text:`いのりが とどき、${x.name}は おきあがった！`});}};
  const hitParty=(i,dmg,extra,poison,phys,ei)=>{
    let tgt=i;
    if(guard.who!==undefined&&guard.who!==i&&P[guard.who].hp>0){tgt=guard.who;const cut=derived(P[tgt]).p.guardCut??CONFIG.guardCut;dmg=Math.max(1,Math.round(dmg*cut));ev.push({t:'msg',text:`${P[tgt].name}が おしりで かばった！`});}
    else if(defend[i])dmg=Math.max(1,Math.round(dmg*.5));
    const m=P[tgt],dp=derived(m).p;
    if(phys&&r()<CONFIG.evadeBase+(dp.evade||0)){ev.push({t:'msg',text:`${m.name}は ひらりと かわした！`});
      if(dp.counter&&ei!==undefined&&r()<dp.counter)counter(tgt,ei);return;}
    m.hp=Math.max(0,m.hp-dmg);ev.push(Object.assign({t:'hit',side:'p',i:tgt,dmg,hp:m.hp},extra||{}));
    if(m.hp<=0){m.poison=false;m.kiai=0;ev.push({t:'die',side:'p',i:tgt});autoRevive();return;}
    if(poison&&!m.poison&&r()<poison){m.poison=true;ev.push({t:'status',side:'p',i:tgt,st:'poison',text:`${m.name}は どくに おかされた！`});}
    if(phys&&dp.counter&&ei!==undefined&&r()<dp.counter)counter(tgt,ei);};
  const counter=(pi,ei)=>{const m=P[pi],e=EN[ei];if(!e||e.hp<=0||m.hp<=0)return;
    ev.push({t:'act',side:'p',i:pi,text:`${m.name}の カウンター！`});
    const dmg=metalDmg(e,physDmg(memberAtk(B,m),enemyDef(e),1,r));hitEnemy(ei,dmg,{text:`${e.name}に ${dmg}の ダメージ！`});addKiai(m);};
  const pickEnemy=t=>{const al=aliveEnemies(B);if(al.includes(t))return t;return al[Math.floor(r()*al.length)];};
  const physHit=(m,t,pow)=>{const e=EN[t];const crit=r()<1/20;const atk=memberAtk(B,m);
    const dmg=metalDmg(e,crit?Math.round(atk*(1.4+r()*.2)*pow):physDmg(atk,enemyDef(e),pow,r),crit);
    hitEnemy(t,dmg,{crit,text:`${e.name}に ${dmg}の ダメージ！`});
    const p=derived(m).p;if(p.atkPoison&&e.hp>0&&!e.st.poison&&r()<statusChance(B,m,{rate:p.atkPoison,st:'poison'},e)){e.st.poison=99;if(e.boss)e.res.poison=(e.res.poison||0)+1;e.poisonPow=1+(p.poisonPow||0);ev.push({t:'status',side:'e',i:t,st:'poison',text:`${e.name}は どくに なった！`});}};
  for(const a of acts){
    if(B.over)break;
    if(a.side==='p'){
      const m=P[a.i];if(m.hp<=0)continue;const d=derived(m),c=a.c;
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
        const tm=P[t],td=derived(tm);
        if(it.revive)tm.hp=Math.ceil(td.maxhp/2);
        if(it.heal)tm.hp=Math.min(td.maxhp,tm.hp+it.heal);
        if(it.mp)tm.mp=Math.min(td.maxmp,tm.mp+it.mp);
        if(it.cure)tm.poison=false;
      } else if(c.k==='skill'){
        const S=SKILLS[c.s];
        if(!skillsOf(m).includes(c.s)||S.kind==='passive')continue;
        if(m.mp<(S.mp||0)){ev.push({t:'act',side:'p',i:a.i,text:`${m.name}は ${S.name}を つかおうとしたが MPが たりない！`});continue;}
        m.mp-=S.mp||0;ev.push({t:'act',side:'p',i:a.i,s:c.s,text:`${m.name}は ${S.name}を つかった！`});
        if(S.kind==='guard'){guard.who=a.i;}
        else if(S.kind==='phys'){const ts=S.tgt==='enemies'?aliveEnemies(B):[pickEnemy(c.t)];
          for(const t of ts)for(let h=0;h<(S.hits||1);h++){if(EN[t].hp<=0)break;physHit(m,t,S.pow);}addKiai(m);}
        else if(S.kind==='finisher'){const t=pickEnemy(c.t);const pow=S.pow+S.perKiai*(m.kiai||0);m.kiai=0;physHit(m,t,pow);}
        else if(S.kind==='mag'){const ts=S.tgt==='enemies'?aliveEnemies(B):[pickEnemy(c.t)];
          for(const t of ts){const e=EN[t];if(e.hp<=0)continue;if(e.metal){ev.push({t:'msg',text:`${e.name}は まほうを はじいた！`});continue;}
            const mu=elemMult(e,S.el);const dmg=Math.max(1,Math.round((S.base+d.mag*S.k)*(.9+r()*.2)*mu));hitEnemy(t,dmg,{weak:mu>1,text:`${e.name}に ${dmg}の ダメージ！`});}}
        else if(S.kind==='status'){const ts=S.tgt==='enemies'?aliveEnemies(B):[pickEnemy(c.t)];
          for(const t of ts){if(S.pow){const e=EN[t];physHit(m,t,S.pow);if(e.hp<=0)continue;}applyStatus(m,S,t);}}
        else if(S.kind==='heal'){let ts=S.tgt==='allies'?aliveParty(B):[c.t];
          if(S.tgt==='ally'&&(ts[0]===undefined||P[ts[0]].hp<=0)){ts=[aliveParty(B).sort((x,y)=>P[x].hp/derived(P[x]).maxhp-P[y].hp/derived(P[y]).maxhp)[0]];}
          for(const t of ts){const tm=P[t],td=derived(tm);const amt=Math.min(Math.round((S.base+d.mag*S.k)*(1+(d.p.healPow||0))*(.9+r()*.2)),td.maxhp-tm.hp);tm.hp+=amt;ev.push({t:'heal',side:'p',i:t,amt,hp:tm.hp});}}
        else if(S.kind==='cure'){let t=c.t;if(!P[t]||P[t].hp<=0||!P[t].poison){const pp=aliveParty(B).find(j=>P[j].poison);if(pp===undefined)continue;t=pp;}P[t].poison=false;}
        else if(S.kind==='buff'){const turns=CONFIG.buff.turns+(d.p.buffTurns||0)+1,pow=d.p.buffPow||0;
          for(const b of S.buff==='all'?['atk','def','spd']:[S.buff])B.buff[b]={turns,pow};ev.push({t:'buff',buff:S.buff});}
        else if(S.kind==='revive'){let t=c.t;if(P[t].hp>0){const dd=P.findIndex(x=>x.hp<=0);if(dd<0)continue;t=dd;}
          P[t].hp=Math.ceil(derived(P[t]).maxhp/2);ev.push({t:'revive',i:t,hp:P[t].hp});}
      }
    } else {
      const e=EN[a.i];if(e.hp<=0)continue;
      if(e.st.sleep>0){e.st.sleep--;continue;}
      if(e.st.stun>0){e.st.stun--;ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は しびれて うごけない！`});continue;}
      const moves=(e.moves||[{n:'こうげき',k:'atk',w:1}]).filter(x=>x.w>0);
      if(e.flee&&r()<e.flee){e.hp=0;e.fled=true;ev.push({t:'die',side:'e',i:a.i,fled:true});if(checkEnd())break;continue;}
      let tw=moves.reduce((s,x)=>s+x.w,0),x=r()*tw,mv=moves[0];for(const mm of moves){x-=mm.w;if(x<0){mv=mm;break;}}
      if(mv.k==='call'&&EN.filter(z=>z.hp>0).length>=3)mv=moves[0];
      const al=aliveParty(B);if(!al.length)break;
      // 狙い：戦士系（かばう持ち）を少し狙いやすい。HPの割合は見ない（弱った仲間ばかり狙わない）
      const pick=()=>{const w=al.map(j=>skillsOf(P[j]).includes('guard')?4:3);let s=w.reduce((p,q)=>p+q,0)*r();for(let k=0;k<al.length;k++){s-=w[k];if(s<0)return al[k];}return al[0];};
      if(mv.k==='atk'){const t=pick();ev.push({t:'act',side:'e',i:a.i,text:`${e.name}の ${mv.n}！`});
        hitParty(t,physDmg(enemyAtk(e),memberDef(B,P[t]),mv.pow||1,r),null,mv.poison,true,a.i);}
      else if(mv.k==='all'){ev.push({t:'act',side:'e',i:a.i,text:`${e.name}は ${mv.n}！`});
        for(const t of al){if(P[t].hp<=0)continue;hitParty(t,physDmg(enemyAtk(e),memberDef(B,P[t]),mv.pow,r),null,mv.poison,false);if(checkEnd())break;}}
      else if(mv.k==='call'){const ne=mkEnemy(e.f,'normal',{weak:e.weak});ne.name=e.name.replace(/ [A-E]$/,'')+' '+'ABCDE'[EN.length%5];ne.exp=Math.round(ne.exp*.6);ne.gold=Math.round(ne.gold*.6);EN.push(ne);ev.push({t:'add',i:EN.length-1});}
    }
    if(checkEnd())break;
  }
  if(!B.over){
    for(const i of aliveParty(B)){const m=P[i];if(!m.poison)continue;const dm=Math.min(m.hp-1,Math.max(1,Math.floor(derived(m).maxhp*CONFIG.poisonDot)));if(dm>0){m.hp-=dm;ev.push({t:'hit',side:'p',i,dmg:dm,hp:m.hp,poison:true});}}
    for(const i of aliveEnemies(B)){const e=EN[i];if(!(e.st.poison>0))continue;
      const dm=Math.max(1,Math.floor(e.max*CONFIG.enemyPoisonDot*(e.boss?CONFIG.bossPoisonDot:1)*(e.poisonPow||1)));hitEnemy(i,dm,{poison:true});}
    for(const e of EN)for(const k of ['atkdn','defdn'])if(e.st[k]>0)e.st[k]--;
    for(const k in B.buff)if(B.buff[k].turns>0)B.buff[k].turns--;
    checkEnd();
  }
  return ev;
}
function battleRewards(B){let exp=0,gold=0;for(const e of B.enemies){if(e.fled||e.hp>0)continue;exp+=e.exp;gold+=e.gold;}return {exp,gold};}
// 勝ったら、生きている仲間それぞれに経験値（倒れた仲間には入らない）
function giveRewards(G,B){const {exp,gold}=battleRewards(B);G.gold+=gold;const msgs=[];for(const m of G.party)if(m.hp>0)msgs.push(...gainExp(m,exp));return {exp,gold,msgs};}

function newGame(){
  return {v:1,party:[newMember('war','ガッシJr'),newMember('mag','ユーカJr'),newMember('pri','モフJr')],
    gold:100,inv:{herb:3,antidote:1},shopTier:1,reached:0,checkpoints:[0],bossDown:{},flags:{},battles:0};
}

const CORE={CONFIG,floorScale,rng,JOBS,BASIC_JOBS,SKILLS,SLOT_MAX,ITEMS,WEAPONS,ARMORS,ARCH,expNext,jobSkills,slotCandidates,skillsOf,setSlots,passives,derived,
  newMember,learnUpTo,jobUnlocked,canChangeJob,changeJob,gainExp,mkEnemy,floorGroups,rollGroup,bossFor,newBattle,battleTurn,autoCmd,battleRewards,giveRewards,
  aliveParty,aliveEnemies,statusChance,newGame,ST_NAME,EL_NAME};
if(typeof module!=='undefined')module.exports=CORE;
