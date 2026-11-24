// ===== 描画（前作 ウォンバット☆レガシーRPG から引きついで、続編用に足したもの） =====
// ---- wombat_render.js ----
const PAL={o:'#2a1a12',b:'#86613f',l:'#a17a53',d:'#5e4128',f:'#a9845d',n:'#3f3230',nh:'#64544f',e:'#0d0806',w:'#ffffff',p:'#d1b796',c:'#c98a7a',k:'#e2d9ca',m:'#6e4f34',v:'#b89c7c'};

// ---------- shared pixel helpers ----------
function mkGrid(W,H){
  const g=new Array(W*H).fill(0),pt=new Uint8Array(W*H);
  const S=(x,y,c,p=9)=>{x=Math.floor(x);y=Math.floor(y);if(x<0||y<0||x>=W||y>=H)return;g[y*W+x]=c;pt[y*W+x]=p;};
  const SE=(cx,cy,rx,ry,n,p,fn)=>{
    for(let y=Math.floor(cy-ry-1);y<=cy+ry+1;y++)for(let x=Math.floor(cx-rx-1);x<=cx+rx+1;x++){
      const dx=Math.abs((x+.5-cx)/rx),dy=(y+.5-cy)/ry;if(Math.pow(dx,n)+Math.pow(Math.abs(dy),n)<=1)S(x,y,fn(x,y,dy),p);}
  };
  const E=(cx,cy,rx,ry,p,fn)=>SE(cx,cy,rx,ry,2,p,fn);
  return {W,H,g,pt,S,SE,E};
}
// fluffy silhouette: little tufts on upper edges of fur parts
function fuzz(G,pids,maxY){
  const {W,H,g,pt}=G,add=[];
  for(let y=1;y<Math.min(H,maxY);y++)for(let x=1;x<W-1;x++){
    const i=y*W+x;if(!pids.includes(pt[i]))continue;
    if(!g[i-W]&&((x*5+y*3)%7===0))add.push([i-W,g[i]==='f'?'l':g[i],pt[i]]);
    else if(!g[i-1]&&((y*5+x)%6===0))add.push([i-1,g[i],pt[i]]);
    else if(!g[i+1]&&((y*7+x)%6===0))add.push([i+1,g[i],pt[i]]);
  }
  for(const [i,c,p] of add){g[i]=c;pt[i]=p;}
}
function outline(G){
  const {W,H}=G,out=G.g,fin=out.slice();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const i=y*W+x;if(out[i])continue;
    if((x>0&&out[i-1])||(x<W-1&&out[i+1])||(y>0&&out[i-W])||(y<H-1&&out[i+W]))fin[i]='o';
  }
  return fin;
}
// grizzled frosting on fur: light tips scattered on the upper part
const hash=(x,y)=>{let h=(x*374761393+y*668265263)|0;h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;};
const frost=(x,y,r)=>r<.6&&hash(x,y)<(r<.3?.11:.05);

// ---------- side view ----------
const WW=48,WH=32,AX=20;
function renderWombat(o){
  const G=mkGrid(WW,WH),{g,pt,S,SE,E}=G;
  const sq=o.sq||0,low=o.low||0,bob=o.bob||0;
  const bcx=19,bcy=18+bob+low,brx=14.5*(1+sq),bry=7.6+(o.br||0)-sq*6;
  const hcx=29.5+(o.hx||0),hcy=bcy-.5+(o.hy||0);
  const claws=[];
  if(!o.noLegs){
    const legs=[[7,'d',0,0],[23,'d',1,1],[11,'b',1,0],[27,'b',0,1]];
    for(const [lx,c,ph,fr] of legs){
      let lift=0,sx=0;
      if(o.walk&&(!o.dig||fr)){ if(ph===o.wp){lift=1;sx=1;} }
      for(let y=Math.floor(bcy+5);y<=27-lift;y++)for(let x=lx+sx;x<lx+sx+3;x++)S(x,y,y>=26-lift?'d':c,1);
      if(fr)claws.push([lx+sx+3,27-lift],[lx+sx+3,26-lift]); else claws.push([lx+sx+3,27-lift]);
    }
  }
  const bsh=(x,y)=>{const r=(y+.5-(bcy-8))/16;return r<.22?(frost(x,y,r)?'f':'l'):r>.78?'d':(frost(x,y,r)?'f':'b');};
  const rearX=bcx-brx+1.2;
  E(bcx,bcy,brx,bry,2,(x,y)=>bsh(x,y));
  SE(bcx-6.5,bcy-.8,8.6,bry+1.1,2.25,2,(x,y)=>bsh(x,y));
  for(let y=0;y<WH;y++)for(let x=0;x<Math.floor(rearX);x++)if(pt[y*WW+x]===2){g[y*WW+x]=0;pt[y*WW+x]=0;}
  const K=1.28;
  // far ear
  E(hcx-5.6*K,hcy-5.6*K+(o.ear||0)*.6,1.5*K,2*K,4,()=>'d');
  // head
  const hsh=(x,y)=>{const r=(y+.5-(hcy-6*K))/(12*K);return r<.25?(frost(x,y,r)?'f':'l'):r>.8?'d':(frost(x,y,r)&&x<hcx+2?'f':'b');};
  E(hcx-1.5*K,hcy,6.3*K,5.7*K,3,hsh);
  SE(hcx+3.6*K,hcy+1.3*K,4.4*K,4*K,3.2,3,hsh);
  fuzz(G,[2,3],bcy+2);
  // near ear: small, pale rim
  const ey0=hcy-5.7*K-(o.ear>0?1:0)+(o.ear<0?1.4:0);
  E(hcx-3.4*K,ey0,1.6*K,2.1*K,4,(x,y,dy)=>dy<-.3?'p':'d');S(hcx-3.4*K-.6,ey0-2.1*K,'p',4);
  // nose: big bare matte nose
  const ncx=hcx+6.6*K,ncy=hcy+.4*K;
  SE(ncx,ncy,2.4*K,2.8*K,3,5,()=>'n');
  S(ncx-1.6,ncy-2.4,'nh',5);S(ncx-.6,ncy-2.4,'nh',5);S(ncx-1.6,ncy-1.4,'nh',5);
  S(ncx+1.5,ncy+.8,'e',5);S(ncx+.5,ncy+.8,'e',5);
  // eye: small round beady
  const ex=Math.floor(hcx+.8*K),ey=Math.floor(hcy-2.6*K);
  if(o.eye==='closed'){S(ex,ey+1,'e');S(ex+1,ey+1,'e');}
  else if(o.eye==='half'){S(ex-1,ey,'e');S(ex,ey,'e');S(ex,ey+1,'e');S(ex+1,ey+1,'e');}
  else if(o.eye==='happy'){S(ex-1,ey+1,'e');S(ex,ey,'e');S(ex+1,ey+1,'e');}
  else if(o.eye==='strain'){S(ex-1,ey,'e');S(ex,ey+1,'e');S(ex-1,ey+2,'e');}
  else {S(ex,ey,'w');S(ex+1,ey,'e');S(ex,ey+1,'e');S(ex+1,ey+1,'e');}
  if(o.blush){S(hcx+1.4*K,hcy+2*K,'c');S(hcx+1.4*K+1,hcy+2*K,'c');}
  // mouth
  S(ncx-2.5,ncy+3.8,'o');S(ncx-1.5,ncy+3.8,'o');if(o.chew){S(ncx-2.5,ncy+4.8,'o');S(ncx-1.5,ncy+4.8,'o');}
  // joey
  if(o.joey>0){
    const jx=bcx+.5,jy=bcy+bry+2.5-o.joey;
    E(jx,jy,3.4,2.9,6,(x,y,dy)=>dy>.6?'b':'l');
    S(jx-2,jy-3,'p',6);S(jx-1,jy-3,'l',6);
    S(jx+1,jy-1,'e',6);S(jx+3,jy+.2,'n',6);S(jx+2,jy+.2,'n',6);
  }
  // inner edges
  const out=g.slice();
  for(let y=0;y<WH;y++)for(let x=0;x<WW;x++){
    const i=y*WW+x,p=pt[i];if(!p)continue;
    for(const [qx,qy] of [[x-1,y],[x+1,y],[x,y+1],[x,y-1]]){
      if(qx<0||qy<0||qx>=WW||qy>=WH)continue;const q=pt[qy*WW+qx];
      if(p===3&&q===2&&(qx<x||qy>y)){out[i]='d';break;}
      if(p===6&&(q===2||q===1)){out[i]='o';break;}
      if(p===2&&q===1&&qy>y){out[i]='d';break;}
    }
  }
  G.g=out;
  const fin=outline(G);
  // claws & whiskers drawn over the outline
  const P=(x,y,c)=>{x=Math.floor(x);y=Math.floor(y);if(x>=0&&y>=0&&x<WW&&y<WH)fin[y*WW+x]=c;};
  for(const [x,y] of claws)P(x,y,'k');
  P(ncx-2.5,ncy+2.4,'v');P(ncx-1.5,ncy+3,'v');
  P(ncx-3,ncy+1.6,'v');P(ncx-4,ncy+1.8,'v');
  return {W:WW,H:WH,ax:AX,img:fin};
}

