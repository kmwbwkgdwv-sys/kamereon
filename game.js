// ぬりかくれ！ - ペイントかくれんぼ (Three.js + Firebase Realtime Database)
import * as THREE from 'three';
import { firebaseConfig } from './firebase-config.js';
import { MAPS, MAP_LIST, KIT, KIT_R } from './maps.js';
import { drawPattern } from './patterns.js';
import { boxCol, cylCol, ellCol, pushOut, stepBody, isFree } from './physics.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const rad = d => d * Math.PI / 180;
const MAXP = 12;
const ZERO = new Array(11).fill(0);
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const configured = !!firebaseConfig.apiKey && !/^YOUR/.test(firebaseConfig.apiKey);

/* ---------------- 設定 ---------------- */
const settings = { lite: false, sens: 1, bgm: 0.3, se: 0.6, bloom: !isTouch };
try { Object.assign(settings, JSON.parse(localStorage.getItem('nurikakure_set') || '{}')); } catch (e) {}
const saveSet = () => { try { localStorage.setItem('nurikakure_set', JSON.stringify(settings)); } catch (e) {} };

/* ---------------- 通信レイヤー ---------------- */
const logErr = e => console.warn('[net]', e && e.message || e);

function makeMockNet() { // 練習用のローカルDB
  const root = {}; const subs = [];
  const split = p => p.split('/').filter(Boolean);
  const clone = v => v == null ? null : JSON.parse(JSON.stringify(v));
  const get = p => { let o = root; for (const k of split(p)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : o; };
  const setRaw = (p, v) => {
    const ks = split(p); let o = root;
    for (let i = 0; i < ks.length - 1; i++) { if (typeof o[ks[i]] !== 'object' || o[ks[i]] === null) o[ks[i]] = {}; o = o[ks[i]]; }
    if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = clone(v);
  };
  let queued = false;
  const fire = () => {
    queued = false;
    for (const s of subs.slice()) {
      const v = get(s.path);
      if (s.type === 'value') { const js = JSON.stringify(v); if (js !== s.last) { s.last = js; s.cb(clone(v)); } continue; }
      const cur = v && typeof v === 'object' ? v : {}; const prev = s.prev; const next = {};
      for (const k in cur) {
        next[k] = JSON.stringify(cur[k]);
        if (!(k in prev)) { if (s.type === 'child_added') s.cb(k, clone(cur[k])); }
        else if (prev[k] !== next[k] && s.type === 'child_changed') s.cb(k, clone(cur[k]));
      }
      for (const k in prev) if (!(k in cur) && s.type === 'child_removed') s.cb(k, null);
      s.prev = next;
    }
  };
  const kick = () => { if (!queued) { queued = true; Promise.resolve().then(fire); } };
  let n = 0;
  return {
    uid: 'local', now: () => Date.now(),
    set: async (p, v) => { setRaw(p, v); kick(); },
    update: async (p, o) => { for (const k in o) setRaw(p + '/' + k, o[k]); kick(); },
    remove: async p => { setRaw(p, null); kick(); },
    push: async (p, v) => { setRaw(p + '/k' + (n++), v); kick(); },
    get: async p => clone(get(p)),
    claim: async (p, v) => { const c = get(p); if (c === null || c === v) { setRaw(p, v); kick(); return true; } return false; },
    on: (path, type, cb) => { const s = { path, type, cb, last: undefined, prev: {} }; subs.push(s); kick(); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; },
    onDisc: () => {}
  };
}

async function makeFirebaseNet() {
  const B = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const [A, AU, D] = await Promise.all([import(B + 'firebase-app.js'), import(B + 'firebase-auth.js'), import(B + 'firebase-database.js')]);
  const app = A.initializeApp(firebaseConfig);
  const cred = await AU.signInAnonymously(AU.getAuth(app));
  const db = D.getDatabase(app);
  let off = 0; D.onValue(D.ref(db, '.info/serverTimeOffset'), s => { off = s.val() || 0; });
  const r = p => D.ref(db, p);
  return {
    uid: cred.user.uid, now: () => Date.now() + off,
    set: (p, v) => D.set(r(p), v).catch(logErr),
    update: (p, o) => D.update(r(p), o).catch(logErr),
    remove: p => D.remove(r(p)).catch(logErr),
    push: (p, v) => D.set(D.push(r(p)), v).catch(logErr),
    get: async p => (await D.get(r(p))).val(),
    claim: async (p, v) => { try { const res = await D.runTransaction(r(p), cur => (cur === null || cur === v) ? v : undefined); return res.committed; } catch (e) { logErr(e); return false; } },
    on: (p, type, cb) => {
      if (type === 'value') return D.onValue(r(p), s => cb(s.val()), logErr);
      const f = { child_added: D.onChildAdded, child_changed: D.onChildChanged, child_removed: D.onChildRemoved }[type];
      return f(r(p), s => cb(s.key, s.val()), logErr);
    },
    onDisc: p => D.onDisconnect(r(p)).remove().catch(logErr)
  };
}

/* ---------------- 描画の基本 ---------------- */
const cv = $('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: !settings.lite, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fd0f0);
const camera = new THREE.PerspectiveCamera(70, 1, 0.08, 220);
camera.rotation.order = 'YXZ';
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 0.75);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(12, 46, 8); sun.shadow.mapSize.set(settings.lite ? 1024 : 4096, settings.lite ? 1024 : 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
{ const c = sun.shadow.camera; c.left = -30; c.right = 30; c.top = 30; c.bottom = -30; c.near = 1; c.far = 80; }
scene.add(hemi, sun);
let composer = null;
let lastW = 0, lastH = 0;
function resize() {
  lastW = innerWidth; lastH = innerHeight;
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); }
}
function applyGfx() {
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(settings.lite ? Math.min(dpr, 1) * 0.8 : Math.min(dpr, 2.5));
  sun.castShadow = !settings.lite; resize();
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 300)); applyGfx();
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
// スマホで2本指操作中にページごと拡大されてしまうのを防ぐ
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if (e.touches.length > 1 || !(e.target.closest && e.target.closest('.sheet,.card'))) e.preventDefault(); }, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
// ブルーム（光のにじみ）。読み込めなければ通常描画のまま
Promise.all(['EffectComposer', 'RenderPass', 'UnrealBloomPass', 'OutputPass'].map(n => import(`three/addons/postprocessing/${n}.js`))).then(([E, Rp, U, O]) => {
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
  const c = new E.EffectComposer(renderer, rt);
  c.addPass(new Rp.RenderPass(scene, camera)); c.addPass(new U.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.6, 1.0)); c.addPass(new O.OutputPass());
  composer = c; resize();
}).catch(e => console.warn('postfx off', e));
// メタリック質感用の環境光（失敗しても続行）
import('three/addons/environments/RoomEnvironment.js').then(m => {
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new m.RoomEnvironment(), 0.04).texture;
  envReady = true; applyLight();
}).catch(() => {});

