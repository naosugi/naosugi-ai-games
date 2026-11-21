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

test('スキルは 基本職6・上級職6・超上級職5（上限スキルは1つずつ）',()=>{
  for(const j in C.JOBS){const L=Object.values(C.SKILLS).filter(S=>S.job===j);
    assert.strictEqual(L.length,C.JOBS[j].tier===3?5:6,j);assert.strictEqual(L.filter(S=>S.master).length,1,j);}
});
test('強いスキルは上の段階：かっさいの歌はアイドル王、ドカーンは呪術師、自動で起きるパッシブは魔道王',()=>{
  assert.strictEqual(C.SKILLS.sAll.job,'kIdl');
  assert.strictEqual(C.SKILLS.boom.job,'cur');
  assert.strictEqual(C.SKILLS.eternal.job,'kMag');assert.ok(C.SKILLS.eternal.eff.autoRevive);
  for(const k in C.SKILLS){const S=C.SKILLS[k];if(C.JOBS[S.job].tier===1&&S.kind==='mag')assert.ok(S.el,k+' 基本職に無属性魔法');}
});
test('ふっかつのいのりは、えらんだ仲間が倒れたとき1度だけHP半分で起きる',()=>{
  const G=C.newGame();const pri=C.newMember('pri','p');for(let i=0;i<50&&!pri.mastered.pri;i++)C.gainExp(pri,100000);
  pri.hp=99999;const t=C.newMember('mag','m');G.party=[pri,t];
  const e=C.mkEnemy(30,'normal');e.hp=e.max=99999;e.atk=99999;e.moves=[{n:'ねらいうち',k:'snipe',w:1}];
  const B=C.newBattle(G,[e]);
  e.st.sleep=1; // 1ターン目は敵がねむっている
  C.battleTurn(B,[{k:'skill',s:'autorev',t:1},{k:'defend'}],C.rng(1));
  assert.strictEqual(B.marks[1],1);
  C.battleTurn(B,[{k:'defend'},{k:'defend'}],C.rng(2)); // いちばんHPが少ない t がねらわれて倒れ、起きる
  assert.strictEqual(t.hp,Math.ceil(C.derived(t).maxhp/2));
  assert.strictEqual(B.marks[1],undefined);
  t.hp=1;C.battleTurn(B,[{k:'defend'},{k:'defend'}],C.rng(3)); // 2回目は起きない
  assert.strictEqual(t.hp,0);
});
test('ぼうぎょは職業で変わらず、HPで差がつく',()=>{
  const a=C.newMember('war','a'),b=C.newMember('mag','b');a.lv=b.lv=10;
  assert.strictEqual(C.derived(a).def,C.derived(b).def);
  assert.ok(C.derived(a).maxhp>C.derived(b).maxhp*1.8);
});
test('物理ダメージは前作の式（こうげき − ぼうぎょ÷2）。足りなければ1〜2',()=>{
  const G=C.newGame();const m=C.newMember('war','w');m.hp=99999;m.a=10;G.party=[m];
  const e=C.mkEnemy(1,'normal');e.atk=10;e.hp=e.max=99999;
  let max=0;for(let k=0;k<30;k++){const hp=m.hp;const B=C.newBattle(G,[e]);C.battleTurn(B,[{k:'defend'}],C.rng(k));max=Math.max(max,hp-m.hp);}
  assert.ok(max<=3,String(max));
});
test('上級職でも きあいを使える：魔拳士は きあいで魔法が強くなり、上級戦士は きあいを使って全体攻撃',()=>{
  assert.ok(C.SKILLS.kiaiMag.job==='mfi'&&C.SKILLS.kiaiMag.eff.kiaiMag>0);
  assert.ok(C.SKILLS.fumikomi.job==='hwar'&&C.SKILLS.fumikomi.kiaiCost===1);
  const G=C.newGame();const m=C.newMember('war','w');m.job='hwar';m.lv=12;m.learned.kiai=1;C.learnUpTo(m);m.slots=['kiai'];m.hp=9999;m.mp=99;G.party=[m];
  const e=C.mkEnemy(5,'normal');e.hp=e.max=99999;const B=C.newBattle(G,[e,C.mkEnemy(5,'normal')]);
  const ev=C.battleTurn(B,[{k:'skill',s:'fumikomi'}],C.rng(4));
  assert.ok(ev.some(x=>x.text&&x.text.includes('きあいが たりない')));
  m.kiai=2;C.battleTurn(B,[{k:'skill',s:'fumikomi'}],C.rng(5));assert.ok(m.kiai<=2);
});