// ---------- front view ----------
const FW=40,FH=32,FAX=20;
function renderFront(o){
  const G=mkGrid(FW,FH),{g,pt,S,SE,E}=G;
  const sq=o.sq||0,cx=20,ty=o.bob||0;
  const bry=10.6+(o.br||0)-sq*8,brx=14*(1+sq);
  const bcy=27.5-bry;
  // paws (behind body first)
  const pawY=26;
  // body
  const fsh=(x,y)=>{const r=(y+.5-(bcy-bry))/(2*bry);return r<.18?(frost(x,y,r)?'f':'l'):r>.82?'d':(frost(x,y,r)?'f':'b');};
  E(cx,bcy,brx,bry,2,fsh);
  // head merges with body (no neck)
  const hcy=bcy-3.2+ty+(o.hy||0),hrx=10.4*(1+sq*.5),hry=8.6;
  E(cx,hcy,hrx,hry,3,(x,y,dy)=>dy<-.55?(frost(x,y,0)?'f':'l'):'b');
  // ears: small, wide-set, pale rims
  const eo=o.ear>0?1:0;
  for(const s of [-1,1]){
    const ex=cx+s*7.6,ey=hcy-7.4-eo;
    E(ex,ey,2.2,2.6,4,(x,y,dy)=>dy<-.25||Math.abs(x+.5-ex)>1.4?'p':'d');
  }
  fuzz(G,[2,3],bcy);
  // face: slightly lighter muzzle
  E(cx,hcy+3.8,6,3.6,5,()=>'l');
  // eyes: small, round, beady, wide-set
  for(const s of [-1,1]){
    const ex=Math.floor(cx+s*4.6-(s<0?1:0)),ey=Math.floor(hcy-1);
    if(o.eye==='closed'){S(ex,ey+1,'e');S(ex+1,ey+1,'e');}
    else if(o.eye==='half'){S(ex,ey,'d');S(ex+1,ey,'d');S(ex,ey+1,'e');S(ex+1,ey+1,'e');S(ex+(s<0?0:1),ey+1,'e');}
    else if(o.eye==='happy'){S(ex,ey+1,'e');S(ex+1,ey,'e');S(ex+2,ey+1,'e');}
    else {S(ex,ey,'e');S(ex+1,ey,'e');S(ex,ey+1,'e');S(ex+1,ey+1,'e');S(ex+(s<0?0:0),ey,'w');}
  }
  if(o.blush){S(cx-7,hcy+2,'c');S(cx-6,hcy+2,'c');S(cx+6,hcy+2,'c');S(cx+7,hcy+2,'c');}
  // big bare nose
  // big bare nose: wide top, rounded bottom (shield shape), nostrils at the lower sides
  const ny=hcy+3.4+(o.nw||0);
  for(let y=Math.floor(ny-2.9);y<=ny+2.9;y++){const t=(y+.5-(ny-2.9))/5.8;let hw=4.7-2.4*t*t;if(t<.22)hw-=(.22-t)*6;
    for(let x=Math.floor(cx-hw);x<cx+hw;x++)S(x,y,t<.25?'nh':'n',6);}
  S(cx-3,ny+.6,'e',6);S(cx-2,ny+1.4,'e',6);S(cx+2,ny+.6,'e',6);S(cx+1,ny+1.4,'e',6);
  S(cx-.5,ny+2.2,'o',6);
  // mouth
  S(cx-.5,ny+3.3,'o');S(cx-1.5,ny+4,'o');S(cx+.5,ny+4,'o');
  if(o.chew){S(cx-.5,ny+4.2,'o');}
  G.g=g;
  const fin=outline(G);
  const P=(x,y,c)=>{x=Math.floor(x);y=Math.floor(y);if(x>=0&&y>=0&&x<FW&&y<FH)fin[y*FW+x]=c;};
  // front paws with long pale claws, turned slightly inward
  for(const s of [-1,1]){
    const px=cx+s*5.5;
    for(let y=pawY;y<=27;y++)for(let x=Math.floor(px-2);x<=Math.floor(px+1);x++)P(x,y,'d');
    P(px-2,28,'o');P(px+1,28,'o');
    const c0=s<0?px:px-2;P(c0-1,28,'k');P(c0,28,'k');P(c0+1,28,'k');
    P(px-3,pawY,'o');P(px+2,pawY,'o');P(px-3,27,'o');P(px+2,27,'o');
  }
  // whiskers
  for(const s of [-1,1]){
    const b=s<0?-1:0;
    P(cx+s*6.5+b,hcy+3.6,'v');P(cx+s*7.5+b,hcy+3.1,'v');P(cx+s*8.5+b,hcy+2.8,'v');
    P(cx+s*6.5+b,hcy+5,'v');P(cx+s*7.5+b,hcy+5.4,'v');P(cx+s*8.5+b,hcy+6,'v');
  }
  return {W:FW,H:FH,ax:FAX,img:fin};
}

// ---- music.js ----
// ---------- BGM（オリジナル曲。8分音符ごと、"-"はのばす、"."は休み） ----------
const TRACKS={
  title:{bpm:88,mw:'triangle',mv:.05,bv:.04,
    mel:'E5 - G5 A5 G5 - E5 - D5 - E5 G5 E5 - - - C5 - D5 E5 G5 - A5 - G5 - E5 D5 C5 - - - A4 - C5 D5 E5 - G5 - A5 - G5 E5 D5 - - - C5 - E5 D5 C5 - A4 - C5 - - - - - - -',
    bass:'C3 - - - G2 - - - A2 - - - E2 - - - F2 - - - C3 - - - G2 - - - C3 - - - F2 - - - C3 - - - D3 - - - G2 - - - F2 - - - G2 - - - C3 - - - C3 - - -'},
  town:{bpm:124,mw:'square',mv:.022,bv:.045,
    mel:'C5 E5 G5 E5 F5 A5 G5 - E5 G5 C6 G5 A5 G5 E5 - F5 E5 D5 E5 C5 D5 E5 - D5 E5 F5 D5 C5 - - - E5 - E5 F5 G5 - E5 - A5 G5 F5 E5 D5 - - - F5 - F5 G5 A5 - F5 - G5 F5 E5 D5 C5 - - -',
    bass:'C3 - G3 - F3 - C3 - A2 - E3 - F3 - G3 - D3 - A2 - C3 - G2 - G2 - G2 - C3 - G2 - C3 - G2 - C3 - G2 - F2 - C3 - G2 - D3 - G2 - D3 - F2 - C3 - G2 - D3 - C3 - G2 -'},
  dungeon:{bpm:96,mw:'triangle',mv:.05,bv:.04,
    mel:'A4 - C5 - B4 - G4 - A4 - E4 - - - F4 - A4 - G4 - E4 - D4 - E4 - - - A4 - C5 - D5 - E5 - F5 - E5 - D5 - C5 - B4 - G#4 - A4 - - - - - - - - - - - - - - -',
    bass:'A2 - - - E2 - - - A2 - - - E2 - - - F2 - - - C3 - - - G2 - - - E2 - - - A2 - - - D3 - - - F2 - - - C3 - - - E2 - - - E2 - - - A2 - - - A2 - - -'},
  battle:{bpm:152,mw:'square',mv:.024,bv:.05,
    mel:'E5 E5 D5 E5 G5 - E5 - D5 D5 C5 D5 E5 - B4 - C5 C5 B4 C5 D5 - E5 - D5 C5 B4 A4 B4 - G#4 - A4 - C5 - E5 - A5 - G5 - E5 - D5 - C5 - D5 - C5 - B4 - A4 - B4 - C5 - D5 - E5 -',
    bass:'A2 A3 A2 A3 A2 A3 A2 A3 G2 G3 G2 G3 G2 G3 G2 G3 F2 F3 F2 F3 F2 F3 F2 F3 E2 E3 E2 E3 E2 E3 E2 E3 A2 A3 A2 A3 A2 A3 A2 A3 F2 F3 F2 F3 F2 F3 F2 F3 G2 G3 G2 G3 G2 G3 G2 G3 E2 E3 E2 E3 E2 E3 E2 E3'},
  boss:{bpm:164,mw:'sawtooth',mv:.016,bv:.05,
    mel:'D5 - D5 F5 E5 - D5 C5 A#4 - A4 - G4 - A4 - D5 - D5 F5 G5 - F5 E5 D5 - C#5 - D5 - - - F5 - F5 G5 A5 - G5 F5 E5 - D5 - C#5 - E5 - D5 - C5 A#4 A4 - G4 - A4 - C#5 - E5 - D5 -',
    bass:'D2 D3 D2 D3 D2 D3 D2 D3 A#1 A#2 A#1 A#2 A#1 A#2 A#1 A#2 G1 G2 G1 G2 G1 G2 G1 G2 A1 A2 A1 A2 A1 A2 A1 A2 D2 D3 D2 D3 D2 D3 D2 D3 A#1 A#2 A#1 A#2 C2 C3 C2 C3 G1 G2 G1 G2 A1 A2 A1 A2 A1 A2 A1 A2 D2 D3 D2 D3'},
  // 10階ごとに曲を変える（決定）：dungeon=B1〜10, dungeon2=B11〜20, dungeon3=B21〜30, dungeon4=B31〜40, dungeon5=B41〜50
  dungeon2:{bpm:100,mw:'triangle',mv:.05,bv:.04,
    mel:'D5 - F5 - E5 - C5 - D5 - A4 - - - C5 - D5 - E5 - G5 - F5 - E5 - D5 - - - A5 - G5 - F5 - E5 - F5 - G5 - A5 - - - G5 - F5 - E5 - C5 - D5 - - - - - - - - -',
    bass:'D3 - - - A2 - - - C3 - - - G2 - - - F2 - - - C3 - - - D3 - - - A2 - - - F2 - - - G2 - - - A2 - - - E2 - - - G2 - - - C3 - - - D3 - - - D3 - - -'},
  dungeon3:{bpm:84,mw:'sine',mv:.06,bv:.04,
    mel:'E5 G5 B5 G5 E5 G5 B5 - D5 F#5 A5 F#5 D5 F#5 A5 - C5 E5 G5 E5 C5 E5 G5 - B4 D#5 F#5 D#5 B4 - - - E5 G5 B5 G5 E5 G5 B5 - D5 G5 B5 G5 D5 G5 B5 - C5 E5 A5 E5 C5 E5 A5 - B4 D#5 F#5 B5 A5 F#5 D#5 -',
    bass:'E2 - - - - - - - D2 - - - - - - - C2 - - - - - - - B1 - - - - - - - E2 - - - - - - - G2 - - - - - - - A2 - - - - - - - B1 - - - - - - -'},
  dungeon4:{bpm:112,mw:'square',mv:.018,bv:.045,
    mel:'F5 A5 C6 B5 A5 - G5 - A5 C6 E6 D6 C6 - B5 - G5 B5 D6 C6 B5 - A5 - G5 - F5 - E5 - - - F5 A5 C6 B5 A5 - C6 - E6 - D6 C6 B5 - G5 - A5 G5 F5 E5 F5 - G5 - F5 - - - - - - -',
    bass:'F2 - C3 - F2 - C3 - A2 - E3 - A2 - E3 - G2 - D3 - G2 - D3 - C3 - G2 - C3 - G2 - F2 - C3 - F2 - C3 - D3 - A2 - D3 - A2 - G2 - D3 - G2 - D3 - C3 - G2 - F2 - - -'},
  dungeon5:{bpm:76,mw:'sawtooth',mv:.014,bv:.05,
    mel:'C5 - - - D#5 - D5 - C5 - - - G4 - - - G#4 - - - G4 - F4 - D#4 - - - D4 - - - C5 - - - D#5 - F5 - G5 - - - F5 - D#5 - D5 - - - C5 - B4 - C5 - - - - - - -',
    bass:'C2 - - - - - - - G#1 - - - - - - - F1 - - - - - - - G1 - - - - - - - C2 - - - - - - - D#2 - - - - - - - G1 - - - - - - - C2 - - - - - - -'},
  lastboss:{bpm:172,mw:'sawtooth',mv:.016,bv:.05,
    mel:'E5 - E5 G5 F#5 - E5 D5 C5 - B4 - A4 - B4 - E5 - E5 G5 A5 - G5 F#5 G5 - A5 - B5 - - - C6 - B5 A5 G5 - F#5 E5 D#5 - E5 - F#5 - G5 - A5 - G5 F#5 E5 - D#5 - B4 - D#5 - E5 - - -',
    bass:'E2 E3 E2 E3 E2 E3 E2 E3 C2 C3 C2 C3 C2 C3 C2 C3 A1 A2 A1 A2 A1 A2 A1 A2 B1 B2 B1 B2 B1 B2 B1 B2 E2 E3 E2 E3 E2 E3 E2 E3 C2 C3 C2 C3 D2 D3 D2 D3 B1 B2 B1 B2 B1 B2 B1 B2 B1 B2 D#2 D#3 E2 E3 E2 E3'},
  ending:{bpm:72,mw:'triangle',mv:.055,bv:.04,
    mel:'C5 - E5 - G5 - - - A5 - G5 - E5 - - - F5 - E5 - D5 - C5 - D5 - - - - - - - C5 - E5 - G5 - - - C6 - B5 - A5 - - - G5 - E5 - D5 - E5 - C5 - - - - - - -',
    bass:'C3 - - - E3 - - - F3 - - - C3 - - - D3 - - - A2 - - - G2 - - - G2 - - - C3 - - - E3 - - - A2 - - - F2 - - - G2 - - - G2 - - - C3 - - - C3 - - -'},
};
const NOTE_N={C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11};
function noteFreq(s){const m=/^([A-G]#?)(\d)$/.exec(s);if(!m)return 0;return 440*Math.pow(2,(NOTE_N[m[1]]+(+m[2]+1)*12-69)/12);}
const MUS={name:null,timer:null,i:0,t:0,gain:null,toks:null};
function ensureAudio(){try{if(!SND.a)SND.a=new (window.AudioContext||window.webkitAudioContext)();if(SND.a.state==='suspended'&&!document.hidden)SND.a.resume();if(!MUS.gain){MUS.gain=SND.a.createGain();MUS.gain.gain.value=1;MUS.gain.connect(SND.a.destination);}return true;}catch(e){return false;}}
function playMusic(name){if(MUS.name===name&&MUS.timer)return;MUS.name=name;startMusic();}
function stopMusic(){clearInterval(MUS.timer);MUS.timer=null;if(MUS.gain&&SND.a){const g=MUS.gain;const t=SND.a.currentTime;g.gain.cancelScheduledValues(t);g.gain.setValueAtTime(g.gain.value,t);g.gain.linearRampToValueAtTime(0,t+.15);const ng=SND.a.createGain();ng.gain.value=1;ng.connect(SND.a.destination);setTimeout(()=>{try{g.disconnect();}catch(e){}},400);MUS.gain=ng;}}
function startMusic(){
  stopMusic();if(!SND.on||!MUS.name||!SND.a||SND.a.state!=='running'||!TRACKS[MUS.name])return;
  if(!MUS.gain&&!ensureAudio())return; // 効果音が先に AudioContext を作ったときは、音楽用の音量ノードがまだない
  const T=TRACKS[MUS.name],step=60/T.bpm/2,toks=[T.mel.split(/\s+/),T.bass.split(/\s+/)];
  MUS.i=0;MUS.t=SND.a.currentTime+.08;const gain=MUS.gain;
  MUS.timer=setInterval(()=>{const a=SND.a;if(!a||MUS.gain!==gain)return;
    while(MUS.t<a.currentTime+.3){
      for(let v=0;v<2;v++){const arr=toks[v],tok=arr[MUS.i%arr.length];if(!tok||tok==='-'||tok==='.')continue;
        let len=1;while(arr[(MUS.i+len)%arr.length]==='-'&&len<16)len++;
        const f=noteFreq(tok);if(!f)continue;
        const o=a.createOscillator(),g=a.createGain(),d=step*len*.9,vol=v?(T.bv||.04):(T.mv||.02),t=MUS.t;
        o.type=v?'triangle':(T.mw||'square');o.frequency.value=f;
        g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.012);g.gain.setValueAtTime(vol,t+Math.max(.02,d-.06));g.gain.exponentialRampToValueAtTime(0.0001,t+d);
        o.connect(g);g.connect(gain);o.start(t);o.stop(t+d+.03);}
      MUS.i++;MUS.t+=step;}
  },70);
}
function jingle(notes,step){if(!SND.on||!ensureAudio())return;const a=SND.a;let t=a.currentTime+.03;for(const n of notes.split(/\s+/)){if(n!=='-'&&n!=='.'){const f=noteFreq(n);const o=a.createOscillator(),g=a.createGain();o.type='square';o.frequency.value=f;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(.05,t+.01);g.gain.exponentialRampToValueAtTime(0.0001,t+step*1.8);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+step*2);}t+=step;}}
// タブを 切りかえたり 画面を 消したりしたら 音を 止める（AudioContext ごと 一時停止。もどったら 再開）
function pauseAudio(){try{if(SND.a&&SND.a.state==='running')SND.a.suspend();}catch(e){}}
function resumeAudio(){try{if(SND.on&&SND.a&&SND.a.state==='suspended')SND.a.resume().then(()=>{if(MUS.name&&!MUS.timer)startMusic();}).catch(()=>{});}catch(e){}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseAudio();else resumeAudio();});
window.addEventListener('pagehide',pauseAudio);window.addEventListener('blur',()=>{if(document.hidden)pauseAudio();});
const unlockAudio=()=>{if(!SND.on)return;if(ensureAudio()&&!MUS.timer&&MUS.name){if(SND.a.state==='running')startMusic();else SND.a.resume().then(()=>startMusic()).catch(()=>{});}};
document.addEventListener('pointerdown',unlockAudio);document.addEventListener('keydown',unlockAudio);

