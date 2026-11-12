// ぬりかくれ！ - ペイントかくれんぼ (Three.js + Firebase Realtime Database)
import * as THREE from 'three';
import { firebaseConfig } from './firebase-config.js';
import { MAPS, MAP_LIST } from './maps.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = id => document.getElementById(id);
const V3 = THREE.Vector3;
const rad = d => d * Math.PI / 180;
const MAXP = 12;
const ZERO = new Array(11).fill(0);
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const configured = !!firebaseConfig.apiKey && !/^YOUR/.test(firebaseConfig.apiKey);

/* ---------------- 設定 ---------------- */
const settings = { lite: false, sens: 1, bgm: 0.3, se: 0.6 };
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
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); }
}
function applyGfx() {
  const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(settings.lite ? Math.min(dpr, 1) * 0.8 : Math.min(dpr, 2.5));
  sun.castShadow = !settings.lite; resize();
}
addEventListener('resize', resize); applyGfx();
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
const worldMeshes = []; const colliders = [];
function patternTex(kind, c1, c2, rx, ry) {
  if (kind.startsWith('img:')) { // 写真テクスチャ（読み込み後に色味を重ねる）。スポイトで吸えるようキャンバスに描く
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = c1; x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
    const im = new Image();
    im.onload = () => { x.drawImage(im, 0, 0, 256, 256); x.globalAlpha = c2 || 0.38; x.fillStyle = c1; x.fillRect(0, 0, 256, 256); x.globalAlpha = 1; t.needsUpdate = true; };
    im.src = './tex/' + kind.slice(4) + '_c.jpg';
    return { t, c };
  }
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d', { willReadFrequently: true });
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
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
  return { t, c };
}
function addBox(x, y, z, w, h, d, color, opt = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: opt.pat ? 0xffffff : color, roughness: opt.rough == null ? 0.88 : opt.rough, metalness: 0 });
  const rr = (opt.flat || opt.pat || opt.sharp) ? 0 : Math.min(opt.r || 0.1, Math.min(w, h, d) * 0.45); // 角を丸める
  const m = new THREE.Mesh(rr > 0.012 ? new RoundedBoxGeometry(w, h, d, 3, rr) : new THREE.BoxGeometry(w, h, d), mat);
  if (opt.glow) { mat.emissive.set(color); mat.emissiveIntensity = opt.glow === true ? 1.6 : opt.glow; }
  if (opt.pat) { const p = patternTex(opt.pat[0], opt.pat[1], opt.pat[2], opt.pat[3], opt.pat[4]); mat.map = p.t; m.userData.pc = p.c; }
  m.position.set(x, y + h / 2, z); m.castShadow = !opt.flat; m.receiveShadow = true;
  scene.add(m); worldMeshes.push(m);
  if (!opt.nocol) colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: y, y1: y + h });
}
function addCyl(x, y, z, r, h, color, opt = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(opt.rt == null ? r : opt.rt, r, h, opt.seg || 24), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  if (opt.glow) { m.material.emissive.set(color); m.material.emissiveIntensity = opt.glow; }
  m.position.set(x, y + h / 2, z); m.castShadow = !opt.flat; m.receiveShadow = true; scene.add(m); worldMeshes.push(m);
  if (!opt.nocol) colliders.push({ x0: x - r * 0.8, x1: x + r * 0.8, z0: z - r * 0.8, z1: z + r * 0.8, y0: y, y1: y + h });
}
function addBall(x, y, z, r, color, opt = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = !opt.glow; scene.add(m); worldMeshes.push(m);
  if (opt.glow) { // 光るランタン
    m.material.emissive.set(color); m.material.emissiveIntensity = 2.6 * opt.glow;
    if (!opt.nolight && !settings.lite && lampCount < 10) { lampCount++; const k = MAPINFO.dark || 1, L = new THREE.PointLight(0xffc27a, 14 + 60 * (1 - k), 16, 2); L.position.set(x, y, z); scene.add(L); extras.push(L); }
  }
  if (opt.col) colliders.push({ x0: x - r * 0.75, x1: x + r * 0.75, z0: z - r * 0.75, z1: z + r * 0.75, y0: y - r, y1: y + r * 0.8 });
}
// 山形の物は「段々の当たり判定」で中に入り込めないようにする
function stepCol(x, y, z, levels) { for (const [hx, hz, y0, y1] of levels) colliders.push({ x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, y0: y + y0, y1: y + y1 }); }
function addCone(x, y, z, r, h, color, opt = {}) {
  const seg = opt.seg || 22, rt = opt.rt || 0;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, r, h, seg), new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: seg <= 9 }));
  m.position.set(x, y + h / 2, z); if (seg === 4) m.rotation.y = Math.PI / 4; m.castShadow = m.receiveShadow = true; scene.add(m); worldMeshes.push(m);
  if (opt.nocol) return;
  const k = seg === 4 ? 0.69 : 0.93, L = [];
  for (let i = 0; i < 4; i++) { const e = (r - (r - rt) * i / 4) * k * (i ? 0.85 : 1); L.push([e, e, h * i / 4, h * (i + 1) / 4]); }
  stepCol(x, y, z, L);
}
function addDome(x, y, z, rx, ry, rz, color, opt = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  m.scale.set(rx, ry, rz); m.position.set(x, y, z); if (opt.rot) m.rotation.y = -opt.rot; m.castShadow = !opt.sky; m.receiveShadow = !opt.sky; scene.add(m);
  if (opt.sky) { m.material.fog = false; extras.push(m); return; } // 空の雲はスポイト・当たり判定の対象外
  worldMeshes.push(m);
  if (!opt.nocol) stepCol(x, y, z, [[rx * 0.93, rz * 0.93, 0, ry * 0.36], [rx * 0.7, rz * 0.7, ry * 0.36, ry * 0.7], [rx * 0.5, rz * 0.5, ry * 0.7, ry * 0.96]]);
}
function addTire(x, y, z, r) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, r * 0.3, 10, 22), new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.8 }));
  m.rotation.x = Math.PI / 2; m.position.set(x, y + r * 0.3, z); m.castShadow = m.receiveShadow = true; scene.add(m); worldMeshes.push(m);
}
function addWheel(x, y, z, r, w, axis) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8 }));
  if (axis === 'x') m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z); m.castShadow = true; scene.add(m); worldMeshes.push(m);
}
let curMap = '', MAPINFO = MAPS.lobby, spots = [], extras = [], lampCount = 0, envReady = false;
function applyLight() {
  const k = MAPINFO.dark || 1;
  hemi.intensity = (envReady ? 0.35 : 0.75) * k; sun.intensity = (envReady ? 0.8 : 1.0) * k; scene.environmentIntensity = k;
  sun.color.set(MAPINFO.night ? 0x9db4ff : 0xffffff); renderer.toneMappingExposure = MAPINFO.night ? 1.25 : 1.08;
}
function isFree(x, z, r) {
  for (const c of colliders) { if (c.y1 <= 0.4 || c.y0 >= 1.8) continue; if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return false; }
  return true;
}
function loadMap(name) {
  if (!MAPS[name]) name = 'house';
  if (name === curMap) return false;
  curMap = name; MAPINFO = MAPS[name];
  for (const m of worldMeshes) { scene.remove(m); m.geometry.dispose(); if (m.material.map) m.material.map.dispose(); m.material.dispose(); }
  worldMeshes.length = 0; colliders.length = 0; clearSplats();
  for (const o of extras) { scene.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }
  extras = []; lampCount = 0;
  const M = MAPINFO, hx = M.hx, hz = M.hz;
  const h = {
    B: addBox, cyl: addCyl, ball: addBall, cone: addCone, dome: addDome, tire: addTire, wheel: addWheel, rnd: rng(name.length * 977 + name.charCodeAt(0) * 31),
    F: (x, z, w, d, color, pat, lift) => addBox(x, lift ? 0 : -0.2, z, w, lift ? 0.02 : 0.2, d, color, { nocol: true, flat: true,
      pat: pat || (M.floorTex && !lift ? ['img:' + M.floorTex, color, 0.38, w / 5, d / 5] : ['noise', color, 0, w / 4, d / 4]), rough: pat && (pat[0] === 'checker' || pat[0] === 'img:tile') ? 0.28 : (pat ? 0.5 : 0.9) }),
    outer: (ht, color) => { // 抜けられない厚い外壁
      const px = { pat: ['panel', color, 0, (2 * hx + 6) / 3, ht / 3] }, pz = { pat: ['panel', color, 0, 2 * hz / 3, ht / 3] };
      addBox(0, 0, -hz - 1.5, 2 * hx + 6, ht, 3, color, px); addBox(0, 0, hz + 1.5, 2 * hx + 6, ht, 3, color, px);
      addBox(-hx - 1.5, 0, 0, 3, ht, 2 * hz, color, pz); addBox(hx + 1.5, 0, 0, 3, ht, 2 * hz, color, pz);
    }
  };
  M.build(h);
  scene.background.set(M.sky); scene.fog = new THREE.Fog(M.sky, 60, 170); applyLight();
  if (M.night) { // 星空
    const n = 700, a = new Float32Array(n * 3), r = rng(99);
    for (let i = 0; i < n; i++) { const th = r() * 6.283, ph = Math.acos(r() * 0.95), R = 140; a[i * 3] = Math.sin(ph) * Math.cos(th) * R; a[i * 3 + 1] = Math.cos(ph) * R; a[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * R; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, fog: false })); scene.add(st); extras.push(st);
  }
  const c = sun.shadow.camera, e = Math.max(hx, hz) + 8; c.left = -e; c.right = e; c.top = e; c.bottom = -e; c.far = 120; c.updateProjectionMatrix();
  sun.position.set(hx * 0.35, 46, hz * 0.3);
  spots = [];
  for (let x = -hx + 2; x <= hx - 2; x += 2.5) for (let z = -hz + 2; z <= hz - 2; z += 2.5) if (isFree(x, z, 0.8)) spots.push([x, z]);
  return true;
}
function spawnAt(kind) { // 'hider' は鬼の出発点から離れた場所に、席番号ごとに別々の場所へ
  const hs = MAPINFO.spawn; let best = null, bd = 1e9;
  for (const s of spots) { const d = (s[0] - hs[0]) ** 2 + (s[1] - hs[1]) ** 2; if (d < bd) { bd = d; best = s; } }
  best = best || hs; me.vy = 0;
  const n = Number(me.slot) || 0;
  if (kind !== 'hider') { me.pos.set(best[0] + (n % 3 - 1) * 0.8, 0, best[1] + (Math.floor(n / 3) % 3 - 1) * 0.8); return; }
  const far = spots.filter(s => (s[0] - best[0]) ** 2 + (s[1] - best[1]) ** 2 > 144), l = (far.length >= 12 ? far : spots).slice();
  const r = rng((meta.round || 1) * 7919 + curMap.length);
  for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = l[i]; l[i] = l[j]; l[j] = t; }
  const s = l[n % l.length] || best; me.pos.set(s[0], 0, s[1]);
}

