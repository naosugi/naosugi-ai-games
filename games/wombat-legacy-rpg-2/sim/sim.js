#!/usr/bin/env node
// ===== ウォンバット☆レガシーRPG 2: シミュレーター =====
// 使い方:
//   node sim.js                 ぜんぶ実行して report.md を書き出す
//   node sim.js matrix          階×レベルの勝率表だけ
//   node sim.js campaign        自動プレイだけ
//   node sim.js --hours 30 --seeds 5
// 時間は「おまかせで遊んだときのめやす」。TIME の値で決まる仮の数字。
'use strict';
const C=require('./core.js');
const fs=require('fs'),path=require('path');

const TIME={battleBase:5,perTurn:2.5,floorWalk:f=>40+f*1.2,town:20};
// 1階あたりの戦闘の回数。「掘る」が使えると、近道を掘って1回へらせる（仮）
const battlesPerFloor=(f,dig)=>Math.max(2,3+Math.floor(f/20)-(dig?1:0));
const shopMax=tier=>Math.min(C.WEAPONS.length-1,tier*2-1); // 店の段階 → 買える装備の番号の上限

// ---------- 引き継ぎ枠の選び方（おまかせ用の仮ルール） ----------
// スキルごとの点数。書いていないものは種類と効果から決める
const SLOT_SCORE={
  autorev:12,eternal:16,plague:8,echo:6,ironbutt:9,counter:8,dodge:6,hpup1:10,defup1:8,spdup1:6,mpup1:4,
  venom:6,weaken:5,mist:4,crack:6,stun:5,fang:5,strongp:3,sAtk:6,sDef:6,sSpd:3,sSleep:3,sAll:10,longv:4,
  noroi:7,boom:6,bigMagic:8,kagebunshin:6,bunshin:5,cleanSong:5,panacea:5,magCure:5,startCure:3,
  pinch:7,pinchRegen:6,extraAct:9,killAtk:6,statusMagPow:4,jiwajiwa:4,curseMax:5,songHeal:5,kokoro:5,guardHeal:4,guardCounter:5,
};
const PASSIVE_W={hp:80,def:55,mp:25,spd:40,evade:50,healPow:15,statusRate:25,buffTurns:2,buffPow:8,itemPow:4,poisonPow:6,atkPoison:20,statusResist:8};
function slotScore(m,k,partyHasHeal){
  const S=C.SKILLS[k],J=C.JOBS[m.job];
  const magJob=J.mult.mag>=1,physJob=J.mult.atk>=1;
  const kiaiJob=physJob&&(m.learned.kiai||C.jobSkills(m).includes('kiai'));
  let s;
  if(k in SLOT_SCORE)s=SLOT_SCORE[k];
  else if(S.kind==='passive'){s=0;for(const x in S.eff){const v=S.eff[x];
      if(x in PASSIVE_W)s+=PASSIVE_W[x]*v;
      else if(x==='mag')s+=(magJob?100:10)*v;
      else if(['kiai','kiaiMax','kiaiDef','kiaiMag','hurtKiai','singKiai','danceKiai','startKiai'].includes(x))s+=kiaiJob?8:1;
      else if(['poisonAtk','poisonRegen'].includes(x))s+=physJob?5:1;
      else s+=2;}}
  else if(S.kind==='mag')s=(magJob?5:1)*(S.tgt==='enemies'?1.3:1);
  else if(S.kind==='phys'||S.kind==='finisher')s=(physJob?4:1)*(S.tgt==='enemies'?1.3:1)*(S.kiaiCost||S.kind==='finisher'?(kiaiJob?1.2:.3):1);
  else if(S.kind==='heal')s=partyHasHeal?(S.tgt==='allies'?5:3):(S.tgt==='allies'?15:12);
  else if(S.kind==='revive')s=partyHasHeal?7:14;
  else if(S.kind==='status')s=4;
  else if(S.kind==='buff')s=5;
  else if(S.kind==='guard')s=physJob?3:1;
  else s=2;
  return s;
}
function chooseSlots(G){
  const P=G.party;
  const jobHeal=m=>C.jobSkills(m).some(k=>C.SKILLS[k].kind==='heal');
  // 回復役がいなければ、まりょくの高い仲間に回復を持たせる
  let healer=P.some(jobHeal);
  const order=P.map((m,i)=>i).sort((a,b)=>C.derived(P[b]).mag-C.derived(P[a]).mag);
  for(const i of order){const m=P[i];
    const cand=C.slotCandidates(m).filter(k=>!C.jobSkills(m).includes(k));
    cand.sort((a,b)=>slotScore(m,b,healer)-slotScore(m,a,healer));
    C.setSlots(m,cand.filter(k=>slotScore(m,k,healer)>0));
    if(!healer&&C.skillsOf(m).some(k=>C.SKILLS[k].kind==='heal'))healer=true;}
}

