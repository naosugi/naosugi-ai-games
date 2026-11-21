// ===== ゲームのデータ（画面に関係するもの。ルールは core.js） =====
const SAVE_KEY='wombatlegacy2_save_v1',SND_KEY='wombatlegacy2_snd',PREV_SAVE_KEY='wombatlegacy_save_v1';
const STAGE_MAX=20;           // 段階②：B20まで
const MAXITEM=9;
const AREA_NAME=['巣穴の層','ユーカリの根の層','地下水脈の層','オパールの層','太古の層'];
const areaOf=f=>Math.min(4,Math.floor((f-1)/10));
const shopMax=tier=>Math.min(WEAPON_POW.length-1,tier*2-1);
const DEFAULT_NAMES=['ガッチ','ユカリ','モフル'];

// ---------- アイテムの説明（ITEMS は core.js） ----------
const ITEM_DESC={herb:'HPを 30 回復',herb2:'HPを 90 回復',herb3:'HPを 300 回復',antidote:'どくを なおす',water:'MPを 20 回復',leaf:'たおれた仲間を おこす（HP半分）'};
const SHOP_ITEMS=[['herb',1],['antidote',1],['water',1],['herb2',2],['leaf',2],['herb3',3]]; // [道具, 並ぶ店の段階]

// ---------- 迷路 ----------
// '#'壁 '%'やわらかい壁 'z'あやしい壁 '.'通路 'S'地上へのロープ 'D'下への階段 'B'ボス 'H'光る宝箱 'T'宝箱
function floorSize(f){return {cw:Math.min(12,7+Math.floor((f+2)/4)),ch:Math.min(9,5+Math.floor(f/6))};}
function genFloor(f){
  const {cw,ch}=floorSize(f),r=rng(f*7919+421),W=cw*2+1,H=ch*2+1;
  const m=Array.from({length:H},()=>Array(W).fill('#'));
  const vis=new Set(['0,0']),st=[[0,0]];m[1][1]='.';
  while(st.length){
    const [cx,cy]=st[st.length-1];
    const nb=[[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy])=>[cx+dx,cy+dy,dx,dy]).filter(([x,y])=>x>=0&&y>=0&&x<cw&&y<ch&&!vis.has(x+','+y));
    if(!nb.length){st.pop();continue;}
    const [nx,ny,dx,dy]=nb[Math.floor(r()*nb.length)];
    m[cy*2+1+dy][cx*2+1+dx]='.';m[ny*2+1][nx*2+1]='.';vis.add(nx+','+ny);st.push([nx,ny]);
  }
  const nbOpen=(xx,yy)=>[[1,0],[-1,0],[0,1],[0,-1]].filter(([a,b])=>m[yy+b]&&m[yy+b][xx+a]!=='#'&&m[yy+b][xx+a]!=='%').length;
  const between=(x,y)=>(x%2===0&&y%2===1&&m[y][x-1]==='.'&&m[y][x+1]==='.')||(x%2===1&&y%2===0&&m[y-1][x]==='.'&&m[y+1][x]==='.');
  // 少しだけ壁を抜いて、ぐるっと回れる道をつくる（行き止まりはこわさない）
  const loops=Math.floor(cw*ch/10);
  for(let k=0,tries=0;k<loops&&tries<500;tries++){
    const x=1+Math.floor(r()*(W-2)),y=1+Math.floor(r()*(H-2));
    if(m[y][x]!=='#'||!between(x,y))continue;
    const h=x%2===0;if(h?(nbOpen(x-1,y)===1||nbOpen(x+1,y)===1):(nbOpen(x,y-1)===1||nbOpen(x,y+1)===1))continue;
    m[y][x]='.';k++;
  }
  const dist=floorDistM(m,W,H);
  const dead=[];
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){if(m[y][x]==='#'||(x===1&&y===1))continue;if(nbOpen(x,y)===1)dead.push([x,y,dist[y][x]]);}
  dead.sort((a,b)=>b[2]-a[2]);
  const goal=dead.shift();
  const boss=f%5===0;
  m[goal[1]][goal[0]]=boss?'B':'D';
  let guard=null;
  if(GUARDIANS[f]&&dead.length){const g=dead.shift();m[g[1]][g[0]]='H';guard=[g[0],g[1]];}
  for(const [x,y] of dead)m[y][x]='T';
  m[1][1]='S';
  // やわらかい壁：2つの通路にはさまれた内側の壁の一部。ボスのまわりは硬いまま
  const near=(x,y,p)=>Math.abs(x-p[0])+Math.abs(y-p[1])<=2;
  const soft=[];
  for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    if(m[y][x]!=='#'||!between(x,y))continue;
    if(boss&&near(x,y,goal))continue;if(guard&&near(x,y,guard)&&r()<.5)continue;
    if(r()<.42){m[y][x]='%';soft.push([x,y]);}
  }
  // あやしい壁：やわらかい壁のうち2〜3か所
  const nz=2+Math.floor(r()*2);
  for(let k=0;k<nz&&soft.length;k++){const i=Math.floor(r()*soft.length);const [x,y]=soft.splice(i,1)[0];m[y][x]='z';}
  return {W,H,m,goal,boss,guard};
}
function floorDistM(m,W,H){const dist=Array.from({length:H},()=>Array(W).fill(-1));const q=[[1,1]];dist[1][1]=0;
  while(q.length){const [x,y]=q.shift();for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){const X=x+a,Y=y+b;const t=m[Y]&&m[Y][X];if(t&&t!=='#'&&t!=='%'&&t!=='z'&&dist[Y][X]<0){dist[Y][X]=dist[y][x]+1;q.push([X,Y]);}}}return dist;}