// ---- sprites.js ----
// ===== sprites: wombat classes, enemies, field, tiles =====
function toCanvas(R){const c=document.createElement('canvas');c.width=R.W;c.height=R.H;const x=c.getContext('2d');
  for(let y=0;y<R.H;y++)for(let i=0;i<R.W;i++){const k=R.img[y*R.W+i];if(!k)continue;x.fillStyle=PAL[k]||k;x.fillRect(i,y,1,1);}return c;}
const SPR=new Map();function cached(key,fn){if(!SPR.has(key))SPR.set(key,fn());return SPR.get(key);}
function silhouette(c,col){const s=document.createElement('canvas');s.width=c.width;s.height=c.height;const x=s.getContext('2d');x.drawImage(c,0,0);x.globalCompositeOperation='source-atop';x.fillStyle=col;x.fillRect(0,0,c.width,c.height);return s;}

// ---------- class accessories ----------
const ACC_COL={
  war:{x:'#a7b0ba',h:'#eef2f6',s:'#626a74',r:'#d8463a'},
  mag:{x:'#7350c4',h:'#9c7ee6',s:'#45307f',y:'#ffd36b'},
  pri:{w:'#f4efe4',s:'#bdb4a3',r:'#d8463a',g:'#5fb85a',h:'#ffffff'},
  kar:{r:'#d8463a',h:'#f4efe4'},
  poi:{g:'#4f8a3a',p:'#a050c8',s:'#2f5a22'},
  sin:{b:'#2f7ac8',h:'#7ab8f0',s:'#1d4b80',f:'#ffd36b'},
  king:{y:'#ffd36b',r:'#d8463a',s:'#b08a20',b:'#3a7ad8'},
};
// 上級職は、条件の1つめの基本職の かざりを、職業の色にする
const JOB_TINT={hwar:'#e8c050',ber:'#8a1a1a',pal:'#f8f0c0',mfi:'#e8802a',dan:'#e86aa8',ill:'#4a3aa8',cur:'#5a2a6a',hym:'#a8d8ff',apo:'#2a9a8a',
  kNin:'#3a3a4a',kAll:'#ffd36b',kMag:'#9a6ae0',kAtk:'#d8463a',kIdl:'#ff8ac8',kDig:'#a8783a'};
function mixHex(a,b,k){const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const A=p(a),B=p(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*k).toString(16).padStart(2,'0')).join('');}
function accFor(job){
  const J=JOBS[job]||{tier:1};
  if(J.tier===1)return {key:job,col:ACC_COL[job]};
  if(J.tier===2){const base=J.req[0],col={};for(const k in ACC_COL[base])col[k]=mixHex(ACC_COL[base][k],JOB_TINT[job],.55);return {key:base,col};}
  const col=Object.assign({},ACC_COL.king,{b:JOB_TINT[job]});return {key:'king',col};
}
const ACC={
  war:{side:{x:22,y:3,rows:[
    '......rr......',
    '.....rrrr.....',
    '....xxxxxx....',
    '..xxhhxxxxxx..',
    '.xxhxxxxxxxxx.',
    'xxxxxxxxxxxxxx',
    'ssssssssssssss']},
       front:{x:11,y:0,rows:[
    '........rr........',
    '.......rrrr.......',
    '.....xxxxxxxx.....',
    '...xxhhxxxxxxxx...',
    '..xxhxxxxxxxxxxx..',
    '.xxxxxxxxxxxxxxxx.',
    'xxxxxxxxxxxxxxxxxx',
    'ssssssssssssssssss']}},
  mag:{side:{x:20,y:0,rows:[
    'xx..............',
    '.xxx............',
    '..xxxx..........',
    '...xxxxx........',
    '....xxhxx.......',
    '.....xxhxx......',
    '.....xyyyyx.....',
    '....xxxxxxxx....',
    'xxxxxxxxxxxxxxxx',
    '.ssssssssssssss.']},
       front:{x:10,y:-3,rows:[
    '.........xx.........',
    '........xxx.........',
    '........xxxx........',
    '.......xxhxx........',
    '.......xxhxxx.......',
    '......xxxhxxx.......',
    '......xxxxxxxx......',
    '.....xyyyyyyyyx.....',
    '....xxxxxxxxxxxx....',
    'xxxxxxxxxxxxxxxxxxxx',
    '.ssssssssssssssssss.']}},
  kar:{side:{x:21,y:9,rows:[
    '..rrrrrrrrrrrr',
    'rrrhrrrrrrrrrr',
    '.r.rrrrrrrrrr.',
    'r.............']},
       front:{x:11,y:6,rows:[
    '.rrrrrrrrrrrrrrrr.',
    'rrrrrrrhhrrrrrrrrr',
    '.rrrrrrrrrrrrrrrr.']}},
  poi:{side:{x:21,y:3,rows:[
    '....gggg......',
    '..gggggggg....',
    '.gggpggggggg..',
    'gggggggggggggg',
    'ssssssssssssss']},
       front:{x:10,y:0,rows:[
    '......gggggggg......',
    '....gggggggggggg....',
    '..gggggggpgggggggg..',
    '.gggggggpppggggggggg',
    'ssssssssssssssssssss']}},
  sin:{side:{x:20,y:0,rows:[
    '.......f......',
    '......ff......',
    '.....ff.......',
    '....bbbbbbb...',
    '..bbbhbbbbbbb.',
    'bbbbbbbbbbbbbb',
    '.ssssssssssss.']},
       front:{x:10,y:-2,rows:[
    '..........f.........',
    '.........ff.........',
    '........ff..........',
    '.....bbbbbbbbbb.....',
    '...bbbhbbbbbbbbbb...',
    '.bbbbbbbbbbbbbbbbbb.',
    '..ssssssssssssssss..']}},
  king:{side:{x:22,y:1,rows:[
    '.y..y..y..y..',
    '.yy.yy.yy.yy.',
    '.yyyyyyyyyyy.',
    '.yyrybyyyryy.',
    '.sssssssssss.']},
       front:{x:11,y:-1,rows:[
    '..y...y...y...y...',
    '..yy..yy..yy..yy..',
    '..yyyyyyyyyyyyyy..',
    '..yyyryyybyyryyy..',
    '..ssssssssssssss..']}},
  pri:{side:{x:22,y:2,rows:[
    '........gg...',
    '.......ggg...',
    '.....g.gg....',
    '.....ggg.....',
    '..wwwwwwwww..',
    '.wwhwwwrwwww.',
    'wwwwwwrrrwwww',
    'sssssssrsssss']},
       front:{x:11,y:-2,rows:[
    '..........gg......',
    '.........ggg......',
    '.......g.gg.......',
    '.......ggg........',
    '....wwwwwwwwww....',
    '..wwhwwwwrwwwwww..',
    '.wwwwwwwrrrwwwwww.',
    'wwwwwwwwwrwwwwwwww',
    'ssssssssssssssssss']}},
};
function withAcc(R,job,view){
  const af=accFor(job),A=ACC[af.key][view],C=af.col,PT=8,W=R.W,H=R.H+PT,img=new Array(W*H).fill(0);
  for(let y=0;y<R.H;y++)for(let x=0;x<W;x++)img[(y+PT)*W+x]=R.img[y*W+x];
  const m=new Array(W*H).fill(0);
  A.rows.forEach((row,j)=>{for(let i=0;i<row.length;i++){const ch=row[i];if(ch==='.')continue;const X=A.x+i,Y=A.y+j+PT;if(X>=0&&Y>=0&&X<W&&Y<H)m[Y*W+X]=C[ch];}});
  const out=img.slice();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(m[i])continue;
    if((x>0&&m[i-1])||(x<W-1&&m[i+1])||(y>0&&m[i-W])||(y<H-1&&m[i+W]))out[i]='o';}
  for(let i=0;i<W*H;i++)if(m[i])out[i]=m[i];
  return {W,H,ax:R.ax,img:out};
}
function wombatSprite(cls,view,pose){
  const key='w|'+cls+'|'+view+'|'+JSON.stringify(pose||{});
  return cached(key,()=>toCanvas(withAcc(view==='side'?renderWombat(pose||{}):renderFront(pose||{}),cls,view)));
}