// ---------- 転職の選び方 ----------
function treeOf(job,acc=new Set()){acc.add(job);for(const r of C.JOBS[job].req||[])treeOf(r,acc);return acc;}
function bestMastered(m){
  let best=m.job;for(const j in m.mastered)if(C.JOBS[j].tier>C.JOBS[best].tier||(!m.mastered[best]))best=j;return best;
}
function chooseNextJob(m,target){
  const need=target?treeOf(target):new Set(Object.keys(C.JOBS));
  const open=Object.keys(C.JOBS).filter(j=>!m.mastered[j]&&C.jobUnlocked(m,j));
  let c=open.filter(j=>need.has(j));
  if(!c.length)c=open;
  if(!c.length)return null;
  c.sort((a,b)=>C.JOBS[b].tier-C.JOBS[a].tier);
  const top=C.JOBS[c[0]].tier;c=c.filter(j=>C.JOBS[j].tier===top);
  if(top===1){ // 相方を極めていれば上級職がすぐ開く基本職を先に
    const adv=[...need].filter(j=>C.JOBS[j].tier===2);
    const score=j=>adv.filter(a=>C.JOBS[a].req.includes(j)&&C.JOBS[a].req.every(r=>r===j||m.mastered[r])).length;
    c.sort((a,b)=>score(b)-score(a));
  }
  return c[0];
}

// ---------- 1回の戦闘 ----------
function fight(G,enemies,r){
  const B=C.newBattle(G,enemies);let t=0;
  while(!B.over&&t<80){C.battleTurn(B,G.party.map((m,i)=>m.hp>0?C.autoCmd(B,i):null),r);t++;}
  if(!B.over)B.over='lose';
  let rw=null;if(B.over==='win'||B.over==='fled')rw=C.giveRewards(G,B);
  G.battles++;
  return {over:B.over,turns:t,rw};
}
const hpRate=G=>{let a=0,b=0;for(const m of G.party){a+=Math.max(0,m.hp);b+=C.derived(m).maxhp;}return a/b;};
const mpRate=G=>{let a=0,b=0;for(const m of G.party){const d=C.derived(m);if(C.skillsOf(m).some(k=>C.SKILLS[k].kind==='heal')){a+=m.mp;b+=d.maxmp;}}return b?a/b:1;};
// 戦闘の外で道具を使う：HPが7割未満の仲間に薬草、回復役のMPが半分未満ならまほうのしずく
function useItemsOutside(G,to=.7){
  for(const m of G.party){if(m.hp<=0&&(G.inv.leaf||0)>0){G.inv.leaf--;m.hp=Math.ceil(C.derived(m).maxhp/2);}}
  for(const m of G.party){const d=C.derived(m);if(m.hp<=0)continue;
    for(const it of ['herb3','herb2','herb'])while(m.hp<d.maxhp*to&&(G.inv[it]||0)>0){G.inv[it]--;m.hp=Math.min(d.maxhp,m.hp+C.ITEMS[it].heal);}
    if(C.skillsOf(m).some(k=>C.SKILLS[k].kind==='heal'))while(m.mp<d.maxmp*.5&&(G.inv.water||0)>0){G.inv.water--;m.mp=Math.min(d.maxmp,m.mp+C.ITEMS.water.mp);}}
}
function healAll(G){for(const m of G.party){const d=C.derived(m);m.hp=d.maxhp;m.mp=d.maxmp;m.poison=false;}}

