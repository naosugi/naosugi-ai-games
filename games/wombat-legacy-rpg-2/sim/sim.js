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
const battlesPerFloor=f=>3+Math.floor(f/10);
const shopMax=tier=>Math.min(C.WEAPONS.length-1,tier*2-1); // 店の段階 → 買える装備の番号の上限

// ---------- 引き継ぎ枠の選び方（おまかせ用の仮ルール） ----------
const SLOT_SCORE={
  hpup1:10,defup1:8,spdup1:6,mpup1:4,magup1:0,awaken:0,ironbutt:9,ironfist:0,
  heal:0,healall:0,revive:0,cure:3,autorev:14,healup:0,
  kiai:0,counter:8,dodge:6,finish:0,seiken:2,rush:3,
  thunder:1,ice:2,fire:3,bolt:3,boom:5,sleep:3,light:2,
  venom:6,weaken:5,mist:4,crack:6,stun:5,fang:5,strongp:3,plague:8,
  sAtk:6,sDef:6,sSpd:3,sHeal:3,sSleep:3,longv:3,sAll:9,echo:6,
  guard:2,dig:2,roll:3,quake:4,
};
function slotScore(m,k,partyHasHeal){
  const S=C.SKILLS[k],J=C.JOBS[m.job];let s=SLOT_SCORE[k]||0;
  const magJob=J.mult.mag>=1,physJob=J.mult.atk>=1;
  if(['magup1','awaken'].includes(k))s=magJob?10:1;
  if(S.kind==='mag')s*=magJob?2.2:.4;
  if(['kiai','finish','ironfist'].includes(k))s=physJob?(k==='finish'?(m.learned.kiai?8:0):9):1;
  if(S.kind==='phys')s*=physJob?1.6:.4;
  if(['heal','healall','revive','healup'].includes(k))s=partyHasHeal?({heal:3,healall:5,revive:7,healup:1}[k]):({heal:12,healall:15,revive:14,healup:4}[k]);
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
    m.w=gear;m.a=gear;const d=C.derived(m);m.hp=d.maxhp;m.mp=d.maxmp;return m;});
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