// ---------- enemy sprites ----------
const EPAL={
  antR:{m:'#a3392b',l:'#cf5a44',d:'#6b2219',a:'#f0c04a',e:'#1a0d08'},
  antG:{m:'#6f9a3a',l:'#9cc25a',d:'#47661f',a:'#d9c05a',e:'#1a0d08'},
  spid:{m:'#a08262',l:'#cbab84',d:'#33241a',a:'#d8c3a0',e:'#1a0d08'},
  fox: {m:'#d0702e',l:'#ee9a52',d:'#93481a',b:'#f6ead8',w:'#fbf6ee',e:'#1a0d08'},
  dingo:{m:'#d39a55',l:'#ecc283',d:'#9c6a32',b:'#f3e2c2',w:'#f3e2c2',e:'#1a0d08'},
  dboss:{m:'#b0703a',l:'#d89a5c',d:'#6e4220',b:'#efd8b0',w:'#efd8b0',e:'#b01e1e'},
  shadow:{m:'#3c3450',l:'#5c5278',d:'#221d30',b:'#7a6e98',w:'#7a6e98',e:'#ff5a7a'},
  tiger:{m:'#7a6a2a',b:'#e2c650',d:'#3e3412',l:'#a89040',e:'#ffdd33',t:'#d8463a'},
  sea: {m:'#2f4f78',b:'#e8e4d0',d:'#1b2c45',l:'#4b6f9a',e:'#111',t:'#d8463a'},
  toad:{m:'#8b7448',l:'#b3995f',d:'#5c4a2a',b:'#e3d3a6',a:'#5c4a2a',e:'#d4a020'},
  crab:{m:'#3d5a52',l:'#5d7f73',d:'#22362f',a:'#c76a3a',e:'#111'},
  bat: {m:'#4a3628',l:'#c88a3a',d:'#2a1c14',a:'#6b5040',e:'#111'},
  croc:{m:'#5b6b3a',l:'#7d8f52',d:'#36421f',b:'#c9c08a',e:'#e0b020',w:'#ffffff'},
  devil:{m:'#2a2420',l:'#443a34',d:'#141010',b:'#f2ede4',p:'#e08a8a',e:'#111',w:'#f2ede4'},
  eagle:{m:'#4a3424',l:'#b8843f',d:'#2a1c12',a:'#e8b830',e:'#111'},
  echidna:{m:'#5a4632',l:'#efe4c8',d:'#3a2a1c',b:'#8a6a4a',a:'#2a1c12'},
  opalE:{m:'#3a4a7a',l:'#9af0ff',d:'#22305a',b:'#c8b0ff',a:'#ff7ad0'},
  goldE:{m:'#a0701a',l:'#fff2a0',d:'#6a4610',b:'#ffd75a',a:'#fff8e0'},
  gold:{m:'#c99a20',l:'#fff6b0',d:'#7a5a10',b:'#e8c050',a:'#8a6a10'},
  goanna:{m:'#45402f',l:'#625a46',d:'#26231a',b:'#d8c070',e:'#e0b020',w:'#ffffff'},
  perentie:{m:'#9a6a3a',l:'#c08a4e',d:'#5e3e20',b:'#f0d8a0',e:'#e0b020',w:'#ffffff'},
  tide:{m:'#5a3a6a',l:'#7a5a8e',d:'#33203e',a:'#e05a7a',e:'#111'},
  ancient:{m:'#c9a24a',l:'#f0d890',d:'#7a5a20',b:'#fff0c0',w:'#fff0c0',e:'#30e0ff'},
  koala:{m:'#8e939a',l:'#bcc1c7',d:'#5d6268',b:'#eef0f2',n:'#1b1b1e',e:'#e0202a',w:'#ffffff',a:'#e8e2d0'},
  // 続編で足した色
  koalaN:{m:'#8e939a',l:'#bcc1c7',d:'#5d6268',b:'#eef0f2',n:'#1b1b1e',e:'#1a1a1e',w:'#ffffff',a:'#e8e2d0'},
  kMage:{m:'#7a68a8',l:'#a898d0',d:'#4a3c70',b:'#ece4ff',n:'#1b1b1e',e:'#ffd36b',w:'#ffffff',a:'#ffd36b'},
  kMageB:{m:'#5a3a8a',l:'#8a6ac0',d:'#341e58',b:'#e0d0ff',n:'#120a1e',e:'#ff4aff',w:'#ffffff',a:'#ffd36b'},
  kPriest:{m:'#d8d4cc',l:'#f4f0e8',d:'#a8a49c',b:'#ffffff',n:'#1b1b1e',e:'#3a7ad8',w:'#ffffff',a:'#5fb85a'},
  kSinger:{m:'#c88ab0',l:'#e8b0d0',d:'#8a5a7a',b:'#fff0f8',n:'#1b1b1e',e:'#1a1a1e',w:'#ffffff',a:'#ffd36b'},
  kPoison:{m:'#6a9a5a',l:'#90c07a',d:'#3e6034',b:'#e8f4e0',n:'#1b1b1e',e:'#a050c8',w:'#ffffff',a:'#a050c8'},
  kWarrior:{m:'#6a7a8a',l:'#98a8b8',d:'#3e4a58',b:'#e8eef4',n:'#1b1b1e',e:'#d8463a',w:'#ffffff',a:'#d8463a'},
  kKarate:{m:'#c8823a',l:'#e8a868',d:'#8a5420',b:'#fff0e0',n:'#1b1b1e',e:'#1a1a1e',w:'#ffffff',a:'#f4efe4'},
  koalaG:{m:'#c9a24a',l:'#f0d890',d:'#7a5a20',b:'#fff0c0',n:'#2a1e0a',e:'#30e0ff',w:'#ffffff',a:'#fff0c0'},
  antQ:{m:'#7a3aa8',l:'#a868d8',d:'#4a1a6a',a:'#ffd36b',e:'#1a0d08'},
  honey:{m:'#d89a2a',l:'#f8c860',d:'#8a5a10',a:'#f0d080',e:'#1a0d08'},
  kooka:{m:'#8a6a4a',l:'#f0ead8',d:'#4a3424',a:'#3a3a3a',e:'#111'},
  lyre:{m:'#6a4a32',l:'#a8805a',d:'#3a2618',a:'#d0c0a0',e:'#111'},
  frill:{m:'#9a7a4a',l:'#c09a62',d:'#5a4228',b:'#e8803a',e:'#e0b020',w:'#ffffff'},
  crocB:{m:'#3e4a26',l:'#5d6b3a',d:'#232c12',b:'#a8a070',e:'#ff3a2a',w:'#ffffff'},
  octo:{m:'#c8a060',l:'#e8c888',d:'#7a5a30',a:'#2a6aff',e:'#111'},
  ray:{m:'#8a8070',l:'#b0a890',d:'#5a5040',a:'#ffe24a',e:'#111'},
  // B21〜50（STAGE3.md）
  platy:{m:'#6a4a32',l:'#8c6a4a',d:'#3e2a1a',a:'#3a3a40',e:'#111'},
  platyB:{m:'#4e3424',l:'#7a5638',d:'#2a1a10',a:'#2a2a34',e:'#ff4a2a'},
  yabby:{m:'#4a5a6a',l:'#6a7e90',d:'#2a3440',a:'#5a7090',e:'#111'},
  rakali:{m:'#5a4a3a',l:'#7a6650',d:'#3a2e22',b:'#e8b860',w:'#fbf6ee',e:'#111',p:'#c89a7a'},
  archer:{m:'#c8c8a8',l:'#eeeed8',d:'#7a7a5a',b:'#f4f4e4',a:'#2a2a24',e:'#111'},
  glow:{m:'#d8d0b8',l:'#f0ead8',d:'#9a927a',a:'#7cf0ff',e:'#111'},
  ghost:{m:'#c8c4cc',l:'#ecebf0',d:'#8a8690',a:'#e8b8c0',e:'#c81e2a'},
  cod:{m:'#6a8a4a',l:'#8aaa62',d:'#3e5a2a',b:'#ece8c8',a:'#2e4a1e',e:'#111'},
  codB:{m:'#4e6e36',l:'#6e904e',d:'#2a421a',b:'#e0dcb8',a:'#1e3412',e:'#ff4a2a'},
  turtle:{m:'#5a4a30',l:'#7e6a46',d:'#34281a',b:'#d8c89a',a:'#c8a860',e:'#111'},
  fwcroc:{m:'#8a7a4a',l:'#aa9a62',d:'#5a4a2a',b:'#ddd0a0',e:'#e0b020',w:'#ffffff'},
  thorny:{m:'#c88a3a',l:'#e8b060',d:'#7a4a1a',b:'#f0d090',e:'#111',w:'#ffffff'},
  redroo:{m:'#b8603a',l:'#d8845a',d:'#7a3a1e',b:'#f0dcc8',e:'#111'},
  redrooB:{m:'#a04a2a',l:'#c8704a',d:'#6a2a12',b:'#f4e0c8',e:'#e01e1e'},
  emu:{m:'#6a5a4a',l:'#8a7a66',d:'#3e3226',b:'#3a4a6a',a:'#4a3a2a',e:'#f0a020'},
  bilby:{m:'#9aa0aa',l:'#c4cad2',d:'#5e646e',b:'#f2f2f2',w:'#fbfbfb',e:'#111',p:'#e8a0b0'},
  taipan:{m:'#8a6a3a',b:'#d8b878',d:'#4a3418',l:'#a8884a',e:'#111',t:'#2a1a10'},
  scorp:{m:'#a8783a',l:'#c89a5a',d:'#5a3a18',a:'#d83a2a',e:'#111'},
  galah:{m:'#9a9aa2',l:'#e888a8',d:'#5e5e66',a:'#f0d8e0',e:'#111'},
  shingle:{m:'#5a4a3a',l:'#8a6e52',d:'#2e241a',b:'#3a6ad8',e:'#111',w:'#ffffff'},
  thyla:{m:'#c8a060',l:'#e0c080',d:'#8a6a3a',b:'#f0e0c0',w:'#f0e0c0',e:'#111',s:'#3a2a1a'},
  procop:{m:'#8a6a4a',l:'#aa8a66',d:'#54402a',b:'#e8d8b8',e:'#111'},
  genyo:{m:'#5a4e44',l:'#7a6e62',d:'#342c24',b:'#3a3a3a',a:'#e8c040',e:'#e0c040'},
  meio:{m:'#6a6a50',l:'#8e8e6e',d:'#3e3e2c',b:'#d0c8a0',a:'#e8e0c0',e:'#111'},
  wonambi:{m:'#4a5a3a',b:'#a8a878',d:'#2a3420',l:'#6a7a52',e:'#e0c020',t:'#d8463a'},
  quink:{m:'#6a5a4a',l:'#8a7a66',d:'#3e3226',b:'#d8c8a8',e:'#ff8a2a',w:'#ffffff'},
  thyleo:{m:'#a88850',l:'#c8a870',d:'#6a5430',b:'#f0e0c0',w:'#f0e0c0',e:'#111',p:'#c08a6a'},
  thyleoB:{m:'#8a6a3a',l:'#b08a50',d:'#54401e',b:'#efd8b0',w:'#efd8b0',e:'#ff3a2a',p:'#c08a6a'},
  opal:{m:'#7aa8c8',l:'#c8e8f8',d:'#4a6a9a',b:'#f0e8ff',a:'#ff8ad8',e:'#ffe24a'},
  // コアラ討伐の 上級・超上級コアラ（a：はちまき・冠の色）
  kHwar:{m:'#7a6a5a',l:'#a8988a',d:'#4a3e34',b:'#f0e8e0',n:'#1b1b1e',e:'#d8463a',w:'#ffffff',a:'#d8463a'},
  kPal:{m:'#a8b0c0',l:'#d8e0ec',d:'#6a7488',b:'#ffffff',n:'#1b1b1e',e:'#3a7ad8',w:'#ffffff',a:'#e8c040'},
  kHym:{m:'#d8b0d8',l:'#f4dcf4',d:'#9a709a',b:'#fff4ff',n:'#1b1b1e',e:'#5fb85a',w:'#ffffff',a:'#5fb85a'},
  kIll:{m:'#6a7ab8',l:'#9aaae0',d:'#3e4a80',b:'#e8ecff',n:'#1b1b1e',e:'#ff8ad8',w:'#ffffff',a:'#ff8ad8'},
  kCur:{m:'#5a4a6a',l:'#8a789a',d:'#342a40',b:'#e0d8e8',n:'#120a1e',e:'#a0ff60',w:'#ffffff',a:'#a050c8'},
  kApo:{m:'#7aa87a',l:'#a8d0a8',d:'#4a704a',b:'#f0fff0',n:'#1b1b1e',e:'#e8e0a0',w:'#ffffff',a:'#f0f0f0'},
  kIdl:{m:'#e8a0b8',l:'#ffd0e0',d:'#a86078',b:'#fff4f8',n:'#1b1b1e',e:'#1a1a1e',w:'#ffffff',a:'#ffd36b'},
  kNin:{m:'#3a3a4a',l:'#5a5a6e',d:'#1e1e28',b:'#c8c8d8',n:'#0a0a10',e:'#ff4a4a',w:'#ffffff',a:'#ffd36b'},
  kDig:{m:'#9a7a52',l:'#c8a478',d:'#5e4a2e',b:'#f4e8d0',n:'#1b1b1e',e:'#1a1a1e',w:'#ffffff',a:'#ffd36b'},
  kAtk:{m:'#b85a3a',l:'#e0845e',d:'#6e3220',b:'#ffe8d8',n:'#1b1b1e',e:'#ffe24a',w:'#ffffff',a:'#ffd36b'},
  kMagK:{m:'#3e2a6a',l:'#6a50a0',d:'#22163e',b:'#e0d0ff',n:'#0a061a',e:'#7cf0ff',w:'#ffffff',a:'#ffd36b'},
  kAllK:{m:'#c8c8d0',l:'#f4f4fa',d:'#8a8a96',b:'#ffffff',n:'#1b1b1e',e:'#e8c040',w:'#ffffff',a:'#ffd36b'},
  megal:{m:'#4a3e30',l:'#6e5e4a',d:'#28201a',b:'#b8a070',e:'#ff2a1a',w:'#ffffff'},
};
// 色違い（B21〜）：もとの色を、その色に寄せる
const TINT_COL={'あお':'#3a6ad8','あか':'#d83a3a','くろ':'#2a2430','きん':'#e8c040'};
function tintPal(pal,color){const T=TINT_COL[color];if(!T)return pal;const o={};for(const k in pal)o[k]=k==='e'||k==='w'?pal[k]:mixHex(pal[k],T,.45);return o;}
function eg(W,H){return mkGrid(Math.ceil(W),Math.ceil(H));}
function eline(G,x0,y0,x1,y1,c,t,p){t=t||1;const n=Math.ceil(Math.hypot(x1-x0,y1-y0)*2)+1;for(let k=0;k<=n;k++){const x=x0+(x1-x0)*k/n,y=y0+(y1-y0)*k/n;for(let a=0;a<t;a++)for(let b=0;b<t;b++)G.S(x+a-Math.floor(t/2),y+b-Math.floor(t/2),c,p||9);}}
function shade(c){return (x,y,dy)=>dy<-.45?c.l:dy>.45?c.d:c.m;}
function finish(G,extra){const fin=outline(G);const P=(x,y,col)=>{x=Math.floor(x);y=Math.floor(y);if(x>=0&&y>=0&&x<G.W&&y<G.H)fin[y*G.W+x]=col;};if(extra)extra(P);return {W:G.W,H:G.H,img:fin};}