// ---------- 勝率表 ----------
// 編成・レベル・装備を決めて、満タンから1戦したときの勝率
function makeParty(jobs,lv,gear){
  const G=C.newGame();
  G.party=jobs.map((j,i)=>{
    const m=C.newMember('war','w'+i);
    // その職業にたどりつくまでに極めた職業のスキルを覚えている状態にする
    for(const pj of treeOf(j)){if(pj===j)continue;m.job=pj;m.lv=C.JOBS[pj].cap;m.mastered[pj]=true;C.learnUpTo(m);}
    m.job=j;m.lv=Math.min(lv,C.JOBS[j].cap);if(m.lv>=C.JOBS[j].cap)m.mastered[j]=true;C.learnUpTo(m);
    m.wl=C.bestLine(j);m.w=gear;m.a=gear;const d=C.derived(m);m.hp=d.maxhp;m.mp=d.maxmp;return m;});
  G.inv={herb2:3,leaf:1};chooseSlots(G);
  return G;
}
function matrix(jobs,levels,floors,n,seed){
  const r=C.rng(seed||1),rows=[];
  for(const f of floors){
    const gear=shopMax(1+Math.floor((f-1)/10));
    const row={f,cells:[]};
    for(const lv of levels){let win=0,turns=0,hp=0;
      for(let k=0;k<n;k++){const G=makeParty(jobs,lv,gear);const res=fight(G,f%5===0&&k%4===0?C.bossFor(f):C.rollGroup(f,r),r);if(res.over!=='lose'){win++;hp+=hpRate(G);}turns+=res.turns;}
      row.cells.push({lv,win:win/n,turns:turns/n,hp:win?hp/win:0});}
    rows.push(row);
  }
  return rows;
}
function bossCheck(jobs,lv,f,n,seed){
  const r=C.rng(seed||7);let win=0,turns=0;
  for(let k=0;k<n;k++){const G=makeParty(jobs,lv,shopMax(1+Math.floor((f-1)/10)));const res=fight(G,C.bossFor(f),r);if(res.over==='win')win++;turns+=res.turns;}
  return {win:win/n,turns:turns/n};
}

// ---------- 目標との比較 ----------
// 段階ごとの「適正な階」（仮の目標）
const STAGES=[
  {name:'基本職',jobs:['war','mag','pri'],lv:20,floor:20,next:['hwar','hym','ill']},
  {name:'上級職',jobs:['hwar','hym','ill'],lv:30,floor:40,next:['kAll','kMag','kNin']},
  {name:'超上級職',jobs:['kAll','kMag','kNin'],lv:40,floor:50,next:null},
];
const gearAt=f=>shopMax(1+Math.floor((f-1)/10));
// 1戦して、勝敗・ターン数・指定した仲間が倒れたかを返す（ボスは除く）
function fightTrack(G,enemies,r,watch){
  const B=C.newBattle(G,enemies);let t=0,down=false;
  while(!B.over&&t<80){const ev=C.battleTurn(B,G.party.map((m,i)=>m.hp>0?C.autoCmd(B,i):null),r);t++;
    if(watch!=null&&ev.some(e=>e.t==='die'&&e.side==='p'&&e.i===watch))down=true;}
  return {win:B.over==='win'||B.over==='fled',turns:t,down};
}
// 町に戻らずに k 連戦したときに、全滅せずに終えられる割合
function streak(jobs,lv,f,k,n,seed){const r=C.rng(seed);let ok=0,hp=0;
  for(let i=0;i<n;i++){const G=makeParty(jobs,lv,gearAt(f));G.inv={herb2:4,leaf:1};let alive=true;
    for(let j=0;j<k;j++){const o=fightTrack(G,C.rollGroup(f,r),r);if(!o.win){alive=false;break;}}
    if(alive){ok++;hp+=hpRate(G);}}
  return {f,ok:ok/n,hp:ok?hp/ok:0};}
