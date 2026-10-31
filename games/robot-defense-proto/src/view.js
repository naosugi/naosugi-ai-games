// ===== 描画・UI =====
(() => {
'use strict';
const T = window.THREE;
const { WORKS, workCost, workCheck, orderWork, CFG, TIER, PLUS, WEAPONS, ENEMIES, STAGES, UNLOCKS, checkUnlocks, buyLine, newState, step, buildCost, buildCheck, orderBuild, moveRobot, activeCount, goalText } = RD;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtT = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const lerpAngle = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

let S = null;
let mode = 'title';       // title | select | play | over
let paused = false, building = false, speed = 1;
let sel = null;           // 選択中のロボット
let uiBody = null, uiW = new Set(), uiAt = -1, uiTab = 'robot', uiWork = null;
let curStage = STAGES[0].id;
// ---------- 保存（アンロックと持ち込み） ----------
const SAVE_KEY = 'robodef_save_v1';
let SAVE = { unlocked: {}, swarmKills: 0, loadout: [] };
try { const v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (v && typeof v === 'object') SAVE = Object.assign(SAVE, v); } catch (_) {}
function saveNow() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (_) {} }
const isOpen = id => !!(SAVE.unlocked && SAVE.unlocked[id]);

// ---------- three.js ----------
const canvas = $('c');
const renderer = new T.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new T.Scene();
scene.background = new T.Color(0x050a1c);
const oCam = new T.OrthographicCamera(-1, 1, 1, -1, .1, 200);
const pCam = new T.PerspectiveCamera(70, 1, .1, 400); // 自操作（肩越し）用
let cam = oCam;
let pilot = null; // 自操作中のロボット
const TILT = .6; // 真上からの傾き（ラジアン）
let MAP, mapCX, mapCZ, mapW, mapD;
function setMapDims(st) { MAP = st.map; mapCX = (MAP.minX + MAP.maxX) / 2; mapCZ = (MAP.minZ + MAP.maxZ) / 2; mapW = MAP.maxX - MAP.minX; mapD = MAP.maxZ - MAP.minZ; }
setMapDims(STAGES[0]);

// カメラ：スワイプで移動、ピンチ・ホイールで拡大縮小。zoom=1 で地図全体が収まる
const camS = { x: mapCX, z: mapCZ, zoom: 1, s0: 1 };
let ZOOM_MAX = 3, ZOOM_START = 1;
function viewArea() {
  const W = innerWidth, H = innerHeight, top = $('hud').offsetHeight, bot = $('bottom').offsetHeight;
  return { W, H, top, avail: Math.max(120, H - top - bot) };
}
function fit() {
  const va = viewArea(); camS.vt = va.top; camS.va = va.avail;
  const { W, H, avail } = va;
  renderer.setSize(W, H, false);
  camS.s0 = Math.max((mapW + 1.2) / W, (mapD * Math.cos(TILT) + 2.4) / avail);
  applyCam();
  pCam.aspect = W / H; pCam.fov = pilotFov(W / H); pCam.updateProjectionMatrix();
  const r = $('roster'); if (r) r.style.top = ($('hud').offsetHeight + 4) + 'px';
  const pt = $('pTop'); if (pt) pt.style.top = ($('hud').offsetHeight + 4) + 'px';
  const ph = $('pHint'); if (ph) ph.style.top = ($('hud').offsetHeight + 36) + 'px';
}
function applyCam() {
  const { W, H } = viewArea(), top = camS.vt, avail = camS.va;
  camS.zoom = Math.max(1, Math.min(ZOOM_MAX, camS.zoom));
  const s = camS.s0 / camS.zoom;
  // 地図の外に出すぎないように中心を制限
  const slack = 170 * s / Math.cos(TILT); // 下の欄（選択中の欄など）に隠れた所も、引き上げて触れるように
  const mx = Math.max(0, mapW / 2 + 1 - W / 2 * s) + 40 * s, mz = Math.max(0, mapD / 2 + 1.5 - avail / 2 * s / Math.cos(TILT)) + slack;
  camS.x = Math.max(mapCX - mx, Math.min(mapCX + mx, camS.x));
  camS.z = Math.max(mapCZ - mz, Math.min(mapCZ + mz, camS.z));
  const yc = top + avail / 2;
  oCam.left = -W / 2 * s; oCam.right = W / 2 * s; oCam.top = yc * s; oCam.bottom = -(H - yc) * s;
  oCam.position.set(camS.x, Math.cos(TILT) * 60, camS.z + Math.sin(TILT) * 60);
  oCam.lookAt(camS.x, 0, camS.z);
  oCam.updateProjectionMatrix();
}
function panBy(dx, dy) { const s = camS.s0 / camS.zoom; camS.x -= dx * s; camS.z -= dy * s / Math.cos(TILT); applyCam(); }
function zoomAt(z, px, py) {
  const a = toWorld(px, py); camS.zoom = z; applyCam();
  const b = toWorld(px, py); if (a && b) { camS.x += a.x - b.x; camS.z += a.z - b.z; applyCam(); }
}
function resetView() { const b = S ? S.st.base : { x: mapCX, z: mapCZ }; camS.x = ZOOM_START > 1 ? b.x : mapCX; camS.z = ZOOM_START > 1 ? b.z : mapCZ; camS.zoom = ZOOM_START; applyCam(); }
// ⤢：広いステージでは「全体表示」と「拠点まわり」を切り替える
function toggleView() { if (ZOOM_START > 1 && camS.zoom > 1.05) { camS.x = mapCX; camS.z = mapCZ; camS.zoom = 1; applyCam(); } else resetView(); }
addEventListener('resize', fit);

scene.add(new T.HemisphereLight(0xb0dcff, 0x2a1838, 1.45));
const FOG_P = new T.Fog(0x050a1c, 22, 75); const FOG_M = new T.Fog(0x050a1c, 40, 115); // 自操作：遠くを暗くして奥行きを出す（見通しの悪さも表す）
const sun = new T.DirectionalLight(0xfff0dc, 1.7); sun.position.set(6, 14, 9); scene.add(sun);

// 共有ジオメトリ・マテリアル
const G = {
  box: new T.BoxGeometry(1, 1, 1),
  cyl: new T.CylinderGeometry(.5, .5, 1, 10),
  sph: new T.SphereGeometry(.5, 12, 8),
  oct: new T.OctahedronGeometry(.55),
  ico: new T.IcosahedronGeometry(.55),
  cone: new T.ConeGeometry(.5, 1, 10),
  plane: new T.PlaneGeometry(1, 1),
  disc: new T.CircleGeometry(.6, 20),
  ring: new T.RingGeometry(.8, .95, 28),
  shot: new T.SphereGeometry(.16, 8, 6),
};
const lam = (c, e = 0) => new T.MeshLambertMaterial({ color: c, emissive: e });
const M = {
  robo: lam(0x2f7dff, 0x0a2250), roboDark: lam(0x1b3c7a, 0x061633), head: lam(0x9fe8ff, 0x1a4a6a),
  blaster: lam(0x65f6ff, 0x1a6a80), spread: lam(0x4dabff, 0x123a6a), bomb: lam(0xffa94d, 0x6a3008), missile: lam(0xd8e6ff, 0x2a3a5a),
  laser: lam(0xe8fbff, 0x4aa0c0), heavy: lam(0x8aa0c0, 0x1a2a3a), homing: lam(0xb8f2ff, 0x2a5a6a), breaker: lam(0xffb36b, 0x6a3a10),
  beam: new T.MeshBasicMaterial({ color: 0x9df8ff, transparent: true, opacity: .75, depthWrite: false }),
  shotH: new T.MeshBasicMaterial({ color: 0xc9b8ff }), enemyK: lam(0xff2d2d, 0x7a0a0a),
  enemySw: lam(0xff5c8a, 0x5a0f2a), enemyF: lam(0xff8a9a, 0x5a1a24), wing: lam(0x8a1d3a, 0x2a0610), enemyC: lam(0xa83a4a, 0x3a0a14), enemyAr: lam(0xc8643a, 0x3a1a08), enemyEn: lam(0xffc04d, 0x5a3a08),
  opRing: new T.MeshBasicMaterial({ color: 0x9fb6d6, side: T.DoubleSide, transparent: true, opacity: .5 }), opProg: new T.MeshBasicMaterial({ color: 0x65f6ff, side: T.DoubleSide, transparent: true, opacity: .35 }),
  flagN: lam(0x9fb6d6, 0x1a2a3a), flagP: lam(0x65f6ff, 0x1a6a80), flagE: lam(0xff4d6d, 0x5a0f1e),
  opProgE: new T.MeshBasicMaterial({ color: 0xff4d6d, side: T.DoubleSide, transparent: true, opacity: .3 }),
  enemyN: lam(0xff4d6d, 0x4a0f1e), enemyS: lam(0xff7a3d, 0x4a1a08), enemyDark: lam(0x5a1424, 0x200008),
  enemyD: lam(0xff2d55, 0x5a0f1c), enemyA: lam(0xe0a070, 0x3f2a1c), enemySh: lam(0xff6ad5, 0x4a1740), shieldPlate: lam(0xffc2ef, 0x6a2a5a),
  enemySp: lam(0xff7a5c, 0x4a1a10), enemyH: lam(0xff6aa8, 0x4a1430), healRing: new T.MeshBasicMaterial({ color: 0x7dffa8, transparent: true, opacity: .5, side: T.DoubleSide }),
  enemyM: lam(0xff3b5c, 0x3a0a14), mineSpike: lam(0xffa94d, 0x5a2a08),
  boss: lam(0xd8283f, 0x4a0a14), bossDark: lam(0x6a1020, 0x200006), bossHead: lam(0xff9a9a, 0x5a1a1a),
  ebase: lam(0x8a1d3a, 0x2a0610), ebaseTop: lam(0xff4d6d, 0x5a0f1e),
  white: new T.MeshBasicMaterial({ color: 0xffffff }),
  novaCore: new T.MeshBasicMaterial({ color: 0xfff1b0 }), novaRing: new T.MeshBasicMaterial({ color: 0xffa94d }),
  visor: new T.MeshBasicMaterial({ color: 0xaefcff }), visorE: new T.MeshBasicMaterial({ color: 0xffe14d }),
  shadow: new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .35, depthWrite: false }),
  selRing: new T.MeshBasicMaterial({ color: 0x65f6ff, side: T.DoubleSide, transparent: true, opacity: .9 }),
  barBg: new T.MeshBasicMaterial({ color: 0x0a0f1e, depthTest: false }),
  barBlue: new T.MeshBasicMaterial({ color: 0x65f6ff, depthTest: false }),
  barRed: new T.MeshBasicMaterial({ color: 0xff4d6d, depthTest: false }),
  barGold: new T.MeshBasicMaterial({ color: 0xffd166, depthTest: false }),
  shotP: new T.MeshBasicMaterial({ color: 0x9df8ff }),
  shotM: new T.MeshBasicMaterial({ color: 0xffd166 }),
  shotE: new T.MeshBasicMaterial({ color: 0xff6a3d }),
  line: new T.LineBasicMaterial({ color: 0x65f6ff, transparent: true, opacity: .45 }),
  bubble: new T.MeshBasicMaterial({ color: 0x65f6ff, transparent: true, opacity: .18, depthWrite: false }),
  rangeRing: new T.MeshBasicMaterial({ color: 0x65f6ff, transparent: true, opacity: .35, side: T.DoubleSide, depthWrite: false }),
  aimLine: new T.LineBasicMaterial({ color: 0xff2d55 }),
};