const GEN={
  ant(c,s){const K=s,G=eg(40*K,26*K),{E}=G;
    for(const [x0,x1,y1] of [[20,12,23],[21,21,24],[22,29,23]]){eline(G,x0*K,15*K,((x0+x1)/2)*K,10*K+ (x1===21?2:0)*K,c.d,Math.max(1,Math.round(K)),1);eline(G,((x0+x1)/2)*K,10*K+(x1===21?2:0)*K,x1*K,y1*K,c.d,Math.max(1,Math.round(K)),1);}
    E(10*K,15*K,8*K,6*K,2,shade(c));E(20*K,14*K,4.2*K,3.2*K,3,shade(c));E(28*K,12*K,5*K,4.6*K,4,shade(c));
    eline(G,30*K,8*K,34*K,2*K,c.d,1,5);eline(G,34*K,2*K,37*K,3*K,c.d,1,5);
    return finish(G,P=>{for(let k=0;k<3*K;k++){P(32*K+k,14*K+k*.6,c.a);P(32*K+k,15*K+k*.4,c.a);}P(29*K,10*K,c.e);P(30*K,10*K,c.e);P(29*K,9*K,'#fff');P(7*K,12*K,c.l);P(8*K,11*K,c.l);});},
  spider(c,s){const K=s,G=eg(44*K,28*K),{E}=G;
    const cx=24*K,cy=15*K;
    for(const sd of [-1,1])for(let i=0;i<4;i++){const ky=4*K+i*1.5*K,kx=cx+sd*(6+i*3.5)*K,fx=cx+sd*(9+i*4.5)*K;
      eline(G,cx,cy,kx,ky,c.d,Math.max(2,Math.round(2*K)),1);eline(G,kx,ky,Math.min(43*K,Math.max(0,fx)),26*K,c.d,Math.max(1,Math.round(1.5*K)),1);}
    E(16*K,14*K,8*K,7*K,2,shade(c));E(26*K,16*K,6*K,5*K,3,shade(c));
    return finish(G,P=>{for(const [x,y] of [[29,14],[31,14],[30,15.5],[28,16]])P(x*K,y*K,c.e);P(13*K,11*K,c.a);P(15*K,10*K,c.a);P(17*K,11*K,c.a);P(14*K,13*K,c.a);P(18*K,14*K,c.a);});},
  quad(c,s,o){const K=s,W=46*K,H=32*K,G=eg(W,H),{S,E,SE}=G;o=o||{};
    const bx=19*K,by=17*K,body=shade(c);
    for(const [lx,col] of [[9,c.d],[26,c.d],[13,c.m],[30,c.m]])for(let y=by+2*K;y<=29*K;y++)for(let x=lx*K;x<(lx+3)*K;x++)S(x,y,y>27.5*K?c.d:col,1);
    if(o.tail==='bushy'){SE(6*K,20*K,6*K,3.4*K,2,2,(x)=>x<3.5*K?c.w:c.m);}
    else if(o.tail==='short'){E(7.5*K,16*K,3*K,2.2*K,2,()=>c.d);}
    else {eline(G,8*K,14*K,3*K,21*K,c.m,Math.max(2,Math.round(2.4*K)),2);S(3*K,22*K,c.w,2);}
    E(bx,by,(o.stocky?11.5:12.5)*K,(o.stocky?8:6.6)*K,3,body);
    if(c.b&&!o.band)E(bx+3*K,by+3.5*K,7*K,2.6*K,4,()=>c.b);
    if(o.band)for(let y=by-6*K;y<by+3*K;y++)for(let x=bx+5*K;x<bx+7.5*K;x++)S(x,y,c.b,4);
    const hx=33*K,hy=11*K;
    E(hx,hy,6.2*K,5.6*K,5,body);
    const sn=o.snout==null?1:o.snout;
    SE(hx+(4+sn)*K,hy+2*K,(3.6+sn)*K,2.7*K,2.2,5,(x,y,dy)=>dy>.15?(c.b||c.l):c.m);
    if(o.ears==='round'){E(hx-3.5*K,hy-5*K,2.3*K,2.3*K,6,()=>c.p||c.d);E(hx+1.5*K,hy-5.3*K,2.3*K,2.3*K,6,()=>c.p||c.d);}
    else for(const ex of [hx-3.2*K,hx+1.2*K]){const top=hy-(o.ears==='long'?13:10)*K,h=(o.ears==='long'?8:5)*K;for(let j=0;j<=h;j++){const w=(j/h)*2.3*K;for(let x=ex-w;x<=ex+w;x++)S(x,top+j,j<h*.5?c.d:c.m,6);}}
    return finish(G,P=>{const e=c.e;P(hx+1*K,hy-1.5*K,e);P(hx+1*K+1,hy-1.5*K,e);if(K>1.2){P(hx+1*K,hy-1.5*K+1,e);P(hx+1*K+1,hy-1.5*K+1,e);}
      const nx=hx+(7.4+2*sn)*K;P(nx,hy+1.2*K,'#120a08');P(nx-1,hy+1.2*K,'#120a08');P(nx,hy+1.2*K+1,'#120a08');
      P(nx-2*K,hy+4*K,'#120a08');P(nx-3*K,hy+4*K,'#120a08');});},
  fox(c,s){return GEN.quad(c,s,{tail:'bushy',snout:1.4});},
  dingo(c,s){return GEN.quad(c,s,{tail:'thin',snout:1});},
  devil(c,s){return GEN.quad(c,s,{tail:'short',snout:0,ears:'round',stocky:true,band:true});},
  snake(c,s){const K=s,G=eg(46*K,32*K),{E}=G;
    const pts=[];for(let i=0;i<=70;i++){const t=i/70;let x,y;if(t<.78){x=4+30*t/.78;y=25+4.2*Math.sin(t*10.5);}else{const u=(t-.78)/.22;x=34+3*u;y=25+4.2*Math.sin(.78*10.5)-(14*u);}pts.push([x*K,y*K,t]);}
    for(const [x,y,t] of pts){const rr=(1.2+2.4*Math.min(1,t*2.2))*K;E(x,y,rr,rr,2,()=> (Math.floor(t*16)%2?c.b:c.m));}
    const hx=38.5*K,hy=10*K;E(hx,hy,4.8*K,3.4*K,6,(x,y,dy)=>dy>.35?c.b:c.m);
    return finish(G,P=>{P(hx+.5*K,hy-1.3*K,c.e);P(hx+.5*K+1,hy-1.3*K,c.e);P(hx+.5*K,hy-1.3*K+1,'#111');
      for(let k=0;k<4*K;k++)P(hx+5*K+k,hy+1*K+k*.2,c.t);P(hx+5*K+4*K,hy+.4*K,c.t);P(hx+5*K+4*K,hy+2*K,c.t);});},
  toad(c,s){const K=s,G=eg(38*K,28*K),{E,S}=G,r=rng(5);
    for(const lx of [8,24])for(let y=18*K;y<=26*K;y++)for(let x=lx*K;x<(lx+5)*K;x++)S(x,y,c.d,1);
    E(18*K,17*K,15*K,9*K,2.4,(x,y,dy)=>dy>.45?c.b:dy<-.5?c.l:c.m);
    E(27*K,8.5*K,3.4*K,3*K,4,()=>c.l);E(19*K,8*K,3*K,2.8*K,4,()=>c.l);
    const fin=finish(G,P=>{for(let k=0;k<26*K;k++){const x=5*K+r()*26*K,y=10*K+r()*10*K;P(x,y,c.a);}
      P(27*K,8*K,c.e);P(28*K,8*K,'#111');P(19*K,7.5*K,c.e);P(20*K,7.5*K,'#111');
      for(let k=0;k<12*K;k++)P(20*K+k,16*K+Math.sin(k/(12*K)*3)*1,'#2a1a10');});return fin;},
  crab(c,s){const K=s,G=eg(46*K,30*K),{E,SE}=G;
    for(const sd of [-1,1])for(let i=0;i<3;i++){const x0=23*K+sd*(8+i*2)*K;eline(G,x0,18*K,x0+sd*6*K,22*K,c.d,Math.max(1,Math.round(1.5*K)),1);eline(G,x0+sd*6*K,22*K,x0+sd*7*K,28*K,c.d,Math.max(1,Math.round(1.5*K)),1);}
    for(const sd of [-1,1]){eline(G,23*K+sd*10*K,15*K,23*K+sd*16*K,11*K,c.a,Math.max(2,Math.round(2*K)),2);E(23*K+sd*17*K,9*K,5.4*K,4.4*K,3,(x,y,dy)=>dy<-.3?'#e08a52':c.a);}
    SE(23*K,17*K,14*K,7.5*K,2.6,4,shade(c));
    return finish(G,P=>{for(const sd of [-1,1]){P(23*K+sd*3*K,9*K,c.e);P(23*K+sd*3*K,10*K,c.d);P(23*K+sd*3*K,11*K,c.d);
      for(let k=0;k<3*K;k++)P(23*K+sd*(19+k*.3)*K,9*K-.5*K+k*.4,'#2a120a');}});},
  bat(c,s){const K=s,G=eg(50*K,30*K),{E,S}=G;
    for(const sd of [-1,1])for(let x=0;x<21*K;x++){const X=25*K+sd*(3*K+x),t=x/(21*K),top=4*K+t*3*K,bot=22*K-t*8*K+Math.abs(Math.sin(t*9.4))*3*K;for(let y=top;y<bot;y++)S(X,y,c.d,1);}
    E(25*K,15*K,5*K,8*K,2,(x,y,dy)=>dy<-.2?c.l:c.m);
    E(25*K,6.5*K,4.2*K,3.6*K,3,()=>c.l);
    for(const sd of [-1,1])for(let j=0;j<3*K;j++)S(25*K+sd*2.6*K,2*K+j,c.m,4);
    return finish(G,P=>{for(const sd of [-1,1]){for(let k=1;k<4;k++)eline({S:(x,y)=>P(x,y,c.a)},25*K+sd*4*K,8*K,25*K+sd*(4+k*5.5)*K,(18-k*2.2)*K+Math.abs(Math.sin(k*1.2))*K,c.a,1);
      P(25*K+sd*1.6*K,6*K,c.e);}P(25*K,8*K,'#111');});},
  croc(c,s){const K=s,G=eg(68*K,30*K),{E,SE,S}=G;
    for(const lx of [20,40])for(let y=19*K;y<=25*K;y++)for(let x=lx*K;x<(lx+5)*K;x++)S(x,y,c.d,1);
    E(12*K,19*K,12*K,3.6*K,2,shade(c));
    SE(31*K,17*K,15*K,6*K,2.4,2,(x,y,dy)=>dy>.4?c.b:dy<-.5?c.l:c.m);
    SE(53*K,16.5*K,13*K,3.4*K,2.2,3,(x,y,dy)=>dy>.3?c.b:c.m);
    E(46*K,12.5*K,2.6*K,2.2*K,4,()=>c.m);
    return finish(G,P=>{for(let x=18*K;x<44*K;x+=3*K){P(x,11*K,c.d);P(x+1,10.5*K,c.d);}
      for(let x=44*K;x<64*K;x+=2.5*K)P(x,19*K,c.w);P(46*K,12*K,c.e);P(47*K,12*K,'#111');P(64*K,14.5*K,'#111');
      for(let x=44*K;x<65*K;x++)P(x,18*K,'#2a3018');});},
  eagle(c,s){const K=s,G=eg(54*K,40*K),{E,S}=G;
    for(const sd of [-1,1])for(let x=0;x<22*K;x++){const X=27*K+sd*(4*K+x),t=x/(22*K),top=12*K-t*10*K,bot=24*K-t*8*K+ (Math.floor(x/(2*K))%2)*2*K;for(let y=top;y<bot;y++)S(X,y,y<top+3*K?c.l:c.m,1);}
    for(let j=0;j<8*K;j++){const w=2*K+j*.55;for(let x=27*K-w;x<=27*K+w;x++)S(x,30*K+j,c.d,2);}
    E(27*K,21*K,6*K,10*K,2,(x,y,dy)=>dy<-.4?c.l:c.m);
    E(27*K,10*K,4.6*K,4.4*K,3,()=>c.l);
    return finish(G,P=>{P(25.5*K,9*K,c.e);P(28.5*K,9*K,c.e);for(let j=0;j<3*K;j++){P(26*K,12*K+j,c.a);P(27*K,12*K+j,c.a);P(28*K,12*K+j,c.a);}P(27*K,15*K,c.a);
      for(const sd of [-1,1])for(let k=0;k<3;k++)P(27*K+sd*(2+k)*K,31*K,c.a);});},
  echidna(c,s){const K=s,G=eg(38*K,26*K),{E,S}=G,r=rng(9);
    for(const lx of [9,22])for(let y=17*K;y<=23*K;y++)for(let x=lx*K;x<(lx+3)*K;x++)S(x,y,c.d,1);
    E(16*K,15*K,12*K,8*K,2.2,(x,y,dy)=>dy>.45?c.b:c.m);
    E(28*K,17*K,4.2*K,3.4*K,3,()=>c.b);
    for(let x=31*K;x<36*K;x++){S(x,18*K,c.b,4);S(x,19*K,c.b,4);}
    return finish(G,P=>{for(let k=0;k<70;k++){const a=Math.PI*(1.02+r()*.96),bx=16*K+Math.cos(a)*(9+r()*3)*K,by=15*K+Math.sin(a)*(5.5+r()*2.5)*K;
        P(bx,by,c.l);P(bx+Math.cos(a)*1.4*K,by+Math.sin(a)*1.4*K,c.l);P(bx+Math.cos(a)*2.4*K,by+Math.sin(a)*2.4*K,c.a);}
      P(28.5*K,15.5*K,'#111');P(35.5*K,18.5*K,'#111');});},
  koala(c,s){const K=s,G=eg(46*K,46*K),{E,SE,S}=G;
    for(const sd of [-1,1]){eline(G,23*K+sd*9*K,28*K,23*K+sd*17*K,18*K,c.m,Math.max(3,Math.round(4*K)),1);}
    E(23*K,34*K,12*K,10*K,2,(x,y,dy)=>dy>-.1&&Math.abs(x-23*K)<6*K?c.b:c.m);
    for(const sd of [-1,1]){E(23*K+sd*11*K,8*K,6.2*K,6*K,3,(x,y,dy)=>Math.hypot(x-(23*K+sd*11*K),y-8*K)<3.4*K?c.b:c.m);}
    E(23*K,15*K,11*K,9*K,2.3,(x,y,dy)=>dy<-.5?c.l:c.m);
    SE(23*K,17*K,3.6*K,5*K,2.6,6,(x,y,dy)=>dy<-.6?'#3a3a40':c.n);
    return finish(G,P=>{for(const sd of [-1,1]){const ex=23*K+sd*6*K,ey=13*K;P(ex,ey,c.e);P(ex+1,ey,c.e);P(ex,ey+1,c.e);P(ex+1,ey+1,c.e);P(ex-sd*1,ey-1,'#111');P(ex+(sd>0?1:0)-sd*2,ey-2,'#111');
        for(let k=0;k<3;k++)P(23*K+sd*(17+k*.6)*K,17*K-k*1.2*K,c.a);}
      for(let j=0;j<2*K;j++){P(21*K,23*K+j,c.w);P(25*K,23*K+j,c.w);}});},
};
GEN.octo=function(c,s){const K=s,G=eg(40*K,34*K),{E}=G;
  for(let i=0;i<8;i++){const x0=8*K+i*3.4*K,dir=i<4?-1:1;let x=x0,y=18*K;for(let k=0;k<6;k++){const nx=x+dir*(1+k*.4)*K+Math.sin(i+k)*1.2*K,ny=y+2.4*K;eline(G,x,y,nx,ny,k<3?c.m:c.d,Math.max(1,Math.round((2.4-k*.3)*K)),1);x=nx;y=ny;}}
  E(20*K,11*K,10*K,8.5*K,2.2,shade(c));
  return finish(G,P=>{for(const [x,y] of [[14,8],[24,7],[19,13],[27,12],[12,13],[22,4]]){P(x*K,y*K,c.a);P(x*K+1,y*K,c.a);P(x*K,y*K+1,c.a);}
    P(16*K,14*K,c.e);P(24*K,14*K,c.e);P(16*K,13*K,'#fff');P(24*K,13*K,'#fff');});};
