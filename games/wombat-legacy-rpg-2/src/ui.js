// ===== 画面と操作（前作の ui.js をもとに、続編用に作りかえたもの） =====
const $=id=>document.getElementById(id);
const cv=$('cv'),ctx=cv.getContext('2d');
const SW=192,SH=144;
const R=rng((Date.now()^(Math.random()*1e9))&0x7fffffff);
let G=null,mode='title',B=null,F=null,BA=null,busy=false,heldDir=null,disp=null,now=0,dexSel=null,shakeT=-1e9,flashT=-1e9,fadeT=-1e9;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const EL_ICON={fire:'🔥',ice:'❄',thunder:'⚡',light:'✨'};
const jobName=j=>JOBS[j].name;

// ---------- sound ----------
const SND={on:true,a:null};try{SND.on=localStorage.getItem(SND_KEY)!=='0';}catch(e){}
function tone(f0,f1,dur,type,vol,delay){const a=SND.a,t=a.currentTime+(delay||0);const o=a.createOscillator(),g=a.createGain();o.type=type||'sine';o.frequency.setValueAtTime(f0,t);if(f1)o.frequency.exponentialRampToValueAtTime(f1,t+dur);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol||.05,t+.01);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+dur+.02);}
function snd(k){if(!SND.on)return;try{if(!SND.a)SND.a=new (window.AudioContext||window.webkitAudioContext)();if(SND.a.state==='suspended')SND.a.resume();
  switch(k){
    case 'tap':tone(700,0,.04,'square',.025);break;
    case 'hit':tone(260,90,.12,'square',.05);break;
    case 'phit':tone(150,60,.18,'sawtooth',.05);break;
    case 'magic':tone(380,1300,.28,'triangle',.06);break;
    case 'heal':tone(520,0,.12,'sine',.06);tone(780,0,.2,'sine',.06,.1);break;
    case 'lvl':[523,659,784,1046].forEach((f,i)=>tone(f,0,.15,'square',.045,i*.09));break;
    case 'chest':tone(660,0,.08,'square',.045);tone(990,0,.22,'square',.045,.09);break;
    case 'enc':tone(220,880,.35,'sawtooth',.045);break;
    case 'bump':tone(90,0,.06,'square',.035);break;
    case 'dig':tone(140,80,.09,'square',.05);tone(200,90,.09,'square',.04,.1);break;
    case 'die':tone(420,60,.45,'sawtooth',.045);break;
    case 'stairs':tone(500,250,.25,'triangle',.05);break;
    case 'quest':[659,784,988,1318].forEach((f,i)=>tone(f,0,.18,'triangle',.06,i*.11));break;
  }}catch(e){}}
function setSnd(on,init){SND.on=on;try{localStorage.setItem(SND_KEY,on?'1':'0');}catch(e){}$('snd').textContent=on?'♪ ON':'♪ OFF';if(init)return;if(!on)stopMusic();else unlockAudio();}
$('snd').onclick=()=>{setSnd(!SND.on);snd('tap');};setSnd(SND.on,true);

// ---------- save ----------
function save(){try{localStorage.setItem(SAVE_KEY,JSON.stringify(G));}catch(e){}}
function load(){try{const t=localStorage.getItem(SAVE_KEY);if(!t)return null;const s=JSON.parse(t);if(s&&s.v===2&&s.party)return fixSave(s);return null;}catch(e){return null;}}
function fixSave(s){for(const k of ['seen','opened','bossDown','guardDown','dug','az','maps','flags','qdone','qcount','qflag','earned','hints','mats','raids','raidNews'])s[k]=s[k]||{};s.inv=s.inv||{};return s;}
function prevLevel(){try{const t=localStorage.getItem(PREV_SAVE_KEY);if(!t)return 0;const s=JSON.parse(t);if(s&&s.party)return Math.max(...s.party.map(m=>+m.lv||0));}catch(e){}return 0;}
function prevNames(){try{const t=localStorage.getItem(PREV_SAVE_KEY);if(!t)return null;const s=JSON.parse(t);if(s&&s.party&&s.party.length===3)return s.party.map(m=>m.name);}catch(e){}return null;}

// ---------- message & commands ----------
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let typeTimer=null,typeDone=null;
function setMsg(t,more,from){const m=$('msg');clearInterval(typeTimer);typeTimer=null;typeDone=null;
  if(from==null){m.textContent=t;m.classList.toggle('more',!!more);m.scrollTop=0;return;}
  const ch=[...t];let i=Math.min(from,ch.length);m.classList.remove('more');m.textContent=ch.slice(0,i).join('');
  typeDone=()=>{clearInterval(typeTimer);typeTimer=null;typeDone=null;m.textContent=t;m.classList.toggle('more',!!more);};
  const bottom=from>0;if(!bottom)m.scrollTop=0;
  typeTimer=setInterval(()=>{i+=2;m.textContent=ch.slice(0,i).join('');if(bottom)m.scrollTop=m.scrollHeight;if(i>=ch.length&&typeDone)typeDone();},18);}
let cmdList=[],advance=null,skipFn=null;
// 誤操作ふせぎ：十字キーで歩いている途中に選択肢が出たとき、押したままの指やキーで すぐ選ばれないようにする
let inputGuardUntil=0,padHeld=false;
const inputBlocked=()=>padHeld||performance.now()<inputGuardUntil;
function setCmds(list,head,grid){
  const c=$('cmd');c.innerHTML='';cmdList=[];c.className=grid||'';
  if(head){const h=document.createElement('div');h.className='head';h.textContent=head;c.appendChild(h);}
  for(const it of list){const b=document.createElement('button');b.innerHTML=esc(it.label)+(it.sub?'<small>'+esc(it.sub)+'</small>':'');
    if(it.cls)b.className=it.cls;if(it.dis)b.disabled=true;b.style.animationDelay=Math.min(cmdList.length+(it.dis?1:0),10)*22+'ms';
    b.onclick=()=>{if(b.disabled||inputBlocked())return;snd('tap');it.fn();};if(it.hover){b.addEventListener('pointerenter',()=>it.hover(true));b.addEventListener('pointerleave',()=>it.hover(false));}c.appendChild(b);if(!it.dis)cmdList.push(it);}
  c.scrollTop=0;
}
function talk(text){return new Promise(res=>{setMsg(text,true,0);const go=()=>{if(typeDone){typeDone();return;}advance=null;res();};advance=go;setCmds([{label:'▶ つぎへ',fn:go,cls:'wide hi'}]);});}
async function talks(a){for(const t of a)await talk(t);}
function ask(text,opts){advance=null;return new Promise(res=>{setMsg(text);setCmds(opts.map((o,i)=>{o=typeof o==='string'?{label:o}:o;return {label:o.label,sub:o.sub,dis:o.dis,cls:o.cls||'wide',fn:()=>res(i)};}));});}
function bwait(ms){return new Promise(res=>{const t=setTimeout(()=>{skipFn=null;res();},ms);skipFn=()=>{clearTimeout(t);skipFn=null;res();};});}
$('msg').onclick=()=>{if(advance)advance();else if(typeDone)typeDone();else if(skipFn)skipFn();};
cv.addEventListener('click',e=>{
  if(mode==='battle'&&enemyMark&&BA&&BA.pickE){const r=cv.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*SW,y=(e.clientY-r.top)/r.height*SH;
    for(const i of enemyMark.list){const p=BA.pos[i];if(p&&x>=p.x-2&&x<=p.x+p.w+2&&y>=p.y-10&&y<=p.y+p.h+6){snd('tap');BA.pickE(i);return;}}return;}
  if(advance)advance();else if(typeDone)typeDone();else if(skipFn)skipFn();});
let cvTouch=null;
function dirFromPoint(e){const r=cv.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*SW,y=(e.clientY-r.top)/r.height*SH;const s=F&&F.scr;if(!s)return;const dx=x-s[0],dy=y-s[1];
  if(Math.hypot(dx,dy)<9){heldDir=null;return;}heldDir=Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up');}
cv.addEventListener('pointerdown',e=>{if(mode!=='field'||busy||advance||!F)return;e.preventDefault();cvTouch=e.pointerId;try{cv.setPointerCapture(e.pointerId);}catch(_){}dirFromPoint(e);if(heldDir)tryMove(heldDir);});
cv.addEventListener('pointermove',e=>{if(cvTouch===e.pointerId&&mode==='field')dirFromPoint(e);});
const cvEnd=e=>{if(cvTouch===e.pointerId){cvTouch=null;heldDir=null;}};
cv.addEventListener('pointerup',cvEnd);cv.addEventListener('pointercancel',cvEnd);
function showPad(on){const was=$('pad').classList.contains('on');$('pad').classList.toggle('on',on);if(on)$('cmd').innerHTML='';else if(was)inputGuardUntil=performance.now()+450;}
function banner(main,sub,col,dur){const fx=$('fx');const d=document.createElement('div');d.className='bn';d.style.setProperty('--c',col||'#ffd36b');d.style.animationDuration=(dur||1900)+'ms';
  d.innerHTML='<b>'+esc(main)+'</b>'+(sub?'<span>'+esc(sub)+'</span>':'');fx.innerHTML='';fx.appendChild(d);setTimeout(()=>{if(d.parentNode)d.remove();},(dur||1900)+50);}
let FFX=[];
function sparkle(x,y,n,col,spread){for(let k=0;k<(n||12);k++){const a=R()*Math.PI*2,sp=10+R()*(spread||30);FFX.push({k:'p',x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-10,g:30,col:col||(R()<.5?'#fff6b0':'#ffd36b'),t0:now,life:500+R()*400,sz:R()<.3?2:1});}}

// ---------- party cards ----------
let partyPick=null,enemyMark=null;
$('party').addEventListener('click',e=>{const c=e.target.closest('.pc');if(!c||!partyPick)return;const i=+c.dataset.i;if(partyPick.ok(i)){snd('tap');const cb=partyPick.cb;partyPick=null;cb(i);}});
function statusTags(m,i,hp){
  const st=[];if(hp<=0)return st;
  const poi=disp&&disp[i]&&disp[i].poison!=null?disp[i].poison:m.poison;if(poi)st.push('<i class="s-poi">どく</i>');
  const b=m.bst||{};
  if(mode==='battle'){
    // 演出の途中は、その時点の状態（BA.vs）を出す。計算が終わった後の状態を先に出さないため
    const V=BA&&BA.vs,vm=V?V.m[i]:{sleep:b.sleep,stun:b.stun,silence:b.silence,rage:b.rage,kiai:m.kiai,kamae:B&&B.kamae?B.kamae[i]:0};
    if(vm.sleep>0)st.push('<i class="s-bad">ねむり</i>');if(vm.stun>0)st.push('<i class="s-bad">まひ</i>');if(vm.silence>0)st.push('<i class="s-bad">ふういん</i>');
    if(vm.kiai>0)st.push(`<i class="s-tmp">きあい${vm.kiai}</i>`);if(vm.kamae>0)st.push(`<i class="s-buf">かまえ${vm.kamae}</i>`);
    if(B){const bf=V?V.bf:Object.fromEntries(Object.keys(B.buff).map(k=>[k,B.buff[k].turns||0])),pd=V?V.pd:B.pdebuff,mk=V?V.mk:B.marks;
      for(const [k,n] of [['atk','攻↑'],['def','防↑'],['spd','速↑'],['eva','避↑']])if(bf[k]>0)st.push(`<i class="s-buf">${n}${bf[k]}</i>`);
      if(pd.atk>0)st.push(`<i class="s-bad">攻↓${pd.atk}</i>`);if(pd.def>0)st.push(`<i class="s-bad">防↓${pd.def}</i>`);
      if(mk[i])st.push('<i class="s-buf">いのり</i>');if(vm.rage>0)st.push('<i class="s-tmp">いかり</i>');}
    const ts=BA&&BA.tstat&&BA.tstat[i];if(ts)st.push(`<i class="s-tmp">${ts}</i>`);
  }
  return st;
}
function renderParty(act,hurt){
  if(!G){$('party').innerHTML='';return;}
  $('party').innerHTML=G.party.map((m,i)=>{const d=derived(m),hp=disp?disp[i].hp:m.hp,mp=disp?disp[i].mp:m.mp,hr=hp/d.maxhp;
    const sel=partyPick?(partyPick.ok(i)?'sel':'nosel'):'';
    return `<div data-i="${i}" class="pc ${hp<=0?'dead':hr<.3?'low':''} ${act===i?'act':''} ${hurt===i?'hurt':''} ${sel}"><div class="nm"><b>${esc(m.name)}</b><span class="cl">Lv${m.lv}</span></div>
    <div class="jb">${esc(jobName(m.job))}${m.mastered[m.job]?'★':''}</div>
    <div class="lbl"><span>HP</span><span>${hp<=0?'たおれた':hp+'/'+d.maxhp}</span></div><div class="bar"><i style="width:${100*Math.max(0,hr)}%;background:${hr<.3?'var(--bad)':hr<.6?'#e8d05a':'var(--hp)'}"></i></div>
    <div class="lbl"><span>MP</span><span>${mp}/${d.maxmp}</span></div><div class="bar"><i style="width:${d.maxmp?100*mp/d.maxmp:0}%;background:var(--mp)"></i></div><div class="st">${statusTags(m,i,hp).join('')}</div></div>`;}).join('');
}
function updateTop(where){$('gold').textContent=G?G.gold.toLocaleString('ja-JP')+' ウォン':'';if(where!==undefined)$('where').textContent=where;}
function addGold(n){G.gold+=n;for(let a=0;a<QUESTS.length;a++)if(questOpen(a))G.earned['a'+a]=(G.earned['a'+a]||0)+n;updateTop();}
function addItem(id,n){const have=G.inv[id]||0,can=Math.min(n,MAXITEM-have);G.inv[id]=have+can;return can;}

// ---------- drawing helpers ----------
function grad(y0,y1,c0,c1){const g=ctx.createLinearGradient(0,y0,0,y1);g.addColorStop(0,c0);g.addColorStop(1,c1);ctx.fillStyle=g;ctx.fillRect(0,y0,SW,y1-y0);}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
function drawSpr(c,x,y,flip,alpha){x=Math.round(x);y=Math.round(y);if(alpha!=null)ctx.globalAlpha=alpha;if(flip){ctx.save();ctx.translate(x+c.width,y);ctx.scale(-1,1);ctx.drawImage(c,0,0);ctx.restore();}else ctx.drawImage(c,x,y);ctx.globalAlpha=1;}
function tree(x,y,s,col){rect(x-1,y-14*s,2+s,14*s,'#8a6a4a');ctx.fillStyle=col;for(const [dx,dy,r] of [[0,-16,6],[-5,-12,5],[5,-12,5],[-2,-20,4],[3,-19,4]]){ctx.beginPath();ctx.arc(x+dx*s,y+dy*s,r*s,0,7);ctx.fill();}}
function burrow(x,y,w){ctx.fillStyle='#8a6440';ctx.beginPath();ctx.ellipse(x,y,w,w*.55,0,Math.PI,0);ctx.fill();ctx.fillStyle='#2a180c';ctx.beginPath();ctx.ellipse(x,y,w*.45,w*.32,0,Math.PI,0);ctx.fill();}
const STARS=Array.from({length:40},(_,i)=>{const r=rng(i*31+7);return [r()*SW,r()*80,r()];});
function party3(y){const jobs=G?G.party.map(m=>m.job):['war','mag','pri'];jobs.forEach((c,i)=>{const t=now/1000+i*1.7,blink=(t%4)<.15,bob=Math.floor((now/520+i)%2);
  const spr=wombatSprite(c,'front',{eye:blink?'closed':undefined,bob});drawSpr(spr,96-20+(i-1)*50,y-spr.height);});}
function drawTitle(){
  grad(0,110,'#0d1230','#3b2f63');
  for(const [x,y,p] of STARS){const a=.4+.6*Math.abs(Math.sin(now/700+p*9));rect(x,y,1,1,`rgba(255,250,220,${a})`);}
  ctx.fillStyle='#fff6d0';ctx.beginPath();ctx.arc(160,22,9,0,7);ctx.fill();ctx.fillStyle='#3b2f63';ctx.beginPath();ctx.arc(156,19,8,0,7);ctx.fill();
  ctx.fillStyle='#1d1830';ctx.beginPath();ctx.moveTo(0,104);for(let x=0;x<=SW;x+=8)ctx.lineTo(x,98+Math.sin(x/23)*5);ctx.lineTo(SW,144);ctx.lineTo(0,144);ctx.fill();
  tree(18,104,1.1,'#2b3a2a');tree(176,102,1.2,'#2b3a2a');
  grad(104,144,'#3a2c22','#1f1712');
  ctx.fillStyle='#0a0604';ctx.beginPath();ctx.ellipse(96,128,40,9,0,0,7);ctx.fill(); // 大きな穴
  party3(124);
}
function drawTown(){
  grad(0,90,'#7cc6ee','#d6f0f8');rect(0,88,SW,56,'#6aa84a');rect(0,88,SW,3,'#86c25e');tree(22,92,1.3,'#5c8f6a');tree(170,94,1.5,'#5c8f6a');burrow(6,112,12);
  // 大きな穴の入口（ロープつき）
  ctx.fillStyle='#4a3420';ctx.beginPath();ctx.ellipse(120,94,22,6,0,0,7);ctx.fill();ctx.fillStyle='#120804';ctx.beginPath();ctx.ellipse(120,94,18,4.2,0,0,7);ctx.fill();
  rect(100,84,2,10,'#6a4a2a');rect(138,84,2,10,'#6a4a2a');rect(100,84,40,1,'#8a6a3a');rect(119,85,1,8,'#d8c08a');
  clouds('rgba(255,255,255,.85)');birds('#3a3a4a');party3(132);drawFFX(0,0);
}
function clouds(col){for(let i=0;i<3;i++){const x=((now/90+i*85)%270)-40,y=12+i*10;ctx.fillStyle=col;for(const [dx,dy,r] of [[0,0,5],[6,-3,6],[12,0,5],[6,2,5]]){ctx.beginPath();ctx.arc(x+dx,y+dy,r,0,7);ctx.fill();}}}
function birds(col){for(let i=0;i<2;i++){const x=((now/38+i*120)%250)-30,y=28+i*9+Math.sin(now/300+i)*3,w=Math.floor(now/170+i)%2?1:3;ctx.strokeStyle=col;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-3,y-w+1);ctx.lineTo(x,y);ctx.lineTo(x+3,y-w+1);ctx.stroke();}}
function drawFFX(cx,cy){FFX=FFX.filter(f=>now-f.t0<f.life);for(const f of FFX){if(now<f.t0)continue;const k=(now-f.t0)/f.life,t=(now-f.t0)/1000;
  if(f.k==='p')rect(f.x-cx+f.vx*t,f.y-cy+f.vy*t+(f.g||0)*t*t,f.sz||1,f.sz||1,f.col);
  else if(f.k==='dust'){ctx.fillStyle=`rgba(225,205,175,${.55*(1-k)})`;ctx.beginPath();ctx.arc(f.x-cx+(f.dx||0)*k,f.y-cy-k*3,1+k*2.5,0,7);ctx.fill();}
  else if(f.k==='txt'){ctx.font='bold 9px sans-serif';ctx.textAlign='center';const y=f.y-cy-Math.min(1,k*3)*12;ctx.globalAlpha=k>.8?(1-k)*5:1;ctx.lineWidth=3;ctx.strokeStyle='#000';ctx.strokeText(f.text,f.x-cx,y);ctx.fillStyle=f.col;ctx.fillText(f.text,f.x-cx,y);ctx.globalAlpha=1;ctx.textAlign='left';}}}

