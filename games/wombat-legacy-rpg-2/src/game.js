// ===== ゲームのデータ（画面に関係するもの。ルールは core.js） =====
const SAVE_KEY='wombatlegacy2_save_v1',SND_KEY='wombatlegacy2_snd',PREV_SAVE_KEY='wombatlegacy_save_v1';
const STAGE_MAX=50;           // B50まで（最後）
const MAXITEM=9;
const AREA_NAME=['巣穴の層','ユーカリの根の層','地下水脈の層','オパールの層','太古の層'];
const areaOf=f=>Math.min(4,Math.floor((f-1)/10));
// 10階ごとに曲を変える（決定）
const dungeonTrack=f=>['dungeon','dungeon2','dungeon3','dungeon4','dungeon5'][areaOf(f)];
const shopMax=tier=>Math.min(SHOP_TOP,tier*2-1);
const DEFAULT_NAMES=['ガッチ','ユカリ','モフル'];

// ---------- アイテムの説明（ITEMS は core.js） ----------
const ITEM_DESC={herb:'HPを 30 回復',herb2:'HPを 90 回復',herb3:'HPを 300 回復',antidote:'どくを なおす',water:'MPを 20 回復',water2:'MPを 80 回復',leaf:'たおれた仲間を おこす（HP半分）',lure:'ダンジョンで使う。しばらく ハリモグラが よく出る（戦闘15回）'};
const SHOP_ITEMS=[['herb',1],['antidote',1],['water',1],['herb2',2],['leaf',2],['lure',3],['herb3',3],['water2',4]]; // [道具, 並ぶ店の段階]

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
  // ひびわれた床（下へ掘る近道）：B21〜49 のボスのいない階に1か所（STAGE3.md）
  let crack=null;
  if(f>=21&&f<STAGE_MAX&&!boss){const cand=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++)if(m[y][x]==='.'&&nbOpen(x,y)>=2&&dist[y][x]>=8)cand.push([x,y]);
    if(cand.length){crack=cand[Math.floor(r()*cand.length)];m[crack[1]][crack[0]]='V';}}
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
  return {W,H,m,goal,boss,guard,crack};
}
function floorDistM(m,W,H){const dist=Array.from({length:H},()=>Array(W).fill(-1));const q=[[1,1]];dist[1][1]=0;
  while(q.length){const [x,y]=q.shift();for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]]){const X=x+a,Y=y+b;const t=m[Y]&&m[Y][X];if(t&&t!=='#'&&t!=='%'&&t!=='z'&&dist[Y][X]<0){dist[Y][X]=dist[y][x]+1;q.push([X,Y]);}}}return dist;}