// ---------- 地形（ステージごとに作り直す） ----------
let mapGroup = null, chev = null, chevPaths = [];
const CHEV_GAP = 2.4, chevD = new T.Object3D();
M.chev = new T.MeshBasicMaterial({ color: 0xff5a7a, transparent: true, opacity: .55, depthWrite: false });
// 床パネルの模様（canvas で描いて繰り返す）
function techTex(base, line, dot, rep) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = line; x.lineWidth = 3; x.strokeRect(0, 0, 128, 128);
  x.lineWidth = 1; x.globalAlpha = .45; x.beginPath(); x.moveTo(64, 8); x.lineTo(64, 120); x.moveTo(8, 64); x.lineTo(120, 64); x.stroke(); x.globalAlpha = 1;
  x.fillStyle = dot; for (const [px, py] of [[0, 0], [128, 0], [0, 128], [128, 128]]) x.fillRect(px - 4, py - 4, 8, 8);
  const t = new T.CanvasTexture(c); t.colorSpace = 'srgb'; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 4; return t;
}
// 経路の矢印を流す（敵の進む向きが分かるように）
function updChev(now) {
  if (!chev) return;
  let k = 0; const off = (now / 1000 * 1.3) % CHEV_GAP;
  for (const P of chevPaths) {
    let si = 0, acc = 0;
    for (let d = off; d < P.len - .3 && k < chev.instanceMatrix.count; d += CHEV_GAP) {
      while (si < P.segs.length - 1 && d > acc + P.segs[si].len) { acc += P.segs[si].len; si++; }
      const s = P.segs[si], t = d - acc;
      chevD.position.set(s.ax + s.ux * t, .07, s.az + s.uz * t); chevD.rotation.set(Math.PI / 2, Math.atan2(s.ux, s.uz), 0, 'YXZ'); chevD.scale.set(.6, .55, .05); chevD.updateMatrix();
      chev.setMatrixAt(k++, chevD.matrix);
    }
  }
  chev.count = k; chev.instanceMatrix.needsUpdate = true;
}
function buildMap(st, paths) {
  if (mapGroup) scene.remove(mapGroup);
  const g = mapGroup = new T.Group(); scene.add(g);
  // 地面：4マスごとの床パネル（戦場）と、その外の暗い地面
  const OUT = 40;
  const ground = new T.Mesh(new T.PlaneGeometry(mapW + OUT * 2, mapD + OUT * 2), new T.MeshLambertMaterial({ map: techTex('#071026', '#0f2246', '#16305a', [(mapW + OUT * 2) / 4, (mapD + OUT * 2) / 4]) }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(mapCX, 0, mapCZ); g.add(ground);
  const field = new T.Mesh(new T.PlaneGeometry(mapW, mapD), new T.MeshLambertMaterial({ map: techTex('#0e2044', '#21477c', '#3a7cc0', [mapW / 4, mapD / 4]) }));
  field.rotation.x = -Math.PI / 2; field.position.set(mapCX, .005, mapCZ); g.add(field);
  const edge = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(mapW, mapD)), new T.LineBasicMaterial({ color: 0x3f8ad0 }));
  edge.rotation.x = -Math.PI / 2; edge.position.set(mapCX, .02, mapCZ); g.add(edge);
  // 戦場の外：崩れた建物（見た目だけ。当たり判定はない）
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ruinM = [lam(0x142a52, 0x050c1c), lam(0x1b3664, 0x060f22), lam(0x0f2040, 0x040a18)];
  for (let i = 0; i < 70; i++) {
    const side = i % 4, t = rnd(), d = 2 + rnd() * 18;
    const x = side < 2 ? MAP.minX + t * mapW : (side === 2 ? MAP.minX - d : MAP.maxX + d), z = side < 2 ? (side === 0 ? MAP.minZ - d : MAP.maxZ + d) : MAP.minZ + t * mapD;
    const h = side === 1 ? .3 + rnd() * .8 : .6 + rnd() * rnd() * 7, w = 1.2 + rnd() * 3, b = new T.Mesh(G.box, ruinM[i % 3]); // 手前側（カメラ側）は低くして戦場を隠さない
    b.scale.set(w, h, 1.2 + rnd() * 3); b.position.set(x, h / 2, z); b.rotation.y = rnd() * .6 - .3; g.add(b);
  }
  // 敵の経路：路面・両側の赤い縁・拠点へ向かって流れる矢印
  const road = lam(0x35122a, 0x14040c), rim = new T.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: .45 });
  chevPaths = [];
  let nChev = 0;
  for (const P of paths) {
    let len = 0;
    for (const s of P.segs) {
      const cx = (s.ax + s.bx) / 2, cz = (s.az + s.bz) / 2, ang = Math.atan2(s.ux, s.uz);
      const r = new T.Mesh(G.box, road); r.scale.set(1.8, .04, s.len + 1.8); r.position.set(cx, .02, cz); r.rotation.y = ang; g.add(r);
      for (const k of [-1, 1]) { const m = new T.Mesh(G.box, rim); m.scale.set(.07, .05, s.len + 1.8); m.position.set(cx + s.uz * .92 * k, .03, cz - s.ux * .92 * k); m.rotation.y = ang; g.add(m); }
      len += s.len;
    }
    chevPaths.push({ segs: P.segs, len }); nChev += Math.floor(len / CHEV_GAP) + 2;
  }
  chev = new T.InstancedMesh(G.cone, M.chev, Math.max(1, nChev)); chev.frustumCulled = false; chev.count = 0; g.add(chev);
  // 敵の出現ゲート（敵拠点がある経路には置かない）
  M.gates = [];
  st.paths.forEach((p, i) => {
    if ((st.ebases || []).some(b => b.path === i)) return;
    const gate = new T.Mesh(new T.TorusGeometry(1.1, .14, 8, 28), new T.MeshBasicMaterial({ color: 0xff4d6d }));
    gate.position.set(p[0][0], 1.1, p[0][1]); g.add(gate); M.gates.push(gate);
  });
  // 拠点
  const base = new T.Group();
  const b1 = new T.Mesh(new T.CylinderGeometry(1.5, 1.8, .8, 6), M.robo); b1.position.y = .4;
  const b2 = new T.Mesh(new T.CylinderGeometry(.9, 1.1, .7, 6), M.head); b2.position.y = 1.1;
  const b3 = new T.Mesh(new T.TorusGeometry(1.25, .07, 6, 30), new T.MeshBasicMaterial({ color: 0x65f6ff })); b3.rotation.x = Math.PI / 2; b3.position.y = 1.5;
  const glow = new T.Mesh(new T.CircleGeometry(3.6, 40), new T.MeshBasicMaterial({ color: 0x65f6ff, transparent: true, opacity: .16, blending: T.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = .04; M.baseGlow = glow;
  base.add(b1, b2, b3, glow); base.position.set(st.base.x, 0, st.base.z); g.add(base); M.baseRing = b3;
  const gun = new T.Group(); gun.position.y = 1.55; gun.visible = false; base.add(gun);
  const gb = new T.Mesh(G.box, M.roboDark); gb.scale.set(.7, .35, .7); gun.add(gb);
  M.baseBarrels = [-1, 1].map(k => { const b = new T.Mesh(G.cyl, M.blaster); b.scale.set(.12, .9, .12); b.rotation.x = Math.PI / 2; b.position.set(k * .16, .1, .45); b.visible = false; gun.add(b); return b; });
  M.baseGun = gun;
  const dome = new T.Mesh(new T.SphereGeometry(2.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new T.MeshBasicMaterial({ color: 0x65f6ff, transparent: true, opacity: .2, side: T.DoubleSide, depthWrite: false }));
  dome.visible = false; base.add(dome); M.baseDome = dome;
  // 前線拠点
  M.outposts = (st.outposts || []).map(o => {
    const og = new T.Group(); og.position.set(o[0], 0, o[1]);
    const ring = new T.Mesh(new T.RingGeometry(CFG.outpostR - .15, CFG.outpostR, 40), M.opRing); ring.rotation.x = -Math.PI / 2; ring.position.y = .04;
    const prog = new T.Mesh(new T.CircleGeometry(CFG.outpostR, 40), M.opProg); prog.rotation.x = -Math.PI / 2; prog.position.y = .03; prog.scale.setScalar(.001);
    const pole = new T.Mesh(G.cyl, M.flagN); pole.scale.set(.08, 2.2, .08); pole.position.y = 1.1;
    const flag = new T.Mesh(G.box, M.flagN); flag.scale.set(.7, .4, .05); flag.position.set(.35, 1.95, 0);
    og.add(ring, prog, pole, flag); g.add(og);
    return { prog, flag, pole };
  });
}

// ---------- ユニットの見た目 ----------
function shadowDisc(r) { const d = new T.Mesh(G.disc, M.shadow); d.rotation.x = -Math.PI / 2; d.position.y = .02; d.scale.setScalar(r); return d; }
// ロボット（味方）と模倣機（敵ボス）は同じ組み立て方。色だけ違う
function mechMesh(weaponIds, sc, mats) {
  const g = new T.Group(), inner = new T.Group();
  g.add(shadowDisc(sc));
  const body = new T.Mesh(G.box, mats.body); body.scale.set(.9, .55, .75); body.position.y = .62;
  const head = new T.Mesh(G.box, mats.head); head.scale.set(.42, .26, .36); head.position.set(0, 1.02, .06);
  const legL = new T.Mesh(G.box, mats.dark); legL.scale.set(.24, .38, .3); legL.position.set(-.26, .2, 0);
  const legR = legL.clone(); legR.position.x = .26;
  const visor = new T.Mesh(G.box, mats.visor || M.visor); visor.scale.set(.34, .07, .04); visor.position.set(0, 1.05, .25);
  inner.add(body, head, legL, legR, visor);
  const slots = [[.6, .7, .12], [-.6, .7, .12], [0, .98, -.42], [0, 1.3, .05]];
  weaponIds.forEach((id0, i) => {
    const id = id0 === 'missile' || id0 === 'nova' ? id0 : (WEAPONS[id0] && WEAPONS[id0].base) || id0;
    const [x, y, z] = slots[i % slots.length], p = new T.Group(); p.position.set(x, y, z);
    if (id === 'blaster') { const b = new T.Mesh(G.cyl, M.blaster); b.scale.set(.16, .75, .16); b.rotation.x = Math.PI / 2; b.position.z = .3; p.add(b); }
    else if (id === 'spread') { for (let k = -1; k <= 1; k++) { const b = new T.Mesh(G.cyl, M.spread); b.scale.set(.1, .5, .1); b.rotation.x = Math.PI / 2; b.rotation.y = k * .35; b.position.set(k * .1, 0, .22); p.add(b); } const blk = new T.Mesh(G.box, M.spread); blk.scale.set(.32, .22, .3); p.add(blk); }
    else if (id === 'missile') { const pod = new T.Mesh(G.box, M.missile); pod.scale.set(.42, .26, .42); p.add(pod); for (const k of [-1, 1]) { const m = new T.Mesh(G.cyl, M.bomb); m.scale.set(.09, .3, .09); m.rotation.x = Math.PI / 2.6; m.position.set(k * .1, .12, .1); p.add(m); } }
    else if (id === 'nova') { const c = new T.Mesh(G.ico, M.novaCore); c.scale.setScalar(.75); c.position.set(0, .15, -.1); p.add(c); const r = new T.Mesh(new T.TorusGeometry(.45, .05, 6, 20), M.novaRing); r.rotation.x = Math.PI / 2; r.position.y = .15; p.add(r); }
    else if (id === 'bomb') { const b = new T.Mesh(G.sph, M.bomb); b.scale.setScalar(.42); p.add(b); }
    else if (id === 'laser') { const b = new T.Mesh(G.cyl, M.laser); b.scale.set(.1, .95, .1); b.rotation.x = Math.PI / 2; b.position.z = .35; p.add(b); const t = new T.Mesh(G.sph, M.blaster); t.scale.setScalar(.16); t.position.z = .82; p.add(t); }
    else if (id === 'heavy') { const b = new T.Mesh(G.cyl, M.heavy); b.scale.set(.28, .6, .28); b.rotation.x = Math.PI / 2; b.position.z = .25; p.add(b); }
    else if (id === 'homing') { const blk = new T.Mesh(G.box, M.homing); blk.scale.set(.36, .24, .3); p.add(blk); for (const k of [-1, 1]) { const m = new T.Mesh(G.sph, M.homing); m.scale.setScalar(.14); m.position.set(k * .1, .14, .08); p.add(m); } }
    else if (id === 'breaker') { const blk = new T.Mesh(G.box, M.breaker); blk.scale.set(.5, .2, .35); blk.position.z = .2; p.add(blk); }
    inner.add(p);
  });
  inner.scale.setScalar(sc);
  g.add(inner);
  return { g, inner, body };
}
function roboMesh(r) {
  const sc = TIER[r.body.tier].scale * 1.45;
  const { g, inner, body } = mechMesh(r.weapons.map(w => w.id), sc, { body: M.robo, head: M.head, dark: M.roboDark });
  const ring = new T.Mesh(G.ring, M.selRing); ring.rotation.x = -Math.PI / 2; ring.position.y = .05; ring.scale.setScalar(sc * 1.05); ring.visible = false;
  const R = Math.max(...r.weapons.map(w => (w.def.range || w.def.trigger || 1) * r.rangeMul));
  const range = new T.Mesh(new T.RingGeometry(R - .08, R, 56), M.rangeRing); range.rotation.x = -Math.PI / 2; range.position.y = .04; range.visible = false; g.add(range);
  g.add(ring);
  const beams = r.weapons.map(w => { if (w.def.type !== 'beam') return null; return Array.from({ length: w.def.beams || 1 }, () => { const b = new T.Mesh(G.box, M.beam); b.visible = false; return b; }); });
  let bubble = null;
  if (r.maxShield) { bubble = new T.Mesh(G.sph, M.bubble); bubble.scale.setScalar(2.1 * sc); bubble.position.y = .7 * sc; g.add(bubble); }
  return { obj: g, inner, body, ring, range, bubble, bar: makeBar(1.2 * sc, M.barBlue), barY: 1.55 * sc, line: makeLine(M.line), baseMat: M.robo, beams };
}
function enemyMesh(e) {
  if (e.type === 'boss') {
    const { g, inner, body } = mechMesh(e.def.weapons, 2.2, { body: M.boss, head: M.bossHead, dark: M.bossDark, visor: M.visorE });
    return { obj: g, inner, body, bar: makeBar(3, M.barGold), barY: 2.8, baseMat: M.boss, face: true, always: true };
  }
  const g = new T.Group(), inner = new T.Group();
  g.add(shadowDisc(e.r * 1.7));
  let body, face = false, spin = false, extra = {};
  const add = (geo, mat, sx, sy, sz, x, y, z, rx) => { const m = new T.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); if (rx) m.rotation.x = rx; inner.add(m); return m; };
  switch (e.type) {
    case 'shooter':
      body = add(G.box, M.enemyS, .9, .5, .9, 0, .5, 0); add(G.cyl, M.enemyDark, .16, .8, .16, 0, .6, .5, Math.PI / 2); add(G.oct, M.enemyS, .6, .6, .6, 0, .95, 0);
      face = true; break;
    case 'dasher':
      body = add(G.cone, M.enemyD, .7, 1.2, .7, 0, .5, 0, Math.PI / 2); face = true;
      extra.aim = makeLine(M.aimLine); break;
    case 'armor':
      body = add(G.box, M.enemyA, 1.2, .8, 1.2, 0, .55, 0); add(G.box, M.enemyDark, 1.35, .25, 1.35, 0, .3, 0); add(G.box, M.enemyA, .6, .35, .6, 0, 1.1, 0);
      face = true; break;
    case 'shield':
      body = add(G.oct, M.enemySh, 1, 1.1, 1, 0, .62, 0); add(G.box, M.shieldPlate, 1.3, .9, .12, 0, .6, .62);
      face = true; break;
    case 'splitter':
      body = add(G.ico, M.enemySp, 1.15, 1.15, 1.15, 0, .7, 0); spin = true; break;
    case 'mini':
      body = add(G.oct, M.enemySp, .65, .7, .65, 0, .4, 0); spin = true; break;
    case 'healer':
      body = add(G.sph, M.enemyH, .8, .6, .8, 0, 1, 0);
      { const r = new T.Mesh(G.ring, M.healRing); r.rotation.x = -Math.PI / 2; r.position.y = .05; r.scale.setScalar(ENEMIES.healer.heal.range / .9); g.add(r); }
      spin = true; break;
    case 'flyer':
      body = add(G.oct, M.enemyF, .9, .4, 1.1, 0, 2.2, 0); add(G.box, M.wing, 1.9, .06, .45, 0, 2.2, -.1); face = true; break;
    case 'carrier':
      body = add(G.box, M.enemyC, 1.6, .7, 2.6, 0, .55, 0); add(G.box, M.enemyDark, 1, .45, 1.2, 0, 1.1, -.4); add(G.box, M.enemyC, .3, .3, .6, .6, 1.05, .7); face = true; break;
    case 'artillery':
      body = add(G.box, M.enemyAr, 1.1, .55, 1.2, 0, .45, 0);
      { const b = add(G.cyl, M.enemyDark, .2, 1.5, .2, 0, 1.1, .45); b.rotation.x = Math.PI / 2 - .6; } face = true; break;
    case 'engineer':
      body = add(G.box, M.enemyEn, .7, .5, .7, 0, .45, 0); add(G.cyl, M.enemyDark, .06, .8, .06, .2, 1, 0); add(G.sph, M.enemyEn, .2, .2, .2, .2, 1.45, 0); face = true; break;
    case 'kamikaze':
      body = add(G.cone, M.enemyK, .55, .9, .55, 0, .45, 0, Math.PI / 2); face = true; break;
    case 'mine':
      body = add(G.ico, M.enemyM, .85, .85, .85, 0, .55, 0);
      for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]) { const s = add(G.cone, M.mineSpike, .18, .35, .18, x * .5, .55 + y * .5, z * .5); s.lookAt(x * 9, .55 + y * 9, z * 9); s.rotateX(Math.PI / 2); }
      spin = true; break;
    default:
      body = add(G.oct, M.enemyN, 1, 1.15, 1, 0, .62, 0); spin = true;
  }
  inner.scale.setScalar(1.2);
  g.add(inner);
  return { obj: g, inner, body, bar: makeBar(1, M.barRed), barY: 1.7, baseMat: body.material, face, spin, ...extra };
}
function ebaseMesh(b) {
  const g = new T.Group(), inner = new T.Group();
  g.add(shadowDisc(2.4));
  const b1 = new T.Mesh(new T.CylinderGeometry(1.4, 1.8, 1.2, 5), M.ebase); b1.position.y = .6;
  const b2 = new T.Mesh(G.oct, M.ebaseTop); b2.scale.set(1.6, 2.2, 1.6); b2.position.y = 1.9;
  inner.add(b1, b2);
  if (b.turret) { const t = new T.Mesh(G.cyl, M.enemyDark); t.scale.set(.25, 1.6, .25); t.rotation.x = Math.PI / 2; t.position.set(0, 1.4, .9); inner.add(t); }
  g.add(inner);
  return { obj: g, inner, body: b2, bar: makeBar(2.6, M.barRed), barY: 3.6, baseMat: M.ebaseTop, face: !!b.turret, always: true };
}
function makeBar(w, fgMat) {
  const g = new T.Group();
  const bg = new T.Mesh(G.plane, M.barBg); bg.scale.set(w + .08, .2, 1);
  const fg = new T.Mesh(G.plane, fgMat); fg.scale.set(w, .13, 1); fg.position.z = .001;
  bg.renderOrder = 10; fg.renderOrder = 11; g.add(bg, fg); g.userData = { fg, w };
  return g;
}
function setBar(bar, x, y, z, k) {
  const { fg, w } = bar.userData; k = Math.max(0, Math.min(1, k));
  fg.scale.x = Math.max(.0001, w * k); fg.position.x = -w * (1 - k) / 2;
  bar.position.set(x, y, z); bar.quaternion.copy(cam.quaternion);
}
function makeLine(mat) {
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
  const l = new T.Line(geo, mat); l.frustumCulled = false; l.visible = false; return l;
}
function setLine(l, x1, z1, x2, z2) { const p = l.geometry.attributes.position; p.setXYZ(0, x1, .08, z1); p.setXYZ(1, x2, .08, z2); p.needsUpdate = true; l.visible = true; }