// ---------- field ----------
function chestKey(x,y){return F.f+'-'+x+'-'+y;}
function isOpenTile(t){return t!=='#'&&t!=='%'&&t!=='z';}
function tileKind(fl,x,y){const t=fl.m[y]&&fl.m[y][x];if(t===undefined)return 'wall';
  if(t==='#')return (fl.m[y+1]&&isOpenTile(fl.m[y+1][x]))?'face':'wall';
  if(t==='%')return 'soft';if(t==='z')return 'ayashi';
  if(t==='T')return G.opened[chestKey(x,y)]?'open':'chest';
  if(t==='H')return G.guardDown[F.f]?'open':'hchest';
  if(t==='B')return G.bossDown[F.f]?'down':'floor';
  if(t==='D')return 'down';if(t==='S')return 'exit';if(t==='V')return 'crack';return 'floor';}
function reveal(){if(!F)return;const fl=F.fl;let s=G.maps[F.f];if(!s||s.length!==fl.W*fl.H)s='0'.repeat(fl.W*fl.H);const a=s.split('');
  for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=F.px+dx,y=F.py+dy;if(x>=0&&y>=0&&x<fl.W&&y<fl.H)a[y*fl.W+x]='1';}G.maps[F.f]=a.join('');}
function drawMinimap(){if(G.flags.noMap)return;const fl=F.fl,s=G.maps[F.f];if(!s)return;const ox=SW-fl.W*2-4,oy=4;
  ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(ox-2,oy-2,fl.W*2+4,fl.H*2+4);ctx.strokeStyle='rgba(239,230,210,.5)';ctx.lineWidth=1;ctx.strokeRect(ox-2.5,oy-2.5,fl.W*2+5,fl.H*2+5);
  for(let y=0;y<fl.H;y++)for(let x=0;x<fl.W;x++){if(s[y*fl.W+x]!=='1')continue;const t=fl.m[y][x];if(t==='#')continue;let c='rgba(215,200,165,.8)';
    if(t==='%')c='rgba(160,120,80,.8)';else if(t==='z')c='#c8a040';
    else if(t==='V')c='#8a5a3a';else if(t==='T'&&!G.opened[chestKey(x,y)])c='#ffd040';else if(t==='H'&&!G.guardDown[F.f])c='#d098ff';else if(t==='D'||t==='S'||(t==='B'&&G.bossDown[F.f]))c='#6ab8ff';else if(t==='B')c='#ff4a4a';
    ctx.fillStyle=c;ctx.fillRect(ox+x*2,oy+y*2,2,2);}
  if(Math.floor(now/250)%2===0){ctx.fillStyle='#ffffff';ctx.fillRect(ox+F.px*2-1,oy+F.py*2-1,4,4);}}
function drawField(){
  const fl=F.fl,ts=areaOf(F.f);
  let ppx=F.px*16,ppy=F.py*16;
  if(F.moving){const k=Math.min(1,(now-F.moving.t0)/F.moving.dur);ppx=(F.moving.fx+(F.px-F.moving.fx)*k)*16;ppy=(F.moving.fy+(F.py-F.moving.fy)*k)*16;}
  const camX=Math.round(Math.max(0,Math.min(fl.W*16-SW,ppx-88))),camY=Math.round(Math.max(0,Math.min(fl.H*16-SH,ppy-64)));
  rect(0,0,SW,SH,'#000');
  const tx0=Math.floor(camX/16),ty0=Math.floor(camY/16);
  for(let ty=ty0;ty<=ty0+9;ty++)for(let tx=tx0;tx<=tx0+12;tx++){if(ty<0||tx<0||ty>=fl.H||tx>=fl.W)continue;
    const k=tileKind(fl,tx,ty);ctx.drawImage(tileCanvas(ts,k,(tx*7+ty*3)%3),tx*16-camX,ty*16-camY);
    const t=fl.m[ty][tx];
    if((t==='B'&&!G.bossDown[F.f])||(t==='H'&&!G.guardDown[F.f])){const e=t==='B'?bossFor(F.f)[0]:guardianFor(F.f)[0];const spr=enemySprite(e.look),sc=Math.min(22/spr.height,22/spr.width),w=spr.width*sc,h=spr.height*sc;
      if(t==='B'){ctx.fillStyle='rgba(200,30,40,'+(.25+.15*Math.sin(now/200))+')';ctx.beginPath();ctx.ellipse(tx*16-camX+8,ty*16-camY+13,9,4,0,0,7);ctx.fill();}
      ctx.drawImage(spr,tx*16-camX+8-w/2+(t==='H'?10:0),ty*16-camY+15-h,w,h);}
    if(t==='z'&&Math.floor(now/300)%3===0)rect(tx*16-camX+8,ty*16-camY+7,1,1,'#fff');
  }
  const walking=F.moving||heldDir;const fr=walking?Math.floor(now/140)%2:0;
  drawSpr(fieldWombat(F.dir,fr),ppx-camX,ppy-camY-3);F.scr=[ppx-camX+8,ppy-camY+8];
  drawFFX(camX,camY);ambient(ts,camX,camY);
  const fr0=36+Math.sin(now/130)*2+Math.sin(now/57)*1.2;const g=ctx.createRadialGradient(ppx-camX+8,ppy-camY+8,fr0,ppx-camX+8,ppy-camY+8,125);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,.6)');ctx.fillStyle=g;ctx.fillRect(0,0,SW,SH);
  drawMinimap();
  if(F.irisT){const k=Math.min(1,(now-F.irisT)/650),rr=(1-k)*(1-k)*170;ctx.fillStyle='#000';ctx.beginPath();ctx.rect(0,0,SW,SH);ctx.arc(F.scr[0],F.scr[1],Math.max(0,rr),0,Math.PI*2);ctx.fill('evenodd');}
}

// ---------- battle drawing ----------
function layoutEnemies(){
  const sprs=B.enemies.map(e=>enemySprite(e.look)),n=sprs.length,sum=sprs.reduce((s,c)=>s+c.width,0),area=132;
  const sc=sum>area*1.25?area*1.25/sum:1;
  const gap=n>1?Math.min(6,(area-sum*sc)/(n-1)):0;let x=4+Math.max(0,(area-(sum*sc+gap*(n-1)))/2);
  BA.sc=sc;BA.pos=sprs.map((c,i)=>{const w=c.width*sc,h=c.height*sc;const p={x,y:(n>2&&i%2===1?100:110)-h,w,h};x+=w+gap;return p;});
}
function partyPos(i){return {x:132+i*4,y:4+i*44};}
function enemyCenter(i){const p=BA.pos[i];return p?[p.x+p.w/2,p.y+p.h/3]:[60,60];}
function partyCenter(i){const p=partyPos(i);return [p.x+20,p.y+16];}
function pop(xy,n,col,big){BA.pops.push({x:xy[0],y:xy[1],n:String(n),col,t0:now,big});}
function scatter(i){const e=B.enemies[i],p=BA.pos[i];if(!p)return;const c=enemySprite(e.look),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,px=[];
  for(let y=0;y<c.height;y+=2)for(let x=0;x<c.width;x+=2){const k=(y*c.width+x)*4;if(d[k+3]>0)px.push([x*BA.sc,y*BA.sc,`rgb(${d[k]},${d[k+1]},${d[k+2]})`]);}
  const n=Math.min(90,px.length),step=px.length/Math.max(1,n);
  for(let k=0;k<n;k++){const [x,y,col]=px[Math.floor(k*step)];BA.fx.push({k:'p',t0:now,x:p.x+x,y:p.y+y,vx:(x-p.w/2)*1.6+(R()-.5)*24,vy:-25-R()*35,g:90,col,life:600+R()*350,sz:2});}}
function partySparkle(i,col){const [x,y]=partyCenter(i);for(let k=0;k<16;k++){const a=R()*Math.PI*2,sp=14+R()*26;BA.fx.push({k:'p',t0:now,x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-14,g:40,col:col||(R()<.5?'#fff6b0':'#7cf0ff'),life:700+R()*400,sz:R()<.4?2:1});}}
function spawnFx(kind,pts){
  for(const [x,y] of pts){
    const add=(o)=>BA.fx.push(Object.assign({t0:now,x,y},o));
    if(kind==='slash')add({k:'slash',life:220});
    else if(kind==='fire')for(let k=0;k<14;k++)add({k:'p',life:600,vx:(R()-.5)*20,vy:-20-R()*30,col:R()<.5?'#ff9a2a':'#ffdd55',dx:(R()-.5)*16,dy:(R()-.3)*14});
    else if(kind==='ice')for(let k=0;k<10;k++)add({k:'p',life:600,vx:(R()-.5)*8,vy:30+R()*20,col:R()<.5?'#9ae8ff':'#ffffff',dx:(R()-.5)*18,dy:-18-R()*8,sz:2});
    else if(kind==='thunder'){add({k:'bolt',life:300});flashT=now;}
    else if(kind==='light')for(let k=0;k<12;k++){const a=k/12*Math.PI*2;add({k:'p',life:600,vx:Math.cos(a)*24,vy:Math.sin(a)*24,col:'#fff6b0',dx:0,dy:0});}
    else if(kind==='boom'){add({k:'ring',life:450,col:'#ffb040'});shakeT=now;}
    else if(kind==='heal')for(let k=0;k<10;k++)add({k:'p',life:700,vx:(R()-.5)*6,vy:-14-R()*10,col:R()<.5?'#8aff9a':'#e8ffe8',dx:(R()-.5)*20,dy:R()*12});
    else if(kind==='buff')add({k:'ring',life:500,col:'#7ac8ff'});
    else if(kind==='bad')add({k:'ring',life:500,col:'#c060ff'});
    else if(kind==='sleep')for(let k=0;k<3;k++)add({k:'z',life:900,dx:(k-1)*6,dy:-k*4});
  }
}
function drawBattle(){
  const T=TILESETS[B.ts];
  grad(0,96,T.bg[0],T.bg[1]);
  rect(0,96,SW,48,T.top2);for(let k=0;k<6;k++)rect(0,96+k*k*1.4,SW,1,T.f3);
  ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(66,112,64,10,0,0,7);ctx.fill();ambient(B.ts,0,0);
  let sx=0,sy=0;if(now-shakeT<260){sx=(R()-.5)*4;sy=(R()-.5)*3;}
  ctx.save();ctx.translate(Math.round(sx),Math.round(sy));
  B.enemies.forEach((e,i)=>{const a=BA.e[i],p=BA.pos[i];if(!a||!p)return;
    let alpha=1;if(a.dead){alpha=Math.max(0,1-(now-a.dead)/450);if(alpha<=0)return;}
    const spr=enemySprite(e.look);const bob=Math.round(Math.sin(now/400+i)*1);const ent=Math.min(1,(now-BA.enter)/420),lunge=(now-a.lunge<220?6:0)-Math.round((1-ent)*(1-ent)*130);
    const sh=now-a.flash<300&&Math.floor((now-a.flash)/60)%2===0;
    const img=sh?cached('sil|'+JSON.stringify(e.look),()=>silhouette(spr,'#ffffff')):spr;
    ctx.globalAlpha=alpha;ctx.drawImage(img,Math.round(p.x+lunge),Math.round(p.y+bob),p.w,p.h);ctx.globalAlpha=1;
    if(!a.dead){
      ctx.font='bold 8px monospace';
      if(e.st.sleep>0){ctx.fillStyle='#cde';ctx.fillText('z',p.x+p.w-6,p.y+4+Math.sin(now/300)*2);}
      if(e.charged){ctx.fillStyle=Math.floor(now/150)%2?'#ff5a5a':'#ffd36b';ctx.fillText('!',p.x+p.w/2,p.y-2);}
      if(a.show==null)a.show=a.hp;if(a.trail==null)a.trail=a.hp;
      a.show+=(a.hp-a.show)*.25;if(Math.abs(a.hp-a.show)<.5)a.show=a.hp;
      if(now-a.flash>350){a.trail+=(a.show-a.trail)*.12;if(a.trail-a.show<.5)a.trail=a.show;}if(a.trail<a.show)a.trail=a.show;
      const w=Math.round(Math.max(20,Math.min(34,p.w*.6))),bx=Math.round(p.x+lunge+p.w/2-w/2),by=Math.round(Math.min(139,p.y+p.h+3)),r=Math.max(0,a.show/e.max),tr=Math.max(0,Math.min(1,a.trail/e.max));
      rect(bx-1,by-1,w+2,5,'#000');rect(bx,by,w,3,'#3a2a2a');rect(bx,by,Math.round(w*tr),3,'#ffffff');
      rect(bx,by,Math.round(w*r),3,r<.3?'#ff5a5a':r<.6?'#e8d05a':'#78e070');rect(bx,by,Math.round(w*r),1,'rgba(255,255,255,.35)');}
  });
  bossPlate();
  if(enemyMark){const blink=Math.floor(now/280)%2===0;ctx.font='bold 8px sans-serif';ctx.textAlign='center';
    for(const i of enemyMark.list){const p=BA.pos[i],e=B.enemies[i];if(!p||e.hp<=0)continue;const foc=enemyMark.focus===i;
      if(blink||foc){const cx=Math.round(p.x+p.w/2),cy=p.y-3+(foc?0:Math.round(Math.sin(now/150)));ctx.fillStyle=foc?'#ffffff':'#ffd36b';ctx.beginPath();ctx.moveTo(cx-4,cy-6);ctx.lineTo(cx+4,cy-6);ctx.lineTo(cx,cy);ctx.fill();}
      const lt=/ ([A-E])$/.exec(e.name);if(lt){const ly=Math.min(141,p.y+p.h+11);ctx.lineWidth=3;ctx.strokeStyle='#000';ctx.strokeText(lt[1],p.x+p.w/2,ly);ctx.fillStyle='#fff';ctx.fillText(lt[1],p.x+p.w/2,ly);}}
    ctx.textAlign='left';}
  G.party.forEach((m,i)=>{const a=BA.p[i],p=partyPos(i),dh=(disp?disp[i].hp:m.hp)<=0;
    const ent=Math.min(1,(now-BA.enter)/420);let pose;const sl=m.bst&&(m.bst.sleep>0||m.bst.stun>0);
    if(dh)pose={eye:'closed',sq:.12,low:2};else if(BA.win)pose={eye:'happy'};else if(a.step)pose={eye:'strain',walk:true,wp:Math.floor(now/120)%2};else if(sl)pose={eye:'closed'};else pose={bob:Math.floor((now/500+i*.6)%2)};
    const spr=wombatSprite(m.job,'side',pose);let x=p.x-(a.step?12:0)+Math.round((1-ent)*(1-ent)*80),y=p.y;
    if(BA.win&&!dh)y-=Math.round(Math.abs(Math.sin((now-BA.win)/160+i*.9))*6);
    if(now-a.shake<260)x+=Math.round((R()-.5)*4);
    const fl=now-a.shake<300&&Math.floor((now-a.shake)/60)%2===0;
    drawSpr(fl?cached('psil|'+m.job,()=>silhouette(spr,'#ff6060')):spr,x,y,true,dh?.7:1);
  });
  BA.fx=BA.fx.filter(f=>now-f.t0<f.life);
  for(const f of BA.fx){const k=(now-f.t0)/f.life,t=(now-f.t0)/1000;
    if(f.k==='p'){rect(f.x+(f.dx||0)+f.vx*t,f.y+(f.dy||0)+f.vy*t+(f.g||0)*t*t,f.sz||1.5,f.sz||1.5,f.col);}
    else if(f.k==='slash'){ctx.strokeStyle='rgba(255,255,255,'+(1-k)+')';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(f.x-10+k*4,f.y-10);ctx.lineTo(f.x+10,f.y+10-k*4);ctx.moveTo(f.x-4,f.y-12);ctx.lineTo(f.x+12,f.y+4);ctx.stroke();}
    else if(f.k==='bolt'){ctx.strokeStyle=Math.floor(now/40)%2?'#fff8a0':'#ffd030';ctx.lineWidth=2;ctx.beginPath();let x=f.x,y=0;ctx.moveTo(x,y);while(y<f.y){y+=8;x=f.x+(R()-.5)*10;ctx.lineTo(x,Math.min(y,f.y));}ctx.stroke();}
    else if(f.k==='ring'){ctx.strokeStyle=f.col;ctx.globalAlpha=1-k;ctx.lineWidth=2;ctx.beginPath();ctx.arc(f.x,f.y,4+k*26,0,7);ctx.stroke();ctx.globalAlpha=1;}
    else if(f.k==='z'){ctx.fillStyle='rgba(220,230,255,'+(1-k)+')';ctx.font='bold 9px monospace';ctx.fillText('Z',f.x+f.dx+k*6,f.y+f.dy-k*14);}
  }
  BA.pops=BA.pops.filter(p=>now-p.t0<900);
  ctx.textAlign='center';
  for(const p of BA.pops){const k=(now-p.t0)/900,y=p.y-Math.sin(Math.min(1,k*2.6)*Math.PI)*9-k*4;ctx.font=p.big?'bold 13px monospace':'bold 10px monospace';ctx.lineWidth=3;ctx.strokeStyle='#000';ctx.strokeText(p.n,p.x,y);ctx.fillStyle=p.col;ctx.fillText(p.n,p.x,y);}
  ctx.textAlign='left';ctx.restore();
}
function drawDex(){grad(0,SH,'#2a2240','#46385e');rect(0,104,SW,40,'#3a3050');
  if(dexSel){const spr=enemySprite(dexSel),sc=Math.min(2,Math.min(110/spr.height,170/spr.width));ctx.drawImage(spr,96-spr.width*sc/2,108-spr.height*sc,spr.width*sc,spr.height*sc);}
  else party3(132);}