/* ---------------- ワールド ---------------- */
// W = いま組み立て中のワールド。ふだんはゲームの世界（mainW）、マップ写真を撮るときだけ別の世界に切り替える
const worldMeshes = [], hardMeshes = [], softMeshes = [], colliders = [];
const newWorld = (sc, cheap) => ({ scene: sc, meshes: [], hard: [], soft: [], cols: [], extras: [], info: MAPS.lobby, lamps: 0, cheap, tex: new Map(), geo: new Map() });
const mainW = Object.assign(newWorld(scene, false), { meshes: worldMeshes, hard: hardMeshes, soft: softMeshes, cols: colliders });
let W = mainW;
const ACC = ['#e04f4f', '#4f7fe0', '#f0d040', '#4fbf6a', '#b06fd8', '#f08a3c'];
// 床の写真テクスチャは先に読み込んでおく
const TEXIMG = {};
function texImg(n) { if (!TEXIMG[n]) { const im = new Image(); im.src = './tex/' + n + '_c.jpg'; TEXIMG[n] = im; } return TEXIMG[n]; }
['grass', 'concrete', 'asphalt', 'tile', 'road'].forEach(texImg);
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
function mkTex(c, rx, ry) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t; }
function patternTex(kind, c1, c2, rx, ry) { // 同じ模様は使い回す
  const key = kind + '|' + c1 + '|' + JSON.stringify(c2) + '|' + rx + '|' + ry, hit = W.tex.get(key);
  if (hit) return hit;
  let res;
  if (kind.startsWith('img:')) { // 写真テクスチャ（色味を重ねる）。スポイトで吸えるようキャンバスに描く
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = c1; x.fillRect(0, 0, 256, 256);
    const t = mkTex(c, rx, ry), im = texImg(kind.slice(4));
    const paint = () => { x.drawImage(im, 0, 0, 256, 256); x.globalAlpha = c2 || 0.38; x.fillStyle = c1; x.fillRect(0, 0, 256, 256); x.globalAlpha = 1; t.needsUpdate = true; };
    if (im.complete && im.naturalWidth) paint(); else im.addEventListener('load', paint, { once: true });
    res = { t, c };
  } else {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d', { willReadFrequently: true });
    if (kind === 'checker' || kind === 'vstripe' || kind === 'stripe' || kind === 'panel' || kind === 'noise') {
      const r = rng(kind.length * 131 + String(c1).length * 7 + Math.round(rx * 13) + String(c1).charCodeAt(1));
      x.fillStyle = c1; x.fillRect(0, 0, S, S);
      const speck = (n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; x.fillRect(r() * S, r() * S, 2 + r() * 6, 2 + r() * 6); } };
      if (kind === 'checker') { // タイル
        x.fillStyle = c2; x.fillRect(0, 0, 64, 64); x.fillRect(64, 64, 64, 64); speck(70, 0.03);
        x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 2; for (const p of [[0, 0], [64, 0], [0, 64], [64, 64]]) x.strokeRect(p[0], p[1], 64, 64);
      } else if (kind === 'vstripe') { // 板張り
        for (let i = 0; i < 4; i++) {
          x.fillStyle = i % 2 ? c2 : c1; x.fillRect(i * 32, 0, 32, S);
          for (let k = 0; k < 9; k++) { x.fillStyle = `rgba(0,0,0,${(0.03 + r() * 0.05).toFixed(3)})`; x.fillRect(i * 32 + r() * 30, 0, 1, S); }
          x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(i * 32, 0, 1, S); x.fillRect(i * 32, Math.floor(r() * S), 32, 1);
        }
      } else if (kind === 'stripe') { x.fillStyle = c2; x.fillRect(0, 0, S, 64); }
      else if (kind === 'panel') { // 壁パネル
        speck(50, 0.025); x.strokeStyle = 'rgba(0,0,0,0.32)'; x.lineWidth = 3; x.strokeRect(0, 0, S, S);
        x.strokeStyle = 'rgba(255,255,255,0.14)'; x.lineWidth = 1; x.strokeRect(3.5, 3.5, S - 7, S - 7);
      } else speck(280, 0.035); // ざらつき
    } else drawPattern(x, S, kind, c1, c2, rng(hashStr(key))); // 水玉・しま・迷彩など（patterns.js）
    res = { t: mkTex(c, rx, ry), c };
  }
  W.tex.set(key, res);
  return res;
}
function makeMat(color, opt, rough) {
  const m = new THREE.MeshStandardMaterial({ color: opt.pat ? 0xffffff : color, roughness: opt.rough == null ? rough : opt.rough, metalness: 0 });
  if (opt.glow) { m.emissive.set(color); m.emissiveIntensity = opt.glow === true ? 1.6 : opt.glow; }
  return m;
}
function place(m, opt) { // 世界に置く。模様つきはスポイト用にキャンバスを覚えておく
  if (opt.pat) { const p = patternTex(opt.pat[0], opt.pat[1], opt.pat[2], opt.pat[3], opt.pat[4]); m.material.map = p.t; m.userData.pc = p.c; }
  W.scene.add(m); W.meshes.push(m);
  if (opt.soft) { m.userData.soft = true; W.soft.push(m); } else W.hard.push(m);
}
function geoCache(key, make) { let g = W.geo.get(key); if (!g) { g = make(); W.geo.set(key, g); } return g; }
function addBox(x, y, z, w, h, d, color, opt = {}) {
  const rr = (opt.flat || opt.sharp) ? 0 : Math.min(opt.r == null ? 0.16 : opt.r, Math.min(w, h, d) * 0.35); // 角を丸める
  const round = rr > 0.012 && !W.cheap;
  const m = new THREE.Mesh(geoCache(`b${w},${h},${d},${round ? rr : 0}`, () => round ? new RoundedBoxGeometry(w, h, d, 3, rr) : new THREE.BoxGeometry(w, h, d)), makeMat(color, opt, 0.88));
  m.position.set(x, y + h / 2, z); m.castShadow = !opt.flat; m.receiveShadow = true; place(m, opt);
  if (!opt.nocol) W.cols.push(boxCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y, y + h, { rr: rr > 0.03 ? rr : 0, nc: opt.noclimb }));
}
function addCyl(x, y, z, r, h, color, opt = {}) {
  const rt = opt.rt == null ? r : opt.rt, seg = W.cheap ? Math.min(opt.seg || 24, 12) : (opt.seg || 24);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, r, h, seg), makeMat(color, opt, 0.85));
  m.position.set(x, y + h / 2, z); m.castShadow = !opt.flat; m.receiveShadow = true; place(m, opt);
  if (!opt.nocol) { const k = seg >= 8 ? 1 : 0.92; W.cols.push(cylCol(x, z, y, y + h, r * k, rt * k, { nc: opt.noclimb })); }
}
function addBall(x, y, z, r, color, opt = {}) {
  const m = new THREE.Mesh(geoCache(`s${r}`, () => new THREE.SphereGeometry(r, W.cheap ? 12 : 22, W.cheap ? 8 : 16)), makeMat(color, opt, 0.95));
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = !opt.glow;
  if (opt.soft) m.userData.sph = [x, y, z, r]; // 葉っぱ：中にいると自分からは透けて見える
  place(m, opt);
  if (opt.glow) { // 光るランタン
    m.material.emissiveIntensity = 2.6 * opt.glow;
    if (!opt.nolight && !settings.lite && !W.cheap && W.lamps < 10) { W.lamps++; const k = W.info.dark || 1, L = new THREE.PointLight(0xffc27a, 14 + 60 * (1 - k), 16, 2); L.position.set(x, y, z); W.scene.add(L); W.extras.push(L); }
  }
  if (opt.col) W.cols.push(ellCol(x, y, z, r, r, r));
}
function addCone(x, y, z, r, h, color, opt = {}) {
  const seg = opt.seg || 22, rt = opt.rt || 0;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, r, h, W.cheap ? Math.min(seg, 12) : seg), makeMat(color, opt, 0.9));
  m.material.flatShading = seg <= 9;
  m.position.set(x, y + h / 2, z); if (seg === 4) m.rotation.y = Math.PI / 4; m.castShadow = m.receiveShadow = true; place(m, opt);
  if (opt.nocol) return;
  if (seg === 4) W.cols.push(cylCol(x, z, y, y + h, r * 0.707, rt * 0.707, { sq: true })); // 四角すい
  else { const k = seg <= 6 ? 0.88 : seg <= 9 ? 0.95 : 1; W.cols.push(cylCol(x, z, y, y + h, r * k, rt * k, { walk: h / Math.max(0.01, r - rt) < 0.75 })); }
}
function addDome(x, y, z, rx, ry, rz, color, opt = {}) { // だ円の山。opt.solid=物（クッションなど）, half=上半分だけ（きのこのかさ）
  const g = opt.half ? new THREE.SphereGeometry(1, W.cheap ? 14 : 28, W.cheap ? 6 : 12, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(1, W.cheap ? 14 : 24, W.cheap ? 10 : 16);
  const m = new THREE.Mesh(g, makeMat(color, opt, 0.95)); if (opt.half) m.material.side = THREE.DoubleSide;
  m.scale.set(rx, ry, rz); m.position.set(x, y, z); if (opt.rot) m.rotation.y = -opt.rot; m.castShadow = !opt.sky; m.receiveShadow = !opt.sky;
  if (opt.sky) { m.material.fog = false; W.scene.add(m); W.extras.push(m); return; } // 空の雲はスポイト・当たり判定の対象外
  place(m, opt);
  if (!opt.nocol) W.cols.push(ellCol(x, y, z, rx, ry, rz, { terrain: !opt.solid, half: !!opt.half }));
}
function addCap(x, y, z, r, len, color, opt = {}) { // 頭の丸い柱
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, W.cheap ? 4 : 8, W.cheap ? 12 : 22), makeMat(color, opt, 0.8));
  m.position.set(x, y + len / 2, z); m.castShadow = m.receiveShadow = true; place(m, opt);
  if (!opt.nocol) { W.cols.push(cylCol(x, z, y, y + len, r, r)); W.cols.push(ellCol(x, y + len, z, r, r, r, { half: true })); }
}
function addArch(x, z, R, t, rot, pat) { // アーチ（当たり判定は弧にそって並べた球）
  const m = new THREE.Mesh(new THREE.TorusGeometry(R, t, W.cheap ? 8 : 14, W.cheap ? 16 : 36, Math.PI), makeMat('#ffffff', { pat }, 0.6));
  m.position.set(x, 0, z); m.rotation.y = rot; m.castShadow = m.receiveShadow = true; place(m, { pat });
  const c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI, lx = Math.cos(a) * R; W.cols.push(ellCol(x + lx * c, Math.sin(a) * R, z - lx * s, t, t, t)); }
}
function addTire(x, y, z, r) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, r * 0.3, 10, 22), new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8 }));
  m.rotation.x = Math.PI / 2; m.position.set(x, y + r * 0.3, z); m.castShadow = m.receiveShadow = true; place(m, {});
}
function addWheel(x, y, z, r, w, axis) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8 }));
  if (axis === 'x') m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z); m.castShadow = true; place(m, {});
}
let curMap = '', MAPINFO = MAPS.lobby, spots = [], envReady = false;
function applyLight() {
  const k = MAPINFO.dark || 1;
  hemi.intensity = (envReady ? 0.35 : 0.75) * k; sun.intensity = (envReady ? 0.8 : 1.0) * k; scene.environmentIntensity = k;
  sun.color.set(MAPINFO.night ? 0x9db4ff : 0xffffff); renderer.toneMappingExposure = MAPINFO.night ? 1.25 : 1.08;
}
function disposeWorld(w) {
  for (const m of w.meshes) { w.scene.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
  for (const o of w.extras) { w.scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
  w.meshes.length = 0; w.hard.length = 0; w.soft.length = 0; w.cols.length = 0; w.extras.length = 0; w.lamps = 0; w.tex.clear(); w.geo.clear();
}
function buildWorld(name) { // マップを W に組み立てる
  const M = MAPS[name], hx = M.hx, hz = M.hz; W.info = M;
  const h = {
    B: addBox, cyl: addCyl, ball: addBall, cone: addCone, dome: addDome, cap: addCap, arch: addArch, tire: addTire, wheel: addWheel, rnd: rng(name.length * 977 + name.charCodeAt(0) * 31),
    F: (x, z, w, d, color, pat, lift) => addBox(x, lift ? 0 : -0.2, z, w, lift ? 0.02 : 0.2, d, color, { nocol: true, flat: true,
      pat: pat || (M.floorTex && !lift ? ['img:' + M.floorTex, color, 0.38, w / 5, d / 5] : ['noise', color, 0, w / 4, d / 4]), rough: pat && (pat[0] === 'checker' || pat[0] === 'img:tile') ? 0.28 : (pat ? 0.5 : 0.9) }),
    outer: (ht, color) => { // 抜けられない厚い外壁（登れない）
      const px = { noclimb: true, pat: ['panel', color, 0, (2 * hx + 6) / 3, ht / 3] }, pz = { noclimb: true, pat: ['panel', color, 0, 2 * hz / 3, ht / 3] };
      addBox(0, 0, -hz - 1.5, 2 * hx + 6, ht, 3, color, px); addBox(0, 0, hz + 1.5, 2 * hx + 6, ht, 3, color, px);
      addBox(-hx - 1.5, 0, 0, 3, ht, 2 * hz, color, pz); addBox(hx + 1.5, 0, 0, 3, ht, 2 * hz, color, pz);
    }
  };
  M.build(h);
  if (M.kit) { // 隠れ場所になる小物をたくさん並べる（全員同じ配置になるよう乱数は固定）
    const n = M.clutter || 90; let made = 0, guard = 0;
    while (made < n && guard++ < n * 14) {
      const x = (h.rnd() * 2 - 1) * (hx - 1.8), z = (h.rnd() * 2 - 1) * (hz - 1.8), k = M.kit[Math.floor(h.rnd() * M.kit.length)];
      if (Math.hypot(x - M.spawn[0], z - M.spawn[1]) < 4.5 || !isFree(x, z, KIT_R[k] || 1.35, W.cols)) continue;
      KIT[k](h, x, z, M.pal || ['#b9b9b9'], M.acc || ACC); made++;
    }
  }
  if (W.scene.background && W.scene.background.isColor) W.scene.background.set(M.sky); else W.scene.background = new THREE.Color(M.sky);
  W.scene.fog = new THREE.Fog(M.sky, 60, 170);
  if (M.night) { // 星空
    const n = 700, a = new Float32Array(n * 3), r = rng(99);
    for (let i = 0; i < n; i++) { const th = r() * 6.283, ph = Math.acos(r() * 0.95), R = 140; a[i * 3] = Math.sin(ph) * Math.cos(th) * R; a[i * 3 + 1] = Math.cos(ph) * R; a[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * R; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, fog: false })); W.scene.add(st); W.extras.push(st);
  }
}
function loadMap(name) {
  if (!MAPS[name]) name = 'house';
  if (name === curMap) return false;
  curMap = name; MAPINFO = MAPS[name];
  W = mainW; disposeWorld(mainW); clearSplats();
  buildWorld(name); applyLight();
  const M = MAPINFO, hx = M.hx, hz = M.hz;
  const c = sun.shadow.camera, e = Math.max(hx, hz) + 8; c.left = -e; c.right = e; c.top = e; c.bottom = -e; c.far = 120; c.updateProjectionMatrix();
  sun.position.set(hx * 0.35, 46, hz * 0.3);
  spots = [];
  for (let x = -hx + 2; x <= hx - 2; x += 2.5) for (let z = -hz + 2; z <= hz - 2; z += 2.5) if (isFree(x, z, 0.8, colliders)) spots.push([x, z]);
  return true;
}
function spawnAt(kind) { // 'hider' は鬼の出発点から離れた場所に、席番号ごとに別々の場所へ
  const hs = MAPINFO.spawn; let best = null, bd = 1e9;
  for (const s of spots) { const d = (s[0] - hs[0]) ** 2 + (s[1] - hs[1]) ** 2; if (d < bd) { bd = d; best = s; } }
  best = best || hs; me.vy = 0; me.cling = null; me.kx = me.kz = 0;
  const n = Number(me.slot) || 0;
  if (kind !== 'hider') { me.pos.set(best[0] + (n % 3 - 1) * 0.8, 0, best[1] + (Math.floor(n / 3) % 3 - 1) * 0.8); return; }
  const far = spots.filter(s => (s[0] - best[0]) ** 2 + (s[1] - best[1]) ** 2 > 144), l = (far.length >= 12 ? far : spots).slice();
  const r = rng((meta.round || 1) * 7919 + curMap.length);
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = l[i]; l[i] = l[j]; l[j] = t; }
  const s = l[n % l.length] || best; me.pos.set(s[0], 0, s[1]);
}

/* ---------------- 写真（マップ・ポーズのサムネイル） ---------------- */
// 画面に描く直前に、画面の左下に小さく描いてすぐ写し取る（そのあと本番の描画で上書きされるので見えない）
const snapCv = document.createElement('canvas'), snapCtx = snapCv.getContext('2d'), _sz = new THREE.Vector2();
function snap(sc, cam, w, h, type) {
  const pr = renderer.getPixelRatio(), el = renderer.domElement;
  cam.aspect = w / h; cam.updateProjectionMatrix();
  renderer.setScissorTest(true); renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h);
  renderer.render(sc, cam);
  snapCv.width = w; snapCv.height = h;
  snapCtx.drawImage(el, 0, el.height - Math.round(h * pr), Math.round(w * pr), Math.round(h * pr), 0, 0, w, h);
  renderer.setScissorTest(false); renderer.getSize(_sz); renderer.setViewport(0, 0, _sz.x, _sz.y);
  return snapCv.toDataURL(type || 'image/png', 0.85);
}
const thumbs = {}, thumbQ = [];
function requestThumbs(keys) { for (const k of keys) if (MAPS[k] && !thumbs[k] && !thumbQ.includes(k)) thumbQ.push(k); }
function makeMapThumb(k) {
  const sc = new THREE.Scene(), w = newWorld(sc, true), prev = W;
  W = w; try { buildWorld(k); } finally { W = prev; }
  const M = MAPS[k], kk = Math.max(0.6, M.dark || 1);
  const dl = new THREE.DirectionalLight(M.night ? 0xc0ccff : 0xffffff, 1.3 * kk); dl.position.set(M.hx * 0.4, 40, M.hz * 0.7);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, (envReady ? 0.55 : 0.95) * kk), dl);
  sc.environment = scene.environment; sc.fog = null;
  const e = Math.max(M.hx, M.hz), cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.5, 400);
  cam.position.set(0, e * 1.05, e * 1.3); cam.lookAt(0, 0, e * 0.08);
  const ex = renderer.toneMappingExposure; renderer.toneMappingExposure = M.night ? 1.8 : 1.12;
  try { thumbs[k] = snap(sc, cam, 320, 180, 'image/jpeg'); } finally { renderer.toneMappingExposure = ex; disposeWorld(w); }
}