function stageCheck(n){
  const out=[];
  for(const st of STAGES){
    const row={name:st.name,floor:st.floor};
    for(const [k,f] of [['at',st.floor],['deep',st.floor+10],['shallow',st.floor-10]]){
      if(f>50||f<1)continue;const r=C.rng(f*7+1);let win=0,turns=0;
      for(const x of ['p','e'])C.DMG_STATS[x]=[0,0];
      for(let i=0;i<n;i++){const G=makeParty(st.jobs,st.lv,gearAt(f));const o=fightTrack(G,C.rollGroup(f,r),r);if(o.win)win++;turns+=o.turns;}
      const ms=x=>C.DMG_STATS[x][1]?C.DMG_STATS[x][0]/C.DMG_STATS[x][1]:0;
      row[k]={f,win:win/n,turns:turns/n,minP:ms('p'),minE:ms('e')};}
    if(st.next){for(const [k,f] of [['fresh',st.floor],['freshShallow',st.floor-10]]){const r=C.rng(f*13+5);let win=0,down=0;
      for(let i=0;i<n;i++){const G=makeParty(st.jobs,st.lv,gearAt(f));const nm=makeParty([st.next[2]],1,gearAt(f)).party[0];G.party[2]=nm;chooseSlots(G);
        const o=fightTrack(G,C.rollGroup(f,r),r,2);if(o.win)win++;if(o.down)down++;}
      row[k]={f,win:win/n,down:down/n};}}
    const b=bossCheck(st.jobs,st.lv,st.floor,n);row.boss=b;
    row.streakAt=streak(st.jobs,st.lv,st.floor,8,Math.ceil(n/3),st.floor*3+1);
    if(st.floor+10<=50)row.streakDeep=streak(st.jobs,st.lv,st.floor+10,8,Math.ceil(n/3),st.floor*3+2);
    out.push(row);
  }
  return out;
}
function stageMd(rows){
  let s=`| 段階 | 適正な階での雑魚戦 | 10階深いとき | 10階浅いとき | 8連戦（適正な階） | 8連戦（10階深い） | 転職直後（適正な階） | 転職直後（10階浅い） | 適正な階のボス（満タンから） |\n|---|---|---|---|---|---|---|---|---|\n`;
  const sk=x=>x?`B${x.f} 生き残る${pct(x.ok)}・残りHP${pct(x.hp)}`:'—';
  const w=x=>x?`B${x.f} 勝率${pct(x.win)}・${x.turns.toFixed(1)}ターン・1ダメージ 受${pct(x.minP)}/与${pct(x.minE)}`:'—';
  const fr=x=>x?`B${x.f} 勝率${pct(x.win)}・倒れる${pct(x.down)}`:'—';
  for(const r of rows)s+=`| ${r.name} | ${w(r.at)} | ${w(r.deep)} | ${w(r.shallow)} | ${sk(r.streakAt)} | ${sk(r.streakDeep)} | ${fr(r.fresh)} | ${fr(r.freshShallow)} | B${r.floor} 勝率${pct(r.boss.win)}・${r.boss.turns.toFixed(1)}ターン |\n`;
  return s;
}