function frame(t){
  now=t;ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.imageSmoothingEnabled=false;
  if(mode==='field'&&now-shakeT<400)ctx.translate(Math.round((R()-.5)*4),Math.round((R()-.5)*3));
  try{if(mode==='title')drawTitle();else if(mode==='town')drawTown();else if(mode==='field')drawField();else if(mode==='battle')drawBattle();else if(mode==='dex')drawDex();else if(mode==='ending')drawEnding();}catch(e){console.error(e);}
  ctx.setTransform(1,0,0,1,0,0);
  if(now-wipeT<700&&mode!=='battle')drawWipe();
  if(now-flashT<120){ctx.fillStyle='rgba(255,255,255,.7)';ctx.fillRect(0,0,SW,SH);}
  if(now-fadeT<400){ctx.fillStyle='rgba(0,0,0,'+(1-(now-fadeT)/400)+')';ctx.fillRect(0,0,SW,SH);}
  if(mode==='field'&&heldDir&&F&&!F.moving&&!busy)tryMove(heldDir);
  requestAnimationFrame(frame);
}
let wipeT=-1e9;
const SPIRAL=(()=>{const W=12,H=9,out=[];let x0=0,y0=0,x1=W-1,y1=H-1;while(x0<=x1&&y0<=y1){for(let x=x0;x<=x1;x++)out.push([x,y0]);y0++;for(let y=y0;y<=y1;y++)out.push([x1,y]);x1--;if(y0<=y1){for(let x=x1;x>=x0;x--)out.push([x,y1]);y1--;}if(x0<=x1){for(let y=y1;y>=y0;y--)out.push([x0,y]);x0++;}}return out;})();
function drawWipe(){const k=Math.min(1,(now-wipeT)/460),n=Math.floor(k*SPIRAL.length);ctx.fillStyle='#000';for(let i=0;i<n;i++){const [x,y]=SPIRAL[i];ctx.fillRect(x*16,y*16,16,16);}}

// ---------- title / new game ----------
function newGame2(){
  const g=newGame();g.v=2;g.party.forEach((m,i)=>m.name=DEFAULT_NAMES[i]);
  return fixSave(Object.assign(g,{gold:120,inv:{herb:4,antidote:1},steps:0,started:Date.now()}));
}
function title(){
  mode='title';G=null;B=null;F=null;disp=null;showPad(false);playMusic('title');renderParty();updateTop('ウォンバット☆レガシーRPG 2');
  const sv=load();
  $('overlay').innerHTML='<h1>ウォンバット<span>☆</span><br>レガシーRPG <span>2</span></h1><p>地下50階の 大きな穴</p>'+(sv&&sv.title?`<p class="clr">称号：${esc(sv.title)}</p>`:'')+(sv&&sv.secretDown?'<p class="clr">★★ 完全クリア ★★</p>':sv&&sv.cleared?'<p class="clr">★ クリアずみ ★</p>':'');setMsg(sv?'つづきから あそべます。':'ボタンを おして はじめよう。');
  setCmds([{label:'▶ はじめから',fn:startNew,cls:sv?'':'wide hi'},...(sv?[{label:'▶ つづきから',sub:`いちばん深い B${sv.reached||0}`,fn:()=>{G=sv;$('overlay').innerHTML='';fadeT=now;enterTown();},cls:'hi'}]:[])]);
}
async function startNew(){
  if(load()){const c=await ask('前のデータは 消えてしまいます。はじめから あそびますか？',['はじめから あそぶ','やめる']);if(c===1){title();return;}}
  G=newGame2();const pn=prevNames()||['ガッシ','ユーカ','モフ'];G.parents=pn;const plv=prevLevel();
  $('overlay').innerHTML='';renderParty();updateTop('');playMusic('town');
  await talks(['ここは オーストラリアの ユーカリ村。\n大地に ふたたび ユーカリが しげって、何年かが たった。',
    `ある朝、村の まんなかに、どこまでも つづく 大きな 穴が あいた。`,
    `長老「この穴の いちばん下に、わしらの ご先祖が のこしたものが ある…という 言い伝えがある」`,
    `むかし 旅をした ${pn[0]}・${pn[1]}・${pn[2]}の 子どもたちが、名のりを あげた。`,...(plv?[`${pn[0]}「おれたちが 旅を していたころは、Lv${plv}まで きたえたもんだ。おまえたちなら、もっと 先まで 行けるさ」`]:[])]);
  const c=await ask(`子どもたちの 名前は「${G.party.map(m=>m.name).join('・')}」。\nこのままで いい？`,[{label:'このままで はじめる',cls:'wide hi'},{label:'名前を かえる',cls:'wide'}]);
  if(c===1)await nameEditor(true);
  await talks([`${pn[0]}「穴の中は 迷路に なっている。5階ごとに 強い ぬしが いるそうだ。気をつけるんだぞ」`,
    '【あそびかた】\n村では ボタンで 行き先を えらぶよ。\n「⛏ 穴に もぐる」で 冒険に 出よう。いちど行った 階からなら、いつでも はじめられるよ。']);
  save();fadeT=now;enterTown();
}

// ---------- town ----------
async function enterTown(arrive){
  mode='town';F=null;B=null;disp=null;busy=false;heldDir=null;showPad(false);
  G.az={}; // あやしい壁は 村に もどると また うまる
  renderParty();updateTop('ユーカリ村');save();playMusic('town');
  if(arrive)await talks(arrive);
  await checkQuests();
  await raidNews();
  townMenu();
}
function questLine(a,short){if(!questOpen(a))return '';const Q=QUESTS[a];return Q.list.map((q,i)=>{const done=(G.qdone[a]||{})[i];let s=(done?'✅ ':'□ ')+(short?q.s:q.text);
  if(!done&&q.k==='gold'){const left=q.amt-(G.earned['a'+a]||0);if(left>0)s+=`（あと${left}）`;}
  if(!done&&q.k==='seed')s+=`（${G.qcount.seed||0}/3）`;
  if(!done&&q.k==='down')s+=`（${G.qcount.down||0}/${q.n}）`;
  if(!done&&q.k==='opal')s+=`（${G.qcount.opal||0}/${q.n}）`;
  if(!done&&q.k==='dex')s+=`（${Object.keys(G.seen).filter(k=>DEX[k]).length}/${q.n}）`;
  if(!done&&questDoneG(a,i))s+=short?' ←報告！':' ← 報告できる！';return s;}).join('\n');}
function curArea(){let a=0;for(let i=1;i<QUESTS.length;i++)if(G.bossDown[10*i])a=i;return a;}
async function checkQuests(){
  for(let a=0;a<QUESTS.length;a++){if(!questOpen(a))continue;G.qdone[a]=G.qdone[a]||{};
    for(let i=0;i<QUESTS[a].list.length;i++){
      if(G.qdone[a][i]||!questDoneG(a,i))continue;
      const first=!Object.keys(G.qdone[a]).length;G.qdone[a][i]=true;snd('quest');
      const q=QUESTS[a].list[i];let rw='';
      if(q.reward.gold){G.gold+=q.reward.gold;rw=`お礼に ${q.reward.gold}ウォン もらった！`;}
      if(q.reward.item){const n=addItem(q.reward.item,q.reward.n);rw=`お礼に ${ITEMS[q.reward.item].name}を ${q.reward.n}こ もらった！`+(n<q.reward.n?'（持ちきれない分は あきらめた）':'');}
      updateTop();banner('QUEST CLEAR!',q.text,'#ffd36b',2300);sparkle(96,70,30,null,50);
      await talk(`★ クエスト たっせい！ ★\n「${q.text}」`);
      await talk(`長老「みごとじゃ！ ありがとう！」\n${rw}`);
      if(first){G.shopTier=Math.max(G.shopTier,a+2);await talk(`長老「お礼に、村の 店に 新しい 品を ならべてもらったぞ。\n（店の 品ぞろえが よくなった）」`);}
      save();
    }}
}
function townMenu(){
  mode='town';advance=null;dexSel=null;updateTop('ユーカリ村');renderParty();
  const a=curArea();
  setMsg(`【ユーカリ村】`+(G.reached?`B${G.reached}まで`:'まだ もぐっていない')+(Object.keys(G.qdone[a]||{}).length?'':' ／ クエスト1つで 店が よくなる')+'\n'+questLine(a,true));
  const inn=10+(G.reached||0)*3;
  const list=[
    {label:'⛏ 穴に もぐる',sub:'行ったことのある 階から',fn:pickFloor,cls:'wide hi'},
    {label:'🛏 宿屋',sub:`${inn}ウォンで 全回復`,fn:innStay},
    {label:'🧺 道具屋',sub:'やくそう など',fn:itemShop},
    {label:'🗡 武器と防具',sub:'ツメ・つえ・ふえ・よろい',fn:equipShop},
    {label:'👴 長老の巣穴',sub:'お話・クエスト',fn:elder},
    G.flags.jobChange?{label:'🎓 転職所',sub:'転職・引き継ぎ枠',fn:jobHall}:{label:`🏠 ${G.parents[0]}たちの 家`,sub:'ヒントを 聞く',fn:parentsHome},
    ...(RAIDS.some(R=>raidUnlocked(G,R))?[{label:'🐨 コアラ討伐',sub:'村の近くの コアラを 追いかえす',fn:raidMenu}]:[]),
    {label:'📊 つよさ・どうぐ',fn:()=>partyMenu(townMenu)},
    {label:'📖 ずかん',fn:dex},
  ];
  setCmds(list);
}
async function innStay(){
  const cost=10+(G.reached||0)*3;let free=false;
  if(G.gold<cost)free=true;else{G.gold-=cost;updateTop();}
  G.party.forEach(m=>{const d=derived(m);m.hp=d.maxhp;m.mp=d.maxmp;m.poison=false;});
  fadeT=now;snd('heal');renderParty();save();
  await talk(free?'宿屋「お金が たりない？ …今回は タダで いいよ！」\nぐっすり ねむって、みんな 元気になった！':'ぐっすり ねむって、みんな 元気になった！\n（HPと MPが 全回復、どくも なおった）');
  townMenu();
}
function itemShop(){
  setMsg('道具屋「いらっしゃい！ 1回おすごとに 1こ 買えるよ」\n（それぞれ 9こまで 持てる）');
  const list=SHOP_ITEMS.filter(([id,t])=>t<=G.shopTier).map(([id])=>{const it=ITEMS[id],n=G.inv[id]||0;return {label:`${it.name}  ${it.price}ウォン`,sub:`${ITEM_DESC[id]}（いま ${n}こ）`,dis:G.gold<it.price||n>=MAXITEM,
    fn:()=>{G.gold-=it.price;addItem(id,1);updateTop();save();itemShop();snd('chest');}};});
  setCmds([...list,{label:'← もどる',fn:townMenu,cls:'wide sub'}]);
}
function weaponLabel(m){return `${WEAPON_LINES[m.wl].names[m.w]}（${WEAPON_LINES[m.wl].name}）`;}
async function equipShop(){
  const t=await pickMember('武器屋「だれの そうびを 見る？」',()=>true);if(t<0){townMenu();return;}
  equipFor(t);
}
function equipFor(t){
  const m=G.party[t],mx=shopMax(G.shopTier),best=bestLine(m.job),list=[];
  for(const l of ['claw','staff','flute']){const L=WEAPON_LINES[l],own=m.own[l]||0;
    const idx=mx,cost=WEAPON_PRICE[idx]-Math.floor(WEAPON_PRICE[own]/2),have=own>=idx;
    const stat=l==='claw'?`こうげき+${WEAPON_POW[idx]}`:l==='staff'?`まりょく+${WEAPON_POW[idx]}`:`こうげき・まりょく+${Math.floor(WEAPON_POW[idx]*.7)}`;
    list.push({label:(l===best?'★おすすめ ':'')+L.names[idx],sub:have?(m.wl===l?'そうびずみ':'持っている（つよさ画面で つけかえ）'):`${stat}  ${cost}ウォン`,dis:have||G.gold<cost,cls:l===best?'wide hi':'',
      fn:()=>{G.gold-=cost;m.own[l]=idx;m.wl=l;m.w=idx;const d=derived(m);m.hp=Math.min(m.hp,d.maxhp);updateTop();save();snd('chest');equipFor(t);setMsg(`${m.name}は ${L.names[idx]}を そうびした！\n（同じ系統の 古い武器は 半額で 下取り）`);}});}
  for(const l of ['claw','staff','flute']){if(!G.mats[l])continue;const L=WEAPON_LINES[l],idx=WEAPON_POW.length-1,own=m.own[l]||0,cost=WEAPON_PRICE[idx]-Math.floor(WEAPON_PRICE[own]/2),have=own>=idx;
    const stat=l==='claw'?`こうげき+${WEAPON_POW[idx]}`:l==='staff'?`まりょく+${WEAPON_POW[idx]}`:`こうげき・まりょく+${Math.floor(WEAPON_POW[idx]*.7)}`;
    list.push({label:'⛏ '+L.names[idx],sub:have?(m.wl===l?'そうびずみ':'持っている'):`${stat}  ${cost}ウォン`,dis:have||G.gold<cost,cls:'wide',
      fn:()=>{G.gold-=cost;m.own[l]=idx;m.wl=l;m.w=idx;updateTop();save();snd('quest');equipFor(t);setMsg(`${m.name}は ${L.names[idx]}を そうびした！`);}});}
  if(G.mats.armor){const ti=ARMORS.length-1,tc=ARMORS[ti][2]-Math.floor(ARMORS[m.a][2]/2),th=m.a>=ti;
    list.push({label:'⛏ '+ARMORS[ti][0],sub:th?'そうびずみ':`ぼうぎょ+${ARMORS[ti][1]}  ${tc}ウォン`,dis:th||G.gold<tc,cls:'wide',fn:()=>{G.gold-=tc;m.a=ti;updateTop();save();snd('quest');equipFor(t);setMsg(`${m.name}は ${ARMORS[ti][0]}を そうびした！`);}});}
  if(G.shopTier>=3){m.charms=m.charms||{};for(const k of Object.keys(CHARMS)){const C=CHARMS[k],own=!!m.charms[k],on=m.charm===k;
    list.push({label:`🔰 ${C.name}`,sub:on?'つけている（はずす）':own?'持っている（つける）':`${ST_JP2[C.st]}に かかりにくい  ${C.price}ウォン`,dis:!own&&G.gold<C.price,cls:'',
      fn:()=>{if(on)m.charm=null;else{if(!own){G.gold-=C.price;m.charms[k]=1;}m.charm=k;}updateTop();save();snd('chest');equipFor(t);setMsg(on?`${m.name}は ${C.name}を はずした。`:`${m.name}は ${C.name}を つけた！\n（${ST_JP2[C.st]}に かかる確率が 4分の1に なる。おまもりは 1匹 1つまで）`);}});}}
  const ai=mx,cur=m.a,acost=ARMORS[ai][2]-Math.floor(ARMORS[cur][2]/2),ahave=cur>=ai;
  list.push({label:ARMORS[ai][0],sub:ahave?'そうびずみ':`ぼうぎょ+${ARMORS[ai][1]}（いま+${ARMORS[cur][1]}）  ${acost}ウォン`,dis:ahave||G.gold<acost,
    fn:()=>{G.gold-=acost;m.a=ai;updateTop();save();snd('chest');equipFor(t);setMsg(`${m.name}は ${ARMORS[ai][0]}を そうびした！`);}});
  setMsg(`武器屋「${m.name}（${jobName(m.job)}）なら ${WEAPON_LINES[best].name}が おすすめだよ。\nいまの武器：${weaponLabel(m)}」`);
  setCmds([...list,{label:'← ほかの仲間',fn:equipShop,cls:'sub'},{label:'← もどる',fn:townMenu,cls:'sub'}]);
}
async function elder(){
  if(!G.flags.metElder){G.flags.metElder=1;save();
    await talks(['長老「よく来たのう。この穴は、ほればほるほど 深く つづいておる」','長老「クエストを どれか1つ やりとげたら、村の 店に 新しい 品を ならべてもらおう」']);}
  const a=curArea();
  await talk(`長老「クエストは こんな かんじじゃ」\n${questLine(a)}`);
  for(let b=0;b<a;b++)if(!Object.keys(G.qdone[b]||{}).length)await talk('長老「まえの クエストも、まだ やりとげられるぞ」\n'+questLine(b));
  const hs=Object.keys(HINTS).filter(f=>G.hints[f]);
  if(hs.length){const c=await ask(`長老「いにしえの 石ばんを ${hs.length}つ 持っておるな。読んでみるか？」`,[{label:'📜 読む',cls:'wide hi'},{label:'いまは いい',cls:'wide'}]);
    if(c===0){for(const f of hs){showTablet(f);await talk(`長老「B${f}で 見つけた 石ばんじゃな」`);}$('overlay').innerHTML='';await talk('長老「ことばの 意味は…\n'+HINT_KEY+'」');}}
  await checkQuests();townMenu();
}
async function parentsHome(){
  const p=G.parents;
  await talks([`${p[0]}「ダンジョンで こまったら、たたかいの「おまかせ」に たよっても いいんだぞ」`,
    `${p[1]}「5階の ぬしを たおしたら、穴の ほりかたを 教えてあげる。やわらかい壁なら ほれるようになるわ」`,
    `${p[2]}「10階の ぬしを たおしたら、転職所を ひらこう。いろんな 職業を 学ぶと、わざを 引きついで いけるんだ」`]);
  townMenu();
}