GEN.ray=function(c,s){const K=s,G=eg(48*K,28*K),{E,S}=G;
  for(let x=34*K;x<46*K;x++)for(let y=13*K;y<15*K;y++)S(x,y,c.d,1);
  E(20*K,14*K,16*K,10*K,2,(x,y,dy)=>dy<-.4?c.l:dy>.5?c.d:c.m);
  E(33*K,14*K,5*K,5*K,2,shade(c));
  return finish(G,P=>{P(14*K,11*K,c.e);P(15*K,11*K,c.e);P(22*K,11*K,c.e);P(23*K,11*K,c.e);
    for(const [x,y] of [[6,6],[34,5],[8,22],[30,23],[40,9]]){P(x*K,y*K,c.a);P(x*K+1,y*K-1,c.a);P(x*K+2,y*K,c.a);}});};
// ---- B21〜50 の形 ----
GEN.platy=function(c,s){const K=s,G=eg(48*K,24*K),{E,SE,S}=G;
  SE(8*K,15*K,7*K,3.2*K,2.4,2,()=>c.d);
  for(const lx of [16,28])for(let y=17*K;y<=21*K;y++)for(let x=lx*K;x<(lx+4)*K;x++)S(x,y,c.d,1);
  E(22*K,14*K,12*K,6*K,3,shade(c));E(34*K,12*K,5*K,4.5*K,4,shade(c));
  SE(42*K,13*K,6*K,2.2*K,2.2,5,(x,y,dy)=>dy<-.3?mixHex(c.a,'#ffffff',.25):c.a);
  return finish(G,P=>{P(35*K,10*K,c.e);P(36*K,10*K,c.e);for(let k=0;k<3;k++)P((44+k)*K,12.5*K,'#18181c');});};