// ---------- 宝箱・掘ったときの中身 ----------
function chestLoot(f,x,y){
  const r=rng(f*131+x*17+y*29+7),k=r();
  const g=Math.round(curve('gold',f)*(2.5+r()*1.5));
  if(f%5===4&&k<.18){const lines=['claw','staff','flute'];return {eq:lines[Math.floor(r()*3)],tier:Math.min(SHOP_TOP,shopMax(1+areaOf(f))+(f>=10?1:0))};}
  if(k<.45)return {gold:g};
  const it=f<8?['herb','herb','antidote','water']:f<30?['herb2','herb2','water','leaf','antidote']:['herb3','herb2','water2','leaf'];
  return {item:it[Math.floor(r()*it.length)],n:1+(r()<.3?1:0)};
}
// あなほり王の素材（空想）。持ち帰ると、その系統の最強装備（番号11）が店に並ぶ
const MATS={claw:{name:'いにしえの キバ'},staff:{name:'かせきの えだ'},flute:{name:'にじいろの ふえいし'},armor:{name:'いにしえの こうら'}};
function partyHas(k){return G.party.some(m=>m.hp>0&&passives(m)[k]);}
function digLoot(f,ayashi,R){ // R: 遊んでいるときの乱数
  const luck=partyHas('digLuck'),find=luck||partyHas('itemFind');
  if(luck&&f>=31){const left=Object.keys(MATS).filter(k=>!G.mats[k]);if(left.length&&R()<(ayashi?.12:.02))return {mat:left[Math.floor(R()*left.length)]};}
  if(!ayashi){if(R()<(find?.3:.12))return R()<.6?{gold:Math.round(curve('gold',f)*(.8+R()*.6))}:{item:f<8?'herb':f<30?'herb2':'herb3',n:1};return null;}
  if(f>=5&&f<=10&&!questDoneG(0,1)&&(G.qcount.seed||0)<3&&R()<.6)return {seed:1};
  if(f>=31&&f<=40&&questOpen(3)&&!questDoneG(3,1)&&(G.qcount.opal||0)<5&&R()<.5)return {opal:1};
  const k=R();if(k<(find?.25:.35))return {gold:Math.round(curve('gold',f)*(3+R()*2))};
  const it=f<10?['herb2','water','leaf']:f<30?['herb2','water','leaf','herb3']:['herb3','water2','leaf'];
  return {item:it[Math.floor(R()*it.length)],n:1+(R()<(find?.6:.4)?1:0)};
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
  {area:2,list:[
    {k:'boss',f:30,s:'マーレーコッドを たおす',text:'B30の マーレーコッドのおおぬしを たおす',reward:{gold:4000}},
    {k:'flag',flag:'archerSleep',s:'テッポウウオを ねむらせて たおす',text:'テッポウウオを ねむらせて たおす',reward:{item:'leaf',n:3}},
    {k:'down',n:3,s:'ひびわれた床から 3回 ほる',text:'ひびわれた床から 3回 下へ ほる',reward:{item:'herb3',n:3}}]},
  {area:3,list:[
    {k:'boss',f:40,s:'オパールのうみりゅうを たおす',text:'B40の オパールのうみりゅうを たおす',reward:{gold:12000}},
    {k:'opal',n:5,s:'オパールを 5こ ほる',text:'B31〜40の あやしい壁から オパールを 5こ ほりだす',reward:{item:'water2',n:3}},
    {k:'gold',amt:30000,s:'30000ウォン かせぐ',text:'クエストを 受けてから 30000ウォン かせぐ',reward:{item:'leaf',n:4}}]},
  {area:4,list:[
    {k:'boss',f:50,s:'メガラニアを たおす',text:'B50の メガラニアを たおす',reward:{gold:30000}},
    {k:'super',s:'だれかが 超上級職に つく',text:'だれかが 超上級職（〇〇王）に つく',reward:{item:'herb3',n:5}},
    {k:'dex',n:60,s:'ずかんを 60 うめる',text:'ずかんを 60しゅるい うめる',reward:{item:'water2',n:5}}]},
];
function questOpen(a){return a===0||!!G.bossDown[10*a];}
function questDoneG(a,i){const q=QUESTS[a].list[i];
  if(q.k==='boss')return !!G.bossDown[q.f];
  if(q.k==='seed')return (G.qcount.seed||0)>=q.n;
  if(q.k==='gold')return (G.earned['a'+a]||0)>=q.amt;
  if(q.k==='flag')return !!G.qflag[q.flag];
  if(q.k==='dex')return Object.keys(G.seen).filter(k=>DEX[k]).length>=q.n;
  if(q.k==='down')return (G.qcount.down||0)>=q.n;
  if(q.k==='opal')return (G.qcount.opal||0)>=q.n;
  if(q.k==='super')return !!G.qflag.superJob;
  return false;}