// ---------- 自動プレイ ----------
const TARGETS=['kAll','kMag','kNin'];
function campaign(opt){
  if(opt.startDeepest===undefined)opt.startDeepest=true; // 決定：行ったことのあるいちばん深い階から始められる
  if(opt.trainShallow===undefined)opt.trainShallow=true; // 育成中の仲間がいるときは10階浅いところで稼ぐ（実際の遊び方に近づける）
  const r=C.rng(opt.seed),G=C.newGame(),log=[],mile={};
  G.checkpoints=[0];let bossRetreat=0,t=0,startIdx=0,wipesHere=0,runs=0,wipes=0,goodRuns=0;
  const stats={battles:0,turns:0,wipes:0,byArea:{}};
  const note=(k,v)=>{if(!(k in mile))mile[k]=v??t;};
  const town=()=>{
    t+=TIME.town;
    const inn=Math.min(G.gold,10+G.reached*3);G.gold-=inn;healAll(G);
    if(G.flags.jobChange){G.party.forEach((m,i)=>{
      // 育成中（上限の半分未満）の仲間は同時に1匹まで。目標を極めたら、クリアまではそのまま
      const fresh=G.party.filter(x=>x!==m&&x.lv<C.JOBS[x.job].cap/2).length;
      const done=m.mastered[TARGETS[i]]&&!G.bossDown[50];
      if(m.lv<C.JOBS[m.job].cap)return;
      const before=m.job;let nj=null;
      if(done)nj=TARGETS[i];
      else if(!fresh)nj=chooseNextJob(m,TARGETS[i]);
      else nj=bestMastered(m); // 順番待ちのあいだは、極めた職業でいちばん強いもの（レベル上限のまま戻れる）
      if(nj&&nj!==m.job){C.changeJob(m,nj);log.push({t,ev:'job',who:i,from:before,to:nj});
        note(`first:${nj}`);note(`m${i}:${nj}`);}});}
    // 装備：職業に合う系統の武器→防具の順に、買えるいちばん強いもの
    const mx=shopMax(G.shopTier);
    for(const m of G.party){const l=C.bestLine(m.job);
      for(let i=mx;i>m.own[l];i--){if(G.gold-200>=C.WEAPON_PRICE[i]){G.gold-=C.WEAPON_PRICE[i];m.own[l]=i;break;}}
      m.wl=l;m.w=m.own[l];}
    for(const m of G.party)for(let i=mx;i>m.a;i--){if(G.gold-200>=C.ARMORS[i][2]){G.gold-=C.ARMORS[i][2];m.a=i;break;}}
    const herb=G.shopTier>=4?'herb3':G.shopTier>=2?'herb2':'herb';
    while((G.inv[herb]||0)<8&&G.gold>=C.ITEMS[herb].price*2){G.gold-=C.ITEMS[herb].price;G.inv[herb]=(G.inv[herb]||0)+1;}
    while((G.inv.water||0)<4&&G.gold>=C.ITEMS.water.price*3){G.gold-=C.ITEMS.water.price;G.inv.water=(G.inv.water||0)+1;}
    while((G.inv.leaf||0)<2&&G.gold>=C.ITEMS.leaf.price*2){G.gold-=C.ITEMS.leaf.price;G.inv.leaf=(G.inv.leaf||0)+1;}
    chooseSlots(G);
  };
  // 始められる階（の1つ上）。opt.startDeepest なら、行ったことのある階ならどこからでも
  const cps=()=>opt.startDeepest?Array.from({length:Math.max(1,G.reached)},(_,i)=>i):G.checkpoints.slice().sort((a,b)=>a-b);
  const stepBack=opt.startDeepest?5:1;
  town();
  while(t<opt.hours*3600){
    runs++;
    const list=cps();startIdx=Math.min(startIdx,list.length-1);
    let f=list[startIdx]+1,wiped=false,deepest=f;t+=5;
    // 育成中の仲間がいるときは、10階浅いところで稼ぐ
    if(opt.trainShallow&&G.party.some(m=>m.lv<C.JOBS[m.job].cap/2))f=Math.max(1,Math.min(f,G.reached-10));
    outer:
    while(f<=50){
      t+=TIME.floorWalk(f);G.reached=Math.max(G.reached,f);note(`reach${f}`);deepest=f;
      for(let k=0;k<battlesPerFloor(f,G.flags.dig);k++){
        const res=fight(G,C.rollGroup(f,r),r);stats.battles++;stats.turns+=res.turns;t+=TIME.battleBase+TIME.perTurn*res.turns;
        if(res.over==='lose'){wiped=true;break outer;}
        if(hpRate(G)<.55)useItemsOutside(G,.6); // 戦闘のあいだにも薬草を使う
        if(hpRate(G)<.4||(mpRate(G)<.2&&hpRate(G)<.7)||G.party.some(m=>m.hp<=0))break outer;
      }
      const boss=C.bossFor(f);
      if(boss&&!G.bossDown[f]){
        if(opt.bossRest)healAll(G); // 比較用：ボスの階の入り口に回復ポイントがある場合
        useItemsOutside(G);
        // 準備してから挑む。ただし2回続けて引き返したら、弱っていても挑む（道中で消耗して永遠に挑めない、を防ぐ）
        if((hpRate(G)<.75||mpRate(G)<.5)&&bossRetreat<2){bossRetreat++;break;}
        bossRetreat=0;
        const res=fight(G,boss,r);stats.battles++;stats.turns+=res.turns;t+=TIME.battleBase+TIME.perTurn*res.turns;
        if(res.over!=='win'){wiped=true;note(`bossFail${f}`);log.push({t,ev:'bossfail',f});break;}
        G.bossDown[f]=true;G.checkpoints.push(f);note(`boss${f}`);log.push({t,ev:'boss',f,lv:G.party.map(m=>m.job+m.lv)});
        if(f%10===0)G.shopTier++;
        if(f===5)G.flags.dig=true;
        if(f===10)G.flags.jobChange=true;
        if(f===50){note('clear');}
        break;
      }
      f++;
    }
    if(opt.trace)opt.trace.push({t,start:list[startIdx],deepest,wiped,hp:+hpRate(G).toFixed(2),gold:G.gold,gear:G.party.map(m=>m.w+'/'+m.a).join(' ')});
    if(wiped){wipes++;stats.wipes++;const a=Math.floor((deepest-1)/10);stats.byArea[a]=(stats.byArea[a]||0)+1;wipesHere++;goodRuns=0;
      if(wipesHere>=2){startIdx=Math.max(0,startIdx-stepBack);wipesHere=0;}}
    else{goodRuns++;wipesHere=0;if(goodRuns>=2&&startIdx<cps().length-1){startIdx=opt.startDeepest?cps().length-1:startIdx+1;goodRuns=0;}}
    town();
    if(opt.stopWhen&&opt.stopWhen(G,mile))break;
  }
  return {t,G,log,mile,stats,runs,wipes};
}