/* ---------------- アバター ---------------- */
const ATW = 512, ATH = 256, TILE = 128;
function partGeo(geo, col, row) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / 4, ((1 - row) + uv.getY(i)) / 2);
  return geo;
}
// 太さが少しずつ変わる、両はしが丸い棒（腕・脚・胴）。prof = [[0〜1の位置, 半径], ...]（下→上）
function bean(L, prof, seg) {
  const rAt = t => {
    for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]) { const [t0, r0] = prof[i - 1], [t1, r1] = prof[i], k = (t - t0) / (t1 - t0); return r0 + (r1 - r0) * k * k * (3 - 2 * k); }
    return prof[prof.length - 1][1];
  };
  const pts = [], rb = prof[0][1], rt = prof[prof.length - 1][1], V = THREE.Vector2;
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI / 2; pts.push(new V(Math.max(1e-4, Math.cos(a) * rb), -L / 2 + Math.sin(a) * rb)); }
  for (let i = 1; i < 12; i++) { const t = i / 12; pts.push(new V(rAt(t), -L / 2 + t * L)); }
  for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; pts.push(new V(Math.max(1e-4, Math.cos(a) * rt), L / 2 + Math.sin(a) * rt)); }
  return new THREE.LatheGeometry(pts, seg);
}
function rboxGeo(w, h, d, r, col, row) { // 四角キャラ用：角の丸い箱。側面4枚を横一列、上下面を下段に並べたUV
  const g = new RoundedBoxGeometry(w, h, d, 2, r), uv = g.attributes.uv, per = uv.count / 6, strip = [1, 3, -1, -1, 0, 2]; // px,nx,py,ny,pz,nz
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / per), u = uv.getX(i), v = uv.getY(i);
    if (f === 2) uv.setXY(i, u * 0.25, v * 0.25); else if (f === 3) uv.setXY(i, 0.25 + u * 0.25, v * 0.25);
    else uv.setXY(i, (strip[f] + u) / 4, 0.25 + v * 0.75);
  }
  return partGeo(g, col, row);
}
const PARTS = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];
const ARM = [[0, 0.088], [0.18, 0.071], [0.55, 0.08], [1, 0.096]], LEG = [[0, 0.112], [0.15, 0.086], [0.5, 0.096], [1, 0.12]];
const GEOS = {
  round: { // ぽってりした丸いキャラ。関節は球の中心で曲がるので、どんなポーズでもすき間やトゲが出ない
    head: partGeo(new THREE.SphereGeometry(0.26, 32, 24), 0, 0),
    torso: partGeo(bean(0.3, [[0, 0.215], [0.5, 0.2], [1, 0.215]], 32).scale(1, 1, 0.85), 1, 0),
    armL: partGeo(bean(0.4, ARM, 22), 2, 0), armR: partGeo(bean(0.4, ARM, 22), 3, 0),
    legL: partGeo(bean(0.5, LEG, 22), 0, 1), legR: partGeo(bean(0.5, LEG, 22), 1, 1)
  },
  box: {
    head: rboxGeo(0.42, 0.42, 0.42, 0.1, 0, 0), torso: rboxGeo(0.46, 0.62, 0.3, 0.1, 1, 0),
    armL: rboxGeo(0.16, 0.5, 0.16, 0.065, 2, 0), armR: rboxGeo(0.16, 0.5, 0.16, 0.065, 3, 0),
    legL: rboxGeo(0.2, 0.62, 0.2, 0.08, 0, 1), legR: rboxGeo(0.2, 0.62, 0.2, 0.08, 1, 1)
  },
  gun: new THREE.BoxGeometry(0.09, 0.09, 0.55)
};
// パーツの位置（y: パーツの中心, half: めり込み判定の長さ）と関節の位置
const LAY = {
  round: { y: [0.15, 0.77, -0.2, -0.2, -0.25, -0.25], half: [0.26, 0.15, 0.25, 0.25, 0.32, 0.32], ax: 0.255, ay: 0.33, lx: 0.1, ly: -0.02, gun: [0.2, 0.28, -0.34] },
  box: { y: [0.27, 0.8, -0.17, -0.17, -0.29, -0.29], half: [0.29, 0.16, 0.21, 0.21, 0.29, 0.29], ax: 0.31, ay: 0.5, lx: 0.11, ly: -0.02, gun: [0.22, 0.38, -0.35] }
};
const HIDER_BASE = 0.6; // 隠れる側の基準サイズ（鬼=1.0）
const styleOf = p => (p.role === 'hunter' && meta.state !== 'lobby') ? ['round', 1] : [p.shape === 'box' ? 'box' : 'round', HIDER_BASE * ([1, 1.5, 2].includes(p.size) ? p.size : 1)];
const hunterMats = {};
function hunterMat(slot) {
  const k = String(slot || 0);
  if (!hunterMats[k]) hunterMats[k] = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((Number(k) * 0.083 + 0.02) % 1, 0.9, 0.5), roughness: 0.6 });
  return hunterMats[k];
}
const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
const BASE_COLOR = '#b9b9b9';
function makeSkin() {
  const canvas = document.createElement('canvas'); canvas.width = ATW; canvas.height = ATH;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = BASE_COLOR; ctx.fillRect(0, 0, ATW, ATH); ctx.lineCap = 'round';
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, metalness: 0, roughness: 0.9 });
  return { canvas, ctx, tex, mat };
}
function loadSkin(skin, url) {
  if (typeof url !== 'string' || !url.startsWith('data:image/png')) return;
  const img = new Image(); img.onload = () => { skin.ctx.drawImage(img, 0, 0, ATW, ATH); skin.tex.needsUpdate = true; }; img.src = url;
}
const _box = new THREE.Box3(), _wp = new V3();
function makeAvatar(skin) {
  const root = new THREE.Group(), body = new THREE.Group(), hip = new THREE.Group(), waist = new THREE.Group();
  root.add(body); body.add(hip); hip.add(waist);
  const meshes = [];
  const pivot = parent => { const g = new THREE.Group(); parent.add(g); return g; };
  const aL = pivot(waist), aR = pivot(waist), lL = pivot(hip), lR = pivot(hip);
  [waist, waist, aL, aR, lL, lR].forEach((parent, i) => { const m = new THREE.Mesh(GEOS.round[PARTS[i]], skin.mat); m.castShadow = m.receiveShadow = true; parent.add(m); meshes.push(m); });
  const gun = new THREE.Mesh(GEOS.gun, gunMat); gun.visible = false; waist.add(gun);
  // 名前タグ
  const tc = document.createElement('canvas'); tc.width = 256; tc.height = 64;
  const tt = new THREE.CanvasTexture(tc); tt.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tt, transparent: true })); tag.scale.set(1.6, 0.4, 1); tag.position.y = 2.05; root.add(tag);
  const cur = ZERO.slice(); // いま表示している角度（目標のポーズへなめらかに近づける）
  const av = {
    root, meshes, tag, skin, height: 1.7, reach: 0.3, sc: 1, lastPose: ZERO, style: '', moving: false,
    apply() {
      const g = i => rad(cur[i]);
      hip.rotation.set(-g(0), 0, g(1)); waist.rotation.x = -g(2);
      aL.rotation.set(g(3), 0, -g(4)); aR.rotation.set(g(5), 0, g(6));
      lL.rotation.set(g(7), 0, -g(8)); lR.rotation.set(g(9), 0, g(10));
      hip.position.y = 0; root.updateMatrixWorld(true);
      _box.makeEmpty(); for (const m of meshes) _box.expandByObject(m, true);
      const wp = root.getWorldPosition(_wp);
      hip.position.y = (wp.y - _box.min.y) / av.sc; av.height = _box.max.y - _box.min.y; tag.position.y = av.height + 0.35;
      av.reach = Math.max(wp.x - _box.min.x, _box.max.x - wp.x, wp.z - _box.min.z, _box.max.z - wp.z);
      root.updateMatrixWorld(true);
    },
    setPose(p) { p = p || ZERO; av.lastPose = p; for (let i = 0; i < 11; i++) cur[i] = Number(p[i]) || 0; av.moving = false; av.apply(); }, // すぐにそのポーズ
    animTo(p) { av.lastPose = p || ZERO; av.moving = true; }, // なめらかにそのポーズへ
    update(dt) {
      if (!av.moving) return;
      const k = 1 - Math.exp(-dt * 12), p = av.lastPose; let mx = 0;
      for (let i = 0; i < 11; i++) { const d = (Number(p[i]) || 0) - cur[i]; cur[i] += d * k; if (Math.abs(d) > mx) mx = Math.abs(d); }
      if (mx < 0.4) { for (let i = 0; i < 11; i++) cur[i] = Number(p[i]) || 0; av.moving = false; }
      av.apply();
    },
    probes(out) { // 体の各パーツの両端と中央（めり込み判定用）
      let n = 0;
      for (const m of meshes) for (const s of [-1, 0, 1]) { const v = out[n] || (out[n] = new V3()); v.set(0, s * m.userData.half, 0); m.localToWorld(v); n++; }
      return n;
    },
    setTag(text) {
      const x = tc.getContext('2d'); x.clearRect(0, 0, 256, 64); x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 6; x.strokeStyle = '#000'; x.strokeText(text, 128, 32, 250); x.fillStyle = '#fff'; x.fillText(text, 128, 32, 250); tt.needsUpdate = true;
    },
    setHunter(on, slot) { const m = on ? hunterMat(slot) : skin.mat; for (const x of meshes) x.material = m; gun.visible = on; },
    setOwner(o) { for (const x of meshes) x.userData.owner = o; },
    setStyle(shape, sc) { // 丸/四角 と 大きさ
      const key = shape + sc; if (av.style === key) return; av.style = key;
      const G = GEOS[shape] || GEOS.round, L = LAY[shape] || LAY.round;
      meshes.forEach((m, i) => { m.geometry = G[PARTS[i]]; m.position.set(0, L.y[i], 0); m.userData.half = L.half[i]; });
      aL.position.set(-L.ax, L.ay, 0); aR.position.set(L.ax, L.ay, 0); lL.position.set(-L.lx, L.ly, 0); lR.position.set(L.lx, L.ly, 0); gun.position.fromArray(L.gun);
      body.scale.setScalar(sc); av.sc = sc; av.setPose(av.lastPose);
    }
  };
  av.setStyle('round', 1);
  return av;
}
function poseAvatar(skin, p, pose, shape, size) { // 分身・答え合わせ用の止まったアバター
  const av = makeAvatar(skin); av.root.position.set(p[0], p[1], p[2]); av.root.rotation.y = p[3];
  av.lastPose = pose || ZERO; av.setStyle(shape === 'box' ? 'box' : 'round', HIDER_BASE * ([1, 1.5, 2].includes(size) ? size : 1)); av.setPose(pose || ZERO);
  return av;
}

/* ---------------- 状態 ---------------- */
let net = null, fbNet = null, uid = null, myName = '', roomId = '', base = '', inRoom = false, practice = false;
let meta = {}, P = {}, POS = {}, DEC = {}, SKINS = {};
const ents = {}; let decoyAvs = [], ghosts = [], splats = [], unsubs = [];
const mySkin = makeSkin();
const me = { pos: new V3(0, 0, 0), vy: 0, kx: 0, kz: 0, yaw: 0, camYaw: 0, camPitch: -0.25, ground: true, cling: null, used: false, reach: 0.33, dist: 3.2, pose: ZERO.slice(), ammo: 0, slot: '0' };
let lastRound = -1, lastState = '', panel = '', eyedrop = false;
let lobbyOpen = false, myScore = 0, sentScore = 0, lastWh = 0, rankSnap = null, rankAt = 0, poseName = '立つ', clingTips = 0;
me.h = 1.6; me.r = 0.33; me.shape = 'round'; me.size = 1;
try { const o = JSON.parse(localStorage.getItem('nurikakure_body') || '{}'); if (o.shape === 'box') me.shape = 'box'; if ([1, 1.5, 2].includes(o.size)) me.size = o.size; } catch (e) {}
const knownFound = new Set();
const brush = { color: BASE_COLOR, size: 8 };
const myRole = () => (P[uid] && P[uid].role) || 'spectator';
const posArr = () => [+me.pos.x.toFixed(2), +me.pos.y.toFixed(2), +me.pos.z.toFixed(2), +me.yaw.toFixed(2), +me.camPitch.toFixed(2)];
const tp = () => meta.state === 'lobby' || myRole() === 'hider'; // 三人称視点か
const canTool = () => meta.state === 'lobby' || (myRole() === 'hider' && (meta.state === 'hiding' || meta.state === 'hunting'));
const targetMap = () => (!meta.state || meta.state === 'lobby') ? 'lobby' : (meta.cur || 'house');