// ---------- 超上級職のヒント（いにしえの 石ばん。STAGE3.md） ----------
// ボス・番人の階 → 超上級職と言い伝え
const HINTS={
  25:{job:'kIdl',text:'おどり・まぼろし・いのりの歌・せいなる剣を 極めしもの、みなの ひかりと なる'},
  28:{job:'kDig',text:'上級の戦い・狂う力・おどり・くすりを 極めしもの、大地の 王と なる'},
  30:{job:'kAll',text:'上級の戦い・せいなる剣・まほうの拳・いのりの歌を 極めしもの、すべてを こなす'},
  35:{job:'kAtk',text:'上級の戦い・狂う力・まほうの拳・のろいを 極めしもの、とまらぬ 力を 得る'},
  38:{job:'kMag',text:'まぼろし・のろい・いのりの歌・くすりを 極めしもの、まほうの みちを きわめる'},
  40:{job:'kNin',text:'おどり・まほうの拳・まぼろし・くすりを 極めしもの、かげと なる'},
};
const HINT_KEY='（上級戦士＝上級の戦い、狂戦士＝狂う力、聖騎士＝せいなる剣、魔拳士＝まほうの拳、舞闘家＝おどり、幻術師＝まぼろし、呪術師＝のろい、聖歌士＝いのりの歌、薬師＝くすり）';

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
  opalEchidna:'オパールの 光を まとった、ゲームの 中だけの ハリモグラ。ほんとうの ハリモグラは、アリや シロアリを 長い舌で なめとって 食べる。',
  goldEchidna:'金色に かがやく、ゲームの 中だけの ハリモグラ。ほんとうの ハリモグラには 歯が なく、舌と 口の 上の かたい ところで えさを すりつぶす。',
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
  // B21〜30 地下水脈の層（根拠は STAGE3.md）
  platy:'たまごを うむ ほにゅう類。くちばしで、えものの 出す 弱い 電気を 感じとる。オスの 後ろ足には 毒の けづめが ある。',
  yabby:'オーストラリアの ザリガニの なかま。日照りに なると、穴を ほって 地下の 水を 追いかけ、入口を 土で ふさぐ。',
  rakali:'オーストラリアの 水べに すむ 大きな ネズミ。毒のある オオヒキガエルを、毒の ところを さけて 食べることがある。',
  archer:'口から 水を とばして、えだの 上の 虫を 水に 落として 食べる。オーストラリア北部の 川や マングローブに すむ。',
  glow:'虫の 名前だが、正体は ハエの なかまの 幼虫。光で 虫を さそい、ねばねばの 糸で つかまえる。（光で ねむらせるのは ゲームの 空想）',
  ghost:'オーストラリアで ただ一種の 肉食の コウモリ（英名 ゴーストバット）。どうくつや 古い 坑道に すむ。',
  cod:'オーストラリアで いちばん 大きな 淡水魚。記録では 1.8m・113kgの ものも いる。',
  turtle:'首が 長い カメ。おどろくと くさい しるを 出すので「スティンカー（くさいやつ）」とも よばれる。',
  fwcroc:'口の 細い、オーストラリアの 淡水の ワニ。イリエワニより ずっと 小さい。',
  // B31〜40 オパールの層
  thorny:'全身が トゲで おおわれた トカゲ。皮ふの 細い みぞで 水を 口まで はこぶ。首の 後ろに「にせの頭」が ある。',
  redroo:'いちばん 大きな カンガルー。オスどうしは ボクシングのように 戦い、しっぽで 体を ささえて けることもある。',
  emu:'飛べないが、時速50kmほどで 走る。世界で 2番目に 大きな 鳥。',
  bilby:'長い 耳と 強い ツメを もつ 有袋類（ビルビー）。らせん形の 深い 巣穴を ほる。',
  taipan:'マウスでの 実験では、いちばん 強い 毒を もつ ヘビ。でも おとなしく、人の いない 土地に すむ。',
  scorp:'オーストラリアの サソリは、さされると いたいが、人の 命に かかわるほどの 毒は ないとされる。（まひさせるのは ゲームの 空想）',
  galah:'ピンクと 灰色の オウムの なかま。大きくて さわがしい 群れを つくる。',
  shingle:'短い しっぽが 頭のように 見え、栄養も たくわえる。青い 舌を 見せて 相手を おどかす。',
  // B41〜50 太古の層（化石から よみがえった すがたは ゲームの 空想）
  thyla:'背中の しま模様から「タスマニアタイガー」とも よばれた。知られている 最後の 1頭は、1936年に 動物園で 死んだ。',
  procop:'知られている中で いちばん 大きく がっしりした カンガルー。高さ 2mほど、重さ 200kgほど。化石で 知られる。',
  genyo:'飛べない 大きな 鳥。高さ 2mを こえ、およそ 4万5千年前まで いた。化石で 知られる。',
  meio:'大きな ツノガメ。ツノの せいで 頭を こうらに しまえず、しっぽには トゲと こんぼうが あった。（まほうを はね返すのは 空想）',
  wonambi:'しめつけて えものを とる 大きな ヘビ。南オーストラリアの どうくつで 化石が 見つかった。',
  quink:'陸で くらした ワニ。長い 足で 走り、刃のような 歯を もっていた。化石で 知られる。',
  thyleo:'オーストラリアで いちばん 大きな 肉食の 有袋類。かむ力が とても 強く、親指に 大きな ツメが あった。化石で 知られる。',
  dropbear:'「木の上から 人に 飛びかかる、こわい コアラ」…というのは、オーストラリアで 旅行者を からかうための 作り話。本物の コアラは おとなしい。（前作の 最後の ぬし。この穴の ドロップベアも ゲームの 空想）',
  boss25:'この穴の 水脈を おさめる 大きな カモノハシ（ゲームの 空想）。本物の カモノハシも 川岸に 巣穴を ほる。',
  boss30:'この穴の 地下水を おさめる 大きな マーレーコッド（ゲームの 空想）。マーレーコッドは オーストラリアで いちばん 大きな 淡水魚。',
  boss35:'この穴で いちばん 強い アカカンガルー（ゲームの 空想）。本物の オスも ボクシングのように 戦う。',
  boss40:'オーストラリアの オパールの 町で、オパールに なった 首長竜の なかまの 化石が 見つかっている。この ぬしは、その 化石が うごきだした すがた（ゲームの 空想）。',
  boss45:'太古の層の ぬしの フクロライオン（よみがえった すがたは ゲームの 空想）。かむ力が とても 強かったと 考えられている。',
  boss50:'知られている中で いちばん 大きな 陸の トカゲ。骨が 少ないので、大きさの 見つもりには はばが ある。（よみがえった すがたは ゲームの 空想）',
  guard28:'光る宝箱を まもる 大きな カニ（前作にも 出た、空想の 生き物）。',
  guard38:'光る宝箱を まもる、コアラ一族の 長老（ゲームの 空想）。',
  guard48:'光る宝箱を まもる、いにしえの けもの（前作にも 出た、空想の 生き物）。',
};