// ---------- 宝箱・掘ったときの中身 ----------
function chestLoot(f,x,y){
  const r=rng(f*131+x*17+y*29+7),k=r();
  const g=Math.round(curve('gold',f)*(2.5+r()*1.5));
  if(f%5===4&&k<.18){const lines=['claw','staff','flute'];return {eq:lines[Math.floor(r()*3)],tier:Math.min(WEAPON_POW.length-1,shopMax(1+areaOf(f))+(f>=10?1:0))};}
  if(k<.45)return {gold:g};
  const it=f<8?['herb','herb','antidote','water']:f<30?['herb2','herb2','water','leaf','antidote']:['herb3','herb2','water','leaf'];
  return {item:it[Math.floor(r()*it.length)],n:1+(r()<.3?1:0)};
}
function digLoot(f,ayashi,R){ // R: 遊んでいるときの乱数
  if(!ayashi){if(R()<.12)return R()<.6?{gold:Math.round(curve('gold',f)*(.8+R()*.6))}:{item:f<8?'herb':'herb2',n:1};return null;}
  if(f>=5&&f<=10&&!questDoneG(0,1)&&(G.qcount.seed||0)<3&&R()<.6)return {seed:1};
  const k=R();if(k<.35)return {gold:Math.round(curve('gold',f)*(3+R()*2))};
  const it=f<10?['herb2','water','leaf']:f<30?['herb2','water','leaf','herb3']:['herb3','water','leaf'];
  return {item:it[Math.floor(R()*it.length)],n:1+(R()<.4?1:0)};
}

// ---------- クエスト（エリアごとに3つ。どれか1つで店の品ぞろえが1段上がる） ----------
const QUESTS=[
  {area:0,list:[
    {k:'boss',f:10,s:'ディンゴのおやぶんを たおす',text:'B10の ディンゴのおやぶんを たおす',reward:{gold:300}},
    {k:'seed',n:3,s:'ユーカリの種を 3つ ほる',text:'B5〜10の あやしい壁から「ユーカリの種」を 3つ ほりだす',reward:{item:'leaf',n:2}},
    {k:'gold',amt:600,s:'600ウォン かせぐ',text:'クエストを 受けてから 600ウォン かせぐ',reward:{item:'herb2',n:3}}]},
  {area:1,list:[
    {k:'boss',f:20,s:'イリエワニのぬしを たおす',text:'B20の イリエワニのぬしを たおす',reward:{gold:1200}},
    {k:'flag',flag:'devilPoison',s:'デビルを どくで たおす',text:'タスマニアデビルを どくで たおす',reward:{item:'leaf',n:3}},
    {k:'dex',n:15,s:'ずかんを 15 うめる',text:'ずかんを 15しゅるい うめる',reward:{item:'herb3',n:2}}]},
];
function questOpen(a){return a===0||!!G.bossDown[10*a];}
function questDoneG(a,i){const q=QUESTS[a].list[i];
  if(q.k==='boss')return !!G.bossDown[q.f];
  if(q.k==='seed')return (G.qcount.seed||0)>=q.n;
  if(q.k==='gold')return (G.earned['a'+a]||0)>=q.amt;
  if(q.k==='flag')return !!G.qflag[q.flag];
  if(q.k==='dex')return Object.keys(G.seen).filter(k=>DEX[k]).length>=q.n;
  return false;}

