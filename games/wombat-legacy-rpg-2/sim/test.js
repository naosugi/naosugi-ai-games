// node --test test.js
'use strict';
const test=require('node:test');
const assert=require('node:assert');
const C=require('./core.js');
const S=require('./sim.js');

function master(m,job){m.job=job;m.lv=C.JOBS[job].cap;m.mastered[job]=true;C.learnUpTo(m);}
function runBattle(G,enemies,r,cmdFn){const B=C.newBattle(G,enemies);let t=0;while(!B.over&&t<80){C.battleTurn(B,G.party.map((m,i)=>m.hp>0?(cmdFn?cmdFn(B,i):C.autoCmd(B,i)):null),r);t++;}return B;}

test('上級職は9種、どの基本職もちょうど3つに関わる',()=>{
  const adv=Object.keys(C.JOBS).filter(j=>C.JOBS[j].tier===2);
  assert.strictEqual(adv.length,9);
  for(const b of C.BASIC_JOBS)assert.strictEqual(adv.filter(a=>C.JOBS[a].req.includes(b)).length,3,b);
});
test('超上級職は6種、条件は上級職4つ、どの2つも共通する条件は2つまで',()=>{
  const sup=Object.keys(C.JOBS).filter(j=>C.JOBS[j].tier===3);
  assert.strictEqual(sup.length,6);
  for(const s of sup){assert.strictEqual(C.JOBS[s].req.length,4);for(const r of C.JOBS[s].req)assert.strictEqual(C.JOBS[r].tier,2);}
  for(let i=0;i<sup.length;i++)for(let j=i+1;j<sup.length;j++){const a=C.JOBS[sup[i]].req,b=C.JOBS[sup[j]].req;assert.ok(a.filter(x=>b.includes(x)).length<=2,sup[i]+sup[j]);}
});
test('レベル上限は 基本20・上級30・超上級40',()=>{
  for(const j in C.JOBS)assert.strictEqual(C.JOBS[j].cap,{1:20,2:30,3:40}[C.JOBS[j].tier]);
});
test('解放条件は1匹ずつ数える',()=>{
  const a=C.newMember('war','a'),b=C.newMember('kar','b');
  assert.ok(!C.jobUnlocked(a,'hwar'));
  master(a,'war');assert.ok(!C.jobUnlocked(a,'hwar'));
  master(b,'kar');master(b,'war');
  assert.ok(C.jobUnlocked(b,'hwar'));
  assert.ok(!C.jobUnlocked(a,'hwar'),'ほかの仲間が極めた職業は数えない');
});
test('転職するとレベル1、ステータスは引き継がない',()=>{
  const m=C.newMember('war','a');master(m,'war');master(m,'kar');
  const before=C.derived(m).maxhp;
  assert.ok(C.changeJob(m,'hwar'));
  assert.strictEqual(m.lv,1);
  assert.ok(C.derived(m).maxhp<before);
  assert.ok(!C.changeJob(m,'kNin'),'解放されていない職業には就けない');
});
test('レベル上限で強いスキルが手に入り、極めた扱いになる',()=>{
  const m=C.newMember('pri','a');
  for(let i=0;i<200&&m.lv<20;i++)C.gainExp(m,100000);
  assert.strictEqual(m.lv,20);
  assert.ok(m.mastered.pri);
  assert.ok(m.learned.autorev);
});
test('職業ごとに必要経験値がちがう',()=>{
  assert.notStrictEqual(C.expNext('war',5),C.expNext('mag',5));
  assert.ok(C.expNext('hwar',5)>C.expNext('war',5));
  assert.ok(C.expNext('kAll',5)>C.expNext('hwar',5));
});
test('引き継ぎ枠はパッシブととくぎを合わせて6個まで。今の職業のスキルは枠を使わない',()=>{
  const m=C.newMember('war','a');master(m,'war');master(m,'mag');master(m,'pri');C.changeJob(m,'kar');
  const cand=C.slotCandidates(m);
  assert.ok(cand.length>6);
  assert.ok(cand.every(k=>C.SKILLS[k].job!=='kar'));
  const got=C.setSlots(m,cand);
  assert.strictEqual(got.length,6);
  assert.strictEqual(C.setSlots(m,['seiken','heal']).length,1,'今の職業のスキルは入れられない');
  // 今の職業のスキルはレベルで増える（枠とは別）
  assert.ok(C.skillsOf(m).includes('kiai'));
});
test('倒れた仲間には経験値が入らない',()=>{
  const G=C.newGame();G.party[1].hp=0;
  const e=C.mkEnemy(1,'normal');e.hp=0;
  const B=C.newBattle(G,[e]);B.over='win';
  C.giveRewards(G,B);
  assert.ok(G.party[0].totalExp>0);
  assert.strictEqual(G.party[1].totalExp,0);
});
test('毒はスリップダメージに加えて、ぼうぎょが下がる',()=>{
  const G=C.newGame();const m=G.party[0];
  // 同じ乱数で、毒のときとそうでないときに受けるダメージをくらべる
  const hits=p=>{let s=0;for(let k=0;k<400;k++){m.poison=p;m.hp=9999;const e=C.mkEnemy(30,'normal');const BB=C.newBattle(G,[e]);
    C.battleTurn(BB,[{k:'defend'},null,null],C.rng(k));s+=9999-m.hp;}return s;};
  assert.ok(hits(true)>hits(false));
});
test('ボスには状態異常がかかりにくく、かけるたびにさらにかかりにくくなる',()=>{
  const m=C.newMember('poi','a');const S=C.SKILLS.venom;
  const n=C.mkEnemy(10,'normal'),b=C.mkEnemy(10,'normal',{boss:'mid'});
  const B={};
  const cn=C.statusChance(B,m,S,n),cb=C.statusChance(B,m,S,b);
  assert.ok(cb<cn&&cb>0,'ボスにもまったく効かないわけではない');
  b.res.poison=1;assert.ok(C.statusChance(B,m,S,b)<cb);
});
test('きあいは攻撃でたまり、歌のバフと同時にかかる',()=>{
  const G=C.newGame();G.party=[C.newMember('kar','k'),C.newMember('sin','s')];
  const e=C.mkEnemy(1,'tank');e.hp=e.max=99999;
  const B=C.newBattle(G,[e]);const r=C.rng(5);
  C.battleTurn(B,[{k:'attack',t:0},{k:'skill',s:'sAtk'}],r);
  assert.strictEqual(G.party[0].kiai,1);
  assert.ok(B.buff.atk&&B.buff.atk.turns>0);
  C.battleTurn(B,[{k:'attack',t:0},{k:'defend'}],r);
  assert.strictEqual(G.party[0].kiai,2,'歌を歌っても、きあいは消えない');
});
test('カウンターは物理攻撃を受けたときに確率で発動する',()=>{
  let counters=0;
  for(let k=0;k<200;k++){const G=C.newGame();const m=C.newMember('kar','k');for(let i=0;i<10&&m.lv<6;i++)C.gainExp(m,5000);G.party=[m];m.hp=9999;
    const e=C.mkEnemy(5,'normal');e.hp=e.max=99999;const B=C.newBattle(G,[e]);const ev=C.battleTurn(B,[{k:'defend'}],C.rng(k));
    if(ev.some(x=>x.text&&x.text.includes('カウンター')))counters++;}
  assert.ok(counters>20&&counters<120,String(counters));
});
test('同じ種（seed）なら同じ結果になる',()=>{
  const a=S.campaign({seed:7,hours:1}),b=S.campaign({seed:7,hours:1});
  assert.deepStrictEqual(a.mile,b.mile);
  assert.strictEqual(a.stats.battles,b.stats.battles);
});
test('おまかせは、どの職業でもエラーなく最後まで戦える',()=>{
  const r=C.rng(11);
  for(const j of Object.keys(C.JOBS)){const G=S.makeParty([j,j,j],10,3);const B=runBattle(G,C.rollGroup(20,r),r);assert.ok(B.over,j);}
});