// 群体と弾は数が多いので、まとめて1回で描く
const dummy = new T.Object3D();
function makeInst(geo, mat, max) { const m = new T.InstancedMesh(geo, mat, max); m.count = 0; m.frustumCulled = false; scene.add(m); return m; }
const SWARM_LOOK = {
  swarm: { mat: M.enemySw, y: .45, s: [.62, .7, .62] },
  swarmFast: { mat: lam(0xffd166, 0x5a4008), y: .38, s: [.48, .5, .62] },
  swarmHeavy: { mat: lam(0xa0283c, 0x2a0610), y: .55, s: [.85, .9, .85] },
  swarmBomb: { mat: lam(0xffa94d, 0x6a3008), y: .42, s: [.55, .55, .55] },
  swarmFly: { mat: lam(0xff8ad8, 0x4a1440), y: 2, s: [.6, .3, .7] },
};
const swarmInst = {}; for (const k in SWARM_LOOK) swarmInst[k] = makeInst(G.oct, SWARM_LOOK[k].mat, 2500);
const shotInst = { p: makeInst(G.shot, M.shotP, 2000), m: makeInst(G.shot, M.shotM, 400), h: makeInst(G.shot, M.shotH, 600), e: makeInst(G.shot, M.shotE, 1000) };
const views = new Map();
const marker = new T.Mesh(G.ring, new T.MeshBasicMaterial({ color: 0x65f6ff, side: T.DoubleSide, transparent: true }));
marker.rotation.x = -Math.PI / 2; marker.position.y = .06; marker.visible = false; scene.add(marker);
let markerT = 0;

function dropView(v) { scene.remove(v.obj); if (v.bar) scene.remove(v.bar); if (v.line) scene.remove(v.line); if (v.aim) scene.remove(v.aim); if (v.beams) for (const b of v.beams) if (b) for (const m of b) scene.remove(m); }
function clearViews() { for (const v of views.values()) dropView(v); views.clear(); }
function sync(dt) {
  const seen = new Set(), k = 1 - Math.exp(-14 * dt);
  for (const r of S.robots) {
    let v = views.get(r.id);
    if (!v) { v = roboMesh(r); scene.add(v.obj, v.bar, v.line); for (const b of v.beams) if (b) for (const m of b) scene.add(m); views.set(r.id, v); v.obj.position.set(r.x, 0, r.z); v.obj.rotation.y = r.face; }
    r.weapons.forEach((w, i) => { const bs = v.beams[i]; if (!bs) return;
      bs.forEach((b, k) => { const e = w.beam && w.beam[k]; if (!e) { b.visible = false; return; }
        const dx = e.x2 - r.x, dz = e.z2 - r.z, len = Math.hypot(dx, dz); b.visible = true;
        b.position.set(r.x + dx / 2, .75, r.z + dz / 2); b.rotation.set(0, Math.atan2(dx, dz), 0); b.scale.set(.14 + Math.random() * .06, .12, len); }); });
    seen.add(r.id);
    v.obj.position.set(r.x, 0, r.z);
    v.obj.rotation.y = lerpAngle(v.obj.rotation.y, r.face, k);
    if (pendingDrop.has(r.id)) { pendingDrop.delete(r.id); v.dropT = .45; }
    if (v.dropT > 0) v.dropT -= dt;
    v.inner.position.y = (v.dropT > 0 ? (v.dropT / .45) ** 2 * 7 : 0) + (r.moving ? Math.abs(Math.sin(performance.now() / 90)) * .06 : 0);
    v.body.material = r.flash > 0 ? M.white : M.robo;
    v.ring.visible = sel === r; v.range.visible = sel === r || pilot === r; v.range.scale.setScalar(pilot === r ? CFG.pilot.range : 1);
    if (v.bubble) { v.bubble.visible = r.shield > 0; v.bubble.scale.setScalar(2.1 * TIER[r.body.tier].scale * 1.45 * (.85 + .15 * r.shield / r.maxShield)); }
    setBar(v.bar, r.x, v.barY, r.z, r.hp / r.maxHp); if (pilot === r) v.bar.visible = false;
    if (r.moving) setLine(v.line, r.x, r.z, r.tx, r.tz); else v.line.visible = false;
  }
  const ni = {}; for (const k in swarmInst) ni[k] = 0; const spin = performance.now() / 500;
  for (const e of S.enemies.concat(S.ebases)) {
    if (e.dead) continue;
    if (e.def && e.def.inst) { // 群体：まとめ描画
      const key = swarmInst[e.type] ? e.type : 'swarm', L = SWARM_LOOK[key], im = swarmInst[key];
      if (ni[key] < 2500) { dummy.position.set(e.x, L.y, e.z); dummy.rotation.set(0, spin + e.id, 0); dummy.scale.set(L.s[0], L.s[1], L.s[2]); dummy.updateMatrix(); im.setMatrixAt(ni[key]++, dummy.matrix); }
      continue;
    }
    let v = views.get(e.id);
    if (!v) { v = e.ebase ? ebaseMesh(e) : enemyMesh(e); scene.add(v.obj, v.bar); if (v.aim) scene.add(v.aim); views.set(e.id, v); v.obj.position.set(e.x, 0, e.z); v.obj.rotation.y = e.face || 0; }
    seen.add(e.id);
    v.obj.position.x += (e.x - v.obj.position.x) * k; v.obj.position.z += (e.z - v.obj.position.z) * k;
    if (v.face) v.obj.rotation.y = lerpAngle(v.obj.rotation.y, e.face || 0, k);
    if (v.spin) v.inner.rotation.y += dt * 2;
    if (v.aim) { if (e.state === 'aim') setLine(v.aim, e.x, e.z, e.x + e.dvx * e.def.dash.len, e.z + e.dvz * e.def.dash.len); else v.aim.visible = false; }
    v.body.material = e.flash > 0 ? M.white : v.baseMat;
    v.bar.visible = v.always || e.hp < e.maxHp;
    if (v.bar.visible) setBar(v.bar, v.obj.position.x, v.barY, v.obj.position.z, e.hp / e.maxHp);
  }
  for (const k in swarmInst) { swarmInst[k].count = ni[k]; swarmInst[k].instanceMatrix.needsUpdate = true; }
  const sc = { p: 0, m: 0, h: 0, e: 0 };
  for (const s of S.shots) {
    const key = s.team === 'e' ? 'e' : s.blast ? 'm' : s.homing ? 'h' : 'p', im = shotInst[key];
    if (sc[key] >= im.instanceMatrix.count) continue;
    dummy.position.set(s.x, .6, s.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(s.shell ? 1.9 : s.blast ? 1.7 : s.size ? s.size / .16 : 1); dummy.updateMatrix();
    im.setMatrixAt(sc[key]++, dummy.matrix);
  }
  for (const key in shotInst) { shotInst[key].count = sc[key]; shotInst[key].instanceMatrix.needsUpdate = true; }
  // 前線拠点
  (M.outposts || []).forEach((v, i) => { const o = S.outposts[i]; if (!o) return; v.prog.scale.setScalar(Math.max(.001, Math.abs(o.prog))); v.prog.material = o.prog < 0 ? M.opProgE : M.opProg; v.flag.material = o.owner === 'p' ? M.flagP : o.owner === 'e' ? M.flagE : M.flagN; v.pole.material = v.flag.material; });
  for (const [id, v] of views) if (!seen.has(id)) { dropView(v); views.delete(id); }
}

// ---------- 画面端の敵方向表示：画面外にいる、拠点に迫る敵の方向と数 ----------
const edgeEls = [], pv = new T.Vector3();
function updEdges() {
  const box = $('edges'); let used = 0;
  if (S && mode === 'play' && !pilot) {
    const W = innerWidth, H = innerHeight, top = $('hud').offsetHeight + 8, bot = H - $('bottom').offsetHeight - 8, l = 10, r = W - 10;
    const cx = W / 2, cy = (top + bot) / 2, buckets = new Map();
    for (const e of S.enemies) {
      const dh = Math.hypot(e.x - S.home.x, e.z - S.home.z), boss = e.def.boss, art = e.def.artillery && e.firing;
      if (!boss && !art && !e.def.fly && dh > 16 && !e.atBase) continue; // 拠点に迫っていない敵は出さない
      pv.set(e.x, .5, e.z).project(cam);
      const px = (pv.x + 1) / 2 * W, py = (1 - pv.y) / 2 * H;
      if (px > l && px < r && py > top && py < bot) continue;
      const a = Math.atan2(py - cy, px - cx), k = Math.round(a / (Math.PI / 12));
      const b = buckets.get(k) || { a, n: 0, boss: false, art: false }; b.n++; b.boss = b.boss || boss; b.art = b.art || art; buckets.set(k, b);
    }
    for (const b of buckets.values()) {
      const ux = Math.cos(b.a), uy = Math.sin(b.a), hw = (r - l) / 2 - 14, hh = (bot - top) / 2 - 14;
      const t = Math.min(Math.abs(hw / (ux || 1e-6)), Math.abs(hh / (uy || 1e-6)));
      let el = edgeEls[used]; if (!el) { el = document.createElement('div'); el.className = 'edge'; el.innerHTML = '<i></i><b></b>'; box.appendChild(el); edgeEls.push(el); }
      el.style.display = ''; el.style.transform = 'translate(' + (cx + ux * t) + 'px,' + (cy + uy * t) + 'px) translate(-50%,-50%)';
      el.firstChild.style.transform = 'rotate(' + b.a + 'rad)';
      el.lastChild.textContent = b.boss ? 'BOSS' : b.art ? '砲' : b.n;
      el.className = 'edge' + (b.boss ? ' boss' : b.art ? ' art' : '');
      used++;
    }
  }
  for (let i = used; i < edgeEls.length; i++) edgeEls[i].style.display = 'none';
}

// ---------- ロボット番号（地図上に表示） ----------
const tags = new Map(), tagV = new T.Vector3();
function updTags() {
  const box = $('tags'), alive = new Set();
  if (S && mode !== 'title' && mode !== 'select') for (const r of S.robots) {
    alive.add(r.id);
    let el = tags.get(r.id);
    if (!el) { el = document.createElement('div'); el.className = 'tag'; el.textContent = r.slot; box.appendChild(el); tags.set(r.id, el); }
    const v = views.get(r.id); const y = v ? v.barY + .55 : 2.2;
    tagV.set(r.x, y, r.z).project(cam);
    el.style.transform = 'translate(' + ((tagV.x + 1) / 2 * innerWidth) + 'px,' + ((1 - tagV.y) / 2 * innerHeight) + 'px) translate(-50%,-50%)';
    el.style.display = tagV.z > 1 || r === pilot ? 'none' : ''; // 自操作中：カメラの後ろと自機は出さない
    el.classList.toggle('on', sel === r); el.classList.toggle('hurt', r.hp < r.maxHp * .3);
  }
  for (const [id, el] of tags) if (!alive.has(id)) { el.remove(); tags.delete(id); }
  // 前線拠点の名前
  if (S && mode !== 'title' && mode !== 'select') S.outposts.forEach(o => {
    alive.add(o.id); let el = tags.get(o.id);
    if (!el) { el = document.createElement('div'); el.className = 'tag op'; el.textContent = o.label; box.appendChild(el); tags.set(o.id, el); }
    tagV.set(o.x, 2.9, o.z).project(cam);
    el.style.transform = 'translate(' + ((tagV.x + 1) / 2 * innerWidth) + 'px,' + ((1 - tagV.y) / 2 * innerHeight) + 'px) translate(-50%,-50%)';
    el.style.display = tagV.z > 1 ? 'none' : '';
    el.classList.toggle('mine', o.owner === 'p'); el.classList.toggle('en', o.owner === 'e');
  });
  for (const [id, el] of tags) if (!alive.has(id)) { el.remove(); tags.delete(id); }
}

// ---------- 音（WebAudio で合成。音声ファイルは使わない） ----------
const AU = (() => {
  let ctx = null, master = null, sfx = null, bgmG = null, noiseBuf = null, muted = false, seq = null;
  try { muted = localStorage.getItem('robodef_mute') === '1'; } catch (_) {}
  const last = {};
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try {
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : .7; master.connect(ctx.destination);
      sfx = ctx.createGain(); sfx.gain.value = .55; sfx.connect(master);
      bgmG = ctx.createGain(); bgmG.gain.value = .16; bgmG.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (_) { ctx = null; }
  }
  // 同じ音が短い間に重なりすぎないようにする
  const ok = (key, gap) => { if (!ctx || muted) return false; const t = ctx.currentTime; if (last[key] !== undefined && t - last[key] < gap) return false; last[key] = t; return true; };
  function tone(o) {
    const t = ctx.currentTime + (o.at || 0), osc = ctx.createOscillator(), g = ctx.createGain(), d = o.d || .1;
    osc.type = o.type || 'square'; osc.frequency.setValueAtTime(o.f || 440, t); if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + d);
    g.gain.setValueAtTime(o.v || .2, t); g.gain.exponentialRampToValueAtTime(.0008, t + d);
    osc.connect(g); g.connect(o.dest || sfx); osc.start(t); osc.stop(t + d + .02);
  }
  function noise(o) {
    const t = ctx.currentTime + (o.at || 0), src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), d = o.d || .3;
    src.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp || 1200, t); if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + d);
    g.gain.setValueAtTime(o.v || .3, t); g.gain.exponentialRampToValueAtTime(.0008, t + d);
    src.connect(f); f.connect(g); g.connect(o.dest || sfx); src.start(t, Math.random() * .5); src.stop(t + d + .02);
  }
  const notes = (arr, step, o) => arr.forEach((f, i) => tone(Object.assign({ f, at: i * step }, o)));
  const S = {
    shot(k) {
      if (k === 'm') { if (ok('shotm', .12)) { noise({ d: .25, v: .12, lp: 2500, lp2: 400 }); tone({ f: 220, f2: 90, d: .25, type: 'sawtooth', v: .05 }); } }
      else if (k === 'h') { if (ok('shoth', .1)) { tone({ f: 160, f2: 50, d: .22, type: 'square', v: .14 }); noise({ d: .12, v: .15, lp: 3000 }); } }
      else if (k === 's') { if (ok('shots', .07)) noise({ d: .08, v: .1, lp: 5000, lp2: 1200 }); }
      else if (ok('shotb', .05)) tone({ f: 1100, f2: 520, d: .05, type: 'square', v: .035 });
    },
    blast(big) { if (!ok(big ? 'blastB' : 'blast', big ? .1 : .06)) return; noise({ d: big ? .7 : .35, v: big ? .5 : .28, lp: big ? 900 : 1600, lp2: 120 }); tone({ f: big ? 80 : 110, f2: 35, d: big ? .6 : .3, type: 'sine', v: big ? .5 : .3 }); },
    kill(small) { if (!ok(small ? 'killS' : 'kill', small ? .035 : .05)) return; tone({ f: small ? 1600 + Math.random() * 400 : 900, f2: small ? 900 : 300, d: small ? .04 : .08, type: 'triangle', v: small ? .035 : .07 }); },
    built() { if (ok('built', .3)) notes([523, 659, 784, 1047], .06, { d: .12, type: 'triangle', v: .09 }); },
    lost() { if (ok('lost', .3)) { tone({ f: 600, f2: 120, d: .45, type: 'sawtooth', v: .1 }); noise({ d: .4, v: .2, lp: 1200, lp2: 200 }); } },
    alarm() { if (ok('alarm', 1.4)) { tone({ f: 880, d: .14, type: 'square', v: .07 }); tone({ f: 660, d: .14, type: 'square', v: .07, at: .16 }); } },
    boss() { if (ok('boss', 2)) for (let i = 0; i < 3; i++) tone({ f: 330, f2: 660, d: .45, type: 'sawtooth', v: .1, at: i * .5 }); },
    capture() { if (ok('cap', .5)) notes([392, 523, 659], .08, { d: .15, type: 'square', v: .06 }); },
    combo(n) { if (ok('combo', .25)) tone({ f: 400 + Math.min(n, 60) * 18, d: .12, type: 'triangle', v: .08 }); },
    ui() { if (ok('ui', .04)) tone({ f: 1400, d: .03, type: 'square', v: .03 }); },
    win() { if (ok('win', 1)) notes([523, 659, 784, 1047, 784, 1047], .12, { d: .22, type: 'square', v: .08 }); },
    lose() { if (ok('lose', 1)) notes([440, 392, 330, 262], .2, { d: .35, type: 'sawtooth', v: .08 }); },
  };
  // BGM：ベース・アルペジオ・ハイハットの簡単な繰り返し。激しさ（intense）でテンポと音を変える
  function bgmStart(intense) {
    if (!ctx) return; bgmStop();
    const bpm = intense ? 150 : 128, sp = 60 / bpm / 2;
    const root = intense ? 45 : 43, prog = [0, 0, 3, 5, 0, 0, 7, 5], arp = [0, 7, 12, 15, 12, 7];
    let step = 0, next = ctx.currentTime + .1;
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    seq = setInterval(() => {
      if (!ctx || muted) { next = ctx ? ctx.currentTime + .1 : 0; return; }
      while (next < ctx.currentTime + .25) {
        const bar = Math.floor(step / 8) % prog.length, at = next - ctx.currentTime, r = root + prog[bar];
        if (step % 2 === 0) tone({ f: mtof(r), d: sp * 1.6, type: 'sawtooth', v: .5, at, dest: bgmG });
        tone({ f: mtof(r + 24 + arp[step % arp.length]), d: sp * .8, type: 'triangle', v: .18, at, dest: bgmG });
        if (step % 2 === 1) noise({ d: .04, v: .25, lp: 9000, at, dest: bgmG });
        if (intense && step % 4 === 0) tone({ f: 60, f2: 40, d: .12, type: 'sine', v: .9, at, dest: bgmG });
        next += sp; step++;
      }
    }, 60);
  }
  function bgmStop() { if (seq) clearInterval(seq); seq = null; }
  function setMute(m) { muted = m; try { localStorage.setItem('robodef_mute', m ? '1' : '0'); } catch (_) {} if (master) master.gain.value = m ? 0 : .7; }
  return { init, S, bgmStart, bgmStop, setMute, get muted() { return muted; } };
})();