/* ---------------- アバター ---------------- */
const ATW = 512, ATH = 256, TILE = 128;
function partGeo(geo, col, row) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / 4, ((1 - row) + uv.getY(i)) / 2);
  return geo;
}
function boxGeo(w, h, d, col, row) { // 四角キャラ用：側面4枚を横一列、上下面を下段に並べたUV
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, strip = [1, 3, -1, -1, 0, 2]; // px,nx,py,ny,pz,nz
  for (let f = 0; f < 6; f++) for (let i = f * 4; i < f * 4 + 4; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    if (f === 2) uv.setXY(i, u * 0.25, v * 0.25); else if (f === 3) uv.setXY(i, 0.25 + u * 0.25, v * 0.25);
    else uv.setXY(i, (strip[f] + u) / 4, 0.25 + v * 0.75);
  }
  return partGeo(g, col, row);
}
const PARTS = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];
const GEOS = {
  round: {
    head: partGeo(new THREE.SphereGeometry(0.2, 28, 20), 0, 0),
    torso: partGeo(new THREE.CapsuleGeometry(0.2, 0.24, 8, 24).scale(1, 1, 0.68), 1, 0),
    armL: partGeo(new THREE.CapsuleGeometry(0.07, 0.42, 6, 16), 2, 0),
    armR: partGeo(new THREE.CapsuleGeometry(0.07, 0.42, 6, 16), 3, 0),
    legL: partGeo(new THREE.CapsuleGeometry(0.095, 0.56, 6, 16), 0, 1),
    legR: partGeo(new THREE.CapsuleGeometry(0.095, 0.56, 6, 16), 1, 1)
  },
  box: {
    head: boxGeo(0.36, 0.36, 0.36, 0, 0), torso: boxGeo(0.44, 0.62, 0.26, 1, 0),
    armL: boxGeo(0.14, 0.56, 0.14, 2, 0), armR: boxGeo(0.14, 0.56, 0.14, 3, 0),
    legL: boxGeo(0.19, 0.75, 0.19, 0, 1), legR: boxGeo(0.19, 0.75, 0.19, 1, 1)
  },
  gun: new THREE.BoxGeometry(0.09, 0.09, 0.55)
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
const _box = new THREE.Box3();
function makeAvatar(skin) {
  const root = new THREE.Group(), body = new THREE.Group(), hip = new THREE.Group(), waist = new THREE.Group();
  root.add(body); body.add(hip); hip.add(waist);
  const meshes = [];
  const part = (geo, parent, x, y, z, half) => { const m = new THREE.Mesh(geo, skin.mat); m.userData.half = half; m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); meshes.push(m); return m; };
  const pivot = (parent, x, y) => { const g = new THREE.Group(); g.position.set(x, y, 0); parent.add(g); return g; };
  part(GEOS.round.torso, waist, 0, 0.3, 0, 0.3); part(GEOS.round.head, waist, 0, 0.84, 0, 0.12);
  const aL = pivot(waist, -0.3, 0.56), aR = pivot(waist, 0.3, 0.56), lL = pivot(hip, -0.12, 0), lR = pivot(hip, 0.12, 0);
  part(GEOS.round.armL, aL, 0, -0.28, 0, 0.26); part(GEOS.round.armR, aR, 0, -0.28, 0, 0.26);
  part(GEOS.round.legL, lL, 0, -0.375, 0, 0.35); part(GEOS.round.legR, lR, 0, -0.375, 0, 0.35);
  const gun = new THREE.Mesh(GEOS.gun, gunMat); gun.position.set(0.22, 0.38, -0.35); gun.visible = false; waist.add(gun);
  // 名前タグ
  const tc = document.createElement('canvas'); tc.width = 256; tc.height = 64;
  const tt = new THREE.CanvasTexture(tc); tt.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tt, transparent: true })); tag.scale.set(1.6, 0.4, 1); tag.position.y = 2.05; root.add(tag);
  const av = {
    root, meshes, tag, skin, height: 1.7, sc: 1, lastPose: ZERO, style: 'round1',
    setPose(p) {
      p = p || ZERO; av.lastPose = p; const g = i => rad(Number(p[i]) || 0);
      hip.rotation.set(-g(0), 0, g(1)); waist.rotation.x = -g(2);
      aL.rotation.set(g(3), 0, -g(4)); aR.rotation.set(g(5), 0, g(6));
      lL.rotation.set(g(7), 0, -g(8)); lR.rotation.set(g(9), 0, g(10));
      hip.position.y = 0; root.updateMatrixWorld(true);
      _box.makeEmpty(); for (const m of meshes) _box.expandByObject(m, true);
      const wy = root.getWorldPosition(new V3()).y;
      hip.position.y = (wy - _box.min.y) / av.sc; av.height = _box.max.y - _box.min.y; tag.position.y = av.height + 0.35;
    },
    probes(out) { // 体の各パーツの両端（めり込み判定用）
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
      const G = GEOS[shape] || GEOS.round; meshes.forEach((m, i) => { m.geometry = G[PARTS[i]]; });
      body.scale.setScalar(sc); av.sc = sc; av.setPose(av.lastPose);
    }
  };
  av.setPose(ZERO);
  return av;
}