/* ---------------- サウンド ---------------- */
let ac = null, bgmG = null, seG = null;
function applyVol() { if (!ac) return; bgmG.gain.value = settings.bgm * 0.5; seG.gain.value = settings.se; }
function note(dest, f, t, dur, type, vol) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.value = f;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}
try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) {} // iOS: 他のアプリの音楽を止めずにミックス再生
function audioInit() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    bgmG = ac.createGain(); seG = ac.createGain(); bgmG.connect(ac.destination); seG.connect(ac.destination); applyVol();
    const seq = [0, 7, 12, 7, 3, 10, 15, 10, 5, 12, 17, 12, 3, 10, 14, 10]; let step = 0;
    setInterval(() => {
      if (ac.state !== 'running' || settings.bgm <= 0 || document.hidden) return;
      const t = ac.currentTime + 0.03, s = step % 16;
      note(bgmG, 220 * Math.pow(2, seq[s] / 12), t, 0.2, 'triangle', 0.22);
      if (s % 4 === 0) note(bgmG, 55 * Math.pow(2, seq[s] / 12), t, 0.5, 'sine', 0.35);
      step++;
    }, 240);
  } catch (e) { ac = null; }
}
function sfx(kind, pan = 0, vol = 1) {
  if (!ac || settings.se <= 0) return; const t = ac.currentTime;
  if (kind === 'shot') {
    const len = Math.floor(ac.sampleRate * 0.25), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = ac.createBufferSource(); s.buffer = buf; const g = ac.createGain(); g.gain.value = 0.8; s.connect(g); g.connect(seG); s.start();
    note(seG, 90, t, 0.18, 'square', 0.4);
  } else if (kind === 'found') { note(seG, 880, t, 0.14, 'square', 0.25); note(seG, 660, t + 0.13, 0.14, 'square', 0.25); note(seG, 440, t + 0.26, 0.3, 'square', 0.25); }
  else if (kind === 'pop') note(seG, 520, t, 0.1, 'sine', 0.4);
  else if (kind === 'whistle') {
    const o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(2100, t); o.frequency.linearRampToValueAtTime(2500, t + 0.12);
    lfo.frequency.value = 28; lg.gain.value = 90; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * vol, t + 0.04); g.gain.setValueAtTime(0.5 * vol, t + 0.55); g.gain.linearRampToValueAtTime(0.0001, t + 0.7);
    let out = g; if (ac.createStereoPanner) { const pn = ac.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(pn); out = pn; }
    o.connect(g); out.connect(seG); o.start(t); lfo.start(t); o.stop(t + 0.75); lfo.stop(t + 0.75);
  }
  else if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => note(seG, f, t + i * 0.13, 0.25, 'triangle', 0.35));
}