// ---------- 粒子（破片・発砲光）：まとめて1回で描く ----------
const PMAX = 2200, parts = [], pCol = new T.Color();
const partMesh = new T.InstancedMesh(G.box, new T.MeshBasicMaterial({ color: 0xffffff }), PMAX);
partMesh.count = 0; partMesh.frustumCulled = false; partMesh.setColorAt(0, pCol); scene.add(partMesh);
function burst(x, z, color, n, spd, size, life, y = .6, up = 1) {
  for (let i = 0; i < n && parts.length < PMAX; i++) {
    const a = Math.random() * Math.PI * 2, v = spd * (.4 + Math.random() * .8);
    parts.push({ x, y, z, vx: Math.sin(a) * v, vy: (1 + Math.random() * 2) * up, vz: Math.cos(a) * v, life: life * (.6 + Math.random() * .6), max: life, size: size * (.6 + Math.random() * .7), color, g: up ? 9 : 0 });
  }
}
function flash(x, z, color, size, life, y = .7) { if (parts.length < PMAX) parts.push({ x, y, z, vx: 0, vy: 0, vz: 0, life, max: life, size, color, g: 0, flash: true }); }
function updParts(dt) {
  let n = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    p.vy -= p.g * dt; p.x += p.vx * dt; p.y = Math.max(.05, p.y + p.vy * dt); p.z += p.vz * dt;
    const k = p.life / p.max, s = p.flash ? p.size * (.4 + k) : p.size * (.3 + .7 * k);
    dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.life * 7, p.life * 5, 0); dummy.scale.setScalar(s); dummy.updateMatrix();
    partMesh.setMatrixAt(n, dummy.matrix); partMesh.setColorAt(n, pCol.setHex(p.color)); n++;
  }
  partMesh.count = n; partMesh.instanceMatrix.needsUpdate = true; if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
}

// ---------- 画面の揺れ・告知バナー・連続撃破 ----------
let shakeT = 0, shakeMag = 0;
function shake(mag, t) { if (mag >= shakeMag || shakeT <= 0) { shakeMag = mag; shakeT = t; } }
function banner(main, sub, kind, dur = 2.2) {
  const b = $('banner'); b.className = 'banner ' + (kind || ''); b.innerHTML = '<b>' + esc(main) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '');
  void b.offsetWidth; b.classList.add('show'); clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.remove('show'), dur * 1000);
}
const combo = { times: [], n: 0, t: 0, best: 0 };
function comboKill(gt) {
  combo.times.push(gt); while (combo.times.length && gt - combo.times[0] > 1.2) combo.times.shift();
  const n = combo.times.length;
  if (n >= 8) {
    combo.n = Math.max(n, combo.n); combo.t = 1.2; combo.best = Math.max(combo.best, n);
    const el = $('combo'); el.innerHTML = '<b>×' + combo.n + '</b><span>' + (combo.n >= 30 ? '一騎当千！' : combo.n >= 15 ? '一網打尽！' : '連続撃破') + '</span>';
    el.classList.add('show'); el.classList.toggle('big', combo.n >= 15); AU.S.combo(n);
  }
}
function updCombo(dt) { if (combo.t > 0) { combo.t -= dt; if (combo.t <= 0) { combo.n = 0; $('combo').classList.remove('show'); } } }

// ---------- エフェクト ----------
const fxs = []; let lastFlash = 0;
function fxMesh(geo, color, x, z, y, from, to, dur, flat) {
  const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: .9, side: T.DoubleSide, depthWrite: false });
  const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (flat) m.rotation.x = -Math.PI / 2; m.scale.setScalar(from);
  scene.add(m); fxs.push({ m, from, to, dur, t: 0 });
}
function fxColumn(x, z, color) {
  const mat = new T.MeshBasicMaterial({ color, transparent: true, opacity: .7, depthWrite: false });
  const m = new T.Mesh(G.cyl, mat); m.position.set(x, 7, z); m.scale.set(1.2, 14, 1.2); scene.add(m); fxs.push({ m, from: 1.2, to: 0, dur: .45, t: 0, col: true });
}
const pendingDrop = new Set();
const FIRE_COL = { b: 0x9df8ff, s: 0x7fd0ff, m: 0xffd166, h: 0xffffff };
const KILL_COL = { swarm: 0xff5c8a, swarmFast: 0xffd166, swarmHeavy: 0xa0283c, swarmBomb: 0xffa94d, swarmFly: 0xff8ad8 };
function addFx(f) {
  switch (f.type) {
    case 'fire': flash(f.x + Math.sin(f.a) * .9, f.z + Math.cos(f.a) * .9, FIRE_COL[f.kind], f.kind === 'h' ? .7 : .42, .07); AU.S.shot(f.kind); return;
    case 'chain': { const l = makeLine(new T.LineBasicMaterial({ color: 0x9df8ff })); setLine(l, f.x, f.z, f.x2, f.z2); l.position.y = .5; scene.add(l); setTimeout(() => { scene.remove(l); l.geometry.dispose(); l.material.dispose(); }, 120); return; }
    case 'splash': burst(f.x, f.z, 0xffa94d, 4, 4, .14, .3, .5, .6); return;
    case 'kill':
      comboKill(S.t);
      if (f.small) { burst(f.x, f.z, KILL_COL[f.kind] || 0xff5c8a, 3, 3, .14, .45); AU.S.kill(true); return; }
      burst(f.x, f.z, 0xff4d6d, f.big ? 40 : 8, f.big ? 8 : 4, f.big ? .35 : .18, f.big ? 1.2 : .6);
      fxMesh(G.ring, 0xff6a7a, f.x, f.z, .1, .3, f.big ? 5 : 1.4, f.big ? .8 : .35, true); floatText(f.x, f.z, '+' + f.pts); AU.S.kill(false);
      if (f.big) { fxMesh(G.sph, 0xff4d6d, f.x, f.z, 1, .5, 6, .7); shake(.6, .6); AU.S.blast(true); banner('模倣機 撃破', '+' + f.pts, 'good', 1.8); }
      return;
    case 'blast': { const e = f.team === 'e'; fxMesh(G.sph, e ? 0xff4d6d : 0xffa94d, f.x, f.z, .4, .3, f.rad * 2, .4); fxMesh(G.ring, e ? 0xff2d55 : 0xffd166, f.x, f.z, .08, .3, f.rad * 1.05, .45, true); burst(f.x, f.z, e ? 0xff4d6d : 0xffa94d, 10, 6, .2, .5); AU.S.blast(false); shake(.12, .15); return; }
    case 'boom': fxMesh(G.sph, 0xffa94d, f.x, f.z, .5, .4, f.rad * 2, .5); fxMesh(G.ring, 0xffd166, f.x, f.z, .1, .5, f.rad * 1.1, .6, true); burst(f.x, f.z, 0xffd166, 22, 9, .25, .8); AU.S.blast(true); shake(.35, .35); return;
    case 'robodie': fxMesh(G.sph, 0x65f6ff, f.x, f.z, .6, .4, 2.2, .45); fxMesh(G.ring, 0x4dabff, f.x, f.z, .1, .4, 2, .5, true); burst(f.x, f.z, 0x4dabff, 16, 6, .22, .9); AU.S.lost(); shake(.2, .25); return;
    case 'rebuild': fxMesh(G.ring, 0xff4d6d, f.x, f.z, .1, 4, .5, .8, true); return;
    case 'block': fxMesh(G.ring, 0xffc2ef, f.x, f.z, .6, .1, .6, .2, true); return;
    case 'ebase': fxMesh(G.sph, 0xff4d6d, f.x, f.z, 1, .5, 6, .7); fxMesh(G.ring, 0xffd166, f.x, f.z, .1, 1, 5, .8, true); burst(f.x, f.z, 0xff4d6d, 40, 10, .35, 1.3); floatText(f.x, f.z, '+' + f.pts); AU.S.blast(true); shake(.6, .5); return;
    case 'work': fxMesh(G.ring, 0x7dffa8, S.home.x, S.home.z, .1, 1, 4, .6, true); burst(S.home.x, S.home.z, 0x7dffa8, 14, 4, .18, .7, 1.5); AU.S.built(); return;
    case 'spawn': fxColumn(f.x, f.z, 0x65f6ff); fxMesh(G.ring, 0x65f6ff, f.x, f.z, .06, .3, 2.2, .4, true); pendingDrop.add(f.id); AU.S.built(); return;
    case 'capture': fxMesh(G.ring, 0x65f6ff, f.x, f.z, .06, .5, 4, .6, true); burst(f.x, f.z, 0x65f6ff, 14, 5, .18, .7); AU.S.capture(); return;
    case 'novaWarn': fxMesh(G.ring, 0xffd166, f.x, f.z, .1, .5, 6, 1, true); fxMesh(G.ring, 0xffd166, f.x, f.z, .1, .5, 6, 1.6, true); banner('☄ NOVA', '発動まで3秒　味方と拠点も巻き込む', 'boss', 2.4); AU.S.alarm(); return;
    case 'nova': {
      const R = Math.max(mapW, mapD) * 1.2;
      fxMesh(G.sph, 0xfff1b0, f.x, f.z, .5, 1, 9, .5); fxMesh(G.ring, 0xffd166, f.x, f.z, .2, 1, R, 1.1, true); fxMesh(G.ring, 0xffffff, f.x, f.z, .3, 1, R * .8, .8, true);
      burst(f.x, f.z, 0xfff1b0, 60, 16, .35, 1.2, 1, 1.5); const h = $('hitFlash'); h.classList.add('nova', 'on'); setTimeout(() => h.classList.remove('on', 'nova'), 120);
      AU.S.blast(true); setTimeout(() => AU.S.blast(true), 120); shake(1.2, .9); return;
    }
    case 'boss': banner('WARNING', '模倣機（ボス）接近', 'boss', 2.8); AU.S.boss(); shake(.25, .8); return;
    case 'basehit': {
      fxMesh(G.ring, 0xff2d55, f.x, f.z, .2, .3, 1.4, .4, true);
      const now = performance.now();
      if (now - lastFlash > 900) { lastFlash = now; const h = $('hitFlash'); h.classList.add('on'); requestAnimationFrame(() => h.classList.remove('on')); shake(.12, .2); AU.S.alarm(); }
      return;
    }
  }
}
function updFx(dt) {
  for (let i = fxs.length - 1; i >= 0; i--) {
    const f = fxs[i]; f.t += dt; const k = Math.min(1, f.t / f.dur);
    if (f.col) { const w = f.from * (1 - k * .8); f.m.scale.set(w, 14, w); } else f.m.scale.setScalar(f.from + (f.to - f.from) * k);
    f.m.material.opacity = .9 * (1 - k);
    if (k >= 1) { scene.remove(f.m); f.m.material.dispose(); fxs.splice(i, 1); }
  }
}
function floatText(x, z, text) {
  const p = new T.Vector3(x, 1, z).project(cam); if (p.z > 1) return;
  const d = document.createElement('div'); d.className = 'float'; d.textContent = text;
  d.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; d.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
  $('floats').appendChild(d); setTimeout(() => d.remove(), 800);
}
function toast(text, kind = 'info') {
  const box = $('toasts'), d = document.createElement('div');
  d.className = 'toast ' + kind; d.textContent = text; box.prepend(d);
  const life = kind === 'new' ? 5000 : kind === 'bad' ? 3200 : kind === 'warn' || kind === 'good' ? 2600 : 1800;
  setTimeout(() => d.classList.add('out'), life); setTimeout(() => d.remove(), life + 400);
  while (box.children.length > 3) box.lastChild.remove();
}