// ---------- 転職所 ----------
async function jobHall(){
  const c=await ask(`${G.parents[2]}「どうする？」`,[{label:'🎓 転職する',sub:'職業を かえる',cls:''},{label:'🧩 引き継ぎ枠',sub:'ほかの職業の わざを 6つまで',cls:''},{label:'📜 進み具合',sub:'極めた職業と 解放',cls:''},{label:'← もどる',cls:'sub'}]);
  if(c===0){await jobChangeMenu();return jobHall();}
  if(c===1){await slotMenu();return jobHall();}
  if(c===2){await progressView();return jobHall();}
  townMenu();
}
function superHint(m,j){const J=JOBS[j];return J.req.map(r=>m.mastered[r]?JOBS[r].name+'★':'？').join('＋');}
async function jobChangeMenu(){
  const t=await pickMember('だれが 転職する？',()=>true);if(t<0)return;
  const m=G.party[t];
  while(true){
    const opts=[],keys=[];let lastT=0;
    for(const j of Object.keys(JOBS)){const J=JOBS[j],un=jobUnlocked(m,j),cur=m.job===j;
      if(J.tier!==lastT){lastT=J.tier;opts.push({label:['','― 基本職（上限 Lv20）―','― 上級職（上限 Lv30）― 基本職2つを 極めると','― 超上級職（上限 Lv40）― 上級職4つを 極めると'][J.tier],cls:'wide sec',dis:true});keys.push(null);}
      let label,sub;
      if(J.tier===1){label=`${J.name}${m.mastered[j]?'★':''}`;sub=cur?'いまの職業':m.mastered[j]?'極めた（Lv上限のまま もどれる）':jobStartLv(m,j)>1?`Lv${jobStartLv(m,j)}から つづき（上限 ${J.cap}）`:`Lv上限 ${J.cap}`;}
      else if(J.tier===2){label=un?`${J.name}${m.mastered[j]?'★':''}`:`🔒 ${J.name}`;sub=cur?'いまの職業':un?(m.mastered[j]?'極めた':jobStartLv(m,j)>1?`Lv${jobStartLv(m,j)}から つづき（上限 ${J.cap}）`:`上級職・Lv上限 ${J.cap}`):`条件：${J.req.map(r=>JOBS[r].name+(m.mastered[r]?'★':'')).join('＋')}を 極める`;}
      else{const hf=Object.keys(HINTS).find(f=>HINTS[f].job===j&&G.hints[f]);label=un?`${J.name}`:(hf?`🔒 ${J.name}`:'🔒 ？？？王');sub=un?(cur?'いまの職業':jobStartLv(m,j)>1?`Lv${jobStartLv(m,j)}から つづき（上限 ${J.cap}）`:`超上級職・Lv上限 ${J.cap}`):`ヒント：${superHint(m,j)}`+(hf?`／「${HINTS[hf].text}」`:'');}
      opts.push({label,sub,dis:!un||cur,cls:J.tier===3?'wide':''});keys.push(j);}
    const c=await ask(`${m.name}（いま ${jobName(m.job)} Lv${m.lv}）\nどの職業に 転職する？`,[...opts,{label:'← もどる',cls:'wide sub'}]);
    if(c>=keys.length)return;
    const j=keys[c],J=JOBS[j];
    statPanel(m,j);
    const k=await ask(`${J.name}に 転職する？\n`+(m.mastered[j]?`極めた職業なので Lv${J.cap}のまま。`:jobStartLv(m,j)>1?`前に きたえた Lv${jobStartLv(m,j)}から つづきになる。`:'Lv1から はじまる。')+`\n（いまの ${jobName(m.job)} Lv${m.lv}は おぼえておく。わざは 引き継ぎ枠に 入れられる）`,[{label:'転職する',cls:'wide hi'},{label:'やめる',cls:'wide'}]);
    $('overlay').innerHTML='';
    if(k!==0)continue;
    changeJob(m,j);if(J.tier===3)G.qflag.superJob=true;
    const bl=bestLine(j);if((m.own[bl]||0)>0||m.w===0){m.wl=bl;m.w=m.own[bl]||0;}
    renderParty();save();await jobChangeFx(m,J);
    await talk(`${m.name}は ${J.name}に なった！（Lv${m.lv}）`+(m.wl===bl?`\n（武器を ${weaponLabel(m)}に つけかえた）`:''));
    return;
  }
}
function partySparkleTown(){sparkle(96,100,24,'#7cf0ff',40);}
async function slotMenu(){
  const t=await pickMember('だれの 引き継ぎ枠？',()=>true);if(t<0)return;
  const m=G.party[t];
  while(true){
    const cand=slotCandidates(m).filter(k=>!m.slots.includes(k));
    const slots=m.slots.map(k=>({label:`✖ ${SKILLS[k].name}`,sub:`はずす（${jobName(SKILLS[k].job)}）`,cls:'',k,rm:true}));
    const adds=cand.map(k=>({label:`＋ ${SKILLS[k].name}`,sub:`${jobName(SKILLS[k].job)}：${skillDesc(SKILLS[k])}`,cls:'wide',dis:m.slots.length>=SLOT_MAX,k}));
    const view={label:`📖 いまの職業（${jobName(m.job)}）の わざを 見る`,cls:'wide',view:true};
    const all=[view,...slots,...adds];
    const c=await ask(`${m.name}の 引き継ぎ枠 ${'■'.repeat(m.slots.length)}${'□'.repeat(SLOT_MAX-m.slots.length)}（${m.slots.length}/${SLOT_MAX}）\nいまの職業の わざは 枠を 使わない。`+(cand.length?'':'\n（ほかの職業を 学ぶと、入れられる わざが ふえる）'),[...all,{label:'← もどる',cls:'wide sub'}]);
    if(c>=all.length){save();return;}
    const it=all[c];if(it.view){await jobSkillView(m);continue;}
    if(it.rm)m.slots=m.slots.filter(k=>k!==it.k);else setSlots(m,[...m.slots,it.k]);
    renderParty();
  }
}
// いまの職業の わざ（覚えたもの と これから覚えるもの）。引き継ぎ枠を えらぶときの 参考に
async function jobSkillView(m){
  const J=JOBS[m.job],have=new Set(jobSkills(m));
  const ks=Object.keys(SKILLS).filter(k=>SKILLS[k].job===m.job).sort((a,b)=>(SKILLS[a].master?99:SKILLS[a].lv)-(SKILLS[b].master?99:SKILLS[b].lv));
  const rows=ks.map(k=>{const S=SKILLS[k],h=have.has(k);
    return {label:(h?'':'🔒 ')+S.name+(S.mp?`  MP${S.mp}`:''),sub:(h?'':S.master?'きわめると おぼえる：':`Lv${S.lv}で おぼえる：`)+skillDesc(S),dis:!h,cls:'wide'};});
  while(true){const c=await ask(`${m.name}（${J.name} Lv${m.lv}）の わざ\n（引き継ぎ枠を 使わずに 使える）`,[...rows,{label:'← もどる',cls:'wide sub'}]);if(c>=rows.length)return;}
}
// ---------- 名前を かえる（ゲームの 画面の 中で 入力する） ----------
const NAME_MAX=6;
function cleanName(v,fb){const t=Array.from(String(v||'').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g,'').trim()).slice(0,NAME_MAX).join('');return t||fb;}
function nameEditor(first){return new Promise(res=>{
  advance=null;partyPick=null;
  setMsg(`名前を 入れてね（1〜${NAME_MAX}文字）。\n空っぽに すると ${first?'はじめの':'いまの'} 名前の ままに なるよ。`);
  const c=$('cmd');c.className='';cmdList=[];
  c.innerHTML=G.party.map((m,i)=>`<label class="nmrow"><span>${esc(jobName(m.job))}の 子</span><input id="nm${i}" type="text" maxlength="${NAME_MAX*2}" value="${esc(m.name)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="${i<2?'next':'done'}"></label>`).join('')
    +`<button class="wide hi" id="nmok">✔ これで けってい</button>`+(first?`<button class="wide sub" id="nmdef">デフォルトの 名前に もどす</button>`:`<button class="wide sub" id="nmno">← やめる</button>`);
  const ins=G.party.map((m,i)=>$('nm'+i));
  const done=ok=>{if(ok){G.party.forEach((m,i)=>{m.name=cleanName(ins[i].value,m.name);});snd('quest');}renderParty();save();ins.forEach(x=>x.blur());res(ok);};
  ins.forEach((x,i)=>{x.addEventListener('input',()=>{const a=Array.from(x.value);if(a.length>NAME_MAX)x.value=a.slice(0,NAME_MAX).join('');});
    x.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();if(i<2)ins[i+1].focus();else done(true);}});});
  $('nmok').onclick=()=>done(true);
  if(first)$('nmdef').onclick=()=>{ins.forEach((x,i)=>x.value=DEFAULT_NAMES[i]);snd('tap');};
  else $('nmno').onclick=()=>done(false);
});}

// ---------- party menu ----------
async function partyMenu(back){
  const healer=G.party.some(m=>m.hp>0&&skillsOf(m).some(k=>['heal','revive','cure','cureAll','mpheal'].includes(SKILLS[k].kind)));
  const c=await ask('なにを しますか？',[{label:'📊 つよさを見る',cls:''},{label:'🎒 どうぐを使う',cls:''},{label:'💚 回復の とくぎ',cls:'',dis:!healer},{label:'🗡 武器の つけかえ',cls:''},{label:'✏️ 名前を かえる',cls:''},{label:'← もどる',cls:'sub'}]);
  if(c===0){for(const m of G.party){const d=derived(m),J=JOBS[m.job];
      await talk(`${m.name}（${J.name}${m.mastered[m.job]?'★':''}）Lv${m.lv}  次まで ${m.lv>=J.cap?'-':expNext(m.job,m.lv)-m.exp}\nHP ${m.hp}/${d.maxhp}  MP ${m.mp}/${d.maxmp}${m.poison?'  【どく】':''}\nこうげき${d.atk} ぼうぎょ${d.def} まりょく${d.mag} すばやさ${d.spd}\n${weaponLabel(m)} ／ ${ARMORS[m.a][0]}`+(m.charm?` ／ ${CHARMS[m.charm].name}`:''));
      const own=jobSkills(m).map(k=>SKILLS[k].name),sl=m.slots.map(k=>SKILLS[k].name);
      await talk(`【${m.name}の わざ】\n${J.name}：${own.join('・')||'なし'}\n引き継ぎ：${sl.join('・')||'なし'}`);}
    return partyMenu(back);}
  if(c===1){await fieldItemMenu();return partyMenu(back);}
  if(c===2){await fieldSkillMenu();return partyMenu(back);}
  if(c===3){await weaponSwap();return partyMenu(back);}
  if(c===4){await nameEditor(false);return partyMenu(back);}
  back();
}
function pickMember(text,filter){return new Promise(res=>{partyPick={ok:i=>filter(G.party[i]),cb:i=>{renderParty();res(i);}};renderParty();setMsg(text+'\n↓ 仲間の カードを おしてね');setCmds([{label:'← もどる',cls:'wide sub',fn:()=>{partyPick=null;renderParty();res(-1);}}]);});}
async function weaponSwap(){
  const t=await pickMember('だれの 武器を つけかえる？',()=>true);if(t<0)return;const m=G.party[t];
  const ls=['claw','staff','flute'].filter(l=>(m.own[l]||0)>0||l===m.wl);
  const c=await ask(`${m.name}の 武器（いま ${weaponLabel(m)}）`,[...ls.map(l=>({label:`${WEAPON_LINES[l].names[m.own[l]||0]}（${WEAPON_LINES[l].name}）`,sub:l===bestLine(m.job)?'いまの職業に おすすめ':'',cls:'wide',dis:l===m.wl})),{label:'← もどる',cls:'wide sub'}]);
  if(c<ls.length){m.wl=ls[c];m.w=m.own[ls[c]]||0;save();renderParty();}
}
async function fieldItemMenu(){
  while(true){
    const ids=Object.keys(ITEMS).filter(id=>G.inv[id]>0);
    if(!ids.length){await talk('どうぐを なにも 持っていない。');return;}
    const c=await ask('どの どうぐを 使う？',[...ids.map(id=>({label:`${ITEMS[id].name} ×${G.inv[id]}`,sub:ITEM_DESC[id],cls:''})),{label:'← もどる',cls:'wide sub'}]);
    if(c>=ids.length)return;
    const id=ids[c],it=ITEMS[id];
    if(it.lure){if(mode!=='field'||!F){await talk('ダンジョンの 中で 使おう。');continue;}
      G.inv[id]--;G.lure=(G.lure||0)+it.lure;G.lureEnd=0;snd('heal');save();
      await talk(`${it.name}を まいた。\nアリの においに さそわれて、ハリモグラが よってきそうだ！（のこり 戦闘${G.lure}回ぶん）`);continue;}
    const t=await pickMember(`${it.name}を だれに 使う？`,m=>it.revive?m.hp<=0:it.cure?m.hp>0&&m.poison:m.hp>0);if(t<0)continue;
    const m=G.party[t],d=derived(m);G.inv[id]--;
    if(it.cure){m.poison=false;snd('heal');renderParty();await talk(`${m.name}の どくが きえた！`);}
    else if(it.revive){m.hp=Math.ceil(d.maxhp/2);m.poison=false;snd('heal');renderParty();await talk(`${m.name}は 目を さました！`);}
    else if(it.heal){const a=Math.min(it.heal,d.maxhp-m.hp);m.hp+=a;snd('heal');renderParty();await talk(`${m.name}の HPが ${a} かいふくした！`);}
    else if(it.mp){const a=Math.min(it.mp,d.maxmp-m.mp);m.mp+=a;snd('heal');renderParty();await talk(`${m.name}の MPが ${a} かいふくした！`);}
    renderParty();save();
  }
}
async function fieldSkillMenu(){
  while(true){
    const FK=['heal','revive','cure','cureAll','mpheal'];
    const users=G.party.filter(m=>m.hp>0&&skillsOf(m).some(k=>FK.includes(SKILLS[k].kind)));if(!users.length)return;
    const opts=[];for(const p of users)for(const k of skillsOf(p).filter(k=>FK.includes(SKILLS[k].kind)))opts.push([p,k]);
    const c=await ask('どの とくぎを 使う？',[...opts.map(([p,k])=>({label:`${p.name}：${SKILLS[k].name}  MP${SKILLS[k].mp}`,sub:skillDesc(SKILLS[k]),dis:p.mp<SKILLS[k].mp,cls:'wide'})),{label:'← もどる',cls:'wide sub'}]);
    if(c>=opts.length)return;
    const [p,key]=opts[c],S=SKILLS[key];let ts=[];
    if(S.tgt==='ally'){const t=await pickMember(S.kind==='cure'?'だれを なおす？':'だれを 回復する？',m=>m.hp>0);if(t<0)continue;ts=[t];}
    else if(S.tgt==='dead'){const t=await pickMember('だれを おこす？',m=>m.hp<=0);if(t<0)continue;ts=[t];}
    else ts=G.party.map((m,i)=>i).filter(i=>G.party[i].hp>0);
    p.mp-=S.mp;snd('heal');const out=[],d=derived(p);
    for(const t of ts){const m=G.party[t],md=derived(m);
      if(S.kind==='revive'){m.hp=Math.ceil(md.maxhp/2);out.push(`${m.name}は 目を さました！`);}
      else if(S.kind==='cure'||S.kind==='cureAll'){m.poison=false;out.push(`${m.name}の どくが きえた！`);}
      else if(S.kind==='mpheal'){if(m===p)continue;const a=Math.min(S.amt,md.maxmp-m.mp);m.mp+=a;out.push(`${m.name}の MPが ${a} かいふくした！`);}
      else{const a=Math.min(Math.round((S.base+d.mag*S.k)*(1+(d.p.healPow||0))*(.9+R()*.2)),md.maxhp-m.hp);m.hp+=a;out.push(`${m.name}の HPが ${a} かいふくした！`);}}
    renderParty();save();await talk(`${p.name}は ${S.name}を つかった！\n`+out.join('\n'));
  }
}
function dexKeys(){return Object.keys(DEX);}
function dexLook(k){if(k==='dropbear')return SECRET_BOSS.look;if(ANIMALS[k])return {spr:ANIMALS[k].spr,pal:ANIMALS[k].pal,s:ANIMALS[k].s||1};const f=+k.replace(/\D/g,'');return k.startsWith('boss')?bossFor(f)[0].look:guardianFor(f)[0].look;}
function dexName(k){if(k==='dropbear')return SECRET_BOSS.name;if(ANIMALS[k])return ANIMALS[k].name;const f=+k.replace(/\D/g,'');return k.startsWith('boss')?BOSS_DEF[f].name:GUARDIANS[f].name;}
function dex(){
  mode='dex';const ids=dexKeys();const seen=ids.filter(id=>G.seen[id]).length;
  setMsg(`ずかん（${seen}/${ids.length}）\n会ったことのある 生き物を しらべられるよ。`);
  setCmds([...ids.map(id=>({label:G.seen[id]?dexName(id):'？？？',dis:!G.seen[id],fn:()=>{dexSel=dexLook(id);
    const w=ANIMALS[id]&&ANIMALS[id].weak?ANIMALS[id].weak:[];
    setMsg(`${dexName(id)}\n${DEX[id]}`+(w.length?`\n弱点：${w.map(x=>EL_ICON[x]+EL_NAME[x]).join(' ')}`:''));}})),{label:'← もどる',fn:townMenu,cls:'wide sub'}]);
}

// ---------- dungeon ----------
async function pickFloor(){
  const max=Math.min(STAGE_MAX,Math.max(1,G.reached||1));
  const list=[{label:`⬇ いちばん深い B${max}から`,fn:()=>startFloor(max),cls:'wide hi'}];
  for(let f=1;f<=max;f++){if(f%10===1)list.push({label:`${AREA_NAME[areaOf(f)]}（B${f}〜）`,cls:'wide sec',dis:true,fn:()=>{}});
    list.push({label:`${f}`+(f%5===0?(G.bossDown[f]?'✔':'👑'):'')+(GUARDIANS[f]&&!G.guardDown[f]?'✨':''),cls:'flr a'+areaOf(f),fn:()=>startFloor(f)});}
  list.push({label:'← もどる',fn:townMenu,cls:'wide sub'});
  setMsg('どの階から もぐる？（数字は 地下の 階）\n（👑ぬしが いる　✨光る宝箱が ある）');setCmds(list,null,'five');
}
function buildFloor(f){const fl=genFloor(f);const d=G.dug[f]||[],z=G.az[f]||[];
  for(const i of d){const x=i%fl.W,y=Math.floor(i/fl.W);if(fl.m[y][x]==='%')fl.m[y][x]='.';}
  for(const i of z){const x=i%fl.W,y=Math.floor(i/fl.W);if(fl.m[y][x]==='z')fl.m[y][x]='.';}
  return fl;}