/* ---------------- 状態 ---------------- */
let net = null, fbNet = null, uid = null, myName = '', roomId = '', base = '', inRoom = false, practice = false;
let meta = {}, P = {}, POS = {}, DEC = {}, SKINS = {};
const ents = {}; let decoyAvs = [], ghosts = [], splats = [], unsubs = [];
const mySkin = makeSkin();
const me = { pos: new V3(0, 0, 0), vy: 0, yaw: 0, camYaw: 0, camPitch: -0.25, ground: true, dist: 3.2, pose: ZERO.slice(), ammo: 0, slot: '0' };
let lastRound = -1, lastState = '', panel = '', eyedrop = false;
let lobbyOpen = false, myScore = 0, sentScore = 0, lastWh = 0, rankSnap = null, rankAt = 0;
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
  panel = p; eyedrop = false; $('bDrop').classList.remove('on'); $('bDrop').style.background = '';
  show('pPaint', p === 'paint'); show('pPose', p === 'pose');
  $('tPaint').classList.toggle('on', p === 'paint'); $('tPose').classList.toggle('on', p === 'pose');
  if (p && document.pointerLockElement) document.exitPointerLock();
  refreshUI();
}

/* ---------------- ルーム参加・退出 ---------------- */
const META0 = () => ({ host: uid, state: 'lobby', mode: 'fueoni', hunters: 1, hideTime: 60, huntTime: 180, ammo: 8, end: 0, round: 0, map: 'random', cur: 'house', whistle: 60 });
async function joinRoom(id, isPractice) {
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
    if (practice) { await net.update(base + '/meta', { practice: true }); meta.practice = true; meta.host = uid; P = { [uid]: { name: myName, slot, role: 'spectator' } }; Object.assign(meta, META0(), { practice: true }); startGame(); }
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
  for (const id of ['hud', 'sys', 'tools', 'pPaint', 'pPose', 'blind', 'lobby', 'reveal', 'cross', 'joy', 'bJump', 'bFire', 'rank', 'btnRoom']) show(id, false);
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
      const t = POS[id]; if (t && id !== uid) { e.av.root.position.set(t[0], t[1], t[2]); e.av.root.rotation.y = t[3]; }
      changed = true;
    }
    if (e.name !== p.name) { e.name = p.name; e.av.setTag(p.name || '?'); }
    e.av.setHunter(p.role === 'hunter' && meta.state !== 'lobby', p.slot);
    { const sl = styleOf(p); e.av.setStyle(sl[0], sl[1]); }
    if (id !== uid) {
      const pj = JSON.stringify(p.pose || 0);
      if (pj !== e.pj) { e.pj = pj; e.av.setPose(p.pose); }
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
      const av = makeAvatar(e.skin); av.root.position.set(d.p[0], d.p[1], d.p[2]); av.root.rotation.y = d.p[3]; av.lastPose = d.pose || ZERO; av.setStyle(d.shape === 'box' ? 'box' : 'round', HIDER_BASE * (d.size || 1));
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
      const av = makeAvatar(e.skin); av.root.position.set(p.last.p[0], p.last.p[1], p.last.p[2]); av.root.rotation.y = p.last.p[3]; av.lastPose = p.last.pose || ZERO; av.setStyle(p.shape === 'box' ? 'box' : 'round', HIDER_BASE * ([1, 1.5, 2].includes(p.size) ? p.size : 1));
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
  setv('sMode', meta.mode); setv('sHunters', meta.hunters); setv('sHide', meta.hideTime); setv('sHunt', meta.huntTime); setv('sAmmo', meta.ammo); setv('sMap', meta.map || 'random'); setv('sWhistle', meta.whistle == null ? 60 : meta.whistle);
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
  show('joy', isTouch && walk); show('bJump', isTouch && walk);
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
  const m = h.object;
  if (m.userData.pc && h.uv && m.material.map) {
    const c = m.userData.pc, t = m.material.map;
    const u = ((h.uv.x * t.repeat.x) % 1 + 1) % 1, v = ((h.uv.y * t.repeat.y) % 1 + 1) % 1;
    const d = c.getContext('2d').getImageData(Math.min(c.width - 1, Math.floor(u * c.width)), Math.min(c.height - 1, Math.floor((1 - v) * c.height)), 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map(n => n.toString(16).padStart(2, '0')).join('');
  }
  return '#' + m.material.color.getHexString();
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
  const targets = mine ? worldMeshes.concat(hitTargets()) : worldMeshes;
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
const keys = {}; const joy = { x: 0, y: 0, id: null }; let jumpQ = false;
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  keys[e.code] = true;
  if (!inRoom) return;
  if (e.code === 'Space') { jumpQ = true; e.preventDefault(); }
  if (canTool()) {
    if (e.code === 'KeyP') setPanel(panel === 'paint' ? '' : 'paint');
    if (e.code === 'KeyO') setPanel(panel === 'pose' ? '' : 'pose');
    if (e.code === 'KeyF') placeDecoy();
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
function look(dx, dy, k) {
  me.camYaw -= dx * 0.0026 * settings.sens * k; me.camPitch -= dy * 0.0026 * settings.sens * k;
  me.camPitch = Math.max(-1.5, Math.min(1.5, me.camPitch));
}
function castPtr(e, list) { ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); ray.near = 0; ray.far = 100; return ray.intersectObjects(list, false)[0]; }
let lookId = null, lx = 0, ly = 0, paintId = null;
cv.addEventListener('pointerdown', e => {
  audioInit(); if (!inRoom) return;
  if (document.pointerLockElement === cv) { fire(); return; }
  if (e.pointerType === 'mouse' && !panel && !(meta.state === 'lobby' && lobbyOpen)) { if (cv.requestPointerLock) cv.requestPointerLock(); return; }
  if (panel === 'paint' && ents[uid]) {
    if (eyedrop) { const h = castPtr(e, worldMeshes); if (h) { setBrush(pickColor(h), true); eyedrop = false; $('bDrop').style.background = ''; sfx('pop'); return; } }
    else { const h = castPtr(e, ents[uid].av.meshes); if (h && h.uv) { paintId = e.pointerId; paintAt(h.uv, true); try { cv.setPointerCapture(e.pointerId); } catch (_) {} return; } }
  }
  if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; try { cv.setPointerCapture(e.pointerId); } catch (_) {} }
});
cv.addEventListener('pointermove', e => {
  if (document.pointerLockElement === cv) { look(e.movementX || 0, e.movementY || 0, 1); return; }
  if (e.pointerId === paintId) { const h = ents[uid] && castPtr(e, ents[uid].av.meshes); if (h && h.uv) paintAt(h.uv); return; }
  if (e.pointerId === lookId) { look(e.clientX - lx, e.clientY - ly, 2); lx = e.clientX; ly = e.clientY; }
});
const ptrEnd = e => { if (e.pointerId === paintId) { paintId = null; queueSkin(); } if (e.pointerId === lookId) lookId = null; };
cv.addEventListener('pointerup', ptrEnd); cv.addEventListener('pointercancel', ptrEnd);
cv.addEventListener('wheel', e => { me.dist = Math.max(1.2, Math.min(7, me.dist + Math.sign(e.deltaY) * 0.4)); }, { passive: true });
cv.addEventListener('contextmenu', e => e.preventDefault());
{ // スティック
  const j = $('joy'), k = $('knob');
  const mv = e => { if (e.pointerId !== joy.id) return; const r = j.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const l = Math.hypot(dx, dy), m = 45; if (l > m) { dx *= m / l; dy *= m / l; } joy.x = dx / m; joy.y = -dy / m; k.style.transform = `translate(${dx}px,${dy}px)`; };
  const end = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; k.style.transform = ''; };
  j.addEventListener('pointerdown', e => { audioInit(); joy.id = e.pointerId; try { j.setPointerCapture(e.pointerId); } catch (_) {} mv(e); });
  j.addEventListener('pointermove', mv); j.addEventListener('pointerup', end); j.addEventListener('pointercancel', end);
  $('bJump').addEventListener('pointerdown', e => { e.preventDefault(); jumpQ = true; });
  $('bFire').addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); fire(); });
}