// ---------- 図鑑 ----------
// 前作の動物は前作の文章を使う。新しい動物は STAGE2.md の根拠にもとづく
const DEX={
  ant:'オーストラリアにすむ大型のアリ。大きなアゴと、さされるととても痛い毒針をもつ。',
  fox:'1800年代にヨーロッパから持ちこまれた。オーストラリアの小さな動物たちをおびやかしている。',
  spider:'アシダカグモの仲間の大きなクモ。脚を広げると15cmほどになるものもいるが、人に大きな害はほとんどない。',
  goanna:'オーストラリアにすむ 大きなオオトカゲの仲間。木登りも とくい。',
  tiger:'しま模様が名前の由来。とても強い毒をもつヘビ。',
  toad:'1935年、サトウキビの害虫をへらすために持ちこまれた。体に毒があり、食べた動物が死んでしまうことがある。',
  koala:'ユーカリの葉は栄養が少なく、消化に手間がかかる。そのため1日18〜22時間ほど眠って力を節約する。本物のコアラはおとなしい。この穴のコアラが魔法を使うのは、ゲームの空想。',
  wantr:'幼虫が出す糸で葉っぱをつなぎ合わせて、木の上に巣をつくるアリ。針はないが、かみついた傷口に ぎ酸を吹きつける。',
  eagle:'オーストラリアでいちばん大きなワシ。くさび形の尾が特徴で、翼を広げると2mをこえることもある。',
  kooka:'笑い声のような鳴き声は、なわばりを知らせるためのもの。家族でいっしょに鳴くことが多い。（鳴き声で こうげきが 下がるのは ゲームの空想）',
  crab:'マングローブの泥地にすむ大きなカニ。はさむ力がとても強い。',
  honey:'おなかに花のミツをためこんだ働きアリが、巣の天井にぶら下がる。仲間にミツを口うつしで分ける。',
  dingo:'数千年前に、人といっしょにオーストラリアへ渡ってきたと考えられているイヌ。',
  frill:'危険を感じると、後ろ足で立ち、口を大きく開けて首のえりを広げ、シューッと音を出して相手をおどかす。',
  echidna:'トゲにおおわれた、卵をうむ ほにゅう類。おどろくと 体を丸めたり、土にもぐったりして 身を守る。',
  devil:'いま生きている肉食の有袋類の中でいちばん大きい。かむ力がとても強い。',
  octo:'ヒョウモンダコの仲間。だ液に神経の毒があり、えものをまひさせる。ふだんはおとなしく、つかまれたときにかむ。',
  lyre:'ほかの鳥などの声をまねるのが とても得意で、さえずりの およそ8割が ものまね。（ものまねで とくぎを ふういんするのは ゲームの空想）',
  ssnake:'一生のほとんどを海ですごすヘビ。強い毒をもつ種類が多い。',
  ray:'オーストラリアにだけすむ電気エイ（英名 Coffin Ray）。むなびれにある発電器官から、200ボルトほどの強い電気ショックを出す。',
  perentie:'オーストラリアで いちばん大きな トカゲ。全長2mをこえることもある。',
  ffox:'果物や花のみつを食べる大きなコウモリ。キツネのような顔から、英語で「フライングフォックス」とよばれる。',
  croc:'いま生きている爬虫類の中でいちばん大きい。海を泳いで島から島へ移ることもある。',
  kMage:'この穴の深くにすむ、ふしぎなコアラ（ゲームの空想）。ほのおの まほうを つかう。本物のコアラは まほうを 使わない。',
  kPriest:'この穴の深くにすむ、ふしぎなコアラ（ゲームの空想）。なかまを なおしたり、よみがえらせたりする。',
  kSinger:'この穴の深くにすむ、ふしぎなコアラ（ゲームの空想）。歌で なかまを 元気づける。',
  kPoison:'この穴の深くにすむ、ふしぎなコアラ（ゲームの空想）。どくの きりを まく。',
  kWarrior:'この穴の深くにすむ、ふしぎなコアラ（ゲームの空想）。なかまを かばう。',
  kKarate:'この穴の深くにすむ、ふしぎなコアラ（ゲームの空想）。すばやい けりと はんげきが とくい。',
  boss5:'ツムギアリの群れの女王。ツムギアリは、葉っぱをつなぎ合わせた巣を いくつも つくって 大きな群れで くらす。',
  boss10:'ディンゴの群れのリーダー。ディンゴは家族で群れをつくって暮らすことが多い。',
  boss15:'この穴の まほうつかいコアラの おさ（ゲームの空想）。',
  boss20:'この穴の 水べを おさめる 大きなイリエワニ。イリエワニは、いま生きている爬虫類の中で いちばん大きい。',
  guard8:'光る宝箱を まもる ゴアナ。ゴアナは オーストラリアにすむ 大きなオオトカゲの仲間。',
  guard18:'光る宝箱を まもる ペレンティ。オーストラリアで いちばん大きな トカゲ。',
};