async function startFloor(f){
  if(f>(G.reached||0))G.reached=f;
  F={f,fl:buildFloor(f),px:1,py:1,dir:'down',since:0,moving:null};FFX=[];reveal();playMusic(dungeonTrack(f));banner(AREA_NAME[areaOf(f)],'B'+f,'#efe6d2',1500);
  mode='field';fadeT=now;busy=true;showPad(false);save();
  if(!G.flags.tipField){G.flags.tipField=1;save();
    await talks(['【ダンジョンの ヒント】\n下の 十字キー（パソコンなら 矢印キー）で 歩こう。','歩いていると ときどき 敵が あらわれるよ。\n行き止まりには 宝箱。いちばん奥には 下への 階段が ある。','光っている ロープの マスに もどるか、「メニュー」から いつでも 村へ 帰れるよ。']);}
  await areaIntro(areaOf(f));
  busy=false;fieldIdle();
}
function fieldIdle(){
  if(mode!=='field')return;advance=null;
  updateTop(`B${F.f} ${AREA_NAME[areaOf(F.f)]}`);renderParty();$('fmap').textContent=G.flags.noMap?'🗺 地図 OFF':'🗺 地図';
  let hint=F.fl.boss&&!G.bossDown[F.f]?'この階の 奥に ぬしが いる！':'下への 階段を さがそう';
  if(GUARDIANS[F.f]&&!G.guardDown[F.f])hint+='\nどこかに 番人つきの 光る宝箱が あるらしい';
  if(G.lure>0)hint+=`\n🐜 アリの におい：のこり 戦闘${G.lure}回`;else if(G.lureEnd){G.lureEnd=0;hint+='\n🐜 アリの においが きえた';}
  if(G.flags.dig)hint+='\n（土色の かべは ほれる）';
  setMsg(`B${F.f}  ${AREA_NAME[areaOf(F.f)]}\n${hint}`);
  showPad(true);
}
function tryMove(dir){
  if(mode!=='field'||F.moving||busy)return;
  const [dx,dy]={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[dir];F.dir=dir;
  const nx=F.px+dx,ny=F.py+dy,t=F.fl.m[ny][nx];
  if(t==='#'){if(!F.bumpT||now-F.bumpT>250){snd('bump');F.bumpT=now;}return;}
  if(t==='%'||t==='z'){heldDir=null;digWall(nx,ny,t);return;}
  if(t==='B'&&!G.bossDown[F.f]){heldDir=null;onBoss();return;}
  if(t==='H'&&!G.guardDown[F.f]){heldDir=null;onGuard();return;}
  F.moving={fx:F.px,fy:F.py,t0:now,dur:120};FFX.push({k:'dust',x:F.px*16+8,y:F.py*16+13,dx:-dx*4,t0:now,life:320});F.px=nx;F.py=ny;
  setTimeout(()=>{if(F)F.moving=null;onStep();},120);
}
async function digWall(x,y,t){
  if(!G.flags.dig){if(!F.bumpT||now-F.bumpT>250){snd('bump');F.bumpT=now;}
    if(!G.flags.tipSoft){G.flags.tipSoft=1;busy=true;showPad(false);await talk('土の色の かべだ。やわらかそう…\n（ほりかたを おぼえたら ほれそうだ）');busy=false;fieldIdle();}return;}
  busy=true;showPad(false);
  if(!G.flags.tipDig){G.flags.tipDig=1;const c=await ask('やわらかい かべだ。ほりますか？\n（ほった 道は のこる。あやしい かべは 村に もどると また うまる）',[{label:'⛏ ほる',cls:'wide hi'},'やめておく']);if(c!==0){busy=false;fieldIdle();return;}}
  snd('dig');for(let k=0;k<6;k++)FFX.push({k:'dust',x:x*16+8+(R()-.5)*10,y:y*16+10,dx:(R()-.5)*8,t0:now+k*30,life:420});
  await sleep(220);snd('dig');
  F.fl.m[y][x]='.';const idx=y*F.fl.W+x;
  if(t==='%'){(G.dug[F.f]=G.dug[F.f]||[]).push(idx);}else{(G.az[F.f]=G.az[F.f]||[]).push(idx);}
  reveal();
  const L=digLoot(F.f,t==='z',R);
  if(L){snd('chest');sparkle(x*16+8,y*16+6,14);
    if(L.seed){G.qcount.seed=(G.qcount.seed||0)+1;banner('★ GET ★','ユーカリの種','#ffd36b',1800);await talk(`ほったら「ユーカリの種」が 出てきた！（${G.qcount.seed}/3）`);}
    else if(L.opal){G.qcount.opal=(G.qcount.opal||0)+1;banner('★ GET ★','オパール','#ffb0f0',1800);await talk(`ほったら きらきら光る「オパール」が 出てきた！（${G.qcount.opal}/5）`);}
    else if(L.mat){G.mats[L.mat]=true;banner('★ 素材 ★',MATS[L.mat].name,'#ffd36b',2400);await talk(`ほったら「${MATS[L.mat].name}」が 出てきた！\n（村に 持ちかえると、武器屋に 新しい 装備が ならぶ）`);}
    else if(L.gold){addGold(L.gold);await talk(`ほったら ${L.gold}ウォン 出てきた！`);}
    else if(L.item){const n=addItem(L.item,L.n);await talk(`ほったら ${ITEMS[L.item].name}が ${L.n}こ 出てきた！`+(n<L.n?'（持ちきれない分は おいていった）':''));}}
  save();busy=false;fieldIdle();
}
async function onStep(){
  if(mode!=='field'||!F)return;
  const t=F.fl.m[F.py][F.px];G.steps++;reveal();
  if(G.steps%2===0&&G.party.some(m=>m.poison&&m.hp>1)){G.party.forEach(m=>{if(m.poison&&m.hp>1)m.hp--;});flashT=now-60;renderParty();}
  if(t==='T'&&!G.opened[chestKey(F.px,F.py)]){heldDir=null;busy=true;showPad(false);await openChest();busy=false;fieldIdle();return;}
  if(t==='D'||(t==='B'&&G.bossDown[F.f])){heldDir=null;busy=true;showPad(false);
    if(F.f>=STAGE_MAX){if(G.cleared&&!G.secretDown){await secretIntro();return;}
      await talk('ここが 穴の いちばん 下だ。'+(G.secretDown?'\n天井の 大木の 根は、もう しずかだ。':'')+'\n（ロープの マスか メニューから 村へ もどれる）');busy=false;fieldIdle();return;}
    snd('stairs');await changeFloor(F.f+1);busy=false;return;}
  if(t==='V'){heldDir=null;busy=true;showPad(false);
    if(!G.flags.digDown){if(!G.flags.tipCrack){G.flags.tipCrack=1;await talk('床に ひびが 入っている。\n下へ ほれそうだけど、かたくて まだ ほれない。');}busy=false;fieldIdle();return;}
    const c=await ask('ひびわれた床だ。下へ ほって、B'+(F.f+1)+'へ おりますか？',[{label:'⛏ 下へ ほる',cls:'wide hi'},'やめておく']);
    if(c===0){snd('dig');shakeT=now;for(let k=0;k<14;k++)FFX.push({k:'dust',x:F.px*16+8+(R()-.5)*14,y:F.py*16+12,dx:(R()-.5)*10,t0:now+k*25,life:500});
      await sleep(250);snd('dig');F.irisT=now;await sleep(700);G.qcount.down=(G.qcount.down||0)+1;snd('stairs');F.irisT=0;await changeFloor(F.f+1);busy=false;return;}
    busy=false;fieldIdle();return;}
  if(t==='S'){heldDir=null;busy=true;showPad(false);const c=await ask('ロープを のぼって、村に もどりますか？',['村に もどる','まだ 探検する']);busy=false;if(c===0){leaveDungeon();return;}fieldIdle();return;}
  F.since++;
  if(F.since>4&&R()<1/16){F.since=0;heldDir=null;const lu=G.lure>0;if(lu){G.lure--;if(!G.lure)G.lureEnd=1;}startBattle(rollGroup(F.f,R,lu),{});}
}
async function changeFloor(f){
  if(f>(G.reached||0))G.reached=f;
  F.f=f;F.fl=buildFloor(f);F.px=1;F.py=1;fadeT=now;
  FFX=[];reveal();playMusic(dungeonTrack(f));banner(AREA_NAME[areaOf(f)],'B'+f,'#efe6d2',1400);save();
  F.since=0;await sleep(150);await areaIntro(areaOf(f));fieldIdle();
}
function leaveDungeon(){fadeT=now;enterTown();}
async function openChest(){
  G.opened[chestKey(F.px,F.py)]=1;snd('chest');sparkle(F.px*16+8,F.py*16+6,14);
  const L=chestLoot(F.f,F.px,F.py);
  FFX.push({k:'txt',x:F.px*16+8,y:F.py*16,t0:now,life:1300,col:'#ffe27a',text:L.gold?`+${L.gold}ウォン`:L.item?ITEMS[L.item].name:'ぶき!'});
  if(L.gold){addGold(L.gold);await talk(`宝箱を あけた！\n${L.gold}ウォン 手に入れた！`);}
  else if(L.item){const n=addItem(L.item,L.n);await talk(`宝箱を あけた！\n${ITEMS[L.item].name}を ${L.n}こ 見つけた！`+(n<L.n?`\n（持ちきれない分は おいていった）`:''));}
  else if(L.eq){const m=G.party.find(x=>bestLine(x.job)===L.eq)||G.party[0],nm=WEAPON_LINES[L.eq].names[L.tier];
    if((m.own[L.eq]||0)<L.tier){m.own[L.eq]=L.tier;if(m.wl===L.eq||bestLine(m.job)===L.eq){m.wl=L.eq;m.w=L.tier;}await talk(`宝箱を あけた！\n${nm}を 見つけた！ ${m.name}が 持つことにした。`);}
    else{const p=Math.floor(WEAPON_PRICE[L.tier]/2);addGold(p);await talk(`宝箱を あけた！\n${nm}を 見つけたけど、もっと いいものを 持っているので ${p}ウォンに かえた。`);}}
  renderParty();save();
}
async function onGuard(){
  busy=true;showPad(false);const e=guardianFor(F.f)[0];
  await talk('あやしく 光る 宝箱が ある…！');
  const c=await ask(`宝箱の前に ${e.name}が 立ちはだかった！\n（ぬしより 強いかも。勝てば すごい宝が 手に入る）`,[{label:'⚔ たたかう',cls:'wide hi'},'いまは やめておく']);
  if(c===0){startBattle(guardianFor(F.f),{guard:true,f:F.f});return;}
  busy=false;fieldIdle();
}
async function openGuardChest(f){
  const rw=GUARDIANS[f].reward,tier=Math.min(SHOP_TOP,shopMax(G.shopTier)+2);
  G.guardDown[f]=true;snd('quest');sparkle(F.px*16+8,F.py*16+6,26,'#d8a8ff',40);
  await talk('光る宝箱を あけた！');
  if(rw.armor){const m=G.party.slice().sort((a,b)=>a.a-b.a)[0];m.a=Math.max(m.a,tier);banner('★ GET ★',ARMORS[tier][0],'#d098ff',2200);await talk(`★「${ARMORS[tier][0]}」を 手に入れた！ ★\n${m.name}が そうびした！（ぼうぎょ+${ARMORS[tier][1]}）`);}
  else{const targets=rw.line==='best'?G.party:[G.party.find(m=>bestLine(m.job)===rw.line)||G.party[0]];
    for(const m of targets){const l=rw.line==='best'?bestLine(m.job):rw.line,nm=WEAPON_LINES[l].names[tier];m.own[l]=Math.max(m.own[l]||0,tier);m.wl=l;m.w=m.own[l];
      banner('★ GET ★',nm,'#d098ff',2200);await talk(`★「${nm}」を 手に入れた！ ★\n${m.name}が そうびした！`);}}
  if(HINTS[f]&&!G.hints[f])await getHint(f);
  renderParty();save();
}
async function getHint(f){G.hints[f]=true;snd('quest');banner('★ 石ばん ★','いにしえの 石ばん','#e8d8a0',2000);
  showTablet(f);await talk(`${GUARDIANS[f]?'宝の そば':'ぬしが いた ところ'}に「いにしえの 石ばん」が あった。\n文字が きざまれている…`);
  await talk('（長老の 巣穴で いつでも 読みかえせる。ことばの 意味も 教えてもらえる）');$('overlay').innerHTML='';save();}
async function onBoss(){
  busy=true;showPad(false);const e=bossFor(F.f)[0];
  const c=await ask(`${e.name}が いる！\nたたかいますか？`,[{label:'⚔ たたかう',cls:'wide hi'},'やめておく']);
  if(c===0){await bossIntro(F.f);startBattle(bossFor(F.f),{boss:true,f:F.f});return;}
  busy=false;fieldIdle();
}

// ---------- battle ----------
async function startBattle(enemies,opt){
  busy=true;heldDir=null;showPad(false);
  const snap=JSON.stringify(G),ret=F?{f:F.f,px:F.px,py:F.py,dir:F.dir}:null,init=JSON.stringify(enemies);
  snd('enc');stopMusic();flashT=performance.now();await sleep(110);flashT=performance.now();await sleep(90);wipeT=performance.now();await sleep(520);
  B=newBattle(G,enemies);B.snap=snap;B.init=init;B.opt=opt||{};B.ret=ret;B.ts=opt&&opt.ts!=null?opt.ts:areaOf(F?F.f:1);
  BA={e:B.enemies.map(e=>({flash:-1e9,lunge:-1e9,dead:0,hp:e.hp})),p:G.party.map(()=>({step:0,shake:-1e9})),fx:[],pops:[],enter:performance.now()+150,win:0};
  layoutEnemies();mode='battle';fadeT=performance.now();playMusic((B.boss&&B.opt.f>=STAGE_MAX)||B.opt.secret?'lastboss':B.boss||B.opt.guard||B.opt.raid?'boss':'battle');disp=G.party.map(m=>({hp:m.hp,mp:m.mp,poison:m.poison}));renderParty();updateTop('せんとう');
  B.enemies.forEach(e=>{if(e.id)G.seen[e.id]=1;});
  const names=[...new Set(B.enemies.map(e=>e.name.replace(/ [A-E]$/,'')))];
  const rare=B.enemies.reduce((a,e)=>Math.max(a,e.metal||0),0);
  if(rare>=2)setTimeout(()=>{banner(rare>=3?'★ 大チャンス ★':'チャンス！',names[0],rare>=3?'#ffd36b':'#9af0ff',1900);jingle(rare>=3?'C6 E6 G6 C7 G6 C7':'E6 G6 B6 E7',.07);},350);
  if(B.boss||B.opt.guard||B.opt.raid){setTimeout(()=>{banner(B.boss?'BOSS':B.opt.raid?'コアラ討伐':'番人',B.opt.raid?B.opt.raid.name:names[0],'#ff6a6a',2000);shakeT=performance.now();},350);}
  setMsg(B.boss?`${names[0]}が おそいかかってきた！`:`${names.join('と ')}が あらわれた！`,false,0);setCmds([]);
  await bwait(B.boss||B.opt.guard?1600:1000);
  if(!G.flags.tipBattle){G.flags.tipBattle=1;
    await talks(['【たたかいの ヒント】\n1匹ずつ コマンドを えらぶと、ターンが はじまるよ。','まよったら「🤖 おまかせ」を おそう。\nみんなが いい感じに うごいてくれる。','敵の 名前の横の 🔥❄⚡✨ は「弱点」。\nその まほうを 使うと 大ダメージ！','もし 負けても、たたかいの 前から やりなおせるよ。']);}
  battleLoop();
}
async function battleLoop(){
  while(true){
    disp=G.party.map(m=>({hp:m.hp,mp:m.mp,poison:m.poison}));BA.tstat={};renderParty();
    const cmds=await inputPhase();BA.cmds=cmds;enemyMark=null;partyPick=null;BA.pickE=null;
    renderParty();setCmds([]);
    B.track=true;BA.vs=visState(B);
    const ev=battleTurn(B,cmds,R);
    await playEvents(ev);
    if(B.over){await endBattle();return;}
  }
}
function inputPhase(){return new Promise(res=>{
  const order=aliveParty(B).filter(i=>!(G.party[i].bst&&(G.party[i].bst.sleep>0||G.party[i].bst.stun>0))),cmds=[];let k=0;
  aliveParty(B).forEach(i=>{if(!order.includes(i))cmds[i]={k:'attack',t:aliveEnemies(B)[0]};}); // ねむり・まひの仲間は 行動できない（目がさめたら こうげき）
  const reserved=id=>cmds.filter(c=>c&&c.k==='item'&&c.item===id).length;
  const next=()=>{if(k>=order.length){res(cmds);return;}renderParty(order[k]);menuFor(order[k]);};
  const clearPick=()=>{enemyMark=null;partyPick=null;BA.pickE=null;};
  const choose=c=>{clearPick();cmds[order[k]]=c;k++;next();};
  const back=()=>{clearPick();if(k>0){k--;cmds[order[k]]=null;}next();};
  const auto=()=>{clearPick();for(let j=k;j<order.length;j++)cmds[order[j]]=autoCmd(B,order[j]);k=order.length;next();};
  const enemyBtn=(i,fn)=>{const e=B.enemies[i],w=(e.weak||[]).map(x=>EL_ICON[x]).join('');const hr=e.hp/e.max,bars=Math.max(1,Math.ceil(hr*5));
    const st=Object.keys(e.st).filter(s=>e.st[s]>0).map(s=>ST_NAME[s]).join(' ');
    return {label:`${e.name} ${w}`,sub:'のこり '+'▮'.repeat(bars)+'▯'.repeat(5-bars)+(w?' 弱点'+w:'')+(st?' '+st:'')+(e.charged?' ちからを ためている！':''),fn,hover:on=>{if(enemyMark)enemyMark.focus=on?i:null;}};};
  const pickE=(cb,again,title)=>{const al=aliveEnemies(B);enemyMark={list:al,all:false,focus:null};BA.pickE=i=>cb(i);
    setMsg((title||'どの 敵に？')+'\n（ボタンか、画面の 敵を おしてね）');
    setCmds([...al.map(i=>enemyBtn(i,()=>cb(i))),{label:'← もどる',cls:'wide sub',fn:()=>{clearPick();again();}}]);};
  const pickAllE=(name,cb,again)=>{const al=aliveEnemies(B);enemyMark={list:al,all:true};BA.pickE=()=>cb();
    setMsg(`${name}は 敵ぜんたいに きくよ。\n使って いい？`);
    setCmds([{label:'敵ぜんたいに 使う',cls:'wide hi',fn:()=>cb()},...al.map(i=>enemyBtn(i,()=>cb())),{label:'← もどる',cls:'wide sub',fn:()=>{clearPick();again();}}]);};
  const pickA=(text,filter,cb,again)=>{partyPick={ok:j=>filter(G.party[j],j),cb:j=>cb(j)};renderParty(order[k]);
    setMsg(text+'\n↓ 仲間の カードを おしてね');setCmds([{label:'← もどる',cls:'wide sub',fn:()=>{clearPick();renderParty(order[k]);again();}}]);};
  const pickAllA=(text,cb,again)=>{partyPick={ok:j=>G.party[j].hp>0,cb:()=>cb()};renderParty(order[k]);
    setMsg(text);setCmds([{label:'みんなに 使う',cls:'wide hi',fn:()=>cb()},{label:'← もどる',cls:'wide sub',fn:()=>{clearPick();renderParty(order[k]);again();}}]);};
  const menuFor=i=>{
    const m=G.party[i],again=()=>menuFor(i);
    setMsg(`${m.name}（${jobName(m.job)}）は どうする？`+(m.bst&&m.bst.silence>0?'\n（ふういん中：MPを 使う わざは 使えない）':''));
    setCmds([
      {label:'⚔ たたかう',sub:'ふつうの こうげき',fn:()=>pickE(t=>choose({k:'attack',t}),again,'だれを こうげきする？')},
      {label:'✨ とくぎ',sub:'MPを 使う わざ',fn:()=>skillMenu(i)},
      {label:'🛡 ぼうぎょ',sub:'うける ダメージ 半分',fn:()=>choose({k:'defend'})},
      {label:'🎒 どうぐ',sub:'やくそう など',fn:()=>itemMenu(i)},
      {label:'🤖 おまかせ',sub:k===0?'みんな 自動で うごく':'のこりを 自動で',fn:auto,cls:'hi'},
      {label:'🏃 にげる',sub:B.boss?'ぬしからは にげられない':B.opt.raid?'討伐から にげられない':'たたかいを やめる',dis:B.boss||!!B.opt.raid,fn:()=>{clearPick();const c=[];c[order[0]]={k:'run'};res(c);}},
      ...(k>0?[{label:'← 前の仲間に もどる',fn:back,cls:'wide sub'}]:[]),
    ]);
  };
  const skillMenu=i=>{
    const m=G.party[i],again=()=>skillMenu(i),ks=skillsOf(m).filter(k=>SKILLS[k].kind!=='passive');
    const sil=m.bst&&m.bst.silence>0;
    setMsg(`${m.name}の とくぎ（MP ${m.mp}）`+(m.kiai?`  きあい${m.kiai}`:''));
    setCmds([...ks.map(key=>{const S=SKILLS[key];const noDead=S.tgt==='dead'&&!G.party.some(x=>x.hp<=0);
      const needK=(S.kiaiCost&&(m.kiai||0)<S.kiaiCost)||(S.kind==='extend'&&S.kiai&&!(m.kiai>0));
      let sub=skillDesc(S);if(S.kind==='status'){const ps=[...new Set(aliveEnemies(B).map(j=>Math.round(statusChance(B,m,S,B.enemies[j])*100)))].sort((a,b)=>a-b);if(ps.length)sub+=`\nいまの 敵に かかる 確率：${ps.length>1?ps[0]+'〜'+ps[ps.length-1]:ps[0]}%`;}
      return {label:`${S.name}  MP${S.mp||0}`,sub,dis:m.mp<(S.mp||0)||noDead||needK||(sil&&(S.mp||0)>0),fn:()=>{
        if(S.tgt==='enemy')pickE(t=>choose({k:'skill',s:key,t}),again,`${S.name}を どの 敵に？`);
        else if(S.tgt==='enemies')pickAllE(S.name,()=>choose({k:'skill',s:key}),again);
        else if(S.tgt==='allies')pickAllA(`${S.name}を みんなに 使う？`,()=>choose({k:'skill',s:key}),again);
        else if(S.tgt==='ally')pickA(`${S.name}を だれに？`,x=>x.hp>0,t=>choose({k:'skill',s:key,t}),again);
        else if(S.tgt==='dead')pickA(`${S.name}を だれに？`,x=>x.hp<=0,t=>choose({k:'skill',s:key,t}),again);
        else choose({k:'skill',s:key});}};}),{label:'← もどる',cls:'wide sub',fn:()=>menuFor(i)}]);
  };
  const itemMenu=i=>{
    const again=()=>itemMenu(i),ids=Object.keys(ITEMS).filter(id=>!ITEMS[id].field&&(G.inv[id]||0)-reserved(id)>0);
    if(!ids.length){setMsg('どうぐを 持っていない。');setCmds([{label:'← もどる',cls:'wide sub',fn:()=>menuFor(i)}]);return;}
    setMsg('どの どうぐを 使う？');
    setCmds([...ids.map(id=>{const it=ITEMS[id];return {label:`${it.name} ×${G.inv[id]-reserved(id)}`,sub:ITEM_DESC[id],fn:()=>{
      if(it.cure)pickA(`${it.name}を だれに？`,x=>x.hp>0&&x.poison,t=>choose({k:'item',item:id,t}),again);
      else if(it.revive)pickA(`${it.name}を だれに？`,x=>x.hp<=0,t=>choose({k:'item',item:id,t}),again);
      else pickA(`${it.name}を だれに？`,x=>x.hp>0,t=>choose({k:'item',item:id,t}),again);}};}),{label:'← もどる',cls:'wide sub',fn:()=>menuFor(i)}]);
  };
  next();
});}
function fxKindOf(S){if(!S)return null;
  if(S.kind==='mag')return S.el==='best'?'light':S.el||'boom';
  if(['heal','cure','cureAll','revive','mark','mpheal'].includes(S.kind))return 'heal';
  if(['buff','extend','cheer'].includes(S.kind))return 'buff';
  if(S.kind==='status')return S.st==='sleep'?'sleep':'bad';
  if(['phys','finisher'].includes(S.kind))return S.el||'slash';
  return null;}
async function playEvents(ev){
  let lines=[];const say=t=>{lines.push(t);if(lines.length>3)lines=lines.slice(-3);const pre=lines.slice(0,-1).join('\n');setMsg(lines.join('\n'),false,pre?[...pre].length+1:0);};
  for(let n=0;n<ev.length;n++){const e=ev[n];
    // 仲間カードの状態は、その出来事の時点のものを出す。行動（act）は、文が出て 一呼吸おいてから
    const applyVs=()=>{if(!e.vs)return;const ch=JSON.stringify(e.vs)!==JSON.stringify(BA.vs);BA.vs=e.vs;if(ch)renderParty();};
    if(e.t!=='act')applyVs();
    switch(e.t){
      case 'act':{lines=[];say(e.text);
        if(e.side==='p'){BA.p[e.i].step=1;const c=BA.cmds&&BA.cmds[e.i];if(c&&c.k==='defend')BA.tstat[e.i]='ぼうぎょ';if(e.s&&SKILLS[e.s].kind==='guard')BA.tstat[e.i]='かばう';disp[e.i].mp=G.party[e.i].mp;renderParty(e.i);}else if(BA.e[e.i])BA.e[e.i].lunge=now;
        // 技の演出：つぎの「act」までに当たった相手に
        const S=e.s?SKILLS[e.s]:null,kind=fxKindOf(S);
        if(kind){const pts=[];for(let j=n+1;j<ev.length&&ev[j].t!=='act';j++){const x=ev[j];if((x.t==='hit'||x.t==='heal'||x.t==='status'||x.t==='revive')&&x.i!=null){const side=x.side||'p';pts.push(side==='e'?enemyCenter(x.i):partyCenter(x.i));}}
          if(!pts.length&&S&&S.kind==='buff')G.party.forEach((m,j)=>{if(m.hp>0)pts.push(partyCenter(j));});
          await bwait(250);spawnFx(kind,pts.slice(0,4));if(kind!=='slash')snd(kind==='heal'?'heal':'magic');}
        await bwait(400);if(e.side==='p')BA.p[e.i].step=0;applyVs();break;}
      case 'msg':say(e.text);await bwait(420);break;
      case 'hit':
        if(e.side==='e'){if(BA.e[e.i]){BA.e[e.i].flash=now;BA.e[e.i].hp=e.hp;}pop(enemyCenter(e.i),e.dmg,e.weak?'#ffe060':'#ffffff',e.weak||e.crit);snd('hit');if(e.weak||e.crit)shakeT=now;}
        else{disp[e.i].hp=e.hp;BA.p[e.i].shake=now;shakeT=now;pop(partyCenter(e.i),e.dmg,e.poison?'#c98bff':e.magic?'#9ad0ff':'#ff8a8a');snd('phit');renderParty(undefined,e.i);}
        if(e.text)say(e.text);await bwait(e.poison?300:460);break;
      case 'heal':
        if(e.side==='p'){disp[e.i].hp=e.hp;renderParty();pop(partyCenter(e.i),e.amt,'#8aff9a');}else{if(BA.e[e.i])BA.e[e.i].hp=B.enemies[e.i].hp;pop(enemyCenter(e.i),e.amt,'#8aff9a');}
        if(e.text)say(e.text);await bwait(420);break;
      case 'status':if(e.side==='p'&&e.st==='poison')disp[e.i].poison=true;say(e.text);renderParty();await bwait(420);break;
      case 'buff':renderParty();break;
      case 'sync':{let ch=false;e.p.forEach((x,i)=>{const o=disp[i];if(!o)return;
          if(x.mp>o.mp&&x.hp>0)pop(partyCenter(i),'MP+'+(x.mp-o.mp),'#8ac8ff');
          else if(x.hp>o.hp&&o.hp>0)pop(partyCenter(i),x.hp-o.hp,'#8aff9a');
          if(o.hp!==x.hp||o.mp!==x.mp||o.poison!==x.poison){o.hp=x.hp;o.mp=x.mp;o.poison=x.poison;ch=true;}});
        if(ch)renderParty();break;}
      case 'die':if(e.side==='e'){if(BA.e[e.i])BA.e[e.i].dead=now;scatter(e.i);snd('die');if(e.fled)say(`${B.enemies[e.i].name}は にげだした！`);}else{disp[e.i].hp=0;disp[e.i].poison=false;renderParty();}await bwait(260);break;
      case 'revive':disp[e.i].hp=e.hp;disp[e.i].poison=false;partySparkle(e.i,'#8aff9a');renderParty();if(e.text)say(e.text);await bwait(450);break;
      case 'add':if(BA.e[e.i]){BA.e[e.i].dead=0;BA.e[e.i].hp=B.enemies[e.i].hp;BA.e[e.i].show=null;BA.e[e.i].trail=null;}else BA.e.push({flash:-1e9,lunge:-1e9,dead:0,hp:B.enemies[e.i].hp});
        layoutEnemies();if(B.enemies[e.i].id)G.seen[B.enemies[e.i].id]=1;say(e.text||`${B.enemies[e.i].name}が あらわれた！`);await bwait(500);break;
    }
  }
  BA.vs=null;disp=G.party.map(m=>({hp:m.hp,mp:m.mp,poison:m.poison}));renderParty();
}
async function endBattle(){
  disp=null;renderParty();
  if(B.over==='win'||B.over==='fled'){
    if(B.enemies.some(e=>e.id==='devil'&&e.hp<=0&&!e.fled&&e.st.poison>0))G.qflag.devilPoison=true;
    if(B.enemies.some(e=>e.id==='archer'&&e.hp<=0&&!e.fled&&e.st.sleep>0))G.qflag.archerSleep=true;
    if(B.opt.raid){await raidWin(B.opt.raid);return;}
    const rw=battleRewards(B);
    if(B.over==='fled'&&!rw.exp){await talk('敵は みんな にげてしまった…');backToField();return;}
    stopMusic();jingle('C5 E5 G5 C6 - G5 C6 - -',.1);BA.win=now;G.battles++;
    const rareK=B.enemies.reduce((a,e)=>e.hp<=0&&!e.fled?Math.max(a,e.metal||0):a,0);
    if(rareK>=2&&!(B.opt.boss||B.opt.guard)){flashT=performance.now();banner(rareK>=3?'★ 大当たり ★':'当たり！',B.enemies.find(e=>e.metal===rareK).name.replace(/ [A-E]$/,'')+'を たおした','#ffd36b',2200);await sleep(900);}
    if(B.opt.boss||B.opt.guard){flashT=performance.now();shakeT=performance.now();banner('VICTORY!',B.enemies[0].name.replace(/ [A-E]$/,'')+'を たおした','#ffd36b',2200);await sleep(900);}
    {const vet=G.party.filter(m=>m.hp>0&&vetBonus(m)&&m.lv<JOBS[m.job].cap).map(m=>m.name);
    await talk(`敵を やっつけた！\n${rw.exp}の けいけんちを 手に入れた！`+(rw.gold?`\n${rw.gold}ウォンを ひろった！`:'')+(vet.length?`\n（経験者ボーナス ×${VET_MUL}：${vet.join('・')}）`:''));}
    addGold(rw.gold);
    if(partyHas('itemFind')&&!B.opt.boss&&R()<.25){const f=F?F.f:1,it=f<10?'herb':f<30?'herb2':R()<.5?'herb3':'water2';if(addItem(it,1))await talk(`ほりあての かんで、${ITEMS[it].name}を 見つけた！`);}
    for(const m of G.party){if(m.hp<=0)continue;const ms=gainExp(m,rw.exp),mi=G.party.indexOf(m);
      for(const s of ms){if(s.includes('レベル')){jingle('G5 C6 E6 G6',.08);banner('LEVEL UP!',`${m.name}  Lv${(s.match(/レベル(\d+)/)||[0,m.lv])[1]}`,'#7cf0ff',1700);partySparkle(mi);}
        else if(s.includes('転職できる')){const sup=/王に 転職/.test(s);jingle(sup?'C5 E5 G5 C6 E6 G6 C7':'E5 G5 C6 E6',.08);banner(sup?'★ 超上級職 解放 ★':'解放！',s.replace(/^.*は /,'').replace('に 転職できるように なった！',''),sup?'#ffd36b':'#7cf0ff',2200);partySparkle(mi,sup?'#ffd36b':'#7cf0ff');}
        else if(s.includes('きわめた')){jingle('C5 E5 G5 C6 E6',.09);banner('きわめた！',`${m.name}  ${jobName(m.job)}`,'#ffd36b',2000);partySparkle(mi,'#ffd36b');}else snd('lvl');renderParty();await talk(s);}}
    if(G.party.some(m=>m.hp<=0))await talk('（たおれていた 仲間には けいけんちが 入らない）');
    renderParty();
    if(B.opt.secret){G.secretDown=true;save();await secretDown();return;}
    if(B.opt.boss){G.bossDown[B.opt.f]=true;save();await bossDown(B.opt.f);return;}
    if(B.opt.guard){B=null;BA=null;mode='field';fadeT=now;playMusic(dungeonTrack(F.f));await openGuardChest(F.f);backToField();return;}
    save();backToField();return;
  }
  if(B.over==='run'){backToField();return;}
  stopMusic();snd('die');
  await talk('ウォンバットたちは ちからつきて しまった…');
  const c=await ask('どうする？\n（どちらを えらんでも、なにも 失わないよ）',[{label:'↻ たたかいの 前から やりなおす',cls:'wide hi'},'🏠 村に もどる（HPは 全回復）']);
  const init=JSON.parse(B.init),opt=B.opt,ret=B.ret;G=JSON.parse(B.snap);
  if(c===0){if(ret){F.f=ret.f;F.fl=buildFloor(ret.f);F.px=ret.px;F.py=ret.py;}startBattle(init,opt);return;}
  G.party.forEach(m=>{const d=derived(m);m.hp=d.maxhp;m.mp=d.maxmp;m.poison=false;});fadeT=now;enterTown();
}
function backToField(){B=null;BA=null;disp=null;mode='field';fadeT=now;busy=false;renderParty();playMusic(dungeonTrack(F.f));fieldIdle();}
// ---------- コアラ討伐（STAGE3.md の8d） ----------
const RAID_NEWS={
  r1:['長老「たいへんじゃ。村はずれに コアラが 出るように なった」','長老「穴の 奥から 出てきたのかのう。畑の ユーカリを ねらって、3匹で うろついておる」','長老「むりにとは 言わんが、追いかえしてくれると たすかる」\n（村の「🐨 コアラ討伐」から 挑めるよ。しなくても 先へ すすめる 寄り道だよ）'],
  r2:['長老「こんどは 畑に コアラが 出た。歌ったり、毒を まいたり、やっかいな 連中じゃ」'],
  r3:['長老「井戸の そばに、かたい コアラたちが いすわってしまった。水が くめんで こまっておる」'],
  r4:['長老「森で まいごが ふえておる。どうも コアラたちが 森を まどわしているらしい」'],
  r5:['長老「夜に なると、冠を つけた コアラが 村の まわりを うろつくそうじゃ…」'],
  r6:['長老「穴の 底の ぬしが いなくなって、コアラの 王たちが いっせいに 村へ やってきた！ これが さいごの 討伐じゃ」'],
};
async function raidNews(){for(const R of RAIDS){if(!raidUnlocked(G,R)||G.raidNews[R.id])continue;G.raidNews[R.id]=1;save();banner('依頼','コアラ討伐：'+R.name,'#ffb070',2000);snd('quest');await talks(RAID_NEWS[R.id]);}}
function raidMenu(){
  const list=RAIDS.map(R=>{const un=raidUnlocked(G,R),n=G.raids[R.id]||0;
    return {label:(un?(n?'✔ ':'🐨 '):'🔒 ')+(un?R.name:'？？？'),sub:un?(n?`追いかえした（${n}回）・もう一度 たたかえる`:'はじめて 勝つと 大きな ごほうび'):(R.unlock==='clear'?'穴の 底の ぬしを たおすと':`B${R.unlock}の ぬしを たおすと`),dis:!un,cls:'wide',fn:()=>raidDetail(R)};});
  setMsg('コアラ討伐の 依頼\n村の 近くに 出る コアラを 追いかえそう。3匹 そろって 連携してくるよ。');
  setCmds([...list,{label:'← もどる',fn:townMenu,cls:'wide sub'}]);
}
async function raidDetail(R){
  const first=!G.raids[R.id],rw=raidReward(R,first);
  const c=await ask(`【${R.name}】\n${R.hint}`,[{label:'⚔ 討伐に 行く',sub:`ごほうび：けいけんち ${rw.exp}・${rw.gold}ウォン${first?(R.id==='r6'?'・称号':'・とくべつな 武器'):''}`,cls:'wide hi'},{label:'← もどる',cls:'wide sub'}]);
  if(c!==0){raidMenu();return;}
  const p=await ask('村の 宿屋で 休んでから 行く？\n（HPと MPが 全回復する。お金は かからない）',[{label:'休んでから 行く',cls:'wide hi'},{label:'このまま 行く',cls:'wide'}]);
  if(p===0)G.party.forEach(m=>{const d=derived(m);m.hp=d.maxhp;m.mp=d.maxmp;m.poison=false;});
  F=null;showPad(false);$('overlay').innerHTML='';
  startBattle(raidEnemies(R),{raid:{id:R.id,name:R.name},ts:Math.min(4,Math.floor((R.f-1)/10))});
}
async function raidWin(r){
  const R=RAIDS.find(x=>x.id===r.id),first=!G.raids[R.id],rw=raidReward(R,first);
  G.raids[R.id]=(G.raids[R.id]||0)+1;
  banner(first?'討伐 せいこう！':'討伐 せいこう','コアラたちは 森へ にげていった','#ffd36b',2200);flashT=performance.now();await sleep(800);
  {const vet=G.party.filter(m=>m.hp>0&&vetBonus(m)&&m.lv<JOBS[m.job].cap).map(m=>m.name);
  await talk(`コアラたちは 森の 奥へ にげていった！\n${rw.exp}の けいけんちを 手に入れた！\n${rw.gold}ウォンを ひろった！`+(vet.length?`\n（経験者ボーナス ×${VET_MUL}：${vet.join('・')}）`:''));}addGold(rw.gold);
  for(const m of G.party){if(m.hp<=0)continue;const ms=gainExp(m,rw.exp),mi=G.party.indexOf(m);
    for(const s of ms){if(s.includes('レベル')){jingle('G5 C6 E6 G6',.08);banner('LEVEL UP!',`${m.name}  Lv${(s.match(/レベル(\d+)/)||[0,m.lv])[1]}`,'#7cf0ff',1700);partySparkle(mi);}
      else if(s.includes('転職できる')){const sup=/王に 転職/.test(s);jingle(sup?'C5 E5 G5 C6 E6 G6 C7':'E5 G5 C6 E6',.08);banner(sup?'★ 超上級職 解放 ★':'解放！',s.replace(/^.*は /,'').replace('に 転職できるように なった！',''),sup?'#ffd36b':'#7cf0ff',2200);}
      else if(s.includes('きわめた')){jingle('C5 E5 G5 C6 E6',.09);banner('きわめた！',`${m.name}  ${jobName(m.job)}`,'#ffd36b',2000);}renderParty();await talk(s);}}
  if(G.party.some(m=>m.hp<=0))await talk('（たおれていた 仲間には けいけんちが 入らない）');
  if(first){
    if(R.id==='r6'){G.title='村の まもりて';snd('quest');banner('★ 称号 ★','村の まもりて','#ffd36b',2600);await talk('★ コアラの 王たちを すべて 追いかえした！ ★\n長老から「村の まもりて」の 称号を もらった！');}
    else{const tier=Math.min(SHOP_TOP,shopMax(G.shopTier)+2);const m=G.party.slice().sort((a,b)=>(a.own[bestLine(a.job)]||0)-(b.own[bestLine(b.job)]||0))[0],l=bestLine(m.job);
      if((m.own[l]||0)<tier){m.own[l]=tier;m.wl=l;m.w=tier;banner('★ GET ★',WEAPON_LINES[l].names[tier],'#d098ff',2200);await talk(`お礼に、長老から「${WEAPON_LINES[l].names[tier]}」を もらった！\n${m.name}が そうびした！`);}
      else{const g=Math.floor(WEAPON_PRICE[tier]/2);addGold(g);await talk(`お礼に ${g}ウォン もらった！`);}}}
  B=null;BA=null;disp=null;save();fadeT=now;enterTown();
}

// ---------- クリア後の隠しボス（ドロップベア） ----------
async function secretIntro(){
  await talks(['化石の 部屋の 天井に、太い ユーカリの 根が はりめぐらされている。','…根の あいだで、なにかが じっと こちらを 見ている。']);
  const c=await ask('とても 強い 気配だ。たたかいますか？\n（ぜんめつしても、なにも 失わないよ）',[{label:'⚔ たたかう',cls:'wide hi'},'やめておく']);
  if(c!==0){busy=false;fieldIdle();return;}
  stopMusic();await talk('上から なにかが 落ちてきた！');shakeT=now;snd('enc');
  await talk(`それは… 長老の 昔話に 出てくる「ドロップベア」だった！\n${G.parents[0]}たちが むかし たたかったという、あの…！`);
  startBattle(secretBoss(),{boss:true,secret:true,f:STAGE_MAX});
}
async function secretDown(){
  B=null;BA=null;fadeT=now;
  await talks(['ドロップベアは「…まいった」と言うように 両手を あげ、根を つたって 木の上へ かえっていった。',
    `${G.party[0].name}「いまのって、ほんとうに いたんだ…」`,`${G.party[1].name}「ううん、${G.parents[1]}さんたちの 話を、だれかが まねしてたのかも」`,`${G.party[2].name}「どっちでも いいや。いい しょうぶだった！」`]);
  G.gold+=50000;updateTop();banner('★★ 完全クリア ★★','ドロップベアを たおした','#ffd36b',2600);jingle('C5 E5 G5 C6 E6 G6 C7 - G6 C7',.1);sparkle(96,60,40,'#ffd36b',60);
  await talk('★ ドロップベアを たおした！ ★\nお礼の 50000ウォンを 見つけた。\nタイトルに「完全クリア」の しるしが つくよ。');
  save();backToField();
}
async function bossDown(f){
  const p=G.parents;
  const lines={
    5:['ツムギアリの女王は、はっぱの 巣へ 帰っていった。',`村に もどると、${p[1]}が 待っていた。`,`${p[1]}「よく やったわね。ほうびに、穴の ほりかたを 教えてあげる」`,'★ やわらかい かべを ほれるように なった！ ★\n（土の色の かべに 向かって 進むと ほれる）'],
    10:['ディンゴのおやぶんは、群れを つれて 去っていった。',`${p[2]}「りっぱに なったなあ。村に 転職所を ひらこう」`,'★ 転職が できるように なった！ ★\n（村の「転職所」で、職業を かえたり、わざを 引きついだり できる）'],
    15:['コアラのだいまどうしは つえを おとし、ふらふらと 木の 上へ にげていった。'],
    20:['イリエワニのぬしは、しずかに 地下の 水へ もどっていった。','穴の 下の ほうから、水の 音が きこえる…',`（${p[0]}の 声が した気がした）「この先は 水の層。足もとに 気をつけろ」`],
    25:['カモノハシのぬしは、川岸の 巣穴へ もぐっていった。',`村に もどると、${p[1]}が 待っていた。`,`${p[1]}「カモノハシは 川岸に 巣穴を ほるのよ。下へ ほる コツを 教えてあげる」`,'★ ひびわれた床から 下へ ほれるように なった！ ★\n（B21より深い 階の「ひびわれた床」に 乗ると、つぎの 階へ おりられる）'],
    30:['マーレーコッドのおおぬしは、地下の 川の 奥へ 泳いでいった。','水の層を ぬけると、岩が きらきらと 光っている…','長老の 話を 思いだした。「むかし、暑さを さけて 地下に くらした 人びとが いたそうじゃ」'],
    35:['アカカンガルーのチャンピオンは、しっぽで 立ちあがり、ふかく おじぎを した。'],
    40:['オパールのうみりゅうは、ただの 化石に もどった。','むかし ここが 海だったころの 生き物らしい。','さらに 下からは、古い 古い においが する…「太古の層」だ。'],
    45:['フクロライオンのぬしは、やみの 奥へ 消えていった。','いちばん下は もうすぐだ。'],
  }[f]||[`${bossFor(f)[0].name}を たおした！`];
  if(f===5)G.flags.dig=true;
  if(f===10)G.flags.jobChange=true;
  if(f===25)G.flags.digDown=true;
  save();
  if(f>=STAGE_MAX){await ending();return;}
  await talks(lines);
  if(HINTS[f]&&!G.hints[f])await getHint(f);
  if(f===5||f===10||f===25){B=null;BA=null;fadeT=now;enterTown();return;}
  backToField();
}
// ---------- input ----------
const KEYDIR={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};
document.addEventListener('keydown',e=>{
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'))return; // 名前の入力中は ゲームの キー操作を しない
  const dir=KEYDIR[e.key]||KEYDIR[e.key.toLowerCase&&e.key.toLowerCase()];
  if(dir&&mode==='field'){e.preventDefault();if(!busy)heldDir=dir;return;}
  if(e.key==='Enter'||e.key===' '||e.key==='z'||e.key==='Z'){e.preventDefault();if(e.repeat||(inputBlocked()&&!advance))return;
    if(advance)advance();else if(skipFn)skipFn();else if(cmdList.length===1){snd('tap');cmdList[0].fn();}return;}
  if((e.key==='Escape'||e.key==='x'||e.key==='X')&&mode==='field'&&!busy&&!F.moving){openFieldMenu();return;}
  if(/^[1-9]$/.test(e.key)){if(e.repeat||inputBlocked())return;const it=cmdList[+e.key-1];if(it){snd('tap');it.fn();}}
});
document.addEventListener('keyup',e=>{const dir=KEYDIR[e.key]||KEYDIR[e.key.toLowerCase&&e.key.toLowerCase()];if(dir&&heldDir===dir)heldDir=null;});
window.addEventListener('blur',()=>heldDir=null);
document.querySelectorAll('#dpad button').forEach(b=>{
  const d=b.dataset.d;
  b.addEventListener('pointerdown',e=>{e.preventDefault();padHeld=true;if(busy)return;heldDir=d;b.classList.add('on');try{b.setPointerCapture(e.pointerId);}catch(_){}tryMove(d);});
  const up=()=>{if(heldDir===d)heldDir=null;b.classList.remove('on');if(padHeld){padHeld=false;inputGuardUntil=Math.max(inputGuardUntil,performance.now()+250);}};
  b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',up);
  b.addEventListener('contextmenu',e=>e.preventDefault());
});
async function openFieldMenu(){
  if(busy||!F||F.moving)return;heldDir=null;busy=true;showPad(false);
  const c=await ask('メニュー',[{label:'📊 つよさ・どうぐ',cls:''},{label:'🏠 村に もどる',cls:''},{label:'← とじる',cls:'wide sub'}]);
  if(c===0){await new Promise(res=>partyMenu(res));}
  if(c===1){const k=await ask('穴を 出て、村に もどりますか？\n（あけた宝箱や ほった道は そのまま）',['村に もどる','やめる']);if(k===0){busy=false;leaveDungeon();return;}}
  busy=false;fieldIdle();
}
$('fmenu').onclick=()=>{snd('tap');openFieldMenu();};
$('fmap').onclick=()=>{if(!G)return;snd('tap');G.flags.noMap=!G.flags.noMap;$('fmap').textContent=G.flags.noMap?'🗺 地図 OFF':'🗺 地図';save();};

// ===================== 演出（続編で足したもの） =====================
// ---------- エリアに はじめて 入ったとき ----------
const AREA_INFO=[
  {sub:'ウォンバットの 巣穴のような、土の 迷路',col:'#e8b880',jg:'C5 G5 C6'},
  {sub:'ユーカリの 根が はりめぐらされた 層',col:'#b0d878',jg:'D5 A5 D6'},
  {sub:'地下の 川が ながれる、青い どうくつ',col:'#7cd0f0',jg:'E5 B5 E6 G6'},
  {sub:'むかし 海だった 地面が、宝石を はぐくんだ 層',col:'#e0b0ff',jg:'F5 A5 C6 E6'},
  {sub:'大むかしの 生き物たちが ねむる、いちばん深い 層',col:'#f0d890',jg:'C5 D#5 G5 C6'},
];
const AREA_TEXT=[
  ['穴の 中は ひんやりしている。','どこかで、土の くずれる 音が した。'],
  ['天井から、太い ユーカリの 根が たれさがっている。','根の あいだを、見たことのない 生き物が 走りぬけた。'],
  ['ぴちょん、ぴちょん… 水の しずくが 落ちる。','足もとを、すんだ 地下の 川が ながれている。'],
  ['かべの あちこちが、にじいろに 光っている。オパールだ！','暑い 地上を さけて、地下に くらした 人びとの 話を 思いだした。'],
  ['空気が 重い。古い 古い においが する。','かべに うまった 大きな 骨が、こちらを 見ているようだ…'],
];
async function areaIntro(a){
  G.areaSeen=G.areaSeen||{};if(G.areaSeen[a])return;G.areaSeen[a]=1;save();
  const I=AREA_INFO[a];$('fx').innerHTML='';showPad(false);
  $('overlay').innerHTML=`<div class="acard" style="--c:${I.col}"><small>B${a*10+1} 〜 B${a*10+10}</small><b>${esc(AREA_NAME[a])}</b><span>${esc(I.sub)}</span></div>`;
  jingle(I.jg,.17);setMsg('',false);setCmds([]);
  await sleep(1700);await talks(AREA_TEXT[a]);$('overlay').innerHTML='';
}
// ---------- エリアごとの 空気（ちり・しずく・きらめき） ----------
function ambient(ts,cx,cy){
  const t=now/1000,wrap=(v,m)=>((v%m)+m)%m;
  if(ts===0){for(let i=0;i<9;i++){const sp=5+hash(i,3)*6,x=wrap(hash(i,1)*SW-cx*.3+Math.sin(t*.7+i)*3,SW),y=wrap(t*sp+hash(i,9)*SH-cy*.3,SH);rect(x,y,1,1,'rgba(210,170,120,.55)');}}
  else if(ts===1){for(let i=0;i<8;i++){const sp=7+hash(i,4)*5,x=wrap(hash(i,2)*SW-cx*.3+Math.sin(t*1.3+i*2)*6,SW),y=wrap(t*sp+hash(i,8)*SH-cy*.3,SH);rect(x,y,2,1,i%2?'rgba(150,200,90,.7)':'rgba(120,160,70,.6)');}}
  else if(ts===2){for(let i=0;i<7;i++){const per=1.4+hash(i,5)*1.6,ph=wrap(t+hash(i,6)*per,per)/per,x=wrap(hash(i,7)*SW-cx*.5,SW),y0=hash(i,11)*30,y1=60+hash(i,12)*70;
      if(ph<.7){const y=y0+(y1-y0)*(ph/.7)**2;rect(x,y-cy*.0,1,2,'rgba(170,220,255,.8)');}else{const k=(ph-.7)/.3;ctx.strokeStyle=`rgba(170,220,255,${.6*(1-k)})`;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y1,1+k*6,.5+k*2,0,0,7);ctx.stroke();}}
    ctx.fillStyle='rgba(120,200,255,.05)';for(let i=0;i<3;i++){const y=wrap(t*6+i*50,SH);ctx.fillRect(0,y,SW,6);}}
  else if(ts===3){const cols=['#ff8ad8','#7cf0ff','#ffe24a','#ffffff'];for(let i=0;i<16;i++){const a=Math.max(0,Math.sin(t*2.2+hash(i,3)*9))**10;if(a<.05)continue;
      const x=wrap(hash(i,1)*SW-cx*.6,SW),y=wrap(hash(i,2)*SH-cy*.6,SH);ctx.globalAlpha=a;ctx.fillStyle=cols[i%4];ctx.fillRect(x,y,1,1);if(a>.5){ctx.fillRect(x-1,y,3,1);ctx.fillRect(x,y-1,1,3);}ctx.globalAlpha=1;}}
  else if(ts===4){for(let i=0;i<10;i++){const sp=3+hash(i,4)*4,x=wrap(hash(i,2)*SW-cx*.3+Math.sin(t*.8+i)*4,SW),y=wrap(hash(i,8)*SH-t*sp-cy*.3,SH),a=.3+.4*Math.abs(Math.sin(t*1.7+i));rect(x,y,1,1,`rgba(255,220,140,${a})`);}}
}
// ---------- ぬしの 登場 ----------
const BOSS_LINE={
  5:['ギチギチ… 女王が 大きな あごを 鳴らしている。'],
  10:['「ウォォーン！」 群れの とおぼえが 穴じゅうに ひびいた。'],
  15:['ねむっていた コアラのだいまどうしが、うすく 目を あけた。','つえの 先に、つめたい まりょくが あつまっていく…'],
  20:['水面が もりあがり、大きな 目が こちらを 見た…'],
  25:['カモノハシのぬしが くちばしを ふるわせている。','こちらの 気配を、電気で 感じとっているようだ…'],
  30:['地下の 川の 底から、大きな かげが のぼってきた…'],
  35:['アカカンガルーのチャンピオンが、しっぽで 立ち、こぶしを かまえた！'],
  40:['岩の 中の オパールが にじいろに 光りだした。','化石が… うごいている！'],
  45:['やみの 中で、大きな 親指の ツメが きらりと 光った…'],
  50:['穴の いちばん奥の、大きな 部屋。','地面が ゆれる。とてつもなく 大きな トカゲが、すがたを あらわした…','太古の 王者 メガラニアが、ご先祖の ねどこを まもっている！'],
};
async function bossIntro(f){const L=BOSS_LINE[f];if(!L)return;stopMusic();
  for(let i=0;i<L.length;i++){if(i===L.length-1){shakeT=now;snd('enc');}await talk(L[i]);}}