// ---------- 表示 ----------
const pct=x=>Math.round(x*100)+'%';
const hm=s=>s==null?'—':`${Math.floor(s/3600)}時間${String(Math.round(s%3600/60)).padStart(2,'0')}分`;
function median(a){a=a.filter(x=>x!=null).sort((x,y)=>x-y);if(!a.length)return null;return a[Math.floor(a.length/2)];}
function matrixMd(title,rows){
  let s=`#### ${title}\n\n勝率（かっこ内は勝ったときの残りHP）\n\n| 階 | `+rows[0].cells.map(c=>'Lv'+c.lv).join(' | ')+' |\n|---|'+rows[0].cells.map(()=>'---').join('|')+'|\n';
  for(const r of rows)s+=`| B${r.f} | `+r.cells.map(c=>`${pct(c.win)} (${pct(c.hp)})`).join(' | ')+' |\n';
  return s+'\n';
}

function main(){
  const args=process.argv.slice(2);
  const val=(k,d)=>{const i=args.indexOf(k);return i>=0?+args[i+1]:d;};
  const mode=args.find(a=>!a.startsWith('--')&&isNaN(+a))||'all';
  const hours=val('--hours',60),seeds=val('--seeds',5),n=val('--n',120);
  let md=`# シミュレーション結果\n\n\`node sim.js\` で作った結果。数字はすべて仮の設定（core.js の CONFIG、sim.js の TIME）にもとづく。時間は「おまかせで遊んだときのめやす」。\n\n`;
  if(mode==='check'){process.stdout.write(stageMd(stageCheck(n))+'\n');return;}
  if(mode==='all'){
    md+=`## 0. 目標との比較\n\n仮の目標：適正な階で雑魚戦は約2ターン・勝率95%以上／10階深いと勝率がはっきり下がる／転職直後は、転職したての仲間が3割以上の戦闘で倒れる（パーティは8割以上勝つ）。適正な階は 基本職Lv20=B20、上級職Lv30=B40、超上級職Lv40=B50。各${n}戦。\n\n`+stageMd(stageCheck(n))+'\n';
  }
  if(mode==='all'||mode==='matrix'){
    md+=`## 1. 階ごとの勝率\n\n満タンの状態から1戦したときの勝率（各${n}戦）。装備はその階に着いたときに店で買えるいちばん強いもの。5の倍数の階は4戦に1戦がボス。\n\n`;
    md+=matrixMd('基本職（戦士・魔法使い・僧侶）',matrix(['war','mag','pri'],[1,5,10,15,20],[1,3,5,8,10,13,15,18,20,25,30],n,1));
    md+=matrixMd('基本職（空手家・毒使い・歌い手）',matrix(['kar','poi','sin'],[1,5,10,15,20],[1,3,5,8,10,13,15,18,20,25,30],n,2));
    md+=matrixMd('上級職（上級戦士・聖歌士・幻術師）',matrix(['hwar','hym','ill'],[1,10,20,30],[10,15,20,25,30,35,40,45,50],n,3));
    md+=matrixMd('超上級職（万能王・魔道王・忍者王）',matrix(['kAll','kMag','kNin'],[1,10,20,30,40],[20,30,40,45,50],n,4));
    md+='\n';
  }
  if(mode==='all'||mode==='campaign'){
    md+=`## 2. 自動プレイ\n\n「おまかせ」で戦い、弱ったら町に戻り、行ったことのあるいちばん深い階から始め、全滅が2回続いたら5階浅いところから育て直す、戦闘のあいだやボスの前に薬草を使う、B5で「掘る」が使えるようになったら近道で1階あたりの戦闘が1回へる、という仮のルールで${hours}時間ぶん遊ばせた結果（${seeds}回の中央値）。B50のボスを倒した時点で止める（「そのほか」の数字はクリアまで）。目標の超上級職は 1匹目=万能王、2匹目=魔道王、3匹目=忍者王。\n\n`;
    const clear=G=>G.bossDown[50];
    const res=[];for(let s=1;s<=seeds;s++)res.push(campaign({seed:s*101,hours,stopWhen:clear}));
    const keys=[];for(const f of [5,10,15,20,25,30,35,40,45,50])keys.push([`B${f}のボスを倒す`,`boss${f}`]);
    md+=`### ボスを倒した時間\n\n| 出来事 | 時間（中央値） | 届いた回数 |\n|---|---|---|\n`;
    for(const [l,k] of keys){const v=res.map(x=>x.mile[k]);md+=`| ${l} | ${hm(median(v))} | ${v.filter(x=>x!=null).length}/${seeds} |\n`;}
    md+=`\n### 職業にはじめて就いた時間（3匹のうちだれか）\n\n| 職業 | 時間（中央値） | 届いた回数 |\n|---|---|---|\n`;
    for(const j of Object.keys(C.JOBS).filter(j=>C.JOBS[j].tier>1)){const v=res.map(x=>x.mile['first:'+j]);if(v.every(x=>x==null))continue;md+=`| ${C.JOBS[j].name} | ${hm(median(v))} | ${v.filter(x=>x!=null).length}/${seeds} |\n`;}
    md+=`\n### そのほか\n\n| 項目 | 中央値 |\n|---|---|\n`;
    md+=`| 戦闘の回数 | ${median(res.map(x=>x.stats.battles))} |\n| 1戦の平均ターン | ${median(res.map(x=>x.stats.turns/x.stats.battles)).toFixed(1)} |\n| 全滅した回数 | ${median(res.map(x=>x.wipes))} |\n| いちばん深く行った階 | B${median(res.map(x=>x.G.reached))} |\n`;
    md+=`\n### 比較：中継地点（5階ごと）からしか始められない場合\n\n設計では、行ったことのあるいちばん深い階から始められる（決定）。参考として、前の案とくらべる。\n\n| 出来事 | 最深階から | 中継地点から |\n|---|---|---|\n`;
    const res2=[];for(let s=1;s<=seeds;s++)res2.push(campaign({seed:s*101,hours,startDeepest:false,stopWhen:clear}));
    for(const f of [20,30,35,40,45,50]){const a=res.map(x=>x.mile['boss'+f]),b=res2.map(x=>x.mile['boss'+f]);
      md+=`| B${f}のボスを倒す | ${hm(median(a))}（${a.filter(x=>x!=null).length}/${seeds}） | ${hm(median(b))}（${b.filter(x=>x!=null).length}/${seeds}） |\n`;}
    md+=`| 戦闘の回数 | ${median(res.map(x=>x.stats.battles))} | ${median(res2.map(x=>x.stats.battles))} |\n| 全滅した回数 | ${median(res.map(x=>x.wipes))} | ${median(res2.map(x=>x.wipes))} |\n`;
    const last=res[0];
    md+=`\n### 1回目の自動プレイの最後の状態\n\n| 仲間 | 職業 | Lv | 極めた職業 |\n|---|---|---|---|\n`;
    for(const m of last.G.party)md+=`| ${m.name} | ${C.JOBS[m.job].name} | ${m.lv} | ${Object.keys(m.mastered).map(j=>C.JOBS[j].name).join('・')||'—'} |\n`;
    md+='\n';
  }
  const out=path.join(__dirname,'report.md');
  fs.writeFileSync(out,md);
  process.stdout.write(md);
}
if(require.main===module)main();
module.exports={stageCheck,stageMd,fightTrack,campaign,matrix,makeParty,fight,chooseSlots,chooseNextJob,bossCheck,TIME};