// ---------- 入力：タップで選択・移動 ----------
const ray = new T.Raycaster(), ground = new T.Plane(new T.Vector3(0, 1, 0), 0), hit = new T.Vector3(), ndc = new T.Vector2();
function toWorld(px, py) {
  ndc.set(px / innerWidth * 2 - 1, -(py / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  return ray.ray.intersectPlane(ground, hit) ? { x: hit.x, z: hit.z } : null;
}
// 1本指：短く触れて離す＝タップ、動かす＝スワイプ移動。2本指：ピンチで拡大縮小
const ptrs = new Map(); let gest = null;
canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) gest = { type: 'tap', x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now() };
  else if (ptrs.size === 2 && !pilot) { const [a, b] = [...ptrs.values()]; gest = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: camS.zoom }; }
});
canvas.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId) || !gest) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pilot) { pilotMove(e); return; }
  if (gest.type === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    zoomAt(gest.z0 * Math.hypot(a.x - b.x, a.y - b.y) / gest.d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
  } else if (ptrs.size === 1) {
    if (gest.type === 'tap' && Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0) > 12) gest.type = 'pan';
    if (gest.type === 'pan') panBy(e.clientX - gest.lx, e.clientY - gest.ly);
    gest.lx = e.clientX; gest.ly = e.clientY;
  }
});
function ptrEnd(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (gest && gest.type === 'tap' && ptrs.size === 0 && performance.now() - gest.t < 700) (pilot ? pilotTap : tap)(e.clientX, e.clientY);
  if (ptrs.size === 0) gest = null;
  else { const p = [...ptrs.values()][0]; gest = { type: 'pan', lx: p.x, ly: p.y }; } // ピンチの後はタップ扱いにしない
}
canvas.addEventListener('pointerup', ptrEnd);
canvas.addEventListener('pointercancel', ptrEnd);
canvas.addEventListener('wheel', e => { e.preventDefault(); if (pilot) return; zoomAt(camS.zoom * Math.exp(-e.deltaY * .0015), e.clientX, e.clientY); }, { passive: false });
function tap(px, py) {
  if (mode !== 'play' || paused || building) return;
  const w = toWorld(px, py); if (!w) return;
  // ロボットは背が高いので、見た目の中心（少し奥）で当たりを取る
  // 画面上の距離で選ぶ（縮小表示でも指で選びやすいように、見た目の中心から 38px 以内か、地図上で 1.35 以内）
  let best = null, bd = 1e9;
  for (const r of S.robots) {
    const v = views.get(r.id); tagV.set(r.x, v ? v.barY * .5 : .8, r.z).project(oCam);
    const sd = Math.hypot((tagV.x + 1) / 2 * innerWidth - px, (1 - tagV.y) / 2 * innerHeight - py), wd = Math.hypot(r.x - w.x, r.z - .45 - w.z);
    const sc = Math.min(sd / 38, wd / 1.35); if (sc < 1 && sc < bd) { bd = sc; best = r; }
  }
  if (best) { sel = sel === best ? null : best; if (sel) tutDone('sel'); updInfo(); return; }
  if (sel) {
    if (w.x < MAP.minX - .5 || w.x > MAP.maxX + .5 || w.z < MAP.minZ - .5 || w.z > MAP.maxZ + .5) { sel = null; updInfo(); toast('選択を解除'); return; } // 戦場の外は移動先にしない
    moveRobot(sel, w.x, w.z, S); tutDone('moved');
    marker.position.set(sel.tx, .06, sel.tz); marker.visible = true; markerT = .6;
    sel = null; updInfo();
  }
}

// ---------- 自操作（乗る）：肩越しの3D視点 ----------
// 乗っている間：機体は動かない／時間は通常どおり流れる／ロックした敵が射程内の武器はそれを撃ち、ほかの武器は自動で全方向を狙う
let pYawT = 0, pWeapEls = [], runSeenE = new Set();
// 初めて見る敵：一度だけ説明を出す（SAVE.seenE に記録）
function checkNewEnemies() {
  for (const e of S.enemies) if (!runSeenE.has(e.type)) {
    runSeenE.add(e.type); SAVE.seenE = SAVE.seenE || {};
    if (!SAVE.seenE[e.type] && ENEMIES[e.type].desc) { SAVE.seenE[e.type] = 1; saveNow(); toast('NEW 敵：' + ENEMIES[e.type].name + '　' + ENEMIES[e.type].desc, 'new'); }
  }
}
const PV = new T.Vector3();
function pilotFov(asp) { return Math.max(58, Math.min(96, 2 * Math.atan(Math.tan(50 * Math.PI / 180) / asp) * 180 / Math.PI)); }
function enterPilot(r) {
  if (!r || r.dead || mode !== 'play' || paused || building || !S.allow.pilot) return;
  RD.setPilot(S, r); pilot = r; pYawT = r.aimYaw = r.face; sel = null; cam = pCam; scene.fog = FOG_P; tutDone('rode');
  document.body.classList.add('piloting'); setRoster(false); updInfo(); fit();
  $('pName').textContent = r.name + ' ' + r.weapons.map(w => w.def.icon).join('');
  $('pWeap').innerHTML = r.weapons.map(w => '<div class="pw"><span class="pn">' + w.def.icon + ' ' + esc(w.def.name) + '</span><span class="pc"><i></i></span><b></b></div>').join('');
  pWeapEls = [...$('pWeap').children];
  banner('搭乗', '連射・威力・射程が上がる。機体は動かない', 'start', 1.6);
}
function exitPilot(msg) {
  if (!pilot) return;
  const r = pilot; RD.setPilot(S, null); pilot = null; cam = oCam; scene.fog = null;
  document.body.classList.remove('piloting'); $('lockMk').style.display = 'none';
  if (!r.dead) { camS.x = r.x; camS.z = r.z; }
  fit(); updInfo(); if (msg) toast(msg, 'bad');
}
function pilotMove(e) {
  if (!gest || ptrs.size !== 1) return;
  if (gest.type === 'tap' && Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0) > 10) gest.type = 'turn';
  if (gest.type === 'turn' || gest.type === 'pan') { pilot.aimYaw -= (e.clientX - gest.lx) * 2.6 / Math.max(320, innerWidth); pYawT = pilot.aimYaw; }
  gest.lx = e.clientX; gest.ly = e.clientY;
}
// タップした位置に一番近い敵（画面上で48px以内）をロック。何もなければロック解除
function pilotTap(px, py) {
  if (mode !== 'play' || paused || building || !pilot) return;
  let best = null, bd = 48 * 48;
  for (const e of S.enemies.concat(S.ebases)) {
    if (e.dead || Math.hypot(e.x - pilot.x, e.z - pilot.z) > 70) continue;
    PV.set(e.x, e.ebase ? 1.2 : .6, e.z).project(pCam); if (PV.z > 1) continue;
    const d = ((PV.x + 1) / 2 * innerWidth - px) ** 2 + ((1 - PV.y) / 2 * innerHeight - py) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  RD.setLock(pilot, best);
}
function turnTo(yaw) { pYawT = yaw; }
const radar = $('radar'), rctx = radar.getContext('2d'), RADAR_R = 26;
radar.addEventListener('pointerdown', e => { // レーダーをタップ：その方向を向く
  e.stopPropagation(); if (!pilot) return;
  const b = radar.getBoundingClientRect(), rx = e.clientX - b.left - b.width / 2, fz = -(e.clientY - b.top - b.height / 2);
  if (Math.hypot(rx, fz) < 6) return;
  const f = pilot.aimYaw, wx = Math.sin(f) * fz - Math.cos(f) * rx, wz = Math.cos(f) * fz + Math.sin(f) * rx;
  turnTo(Math.atan2(wx, wz));
});
function drawRadar() {
  const dpr = Math.min(2, devicePixelRatio || 1), W = radar.clientWidth || 128;
  if (radar.width !== Math.round(W * dpr)) { radar.width = radar.height = Math.round(W * dpr); }
  const c = rctx, h = W / 2, sc = h / RADAR_R, r = pilot, f = r.aimYaw, cs = Math.cos(f), sn = Math.sin(f);
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, W);
  c.fillStyle = '#050a1ccc'; c.beginPath(); c.arc(h, h, h - 1, 0, 7); c.fill();
  c.strokeStyle = '#2f4c74'; c.lineWidth = 1; c.beginPath(); c.arc(h, h, h - 1, 0, 7); c.arc(h, h, h / 2, 0, 7); c.stroke();
  // 視野（画面に映る範囲のめやす）
  const hf = Math.atan(Math.tan(pCam.fov * Math.PI / 360) * pCam.aspect);
  c.fillStyle = '#65f6ff14'; c.beginPath(); c.moveTo(h, h); c.arc(h, h, h - 1, -Math.PI / 2 - hf, -Math.PI / 2 + hf); c.closePath(); c.fill();
  // 射程（乗っているときの値）
  const R = Math.max(...r.weapons.map(w => (w.def.range || w.def.trigger || 1) * r.rangeMul)) * CFG.pilot.range;
  c.strokeStyle = '#65f6ff66'; c.setLineDash([3, 3]); c.beginPath(); c.arc(h, h, Math.min(h - 1, R * sc), 0, 7); c.stroke(); c.setLineDash([]);
  const pt = (x, z) => { const dx = x - r.x, dz = z - r.z, fw = dx * sn + dz * cs, rt = -dx * cs + dz * sn; return [h + rt * sc, h - fw * sc, Math.hypot(dx, dz)]; };
  const dot = (x, z, col, s) => { const [px, py, d] = pt(x, z); if (d > RADAR_R) return; c.fillStyle = col; c.fillRect(px - s / 2, py - s / 2, s, s); };
  dot(S.home.x, S.home.z, '#ffd166', 7);
  for (const o of S.outposts) dot(o.x, o.z, o.owner === 'p' ? '#4dabff' : o.owner === 'e' ? '#ff4d6d' : '#9fb6d6', 5);
  for (const b of S.ebases) if (!b.dead) dot(b.x, b.z, '#ff7a90', 8);
  for (const e of S.enemies) if (!e.dead) dot(e.x, e.z, e.def.boss ? '#ffffff' : '#ff4d6d', e.def.boss ? 6 : e.def.inst ? 2 : 3);
  for (const o of S.robots) if (o !== r) dot(o.x, o.z, '#65f6ff', 4);
  if (r.lock && !r.lock.dead) { const [px, py, d] = pt(r.lock.x, r.lock.z); const k = Math.min(1, (RADAR_R - 1) / Math.max(d, .01)); c.strokeStyle = '#ffd166'; c.lineWidth = 1.5; c.beginPath(); c.arc(h + (px - h) * k, h + (py - h) * k, 5, 0, 7); c.stroke(); }
  c.fillStyle = '#65f6ff'; c.beginPath(); c.moveTo(h, h - 6); c.lineTo(h - 4, h + 4); c.lineTo(h + 4, h + 4); c.closePath(); c.fill();
}
function updPilot(dt) {
  if (!pilot) return;
  const r = pilot;
  if (r.dead || mode !== 'play' || !S || !S.robots.includes(r)) { exitPilot(r.dead ? '搭乗機が撃破された' : ''); return; }
  r.aimYaw = lerpAngle(r.aimYaw, pYawT, 1 - Math.exp(-10 * dt));
  const f = r.aimYaw, fx = Math.sin(f), fz = Math.cos(f), sc = TIER[r.body.tier].scale;
  // 肩越し：機体の右後ろ上から、前方を見る（機体は画面の左下に小さめに入る）
  // 縦長の画面は上が空になりやすいので、少し高く・手前を見下ろす
  const t = Math.max(0, Math.min(1, (pCam.aspect - .5))), back = 6.2 * sc, side = 1.9 * sc, ht = (4.8 - 1.4 * t) * sc, look = 8 + 8 * t;
  pCam.position.set(r.x - fx * back - fz * side, ht, r.z - fz * back + fx * side);
  pCam.lookAt(r.x + fx * look - fz * side * .5, 0, r.z + fz * look + fx * side * .5);
  if (r.lock && r.lock.dead) RD.setLock(r, null);
  // ロック表示
  const mk = $('lockMk'), L = r.lock;
  let on = 0; r.weapons.forEach((w, i) => { const el = pWeapEls[i]; if (!el) return; const k = w.cdMax ? Math.max(0, 1 - w.cd / w.cdMax) : 1;
    el.querySelector('i').style.width = (k * 100) + '%'; const lk = !!(L && w.onLock); if (lk) on++;
    el.classList.toggle('lk', lk); el.lastChild.textContent = !L ? '自動' : lk ? '◎ロック' : '自動'; });
  if (L) {
    PV.set(L.x, L.ebase ? 1.2 : .6, L.z).project(pCam);
    let x = (PV.x + 1) / 2 * innerWidth, y = (1 - PV.y) / 2 * innerHeight; const back = PV.z > 1;
    if (back) { x = innerWidth - x; y = innerHeight - y; }
    const m = 30, off = back || x < m || x > innerWidth - m || y < m || y > innerHeight - m;
    x = Math.max(m, Math.min(innerWidth - m, x)); y = Math.max(m, Math.min(innerHeight - m, y));
    mk.style.display = 'block'; mk.style.transform = 'translate(' + x + 'px,' + y + 'px) translate(-50%,-50%)';
    mk.className = (on ? 'in' : '') + (off ? ' off' : '');
    mk.lastChild.textContent = Math.round(Math.hypot(L.x - r.x, L.z - r.z)) + 'm' + (on ? ' ◎' + on : ' 射程外');
  } else mk.style.display = 'none';
  setText('pHint', L ? 'ロック中：射程に入った武器が狙う ・ 何もない所をタップで解除' : 'ドラッグで旋回 ・ 敵をタップでロック');
  $('pHp').style.width = Math.max(0, r.hp / r.maxHp * 100) + '%'; $('pHp').className = r.hp < r.maxHp * .3 ? 'low' : '';
  $('pShW').style.display = r.maxShield ? '' : 'none'; if (r.maxShield) $('pSh').style.width = Math.max(0, r.shield / r.maxShield * 100) + '%';
  setText('pHpN', '❤' + Math.ceil(r.hp) + (r.maxShield ? ' 🛡' + Math.ceil(r.shield) : ''));
  drawRadar();
}
$('pExit').addEventListener('click', () => exitPilot());
$('pTurn').addEventListener('click', () => { if (pilot) turnTo(pYawT + Math.PI); });
$('pBuild').addEventListener('click', () => openBuild());
$('info').addEventListener('click', e => { if (e.target.closest('[data-ride]') && sel) enterPilot(sel); else if (e.target.closest('[data-desel]')) { sel = null; updInfo(); } });

// ---------- 稼働中ロボット一覧（右端・折りたたみ） ----------
let rosterOpen = false;
const rosterEls = new Map();
function setRoster(open) { rosterOpen = open; $('roster').classList.toggle('open', open); }
$('rosterTab').addEventListener('click', () => setRoster(!rosterOpen));
$('rosterList').addEventListener('click', e => {
  const c = e.target.closest('[data-id]'); if (!c || mode !== 'play' || paused || building) return;
  const r = S.robots.find(x => x.id === +c.dataset.id); if (!r) return;
  if (e.target.closest('[data-ride]')) { enterPilot(r); return; }
  sel = sel === r ? null : r; if (sel) tutDone('sel'); updInfo();
  if (sel && innerWidth < 700) setRoster(false); // スマホでは閉じて、移動先をタップしやすくする
});
function robotState(r) {
  if (S.t - r.hitT < 1) return ['被弾', 'bad'];
  if (S.t - r.fireT < .8) return ['交戦中', 'fight'];
  if (r.moving) return ['移動中', 'move'];
  return ['待機', ''];
}
function updRoster() {
  const list = $('rosterList'), alive = new Set();
  for (const r of S.robots.slice().sort((a, b) => a.slot - b.slot)) {
    alive.add(r.id);
    let el = rosterEls.get(r.id);
    if (!el) {
      el = document.createElement('button'); el.className = 'rcard'; el.dataset.id = r.id;
      el.innerHTML = '<div class="rn"><span class="num"></span><b></b><span class="rw"></span></div><div class="rb"><i></i></div><div class="rr"><span class="rs"></span>' + (S.allow.pilot ? '<span class="ride" data-ride>🎮 乗る</span>' : '') + '</div>';
      el.querySelector('.num').textContent = r.slot; el.querySelector('b').textContent = r.body.name; el.querySelector('.rw').textContent = r.weapons.map(w => w.def.icon).join('');
      list.appendChild(el); rosterEls.set(r.id, el);
    }
    const [st, cls] = robotState(r), k = Math.max(0, r.hp / r.maxHp);
    el.classList.toggle('on', sel === r);
    const bar = el.querySelector('.rb i'); bar.style.width = (k * 100) + '%'; bar.className = k < .3 ? 'low' : '';
    const sEl = el.querySelector('.rs'), txt = st + ' ❤' + Math.ceil(r.hp) + (r.maxShield ? ' 🛡' + Math.ceil(r.shield) : '');
    if (sEl.textContent !== txt) { sEl.textContent = txt; sEl.className = 'rs ' + cls; }
  }
  for (const [id, el] of rosterEls) if (!alive.has(id)) { el.remove(); rosterEls.delete(id); }
  setText('rTabN', String(S.robots.length));
  const pips = S.robots.slice().sort((a, b) => a.slot - b.slot).map(r => '<i style="width:' + Math.round(Math.max(0, r.hp / r.maxHp) * 100) + '%" class="' + (sel === r ? 'on' : '') + '"></i>').join('');
  if (hudCache.pips !== pips) { hudCache.pips = pips; $('rTabPips').innerHTML = pips; }
}