// ---------- スキルの説明 ----------
const ST_JP={poison:'どく',sleep:'ねむり',stun:'まひ',atkdn:'こうげき↓',defdn:'ぼうぎょ↓',curse:'のろい（こうげき↓・ぼうぎょ↓）',confuse:'こんらん',blind:'めつぶし'};
const BUFF_JP={atk:'こうげき',def:'ぼうぎょ',spd:'すばやさ',eva:'よける',all:'こうげき・ぼうぎょ・すばやさ'};
const pc=v=>Math.round(v*100);
const EFF_JP={hp:v=>`最大HP+${pc(v)}%`,def:v=>`ぼうぎょ+${pc(v)}%`,mag:v=>`まりょく+${pc(v)}%`,mp:v=>`最大MP+${pc(v)}%`,spd:v=>`すばやさ+${pc(v)}%`,
  guardCut:v=>`かばうとき うけるダメージ${pc(v)}%`,kiai:()=>'物理で こうげきすると きあいが たまる',counter:v=>`物理こうげきを うけると ${pc(v)}%で はんげき`,evade:v=>`物理こうげきを ${pc(v)}% よける`,
  healPow:v=>`回復の とくぎ+${pc(v)}%`,autoRevive:()=>'戦闘中 1度だけ、たおれた仲間が HP半分で 自動で おきる',atkPoison:v=>`ふつうの こうげきで ${pc(v)}%の確率で どく`,poisonPow:v=>`自分が かけた どくの ダメージ+${pc(v)}%`,
  statusRate:v=>`自分が かける 状態異常・デバフの 確率×${(1+v).toFixed(2).replace(/0$/,'')}`,debuffTurns:v=>`自分が かける デバフ（こうげき↓・ぼうぎょ↓・のろい・めつぶし）が ${v}ターン 長い`,
  debuffPow:v=>`自分が かける こうげき↓・ぼうぎょ↓が 強い（${pc(1-CONFIG.debuff.atk)}%→${pc(1-CONFIG.debuff.atk+v)}%、${pc(1-CONFIG.debuff.def)}%→${pc(1-CONFIG.debuff.def+v)}%）`,
  buffTurns:v=>`自分の 歌が ${v}ターン 長く つづく`,buffPow:v=>`自分の 歌の 上がりかた+${pc(v)}%（こうげき↑なら ${pc(CONFIG.buff.atk-1)}%→${pc((CONFIG.buff.atk-1)*(1+v))}%）`,kiaiMax:v=>`きあいの 上限+${v}`,
  kiaiDef:v=>`きあい1段ごとに ぼうぎょ+${pc(v)}%`,kiaiMag:v=>`きあい1段ごとに まりょく+${pc(v)}%`,hurtKiai:()=>'ダメージを うけると きあいが たまる',singKiai:()=>'歌うと きあいが たまる',
  poisonAtk:v=>`どくの あいだ こうげき+${pc(v)}%`,poisonRegen:v=>`どくの あいだ、どくダメージの かわりに 毎ターン 最大HPの${pc(v)}% 回復`,guardCounter:()=>'かばって 物理こうげきを うけると 必ず はんげき（全体こうげき・かわしたときも。ねむり・まひの あいだは しない）',guardHeal:v=>`かばった仲間の HPを 最大HPの${pc(v)}% 回復`,
  fistAll:()=>'属性の こぶしが 敵ぜんたいに',danceKiai:()=>'行動すると、仲間みんなに きあいが1段',magEcho:v=>`まほうが ${pc(v)}%で もう1回`,statusMagPow:v=>`状態異常・デバフの 敵に まほう+${pc(v)}%`,
  statusResist:()=>'仲間みんな 状態異常に かかりにくい（確率半分。何人 持っていても 同じ）',songHeal:v=>`歌うと 仲間みんなの HPを 最大HPの${pc(v)}% 回復`,itemPow:v=>`戦闘中の どうぐの 回復量+${pc(v)}%`,
  poisonKillHeal:v=>`どくの敵を たおすと 仲間みんなの HPを 最大HPの${pc(v)}% 回復`,startCure:()=>'戦闘の はじめに 仲間みんなの どくを なおす',
  extraAct:v=>`${pc(v)}%で もう1回 こうげき`,pinch:v=>`HPが 3割より少ないとき こうげき・ぼうぎょ・まりょく・すばやさ+${pc(v)}%`,pinchRegen:v=>`HPが 3割より少ないとき 毎ターン 最大HPの${pc(v)}% 回復`,startKiai:()=>'戦闘の はじめから きあい最大',
  killAtk:v=>`この戦闘で 敵を たおすたび こうげき+${pc(v)}%`,buffForever:()=>'歌の効果が 戦闘中ずっと つづく（敵に さげられると 消える）',itemFind:()=>'掘ったときと 戦闘のあとに どうぐが 見つかりやすい',digLuck:()=>'B31より 深くで 掘ると、最強装備の 素材が 見つかる',partyRegen:v=>`持っている仲間が 立っていれば、仲間みんなの HP・MPが 毎ターン 最大の${pc(v)}% 回復`};
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
    case 'shelter':return `このターン、仲間みんなの うける ダメージが ${Math.round(S.cut*100)}%に なる（先に 動く）`;
    case 'stance':return S.stance==='counter'?(S.turns?`${S.turns}ターン、うける 物理ダメージ${Math.round((1-KAMAE.cut)*100)}%カット。物理こうげきを うけると 必ず ${KAMAE.pow}倍の はんげき（全体こうげき・かわしたときも）`:'このターン、うけた こうげきに 必ず はんげき'):'このターン、こうげきを うけない';
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