/* ---------------- UI小物 ---------------- */
let toastT = 0;
function toast(msg, ms = 2200) { const t = $('toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = 0; }, ms); }
const show = (id, on) => $(id).classList.toggle('hide', !on);
function setPanel(p) {
  panel = p; eyedrop = false; $('bDrop').style.background = ''; $('tDrop').classList.remove('on'); if (p) closeWheel();
  show('pPaint', p === 'paint'); show('pPose', p === 'pose');
  $('tPaint').classList.toggle('on', p === 'paint'); $('tPose').classList.toggle('on', p === 'pose');
  if (p && document.pointerLockElement) document.exitPointerLock();
  refreshUI();
}

/* ---------------- ルーム参加・退出 ---------------- */
const META0 = () => ({ host: uid, state: 'lobby', mode: 'fueoni', hunters: 1, hideTime: 60, huntTime: 180, ammo: 8, end: 0, round: 0, map: 'random', cur: 'house', whistle: 60 });
async function joinRoom(id, isPractice, pmap) {
  const st = $('status'); st.textContent = '接続中…';
  try {
    practice = isPractice;
    if (isPractice) net = makeMockNet();
    else {
      if (!configured) throw new Error('firebase-config.js が未設定です。README の手順で Firebase の設定値を入れてください。\n（「ひとりで練習」は設定なしで遊べます）');
      if (!fbNet) fbNet = await makeFirebaseNet();
      net = fbNet;
    }
    uid = net.uid; roomId = id; base = 'rooms/' + id;
    let slot = null;
    for (let i = 0; i < MAXP; i++) { if (await net.claim(`${base}/slots/${i}`, uid)) { slot = String(i); break; } }
    if (slot === null) throw new Error('このルームは満員です（最大12人）');
    me.slot = slot;
    for (const k of ['players', 'pos', 'skins', 'decoys']) net.onDisc(`${base}/${k}/${uid}`);
    net.onDisc(`${base}/slots/${slot}`);
    await net.set(`${base}/players/${uid}`, { name: myName, slot, role: 'spectator', pose: me.pose, mat: matArr(), shape: me.shape, size: me.size });
    const [m, ps] = await Promise.all([net.get(base + '/meta'), net.get(base + '/players')]);
    if (!ps || !ps[uid]) throw new Error('ルームに参加できませんでした。Firebase の匿名認証とルールの公開を確認してください。');
    if (!m || !m.host || Object.keys(ps).length <= 1) {
      await net.set(base + '/meta', META0());
      await net.update(base, { shots: null, decoys: null });
    }
    meta = {}; P = {}; POS = {}; DEC = {}; SKINS = {}; lastRound = -1; lastState = ''; knownFound.clear();
    lobbyOpen = !isPractice; curMap = '';
    inRoom = true;
    unsubs = [
      net.on(base + '/meta', 'value', v => { meta = v || {}; onMeta(); }),
      net.on(base + '/players', 'value', v => { P = v || {}; onPlayers(); }),
      net.on(base + '/pos', 'value', v => { POS = v || {}; }),
      net.on(base + '/decoys', 'value', v => { DEC = v || {}; rebuildDecoys(); }),
      net.on(base + '/skins', 'child_added', onSkin),
      net.on(base + '/skins', 'child_changed', onSkin),
      net.on(base + '/shots', 'child_added', (k, s) => { if (s && s.by !== uid && net.now() - s.t < 5000) doShot(s.o, s.d, s.seed, false, s.by); })
    ];
    uploadSkin();
    show('scrRoom', false); show('hud', true); show('sys', true); show('btnSwap', practice);
    $('lRoom').textContent = practice ? '練習モード' : id; st.textContent = '';
    show('btnMap', practice);
    if (practice) { const map = MAPS[pmap] && pmap !== 'lobby' ? pmap : 'random'; await net.update(base + '/meta', { practice: true, map }); meta.practice = true; meta.host = uid; P = { [uid]: { name: myName, slot, role: 'spectator' } }; Object.assign(meta, META0(), { practice: true, map }); startGame(); }
  } catch (e) {
    console.error(e); st.textContent = '⚠ ' + (e.message || e);
    if (net && base && uid) { try { net.remove(`${base}/players/${uid}`); net.remove(`${base}/slots/${me.slot}`); } catch (_) {} }
    inRoom = false;
  }
}
function leaveRoom(msg) {
  if (!inRoom) return; inRoom = false;
  unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = [];
  const last = Object.keys(P).length <= 1;
  for (const k of ['players', 'pos', 'skins', 'decoys']) net.remove(`${base}/${k}/${uid}`);
  net.remove(`${base}/slots/${me.slot}`);
  if (last) net.remove(base);
  for (const id in ents) { scene.remove(ents[id].av.root); delete ents[id]; }
  clearList(decoyAvs); decoyAvs = []; clearGhosts(); clearSplats();
  if (document.pointerLockElement) document.exitPointerLock();
  panel = '';
  for (const id of ['hud', 'sys', 'tools', 'pPaint', 'pPose', 'blind', 'lobby', 'reveal', 'cross', 'joy', 'bJump', 'bPose', 'bFire', 'rank', 'btnRoom', 'btnMap', 'wheel']) show(id, false);
  me.cling = null; jump.held = false; setClingUI();
  fpGun.visible = false; $('shells').innerHTML = ''; $('shells').dataset.n = '';
  meta = {}; loadMap('park');
  show('scrRoom', true); $('status').textContent = msg || '';
}
const clearList = l => l.forEach(a => scene.remove(a.root));
function clearGhosts() { clearList(ghosts); ghosts = []; }
function clearSplats() { splats.forEach(s => { scene.remove(s); s.material.dispose(); }); splats = []; }

/* ---------------- 同期コールバック ---------------- */
function onSkin(id, url) { SKINS[id] = url; if (id !== uid && ents[id]) loadSkin(ents[id].skin, url); }
function syncEnts() {
  let changed = false;
  for (const id in P) {
    const p = P[id]; let e = ents[id];
    if (!e) {
      const skin = id === uid ? mySkin : makeSkin();
      e = ents[id] = { skin, av: makeAvatar(skin), name: null, pj: '' };
      e.av.setOwner({ type: 'player', uid: id }); e.av.root.visible = false; scene.add(e.av.root);
      if (id !== uid && SKINS[id]) loadSkin(skin, SKINS[id]);
      if (id === uid) e.av.setPose(me.pose);
      const t = POS[id]; if (t && id !== uid) { e.av.root.position.set(t[0], t[1], t[2]); e.av.root.rotation.y = t[3]; }
      changed = true;
    }
    if (e.name !== p.name) { e.name = p.name; e.av.setTag(p.name || '?'); }
    e.av.setHunter(p.role === 'hunter' && meta.state !== 'lobby', p.slot);
    { const sl = styleOf(p); e.av.setStyle(sl[0], sl[1]); }
    if (id !== uid) {
      const pj = JSON.stringify(p.pose || 0);
      if (pj !== e.pj) { const first = !e.pj; e.pj = pj; if (first) e.av.setPose(p.pose); else e.av.animTo(p.pose); } // ポーズはなめらかに変わる
      if (p.mat) { const m = e.skin.mat; m.emissiveIntensity = +p.mat[0] || 0; m.metalness = +p.mat[1] || 0; m.roughness = p.mat[2] == null ? 0.9 : +p.mat[2]; }
    }
  }
  for (const id in ents) if (!P[id]) { scene.remove(ents[id].av.root); delete ents[id]; changed = true; }
  if (changed) rebuildDecoys();
}
function rebuildDecoys() {
  clearList(decoyAvs); decoyAvs = [];
  for (const id in DEC) {
    const e = ents[id], ds = DEC[id]; if (!e || !ds) continue;
    for (const i of [0, 1]) {
      const d = ds[i]; if (!d || !d.p) continue;
      const av = poseAvatar(e.skin, d.p, d.pose, d.shape, d.size);
      av.tag.visible = false; av.setOwner({ type: 'decoy', uid: id, i }); av.owner = id; av.root.visible = false; scene.add(av.root); decoyAvs.push(av);
    }
  }
}
function buildReveal() {
  clearGhosts();
  const list = $('rlist'); list.textContent = '';
  const hs = Object.keys(P).filter(id => P[id].orig === 'hider').sort((a, b) => Number(P[a].slot) - Number(P[b].slot));
  for (const id of hs) {
    const p = P[id], e = ents[id];
    if (p.found && p.last && p.last.p && e) {
      const av = poseAvatar(e.skin, p.last.p, p.last.pose, p.shape, p.size);
      av.setTag('✖ ' + p.name); scene.add(av.root); ghosts.push(av);
    }
    const row = document.createElement('div'), nm = document.createElement('span'), b = document.createElement('button');
    const by = p.found && P[p.found.by] ? `（${P[p.found.by].name}が発見）` : '';
    nm.textContent = (p.found ? '✖ ' : '★ ') + p.name + (p.found ? by : '（生き残り）') + `　👀${p.score || 0}pt`;
    b.textContent = '見に行く'; b.className = 'sec';
    b.onclick = () => { const t = (p.found && p.last && p.last.p) || (id === uid ? posArr() : POS[id]); if (!t) return; me.pos.set(t[0], t[1], t[2] + 2.5); me.vy = 0; me.camYaw = 0; me.camPitch = -0.2; };
    row.append(nm, b); list.append(row);
  }
  if (!hs.length) list.textContent = 'カメレオンはいませんでした';
  $('rTitle').textContent = meta.winner === 'hunter' ? '🔫 鬼（ハンター）の勝ち！' : '🦎 カメレオンの勝ち！';
}
function renderLobby() {
  const list = $('plist'); list.textContent = '';
  const ids = Object.keys(P).sort((a, b) => Number(P[a].slot) - Number(P[b].slot));
  for (const id of ids) { const d = document.createElement('div'); d.textContent = (id === meta.host ? '👑 ' : '') + P[id].name + (id === uid ? '（あなた）' : ''); list.append(d); }
  const host = meta.host === uid;
  const act = document.activeElement;
  const setv = (id, v) => { const el = $(id); if (el !== act && v != null) el.value = v; el.disabled = !host; };
  setv('sMode', meta.mode); setv('sHunters', meta.hunters); setv('sHide', meta.hideTime); setv('sHunt', meta.huntTime); setv('sAmmo', meta.ammo); setv('sWhistle', meta.whistle == null ? 60 : meta.whistle);
  setMapCard($('mapCard'), meta.map || 'random'); $('mapCard').disabled = !host;
  $('btnStart').disabled = !host || ids.length < 2;
  $('btnStart').textContent = host ? (ids.length < 2 ? '2人以上で開始できます' : 'ゲーム開始') : 'ホストの開始を待っています…';
  $('lNote').textContent = `${ids.length} / ${MAXP} 人　` + (meta.mode === 'basic' ? 'ベーシック：隠れる側どうしは互いの位置が見えます' : '増え鬼：隠れる側は他の人の隠れ場所が見えません');
}
function refreshUI() {
  if (!inRoom) return;
  const st = meta.state, role = myRole(), playing = st === 'hiding' || st === 'hunting', tool = canTool();
  if (!tool && panel) { panel = ''; show('pPaint', false); show('pPose', false); }
  show('lobby', st === 'lobby' && lobbyOpen); show('btnRoom', st === 'lobby'); show('reveal', st === 'reveal');
  show('blind', st === 'hiding' && role === 'hunter');
  show('tools', tool); show('tDecoy', playing); show('tDecoyX', playing);
  show('cross', role === 'hunter' && st === 'hunting');
  const walk = !!st && !(st === 'lobby' && lobbyOpen) && !panel;
  show('joy', isTouch && walk); show('bJump', walk); show('bPose', walk && tool); // ジャンプ・ポーズのボタンはPCでも表示
  if (!tool || !walk) closeWheel();
  show('bFire', isTouch && role === 'hunter' && st === 'hunting');
  show('rank', st === 'hunting' && !meta.practice);
  $('btnLobby').classList.toggle('hide', meta.host !== uid);
  if (st === 'lobby') { renderLobby(); if (lobbyOpen && document.pointerLockElement) document.exitPointerLock(); }
}
function checkRound() {
  const p = P[uid];
  if (!p || !meta.round || meta.state === 'lobby' || meta.round === lastRound || p.rd !== meta.round) return;
  lastRound = meta.round; clearSplats(); knownFound.clear(); me.ammo = meta.ammo; me.vy = 0;
  loadMap(targetMap()); myScore = 0; sentScore = 0; lastWh = 0; rankSnap = null; rankAt = 0;
  if (p.role === 'hunter') { spawnAt('hunter'); toast(`【${MAPINFO.name}】あなたは鬼（ハンター）！`, 3000); }
  else { spawnAt('hider'); toast(`【${MAPINFO.name}】あなたはカメレオン！体を塗って隠れよう`, 3500); }
  me.camYaw = Math.random() * 6.28; me.camPitch = -0.25;
}
function onMeta() {
  if (!inRoom) return;
  const st = meta.state;
  if (loadMap(targetMap())) spawnAt('any');
  if (st !== lastState) {
    if (st === 'lobby' && lastState) lobbyOpen = meta.host === uid;
    syncEnts();
    if (st === 'reveal') { buildReveal(); sfx('win'); if (document.pointerLockElement) document.exitPointerLock(); }
    if (lastState === 'reveal') clearGhosts();
    if (st === 'hunting' && lastState === 'hiding') toast(myRole() === 'hunter' ? '探索スタート！' : '鬼が動き出した！', 2500);
    lastState = st;
  }
  checkRound(); refreshUI();
}
function onPlayers() {
  if (!inRoom) return;
  if (!P[uid]) { leaveRoom('接続が切れたため退出しました'); return; }
  const p = P[uid];
  if (p.found && p.role === 'hider') { // 見つかった！
    const role = meta.mode === 'fueoni' ? 'hunter' : 'spectator';
    p.role = role; me.ammo = meta.ammo || 0;
    net.update(`${base}/players/${uid}`, { role, last: { p: posArr(), pose: me.pose.slice() }, ammo: me.ammo, score: Math.round(myScore) });
    sfx('found'); toast(role === 'hunter' ? '見つかった！ここからは鬼の仲間だ' : '見つかった！観戦にまわります', 3500);
  }
  for (const id in P) if (P[id].found && !knownFound.has(id)) { knownFound.add(id); if (id !== uid) { toast(`${P[id].name} が見つかった！`); sfx('found'); } }
  syncEnts(); checkRound();
  if (meta.state === 'reveal') buildReveal();
  refreshUI();
}

/* ---------------- ホスト処理 ---------------- */
function startGame() {
  const ids = Object.keys(P);
  if (!practice && ids.length < 2) { toast('2人以上必要です'); return; }
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const n = practice ? 0 : Math.min(Number(meta.hunters) || 1, ids.length - 1);
  const round = (meta.round || 0) + 1, u = {};
  ids.forEach((id, i) => {
    const role = i < n ? 'hunter' : 'hider';
    Object.assign(u, { [`players/${id}/role`]: role, [`players/${id}/orig`]: role, [`players/${id}/found`]: null, [`players/${id}/last`]: null, [`players/${id}/ammo`]: meta.ammo, [`players/${id}/rd`]: round, [`players/${id}/score`]: null });
  });
  u.decoys = null; u.shots = null;
  u['meta/cur'] = (MAPS[meta.map] && meta.map !== 'lobby') ? meta.map : MAP_LIST[Math.floor(Math.random() * MAP_LIST.length)][0];
  u['meta/hs'] = practice ? net.now() : null;
  u['meta/state'] = practice ? 'hunting' : 'hiding';
  u['meta/end'] = net.now() + (practice ? 864e5 : meta.hideTime * 1000);
  u['meta/round'] = round; u['meta/winner'] = null;
  net.update(base, u);
}
function hostLoop() {
  if (!inRoom || !meta.state) return;
  const ids = Object.keys(P); if (!ids.length) return;
  if (!P[meta.host]) { ids.sort(); if (ids[0] === uid) net.update(base + '/meta', { host: uid }); return; }
  if (meta.host !== uid || meta.practice) return;
  const now = net.now();
  if (meta.state === 'hiding' && now >= meta.end) net.update(base + '/meta', { state: 'hunting', end: now + meta.huntTime * 1000, hs: now });
  else if (meta.state === 'hunting') {
    const all = Object.values(P), hs = all.filter(p => p.orig === 'hider'), alive = hs.filter(p => !p.found).length, hunters = all.filter(p => p.role === 'hunter');
    let w = null;
    if (alive === 0) w = 'hunter';
    else if (!hunters.length || now >= meta.end || hunters.every(h => (h.ammo || 0) <= 0)) w = 'hider';
    if (w) { meta.state = 'reveal'; net.update(base + '/meta', { state: 'reveal', winner: w }); }
  }
}
setInterval(hostLoop, 500);

/* ---------------- ペイント ---------------- */
const matArr = () => [mySkin.mat.emissiveIntensity, mySkin.mat.metalness, mySkin.mat.roughness];
let skinT = 0, matT = 0, poseT = 0;
function uploadSkin() { if (inRoom) net.set(`${base}/skins/${uid}`, mySkin.canvas.toDataURL('image/png')); }
const queueSkin = () => { clearTimeout(skinT); skinT = setTimeout(uploadSkin, 500); };
const queueMat = () => { clearTimeout(matT); matT = setTimeout(() => inRoom && net.set(`${base}/players/${uid}/mat`, matArr()), 300); };
const queuePose = () => { clearTimeout(poseT); poseT = setTimeout(() => inRoom && net.set(`${base}/players/${uid}/pose`, me.pose.slice()), 200); };
let lastPaint = null;
function paintAt(uv, start) {
  const c = mySkin.ctx, px = uv.x * ATW, py = (1 - uv.y) * ATH, r = brush.size * 1.2;
  const tx = Math.min(3, Math.floor(px / TILE)) * TILE, ty = Math.min(1, Math.floor(py / TILE)) * TILE;
  c.save(); c.beginPath(); c.rect(tx, ty, TILE, TILE); c.clip(); c.fillStyle = c.strokeStyle = brush.color;
  const lp = lastPaint;
  if (!start && lp && lp.tx === tx && lp.ty === ty && Math.abs(lp.px - px) < TILE / 2) { c.lineWidth = r * 2; c.lineCap = 'round'; c.beginPath(); c.moveTo(lp.px, lp.py); c.lineTo(px, py); c.stroke(); }
  for (const dx of [-TILE, 0, TILE]) { c.beginPath(); c.arc(px + dx, py, r, 0, 6.3); c.fill(); }
  c.restore(); mySkin.tex.needsUpdate = true; lastPaint = { px, py, tx, ty };
}
function fillSkin(color) { mySkin.ctx.fillStyle = color; mySkin.ctx.fillRect(0, 0, ATW, ATH); mySkin.tex.needsUpdate = true; queueSkin(); }
const swatches = [];
function setBrush(color, remember) {
  brush.color = color; $('bcolor').value = color;
  if (remember && !swatches.includes(color)) {
    swatches.unshift(color); if (swatches.length > 10) swatches.pop();
    const box = $('swatches'); box.textContent = '';
    for (const c of swatches) { const i = document.createElement('i'); i.style.background = c; i.onclick = () => setBrush(c, false); box.append(i); }
  }
}
function pickColor(h) {
  const m = h.object, map = m.material.map;
  const c = m.userData.pc || (map && map.image && map.image.getContext ? map.image : null); // 模様つきの面や塗った体はその場所の色を読む
  if (c && h.uv && map) {
    const u = ((h.uv.x * map.repeat.x) % 1 + 1) % 1, v = ((h.uv.y * map.repeat.y) % 1 + 1) % 1;
    const d = c.getContext('2d').getImageData(Math.min(c.width - 1, Math.floor(u * c.width)), Math.min(c.height - 1, Math.floor((1 - v) * c.height)), 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map(n => n.toString(16).padStart(2, '0')).join('');
  }
  return '#' + m.material.color.getHexString();
}
function setDrop(on) {
  eyedrop = on; $('bDrop').style.background = on ? '#2e8b63' : ''; $('tDrop').classList.toggle('on', on);
  if (on) toast(document.pointerLockElement ? '画面中央の色を取ります：クリック' : '色を取りたい場所をタップ', 2500);
}
function doPick(h) {
  const c = pickColor(h); setBrush(c, true); setDrop(false); sfx('pop');
  $('tDrop').style.borderLeft = '10px solid ' + c; toast('色を取りました → ペイントで塗れます', 1800);
}
function dropAt(e) { // e があればその場所、なければ画面中央
  if (e) { const own = ents[uid] ? ents[uid].av.meshes : []; return castPtr(e, worldMeshes.concat(own)); }
  ndc.set(0, 0); ray.setFromCamera(ndc, camera); ray.near = 0; ray.far = 100; return ray.intersectObjects(worldMeshes, false)[0];
}

/* ---------------- 分身 ---------------- */
function placeDecoy() {
  if (myRole() !== 'hider' || (meta.state !== 'hiding' && meta.state !== 'hunting')) return;
  const ds = DEC[uid] || {}; const i = !ds[0] ? 0 : !ds[1] ? 1 : -1;
  if (i < 0) { toast('分身は2体までです'); return; }
  net.set(`${base}/decoys/${uid}/${i}`, { p: posArr(), pose: me.pose.slice(), shape: me.shape, size: me.size }); sfx('pop'); toast(`分身を設置（${i + 1}/2）`);
}

/* ---------------- 射撃 ---------------- */
const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
const splatGeo = new THREE.CircleGeometry(0.13, 10);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function addSplat(h, color) {
  if (!h.face) return;
  const m = new THREE.Mesh(splatGeo, new THREE.MeshBasicMaterial({ color }));
  const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
  m.position.copy(h.point).addScaledVector(n, 0.012 + Math.random() * 0.006); m.lookAt(m.position.clone().add(n)); m.scale.setScalar(0.6 + Math.random() * 0.9);
  scene.add(m); splats.push(m);
  if (splats.length > (settings.lite ? 60 : 160)) { const o = splats.shift(); scene.remove(o); o.material.dispose(); }
}
function hitTargets() {
  const l = [];
  for (const id in ents) { const p = P[id]; if (id !== uid && p && p.role === 'hider' && !p.found) l.push(...ents[id].av.meshes); }
  for (const d of decoyAvs) l.push(...d.meshes);
  return l;
}
let nextFire = 0;
const fpGun = new THREE.Group(); // 鬼の一人称視点に見える腕とショットガン
{
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.62), gunMat); b.position.set(0.2, -0.2, -0.5);
  const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.6 })); st.position.set(0.2, -0.25, -0.2);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.42, 4, 12), hunterMat(0)); arm.position.set(0.3, -0.37, -0.28); arm.rotation.set(1.2, 0, 0.3);
  fpGun.add(b, st, arm); fpGun.visible = false; camera.add(fpGun); scene.add(camera);
}
function fire() {
  if (!inRoom || myRole() !== 'hunter' || meta.state !== 'hunting') return;
  const now = performance.now(); if (now < nextFire) return;
  if (me.ammo <= 0) { toast('弾切れ！'); return; }
  nextFire = now + 700; me.ammo--; fpGun.position.z = 0.12; fpGun.rotation.x = 0.14; net.set(`${base}/players/${uid}/ammo`, me.ammo);
  const o = camera.getWorldPosition(new V3()).toArray().map(v => +v.toFixed(2)), d = camera.getWorldDirection(new V3()).toArray().map(v => +v.toFixed(3));
  const seed = (Math.random() * 1e9) | 0;
  doShot(o, d, seed, true, uid);
  net.push(base + '/shots', { by: uid, o, d, seed, t: net.now() });
}
function doShot(o, d, seed, mine, by) {
  if (!o || !d) return;
  sfx('shot');
  const r = rng(seed), origin = new V3(o[0], o[1], o[2]), dir = new V3(d[0], d[1], d[2]).normalize();
  const up = Math.abs(dir.y) > 0.99 ? new V3(1, 0, 0) : new V3(0, 1, 0);
  const rx = new V3().crossVectors(dir, up).normalize(), ry = new V3().crossVectors(rx, dir);
  const targets = mine ? hardMeshes.concat(hitTargets()) : hardMeshes; // 葉っぱは弾がすり抜ける
  const color = hunterMat(P[by] && P[by].slot).color; const done = new Set();
  scene.updateMatrixWorld();
  for (let i = 0; i < 8; i++) {
    const a = r() * 6.283, s = i === 0 ? 0 : Math.sqrt(r()) * 0.05;
    const pd = dir.clone().addScaledVector(rx, Math.cos(a) * s).addScaledVector(ry, Math.sin(a) * s).normalize();
    ray.set(origin, pd); ray.near = 0; ray.far = 40;
    const h = ray.intersectObjects(targets, false)[0]; if (!h) continue;
    const ow = h.object.userData.owner;
    if (!ow) { addSplat(h, color); continue; }
    const key = ow.type + ow.uid + (ow.i || 0); if (done.has(key)) continue; done.add(key);
    if (ow.type === 'player') { net.set(`${base}/players/${ow.uid}/found`, { by: uid, t: net.now() }); toast(`${(P[ow.uid] || {}).name || ''} を見つけた！`); }
    else { net.remove(`${base}/decoys/${ow.uid}/${ow.i}`); toast('それは分身だった！'); sfx('pop'); }
  }
}