/* ---------------- 移動・カメラ ---------------- */
function collide(p) {
  const R = me.r; let ground = 0;
  for (const c of colliders) {
    const cx = Math.max(c.x0, Math.min(p.x, c.x1)), cz = Math.max(c.z0, Math.min(p.z, c.z1));
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    if (p.y >= c.y1 - 0.36) { if (d2 < R * R * 0.5) ground = Math.max(ground, c.y1); continue; } // 上に乗れる
    if (p.y + me.h * 0.92 < c.y0) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (R - d) / d; p.x += dx * k; p.z += dz * k; }
    else { // 中に入り込んだら一番近い面へ押し出す
      const a = [p.x - c.x0, c.x1 - p.x, p.z - c.z0, c.z1 - p.z], i = a.indexOf(Math.min(...a));
      if (i === 0) p.x = c.x0 - R; else if (i === 1) p.x = c.x1 + R; else if (i === 2) p.z = c.z0 - R; else p.z = c.z1 + R;
    }
  }
  return ground;
}
const _pr = [];
function unstick() { // 体のパーツが壁や家具にめり込んでいたら外へ押し出す（壁抜け・埋まり隠れ対策）
  const e = ents[uid]; if (!e) return;
  for (let it = 0; it < 4; it++) {
    e.av.root.position.copy(me.pos); e.av.root.rotation.y = me.yaw; e.av.root.updateMatrixWorld(true);
    const n = e.av.probes(_pr); let moved = false;
    for (let i = 0; i < n && !moved; i++) {
      const v = _pr[i];
      for (const c of colliders) {
        if (v.x <= c.x0 || v.x >= c.x1 || v.z <= c.z0 || v.z >= c.z1 || v.y <= c.y0 + 0.06 || v.y >= c.y1 - 0.1) continue;
        const a = [v.x - c.x0, c.x1 - v.x, v.z - c.z0, c.z1 - v.z], k = a.indexOf(Math.min(...a)), d = a[k] + 0.03;
        if (k === 0) me.pos.x -= d; else if (k === 1) me.pos.x += d; else if (k === 2) me.pos.z -= d; else me.pos.z += d;
        moved = true; break;
      }
    }
    if (!moved) break;
  }
}
function updateMe(dt) {
  const st = meta.state, role = myRole(), third = tp();
  const frozen = !st || (st === 'lobby' && lobbyOpen) || (st === 'hiding' && role === 'hunter');
  let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + joy.x;
  let iy = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + joy.y;
  if (frozen) { ix = iy = 0; jumpQ = false; }
  const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
  const sy = Math.sin(me.camYaw), cy = Math.cos(me.camYaw), sp = role === 'hunter' ? 5.4 : 4.6;
  const mx = (-sy * iy + cy * ix) * sp, mz = (-cy * iy - sy * ix) * sp;
  me.pos.x += mx * dt; me.pos.z += mz * dt;
  if (third) { if (l > 0.15) me.yaw = Math.atan2(-mx, -mz); } else me.yaw = me.camYaw;
  const e = ents[uid]; me.h = third && e ? Math.max(0.3, e.av.height) : 1.6; me.r = third && e ? Math.max(0.18, Math.min(0.42, 0.33 * e.av.sc)) : 0.33;
  if (jumpQ && me.ground) { me.vy = 7; me.ground = false; }
  jumpQ = false;
  me.vy -= 20 * dt; me.pos.y += me.vy * dt;
  const g = collide(me.pos);
  if (me.pos.y <= g) { me.pos.y = g; me.vy = 0; me.ground = true; } else me.ground = false;
  if (third) unstick();
  const bx = MAPINFO.hx - 0.4, bz = MAPINFO.hz - 0.4; // マップの外（裏世界）には出られない
  me.pos.x = Math.max(-bx, Math.min(bx, me.pos.x)); me.pos.z = Math.max(-bz, Math.min(bz, me.pos.z));
  if (!(me.pos.y > -2) || !(me.pos.y < 12) || me.pos.x !== me.pos.x || me.pos.z !== me.pos.z) spawnAt('any');
  if (e) { e.av.root.position.copy(me.pos); e.av.root.rotation.y = me.yaw; }
}
const _t = new V3(), _b = new V3();
function updateCamera() {
  camera.rotation.set(me.camPitch, me.camYaw, 0);
  if (tp()) {
    _t.set(me.pos.x, me.pos.y + Math.min(1.0, me.h * 0.7 + 0.2), me.pos.z); _b.set(0, 0, 1).applyQuaternion(camera.quaternion);
    let d = me.dist; ray.set(_t, _b); ray.near = 0; ray.far = d;
    const h = ray.intersectObjects(worldMeshes, false)[0]; if (h) d = Math.max(0.35, h.distance - 0.15);
    camera.position.copy(_t).addScaledVector(_b, d);
  } else camera.position.set(me.pos.x, me.pos.y + 1.55, me.pos.z);
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
      const t = POS[id]; if (!t) continue; const r = e.av.root;
      r.position.x += (t[0] - r.position.x) * k; r.position.y += (t[1] - r.position.y) * k; r.position.z += (t[2] - r.position.z) * k;
      let dy = t[3] - r.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); r.rotation.y += dy * k;
    }
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
  if (composer && !settings.lite) { try { composer.render(); } catch (e) { console.warn(e); composer = null; } }
  else renderer.render(scene, camera);
}

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
const doJoin = async (id, pr) => { if (joining || inRoom) return; joining = true; await joinRoom(id, pr); joining = false; };
$('btnJoin').onclick = () => { const id = $('inRoom').value.trim(); if (!id) { $('status').textContent = 'ルームIDを入力してください'; return; } doJoin(id, false); };
$('btnPractice').onclick = () => doJoin('practice', true);
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
for (const [k, n] of MAP_LIST) { const o = document.createElement('option'); o.value = k; o.textContent = n; $('sMap').append(o); }
$('sMap').addEventListener('change', e => { if (meta.host === uid) net.update(base + '/meta', { map: e.target.value }); });
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
$('bSize').addEventListener('input', e => { brush.size = Number(e.target.value); });
$('bDrop').onclick = () => { eyedrop = !eyedrop; $('bDrop').style.background = eyedrop ? '#2e8b63' : ''; if (eyedrop) toast('壁・床・家具をタップして色を吸い取る'); };
$('bFill').onclick = () => fillSkin(brush.color);
$('bReset').onclick = () => fillSkin(BASE_COLOR);
$('mEm').addEventListener('input', e => { mySkin.mat.emissiveIntensity = Number(e.target.value); queueMat(); });
$('mMe').addEventListener('input', e => { mySkin.mat.metalness = Number(e.target.value); queueMat(); });
$('mRo').addEventListener('input', e => { mySkin.mat.roughness = 1 - Number(e.target.value); queueMat(); });
// ポーズ
const POSE_DEF = [['体を前後に倒す', -90, 90], ['体を横に倒す', -90, 90], ['腰を曲げる', -30, 120], ['左腕 前後', -180, 180], ['左腕 開く', 0, 180], ['右腕 前後', -180, 180], ['右腕 開く', 0, 180], ['左脚 前後', -120, 120], ['左脚 開く', 0, 90], ['右脚 前後', -120, 120], ['右脚 開く', 0, 90]];
const PRESETS = {
  '立つ': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 'T字': [0, 0, 0, 0, 90, 0, 90, 0, 0, 0, 0], 'バンザイ': [0, 0, 0, 180, 8, 180, 8, 0, 0, 0, 0],
  '座る': [0, 0, 0, 0, 0, 0, 0, 90, 0, 90, 0], 'しゃがむ': [0, 0, 70, 30, 0, 30, 0, 100, 8, 100, 8], '丸まる': [0, 0, 110, 70, 0, 70, 0, 120, 0, 120, 0],
  'うつ伏せ': [90, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], '仰向け': [-90, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], '横向き': [0, 90, 0, 0, 0, 0, 0, 0, 0, 0, 0], '大の字': [-90, 0, 0, 0, 120, 0, 120, 0, 35, 0, 35]
};
const sliderEls = [];
function applyPose() { const e = ents[uid]; if (e) e.av.setPose(me.pose); queuePose(); }
POSE_DEF.forEach((d, i) => {
  const l = document.createElement('label'); l.className = 'l'; l.textContent = d[0];
  const r = document.createElement('input'); r.type = 'range'; r.min = d[1]; r.max = d[2]; r.step = 5; r.value = 0;
  r.addEventListener('input', () => { me.pose[i] = Number(r.value); applyPose(); });
  l.append(r); $('sliders').append(l); sliderEls.push(r);
});
for (const name in PRESETS) {
  const b = document.createElement('button'); b.textContent = name; b.className = 'sec';
  b.onclick = () => { me.pose = PRESETS[name].slice(); sliderEls.forEach((s, i) => { s.value = me.pose[i]; }); applyPose(); };
  $('presets').append(b);
}
function setBody(shape, size) {
  me.shape = shape; me.size = size;
  try { localStorage.setItem('nurikakure_body', JSON.stringify({ shape, size })); } catch (e) {}
  document.querySelectorAll('[data-shape]').forEach(b => b.classList.toggle('sec', b.dataset.shape !== shape));
  document.querySelectorAll('[data-size]').forEach(b => b.classList.toggle('sec', Number(b.dataset.size) !== size));
  if (inRoom) net.update(`${base}/players/${uid}`, { shape, size });
}
document.querySelectorAll('[data-shape]').forEach(b => { b.onclick = () => setBody(b.dataset.shape, me.size); });
document.querySelectorAll('[data-size]').forEach(b => { b.onclick = () => setBody(me.shape, Number(b.dataset.size)); });
setBody(me.shape, me.size);
$('rotL').onclick = () => { me.yaw += Math.PI / 12; }; $('rotR').onclick = () => { me.yaw -= Math.PI / 12; };
// 設定
function openSettings() { $('oLite').checked = settings.lite; $('oSens').value = settings.sens; $('oBgm').value = settings.bgm; $('oSe').value = settings.se; show('modal', true); if (document.pointerLockElement) document.exitPointerLock(); }
$('btnSet1').onclick = openSettings; $('btnSet2').onclick = openSettings;
$('btnSetClose').onclick = () => show('modal', false);
$('oLite').addEventListener('change', e => { settings.lite = e.target.checked; applyGfx(); saveSet(); });
$('oSens').addEventListener('input', e => { settings.sens = Number(e.target.value); saveSet(); });
$('oBgm').addEventListener('input', e => { settings.bgm = Number(e.target.value); audioInit(); applyVol(); saveSet(); });
$('oSe').addEventListener('input', e => { settings.se = Number(e.target.value); applyVol(); saveSet(); });

loadMap('park');
tick();