// ---------- 自動プレイ ----------
const TARGETS=['kAll','kMag','kNin'];
function campaign(opt){
  const r=C.rng(opt.seed),G=C.newGame(),log=[],mile={};
  G.checkpoints=[0];let bossRetreat=0,t=0,startIdx=0,wipesHere=0,runs=0,wipes=0,goodRuns=0;
  const stats={battles:0,turns:0,wipes:0,byArea:{}};
  const note=(k,v)=>{if(!(k in mile))mile[k]=v??t;};
  const town=()=>{
    t+=TIME.town;
    const inn=Math.min(G.gold,10+G.reached*3);G.gold-=inn;healAll(G);
    const mx=shopMax(G.shopTier);
    // 装備：武器→防具の順に、買えるいちばん強いもの（安い順に全員）
    for(const kind of ['w','a'])for(const m of G.party){const list=kind==='w'?C.WEAPONS:C.ARMORS;
      for(let i=mx;i>m[kind];i--){if(G.gold-200>=list[i][2]){G.gold-=list[i][2];m[kind]=i;break;}}}
    const herb=G.shopTier>=4?'herb3':G.shopTier>=2?'herb2':'herb';
    while((G.inv[herb]||0)<6&&G.gold>=C.ITEMS[herb].price*2){G.gold-=C.ITEMS[herb].price;G.inv[herb]=(G.inv[herb]||0)+1;}
    while((G.inv.leaf||0)<2&&G.gold>=C.ITEMS.leaf.price*2){G.gold-=C.ITEMS.leaf.price;G.inv.leaf=(G.inv.leaf||0)+1;}
    if(G.flags.jobChange){G.party.forEach((m,i)=>{
      // 育成中（上限の半分未満）の仲間は同時に1匹まで。目標を極めたら、クリアまではそのまま
      const fresh=G.party.filter(x=>x!==m&&x.lv<C.JOBS[x.job].cap/2).length;
      const done=m.mastered[TARGETS[i]]&&!G.bossDown[50];
      if(m.lv>=C.JOBS[m.job].cap&&!fresh&&!done){const before=m.job;const nj=chooseNextJob(m,TARGETS[i]);
        if(nj&&nj!==m.job){C.changeJob(m,nj);log.push({t,ev:'job',who:i,from:before,to:nj});
          note(`first:${nj}`);note(`m${i}:${nj}`);}}});}
    chooseSlots(G);
  };
  const cps=()=>G.checkpoints.slice().sort((a,b)=>a-b);
  town();
  while(t<opt.hours*3600){
    runs++;
    const list=cps();startIdx=Math.min(startIdx,list.length-1);
    let f=list[startIdx]+1,wiped=false,deepest=f;t+=5;
    outer:
    while(f<=50){
      t+=TIME.floorWalk(f);G.reached=Math.max(G.reached,f);note(`reach${f}`);deepest=f;
      for(let k=0;k<battlesPerFloor(f);k++){
        const res=fight(G,C.rollGroup(f,r),r);stats.battles++;stats.turns+=res.turns;t+=TIME.battleBase+TIME.perTurn*res.turns;
        if(res.over==='lose'){wiped=true;break outer;}
        if(hpRate(G)<.4||(mpRate(G)<.2&&hpRate(G)<.7)||G.party.some(m=>m.hp<=0))break outer;
      }
      const boss=C.bossFor(f);
      if(boss&&!G.bossDown[f]){
        if(opt.bossRest)healAll(G); // 案：ボスの階の入り口に回復ポイント
        // 準備してから挑む。ただし2回続けて引き返したら、弱っていても挑む（道中で消耗して永遠に挑めない、を防ぐ）
        if((hpRate(G)<.75||mpRate(G)<.5)&&bossRetreat<2){bossRetreat++;break;}
        bossRetreat=0;
        const res=fight(G,boss,r);stats.battles++;stats.turns+=res.turns;t+=TIME.battleBase+TIME.perTurn*res.turns;
        if(res.over!=='win'){wiped=true;note(`bossFail${f}`);log.push({t,ev:'bossfail',f});break;}
        G.bossDown[f]=true;G.checkpoints.push(f);note(`boss${f}`);log.push({t,ev:'boss',f,lv:G.party.map(m=>m.job+m.lv)});
        if(f%10===0)G.shopTier++;
        if(f===10)G.flags.jobChange=true;
        if(f===50){note('clear');}
        break;
      }
      f++;
    }
    if(opt.trace)opt.trace.push({t,start:list[startIdx],deepest,wiped,hp:+hpRate(G).toFixed(2),gold:G.gold,gear:G.party.map(m=>m.w+'/'+m.a).join(' ')});
    if(wiped){wipes++;stats.wipes++;const a=Math.floor((deepest-1)/10);stats.byArea[a]=(stats.byArea[a]||0)+1;wipesHere++;goodRuns=0;
      if(wipesHere>=2){startIdx=Math.max(0,startIdx-1);wipesHere=0;}}
    else{goodRuns++;wipesHere=0;if(goodRuns>=2&&startIdx<cps().length-1){startIdx++;goodRuns=0;}}
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
  const hours=val('--hours',40),seeds=val('--seeds',5),n=val('--n',120);
  let md=`# シミュレーション結果\n\n\`node sim.js\` で作った結果。数字はすべて仮の設定（core.js の CONFIG、sim.js の TIME）にもとづく。時間は「おまかせで遊んだときのめやす」。\n\n`;
  if(mode==='all'||mode==='matrix'){
    md+=`## 1. 階ごとの勝率\n\n満タンの状態から1戦したときの勝率（各${n}戦）。装備はその階に着いたときに店で買えるいちばん強いもの。5の倍数の階は4戦に1戦がボス。\n\n`;
    md+=matrixMd('基本職（戦士・魔法使い・僧侶）',matrix(['war','mag','pri'],[1,5,10,15,20],[1,3,5,8,10,13,15,18,20,25,30],n,1));
    md+=matrixMd('基本職（空手家・毒使い・歌い手）',matrix(['kar','poi','sin'],[1,5,10,15,20],[1,3,5,8,10,13,15,18,20,25,30],n,2));
    md+=matrixMd('上級職（上級戦士・聖歌士・幻術師）',matrix(['hwar','hym','ill'],[1,10,20,30],[10,15,20,25,30,35,40,45,50],n,3));
    md+=matrixMd('超上級職（万能王・魔道王・忍者王）',matrix(['kAll','kMag','kNin'],[1,10,20,30,40],[20,30,40,45,50],n,4));
    md+=`#### 転職した直後\n\n2匹が基本職Lv20、1匹が転職したて（上級職Lv1）のときの勝率\n\n| 階 | 勝率 | 残りHP |\n|---|---|---|\n`;
    for(const f of [5,10,15,20,25]){const r=C.rng(9);let win=0,hp=0;
      for(let k=0;k<n;k++){const G=makeParty(['war','mag','pri'],20,shopMax(1+Math.floor((f-1)/10)));const nm=makeParty(['hym'],1,G.party[0].w).party[0];G.party[2]=nm;chooseSlots(G);
        const res=fight(G,C.rollGroup(f,r),r);if(res.over!=='lose'){win++;hp+=hpRate(G);}}
      md+=`| B${f} | ${pct(win/n)} | ${pct(win?hp/win:0)} |\n`;}
    md+='\n';
  }
  if(mode==='all'||mode==='campaign'){
    md+=`## 2. 自動プレイ\n\n「おまかせ」で戦い、弱ったら町に戻り、全滅が続いたら浅い階に戻って育てる、という仮のルールで${hours}時間ぶん遊ばせた結果（${seeds}回の中央値）。目標の超上級職は 1匹目=万能王、2匹目=魔道王、3匹目=忍者王。\n\n`;
    const res=[];for(let s=1;s<=seeds;s++)res.push(campaign({seed:s*101,hours}));
    const keys=[];for(const f of [5,10,15,20,25,30,35,40,45,50])keys.push([`B${f}のボスを倒す`,`boss${f}`]);
    md+=`### ボスを倒した時間\n\n| 出来事 | 時間（中央値） | 届いた回数 |\n|---|---|---|\n`;
    for(const [l,k] of keys){const v=res.map(x=>x.mile[k]);md+=`| ${l} | ${hm(median(v))} | ${v.filter(x=>x!=null).length}/${seeds} |\n`;}
    md+=`\n### 職業にはじめて就いた時間（3匹のうちだれか）\n\n| 職業 | 時間（中央値） | 届いた回数 |\n|---|---|---|\n`;
    for(const j of Object.keys(C.JOBS).filter(j=>C.JOBS[j].tier>1)){const v=res.map(x=>x.mile['first:'+j]);if(v.every(x=>x==null))continue;md+=`| ${C.JOBS[j].name} | ${hm(median(v))} | ${v.filter(x=>x!=null).length}/${seeds} |\n`;}
    md+=`\n### そのほか\n\n| 項目 | 中央値 |\n|---|---|\n`;
    md+=`| 戦闘の回数 | ${median(res.map(x=>x.stats.battles))} |\n| 1戦の平均ターン | ${median(res.map(x=>x.stats.turns/x.stats.battles)).toFixed(1)} |\n| 全滅した回数 | ${median(res.map(x=>x.wipes))} |\n| いちばん深く行った階 | B${median(res.map(x=>x.G.reached))} |\n`;
    md+=`\n### 比較：ボスの階の入り口に回復ポイントがある場合\n\n回復ポイントがないと、中継地点からボスまでの5階を歩くあいだに消耗し、弱った状態で大ボスに挑んで全滅しやすい。\n\n| 出来事 | 回復なし | 回復あり |\n|---|---|---|\n`;
    const res2=[];for(let s=1;s<=seeds;s++)res2.push(campaign({seed:s*101,hours,bossRest:true}));
    for(const f of [20,30,35,40,45,50]){const a=res.map(x=>x.mile['boss'+f]),b=res2.map(x=>x.mile['boss'+f]);
      md+=`| B${f}のボスを倒す | ${hm(median(a))}（${a.filter(x=>x!=null).length}/${seeds}） | ${hm(median(b))}（${b.filter(x=>x!=null).length}/${seeds}） |\n`;}
    md+=`| 全滅した回数 | ${median(res.map(x=>x.wipes))} | ${median(res2.map(x=>x.wipes))} |\n`;
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
module.exports={campaign,matrix,makeParty,fight,chooseSlots,chooseNextJob,bossCheck,TIME};