function bossPlate(){
  if(!(B.boss||(B.opt&&B.opt.guard)))return;const i=B.enemies.findIndex(e=>e.boss||e.guardian);if(i<0)return;const e=B.enemies[i],a=BA.e[i];
  const r=Math.max(0,((a&&a.show!=null)?a.show:e.hp)/e.max);
  rect(3,3,118,12,'rgba(0,0,0,.62)');ctx.font='bold 7px sans-serif';ctx.fillStyle=e.guardian?'#d8a8ff':'#ff8a6a';ctx.fillText((e.guardian?'番人 ':'ぬし ')+e.name.replace(/ [A-E]$/,''),6,10);
  rect(6,12,112,2,'#3a2a2a');rect(6,12,Math.round(112*r),2,r<.3?'#ff5a5a':r<.6?'#e8d05a':'#78e070');
}
// ---------- 職業の 進み具合（表） ----------
function jobGridHTML(m){
  const cell=j=>{const J=JOBS[j],un=jobUnlocked(m,j),ms=!!m.mastered[j],cur=m.job===j,lv=cur?m.lv:jobStartLv(m,j);
    const hf=J.tier===3&&Object.keys(HINTS).some(f=>HINTS[f].job===j&&G.hints[f]);
    const name=J.tier===3&&!un&&!ms&&!hf?'？？？王':J.name;
    const mark=ms?'★':cur?'Lv'+m.lv:un?(lv>1?'Lv'+lv:'○'):'🔒';
    return `<i class="jc ${ms?'ms':un?'un':'lk'}${cur?' cur':''}"><b>${esc(name)}</b><em>${mark}</em></i>`;};
  const sec=(t,tier)=>`<div class="jh">${t}</div><div class="jg">${Object.keys(JOBS).filter(j=>JOBS[j].tier===tier).map(cell).join('')}</div>`;
  return `<div class="jgrid"><div class="jt">${esc(m.name)}の 職業</div>${sec('基本職（上限 Lv20）',1)}${sec('上級職（上限 Lv30）',2)}${sec('超上級職（上限 Lv40）',3)}</div>`;
}
async function progressView(){let i=0;
  while(true){const m=G.party[i],n=Object.keys(m.mastered).filter(j=>m.mastered[j]).length;$('overlay').innerHTML=jobGridHTML(m);
    const c=await ask(`${m.name}：極めた 職業 ${n}/21\n★極めた　○就ける　Lv＝きたえた ところ　🔒まだ`,[{label:'◀ 前の 仲間',cls:''},{label:'次の 仲間 ▶',cls:''},{label:'← もどる',cls:'wide sub'}]);
    if(c===0)i=(i+2)%3;else if(c===1)i=(i+1)%3;else break;}
  $('overlay').innerHTML='';}
