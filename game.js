// ぬりかくれ！ - ペイントかくれんぼ (Three.js + Firebase Realtime Database)
import * as THREE from 'three';
import { firebaseConfig } from './firebase-config.js';
import { MAPS, MAP_LIST, KIT, KIT_R } from './maps.js';
import { drawPattern } from './patterns.js';
import { buildBody, RIG, makeHash, near, nearestVert, nearestMap } from './body.js';
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
const newWorld = (sc, cheap) => ({ scene: sc, meshes: [], hard: [], soft: [], cols: [], extras: [], info: null, lamps: 0, cheap, tex: new Map(), geo: new Map(), mat: new Map(), S: 1 });
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
// 同じ見た目の物は同じ材質を使い回す（あとで1つにまとめて軽くするため）
function makeMat(color, opt, rough, gs = 1) {
  const pat = opt.pat ? JSON.stringify(opt.pat) : '', key = [color, opt.rough == null ? rough : opt.rough, opt.glow || 0, gs, pat, opt.side || 0, opt.flatS ? 1 : 0].join('|');
  if (!opt.soft) { const c = W.mat.get(key); if (c) return c; }
  const m = new THREE.MeshStandardMaterial({ color: opt.pat ? 0xffffff : color, roughness: opt.rough == null ? rough : opt.rough, metalness: 0, flatShading: !!opt.flatS });
  if (opt.side) m.side = opt.side;
  const gl = opt.glow ? (opt.glow === true ? 1.6 : opt.glow) * gs : 0;
  if (opt.pat) {
    const p = patternTex(opt.pat[0], opt.pat[1], opt.pat[2], opt.pat[3], opt.pat[4]); m.map = p.t; m.userData.pc = p.c;
    if (gl) { m.emissive.set(0xffffff); m.emissiveMap = p.t; m.emissiveIntensity = gl; } // 模様そのものが光る
  } else if (gl) { m.emissive.set(color); m.emissiveIntensity = gl; }
  if (!opt.soft) W.mat.set(key, m);
  return m;
}
function place(m, opt) { // 世界に置く。模様つきはスポイト用にキャンバスを覚えておく
  if (m.material.userData.pc) m.userData.pc = m.material.userData.pc;
  W.scene.add(m); W.meshes.push(m);
  if (opt.soft) { m.userData.soft = true; W.soft.push(m); } else W.hard.push(m);
}
function geoCache(key, make) { let g = W.geo.get(key); if (!g) { g = make(); W.geo.set(key, g); } return g; }
function addBox(x, y, z, w, h, d, color, opt = {}) {
  const rr = (opt.flat || opt.sharp) ? 0 : Math.min(opt.r == null ? 0.16 : opt.r, Math.min(w, h, d) * 0.35); // 角を丸める
  const round = rr > 0.012 && !W.cheap;
  const m = new THREE.Mesh(geoCache(`b${w},${h},${d},${round ? rr : 0}`, () => round ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d)), makeMat(color, opt, 0.88));
  m.position.set(x, y + h / 2, z); m.castShadow = !opt.flat; m.receiveShadow = true; place(m, opt);
  if (!opt.nocol) W.cols.push(boxCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y, y + h, { rr: rr > 0.03 ? rr : 0, nc: opt.noclimb }));
}
function addCyl(x, y, z, r, h, color, opt = {}) {
  const rt = opt.rt == null ? r : opt.rt, seg = W.cheap ? Math.min(opt.seg || 24, 12) : (opt.seg || 24);
  const m = new THREE.Mesh(geoCache(`c${rt},${r},${h},${seg}`, () => new THREE.CylinderGeometry(rt, r, h, seg)), makeMat(color, opt, 0.85));
  m.position.set(x, y + h / 2, z); m.castShadow = !opt.flat; m.receiveShadow = true; place(m, opt);
  if (!opt.nocol) { const k = seg >= 8 ? 1 : 0.92; W.cols.push(cylCol(x, z, y, y + h, r * k, rt * k, { nc: opt.noclimb })); }
}
function addBall(x, y, z, r, color, opt = {}) {
  const m = new THREE.Mesh(geoCache(`s${r}`, () => new THREE.SphereGeometry(r, W.cheap ? 12 : 22, W.cheap ? 8 : 16)), makeMat(color, opt, 0.95, opt.glow ? 1.6 : 1));
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = !opt.glow;
  if (opt.soft) m.userData.sph = [x, y, z, r]; // 葉っぱ：中にいると自分からは透けて見える
  place(m, opt);
  if (opt.glow && !opt.nolight && !settings.lite && !W.cheap && W.lamps < 10) { // 光るランタン
    W.lamps++; const k = W.info.dark || 1, L = new THREE.PointLight(0xffc27a, (14 + 60 * (1 - k)) * W.S, 16 * W.S, 2); L.position.set(x, y, z); W.scene.add(L); W.extras.push(L);
  }
  if (opt.col) W.cols.push(ellCol(x, y, z, r, r, r));
}
function addCone(x, y, z, r, h, color, opt = {}) {
  const seg = opt.seg || 22, rt = opt.rt || 0;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, r, h, W.cheap ? Math.min(seg, 12) : seg), makeMat(color, Object.assign({}, opt, { flatS: seg <= 9 }), 0.9));
  m.position.set(x, y + h / 2, z); if (seg === 4) m.rotation.y = Math.PI / 4; m.castShadow = m.receiveShadow = true; place(m, opt);
  if (opt.nocol) return;
  if (seg === 4) W.cols.push(cylCol(x, z, y, y + h, r * 0.707, rt * 0.707, { sq: true })); // 四角すい
  else { const k = seg <= 6 ? 0.88 : seg <= 9 ? 0.95 : 1; W.cols.push(cylCol(x, z, y, y + h, r * k, rt * k, { walk: h / Math.max(0.01, r - rt) < 0.75 })); }
}
function addDome(x, y, z, rx, ry, rz, color, opt = {}) { // だ円の山。opt.solid=物（クッションなど）, half=上半分だけ（きのこのかさ）
  const g = opt.half ? new THREE.SphereGeometry(1, W.cheap ? 14 : 28, W.cheap ? 6 : 12, 0, Math.PI * 2, 0, Math.PI / 2) : new THREE.SphereGeometry(1, W.cheap ? 14 : 24, W.cheap ? 10 : 16);
  const m = new THREE.Mesh(g, makeMat(color, Object.assign({}, opt, { side: opt.half ? THREE.DoubleSide : 0 }), 0.95));
  m.scale.set(rx, ry, rz); m.position.set(x, y, z); if (opt.rot) m.rotation.y = -opt.rot; m.castShadow = !opt.sky; m.receiveShadow = !opt.sky;
  if (opt.sky) { m.material = m.material.clone(); m.material.fog = false; W.scene.add(m); W.extras.push(m); return; } // 空の雲はスポイト・当たり判定の対象外
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
  const m = new THREE.Mesh(geoCache(`t${r}`, () => new THREE.TorusGeometry(r * 0.72, r * 0.3, 10, 22)), makeMat('#1b1d20', {}, 0.8));
  m.rotation.x = Math.PI / 2; m.position.set(x, y + r * 0.3, z); m.castShadow = m.receiveShadow = true; place(m, {});
}
function addWheel(x, y, z, r, w, axis) {
  const m = new THREE.Mesh(geoCache(`w${r},${w}`, () => new THREE.CylinderGeometry(r, r, w, 18)), makeMat('#15171a', {}, 0.8));
  if (axis === 'x') m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z); m.castShadow = true; place(m, {});
}
function addLabel(x, y, z, w, d, text, color) { // 床に書いた文字（HUNTER など）
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.max(32, Math.round(512 * d / w)); const g = c.getContext('2d');
  g.font = `900 ${Math.round(c.height * 0.78)}px system-ui,-apple-system,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = c.height * 0.06; g.strokeStyle = 'rgba(0,0,0,0.35)'; g.strokeText(text, 256, c.height / 2 + 2, 496); g.fillStyle = color; g.fillText(text, 256, c.height / 2 + 2, 496);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.renderOrder = 2; W.scene.add(m); W.meshes.push(m);
}
// 動かない物を、材質と場所（24mごと）でまとめて1つの形にする（描画が軽くなる）
const _mv = new V3(), _mn = new V3(), _nm = new THREE.Matrix3();
function mergeStatic(w) {
  const groups = new Map();
  for (const m of w.hard) {
    m.updateMatrixWorld();
    const k = m.material.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '') + Math.floor(m.position.x / 24) + ',' + Math.floor(m.position.z / 24);
    let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(m);
  }
  const out = [], used = new Set();
  for (const g of groups.values()) {
    if (g.length < 2) { out.push(g[0]); used.add(g[0].geometry); continue; }
    const parts = g.map(m => [m, m.geometry.index ? m.geometry.toNonIndexed() : m.geometry]);
    const n = parts.reduce((a, p) => a + p[1].attributes.position.count, 0), P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2);
    let o = 0;
    for (const [m, geo] of parts) {
      _nm.getNormalMatrix(m.matrixWorld);
      const pa = geo.attributes.position, na = geo.attributes.normal, ua = geo.attributes.uv;
      for (let i = 0; i < pa.count; i++, o++) {
        _mv.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); P[o * 3] = _mv.x; P[o * 3 + 1] = _mv.y; P[o * 3 + 2] = _mv.z;
        _mn.fromBufferAttribute(na, i).applyMatrix3(_nm).normalize(); N[o * 3] = _mn.x; N[o * 3 + 1] = _mn.y; N[o * 3 + 2] = _mn.z;
        if (ua) { U[o * 2] = ua.getX(i); U[o * 2 + 1] = ua.getY(i); }
      }
      if (geo !== m.geometry) geo.dispose();
      w.scene.remove(m);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.computeBoundingSphere();
    const mm = new THREE.Mesh(geo, g[0].material); mm.castShadow = g[0].castShadow; mm.receiveShadow = g[0].receiveShadow; mm.userData.pc = g[0].userData.pc; mm.matrixAutoUpdate = false;
    w.scene.add(mm); out.push(mm); used.add(geo);
  }
  for (const m of w.hard) if (!used.has(m.geometry) && !out.includes(m)) m.geometry.dispose();
  const rest = w.meshes.filter(m => !w.hard.includes(m));
  w.hard.length = 0; w.hard.push(...out); w.meshes.length = 0; w.meshes.push(...out, ...rest);
}
let curMap = '', MAPINFO = null, spots = [], envReady = false;
const INFO = {};
function infoOf(name) { // マップの情報（大きさは scale 倍：物も広さも大きくなり、キャラは小さく見える）
  if (INFO[name]) return INFO[name];
  const M = MAPS[name], S = M.scale || 1.5;
  return INFO[name] = Object.assign({}, M, { S, hx: M.hx * S, hz: M.hz * S, spawn: [M.spawn[0] * S, M.spawn[1] * S], hunter: M.hunter ? [M.hunter[0] * S, M.hunter[1] * S, M.hunter[2] * S] : null });
}
MAPINFO = infoOf('lobby');
function applyLight() {
  const k = MAPINFO.dark || 1;
  hemi.intensity = (envReady ? 0.35 : 0.75) * k; sun.intensity = (envReady ? 0.8 : 1.0) * k; scene.environmentIntensity = k;
  sun.color.set(MAPINFO.night ? 0x9db4ff : 0xffffff); renderer.toneMappingExposure = MAPINFO.night ? 1.25 : 1.08;
}
function disposeWorld(w) {
  for (const m of w.meshes) { w.scene.remove(m); m.geometry.dispose(); }
  for (const m of w.mat.values()) { if (m.map) m.map.dispose(); m.dispose(); }
  for (const m of w.soft) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
  for (const m of w.meshes) if (m.material.isMeshBasicMaterial) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
  for (const o of w.extras) { w.scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
  for (const g of w.geo.values()) g.dispose();
  w.meshes.length = 0; w.hard.length = 0; w.soft.length = 0; w.cols.length = 0; w.extras.length = 0; w.lamps = 0; w.tex.clear(); w.geo.clear(); w.mat.clear();
}
function buildWorld(name) { // マップを W に組み立てる。設計図の座標を scale 倍して置く
  const M = MAPS[name], I = infoOf(name), S = I.S, hx = M.hx, hz = M.hz; W.info = I; W.S = S;
  const sc = o => { if (!o || (o.r == null && o.rt == null)) return o; const c = Object.assign({}, o); if (c.r != null) c.r *= S; if (c.rt != null) c.rt *= S; return c; };
  const h = {
    B: (x, y, z, w, ht, d, col, o) => addBox(x * S, y * S, z * S, w * S, ht * S, d * S, col, sc(o)),
    cyl: (x, y, z, r, ht, col, o) => addCyl(x * S, y * S, z * S, r * S, ht * S, col, sc(o)),
    ball: (x, y, z, r, col, o) => addBall(x * S, y * S, z * S, r * S, col, o),
    cone: (x, y, z, r, ht, col, o) => addCone(x * S, y * S, z * S, r * S, ht * S, col, sc(o)),
    dome: (x, y, z, rx, ry, rz, col, o) => addDome(x * S, y * S, z * S, rx * S, ry * S, rz * S, col, o),
    cap: (x, y, z, r, len, col, o) => addCap(x * S, y * S, z * S, r * S, len * S, col, o),
    arch: (x, z, R, t, rot, pat) => addArch(x * S, z * S, R * S, t * S, rot, pat),
    tire: (x, y, z, r) => addTire(x * S, y * S, z * S, r * S),
    wheel: (x, y, z, r, w, ax) => addWheel(x * S, y * S, z * S, r * S, w * S, ax),
    label: (x, y, z, w, d, text, col) => addLabel(x * S, y * S, z * S, w * S, d * S, text, col),
    rnd: rng(name.length * 977 + name.charCodeAt(0) * 31),
    F: (x, z, w, d, color, pat, lift) => addBox(x * S, lift ? 0 : -0.2, z * S, w * S, lift ? 0.02 : 0.2, d * S, color, { nocol: true, flat: true,
      pat: pat || (M.floorTex && !lift ? ['img:' + M.floorTex, color, 0.38, w * S / 5, d * S / 5] : ['noise', color, 0, w * S / 4, d * S / 4]), rough: pat && (pat[0] === 'checker' || pat[0] === 'img:tile') ? 0.28 : (pat ? 0.5 : 0.9) }),
    outer: (ht, color) => { // 抜けられない厚い外壁（登れない）
      const X = hx * S, Z = hz * S, H = ht * S, px = { noclimb: true, pat: ['panel', color, 0, (2 * X + 6) / 3, H / 3] }, pz = { noclimb: true, pat: ['panel', color, 0, 2 * Z / 3, H / 3] };
      addBox(0, 0, -Z - 1.5, 2 * X + 6, H, 3, color, px); addBox(0, 0, Z + 1.5, 2 * X + 6, H, 3, color, px);
      addBox(-X - 1.5, 0, 0, 3, H, 2 * Z, color, pz); addBox(X + 1.5, 0, 0, 3, H, 2 * Z, color, pz);
    }
  };
  M.build(h);
  if (M.kit) { // 隠れ場所になる小物をたくさん並べる（全員同じ配置になるよう乱数は固定）
    const n = Math.round((M.clutter || 90) * 1.25); let made = 0, guard = 0;
    while (made < n && guard++ < n * 14) {
      const x = (h.rnd() * 2 - 1) * (hx - 1.8), z = (h.rnd() * 2 - 1) * (hz - 1.8), k = M.kit[Math.floor(h.rnd() * M.kit.length)];
      if (Math.hypot(x - M.spawn[0], z - M.spawn[1]) < 4.5 || !isFree(x * S, z * S, (KIT_R[k] || 1.35) * S, W.cols)) continue;
      KIT[k](h, x, z, M.pal || ['#b9b9b9'], M.acc || ACC); made++;
    }
  }
  if (W.scene.background && W.scene.background.isColor) W.scene.background.set(M.sky); else W.scene.background = new THREE.Color(M.sky);
  W.scene.fog = new THREE.Fog(M.sky, 60 * S, 170 * S);
  if (M.night) { // 星空
    const n = 700, a = new Float32Array(n * 3), r = rng(99);
    for (let i = 0; i < n; i++) { const th = r() * 6.283, ph = Math.acos(r() * 0.95), R = 200; a[i * 3] = Math.sin(ph) * Math.cos(th) * R; a[i * 3 + 1] = Math.cos(ph) * R; a[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * R; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, fog: false })); W.scene.add(st); W.extras.push(st);
  }
}
function loadMap(name) {
  if (!MAPS[name]) name = 'house';
  if (name === curMap) return false;
  curMap = name; MAPINFO = infoOf(name);
  W = mainW; disposeWorld(mainW); clearSplats();
  buildWorld(name); mergeStatic(mainW); applyLight();
  const hx = MAPINFO.hx, hz = MAPINFO.hz;
  const c = sun.shadow.camera, e = Math.max(hx, hz) + 8; c.left = -e; c.right = e; c.top = e; c.bottom = -e; c.far = 160; c.updateProjectionMatrix();
  sun.position.set(hx * 0.35, 60, hz * 0.3);
  camera.far = Math.max(220, e * 3.2); camera.updateProjectionMatrix();
  spots = [];
  for (let x = -hx + 2; x <= hx - 2; x += 2.5) for (let z = -hz + 2; z <= hz - 2; z += 2.5) if (isFree(x, z, 0.8, colliders)) spots.push([x, z]);
  return true;
}
function spawnAt(kind) { // 'hider' は鬼の出発点から離れた場所に、席番号ごとに別々の場所へ
  const hs = MAPINFO.spawn; let best = null, bd = 1e9;
  for (const s of spots) { const d = (s[0] - hs[0]) ** 2 + (s[1] - hs[1]) ** 2; if (d < bd) { bd = d; best = s; } }
  best = best || hs; me.vy = 0; me.cling = null; me.kx = me.kz = 0;
  const n = Number(me.slot) || 0;
  if (kind !== 'hider') { me.pos.set(best[0] + (n % 4 - 1.5) * 0.9, 0, best[1] + (Math.floor(n / 4) % 3 - 1) * 0.9); return; }
  const far = spots.filter(s => (s[0] - best[0]) ** 2 + (s[1] - best[1]) ** 2 > 324), l = (far.length >= 12 ? far : spots).slice();
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
  const M = infoOf(k), kk = Math.max(0.6, M.dark || 1);
  const dl = new THREE.DirectionalLight(M.night ? 0xc0ccff : 0xffffff, 1.3 * kk); dl.position.set(M.hx * 0.4, 60, M.hz * 0.7);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, (envReady ? 0.55 : 0.95) * kk), dl);
  sc.environment = scene.environment; sc.fog = null;
  const e = Math.max(M.hx, M.hz), cam = new THREE.PerspectiveCamera(46, 16 / 9, 0.5, 600);
  cam.position.set(0, e * 1.05, e * 1.3); cam.lookAt(0, 0, e * 0.08);
  const ex = renderer.toneMappingExposure; renderer.toneMappingExposure = M.night ? 1.8 : 1.12;
  try { thumbs[k] = snap(sc, cam, 320, 180, 'image/jpeg'); } finally { renderer.toneMappingExposure = ex; disposeWorld(w); }
}

/* ---------------- アバター ---------------- */
// 体は頭・胴・手足をなめらかにつないだ1つの形（body.js）。6本の骨で曲げ、色は体の表面（頂点）に直接塗る
const BODY = {};
function bodyData(shape) {
  if (BODY[shape]) return BODY[shape];
  const b = buildBody(shape);
  return BODY[shape] = { n: b.n, pos: b.pos, hash: makeHash(b.pos), index: new THREE.BufferAttribute(b.idx, 1),
    attrs: { position: new THREE.BufferAttribute(b.pos, 3), normal: new THREE.BufferAttribute(b.nrm, 3), skinIndex: new THREE.Uint16BufferAttribute(b.skinIndex, 4), skinWeight: new THREE.Float32BufferAttribute(b.skinWeight, 4) } };
}
let BOX_MAP = null; // 四角キャラの頂点 → 丸キャラの頂点（色は丸キャラの頂点に持ち、四角キャラはそこから写す）
const BASE_COLOR = '#eeeeee'; // まっ白な体
const hexRGB = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
function bodyShader(sh) { // 頂点の色は sRGB のまま持ち、シェーダーで直す。「発光」は塗った色で光る
  sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_COLOR\nvColor.rgb = pow(vColor.rgb, vec3(2.2));\n#endif');
  sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
}
function makeSkin() {
  const R = bodyData('round'), B = bodyData('box');
  if (!BOX_MAP) BOX_MAP = nearestMap(B.pos, R.hash);
  const colors = new Uint8Array(R.n * 3), boxCols = new Uint8Array(B.n * 3);
  const ca = { round: new THREE.BufferAttribute(colors, 3, true), box: new THREE.BufferAttribute(boxCols, 3, true) }, geo = {};
  for (const s of ['round', 'box']) { const d = bodyData(s), g = new THREE.BufferGeometry(); g.setIndex(d.index); for (const k in d.attrs) g.setAttribute(k, d.attrs[k]); g.setAttribute('color', ca[s]); geo[s] = g; }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0, metalness: 0, roughness: 0.9 }); mat.onBeforeCompile = bodyShader;
  const skin = {
    colors, ca, geo, mat,
    sync() { for (let i = 0, n = boxCols.length / 3; i < n; i++) { const j = BOX_MAP[i] * 3; boxCols[i * 3] = colors[j]; boxCols[i * 3 + 1] = colors[j + 1]; boxCols[i * 3 + 2] = colors[j + 2]; } ca.round.needsUpdate = ca.box.needsUpdate = true; },
    fill(hex) { const [r, g, b] = hexRGB(hex); for (let i = 0; i < colors.length; i += 3) { colors[i] = r; colors[i + 1] = g; colors[i + 2] = b; } skin.sync(); }
  };
  skin.fill(BASE_COLOR);
  return skin;
}
function skinCode(skin) { let s = ''; const c = skin.colors; for (let i = 0; i < c.length; i += 8192) s += String.fromCharCode.apply(null, c.subarray(i, i + 8192)); return 'v1:' + btoa(s); }
function loadSkin(skin, str) {
  if (typeof str !== 'string' || !str.startsWith('v1:')) return;
  try { const s = atob(str.slice(3)); if (s.length !== skin.colors.length) return; for (let i = 0; i < s.length; i++) skin.colors[i] = s.charCodeAt(i); skin.sync(); } catch (e) {}
}
const HIDER_BASE = 0.6; // 隠れる側の基準サイズ（鬼=1.0）
const styleOf = p => (p.role === 'hunter' && !lobbyLike(meta.state)) ? ['round', 1] : [p.shape === 'box' ? 'box' : 'round', HIDER_BASE * ([1, 1.5, 2].includes(p.size) ? p.size : 1)];
const hunterMats = {};
function hunterMat(slot) {
  const k = String(slot || 0);
  if (!hunterMats[k]) hunterMats[k] = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL((Number(k) * 0.083 + 0.02) % 1, 0.9, 0.5), roughness: 0.6 });
  return hunterMats[k];
}
const gunMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
const gunGeo = new THREE.BoxGeometry(0.09, 0.09, 0.55);
// 体の外形の目印 [骨, その骨から見た位置x,y,z, 太さ]：高さ・はば・めり込み判定に使う
const KP = [[1, 0, -0.02, 0, 0.2], [1, 0, 0.34, 0, 0.2], [1, 0, RIG.head, 0, 0.24], [0, 0, -0.07, 0, 0.17]];
for (const b of [2, 3]) KP.push([b, 0, 0, 0, 0.08], [b, 0, -RIG.armLen / 2, 0, 0.076], [b, 0, -RIG.armLen, 0, 0.075]);
for (const b of [4, 5]) KP.push([b, 0, 0, 0, 0.1], [b, 0, -RIG.legLen / 2, 0, 0.098], [b, 0, -RIG.legLen, 0, 0.095]);
const _wp = new V3(), _kp = new V3();
function makeAvatar(skin) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const bones = Array.from({ length: 6 }, () => new THREE.Bone()), [hip, waist, aL, aR, lL, lR] = bones;
  hip.add(waist, lL, lR); waist.add(aL, aR);
  aL.position.set(-RIG.shoulder[0], RIG.shoulder[1], 0); aR.position.set(RIG.shoulder[0], RIG.shoulder[1], 0);
  lL.position.set(-RIG.hipJ[0], RIG.hipJ[1], 0); lR.position.set(RIG.hipJ[0], RIG.hipJ[1], 0);
  aL.rotation.z = -RIG.armTilt; aR.rotation.z = RIG.armTilt; lL.rotation.z = -RIG.legTilt; lR.rotation.z = RIG.legTilt; // 体を作ったときの形
  const mesh = new THREE.SkinnedMesh(skin.geo.round, skin.mat); mesh.add(hip); mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones)); mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = true; mesh.userData.body = true;
  body.add(mesh);
  const gun = new THREE.Mesh(gunGeo, gunMat); gun.position.set(0.2, 0.28, -0.34); gun.visible = false; waist.add(gun);
  // 名前タグ
  const tc = document.createElement('canvas'); tc.width = 256; tc.height = 64;
  const tt = new THREE.CanvasTexture(tc); tt.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tt, transparent: true })); tag.scale.set(1.6, 0.4, 1); tag.position.y = 2.05; root.add(tag);
  const cur = ZERO.slice(); let dirty = true; // cur = いま表示している角度（目標のポーズへなめらかに近づける）
  const av = {
    root, mesh, meshes: [mesh], bones, tag, skin, shape: 'round', height: 1.7, reach: 0.3, sc: 1, lastPose: ZERO, style: '', moving: false, box: [0, 0, 0, 0, 0, 0],
    apply() {
      const g = i => rad(cur[i]);
      hip.rotation.set(-g(0), 0, g(1)); waist.rotation.set(-g(2), 0, 0);
      aL.rotation.set(g(3), 0, -g(4)); aR.rotation.set(g(5), 0, g(6)); lL.rotation.set(g(7), 0, -g(8)); lR.rotation.set(g(9), 0, g(10));
      mesh.position.y = 0; root.updateMatrixWorld(true);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9; const s = av.sc;
      for (const k of KP) { _kp.set(k[1], k[2], k[3]); bones[k[0]].localToWorld(_kp); const r = k[4] * s; x0 = Math.min(x0, _kp.x - r); x1 = Math.max(x1, _kp.x + r); y0 = Math.min(y0, _kp.y - r); y1 = Math.max(y1, _kp.y + r); z0 = Math.min(z0, _kp.z - r); z1 = Math.max(z1, _kp.z + r); }
      const wp = root.getWorldPosition(_wp);
      mesh.position.y = (wp.y - y0) / s; av.height = y1 - y0; tag.position.y = av.height + 0.35;
      av.reach = Math.max(wp.x - x0, x1 - wp.x, wp.z - z0, z1 - wp.z); av.box = [x0, wp.y, z0, x1, wp.y + av.height, z1];
      root.updateMatrixWorld(true); dirty = true;
    },
    bounds() { if (dirty) { mesh.computeBoundingSphere(); dirty = false; } }, // 弾やペイントの当たり判定の前に
    setPose(p) { p = p || ZERO; av.lastPose = p; for (let i = 0; i < 11; i++) cur[i] = Number(p[i]) || 0; av.moving = false; av.apply(); }, // すぐにそのポーズ
    animTo(p) { av.lastPose = p || ZERO; av.moving = true; }, // なめらかにそのポーズへ
    update(dt) {
      if (!av.moving) return;
      const k = 1 - Math.exp(-dt * 12), p = av.lastPose; let mx = 0;
      for (let i = 0; i < 11; i++) { const d = (Number(p[i]) || 0) - cur[i]; cur[i] += d * k; if (Math.abs(d) > mx) mx = Math.abs(d); }
      if (mx < 0.4) { for (let i = 0; i < 11; i++) cur[i] = Number(p[i]) || 0; av.moving = false; }
      av.apply();
    },
    probes(out) { // めり込み判定用の点
      let n = 0;
      for (const k of KP) { const v = out[n] || (out[n] = new V3()); v.set(k[1], k[2], k[3]); bones[k[0]].localToWorld(v); n++; }
      return n;
    },
    setTag(text) {
      const x = tc.getContext('2d'); x.clearRect(0, 0, 256, 64); x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 6; x.strokeStyle = '#000'; x.strokeText(text, 128, 32, 250); x.fillStyle = '#fff'; x.fillText(text, 128, 32, 250); tt.needsUpdate = true;
    },
    setHunter(on, slot) { mesh.material = on ? hunterMat(slot) : skin.mat; gun.visible = on; },
    setOwner(o) { mesh.userData.owner = o; },
    setStyle(shape, sc) { // 丸/四角 と 大きさ
      const key = shape + sc; if (av.style === key) return; av.style = key;
      av.shape = shape === 'box' ? 'box' : 'round'; mesh.geometry = skin.geo[av.shape];
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
const lobbyLike = st => !st || st === 'lobby' || st === 'countdown'; // みんなロビーにいる時間
// その人がいる場所：ロビーかゲームのマップか（隠れる時間のあいだ、鬼はだれもいないロビーで待つ）
// 隠れる時間は、このラウンドの役割が届いた隠れる側だけがゲームのマップへ（届くまではロビーで待つ）
const placeOf = p => lobbyLike(meta.state) || (meta.state === 'hiding' && !(p && p.rd === meta.round && p.role !== 'hunter')) ? 'lobby' : 'game';
const tp = () => placeOf(P[uid]) === 'lobby' || myRole() === 'hider'; // 三人称視点か
const canTool = () => lobbyLike(meta.state) || (myRole() === 'hider' && (meta.state === 'hiding' || meta.state === 'hunting'));
const targetMap = () => placeOf(P[uid]) === 'lobby' ? 'lobby' : (meta.cur || 'house');
let myOnH = false; // HUNTER の円に乗っているか

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
    lobbyOpen = false; curMap = ''; myOnH = false; // 入ったらすぐロビーを自由に歩ける
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
  for (const id of ['hud', 'sys', 'tools', 'pPaint', 'pPose', 'lobby', 'reveal', 'cross', 'joy', 'bJump', 'bPose', 'bFire', 'rank', 'btnRoom', 'btnMap', 'btnGo', 'wheel', 'count', 'onH']) show(id, false);
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
    e.av.setHunter(p.role === 'hunter' && !lobbyLike(meta.state), p.slot);
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
  for (const id of ids) { const d = document.createElement('div'); d.textContent = (id === meta.host ? '👑 ' : '') + P[id].name + (id === uid ? '（あなた）' : '') + (P[id].onH ? '　🔴 HUNTER' : ''); list.append(d); }
  const host = meta.host === uid;
  const act = document.activeElement;
  const setv = (id, v) => { const el = $(id); if (el !== act && v != null) el.value = v; el.disabled = !host; };
  setv('sMode', meta.mode); setv('sHunters', meta.hunters); setv('sHide', meta.hideTime); setv('sHunt', meta.huntTime); setv('sAmmo', meta.ammo); setv('sWhistle', meta.whistle == null ? 60 : meta.whistle);
  setMapCard($('mapCard'), meta.map || 'random'); $('mapCard').disabled = !host;
  $('btnStart').disabled = !host || ids.length < 2 || meta.state === 'countdown';
  $('btnStart').textContent = host ? (ids.length < 2 ? '2人以上で開始できます' : meta.state === 'countdown' ? 'カウントダウン中…' : 'ゲーム開始（10秒カウント）') : 'ホストの開始を待っています…';
  $('lNote').textContent = `${ids.length} / ${MAXP} 人　` + (meta.mode === 'basic' ? 'ベーシック：隠れる側どうしは互いの位置が見えます' : '増え鬼：隠れる側は他の人の隠れ場所が見えません');
}
function refreshUI() {
  if (!inRoom) return;
  const st = meta.state, role = myRole(), playing = st === 'hiding' || st === 'hunting', tool = canTool();
  if (!tool && panel) { panel = ''; show('pPaint', false); show('pPose', false); }
  show('lobby', lobbyLike(st) && lobbyOpen); show('btnRoom', lobbyLike(st)); show('reveal', st === 'reveal');
  show('btnGo', !meta.practice && meta.host === uid && lobbyLike(st)); $('btnGo').textContent = st === 'countdown' ? '■ 開始をやめる' : '▶ ゲーム開始'; $('btnGo').classList.toggle('stop', st === 'countdown');
  show('count', st === 'countdown');
  show('tools', tool); show('tDecoy', playing); show('tDecoyX', playing);
  show('cross', role === 'hunter' && st === 'hunting');
  const walk = !!st && !(lobbyLike(st) && lobbyOpen) && !panel;
  show('joy', isTouch && walk); show('bJump', walk); show('bPose', walk && tool); // ジャンプ・ポーズのボタンはPCでも表示
  if (!tool || !walk) closeWheel();
  show('bFire', isTouch && role === 'hunter' && st === 'hunting');
  show('rank', st === 'hunting' && !meta.practice);
  $('btnLobby').classList.toggle('hide', meta.host !== uid);
  if (lobbyLike(st)) { renderLobby(); if (lobbyOpen && document.pointerLockElement) document.exitPointerLock(); }
}
let mapRound = -1, spawnedAs = '';
function syncMap() { // 自分がいるべきマップへ移る
  const t = targetMap();
  if (t !== 'lobby' && !lobbyLike(meta.state) && mapRound !== meta.round) { mapRound = meta.round; if (curMap === t) curMap = ''; } // 新しいラウンドは置き直す
  if (!loadMap(t)) { // 同じマップのまま役割がわかったら、役割の場所へ置き直す
    const k = t === 'lobby' ? 'lobby' : myRole() === 'hider' ? 'hider' : 'hunter';
    if (k !== spawnedAs && t !== 'lobby' && P[uid] && P[uid].rd === meta.round) { spawnAt(k); spawnedAs = k; }
    return false;
  }
  spawnedAs = t === 'lobby' ? 'lobby' : myRole() === 'hider' ? 'hider' : 'hunter'; spawnAt(spawnedAs);
  if (t !== 'lobby') { me.camYaw = Math.random() * 6.28; me.camPitch = -0.25; }
  return true;
}
function checkRound() {
  const p = P[uid];
  if (!p || !meta.round || lobbyLike(meta.state) || meta.round === lastRound || p.rd !== meta.round) return;
  lastRound = meta.round; clearSplats(); knownFound.clear(); me.ammo = meta.ammo; me.vy = 0; myOnH = false;
  myScore = 0; sentScore = 0; lastWh = 0; rankSnap = null; rankAt = 0;
  syncMap();
  const mn = (MAPS[meta.cur] || MAPS.house).name;
  if (p.role === 'hunter') toast(meta.state === 'hiding' ? `あなたは鬼（ハンター）！ カメレオンが【${mn}】に隠れるまで、ロビーで待ってね` : `【${mn}】あなたは鬼（ハンター）！`, 4000);
  else toast(`【${mn}】あなたはカメレオン！体を塗って隠れよう`, 3500);
}
function onMeta() {
  if (!inRoom) return;
  const st = meta.state;
  syncMap();
  if (st !== lastState) {
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
  syncEnts(); checkRound(); syncMap();
  if (meta.state === 'reveal') buildReveal();
  refreshUI();
}

/* ---------------- ホスト処理 ---------------- */
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function beginCountdown() { // ゲーム開始ボタン：10秒数えてから鬼と隠れる側に分かれる
  if (meta.host !== uid) return;
  if (Object.keys(P).length < 2) { toast('2人以上必要です'); return; }
  lobbyOpen = false; net.update(base + '/meta', { state: 'countdown', end: net.now() + 10000 }); refreshUI();
}
function startGame() {
  const ids = Object.keys(P);
  if (!practice && ids.length < 2) { toast('2人以上必要です'); return; }
  // HUNTER の円に乗っている人から鬼を選ぶ（多ければその中からランダム、だれもいなければ全員からランダム）
  const n = practice ? 0 : Math.min(Number(meta.hunters) || 1, ids.length - 1);
  const want = shuffle(ids.filter(id => P[id].onH)), rest = shuffle(ids.filter(id => !P[id].onH));
  const hs = new Set(want.slice(0, n).concat(rest.slice(0, Math.max(0, n - want.length))));
  const round = (meta.round || 0) + 1, u = {};
  ids.forEach(id => {
    const role = hs.has(id) ? 'hunter' : 'hider';
    Object.assign(u, { [`players/${id}/role`]: role, [`players/${id}/orig`]: role, [`players/${id}/found`]: null, [`players/${id}/last`]: null, [`players/${id}/ammo`]: meta.ammo, [`players/${id}/rd`]: round, [`players/${id}/score`]: null, [`players/${id}/onH`]: null });
  });
  u.decoys = null; u.shots = null;
  net.update(base, u); // 先に役割を配ってから、ゲームの状態を変える（届く順番で一瞬ちがうマップへ行かないように）
  const v = {};
  v['meta/cur'] = (MAPS[meta.map] && meta.map !== 'lobby') ? meta.map : MAP_LIST[Math.floor(Math.random() * MAP_LIST.length)][0];
  v['meta/hs'] = practice ? net.now() : null;
  v['meta/state'] = practice ? 'hunting' : 'hiding';
  v['meta/end'] = net.now() + (practice ? 864e5 : meta.hideTime * 1000);
  v['meta/round'] = round; v['meta/winner'] = null;
  net.update(base, v);
}
let startedFor = 0;
function hostLoop() {
  if (!inRoom || !meta.state) return;
  const ids = Object.keys(P); if (!ids.length) return;
  if (!P[meta.host]) { ids.sort(); if (ids[0] === uid) net.update(base + '/meta', { host: uid }); return; }
  if (meta.host !== uid || meta.practice) return;
  const now = net.now();
  if (meta.state === 'countdown') { // 0 になってから少し待って（みんなの「円に乗っている」が届くのを待つ）決める
    if (ids.length < 2) net.update(base + '/meta', { state: 'lobby' });
    else if (now >= meta.end + 400 && startedFor !== meta.end) { startedFor = meta.end; startGame(); }
  } else if (meta.state === 'hiding' && now >= meta.end) net.update(base + '/meta', { state: 'hunting', end: now + meta.huntTime * 1000, hs: now });
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
function uploadSkin() { if (inRoom) net.set(`${base}/skins/${uid}`, skinCode(mySkin)); }
const queueSkin = () => { clearTimeout(skinT); skinT = setTimeout(uploadSkin, 500); };
const queueMat = () => { clearTimeout(matT); matT = setTimeout(() => inRoom && net.set(`${base}/players/${uid}/mat`, matArr()), 300); };
const queuePose = () => { clearTimeout(poseT); poseT = setTimeout(() => inRoom && net.set(`${base}/players/${uid}/pose`, me.pose.slice()), 200); };
let lastPaint = null;
const _pa = new V3(), _pb = new V3(), _pc = new V3(), _bc = new V3(), _lp = new V3();
function paintHit(h, start) { // 体の表面に直接塗る（ポーズを変えても塗った場所はそのまま）
  const av = ents[uid] && ents[uid].av; if (!av || !h || !h.face) return;
  const m = av.mesh, f = h.face, P = bodyData(av.shape).pos, R = bodyData('round');
  m.getVertexPosition(f.a, _pa); m.getVertexPosition(f.b, _pb); m.getVertexPosition(f.c, _pc); m.worldToLocal(_lp.copy(h.point));
  if (!THREE.Triangle.getBarycoord(_lp, _pa, _pb, _pc, _bc)) return;
  let x = P[f.a * 3] * _bc.x + P[f.b * 3] * _bc.y + P[f.c * 3] * _bc.z, y = P[f.a * 3 + 1] * _bc.x + P[f.b * 3 + 1] * _bc.y + P[f.c * 3 + 1] * _bc.z, z = P[f.a * 3 + 2] * _bc.x + P[f.b * 3 + 2] * _bc.y + P[f.c * 3 + 2] * _bc.z;
  if (av.shape === 'box') { const v = nearestVert(R.hash, x, y, z); if (v >= 0) { x = R.pos[v * 3]; y = R.pos[v * 3 + 1]; z = R.pos[v * 3 + 2]; } }
  const r = Math.max(0.008, brush.size * 0.0065), rgb = hexRGB(brush.color), C = mySkin.colors;
  const dot = (cx, cy, cz) => {
    let hit = false; near(R.hash, cx, cy, cz, r, v => { C[v * 3] = rgb[0]; C[v * 3 + 1] = rgb[1]; C[v * 3 + 2] = rgb[2]; hit = true; });
    if (!hit) { const v = nearestVert(R.hash, cx, cy, cz); if (v >= 0) { C[v * 3] = rgb[0]; C[v * 3 + 1] = rgb[1]; C[v * 3 + 2] = rgb[2]; } }
  };
  const lp = lastPaint, L = lp ? Math.hypot(x - lp[0], y - lp[1], z - lp[2]) : 0;
  if (!start && lp && L < 0.3) { const n = Math.max(1, Math.ceil(L / (r * 0.5))); for (let i = 1; i <= n; i++) dot(lp[0] + (x - lp[0]) * i / n, lp[1] + (y - lp[1]) * i / n, lp[2] + (z - lp[2]) * i / n); }
  else dot(x, y, z);
  lastPaint = [x, y, z]; mySkin.sync();
}
function fillSkin(color) { mySkin.fill(color); queueSkin(); }
const swatches = [];
function setBrush(color, remember) {
  brush.color = color; $('bcolor').value = color;
  if (remember && !swatches.includes(color)) {
    swatches.unshift(color); if (swatches.length > 10) swatches.pop();
    const box = $('swatches'); box.textContent = '';
    for (const c of swatches) { const i = document.createElement('i'); i.style.background = c; i.onclick = () => setBrush(c, false); box.append(i); }
  }
}
const hex = (a, i) => '#' + [a[i], a[i + 1], a[i + 2]].map(n => n.toString(16).padStart(2, '0')).join('');
function pickColor(h) {
  const m = h.object, map = m.material.map;
  if (m.userData.body && h.face) { // 塗った体：当たった場所にいちばん近い頂点の色
    const f = h.face; let best = f.a, bd = 1e9;
    for (const v of [f.a, f.b, f.c]) { m.getVertexPosition(v, _pa); m.localToWorld(_pa); const d = _pa.distanceToSquared(h.point); if (d < bd) { bd = d; best = v; } }
    return hex(m.geometry.attributes.color.array, best * 3);
  }
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
  if (e) { const own = ents[uid] ? (ents[uid].av.bounds(), ents[uid].av.meshes) : []; return castPtr(e, worldMeshes.concat(own)); }
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
function hitAvs() { // 撃てる相手（まだ見つかっていない隠れる人と分身）
  const l = [];
  for (const id in ents) { const p = P[id]; if (id !== uid && p && p.role === 'hider' && !p.found && ents[id].av.root.visible) l.push(ents[id].av); }
  for (const d of decoyAvs) if (d.root.visible) l.push(d);
  for (const a of l) a.bounds();
  return l;
}
const _gp = [];
function graze(o, d, far, avs) { // 弾が体のすぐそばを通っただけでも当たり（かすってもワンパン）
  let best = null, bt = far;
  for (const av of avs) {
    const n = av.probes(_gp);
    for (let i = 0; i < n; i++) {
      const c = _gp[i], r = KP[i][4] * av.sc + 0.05, ox = c.x - o.x, oy = c.y - o.y, oz = c.z - o.z, t = ox * d.x + oy * d.y + oz * d.z;
      if (t < 0 || t > bt) continue;
      if (ox * ox + oy * oy + oz * oz - t * t < r * r) { bt = t; best = av; }
    }
  }
  return best;
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
  const avs = mine ? hitAvs() : [], targets = mine ? hardMeshes.concat(...avs.map(a => a.meshes)) : hardMeshes; // 葉っぱは弾がすり抜ける
  const color = hunterMat(P[by] && P[by].slot).color; const done = new Set();
  scene.updateMatrixWorld();
  for (let i = 0; i < 8; i++) {
    const a = r() * 6.283, s = i === 0 ? 0 : Math.sqrt(r()) * 0.022; // 弾の広がりは小さめ（ねらったところに当たる）
    const pd = dir.clone().addScaledVector(rx, Math.cos(a) * s).addScaledVector(ry, Math.sin(a) * s).normalize();
    ray.set(origin, pd); ray.near = 0; ray.far = 80;
    const h = ray.intersectObjects(targets, false)[0];
    let ow = h && h.object.userData.owner;
    if (!ow && mine) { const g = graze(origin, pd, h ? h.distance : 80, avs); if (g) ow = g.mesh.userData.owner; }
    if (!ow) { if (h) addSplat(h, color); continue; }
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
  if (e.pointerType === 'mouse' && !panel && !(lobbyLike(meta.state) && lobbyOpen)) { if (cv.requestPointerLock) cv.requestPointerLock(); return; }
  if (panel === 'paint' && ents[uid]) {
    { ents[uid].av.bounds(); const h = castPtr(e, ents[uid].av.meshes); if (h && h.face) { paintId = e.pointerId; paintHit(h, true); try { cv.setPointerCapture(e.pointerId); } catch (_) {} return; } }
  }
  if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (_) {} }
});
cv.addEventListener('pointermove', e => {
  if (pts.has(e.pointerId)) { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinchD && pts.size >= 2) { const d = pinchDist(); if (d > 0) { setZoom(paintZoom * d / pinchD); pinchD = d; } return; } }
  if (document.pointerLockElement === cv) { look(e.movementX || 0, e.movementY || 0, 1); return; }
  if (e.pointerId === paintId) { const h = ents[uid] && castPtr(e, ents[uid].av.meshes); if (h && h.face) paintHit(h); return; }
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
  const frozen = !st || (lobbyLike(st) && lobbyOpen);
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  let iy = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + joy.y;
  if (frozen) ix = iy = 0;
  const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
  const sy = Math.sin(me.camYaw), cy = Math.cos(me.camYaw), sp = role === 'hunter' && !lobbyLike(st) ? 6.2 : 5.2; // マップが広いので少し速め
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
  hunterSpot();
}
function hunterSpot() { // ロビーの HUNTER の円に乗っているか（体の中心が円の中で、床に立っている時だけ）
  let on = false;
  const H = MAPINFO.hunter;
  if (H && curMap === 'lobby' && lobbyLike(meta.state) && !meta.practice) {
    if (meta.state === 'countdown' && net.now() >= meta.end) on = myOnH; // 0 になった瞬間で決まり
    else on = Math.hypot(me.pos.x - H[0], me.pos.z - H[1]) <= H[2] && me.pos.y < 0.6;
  }
  if (on !== myOnH) { myOnH = on; if (inRoom) net.set(`${base}/players/${uid}/onH`, on || null); }
  show('onH', on);
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
  const hunting = myRole() === 'hunter' && (meta.state === 'hunting' || meta.state === 'hiding') && !tp();
  fpGun.visible = hunting; if (hunting) fpGun.children[2].material = hunterMat(me.slot);
}
function updateEnts(dt) {
  const st = meta.state, role = myRole(), seeH = st === 'reveal' || role !== 'hider' || meta.mode === 'basic', here = placeOf(P[uid]);
  const k = Math.min(1, dt * 10);
  for (const id in ents) {
    const e = ents[id], p = P[id]; if (!p) continue;
    let vis;
    if (!st || placeOf(p) !== here) vis = false; // 別の場所（ロビーとゲームのマップ）にいる人は見えない
    else if (lobbyLike(st)) vis = true;
    else if (p.role === 'spectator') vis = false;
    else if (id === uid) vis = tp();
    else if (p.role === 'hunter') vis = true;
    else vis = seeH;
    e.av.root.visible = vis;
    e.av.tag.visible = id !== uid && (lobbyLike(st) || st === 'reveal' || p.role === 'hunter' || role !== 'hunter');
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
  for (const d of decoyAvs) d.root.visible = here === 'game' && (st === 'reveal' || ((st === 'hiding' || st === 'hunting') && (seeH || d.owner === uid)));
}

let hudT = 0, posT = 0, lastPos = '';
function updateHud(now) {
  if (now < hudT) return; hudT = now + 250;
  const st = meta.state, role = myRole();
  const left = Math.max(0, Math.ceil(((meta.end || 0) - net.now()) / 1000));
  $('hRole').textContent = lobbyLike(st) ? '🛋 ロビー' : role === 'hunter' ? (st === 'hiding' ? '🔫 鬼（ロビーで待機）' : '🔫 鬼') : role === 'hider' ? '🦎 カメレオン' : '👀 観戦';
  $('hTimer').textContent = meta.practice ? '練習' : st === 'countdown' ? `開始 ${left}` : st === 'hiding' ? `隠れ ${left}` : st === 'hunting' ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : st === 'reveal' ? '結果' : '--';
  const alive = Object.values(P).filter(p => p.orig === 'hider' && !p.found).length;
  const dc = DEC[uid] ? [0, 1].filter(i => DEC[uid][i]).length : 0;
  const nOn = Object.values(P).filter(p => p.onH).length;
  $('hInfo').textContent = lobbyLike(st) ? `${Object.keys(P).length}人｜HUNTER ${nOn}人` + (meta.host === uid || st === 'countdown' ? '' : '｜ホストの開始待ち') : role === 'hunter' ? `弾 ${me.ammo}｜残り ${alive}人` : `残り ${alive}人｜分身 ${dc}/2`;
  if (st === 'countdown') { $('countN').textContent = left; $('countS').textContent = nOn ? `HUNTER の円に ${nOn}人（この中から鬼を選びます）` : 'HUNTER の円に乗ると鬼になれる（だれもいなければ全員からランダム）'; }
  const sh = $('shells'), n = (role === 'hunter' && st === 'hunting') ? Math.min(me.ammo, 16) : -1;
  if (sh.dataset.n !== String(n)) { sh.dataset.n = n; sh.innerHTML = n > 0 ? '<i></i>'.repeat(n) : ''; }
}
/* ---------------- 見逃しランキング・笛 ---------------- */
const WH_RANGE = 34; // 笛が聞こえる距離（m）
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
      const dist = _d.length(); if (dist > 50 || dist < 0.01) continue; _d.multiplyScalar(1 / dist);
      const pt = t[4] || 0, cp = Math.cos(pt);
      if (_d.x * (-Math.sin(t[3]) * cp) + _d.y * Math.sin(pt) + _d.z * (-Math.cos(t[3]) * cp) < 0.8) continue;
      ray.set(_e, _d); ray.near = 0; ray.far = Math.max(0.1, dist - 0.45);
      if (ray.intersectObjects(worldMeshes, false).length) continue; // 壁や家具の陰は対象外
      gain = Math.max(gain, 5 + 15 * (1 - dist / 50));
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
    if (now > posT && (lobbyLike(meta.state) || myRole() !== 'spectator')) {
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
    const sk = makeSkin(); sk.fill('#f2f2f2'); sk.mat.roughness = 0.55;
    icon.av = makeAvatar(sk); icon.av.tag.visible = false; s.add(icon.av.root);
    icon.scene = s; icon.cam = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  }
  const av = icon.av, out = {}, c = new V3(), dir = new V3(0.55, 0.32, -1).normalize();
  av.setStyle(shape, 1);
  for (const name of WHEEL_IN.concat(WHEEL_OUT)) {
    const p = name === '⚙' ? null : poseArr(name); if (!p) continue;
    av.setPose(p); const b = av.box; c.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2); const r = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) / 2;
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
$('btnStart').onclick = () => beginCountdown();
$('btnGo').onclick = () => { if (meta.host !== uid) return; if (meta.state === 'countdown') net.update(base + '/meta', { state: 'lobby' }); else beginCountdown(); };
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