GEN.fish=function(c,s){const K=s,G=eg(46*K,28*K),{E,S}=G,r=rng(11);
  for(let j=0;j<10*K;j++){const h=j*.9;for(let y=14*K-h;y<=14*K+h;y++)S(10*K-j,y,c.d,1);}
  for(let j=0;j<6*K;j++)for(let x=18*K-j*.5;x<26*K-j*.8;x++)S(x,6.5*K-j,c.d,2);
  E(24*K,14*K,15*K,8.5*K,3,(x,y,dy)=>dy>.35?c.b:dy<-.5?c.l:c.m);
  return finish(G,P=>{for(let k=0;k<16;k++)P(14*K+r()*18*K,8.5*K+r()*7*K,c.a);P(33*K,11*K,'#fff');P(34*K,11*K,c.e);P(34*K,12*K,c.e);for(let k=0;k<4*K;k++)P(35*K+k,16*K,'#2a1a10');});};
function turtleShape(c,s,horn){const K=s,G=eg(52*K,30*K),{E,SE,S}=G;
  for(const lx of [11,31])for(let y=19*K;y<=26*K;y++)for(let x=lx*K;x<(lx+5)*K;x++)S(x,y,c.d,1);
  if(horn){eline(G,10*K,19*K,3*K,21*K,c.d,Math.max(2,Math.round(2*K)),1);E(3*K,21*K,2.6*K,2.6*K,1,()=>c.a);}
  else eline(G,9*K,19*K,4*K,21*K,c.d,Math.max(1,Math.round(1.5*K)),1);
  if(horn){E(40*K,17*K,5.5*K,4.6*K,4,shade(c));eline(G,38*K,13*K,35*K,8*K,c.a,Math.max(2,Math.round(2*K)),5);eline(G,42*K,13*K,46*K,8*K,c.a,Math.max(2,Math.round(2*K)),5);}
  else{eline(G,34*K,17*K,42*K,9*K,c.m,Math.max(2,Math.round(3*K)),3);E(44*K,8*K,3.8*K,2.8*K,4,shade(c));}
  SE(23*K,16*K,14*K,9*K,2.3,2,(x,y,dy)=>dy>.6?c.b:dy<-.45?c.l:c.m);
  return finish(G,P=>{for(const [x0,x1] of [[14,32],[18,28]])for(let x=x0*K;x<x1*K;x++)P(x,(x0===14?14:9.5)*K,c.d);for(const x of [17,23,29])for(let y=9*K;y<20*K;y++)P(x*K,y,c.d);
    if(horn){P(42*K,16*K,c.e);P(43*K,16*K,c.e);}else{P(45*K,7*K,c.e);P(46*K,7*K,c.e);}});}
GEN.turtle=function(c,s){return turtleShape(c,s,false);};
GEN.hturtle=function(c,s){return turtleShape(c,s,true);};
GEN.glow=function(c,s){const K=s,G=eg(38*K,40*K),{E,S}=G;
  for(let i=0;i<7;i++){const x=(5+i*4.6)*K,len=(16+((i*7)%5)*4)*K;for(let y=8*K;y<len;y++)S(x,y,c.l,1);for(let y=12*K;y<len;y+=3*K)S(x,y,c.a,2);}
  for(let i=0;i<5;i++)E((7+i*5)*K,6*K,3*K,2.6*K,3,shade(c));
  E(32*K,6*K,3.8*K,3.4*K,4,()=>c.a);
  return finish(G,P=>{P(5*K,5*K,c.e);P(5*K,6*K,c.e);for(const [x,y] of [[30,3],[35,4],[33,9]])P(x*K,y*K,'#ffffff');});};
GEN.roo=function(c,s){const K=s,G=eg(40*K,48*K),{E,SE,S}=G;
  eline(G,14*K,36*K,2*K,46*K,c.m,Math.max(3,Math.round(3.5*K)),1);
  SE(25*K,45.5*K,8*K,1.8*K,2,2,()=>c.d);E(18*K,37*K,6*K,7.5*K,2,shade(c));
  E(20*K,26*K,7*K,11*K,3,(x,y,dy)=>Math.abs(x-23*K)<3*K&&dy>-.3?c.b:(dy<-.5?c.l:c.m));
  eline(G,25*K,23*K,31*K,28*K,c.m,Math.max(2,Math.round(2*K)),4);
  for(const ex of [21*K,25*K]){for(let j=0;j<=6*K;j++){const w=(j/(6*K))*1.8*K;for(let x=ex-w;x<=ex+w;x++)S(x,4*K+j,j<3*K?c.d:c.m,6);}}
  E(25*K,13*K,5*K,4.5*K,5,shade(c));SE(30*K,14.5*K,3.6*K,2.4*K,2,5,()=>c.l);
  return finish(G,P=>{P(26*K,11.5*K,c.e);P(27*K,11.5*K,c.e);P(33.4*K,13.5*K,'#120a08');P(32*K,26*K,c.d);});};
GEN.emu=function(c,s){const K=s,G=eg(40*K,50*K),{E,SE,S}=G;
  for(const lx of [15,22]){eline(G,lx*K,30*K,(lx-1)*K,47*K,c.a,Math.max(1,Math.round(1.8*K)),1);SE((lx+1)*K,48*K,3.2*K,1*K,2,1,()=>c.a);}
  E(18*K,24*K,12*K,9*K,2,(x,y,dy)=>dy<-.4?c.l:dy>.5?c.d:c.m);
  eline(G,26*K,20*K,30*K,7*K,c.b,Math.max(2,Math.round(2.8*K)),3);
  E(31*K,5.5*K,3.2*K,2.8*K,4,()=>c.b);SE(35.5*K,6*K,2.4*K,1.1*K,2,4,()=>c.a);
  return finish(G,P=>{P(32*K,4.5*K,c.e);for(let k=0;k<10;k++){const x=(8+k*2)*K,y=(29+(k%3))*K;P(x,y,c.d);}});};
GEN.scorp=function(c,s){const K=s,G=eg(46*K,34*K),{E,S}=G;
  for(let i=0;i<4;i++){const x0=(15+i*3)*K;eline(G,x0,24*K,x0-3*K,30*K,c.d,Math.max(1,Math.round(1.2*K)),1);}
  for(let i=0;i<14;i++){const a=Math.PI*(.5+i/13*1.25),x=12*K+Math.cos(a)*9*K,y=14*K+Math.sin(a)*9*K;E(x,y,(2.4-i*.08)*K,(2.4-i*.08)*K,2,shade(c));}
  E(20*K,23*K,9*K,4.5*K,3,shade(c));
  for(const dy of [-3,2]){eline(G,27*K,22*K,34*K,(19+dy)*K,c.m,Math.max(2,Math.round(1.8*K)),4);E(37*K,(18+dy)*K,3.6*K,2.4*K,5,shade(c));}
  const tx=12*K+Math.cos(Math.PI*1.75)*9*K,ty=14*K+Math.sin(Math.PI*1.75)*9*K;
  return finish(G,P=>{for(let k=0;k<3*K;k++)P(tx+k*.6,ty+k*.4,c.a);P(27*K,21*K,c.e);P(28*K,21*K,c.e);});};
GEN.plesio=function(c,s){const K=s,G=eg(60*K,32*K),{E,SE,S}=G,r=rng(21);
  for(const [x0,y0,x1,y1] of [[18,20,9,29],[34,20,43,29],[16,12,8,5],[32,12,40,5]])eline(G,x0*K,y0*K,x1*K,y1*K,c.d,Math.max(2,Math.round(3*K)),1);
  eline(G,9*K,16*K,1*K,18*K,c.m,Math.max(2,Math.round(2.4*K)),1);
  E(24*K,16*K,15*K,7.5*K,2,(x,y,dy)=>dy>.4?c.b:dy<-.45?c.l:c.m);
  E(41*K,14*K,6*K,4.6*K,3,shade(c));SE(50*K,15*K,8.5*K,3*K,2.2,4,(x,y,dy)=>dy>.2?c.b:c.m);
  return finish(G,P=>{for(let k=0;k<26;k++){const x=12*K+r()*26*K,y=11*K+r()*10*K;P(x,y,[c.a,'#ffffff','#7cf0ff','#ffe24a'][k%4]);}
    for(let x=45*K;x<57*K;x+=2*K)P(x,16*K,'#ffffff');P(45*K,12*K,c.e);P(46*K,12*K,c.e);});};
GEN.rat=function(c,s){return GEN.quad(c,s,{tail:'thin',snout:1.6,ears:'round'});};
GEN.bilby=function(c,s){return GEN.quad(c,s,{tail:'thin',snout:2,ears:'long'});};
GEN.lion=function(c,s){return GEN.quad(c,s,{tail:'thin',snout:.3,ears:'round',stocky:true});};
GEN.thyla=function(c,s){const R=GEN.quad(c,s,{tail:'thin',snout:1.3});const K=s;
  for(let x=9*K;x<25*K;x+=3*K)for(let y=10.5*K;y<17*K;y++)for(let dx=0;dx<Math.max(1,Math.round(K));dx++){const i=Math.floor(y)*R.W+Math.floor(x)+dx;if(R.img[i]&&R.img[i]!=='o')R.img[i]=c.s;}
  return R;};