test('敵の魔法は、ぼうぎょに関係なくダメージを与える',()=>{
  const hit=a=>{const G=C.newGame();const m=C.newMember('war','w');m.hp=99999;m.a=a;G.party=[m];
    const e=C.mkEnemy(20,'kMage');e.moves=[{n:'ほのおのまほう',k:'magic',pow:1,w:1}];e.hp=e.max=99999;
    const B=C.newBattle(G,[e]);C.battleTurn(B,[{k:'attack',t:0}],C.rng(7));return 99999-m.hp;};
  const a=hit(0),b=hit(10);assert.ok(a>0&&Math.abs(a-b)<=Math.ceil(a*.25),a+' '+b);
});
test('ふういんされると、MPを使うとくぎが使えない。きよめで治る',()=>{
  const G=C.newGame();const mg=G.party[1];mg.bst={};
  const e=C.mkEnemy(1,'normal');e.hp=e.max=99999;e.st.sleep=9;
  const B=C.newBattle(G,[e]);mg.bst.silence=2;
  const ev=C.battleTurn(B,[{k:'defend'},{k:'skill',s:'thunder',t:0},{k:'defend'}],C.rng(8));
  assert.ok(ev.some(x=>x.text&&x.text.includes('ふういんされていて')));
  assert.strictEqual(C.autoCmd(B,1).k==='skill'&&(C.SKILLS[C.autoCmd(B,1).s].mp||0)>0,false,'おまかせは ふういん中にMPのとくぎを選ばない');
});
test('「いかく」で仲間全員のぼうぎょが下がる',()=>{
  const G=C.newGame();const e=C.mkEnemy(10,'frill');e.moves=[{n:'いかく',k:'debuffAll',st:'def',w:1}];e.hp=e.max=99999;
  const B=C.newBattle(G,[e]);C.battleTurn(B,[{k:'defend'},{k:'defend'},{k:'defend'}],C.rng(9));
  assert.ok(B.pdebuff.def>0);
});
test('そうりょコアラは倒れた仲間を1度だけよみがえらせる',()=>{
  const G=C.newGame();G.party.forEach(m=>m.hp=9999);
  const p=C.mkEnemy(15,'kPriest');p.moves=[{n:'よみがえらせる',k:'reviveAlly',w:1}];p.hp=p.max=99999;
  const o=C.mkEnemy(15,'normal');o.hp=0;
  const B=C.newBattle(G,[p,o]);C.battleTurn(B,[{k:'defend'},{k:'defend'},{k:'defend'}],C.rng(10));
  assert.ok(o.hp>0);o.hp=0;C.battleTurn(B,[{k:'defend'},{k:'defend'},{k:'defend'}],C.rng(11));assert.strictEqual(o.hp,0);
});
test('名前つきのボス（B5・10・15・20）',()=>{
  assert.strictEqual(C.bossFor(15)[0].name,'コアラのだいまどうし');
  assert.ok(C.bossFor(15)[0].mag>0);
  for(const f of [5,10,15,20])assert.strictEqual(C.bossFor(f)[0].name,C.BOSS_DEF[f].name);
});

test('光る宝箱の番人はエリアに1体ずつ。2回行動で、ごほうびが決まっている',()=>{
  assert.deepStrictEqual(Object.keys(C.GUARDIANS).map(Number),[8,18,28,38,48]);
  for(const f of [8,18,28,38,48]){const e=C.guardianFor(f)[0];assert.strictEqual(e.acts,2);assert.ok(e.guardian);assert.ok(C.GUARDIANS[f].reward);}
  assert.strictEqual(C.guardianFor(9),null);
});
test('何度でも使える回復の道具はない（前作の「いやしの石」のようなもの）',()=>{
  for(const k in C.ITEMS)assert.ok(!C.ITEMS[k].reusable,k);
});