// ---------- いにしえの 石ばん ----------
function showTablet(f){const H=HINTS[f];$('overlay').innerHTML=`<div class="tablet"><small>いにしえの 石ばん</small><b>${esc(JOBS[H.job].name)}の 言い伝え</b><p>${esc(H.text)}</p></div>`;}
// ---------- 転職の 前と後の つよさ ----------
function statPanel(m,j){const J=JOBS[j],c=JSON.parse(JSON.stringify(m));c.job=j;c.lv=jobStartLv(m,j);c.slots=c.slots.filter(k=>SKILLS[k].job!==j);const a=derived(m),b=derived(c);
  const rows=[['HP',a.maxhp,b.maxhp],['MP',a.maxmp,b.maxmp],['こうげき',a.atk,b.atk],['ぼうぎょ',a.def,b.def],['まりょく',a.mag,b.mag],['すばやさ',a.spd,b.spd]];
  const sk=jobSkills(c).map(k=>SKILLS[k].name);
  $('overlay').innerHTML=`<div class="spanel"><div class="sp1">${esc(jobName(m.job))} Lv${m.lv}　→　<b>${esc(J.name)} Lv${c.lv}</b></div><div class="spg">${rows.map(r=>`<span>${r[0]}</span><span>${r[1]}</span><span>→</span><span class="${r[2]>r[1]?'up':r[2]<r[1]?'dn':''}">${r[2]}${r[2]>r[1]?'▲':r[2]<r[1]?'▼':''}</span>`).join('')}</div><div class="sp2">${J.name}の わざ：${esc(sk.join('・')||'（レベルが 上がると おぼえる）')}</div></div>`;}