/* ---------------- 入力 ---------------- */
const keys = {}; const joy = { x: 0, y: 0, id: null };
// ジャンプ：押した瞬間にジャンプ、長押しで壁にくっつく、くっついている時にもう一度押すと離れる
const jump = { held: false, press: false, t: 0 };
function jumpDown() { if (jump.held) return; jump.held = true; jump.press = true; jump.t = performance.now(); }
function jumpUp() { jump.held = false; }
addEventListener('blur', () => { jumpUp(); for (const k in keys) keys[k] = false; });
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  keys[e.code] = true;
  if (!inRoom) return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) jumpDown(); }
  if (canTool()) {
    if (e.code === 'KeyP') setPanel(panel === 'paint' ? '' : 'paint');
    if (e.code === 'KeyO') toggleWheel();
    if (e.code === 'KeyF') placeDecoy();
    if (e.code === 'KeyQ') nextPose();
    if (e.code === 'KeyE') { if (document.pointerLockElement === cv) { const h = dropAt(null); if (h) doPick(h); } else setDrop(!eyedrop); }
  }
  if (e.code === 'Escape') closeWheel();
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') { jumpUp(); if (e.target.tagName === 'BUTTON') e.preventDefault(); } });
function look(dx, dy, k) {
  if (panel === 'paint') k /= paintZoom; // 拡大中は視点もゆっくり動かす
  me.camYaw -= dx * 0.0026 * settings.sens * k; me.camPitch -= dy * 0.0026 * settings.sens * k;
  me.camPitch = Math.max(-1.5, Math.min(1.5, me.camPitch));
}
function castPtr(e, list) { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); ray.near = 0; ray.far = 100; return ray.intersectObjects(list, false)[0]; }
let lookId = null, lx = 0, ly = 0, paintId = null;
// ペイント中の拡大（1〜5倍）。スライダー・ホイール・2本指のピンチで変えられる
let paintZoom = 1, paintY = 0.6, pinchD = 0; const pts = new Map();
function setZoom(z) { paintZoom = Math.max(1, Math.min(5, z)); $('pZoom').value = paintZoom; }
const pinchDist = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
cv.addEventListener('pointerdown', e => {
  audioInit(); if (!inRoom) return;
  if (e.pointerType === 'touch') { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2 && panel === 'paint') { pinchD = pinchDist(); if (paintId !== null) { paintId = null; queueSkin(); } lookId = null; return; } }
  if (eyedrop && canTool()) { const h = dropAt(document.pointerLockElement === cv ? null : e); if (h) { doPick(h); return; } }
  if (document.pointerLockElement === cv) { fire(); return; }
  if (e.pointerType === 'mouse' && !panel && !(meta.state === 'lobby' && lobbyOpen)) { if (cv.requestPointerLock) cv.requestPointerLock(); return; }
  if (panel === 'paint' && ents[uid]) {
    { const h = castPtr(e, ents[uid].av.meshes); if (h && h.uv) { paintId = e.pointerId; paintAt(h.uv, true); try { cv.setPointerCapture(e.pointerId); } catch (_) {} return; } }
  }
  if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (_) {} }
});
cv.addEventListener('pointermove', e => {
  if (pts.has(e.pointerId)) { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinchD && pts.size >= 2) { const d = pinchDist(); if (d > 0) { setZoom(paintZoom * d / pinchD); pinchD = d; } return; } }
  if (document.pointerLockElement === cv) { look(e.movementX || 0, e.movementY || 0, 1); return; }
  if (e.pointerId === paintId) { const h = ents[uid] && castPtr(e, ents[uid].av.meshes); if (h && h.uv) paintAt(h.uv); return; }
  if (e.pointerId === lookId) { look(e.clientX - lx, e.clientY - ly, 2); lx = e.clientX; ly = e.clientY; }
});
const ptrEnd = e => { pts.delete(e.pointerId); if (pts.size < 2) pinchD = 0; if (e.pointerId === paintId) { paintId = null; queueSkin(); } if (e.pointerId === lookId) lookId = null; };
cv.addEventListener('pointerup', ptrEnd); cv.addEventListener('pointercancel', ptrEnd);
cv.addEventListener('wheel', e => { if (panel === 'paint') setZoom(paintZoom - Math.sign(e.deltaY) * 0.3); else me.dist = Math.max(1.2, Math.min(7, me.dist + Math.sign(e.deltaY) * 0.4)); }, { passive: true });
cv.addEventListener('contextmenu', e => e.preventDefault());
{ // スティックとボタン
  const j = $('joy'), k = $('knob');
  const mv = e => { if (e.pointerId !== joy.id) return; const r = j.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const l = Math.hypot(dx, dy), m = 45; if (l > m) { dx *= m / l; dy *= m / l; } joy.x = dx / m; joy.y = -dy / m; k.style.transform = `translate(${dx}px,${dy}px)`; };
  const end = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; k.style.transform = ''; };
  j.addEventListener('pointerdown', e => { audioInit(); joy.id = e.pointerId; try { j.setPointerCapture(e.pointerId); } catch (_) {} mv(e); });
  j.addEventListener('pointermove', mv); j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
  const bj = $('bJump');
  bj.addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); try { bj.setPointerCapture(e.pointerId); } catch (_) {} jumpDown(); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) bj.addEventListener(ev, jumpUp);
  $('bPose').addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); if (performance.now() - wheelAt > 450 || $('wheel').classList.contains('hide')) toggleWheel(); });
  $('bFire').addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); fire(); });
}
function setClingUI() { // くっついている間はジャンプボタンが「はなれる」になる
  const on = !!me.cling, b = $('bJump');
  if (b.dataset.on === String(on)) return; b.dataset.on = on; b.classList.toggle('cling', on);
  b.innerHTML = on ? '<b>はなれる</b><small>もう一度押す</small>' : '<b>ジャンプ</b><small>長押しで<br>壁にくっつく</small>';
}

/* ---------------- 移動・カメラ ---------------- */
const _pr = [];
function unstick() { // 体のパーツが壁や家具にめり込んでいたら外へ押し出す（壁抜け・埋まり隠れ対策）
  const e = ents[uid]; if (!e) return false; let any = false;
  for (let it = 0; it < 4; it++) {
    e.av.root.position.copy(me.pos); e.av.root.rotation.y = me.yaw; e.av.root.updateMatrixWorld(true);
    const n = e.av.probes(_pr); let moved = false;
    for (let i = 0; i < n && !moved; i++) { const r = pushOut(_pr[i], colliders); if (r) { me.pos.x += r[0]; me.pos.z += r[1]; moved = any = true; } }
    if (!moved) break;
  }
  return any;
}
function updateMe(dt) {
  const st = meta.state, role = myRole(), third = tp();
  const frozen = !st || (st === 'lobby' && lobbyOpen) || (st === 'hiding' && role === 'hunter');
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  let iy = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + joy.y;
  if (frozen) ix = iy = 0;
  const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
  const sy = Math.sin(me.camYaw), cy = Math.cos(me.camYaw), sp = role === 'hunter' ? 5.4 : 4.6;
  const mx = (-sy * iy + cy * ix) * sp, mz = (-cy * iy - sy * ix) * sp;
  const e = ents[uid];
  me.h = third && e ? Math.max(0.3, e.av.height) : 1.6; me.r = third && e ? Math.max(0.18, Math.min(0.42, 0.33 * e.av.sc)) : 0.33; me.reach = third && e ? e.av.reach : me.r;
  const ev = stepBody(me, { mx, mz, sp, held: jump.held && !frozen, press: jump.press, heldFor: (performance.now() - jump.t) / 1000, frozen }, dt, colliders);
  jump.press = false;
  if (ev) { setClingUI(); if (ev === 'on' && clingTips < 2) { clingTips++; toast(isTouch ? '壁にくっついた！ スティックで上下左右に動ける／もう一度ジャンプで離れる' : '壁にくっついた！ WASDで上下左右に動ける／もう一度 Space で離れる', 2800); } }
  if (me.cling) me.yaw = third ? Math.atan2(me.cling.nx, me.cling.nz) : me.camYaw; // 壁のほうを向く
  else if (third) { if (l > 0.15) me.yaw = Math.atan2(-mx, -mz); } else me.yaw = me.camYaw;
  if (third && unstick() && me.cling) me.cling.pushed = true;
  const bx = MAPINFO.hx - 0.4, bz = MAPINFO.hz - 0.4; // マップの外（裏世界）には出られない
  me.pos.x = Math.max(-bx, Math.min(bx, me.pos.x)); me.pos.z = Math.max(-bz, Math.min(bz, me.pos.z));
  if (!(me.pos.y > -2) || !(me.pos.y < 30) || me.pos.x !== me.pos.x || me.pos.z !== me.pos.z) { spawnAt('any'); setClingUI(); }
  if (e) { e.av.root.position.copy(me.pos); e.av.root.rotation.y = me.yaw; }
}
const _t = new V3(), _b = new V3();
function fadeLeaves(a, b) { // 自分やカメラが葉っぱの中・うしろにいる時は、その葉っぱを透かす
  for (const m of softMeshes) {
    const s = m.userData.sph; if (!s) continue;
    const r = s[3] + 0.3, abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, L2 = abx * abx + aby * aby + abz * abz;
    let t = L2 > 1e-9 ? ((s[0] - a.x) * abx + (s[1] - a.y) * aby + (s[2] - a.z) * abz) / L2 : 0; t = Math.max(0, Math.min(1, t));
    const dx = a.x + abx * t - s[0], dy = a.y + aby * t - s[1], dz = a.z + abz * t - s[2], on = dx * dx + dy * dy + dz * dz < r * r;
    if (on !== !!m.userData.faded) { m.userData.faded = on; m.material.transparent = on; m.material.opacity = on ? 0.3 : 1; m.material.depthWrite = !on; m.material.needsUpdate = true; }
  }
}
function updateCamera() {
  camera.rotation.set(me.camPitch, me.camYaw, 0);
  const pz = panel === 'paint' && tp(), fov = pz ? 70 / paintZoom : 70;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  if (tp()) {
    _t.set(me.pos.x, me.pos.y + (pz ? me.h * paintY : Math.min(1.0, me.h * 0.7 + 0.2)), me.pos.z); _b.set(0, 0, 1).applyQuaternion(camera.quaternion);
    let d = me.dist; ray.set(_t, _b); ray.near = 0; ray.far = d;
    const h = ray.intersectObjects(hardMeshes, false)[0]; if (h) d = Math.max(0.35, h.distance - 0.15);
    camera.position.copy(_t).addScaledVector(_b, d);
    fadeLeaves(_t, camera.position);
  } else { camera.position.set(me.pos.x, me.pos.y + 1.55, me.pos.z); fadeLeaves(camera.position, camera.position); }
  const hunting = myRole() === 'hunter' && (meta.state === 'hunting' || meta.state === 'hiding');
  fpGun.visible = hunting; if (hunting) fpGun.children[2].material = hunterMat(me.slot);
}
function updateEnts(dt) {
  const st = meta.state, role = myRole(), seeH = st === 'reveal' || role !== 'hider' || meta.mode === 'basic';
  const k = Math.min(1, dt * 10);
  for (const id in ents) {
    const e = ents[id], p = P[id]; if (!p) continue;
    let vis;
    if (!st || (p.role === 'spectator' && st !== 'lobby')) vis = false;
    else if (st === 'lobby') vis = true;
    else if (id === uid) vis = role === 'hider';
    else if (p.role === 'hunter') vis = true;
    else vis = seeH;
    e.av.root.visible = vis;
    e.av.tag.visible = id !== uid && (st === 'lobby' || st === 'reveal' || p.role === 'hunter' || role !== 'hunter');
    if (id !== uid) {
      const t = POS[id];
      if (t) {
        const r = e.av.root;
        r.position.x += (t[0] - r.position.x) * k; r.position.y += (t[1] - r.position.y) * k; r.position.z += (t[2] - r.position.z) * k;
        let dy = t[3] - r.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); r.rotation.y += dy * k;
      }
    }
    e.av.update(dt); // ポーズの切り替えをなめらかに
  }
  for (const d of decoyAvs) d.root.visible = st === 'reveal' || ((st === 'hiding' || st === 'hunting') && (seeH || d.owner === uid));
}