// 敵のドット絵：look = {spr, pal, s, tint}
function enemySprite(look){look=look||{spr:'dingo',pal:'dingo'};const key='e|'+look.spr+'|'+look.pal+'|'+(look.s||1)+'|'+(look.tint||'')+'|'+(look.acc||'');
  return cached(key,()=>{const pal=tintPal(EPAL[look.pal]||EPAL.dingo,look.tint),c=toCanvas(GEN[look.spr](pal,look.s||1));
    if(look.acc&&look.spr==='koala'){const x=c.getContext('2d'),K=look.s||1,R=(a,b,w,h,col)=>{x.fillStyle=col;x.fillRect(Math.round(a*K),Math.round(b*K),Math.max(1,Math.round(w*K)),Math.max(1,Math.round(h*K)));};
      if(look.acc==='band'){R(13,9.5,20,1.6,pal.a);R(31,8.5,3,1,pal.a);R(32,10.5,3,1,pal.a);} // はちまき（上級）
      else if(look.acc==='crown'){R(17,4,12,2.4,'#e8b830');for(const cx of [17,22,27])R(cx,1.5,2,2.6,'#e8b830');R(22.5,4.4,1,1,'#ff4a6a');R(18,4.6,10,.8,'#fff0a0');}} // 冠（超上級）
    return c;});}

// ---------- field wombat (16x16) ----------
const FW_ROWS={
  down:[
'................',
'...oo......oo...',
'..oppo....oppo..',
'..obboooooobbo..',
'.obllllllllllbo.',
'.oblllllllllllbo',
'obbbebbbbbbebbbo',
'obbbbbonnobbbbbo',
'obbbbbonnnbbbbbo',
'.obbbbbbbbbbbbo.',
'.obbbbbbbbbbbbo.',
'.odbbbbbbbbbbdo.',
'..oddddddddddo..',
'..oddoooooddo...'],
  up:[
'................',
'...oo......oo...',
'..oddo....oddo..',
'..obboooooobbo..',
'.obllllllllllbo.',
'.obllllllllllbo.',
'oblllllllllllbbo',
'obbbbbbbbbbbbbbo',
'obbbbbbbbbbbbbbo',
'.obbbbbbbbbbbbo.',
'.obbbbbbbbbbbbo.',
'.odbbbbbbbbbbdo.',
'..oddddddddddo..',
'..oddoooooddo...'],
  right:[
'................',
'................',
'.........oo.....',
'...oooooopdo....',
'..obllllllbbooo.',
'.obllllllbbbbbbo',
'.obbbbbbbbbbebbo',
'obbbbbbbbbbbbnno',
'obbbbbbbbbbbbnno',
'obbbbbbbbbbbbbo.',
'.obbbbbbbbbbbo..',
'.oddddddddddo...',
'..oddo..oddo....',
'..ooo...ooo.....'],
};
function fieldWombat(dir,frame){
  return cached('fw|'+dir+frame,()=>{
    const flip=dir==='left',rows=FW_ROWS[flip?'right':dir].slice();
    if(frame){ // 足ぶみ
      const n=rows.length;
      if(dir==='down'||dir==='up')rows[n-1]='...ooo..oddo....';
      else {rows[n-2]='...oddo.oddo....';rows[n-1]='...ooo..ooo.....';}
    }
    const c=document.createElement('canvas');c.width=16;c.height=16;const x=c.getContext('2d');
    const map={o:PAL.o,b:PAL.b,l:PAL.l,d:PAL.d,p:PAL.p,e:PAL.e,n:PAL.n,k:PAL.k};
    rows.forEach((r,j)=>{for(let i=0;i<16;i++){const ch=r[i];if(!ch||ch==='.')continue;x.fillStyle=map[ch];x.fillRect(flip?15-i:i,j+2,1,1);}});
    // せんしのかぶと
    x.fillStyle=ACC_COL.war.x;
    if(dir==='down'||dir==='up'){x.fillRect(4,3,8,2);x.fillStyle=ACC_COL.war.r;x.fillRect(7,2,2,1);}
    else{const bx=flip?3:7;x.fillRect(bx,4,6,2);x.fillStyle=ACC_COL.war.r;x.fillRect(bx+2,3,2,1);}
    return c;});
}

// ---------- tiles ----------
// エリアごとの色：0 巣穴の層 / 1 ユーカリの根の層 / 2 地下水脈の層 / 3 オパールの層 / 4 太古の層
const TILESETS=[
  {f:'#7a5f45',f2:'#8c6f52',f3:'#5f4733',face:'#5a4030',face2:'#6e4f3a',top:'#2c1f16',top2:'#3a2a1e',bg:['#2a1d14','#4a3424'],grid:false},
  {f:'#6a5a3a',f2:'#7c6a46',f3:'#4f4228',face:'#4a5a30',face2:'#5e7040',top:'#1e2414',top2:'#2c341e',bg:['#1a2012','#3a4426'],grid:false,beam:'#8a6a3a'},
  {f:'#3f6470',f2:'#4f7884',f3:'#2f4e58',face:'#2f5060',face2:'#3c6474',top:'#14232c',top2:'#1c303a',bg:['#0f2430','#24485a'],grid:false,shell:true},
  {f:'#6a5f80',f2:'#7a6f92',f3:'#554a68',face:'#8c7ca6',face2:'#a090ba',top:'#2e2540',top2:'#3c3152',bg:['#1e1730','#43365e'],grid:true,gold:'#e0b84a'},
  {f:'#8a7a5a',f2:'#9c8c6a',f3:'#6c5e42',face:'#a8946a',face2:'#c0aa7e',top:'#3a3020',top2:'#4a3e2a',bg:['#2a2418','#5a4a30'],grid:true,gold:'#f0d890'},
];
function tileCanvas(ts,kind,v){
  return cached('t|'+ts+'|'+kind+'|'+(v||0),()=>{
    const T=TILESETS[ts],c=document.createElement('canvas');c.width=16;c.height=16;const x=c.getContext('2d'),r=rng(ts*97+(v||0)*13+kind.length*7);
    const px=(X,Y,col)=>{x.fillStyle=col;x.fillRect(X,Y,1,1);};
    const floor=()=>{x.fillStyle=T.f;x.fillRect(0,0,16,16);for(let k=0;k<10;k++)px(Math.floor(r()*16),Math.floor(r()*16),r()<.5?T.f2:T.f3);
      if(T.grid){x.fillStyle=T.f3;x.fillRect(0,15,16,1);x.fillRect(15,0,1,16);x.fillStyle=T.f2;x.fillRect(0,0,16,1);x.fillRect(0,0,1,16);}
      if(T.shell&&r()<.5){px(4+Math.floor(r()*8),4+Math.floor(r()*8),'#e8dcc8');}};
    if(kind==='soft'||kind==='ayashi'){ // やわらかい壁・あやしい壁（掘れる）
      x.fillStyle=mixHex(T.face,'#a07850',.5);x.fillRect(0,0,16,16);x.fillStyle=mixHex(T.face2,'#c09a6a',.5);x.fillRect(0,0,16,2);
      x.fillStyle='#2a1a10';for(const [a,b] of [[3,4],[4,5],[5,5],[6,6],[10,9],[11,10],[11,11],[12,12],[8,3],[8,4]])x.fillRect(a,b,1,1);
      for(let k=0;k<8;k++)px(Math.floor(r()*16),2+Math.floor(r()*14),'#7a5a3a');
      if(kind==='ayashi'){x.fillStyle='#ffe27a';x.fillRect(7,7,2,2);x.fillRect(4,11,1,1);x.fillRect(12,5,1,1);}
      return c;}
    if(kind==='wall'){x.fillStyle=T.top;x.fillRect(0,0,16,16);for(let k=0;k<6;k++)px(Math.floor(r()*16),Math.floor(r()*16),T.top2);return c;}
    if(kind==='face'){x.fillStyle=T.face;x.fillRect(0,0,16,16);x.fillStyle=T.face2;x.fillRect(0,0,16,2);
      x.fillStyle=T.top;for(const [yy,off] of [[5,0],[10,4],[15,0]]){x.fillRect(0,yy,16,1);for(let xx=off;xx<16;xx+=8)x.fillRect(xx,yy-4,1,4);}
      if(T.beam){x.fillStyle=T.beam;x.fillRect(2,2,2,14);x.fillRect(12,2,2,14);x.fillRect(2,2,12,2);}
      if(T.gold){x.fillStyle=T.gold;x.fillRect(7,7,2,2);}
      return c;}
    floor();
    if(kind==='floor')return c;
    if(kind==='crack'){x.fillStyle='#120c0a';for(const [a,b,w] of [[3,5,4],[6,7,3],[8,8,4],[10,10,2],[7,10,1],[6,11,2],[11,6,2]])x.fillRect(a,b,w,1);x.fillStyle=T.f2;x.fillRect(4,4,2,1);x.fillRect(10,11,2,1);return c;}
    if(kind==='down'){x.fillStyle='#120c0a';x.fillRect(3,3,10,10);x.fillStyle=T.f2;for(let i=0;i<4;i++)x.fillRect(3+i,4+i*2,10-i*2,1);return c;}
    if(kind==='up'){x.fillStyle=T.f2;for(let i=0;i<4;i++){x.fillRect(3,3+i*3,10,2);}x.fillStyle=T.f3;for(let i=0;i<4;i++)x.fillRect(3,5+i*3,10,1);return c;}
    if(kind==='exit'){const g=x.createRadialGradient(8,8,1,8,8,8);g.addColorStop(0,'rgba(255,240,180,.95)');g.addColorStop(1,'rgba(255,240,180,0)');x.fillStyle=g;x.fillRect(0,0,16,16);
      x.fillStyle='#3b2a1a';x.fillRect(6,5,4,1);x.fillRect(5,6,6,1);x.fillRect(7,7,2,5);return c;}
    if(kind==='chest'||kind==='open'||kind==='qchest'||kind==='hchest'){
      const H=kind==='hchest',body=H?'#6a3aa8':kind==='qchest'?'#e8b830':'#a8642c',lid=H?'#9a6ae0':kind==='qchest'?'#ffd860':'#c9803c',band=H?'#ffd36b':kind==='qchest'?'#a8642c':'#e8c050';
      if(H){const g=x.createRadialGradient(8,10,1,8,10,9);g.addColorStop(0,'rgba(200,150,255,.8)');g.addColorStop(1,'rgba(200,150,255,0)');x.fillStyle=g;x.fillRect(0,0,16,16);}
      x.fillStyle='#2a1810';x.fillRect(2,5,12,10);
      if(kind==='open'){x.fillStyle='#1a0e08';x.fillRect(3,8,10,3);x.fillStyle=body;x.fillRect(3,11,10,3);x.fillStyle=lid;x.fillRect(3,3,10,3);x.fillStyle='#2a1810';x.fillRect(2,2,12,1);x.fillRect(2,6,12,1);}
      else{x.fillStyle=lid;x.fillRect(3,6,10,4);x.fillStyle=body;x.fillRect(3,10,10,4);x.fillStyle=band;x.fillRect(3,9,10,1);x.fillRect(7,8,2,4);x.fillStyle='#fff8d0';x.fillRect(4,7,2,1);}
      return c;}
    return c;});
}