// ---------- スキルの説明 ----------
const ST_JP={poison:'どく',sleep:'ねむり',stun:'まひ',atkdn:'こうげき↓',defdn:'ぼうぎょ↓',curse:'のろい（こうげき↓・ぼうぎょ↓）',confuse:'こんらん',blind:'めつぶし'};
const BUFF_JP={atk:'こうげき',def:'ぼうぎょ',spd:'すばやさ',eva:'よける',all:'こうげき・ぼうぎょ・すばやさ'};
const EFF_JP={hp:v=>`最大HP+${Math.round(v*100)}%`,def:v=>`ぼうぎょ+${Math.round(v*100)}%`,mag:v=>`まりょく+${Math.round(v*100)}%`,mp:v=>`最大MP+${Math.round(v*100)}%`,spd:v=>`すばやさ+${Math.round(v*100)}%`,
  guardCut:v=>`かばうとき うけるダメージ${Math.round(v*100)}%`,kiai:()=>'物理で こうげきすると きあいが たまる',counter:v=>`こうげきを うけると ${Math.round(v*100)}%で はんげき`,evade:v=>`よける+${Math.round(v*100)}%`,
  healPow:v=>`回復量+${Math.round(v*100)}%`,autoRevive:()=>'戦闘中1度だけ、たおれた仲間が 自動で おきる',atkPoison:v=>`ふつうの こうげきで ${Math.round(v*100)}% どく`,poisonPow:v=>`どくのダメージ+${Math.round(v*100)}%`,
  statusRate:v=>`状態異常が かかりやすい+${Math.round(v*100)}%`,buffTurns:v=>`歌が ${v}ターン長く つづく`,buffPow:v=>`歌の効果+${Math.round(v*100)}%`,kiaiMax:v=>`きあいの上限+${v}`,
  kiaiDef:v=>`きあい1段ごとに ぼうぎょ+${Math.round(v*100)}%`,kiaiMag:v=>`きあい1段ごとに まりょく+${Math.round(v*100)}%`,hurtKiai:()=>'ダメージを うけると きあいが たまる',singKiai:()=>'歌うと きあいが たまる',
  poisonAtk:v=>`どくの あいだ こうげき+${Math.round(v*100)}%`,poisonRegen:()=>'どくの あいだ、毎ターン 少し回復',guardCounter:()=>'かばったとき 必ず はんげき',guardHeal:()=>'かばった仲間を 少し回復',fistAll:()=>'属性の こぶしが 敵ぜんたいに',
  danceKiai:()=>'行動すると、仲間みんなに きあいが1段',magEcho:v=>`まほうが ${Math.round(v*100)}%で もう1回`,statusMagPow:v=>`状態異常の敵に まほう+${Math.round(v*100)}%`,statusResist:()=>'仲間みんな 状態異常に かかりにくい',
  songHeal:()=>'歌うと 仲間みんなを 少し回復',itemPow:v=>`どうぐの効果+${Math.round(v*100)}%`,poisonKillHeal:()=>'どくの敵を たおすと 仲間みんなを 少し回復',startCure:()=>'戦闘のはじめに どくを なおす',
  extraAct:v=>`${Math.round(v*100)}%で もう1回 こうげき`,pinch:v=>`HPが少ないとき 全能力+${Math.round(v*100)}%`,pinchRegen:()=>'HPが少ないとき 毎ターン回復',startKiai:()=>'戦闘のはじめから きあい最大',killAtk:v=>`敵を たおすたび こうげき+${Math.round(v*100)}%`,
  buffForever:()=>'歌の効果が 戦闘中ずっと つづく',itemFind:()=>'（掘ると 道具が出やすい）',digLuck:()=>'（掘ると 道具が出やすく、まれに 最強装備の素材）'};