// ---------- HUD ----------
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function updHud() {
  const left = S.st.time - S.t;
  setText('hTime', fmtT(left)); $('hTime').classList.toggle('low', left <= 15);
  setText('hPts', String(S.pts));
  const g = S.st.goal;
  const ebLeft = S.ebases.filter(b => !b.dead).length;
  const leftE = g === 'clear' ? S.spawners.reduce((a, x) => a + x.n, 0) + S.waves.slice(S.waveIdx).reduce((a, w) => a + w[2], 0) + S.enemies.filter(e => e.state !== 'guard').length : 0;
  setText('hGoal', (g === 'points' ? '🎯⭐' + S.st.goalPts + ' ' : g === 'boss' ? (S.enemies.some(e => e.def.boss) ? '👹 撃破せよ ' : '👹 接近中 ') : g === 'clear' ? '👾残り' + leftE + ' ' : '') + (S.ebases.length ? '🏭' + ebLeft + '/' + S.ebases.length : ''));
  $('hGoal').style.display = $('hGoal').textContent ? '' : 'none';
  $('hPts').classList.toggle('goalok', g === 'points' && S.pts >= S.st.goalPts * .8);
  setText('hBots', S.robots.length + '/' + CFG.deployCap + (S.queue.length ? '+' + S.queue.length : ''));
  setText('hBaseN', Math.ceil(S.baseHP) + (S.homeShield > 0 ? ' 🛡' + Math.ceil(S.homeShield) : ''));
  const k = S.baseHP / CFG.baseHP;
  $('hBase').style.width = (k * 100) + '%'; $('hBaseBar').classList.toggle('hurt', k < .5);
  // 建造キュー
  let busy = 0;
  const q = $('queue'), html = S.queue.map((it, i) => {
    const ready = it.prog >= it.time, act = !ready && busy++ < S.lines, op = S.outposts[it.at];
    const st = ready ? (op && op.owner !== 'p' ? ' ⚠陣地喪失' : ' 出撃待ち') : act ? ' ' + Math.max(0, it.time - it.prog).toFixed(1) + 's' : ' 待機';
    return '<div class="qchip' + (ready ? ' ready' : act ? '' : ' wait') + '"><span class="num">予' + (i + 1) + '</span>' + esc(it.body.name) + ' ' + it.wids.map(w => WEAPONS[w].icon).join('') + (op ? '🚩' + op.label : '') + st + '<i style="width:' + (it.prog / it.time * 100) + '%"></i></div>';
  }).join('');
  if (hudCache.queue !== html) { hudCache.queue = html; q.innerHTML = html; }
  if (sel && sel.dead) sel = null;
  updInfo(); updRoster();
}
// 初めての人への案内：一度できたことは二度と出さない（SAVE.tut に記録）
function tutDone(k) { SAVE.tut = SAVE.tut || {}; if (!SAVE.tut[k]) { SAVE.tut[k] = 1; saveNow(); } }
function coachTip() {
  if (mode !== 'play' || building || paused || pilot || !S) return null;
  const t = SAVE.tut || {};
  if (!t.built) return S.queue.length ? ['⏱', '建造中…できあがると拠点から出撃する'] : ['🔧', '右下の「建造」でロボットを作ろう', 'build'];
  if (!t.sel && S.robots.length && !sel) return ['👆', 'ロボットをタップして選ぼう', 'robot'];
  if (S.allow.pilot && !t.rode && S.t > 8 && S.robots.length && !sel) return ['🎮', 'ロボットを選んで「乗る」と、自分で操縦できる'];
  return null;
}
function updInfo() {
  const el = $('info'), tip = sel ? null : coachTip();
  const key = sel ? 'sel' + sel.id + (SAVE.tut && SAVE.tut.moved ? 'm' : '') : tip ? 'tip' + tip[1] : 'hint' + (S && S.robots.length ? 1 : S && S.queue.length ? 2 : 0);
  if (hudCache.infoKey !== key) {
    hudCache.infoKey = key;
    if (sel) el.innerHTML = '<div class="selp"><span class="num">' + sel.slot + '</span><div class="sn"><b>' + esc(sel.body.name) + ' <span class="wi">' + sel.weapons.map(w => w.def.icon).join('') + '</span></b><span class="hpb"><i></i></span></div>' + (S.allow.pilot ? '<button class="ride" data-ride>🎮 乗る</button>' : '') + '<button class="desel" data-desel>✕<small>解除</small></button></div>' +
      '<div class="selhint"><span class="slow">◷スロー</span>' + (SAVE.tut && SAVE.tut.moved ? '地面をタップで移動' : '<b>地面をタップすると、そこへ移動する</b>') + '<span class="dim">　解除は ✕ か、ロボットをもう一度タップ</span></div>';
    else if (tip) el.innerHTML = '<div class="coach"><span>' + tip[0] + '</span>' + esc(tip[1]) + '</div>';
    else el.innerHTML = '<div class="hint">' + esc(S && S.robots.length ? 'ロボットをタップ → 地面をタップで移動' : S && S.queue.length ? '建造中…完成したら出撃する' : '🔧 建造からロボットを作ろう') + '</div>';
    el.className = sel ? 'sel' : tip ? 'tip' : '';
    document.body.classList.toggle('selecting', !!sel);
  }
  if (sel) { const i = el.querySelector('.hpb i'); if (i) { const k = Math.max(0, sel.hp / sel.maxHp); i.style.width = (k * 100) + '%'; i.className = k < .3 ? 'low' : ''; } }
  const tg = tip && tip[2];
  $('buildBtn').classList.toggle('pulse', tg === 'build' || (mode === 'play' && !!S && !S.robots.length && !S.queue.length && !building));
  document.body.classList.toggle('coachRobot', tg === 'robot');
}