let hudT = 0, posT = 0, lastPos = '';
function updateHud(now) {
  if (now < hudT) return; hudT = now + 250;
  const st = meta.state, role = myRole();
  const left = Math.max(0, Math.ceil(((meta.end || 0) - net.now()) / 1000));
  $('hRole').textContent = st === 'lobby' ? '🛋 待合室' : role === 'hunter' ? '🔫 鬼' : role === 'hider' ? '🦎 カメレオン' : '👀 観戦';
  $('hTimer').textContent = meta.practice ? '練習' : st === 'hiding' ? `隠れ ${left}` : st === 'hunting' ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : st === 'reveal' ? '結果' : '--';
  const alive = Object.values(P).filter(p => p.orig === 'hider' && !p.found).length;
  const dc = DEC[uid] ? [0, 1].filter(i => DEC[uid][i]).length : 0;
  $('hInfo').textContent = st === 'lobby' ? `${Object.keys(P).length}人` : role === 'hunter' ? `弾 ${me.ammo}｜残り ${alive}人` : `残り ${alive}人｜分身 ${dc}/2`;
  if (st === 'hiding') $('blindT').textContent = left;
  const sh = $('shells'), n = (role === 'hunter' && st === 'hunting') ? Math.min(me.ammo, 16) : -1;
  if (sh.dataset.n !== String(n)) { sh.dataset.n = n; sh.innerHTML = n > 0 ? '<i></i>'.repeat(n) : ''; }
}
/* ---------------- 見逃しランキング・笛 ---------------- */
const WH_RANGE = 24; // 笛が聞こえる距離（m）
let gT = 0, scoreT = 0; const _e = new V3(), _d = new V3();
function rankData() {
  return Object.keys(P).filter(id => P[id].orig === 'hider').map(id => ({ n: P[id].name, f: !!P[id].found, s: (id === uid && myRole() === 'hider') ? Math.round(myScore) : (P[id].score || 0) })).sort((a, b) => b.s - a.s);
}
function renderRank(now) {
  const el = $('rank'); let data, note = '';
  if (myRole() === 'hunter') { // 鬼側は30秒に1度だけ更新
    if (!rankSnap || now >= rankAt) { rankSnap = rankData(); rankAt = now + 30000; }
    data = rankSnap; note = `鬼は30秒ごとに更新（あと${Math.ceil((rankAt - now) / 1000)}秒）`;
  } else data = rankData();
  el.textContent = ''; const t = document.createElement('b'); t.textContent = '👀 見逃しランキング'; el.append(t);
  data.slice(0, 6).forEach((d, i) => { const r = document.createElement('div'); r.textContent = `${i + 1}. ${d.f ? '✖ ' : ''}${d.n}　${d.s}pt`; el.append(r); });
  if (note) { const s = document.createElement('small'); s.textContent = note; el.append(s); }
}
function glow(list) { // 音が出た方向の画面端を光らせる（音なしでも分かるように）
  const g = $('glow');
  g.style.background = list.map(([a, v]) => `radial-gradient(circle at ${(50 + Math.sin(a) * 50).toFixed(0)}% ${(50 - Math.cos(a) * 50).toFixed(0)}%, rgba(255,225,90,${(0.25 + 0.4 * v).toFixed(2)}), transparent 42%)`).join(',');
  g.style.transition = 'none'; g.style.opacity = 1; void g.offsetWidth; g.style.transition = 'opacity 2.4s'; g.style.opacity = 0;
}
function doWhistles() {
  const p = P[uid];
  if (myRole() === 'hider' && p && !p.found) { sfx('whistle', 0, 0.5); toast('📣 あなたの笛が鳴った…', 1500); return; }
  const sy = Math.sin(me.camYaw), cy = Math.cos(me.camYaw), list = [];
  for (const id in P) {
    const q = P[id], t = POS[id]; if (id === uid || q.role !== 'hider' || q.found || !t) continue;
    const dx = t[0] - me.pos.x, dz = t[2] - me.pos.z, d = Math.hypot(dx, dz); if (d > WH_RANGE) continue; // 範囲外は聞こえない
    const a = Math.atan2(cy * dx - sy * dz, -sy * dx - cy * dz), vol = 1 - 0.75 * d / WH_RANGE;
    sfx('whistle', Math.sin(a), vol); list.push([a, vol]);
  }
  if (list.length) glow(list);
}
function gameTick(now) {
  if (now < gT) return; gT = now + 250;
  const st = meta.state, p = P[uid];
  if (st === 'hunting' && myRole() === 'hider' && p && !p.found) { // 鬼の視界に入っている間ポイント加算
    let gain = 0;
    for (const id in P) {
      const q = P[id], t = POS[id]; if (id === uid || q.role !== 'hunter' || !t) continue;
      _e.set(t[0], t[1] + 1.55, t[2]); _d.set(me.pos.x, me.pos.y + Math.min(0.8, me.h * 0.5), me.pos.z).sub(_e);
      const dist = _d.length(); if (dist > 35 || dist < 0.01) continue; _d.multiplyScalar(1 / dist);
      const pt = t[4] || 0, cp = Math.cos(pt);
      if (_d.x * (-Math.sin(t[3]) * cp) + _d.y * Math.sin(pt) + _d.z * (-Math.cos(t[3]) * cp) < 0.8) continue;
      ray.set(_e, _d); ray.near = 0; ray.far = Math.max(0.1, dist - 0.45);
      if (ray.intersectObjects(worldMeshes, false).length) continue; // 壁や家具の陰は対象外
      gain = Math.max(gain, 5 + 15 * (1 - dist / 35));
    }
    if (gain) myScore += gain * 0.25;
    if (now > scoreT && Math.round(myScore) !== sentScore) { scoreT = now + 1000; sentScore = Math.round(myScore); net.set(`${base}/players/${uid}/score`, sentScore); }
  }
  if (st === 'hunting' && meta.whistle > 0 && meta.hs) {
    const idx = Math.floor((net.now() - meta.hs) / (meta.whistle * 1000));
    if (idx > lastWh) { lastWh = idx; doWhistles(); }
  }
  if (st === 'hunting' && !meta.practice) renderRank(now);
}
const clock = new THREE.Clock();
function offscreenWork() { // ポーズの絵・マップの写真づくり（1フレームに1つずつ）
  try {
    if (iconJob) { const s = iconJob; iconJob = null; poseIcons[s] = renderPoseIcons(s); refreshWheel(); }
    else if (thumbQ.length) { makeMapThumb(thumbQ.shift()); updateThumbImgs(); }
  } catch (e) { console.warn('snapshot', e); }
}
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05), now = performance.now();
  if (inRoom) {
    updateMe(dt); updateEnts(dt); updateCamera(); updateHud(now); gameTick(now);
    if (now > posT && (meta.state === 'lobby' || myRole() !== 'spectator')) {
      posT = now + (settings.lite ? 180 : 100);
      const a = posArr(), s = a.join(); if (s !== lastPos) { lastPos = s; net.set(`${base}/pos/${uid}`, a); }
    }
  } else { const t = now / 9000; camera.position.set(Math.sin(t) * 30, 16, Math.cos(t) * 30); camera.lookAt(0, 0, 0); camera.rotation.order = 'YXZ'; }
  fpGun.position.z *= 0.8; fpGun.rotation.x *= 0.8;
  if (innerWidth !== lastW || innerHeight !== lastH) resize();
  offscreenWork();
  if (composer && settings.bloom && !settings.lite) { try { composer.render(); } catch (e) { console.warn(e); composer = null; } }
  else renderer.render(scene, camera);
}

/* ---------------- ポーズのえらび輪（真ん中に出る丸い枠） ---------------- */
const WHEEL_IN = ['★1', '★2', '★3', '立つ', 'しゃがむ', '座る', '丸まる', '体育座り'];
const WHEEL_OUT = ['T字', 'バンザイ', 'Y字', '片手上げ', '片足立ち', '開脚', '前かがみ', 'うつ伏せ', 'スーパーマン', '仰向け', '大の字', '横向き', '横寝ひねり', '逆立ち', 'ななめ', '⚙'];
const WSHORT = { '⚙': '細かく', 'スーパーマン': 'スーパー', '横寝ひねり': '横ひねり', '体育座り': '体育ずわり' }; // 輪の中では短い名前で
const poseIcons = {}; let iconJob = null, wheelBuilt = false, wheelAt = 0;
const icon = { scene: null, av: null, cam: null };
const poseArr = name => name[0] === '★' ? savedPoses[Number(name[1]) - 1] : PRESETS[name];
function renderPoseIcons(shape) { // キャラの形でポーズの絵を作る
  if (!icon.scene) {
    const s = new THREE.Scene(); s.background = new THREE.Color('#203040');
    const d = new THREE.DirectionalLight(0xffffff, 1.7); d.position.set(2, 4, -3); s.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2), d);
    const sk = makeSkin(); sk.ctx.fillStyle = '#86dcae'; sk.ctx.fillRect(0, 0, ATW, ATH); sk.tex.needsUpdate = true; sk.mat.roughness = 0.55;
    icon.av = makeAvatar(sk); icon.av.tag.visible = false; s.add(icon.av.root);
    icon.scene = s; icon.cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  }
  const av = icon.av, out = {}, c = new V3(), dir = new V3(0.55, 0.32, -1).normalize();
  av.setStyle(shape, 1);
  for (const name of WHEEL_IN.concat(WHEEL_OUT)) {
    const p = name === '⚙' ? null : poseArr(name); if (!p) continue;
    av.setPose(p); _box.makeEmpty(); for (const m of av.meshes) _box.expandByObject(m, true);
    _box.getCenter(c); const r = _box.getSize(_t).length() / 2;
    icon.cam.position.copy(c).addScaledVector(dir, r / Math.sin(rad(15)) * 1.02); icon.cam.lookAt(c);
    out[name] = snap(icon.scene, icon.cam, 96, 96);
  }
  return out;
}
function buildWheel() {
  wheelBuilt = true; const ring = $('ring');
  const add = (name, i, n, R) => {
    const a = -Math.PI / 2 + i / n * Math.PI * 2, b = document.createElement('button');
    b.className = 'pi'; b.dataset.k = name; b.style.left = (190 + Math.cos(a) * R) + 'px'; b.style.top = (190 + Math.sin(a) * R) + 'px';
    const im = document.createElement('img'); im.alt = ''; const s = document.createElement('span'); s.textContent = WSHORT[name] || name;
    if (name === '⚙') { im.remove(); const g = document.createElement('i'); g.textContent = '⚙'; b.append(g, s); } else b.append(im, s);
    b.addEventListener('click', () => wheelPick(name)); ring.append(b);
  };
  WHEEL_IN.forEach((n, i) => add(n, i, WHEEL_IN.length, 92)); WHEEL_OUT.forEach((n, i) => add(n, i, WHEEL_OUT.length, 156));
}
function refreshWheel() {
  if (!wheelBuilt) return;
  const ic = poseIcons[me.shape] || {}, cur = JSON.stringify(me.pose);
  document.querySelectorAll('#ring .pi').forEach(b => {
    const k = b.dataset.k, p = k === '⚙' ? null : poseArr(k), im = b.querySelector('img');
    if (im) { if (ic[k]) { if (im.src !== ic[k]) im.src = ic[k]; im.style.visibility = ''; } else im.style.visibility = 'hidden'; }
    b.classList.toggle('empty', k[0] === '★' && !p); b.classList.toggle('cur', !!p && JSON.stringify(p.map(Number)) === cur);
    if (k[0] === '★') b.querySelector('span').textContent = p ? k : k + ' 空';
  });
  $('wName').textContent = poseName;
}
function fitWheel() { $('ring').style.setProperty('--ws', Math.min(1, (innerHeight - 16) / 384, (innerWidth - 16) / 384).toFixed(3)); }
function openWheel() {
  if (!inRoom || !canTool()) return;
  if (panel) setPanel('');
  if (document.pointerLockElement) document.exitPointerLock();
  if (!wheelBuilt) buildWheel();
  if (!poseIcons[me.shape]) iconJob = me.shape;
  fitWheel(); refreshWheel(); show('wheel', true); $('bPose').classList.add('on'); wheelAt = performance.now();
}
function closeWheel() { if ($('wheel').classList.contains('hide')) return; show('wheel', false); $('bPose').classList.remove('on'); }
const toggleWheel = () => ($('wheel').classList.contains('hide') ? openWheel() : closeWheel());
function wheelPick(name) {
  if (name === '⚙') { closeWheel(); setPanel('pose'); return; }
  if (name[0] === '★') {
    const i = Number(name[1]) - 1;
    if (!savedPoses[i]) { // 空の★は、いまのポーズを保存
      savedPoses[i] = me.pose.slice(); savePoses(); slotUI(); for (const k in poseIcons) delete poseIcons[k]; iconJob = me.shape;
      toast(`いまのポーズを ${name} に保存しました`); refreshWheel(); return;
    }
  }
  usePose(poseArr(name), name); closeWheel();
}
$('wheel').addEventListener('click', e => { if (e.target.id === 'wheel' && performance.now() - wheelAt > 450) closeWheel(); }); // 開いた時のタップで閉じないように
$('wClose').addEventListener('click', closeWheel);
addEventListener('resize', fitWheel);