function skillDesc(S){
  const T=S.tgt==='enemies'?'敵ぜんたい':S.tgt==='enemy'?'敵1体':S.tgt==='allies'?'仲間みんな':S.tgt==='ally'?'仲間1匹':S.tgt==='dead'?'たおれた仲間':'自分';
  switch(S.kind){
    case 'passive':return '（持っているだけで きく）'+Object.keys(S.eff).map(k=>EFF_JP[k]?EFF_JP[k](S.eff[k]):k).join('、');
    case 'phys':return `${T}に 物理こうげき（威力×${S.pow}${S.hits?'×'+S.hits+'回':''}）`+(S.el?`・${EL_NAME[S.el]}`:'')+(S.kiaiCost?`・きあいを${S.kiaiCost}段 使う`:'')+(S.ignoreDef?'・ぼうぎょを むし':'')+(S.selfDmg?'・自分も 少し きずつく':'');
    case 'finisher':return `${T}に、きあいを ぜんぶ使う 大わざ（たまっているほど 強い）`;
    case 'mag':return `${T}に まほう`+(S.el==='best'?'（弱点を つく）':S.el?`（${EL_NAME[S.el]}）`:'（むぞくせい）')+(S.drain?'・与えたダメージの半分 回復':'');
    case 'heal':return `${T}の HPを 回復`;
    case 'cure':return '仲間1匹の どく・ねむり・まひ・ふういんを なおす';
    case 'cureAll':return '仲間みんなの どく・ねむり・まひ・ふういんを なおす';
    case 'mpheal':return `ほかの仲間みんなの MPを ${S.amt} 回復`;
    case 'revive':return 'たおれた仲間を おこす（HP半分）';
    case 'mark':return 'えらんだ仲間が この戦闘で たおれたとき、1度だけ HP半分で おきる';
    case 'guard':return `仲間を かばう（うけるダメージ ${Math.round((S.cut||.5)*100)}%）`;
    case 'stance':return S.stance==='counter'?'このターン、うけた こうげきに 必ず はんげき':'このターン、こうげきを うけない';
    case 'status':return `${T}を ${ST_JP[S.st]}に（${Math.round(S.rate*100)}%）`+(S.pow?'＋こうげき':'')+(S.st2?`・${ST_JP[S.st2]}も`:'');
    case 'buff':return `3ターン、仲間みんなの ${BUFF_JP[S.buff]}↑`;
    case 'extend':return S.kiai?'きあいを ぜんぶ使って、その段数だけ 歌の効果を のばす':`歌の効果を ${S.turns}ターン のばす`;
    case 'cheer':return '仲間1匹の 次の こうげきが 強くなる';
    case 'taunt':return '2ターン、敵の こうげきを ひきつける';
    case 'rage':return '自分を どくにして、3ターン こうげき↑';
    case 'berserk':return '3ターン、まもりを すてて こうげき大↑';
  }
  return '';
}