// ---------- 建造画面 ----------
function plusText(p) { return Object.keys(p).map(k => PLUS[k].icon + PLUS[k].name + PLUS[k].fmt(p[k])).join(' '); }
function openBuild() {
  if (mode !== 'play') return;
  building = true; sel = null; updInfo(); canvas.classList.add('frozen');
  uiBody = null; uiW = new Set(); uiTab = 'robot'; uiWork = null; // 毎回まっさらな状態から選ぶ
  renderBuild(); $('buildM').classList.add('show'); $('buildM').querySelector('.card').scrollTop = 0;
}
function closeBuild() { building = false; $('buildM').classList.remove('show'); canvas.classList.remove('frozen'); }
function bodyRow(b, attrs, cls) {
  return '<button class="item ' + (cls || '') + '" ' + attrs + '>' +
    '<div class="l1"><span class="tier ' + b.tier + '">' + TIER[b.tier].name + '</span><b>' + esc(b.name) + '</b><span class="sp"></span><span class="cost">⭐' + b.cost + '</span></div>' +
    '<div class="l2"><span>❤HP ' + b.hp + '</span><span>👟速度 ' + b.speed + '</span><span>⏱建造 ' + b.build + 's</span><span class="plus">' + (b.note ? esc(b.note) + ' ' : '') + (plusText(b.plus) || (b.note ? '' : '特性なし')) + '</span></div></button>';
}
function renderBuild() {
  $('bPts').textContent = S.pts;
  $('bLine').style.display = S.allow.line2 ? '' : 'none';
  $('bLine').innerHTML = '🏗 建造ライン <b>' + S.lines + '/2</b>' + (S.lines < 2 ? '<button id="lineBtn" class="chip"' + (S.pts < CFG.line2Cost ? ' disabled' : '') + '>2本目を開放 ⭐' + CFG.line2Cost + '</button><span class="dim">同時に2機建造できる</span>' : '<span class="dim">2機同時に建造できる</span>');
  if ($('lineBtn')) $('lineBtn').onclick = () => { const err = buyLine(S); if (err) toast(err, 'warn'); renderBuild(); };
  const step2 = !!uiBody;
  const anyWork = Object.keys(WORKS).some(id => S.allow[id]); if (!anyWork) uiTab = 'robot';
  $('bTabs').style.display = step2 || !anyWork ? 'none' : '';
  $('bTabs').innerHTML = '<button data-tab="robot" class="' + (uiTab === 'robot' ? 'on' : '') + '">🤖 ロボット</button><button data-tab="works" class="' + (uiTab === 'works' ? 'on' : '') + (S.baseHP < CFG.baseHP * .5 ? ' warn' : '') + '">🏗 拠点工事 <small>🏠' + Math.ceil(S.baseHP) + '</small></button>';
  $('bStep1').style.display = !step2 && uiTab === 'robot' ? '' : 'none';
  $('bWorksPane').style.display = !step2 && uiTab === 'works' ? '' : 'none';
  $('bFoot1').style.display = step2 ? 'none' : '';
  $('bStep2').style.display = step2 ? '' : 'none';
  if (!step2) {
    const minW = Math.min(...Object.keys(WEAPONS).filter(id => RD.weaponAllowed(S, id)).map(id => WEAPONS[id].cost)), full = S.queue.length >= CFG.queueMax;
    $('bNote1').innerHTML = full ? '<div class="note">予約は' + CFG.queueMax + '機までです。建造か出撃が進むまで待ってください</div>' : S.robots.length >= CFG.deployCap ? '<div class="note">' + (S.allow.reserve ? '出撃中が上限（' + CFG.deployCap + '機）です。予約した機体は、誰かが倒れたらすぐ出撃します' : '出撃枠がいっぱいです（' + CFG.deployCap + '機）。誰かが倒れると作れる') + '</div>' : '';
    const capFull = !S.allow.reserve && S.robots.length + S.queue.filter(q => !q.work).length >= CFG.deployCap;
    $('bodyList').innerHTML = S.bodies.map((b, i) => bodyRow(b, 'data-b="' + i + '"', (full || capFull || S.pts < b.cost + minW) ? 'dis' : '')).join('');
    const qn = id => S.queue.filter(q => q.work === id).length;
    $('bWorks').innerHTML = '<div class="dim" style="margin:6px 0">工事を選んでから、下のボタンで頼む。建造ラインの時間を使うが、出撃数には数えない</div>' +
      '<div class="basest">🏠拠点HP <b>' + Math.ceil(S.baseHP) + '/' + CFG.baseHP + '</b> ・ 砲台 <b>' + (S.works.turret || 0) + '/' + WORKS.turret.max + '</b> ・ 盾 <b>' + (S.homeShield > 0 ? Math.ceil(S.homeShield) : 'なし') + '</b></div>' +
      '<div class="wgrid">' + Object.entries(WORKS).filter(([id]) => S.allow[id]).map(([id, w]) => {
        const err = workCheck(S, id), n = qn(id);
        return '<button class="wcard' + (uiWork === id ? ' on' : '') + (err && err !== 'ポイントが足りません' ? ' dis' : '') + '" data-work="' + id + '"><div class="wn"><span class="chk">' + (uiWork === id ? '✓' : '') + '</span><b>' + w.icon + ' ' + esc(w.name) + '</b></div><div class="ws"><span class="cost">⭐' + workCost(S, id) + '</span><span>⏱' + w.build + 's</span>' + (n ? '<span class="rsv">予約中' + (n > 1 ? '×' + n : '') + '</span>' : '') + '</div><div class="wd">' + esc(w.desc) + '</div></button>';
      }).join('') + '</div>';
    const ob = $('bOrder'); ob.style.display = uiTab === 'works' ? '' : 'none';
    if (uiWork) {
      const w = WORKS[uiWork], err = workCheck(S, uiWork), n = qn(uiWork);
      ob.innerHTML = w.icon + ' ' + (n ? 'もう1回頼む' : esc(w.name) + 'を頼む') + ' <small>⭐' + workCost(S, uiWork) + '・' + w.build + '秒</small>';
      ob.disabled = !!err || ob.dataset.lock === '1';
      $('bWorkSum').innerHTML = uiTab === 'works' ? (err ? '<div class="err">' + esc(err) + '</div>' : n ? '<div class="dim">' + esc(w.name) + 'は予約中' + (n > 1 ? '（' + n + '件）' : '') + '。建造ラインが空くと始まる</div>' : '') : '';
    } else { ob.textContent = '工事を選んでください'; ob.disabled = true; $('bWorkSum').innerHTML = ''; }
    return;
  }
  $('bChosen').innerHTML = bodyRow(uiBody, '', 'on').replace(/^<button/, '<div').replace(/<\/button>$/, '</div>');
  const ops = S.outposts.map((o, i) => [o, i]).filter(([o]) => o.owner === 'p');
  if (uiAt >= 0 && !(S.outposts[uiAt] && S.outposts[uiAt].owner === 'p')) uiAt = -1;
  $('bAt').innerHTML = ops.length ? '<div class="sec">出撃地点</div><div class="chips">' + [['拠点', -1]].concat(ops.map(([o, i]) => ['🚩陣地' + o.label, i])).map(([n, i]) => '<button class="chip' + (uiAt === i ? ' on' : '') + '" data-at="' + i + '">' + n + '</button>').join('') + '</div>' : '';
  const wb = uiBody.wbMul || 1;
  $('wList').innerHTML = Object.entries(WEAPONS).filter(([id]) => RD.weaponAllowed(S, id)).sort((a, b) => (!!b[1].special * 2 + !!b[1].evo) - (!!a[1].special * 2 + !!a[1].evo)).map(([id, w]) =>
    '<button class="wcard' + (uiW.has(id) ? ' on' : '') + (w.evo ? ' evo' : '') + (w.special ? ' special' : '') + '" data-w="' + id + '">' +
    '<div class="wn"><span class="chk">' + (uiW.has(id) ? '✓' : '') + '</span><b>' + w.icon + ' ' + esc(w.name) + '</b></div>' +
    '<div class="ws"><span class="cost">⭐' + w.cost + '</span><span>⏱+' + Math.round(w.build * wb * 10) / 10 + 's</span>' + (w.evo ? '<span class="evotag">進化</span>' : '') + (w.special ? '<span class="evotag sp">試作</span>' : '') + '</div>' +
    '<div class="wd">' + esc(w.desc) + '</div></button>').join('');
  const wids = [...uiW], c = buildCost(uiBody, wids), err = buildCheck(S, uiBody, wids);
  $('bSum').innerHTML = '合計 <b style="color:var(--gold)">⭐' + c.cost + '</b> ・ 建造 <b>' + c.time + 's</b> ・ 出撃 ' + S.robots.length + '/' + CFG.deployCap + ' ・ 予約 ' + S.queue.length + '/' + CFG.queueMax +
    (S.queue.length ? '<div class="dim">建造ライン' + S.lines + '本で順番に建造（予約 ' + S.queue.length + '機）</div>' : '') +
    (err ? '<div class="err">' + esc(err) + '</div>' : '');
  $('bGo').disabled = !!err;
}
$('bodyList').addEventListener('click', e => {
  const b = e.target.closest('[data-b]'); if (!b || b.classList.contains('dis')) return;
  uiBody = S.bodies[+b.dataset.b]; uiW = new Set(); renderBuild(); $('buildM').querySelector('.card').scrollTop = 0;
});
$('wList').addEventListener('click', e => { const b = e.target.closest('[data-w]'); if (!b) return; const id = b.dataset.w; uiW.has(id) ? uiW.delete(id) : uiW.add(id); renderBuild(); });
$('bTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; uiTab = b.dataset.tab; renderBuild(); });
$('bWorks').addEventListener('click', e => { const b = e.target.closest('[data-work]'); if (!b) return; uiWork = b.dataset.work; renderBuild(); });
$('bOrder').addEventListener('click', () => {
  if (!uiWork) return;
  const err = orderWork(S, uiWork), ob = $('bOrder');
  toast(err ? err : WORKS[uiWork].icon + ' ' + WORKS[uiWork].name + 'を予約', err ? 'warn' : 'good');
  ob.dataset.lock = '1'; setTimeout(() => { ob.dataset.lock = ''; if (building) renderBuild(); }, 600); // 連打で重ねて頼まないよう少し待つ
  renderBuild();
});
$('bAt').addEventListener('click', e => { const b = e.target.closest('[data-at]'); if (!b) return; uiAt = +b.dataset.at; renderBuild(); });
$('bBack').addEventListener('click', () => { uiBody = null; uiW = new Set(); renderBuild(); });
$('bClose').addEventListener('click', closeBuild);
$('buildM').addEventListener('click', e => { if (e.target === $('buildM')) closeBuild(); });
$('bGo').addEventListener('click', () => {
  const err = orderBuild(S, uiBody, [...uiW], uiAt);
  if (err) { renderBuild(); return; }
  toast('🔧 建造開始：' + uiBody.name); tutDone('built'); closeBuild(); updInfo();
});
$('buildBtn').addEventListener('click', openBuild);

// ---------- 画面遷移 ----------
function showOv(html, cls) { $('ovCard').innerHTML = html; $('ov').className = 'modal center show' + (cls ? ' ' + cls : ''); $('ovCard').scrollTop = 0; }
function hideOv() { $('ov').classList.remove('show'); }
function setMenu(on) { document.body.classList.toggle('menu', on); if (on) { cam = pCam; scene.fog = FOG_M; } else scene.fog = null; }
const cleared = id => !!(SAVE.clear && SAVE.clear[id]);
const CH = RD.CHAPTERS, ORDER = CH.flatMap(c => c.stages);
const chOf = id => CH.find(c => c.stages.includes(id)) || CH[0];
const nextStage = () => ORDER.find(id => !cleared(id)) || null;
const stById = id => STAGES.find(s => s.id === id);
const seen = k => !!(SAVE.seen && SAVE.seen[k]);
function markSeen(k) { SAVE.seen = SAVE.seen || {}; SAVE.seen[k] = 1; saveNow(); }
let uiCh = null, curHard = false;
const allClear = () => ORDER.every(cleared);
const clearedH = id => !!(SAVE.clearH && SAVE.clearH[id]);
// 段階的な解禁：その作戦で使えるもの・その作戦で初めて出るもの
const allowOf = id => RD.allowFor(id, cleared, !!SAVE.allOpen);
const FIRST_ENEMY = (() => { const m = {}, seenT = new Set(); for (const id of ORDER) { const st = stById(id); for (const t of st.waves.map(w => w[1]).concat(st.garrison && (st.outposts || []).some(o => o[3] === 'e') ? st.garrison : [])) if (!seenT.has(t)) { seenT.add(t); (m[id] = m[id] || []).push(t); } } return m; })();
function newFeatures(id) { return id === ORDER[0] ? [] : Object.keys(RD.FEATURES).filter(f => RD.FEATURES[f] === id); } // 最初の作戦は「最初から使えるもの」なので出さない
function featLine(f) { const w = WEAPONS[f]; return w ? [w.icon, w.name, w.desc] : [RD.FEATURE_INFO[f].icon, RD.FEATURE_INFO[f].name, RD.FEATURE_INFO[f].desc]; }
function newHTML(id) {
  const fs = newFeatures(id), es = FIRST_ENEMY[id] || [];
  if (!fs.length && !es.length) return '';
  return '<div class="sec">NEW <span class="dim">この作戦から</span></div><div class="newl">' +
    fs.map(f => { const [i, n, d] = featLine(f); return '<div class="nw"><span class="nb">解禁</span><b>' + i + ' ' + esc(n) + '</b><span>' + esc(d) + '</span></div>'; }).join('') +
    es.map(t => '<div class="nw en"><span class="nb">新しい敵</span><b>' + esc(ENEMIES[t].name) + '</b><span>' + esc(ENEMIES[t].desc) + '</span></div>').join('') + '</div>';
}
// 管制AI「アイ」の通信。行ごとに少しずつ表示する
function commHTML(lines, big) { return '<div class="comm' + (big ? ' big' : '') + '"><div class="who">📡 管制 アイ</div>' + lines.map((l, i) => '<p style="animation-delay:' + (i * (big ? .55 : .25)) + 's">' + esc(l) + '</p>').join('') + '</div>'; }
function chapterCard(c, kind, next) {
  markSeen(c.id + (kind === 'intro' ? 'i' : 'o'));
  showOv('<div class="chcard"><small>' + esc(c.no) + (kind === 'outro' ? '　完了' : '') + '</small><h1>' + esc(c.title) + '</h1>' + commHTML(kind === 'intro' ? c.intro : c.outro, true) +
    '<button class="primary big" id="chOk">' + (kind === 'intro' ? '了解' : '次へ') + '</button></div>', 'story');
  $('chOk').onclick = next;
}
// 作戦を開く：章の最初に来たときは章の通信から
function openStage(id) {
  const c = chOf(id);
  if (c.intro && !seen(c.id + 'i')) chapterCard(c, 'intro', () => stageDetail(id)); else stageDetail(id);
}
function titleScreen() {
  mode = 'title'; setMenu(true);
  showOv('<div class="hero">' +
    '<div class="logo"><small>FRONTLINE BASE DEFENSE</small><span>ROBOT</span><span>DEFENSE</span></div>' +
    '<p class="tagline">補給の途絶えた前線基地。<br>残った機材でロボットを組み、侵略者を食い止めろ。</p>' +
    (() => { const nx = nextStage(), any = ORDER.some(cleared), st = nx && stById(nx);
      return '<button class="primary big" id="goBtn">' + (st ? (any ? '▶ 続きから' : '▶ はじめる') + '<small>' + esc(st.name + '「' + st.sub + '」') + '</small>' : '▶ 作戦を選ぶ') + '</button>' +
        (any ? '<button class="ghost" id="selBtn">作戦一覧</button>' : ''); })() +
    '<button class="ghost" id="howBtn">遊び方</button>' +
    (ORDER.every(id => SAVE.clear && SAVE.clear[id]) ? '<div class="ver" style="color:var(--gold)">🏆 全作戦クリア　🔥高難度 ' + ORDER.filter(id => SAVE.clearH && SAVE.clearH[id]).length + '/' + ORDER.length + '</div>' : '') +
    '<div class="ver">試作版</div></div>', 'hero');
  const nx = nextStage(); $('goBtn').onclick = () => nx ? openStage(nx) : stageSelect(); if ($('selBtn')) $('selBtn').onclick = stageSelect; $('howBtn').onclick = () => howTo(titleScreen);
}
// 遊び方：1項目1行。細かいことはプレイ中の案内で出す
const HOW = [
  ['🔧', '作る', 'ボディ1つ＋武器を選ぶ。選んでいる間は時間が止まる'],
  ['👆', '動かす', 'ロボットをタップ → 地面をタップ。選んでいる間は時間が1/4'],
  ['🎯', '戦う', '射程内の敵を自動で撃つ。倒すと⭐が入る'],
  ['💥', '誤射に注意', '味方の弾や爆風は、味方のロボットにも当たる'],
  ['🏭', '攻める', '敵拠点を壊すと⭐が多く入り、その方面の敵が減る'],
  ['🎮', '乗る', '自分で操縦。連射・威力・射程が上がるが、前しか見えず動けない'],
  ['🏗', '拠点工事', '⭐で拠点の修理・砲台・盾を頼める'],
  ['🚩', '陣地', '青い陣地は出撃地点に選べる。敵だけが近くにいると奪われる'],
];
function howTo(back) {
  showOv('<h1>遊び方</h1><div class="how">' + HOW.map(([i, t, d]) => '<div class="hw"><span class="hi">' + i + '</span><b>' + t + '</b><span>' + d + '</span></div>').join('') +
    '</div><p class="dim">地図はスワイプで移動、ピンチで拡大。⤢で全体表示。</p><div class="btns"><button class="primary" id="howOk">わかった</button></div>');
  $('howOk').onclick = back;
}
function stageEnemies(st) { return [...new Set(st.waves.map(w => w[1]))].map(t => ENEMIES[t].name); }
function goalChip(st) { return st.goal === 'points' ? '⭐' + st.goalPts + ' 貯める' : st.goal === 'bases' ? '🏭 ' + (st.ebases || []).length + 'か所 破壊' : st.goal === 'boss' ? '👹 模倣機 撃破' : st.goal === 'clear' ? '👾 全滅させる' : '🛡 ' + fmtT(st.time) + ' 守る'; }
function stageNo(st) { return st.name.replace('序章-', ''); }
function stageSelect() {
  mode = 'select'; setMenu(true);
  const nx = nextStage();
  if (!uiCh) uiCh = chOf(nx || ORDER[0]).id;
  const c = CH.find(x => x.id === uiCh) || CH[0];
  let html = '<h1>作戦を選ぶ</h1><div class="tabs chtabs">' + CH.map(x => '<button data-ch="' + x.id + '" class="' + (x.id === c.id ? 'on' : '') + (x.soon ? ' soon' : '') + '">' + esc(x.no) + (x.stages.length && x.stages.every(cleared) ? '<small> ✓</small>' : x.soon ? '<small> 🔒</small>' : '') + '</button>').join('') + '</div>';
  if (c.soon) html += '<div class="soonbox"><small>' + esc(c.no) + '</small><b>' + esc(c.title) + '</b><p>準備中</p></div>';
  else {
    html += '<div class="chh"><div><small>' + esc(c.no) + '</small><b>' + esc(c.title) + '</b></div><button class="chip" id="story">📡 通信</button></div><div class="slist">';
    for (const id of c.stages) {
      const st = stById(id), rw = [];
      html += '<button class="scard' + (cleared(id) ? ' clear' : '') + (id === nx ? ' next' : '') + '" data-st="' + id + '">' +
        '<span class="sno">' + stageNo(st) + '</span>' +
        '<span class="sm"><b>' + esc(st.sub) + '</b><span class="sg">' + goalChip(st) + '</span></span>' +
        '<span class="sr">' + (id === nx ? '<i class="nx">▶ 次</i>' : '') + (cleared(id) ? '<i class="ok">✓ クリア</i>' : '') + (clearedH(id) ? '<i class="hd">🔥 高難度</i>' : '') + rw.map(u => '<i class="rw' + (isOpen(u.id) ? ' got' : '') + '">' + (isOpen(u.id) ? '' : '🎁') + WEAPONS[u.id].icon + '</i>').join('') + '</span></button>';
    }
    html += '</div>';
  }
  // 進化パーツの一覧：解禁済みか、どうすれば解禁できるか
  html += '<details class="more"><summary>🧬 進化パーツ（' + UNLOCKS.filter(u => isOpen(u.id)).length + '/' + UNLOCKS.length + '）</summary>' +
    '<div class="dim" style="margin:4px 0 6px">' + esc(stById(RD.FEATURES.evolve).name) + 'から、進化元の武器を使って作戦をクリアすると解禁。持ち込みは' + esc(stById(RD.FEATURES.loadout).name) + 'から</div>' +
    UNLOCKS.map(u => '<div class="reward' + (isOpen(u.id) ? ' got' : '') + '">' + (isOpen(u.id) ? '✅ ' : '🔒 ') + WEAPONS[u.id].icon + esc(WEAPONS[u.id].name) + (isOpen(u.id) ? '' : '：' + esc(u.cond)) + '</div>').join('') + '</details>' +
    '<div class="btns"><button class="ghost" id="toTitle">← タイトル</button><button class="ghost small" id="allOpen">全解禁（試作用）</button></div>';
  showOv(html);
  $('ovCard').querySelectorAll('[data-st]').forEach(b => b.onclick = () => openStage(b.dataset.st));
  $('ovCard').querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { uiCh = b.dataset.ch; stageSelect(); });
  if ($('story')) $('story').onclick = () => chapterCard(c, c.stages.every(cleared) && c.outro ? 'outro' : 'intro', stageSelect);
  $('allOpen').onclick = () => { for (const u of UNLOCKS) SAVE.unlocked[u.id] = true; SAVE.allOpen = true; saveNow(); stageSelect(); };
  $('toTitle').onclick = titleScreen;
}
// 作戦の詳細：説明・出現する敵・報酬・持ち込みを1枚にまとめ、ここから出撃する
function stageDetail(stId) {
  curStage = stId;
  const st = STAGES.find(s => s.id === stId), open = UNLOCKS.map(u => u.id).filter(isOpen), lockedEvo = open.length && !allowOf(stId).loadout;
  SAVE.loadout = (SAVE.loadout || []).filter(id => open.includes(id)).slice(0, CFG.loadoutSlots);
  const A = allowOf(st.id), rw = A.evolve ? UNLOCKS.filter(u => !isOpen(u.id) && RD.FEATURES[u.base] && A[u.base]).filter((u, i, arr) => arr.findIndex(x => x.base === u.base) === i) : [], c = SAVE.clear && SAVE.clear[st.id];
  showOv('<div class="sdh"><span class="sno">' + stageNo(st) + '</span><div><span class="dim">' + esc(chOf(st.id).no + '「' + chOf(st.id).title + '」　' + st.name) + '</span><h1>' + esc(st.sub) + '</h1></div>' + (c ? '<i class="ok">✓ クリア</i>' : '') + '</div>' +
    (st.brief ? commHTML(st.brief) : '') +
    (allClear() ? '<div class="tabs diff"><button data-hard="0" class="' + (curHard ? '' : 'on') + '">通常' + (cleared(st.id) ? '<small> ✓</small>' : '') + '</button><button data-hard="1" class="' + (curHard ? 'on hard' : '') + '">🔥 高難度' + (clearedH(st.id) ? '<small> ✓</small>' : '') + '</button></div>' +
      (curHard ? '<div class="dim" style="margin:-2px 0 4px">敵の数 ×' + RD.HARD.count + '・硬さ ×' + RD.HARD.hp + '・攻撃 ×' + RD.HARD.dmg + '。開始ポイント ×' + RD.HARD.start + '・倒したときのポイント ×' + RD.HARD.pts + '。目標ポイント ×' + RD.HARD.goal + '</div>' : '') : '') +
    '<div class="goalbox">🎯 ' + esc(goalText(curHard && allClear() ? RD.hardStage(st) : st)) + '</div>' +
    '<p>' + esc(st.intro) + '</p>' + newHTML(st.id) +
    '<div class="facts"><span>🛣 経路 <b>' + st.paths.length + '</b></span><span>🏭 敵拠点 <b>' + (st.ebases || []).length + '</b></span>' + ((st.outposts || []).length ? '<span>🚩 陣地 <b>' + st.outposts.length + '</b></span>' : '') + '<span>⭐ 開始 <b>' + st.startPoints + '</b></span></div>' +
    '<div class="sec">出現する敵</div><div class="etags">' + stageEnemies(st).map(n => '<span>' + esc(n) + '</span>').join('') + '</div>' +
    (rw.length ? '<div class="sec">🧬 進化パーツ <span class="dim">使った武器でクリアすると解禁</span></div><div class="evoh">' + rw.map(u => '<span>' + WEAPONS[u.base].icon + esc(WEAPONS[u.base].name) + ' → ' + WEAPONS[u.id].icon + esc(WEAPONS[u.id].name) + '</span>').join('') + '</div>' : '') +
    (open.length && allowOf(st.id).loadout ? '<div class="sec">持ち込む進化パーツ <span class="dim">' + SAVE.loadout.length + '/' + CFG.loadoutSlots + '　建造画面で選べるようになる</span></div><div class="list">' + open.map(id => { const w = WEAPONS[id], on = SAVE.loadout.includes(id); return '<button class="item' + (on ? ' on' : '') + '" data-lo="' + id + '"><div class="l1"><span class="chk">' + (on ? '✓' : '') + '</span><b>' + w.icon + ' ' + esc(w.name) + '</b><span class="sp"></span><span class="cost">⭐' + w.cost + '</span></div><div class="l2"><span>' + esc(w.desc) + '</span></div></button>'; }).join('') + '</div>' : '') +
    (lockedEvo ? '<div class="dim" style="margin-top:8px">🧬 進化パーツの持ち込みは ' + esc(stById(RD.FEATURES.loadout).name) + ' から（コアの解析待ち）</div>' : '') +
    '<div class="btns sticky"><button class="ghost" id="sdBack">← 戻る</button><button class="primary big" id="sdGo">▶ 出撃</button></div>');
  $('ovCard').querySelectorAll('[data-lo]').forEach(b => b.onclick = () => {
    const id = b.dataset.lo, i = SAVE.loadout.indexOf(id);
    if (i >= 0) SAVE.loadout.splice(i, 1); else if (SAVE.loadout.length < CFG.loadoutSlots) SAVE.loadout.push(id); else { SAVE.loadout.shift(); SAVE.loadout.push(id); }
    saveNow(); const y = $('ovCard').scrollTop; stageDetail(stId); $('ovCard').scrollTop = y;
  });
  $('sdBack').onclick = () => { uiCh = chOf(stId).id; stageSelect(); }; $('sdGo').onclick = () => startGame(stId);
  $('ovCard').querySelectorAll('[data-hard]').forEach(b => b.onclick = () => { curHard = b.dataset.hard === '1'; const y = $('ovCard').scrollTop; stageDetail(stId); $('ovCard').scrollTop = y; });
}
function startGame(stId) {
  if (stId) curStage = stId;
  exitPilot();
  clearViews(); for (const f of fxs) scene.remove(f.m); fxs.length = 0;
  S = newState(curStage, { hard: curHard && allClear(), allow: allowOf(curStage), loadout: (SAVE.loadout || []).filter(isOpen) }); window.RD_S = S; runSeenE = new Set();
  setMapDims(S.st); buildMap(S.st, S.paths);
  ZOOM_START = (S.st.view && S.st.view.zoom) || 1; ZOOM_MAX = Math.max(3, ZOOM_START * 1.6);
  mode = 'play'; paused = false; sel = null; uiBody = null; setMenu(false); cam = oCam;
  for (const el of rosterEls.values()) el.remove(); rosterEls.clear(); setRoster(false); hudCache.infoKey = null;
  hideOv(); updInfo(); fit(); resetView();
  AU.init(); AU.bgmStart(!!S.st.wide); combo.times = []; combo.n = 0; combo.best = 0; parts.length = 0;
  banner((S.st.hard ? '🔥高難度　' : '') + S.st.name + '「' + S.st.sub + '」', goalText(S.st), 'start', 2.6);
  for (const f of newFeatures(S.st.id)) { const [i, n] = featLine(f); toast('NEW ' + i + n + ' が使えるようになった', 'good'); }
  toast('ボディ ' + S.bodies.length + '種を確保。開始ポイント ' + S.pts + (S.loadout.length ? '。持ち込み：' + S.loadout.map(id => WEAPONS[id].name).join('・') : ''));
}
function endGame() {
  mode = 'over'; closeBuild(); sel = null;
  const newly = checkUnlocks(S, SAVE);
  const win = S.over === 'win', g = S.st.goal, fell = S.baseHP <= 0;
  const wasAll = allClear();
  if (win) { SAVE.clear = SAVE.clear || {}; SAVE.clear[S.st.id] = SAVE.clear[S.st.id] || { t: Math.round(S.t), hp: Math.ceil(S.baseHP) }; if (S.st.hard) { SAVE.clearH = SAVE.clearH || {}; SAVE.clearH[S.st.id] = { t: Math.round(S.t) }; } }
  const allNow = !wasAll && allClear();
  saveNow();
  const head = win ? (g === 'points' ? '資源確保' : g === 'bases' ? '敵拠点制圧' : g === 'boss' ? '模倣機撃破' : g === 'clear' ? '殲滅完了' : '防衛成功') : (fell ? '拠点陥落' : '作戦失敗');
  const msg = win ? (g === 'points' ? fmtT(S.t) + ' でポイント目標を達成した' : g === 'bases' ? fmtT(S.t) + ' で敵拠点をすべて破壊した' : g === 'boss' ? fmtT(S.t) + ' で模倣機を撃破した' : g === 'clear' ? fmtT(S.t) + ' で敵をすべて倒した' : (S.st.holdWhy ? S.st.holdWhy.replace('守る', '守り抜いた') : '時間まで拠点を守り抜いた'))
    : (fell ? fmtT(S.t) + ' 経過時点で拠点が破壊された' : '時間切れ。目標を達成できなかった');
  const oi = ORDER.indexOf(S.st.id), next = win && oi >= 0 ? stById(ORDER[oi + 1]) : null, ch = chOf(S.st.id);
  const chDone = win && ch.outro && ch.stages.every(cleared) && !seen(ch.id + 'o');
  const tile = (icon, v, label) => '<div class="tile"><span>' + icon + '</span><b>' + v + '</b><small>' + label + '</small></div>';
  showOv(
    '<div class="rhead ' + (win ? 'win' : 'lose') + '"><small>' + (S.st.hard ? '🔥 HARD　' : '') + (win ? 'MISSION COMPLETE' : 'MISSION FAILED') + '</small><h1>' + head + '</h1><p>' + esc(S.st.name) + '「' + esc(S.st.sub) + '」　' + msg + '</p></div>' +
    (win && S.st.win ? commHTML([S.st.win]) : '') +
    '<div class="tiles">' + tile('💥', S.kills, '撃破') + tile('🏠', Math.ceil(S.baseHP) + '<small>/' + CFG.baseHP + '</small>', '残り拠点HP') +
    (g === 'points' ? tile('⭐', S.pts + '<small>/' + S.st.goalPts + '</small>', '所持ポイント') : S.ebases.length ? tile('🏭', S.ebKills + '<small>/' + S.ebases.length + '</small>', '敵拠点破壊') : tile('🔥', combo.best >= 8 ? '×' + combo.best : '-', '最大連続撃破')) + '</div>' +
    (next && newFeatures(next.id).length ? '<div class="goal">🔓 次の作戦から使える：' + newFeatures(next.id).map(f => featLine(f).slice(0, 2).join('')).map(esc).join('・') + '</div>' : '') +
    (allNow ? '<div class="goal big">🏆 全作戦クリア<br>☄ <b>試作型ノヴァ</b>（戦場全体を焼く試作兵器）と <b>🔥 高難度</b> が解禁された<br><span class="dim">作戦の画面で高難度を選べる。ノヴァは建造画面の武器に出る</span></div>' : '') +
    (newly.length ? '<div class="goal">🎁 解禁：' + newly.map(id => WEAPONS[id].icon + esc(WEAPONS[id].name)).join('・') + '<br><span class="dim">作戦の画面で持ち込める</span></div>' : '') +
    '<details class="more"><summary>くわしい記録</summary><div class="res">' +
    (combo.best >= 8 ? '<span>最大連続撃破</span><b>×' + combo.best + '</b>' : '') +
    (S.st.waves.some(w => w[1] === 'boss') ? '<span>模倣機（ボス）</span><b>' + (S.bossKilled ? '撃破' : '未撃破') + '</b>' : '') +
    '<span>建造したロボット / 撃破された</span><b>' + S.built + ' / ' + S.lost + '</b>' +
    '<span>自爆</span><b>' + S.bombs + '</b>' +
    '<span>誤射ダメージ / 誤射で撃破</span><b>' + Math.round(S.ffDmg) + ' / ' + S.ffKills + '</b>' +
    '<span>獲得 / 使ったポイント</span><b>' + S.earned + ' / ' + S.spent + '</b>' +
    '<span>拠点に取り付いた敵 / 被ダメージ</span><b>' + S.leaked + ' / ' + Math.round(S.baseDmg) + '</b></div></details>' +
    '<div class="btns col">' + (chDone ? '<button class="primary big" id="nextSt">📡 通信を受信（' + esc(ch.no) + ' 完了）</button>' : next ? '<button class="primary big" id="nextSt">次の作戦へ ▶ ' + esc(next.sub) + '</button>' : '') +
    '<div class="btns"><button class="ghost" id="toSel">作戦選択</button><button class="' + (next || chDone ? 'ghost' : 'primary') + '" id="again">もう一度<small>（ボディ再抽選）</small></button></div></div>');
  $('again').onclick = () => startGame(curStage);
  if (chDone) $('nextSt').onclick = () => chapterCard(ch, 'outro', () => { if (next) openStage(next.id); else { const ci = CH.indexOf(ch); uiCh = (CH[ci + 1] || ch).id; stageSelect(); } });
  else if (next) $('nextSt').onclick = () => openStage(next.id);
  $('toSel').onclick = () => { uiCh = ch.id; stageSelect(); };
}
function togglePause() {
  if (mode !== 'play' || building) return;
  paused = !paused;
  if (paused) pauseMenu(); else hideOv();
}
function pauseMenu() {
  showOv('<h1>一時停止</h1><p class="dim">' + esc(S.st.name) + '「' + esc(S.st.sub) + '」　🎯 ' + esc(goalText(S.st)) + '</p><div class="pmenu">' +
    '<button class="primary big" id="re">▶ 再開</button><button id="howP">遊び方</button><button id="muteP">' + (AU.muted ? '🔇 音：オフ' : '🔊 音：オン') + '</button>' +
    '<button id="rs">やり直す（ボディ再抽選）</button><button id="qs">作戦選択へ戻る</button></div>');
  $('re').onclick = togglePause; $('rs').onclick = () => { paused = false; startGame(); };
  $('qs').onclick = () => { paused = false; exitPilot(); stageSelect(); };
  $('howP').onclick = () => howTo(pauseMenu);
  $('muteP').onclick = () => { AU.init(); AU.setMute(!AU.muted); muteLabel(); pauseMenu(); };
}
$('pauseBtn').addEventListener('click', togglePause);
$('viewBtn').addEventListener('click', toggleView);
const muteLabel = () => { $('muteBtn').textContent = AU.muted ? '🔇' : '🔊'; };
$('muteBtn').addEventListener('click', () => { AU.init(); AU.setMute(!AU.muted); muteLabel(); }); muteLabel();
document.addEventListener('click', e => { if (e.target.closest('button')) { AU.init(); AU.S.ui(); } }, true);
$('spdBtn').addEventListener('click', () => { speed = speed === 1 ? 2 : 1; $('spdBtn').textContent = '×' + speed; });
addEventListener('keydown', e => {
  if (pilot && (e.key === 'ArrowLeft' || e.key === 'a')) turnTo(pYawT + .4); if (pilot && (e.key === 'ArrowRight' || e.key === 'd')) turnTo(pYawT - .4); if (pilot && e.key === 's') turnTo(pYawT + Math.PI);
  if (e.key === 'Escape' && sel && mode === 'play' && !building) { sel = null; updInfo(); return; }
  if (e.key === 'Escape' || e.key === 'p') togglePause(); if (e.key === 'b' && !building) openBuild(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && !paused && !building) togglePause(); });