/* ---------------- マップえらび（写真つき） ---------------- */
let mapPickCb = null;
function thumbBox(k) { // マップの写真（できるまでは空の色）
  const w = document.createElement('div'); w.className = 'ph';
  if (k === 'random') { w.classList.add('rnd'); w.textContent = '🎲'; return w; }
  w.style.background = MAPS[k] ? MAPS[k].sky : '#333';
  const im = document.createElement('img'); im.alt = ''; im.dataset.thumb = k; w.append(im); requestThumbs([k]);
  return w;
}
function setMapCard(btn, k) {
  if (btn.dataset.k === k) return; btn.dataset.k = k; btn.textContent = '';
  const s = document.createElement('span'); s.textContent = k === 'random' ? 'ランダム' : (MAP_LIST.find(m => m[0] === k) || [0, k])[1];
  btn.append(thumbBox(k), s); updateThumbImgs();
}
function updateThumbImgs() { document.querySelectorAll('img[data-thumb]').forEach(im => { const u = thumbs[im.dataset.thumb]; if (u && im.getAttribute('src') !== u) im.src = u; }); }
function openMapPick(cur, title, cb) {
  mapPickCb = cb; $('mpTitle').textContent = title; const g = $('mapGrid'); g.textContent = '';
  for (const [k, n] of [['random', 'ランダム']].concat(MAP_LIST)) {
    const b = document.createElement('button'); b.className = 'mc' + (k === cur ? ' on' : '');
    const s = document.createElement('span'); s.textContent = n; b.append(thumbBox(k), s);
    b.addEventListener('click', () => { const f = mapPickCb; closeMapPick(); if (f) f(k); }); g.append(b);
  }
  updateThumbImgs(); show('mapPick', true);
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeMapPick() { show('mapPick', false); mapPickCb = null; }
$('mpClose').addEventListener('click', closeMapPick);
/* ---------------- 画面のイベント ---------------- */
try { $('inName').value = localStorage.getItem('nurikakure_name') || ''; } catch (e) {}
$('btnName').onclick = () => {
  const n = $('inName').value.trim().slice(0, 12); if (!n) { $('inName').focus(); return; }
  myName = n; try { localStorage.setItem('nurikakure_name', n); } catch (e) {}
  audioInit(); show('scrName', false); show('scrRoom', true);
  if (isTouch) { try { const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) Promise.resolve(f.call(el)).then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {}); } catch (e) {} }
  if (!configured) $('status').textContent = '※ Firebase 未設定のため、今は「ひとりで練習」だけ遊べます。';
};
$('inName').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnName').click(); });
$('inRoom').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^A-Za-z0-9_-]/g, ''); });
$('inRoom').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
let joining = false;
const doJoin = async (id, pr, pmap) => { if (joining || inRoom) return; joining = true; await joinRoom(id, pr, pmap); joining = false; };
$('btnJoin').onclick = () => { const id = $('inRoom').value.trim(); if (!id) { $('status').textContent = 'ルームIDを入力してください'; return; } doJoin(id, false); };
$('btnPractice').onclick = () => openMapPick('random', 'ひとりで練習：マップをえらぶ', k => doJoin('practice', true, k));
$('btnMap').onclick = () => { // 練習中にマップを変える
  if (!practice || !inRoom) return;
  openMapPick(meta.map || 'random', 'マップを変える', k => { if (!practice || !inRoom) return; meta.map = k; net.update(base + '/meta', { map: k }); startGame(); });
};
$('btnLeave').onclick = () => leaveRoom('');
$('btnStart').onclick = () => { if (meta.host === uid) startGame(); };
$('btnLobby').onclick = () => { if (meta.host === uid) { if (practice) leaveRoom(''); else net.update(base + '/meta', { state: 'lobby' }); } };
$('btnSwap').onclick = () => { if (!practice) return; const r = myRole() === 'hider' ? 'hunter' : 'hider'; me.ammo = 99; net.update(`${base}/players/${uid}`, { role: r, ammo: 50 }); toast(r === 'hunter' ? '鬼に切替：自分の分身を撃って試せます' : 'カメレオンに切替'); };
const metaSet = (id, key, num) => $(id).addEventListener('change', e => {
  if (meta.host !== uid) return; let v = e.target.value;
  if (num) { v = Math.max(Number(e.target.min || 1), Math.min(Number(e.target.max || 999), Math.round(Number(v) || 0))); e.target.value = v; }
  net.update(base + '/meta', { [key]: v });
});
metaSet('sMode', 'mode'); metaSet('sHunters', 'hunters', true); metaSet('sHide', 'hideTime', true); metaSet('sHunt', 'huntTime', true); metaSet('sAmmo', 'ammo', true);
$('sHunters').min = 1; $('sHunters').max = 4;
$('mapCard').onclick = () => { if (meta.host === uid) openMapPick(meta.map || 'random', 'マップをえらぶ', k => { if (meta.host === uid) net.update(base + '/meta', { map: k }); }); };
$('sWhistle').addEventListener('change', e => { if (meta.host === uid) net.update(base + '/meta', { whistle: Number(e.target.value) }); });
$('btnRoom').onclick = () => { lobbyOpen = true; setPanel(''); };
$('btnLobbyClose').onclick = () => { lobbyOpen = false; refreshUI(); };
// ツール
$('tPaint').onclick = () => setPanel(panel === 'paint' ? '' : 'paint');
$('tPose').onclick = () => setPanel(panel === 'pose' ? '' : 'pose');
$('tDecoy').onclick = placeDecoy;
$('tDecoyX').onclick = () => { if (inRoom) net.remove(`${base}/decoys/${uid}`); };
$('tZoomIn').onclick = () => { me.dist = Math.max(1.2, me.dist - 0.6); };
$('tZoomOut').onclick = () => { me.dist = Math.min(7, me.dist + 0.6); };
document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => setPanel(''); });
$('bcolor').addEventListener('input', e => setBrush(e.target.value, false));
$('bcolor').addEventListener('change', e => setBrush(e.target.value, true));
$('pZoom').addEventListener('input', e => setZoom(Number(e.target.value)));
$('pY').addEventListener('input', e => { paintY = Number(e.target.value); });
$('bSize').addEventListener('input', e => { brush.size = Number(e.target.value); });
$('bDrop').onclick = () => setDrop(!eyedrop);
$('tDrop').onclick = () => setDrop(!eyedrop);
$('bFill').onclick = () => fillSkin(brush.color);
$('bReset').onclick = () => fillSkin(BASE_COLOR);
$('mEm').addEventListener('input', e => { mySkin.mat.emissiveIntensity = Number(e.target.value); queueMat(); });
$('mMe').addEventListener('input', e => { mySkin.mat.metalness = Number(e.target.value); queueMat(); });
$('mRo').addEventListener('input', e => { mySkin.mat.roughness = 1 - Number(e.target.value); queueMat(); });
// ポーズ
const POSE_DEF = [['体を前後に倒す', -90, 90], ['体を横に倒す', -90, 90], ['腰を曲げる', -30, 120], ['左腕 前後', -180, 180], ['左腕 開く', 0, 180], ['右腕 前後', -180, 180], ['右腕 開く', 0, 180], ['左脚 前後', -120, 120], ['左脚 開く', 0, 90], ['右脚 前後', -120, 120], ['右脚 開く', 0, 90]];
const PRESETS = {
  '立つ': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'T字': [0, 0, 0, 0, 90, 0, 90, 0, 0, 0, 0], 'バンザイ': [0, 0, 0, 180, 8, 180, 8, 0, 0, 0, 0], 'Y字': [0, 0, 0, 180, 35, 180, 35, 0, 25, 0, 25],
  '片手上げ': [0, 0, 0, 180, 10, 0, 0, 0, 0, 0, 0], '片足立ち': [0, 0, 0, 0, 60, 0, 60, 0, 0, 90, 0], '開脚': [0, 0, 0, 0, 30, 0, 30, 0, 75, 0, 75], '前かがみ': [0, 0, 90, 0, 0, 0, 0, 0, 0, 0, 0],
  '座る': [0, 0, 0, 0, 0, 0, 0, 90, 0, 90, 0], '体育座り': [-15, 0, 55, 75, 0, 75, 0, 115, 0, 115, 0], 'しゃがむ': [0, 0, 70, 30, 0, 30, 0, 100, 8, 100, 8], '丸まる': [0, 0, 110, 70, 0, 70, 0, 120, 0, 120, 0],
  'うつ伏せ': [90, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'スーパーマン': [90, 0, 0, 180, 0, 180, 0, 0, 0, 0, 0], '仰向け': [-90, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], '大の字': [-90, 0, 0, 0, 120, 0, 120, 0, 35, 0, 35],
  '横向き': [0, 90, 0, 0, 0, 0, 0, 0, 0, 0, 0], '横寝ひねり': [0, 90, 40, 60, 0, 0, 0, 60, 0, 0, 0], '逆立ち': [180, 0, 0, 180, 0, 180, 0, 0, 0, 0, 0], 'ななめ': [35, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0]
};
let savedPoses = [null, null, null], poseIdx = 0, saveArm = false;
try { const o = JSON.parse(localStorage.getItem('nurikakure_poses') || '[]'); for (let i = 0; i < 3; i++) if (Array.isArray(o[i]) && o[i].length === 11) savedPoses[i] = o[i].map(Number); } catch (e) {}
function usePose(arr, name) {
  me.pose = arr.slice(); sliderEls.forEach((el, i) => { el.value = me.pose[i]; }); applyPose();
  setPoseName(name || 'カスタム'); if (name) toast('ポーズ：' + name, 1200);
}
function setPoseName(n) { poseName = n; $('bPoseN').textContent = n; refreshWheel(); }
const savePoses = () => { try { localStorage.setItem('nurikakure_poses', JSON.stringify(savedPoses)); } catch (e) {} };
function nextPose() { // ボタン1つで次々に切り替え（保存したポーズ → 用意されたポーズ）
  if (!canTool()) return;
  const list = savedPoses.map((p, i) => p && ['★' + (i + 1), p]).filter(Boolean).concat(Object.entries(PRESETS));
  poseIdx = (poseIdx + 1) % list.length; usePose(list[poseIdx][1], list[poseIdx][0]);
}
function slotUI() { document.querySelectorAll('[data-slot]').forEach(b => { const i = Number(b.dataset.slot); b.classList.toggle('sec', !savedPoses[i]); b.textContent = '★' + (i + 1) + (savedPoses[i] ? '' : '（空）'); }); $('poseSave').classList.toggle('sec', !saveArm); }
document.querySelectorAll('[data-slot]').forEach(b => { b.onclick = () => {
  const i = Number(b.dataset.slot);
  if (saveArm) { savedPoses[i] = me.pose.slice(); saveArm = false; savePoses(); for (const k in poseIcons) delete poseIcons[k]; toast(`★${i + 1} に保存しました`); }
  else if (savedPoses[i]) usePose(savedPoses[i], '★' + (i + 1)); else toast('まだ保存されていません（「保存」→ ★ の順に押す）');
  slotUI();
}; });
$('poseSave').onclick = () => { saveArm = !saveArm; slotUI(); if (saveArm) toast('保存先の ★ を押してください'); };
const sliderEls = [];
function applyPose() { const e = ents[uid]; if (e) e.av.animTo(me.pose.slice()); if (me.cling) me.cling.hold = 0; queuePose(); }
POSE_DEF.forEach((d, i) => {
  const l = document.createElement('label'); l.className = 'l'; l.textContent = d[0];
  const r = document.createElement('input'); r.type = 'range'; r.min = d[1]; r.max = d[2]; r.step = 1; r.value = 0;
  r.addEventListener('input', () => { me.pose[i] = Number(r.value); applyPose(); if (poseName !== 'カスタム') setPoseName('カスタム'); });
  l.append(r); $('sliders').append(l); sliderEls.push(r);
});
for (const name in PRESETS) {
  const b = document.createElement('button'); b.textContent = name; b.className = 'sec';
  b.onclick = () => usePose(PRESETS[name], name);
  $('presets').append(b);
}
function setBody(shape, size) {
  me.shape = shape; me.size = size;
  try { localStorage.setItem('nurikakure_body', JSON.stringify({ shape, size })); } catch (e) {}
  document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('sec', b.dataset.shape !== shape));
  document.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('sec', Number(b.dataset.size) !== size));
  if (inRoom) net.update(`${base}/players/${uid}`, { shape, size });
  if (!poseIcons[shape] && !$('wheel').classList.contains('hide')) iconJob = shape;
  refreshWheel();
}
document.querySelectorAll('[data-shape]').forEach(b => { b.onclick = () => setBody(b.dataset.shape, me.size); });
document.querySelectorAll('[data-size]').forEach(b => { b.onclick = () => setBody(me.shape, Number(b.dataset.size)); });
setBody(me.shape, me.size);
slotUI();
$('rotL').onclick = () => { me.yaw += Math.PI / 12; }; $('rotR').onclick = () => { me.yaw -= Math.PI / 12; };
// 設定
function openSettings() { $('oLite').checked = settings.lite; $('oBloom').checked = !!settings.bloom; $('oSens').value = settings.sens; $('oBgm').value = settings.bgm; $('oSe').value = settings.se; show('modal', true); if (document.pointerLockElement) document.exitPointerLock(); }
$('btnSet1').onclick = openSettings; $('btnSet2').onclick = openSettings;
$('btnSetClose').onclick = () => show('modal', false);
$('oBloom').addEventListener('change', e => { settings.bloom = e.target.checked; saveSet(); });
$('oLite').addEventListener('change', e => { settings.lite = e.target.checked; applyGfx(); saveSet(); });
$('oSens').addEventListener('input', e => { settings.sens = Number(e.target.value); saveSet(); });
$('oBgm').addEventListener('input', e => { settings.bgm = Number(e.target.value); audioInit(); applyVol(); saveSet(); });
$('oSe').addEventListener('input', e => { settings.se = Number(e.target.value); applyVol(); saveSet(); });

if (!isTouch) document.body.classList.add('pc');
setClingUI(); setPoseName('立つ');
loadMap('park');
tick();