async function jobChangeFx(m,J){const ti=G.party.indexOf(m);
  $('overlay').innerHTML=`<div class="acard" style="--c:${J.tier===3?'#ffd36b':J.tier===2?'#7cf0ff':'#e8e0d0'}"><small>${esc(m.name)}は</small><b>${esc(J.name)}</b><span>に なった！</span></div>`;
  jingle(J.tier===3?'C5 E5 G5 C6 E6 G6 C7':J.tier===2?'D5 F#5 A5 D6':'C5 E5 G5',.09);snd('quest');partySparkleTown();sparkle(96,100,30,J.tier===3?'#ffd36b':'#7cf0ff',50);
  await sleep(1300);$('overlay').innerHTML='';}

// ===================== 結末 =====================
let ES=null;
function boneSprite(kind){return cached('bone|'+kind,()=>{
  const blk={m:'#000',l:'#000',d:'#000',b:'#000',w:'#000',e:'#000',p:'#000'};
  const src=kind==='dip'?toCanvas(GEN.quad(blk,1.6,{tail:'short',snout:.7,ears:'round',stocky:true})):toCanvas(renderWombat({eye:'closed'}));
  const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const x=c.getContext('2d');x.drawImage(src,0,0);x.globalCompositeOperation='source-atop';
  x.fillStyle='#e8dcc0';x.fillRect(0,0,c.width,c.height);x.fillStyle='rgba(110,86,50,.6)';for(let i=2;i<c.width;i+=3)x.fillRect(i,Math.floor(c.height*.25),1,Math.floor(c.height*.4));
  x.fillStyle='rgba(255,255,255,.35)';x.fillRect(0,0,c.width,Math.max(2,c.height*.12));return c;});}
function parents3(y){['war','mag','pri'].forEach((c,i)=>{const bob=Math.floor((now/600+i)%2);const spr=wombatSprite(c,'front',{bob});const w=spr.width*1.1,h=spr.height*1.1;ctx.drawImage(spr,Math.round(96-w/2+(i-1)*66),Math.round(y-h),w,h);});}
function drawEnding(){if(!ES)return;const t=(now-ES.t0)/1000;
  if(ES.s==='chamber'){grad(0,104,'#100c06','#2e2414');rect(0,104,SW,40,'#3a3020');rect(0,104,SW,1,'#4a3e2a');ambient(4,0,0);
    const gl=.32+.14*Math.sin(now/600),g=ctx.createRadialGradient(96,66,6,96,66,96);g.addColorStop(0,`rgba(255,228,160,${gl})`);g.addColorStop(1,'rgba(255,228,160,0)');ctx.fillStyle=g;ctx.fillRect(0,0,SW,SH);
    const d=boneSprite('dip'),w=boneSprite('wom');ctx.globalAlpha=Math.min(1,t/1.5);ctx.drawImage(d,4,38,d.width*1.05,d.height*1.05);
    ctx.save();ctx.translate(SW-2,0);ctx.scale(-1,1);ctx.drawImage(w,0,58,w.width*1.45,w.height*1.45);ctx.restore();ctx.globalAlpha=1;party3(146);}
  else if(ES.s==='climb'){grad(0,SH,'#0e0a04','#000');const k=Math.min(1,t/7);const g=ctx.createLinearGradient(0,0,0,SH);g.addColorStop(0,`rgba(255,240,200,${.25+.6*k})`);g.addColorStop(1,'rgba(255,240,200,0)');ctx.fillStyle=g;ctx.fillRect(60,0,72,SH);
    rect(95,0,2,SH,'#d8c08a');for(let i=0;i<3;i++){const y=120-k*70+i*14+Math.sin(now/180+i)*1;drawSpr(fieldWombat('up',Math.floor(now/200+i)%2),88,y);}
    for(let i=0;i<12;i++){const y=((hash(i,3)*SH-t*(8+hash(i,4)*8))%SH+SH)%SH;rect(64+hash(i,1)*64,y,1,1,'rgba(255,240,200,.7)');}}
  else if(ES.s==='village'){grad(0,90,'#ff8a50','#ffd8a0');ctx.fillStyle='#fff0c0';ctx.beginPath();ctx.arc(150,74,13,0,7);ctx.fill();
    clouds('rgba(255,200,170,.8)');rect(0,86,SW,58,'#55743a');rect(0,86,SW,3,'#6e8e48');tree(18,92,1.3,'#3e5a3a');tree(176,94,1.5,'#3e5a3a');burrow(8,112,12);
    ctx.fillStyle='#3a2410';ctx.beginPath();ctx.ellipse(120,92,20,5,0,0,7);ctx.fill();birds('#5a3a2a');parents3(104);party3(146);drawFFX(0,0);}
  else if(ES.s==='roll'||ES.s==='end'){grad(0,SH,'#0a0e26','#2e2450');for(const [x,y,p] of STARS){const a=.4+.6*Math.abs(Math.sin(now/700+p*9));rect(x,y,1,1,`rgba(255,250,220,${a})`);}
    rect(0,128,SW,16,'#1a1424');rect(0,128,SW,1,'#3a3050');
    if(ES.s==='roll'){const T=ES.T,k=Math.min(1,t/T);
      ctx.save();ctx.beginPath();ctx.rect(0,0,SW,94);ctx.clip();ctx.textAlign='center';
      const y0=SH-k*(SH+ES.lines.length*12);ES.lines.forEach((L,i)=>{const y=y0+i*12;if(y<-8||y>100)return;ctx.font=L.b?'bold 9px sans-serif':'8px sans-serif';ctx.fillStyle=L.c||'#efe6d2';ctx.fillText(L.t,96,y);});
      ctx.restore();ctx.textAlign='left';
      const x0=SW+10-k*(SW+20+ES.parade.length*34);
      ES.parade.forEach((id,i)=>{const x=x0+i*34;if(x<-40||x>SW+4)return;const spr=enemySprite(dexLook(id));const sc=Math.min(26/spr.height,32/spr.width,1),w=spr.width*sc,h=spr.height*sc,hop=Math.abs(Math.sin(now/180+i))*2;ctx.drawImage(spr,x,128-h-hop,w,h);});}
    else{ctx.textAlign='center';ctx.font='bold 18px serif';ctx.lineWidth=3;ctx.strokeStyle='#3a1a0a';const a=Math.min(1,t/1.2);ctx.globalAlpha=a;ctx.strokeText('THE END',96,52);ctx.fillStyle='#ffd36b';ctx.fillText('THE END',96,52);
      ctx.font='8px sans-serif';ctx.fillStyle='#efe6d2';ctx.fillText('ウォンバット☆レガシーRPG 2',96,66);ctx.globalAlpha=1;ctx.textAlign='left';party3(128);
      if(Math.floor(now/400)%2)sparkle(20+R()*150,20+R()*60,1,R()<.5?'#ffd36b':'#fff6b0',8);drawFFX(0,0);}}
}
function epilogueLine(m){
  const SUP={kNin:'かげのように 穴を 見まわり、まいごの 子を 何度も 見つけだした。',kAll:'何でも こなす たよれる 見はり役として、村の 入口を まもっている。',
    kMag:'ふしぎな 力で、けがを した 生き物たちを なおして まわっている。',kAtk:'村いちばんの 力じまんとして、力くらべで 負けしらずだ。',
    kIdl:'歌で 村じゅうを 元気にする、村いちばんの 人気ものに なった。',kDig:'穴を ほりつづけ、村の 地下に 雨水を ためる 大きな 巣穴を つくった。'};
  const sup=['kDig','kIdl','kAll','kMag','kNin','kAtk'].filter(j=>m.mastered[j]);
  const pick=sup.includes(m.job)?m.job:sup[0];
  if(pick)return `${m.name}は ${JOBS[pick].name}として、${SUP[pick]}`;
  if(Object.keys(m.mastered).some(j=>m.mastered[j]&&JOBS[j].tier===2))return `${m.name}は ${JOBS[m.job].name}の わざを みがきながら、まだ 見ぬ 職業を さがして 穴に もぐりつづけている。`;
  return `${m.name}は 穴の 入口で、きょうも ${JOBS[m.job].name}の けいこを している。`;
}
function endingRecord(){
  const seen=dexKeys().filter(k=>G.seen[k]).length,tot=dexKeys().length,gd=Object.keys(GUARDIANS).filter(f=>G.guardDown[f]).length;
  const ms=G.party.map(m=>`${m.name}：極めた 職業 ${Object.keys(m.mastered).filter(j=>m.mastered[j]).length}こ（いま ${jobName(m.job)}）`);
  const days=Math.max(0,Math.floor((Date.now()-(G.started||Date.now()))/86400000));
  return {seen,tot,gd,ms,days};
}
async function ending(){
  const p=G.parents,k=G.party.map(m=>m.name);
  B=null;BA=null;disp=null;showPad(false);$('overlay').innerHTML='';$('fx').innerHTML='';
  G.party.forEach(m=>{const d=derived(m);m.hp=d.maxhp;m.mp=d.maxmp;m.poison=false;});
  mode='ending';ES={s:'chamber',t0:now};fadeT=now;stopMusic();renderParty();updateTop('B50 いちばん奥');
  await talks(['メガラニアは、ゆっくりと たおれた。','あたりが しずかに なると、部屋の 奥が ぼんやりと 光りだした。',
    '大きな 骨が 2つ、ならんで ねむっている。',
    '1つは、ディプロトドン。ウォンバットや コアラの 遠い 親戚で、いままでに 知られている中で いちばん 大きな 有袋類だ。',
    'もう1つは、ファスコロヌス。本当の「大きな ウォンバット」で、いまの ウォンバットの 何倍も 大きかった。',
    'まわりを さがしても、宝箱は ひとつも ない。',
    `${k[0]}「…宝は、なかったね」`,
    `${k[1]}「でも、この 骨たちも、ここで くらして、ここで 穴を ほっていたんだ」`,
    `${k[2]}「長老が 言ってた。レガシーとは 宝では ない、って」`,
    '3匹は、骨に むかって そっと 頭を さげた。']);
  ES={s:'climb',t0:now};fadeT=now;playMusic('ending');updateTop('');
  await talks(['3匹は ロープを のぼっていく。','上から さしこむ 光が、だんだん 大きくなる…']);
  ES={s:'village',t0:now};fadeT=now;updateTop('ユーカリ村');
  await talks([`穴の 入口では、${p[0]}・${p[1]}・${p[2]}と 長老が 待っていた。`,
    '長老「おかえり。どうじゃった？ ご先祖の のこしたものは」',
    `${k[0]}「穴を ほって、仲間と 分けあって、ねぐらを 守る。それを ずっと つづけてきたこと…かな」`,
    `${k[1]}「わたしたちも、それを つづける」`,`${k[2]}「それが、ぼくたちの レガシー」`,
    '長老は、だまって うなずいた。',
    `${p[0]}「…おまえたちは、おれたちより ずっと 遠くまで 行ったな」`,
    `${p[1]}「レガシーって、こうやって つながっていくのね」`,
    `${p[2]}「さあ、ごはんに しよう。みんなで 分けあって」`]);
  await talks(['それから――',...G.party.map(epilogueLine),'ユーカリ村の 大きな 穴は、いまも そこに ある。\nいつか また、だれかが もぐる 日まで。']);
  G.cleared=true;G.clearedAt=G.clearedAt||Date.now();save();
  const r=endingRecord();
  const parade=dexKeys().filter(k=>G.seen[k]&&!k.startsWith('guard'));
  const lines=[{t:'ウォンバット☆レガシーRPG 2',b:1,c:'#ffd36b'},{t:''},{t:'～ ぼうけんの きろく ～',b:1,c:'#7cf0ff'},{t:'いちばん深い 階：B50'},{t:`たたかった 回数：${G.battles}回`},...r.ms.map(t=>({t})),
    {t:`ずかん：${r.seen} / ${r.tot}`},{t:`光る宝箱：${r.gd} / 5`},{t:''},{t:'～ 出会った 生き物たち ～',b:1,c:'#7cf0ff'},{t:'（下を 歩いているよ）'},{t:''},
    {t:'～ 図鑑の しりょう ～',b:1,c:'#7cf0ff'},{t:'オーストラリア博物館 ほか'},{t:''},{t:'ぜんさく',b:1,c:'#7cf0ff'},{t:'ウォンバット☆レガシーRPG'},{t:''},{t:'あそんでくれて ありがとう！',b:1,c:'#ffd36b'}];
  const T=Math.max(26,Math.min(48,parade.length*.6));
  ES={s:'roll',t0:now,T,lines,parade};fadeT=now;updateTop('');
  setMsg(`～ ぼうけんの きろく ～\nたたかった 回数 ${G.battles}回　ずかん ${r.seen}/${r.tot}　光る宝箱 ${r.gd}/5`,false);
  await new Promise(res=>{const tm=setTimeout(res,T*1000+600);setCmds([{label:'▶ とばす',cls:'wide sub',fn:()=>{clearTimeout(tm);res();}}]);});
  ES={s:'end',t0:now};jingle('C5 E5 G5 C6 - E6 G6 C7',.12);
  await sleep(1500);
  const c=await ask('～ おしまい ～\nあそんでくれて ありがとう！\n（このあとも 穴に もぐれるよ。B50の いちばん奥に、まだ なにかが いるみたい…）',[{label:'つづけて あそぶ（村へ）',cls:'wide hi'},{label:'タイトルへ',cls:'wide'}]);
  ES=null;G.party.forEach(m=>{const d=derived(m);m.hp=d.maxhp;m.mp=d.maxmp;m.poison=false;});save();
  if(c===0){fadeT=now;enterTown();}else{fadeT=now;title();}
}

requestAnimationFrame(frame);
title();