// ---------- ループ ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (mode === 'play' && !paused && !building) {
    const rate = sel ? .25 : 1; // ロボットを選んでいる間はスロー
    for (let i = 0; i < speed; i++) step(S, dt * rate);
  }
  if (S) {
    for (const f of S.fx) addFx(f); S.fx.length = 0;
    for (const m of S.msgs) toast(m.text, m.kind); S.msgs.length = 0;
    sync(dt); updHud(); updTags(); updEdges(); if (mode === 'play') checkNewEnemies();
    canvas.classList.toggle('slowmo', !!sel && mode === 'play' && !building);
    if (mode === 'play' && S.over) { // 勝敗の告知を見せてから結果画面へ
      exitPilot(); mode = 'ending'; closeBuild(); sel = null; AU.bgmStop();
      const win = S.over === 'win'; if (win) AU.S.win(); else AU.S.lose();
      banner(win ? 'MISSION COMPLETE' : 'MISSION FAILED', win ? '作戦成功' : (S.baseHP <= 0 ? '拠点陥落' : '時間切れ'), win ? 'good' : 'boss', 1.6);
      if (!win) shake(.5, .8);
      setTimeout(endGame, 1500);
    }
  }
  for (const gt of M.gates || []) { gt.rotation.y += dt * 1.5; gt.rotation.x = Math.sin(now / 900) * .3; }
  if (S && M.baseGun) {
    M.baseGun.visible = S.homeGun > 0; M.baseBarrels.forEach((b, i) => b.visible = S.homeGun > i);
    M.baseGun.rotation.y = lerpAngle(M.baseGun.rotation.y, S.homeObj.face || 0, .3);
    M.baseDome.visible = S.homeShield > 0; M.baseDome.material.opacity = .08 + .22 * (S.homeShield / (S.homeShieldMax || 1)) + Math.sin(now / 200) * .03;
  }
  updChev(now);
  if (M.baseGlow) M.baseGlow.material.opacity = .12 + Math.sin(now / 400) * .05 + (S && S.enemies.some(e => e.atBase) ? .12 * (Math.sin(now / 90) > 0 ? 1 : 0) : 0);
  if (mode === 'title' || mode === 'select') { // メニューの背景：戦場をゆっくり回って見せる
    const a = now / 30000, R = Math.max(mapW, mapD) * .45 + 8; pCam.position.set(mapCX + Math.sin(a) * R, R * .38, mapCZ + Math.cos(a) * R); pCam.lookAt(mapCX, 0, mapCZ);
  }
  if (M.baseRing) { M.baseRing.position.y = 1.5 + Math.sin(now / 500) * .08; M.baseRing.visible = !pilot; } // 乗っている間は視界の邪魔になるので消す
  if (markerT > 0) { markerT -= dt; marker.material.opacity = Math.max(0, markerT / .6); marker.scale.setScalar(1 + (.6 - markerT)); if (markerT <= 0) marker.visible = false; }
  updFx(dt); updParts(dt); updCombo(dt); updPilot(dt);
  let sx = 0, sz = 0;
  if (shakeT > 0) { shakeT -= dt; const m = shakeMag * Math.max(0, shakeT) * 2 / (pilot ? 4 : camS.zoom || 1); sx = (Math.random() - .5) * m; sz = (Math.random() - .5) * m; cam.position.x += sx; cam.position.z += sz; if (shakeT <= 0) shakeMag = 0; }
  renderer.render(scene, cam);
  if (sx || sz) { cam.position.x -= sx; cam.position.z -= sz; }
}
// 試走・デバッグ用：ワールド座標→画面座標
window.RD_proj = (x, z, y = 0) => { const p = new T.Vector3(x, y, z).project(cam); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
const BACKDROP = STAGES.find(s => s.wide) || STAGES[0]; setMapDims(BACKDROP);
buildMap(BACKDROP, BACKDROP.paths.map(p => ({ segs: p.slice(1).map((b, i) => { const a = p[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]); return { ax: a[0], az: a[1], bx: b[0], bz: b[1], len, ux: (b[0] - a[0]) / len, uz: (b[1] - a[1]) / len }; }) })));
fit();
titleScreen();
requestAnimationFrame(frame);
})();