test('極めた職業に戻ると、レベル上限のまま',()=>{
  const m=C.newMember('war','a');master(m,'war');C.changeJob(m,'kar');
  assert.strictEqual(m.lv,1);
  C.changeJob(m,'war');assert.strictEqual(m.lv,20);
});
test('武器は3系統で、どの職業でも装備できる',()=>{
  assert.deepStrictEqual(Object.keys(C.WEAPON_LINES).sort(),['claw','flute','staff']);
  const m=C.newMember('mag','a');m.w=5;
  m.wl='claw';const a=C.derived(m);m.wl='staff';const b=C.derived(m);
  assert.ok(a.atk>b.atk&&b.mag>a.mag);
  assert.strictEqual(C.bestLine('war'),'claw');assert.strictEqual(C.bestLine('mag'),'staff');
});
test('物理ダメージは、ぼうぎょがとても高くても0にならない',()=>{
  const G=C.newGame();const m=C.newMember('war','w');m.a=10;m.hp=99999;G.party=[m];
  const e=C.mkEnemy(1,'normal');e.atk=1;const B=C.newBattle(G,[e]);
  C.battleTurn(B,[{k:'defend'}],C.rng(1));
  assert.ok(m.hp<99999);
});
test('はね返す敵には、魔法のダメージの半分が返ってくる',()=>{
  const G=C.newGame();const m=C.newMember('mag','m');m.hp=m.mp=999;G.party=[m];
  const e=C.mkEnemy(10,'mirror');const B=C.newBattle(G,[e]);const hp0=e.hp;
  C.battleTurn(B,[{k:'skill',s:'thunder',t:0}],C.rng(2));
  assert.strictEqual(e.hp,hp0);assert.ok(m.hp<999);
});
test('「いやなおと」で歌のバフときあいが消える',()=>{
  const G=C.newGame();G.party=[C.newMember('kar','k')];G.party[0].hp=9999;
  const e=C.mkEnemy(15,'jammer');e.moves=[{n:'いやなおと',k:'dispel',w:1}];e.hp=e.max=99999;
  const B=C.newBattle(G,[e]);B.buff.atk={turns:3,pow:0};G.party[0].kiai=2;
  C.battleTurn(B,[{k:'defend'}],C.rng(3));
  assert.deepStrictEqual(B.buff,{});assert.strictEqual(G.party[0].kiai,0);
});
test('ねむっている仲間は行動できず、ダメージで起きることがある。戦闘が終われば治る',()=>{
  const G=C.newGame();const m=G.party[0];
  const e=C.mkEnemy(1,'normal');e.hp=e.max=99999;e.st.sleep=9; // 敵は動かない（起こされないように）
  const B=C.newBattle(G,[e]);m.bst.sleep=2;
  const ev=C.battleTurn(B,[{k:'attack',t:0},null,null],C.rng(4));
  assert.ok(ev.some(x=>x.text&&x.text.includes('ねむっている')));
  assert.strictEqual(e.hp,99999);
  C.newBattle(G,[C.mkEnemy(1,'normal')]);assert.deepStrictEqual(m.bst,{});
});
test('ねらいうちは、いちばんHPが少ない仲間を狙う',()=>{
  const G=C.newGame();G.party.forEach(m=>m.hp=500);G.party[2].hp=50;
  const e=C.mkEnemy(5,'sniper');e.moves=[{n:'ねらいうち',k:'snipe',pow:1,w:1}];e.hp=e.max=99999;
  const B=C.newBattle(G,[e]);const ev=C.battleTurn(B,[{k:'defend'},{k:'defend'},{k:'defend'}],C.rng(5));
  const hit=ev.find(x=>x.t==='hit'&&x.side==='p');assert.strictEqual(hit.i,2);
});
