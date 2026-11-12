// マップ定義。h = { B(箱), F(床), cyl(円柱), ball(球), dome(だ円の山), cap(丸頭の柱), arch(アーチ), outer(外壁), rnd(乱数) }
// B(x, y0, z, 幅, 高さ, 奥行, 色, opt)  ※ x,z は中心、y0 は底面の高さ
// opt.pat = [模様, 地の色, 模様の色(配列も可), 横のくり返し, 縦のくり返し]  模様は patterns.js
// opt.soft = 葉っぱ（弾がすり抜ける・中に隠れられる）
export const MAP_LIST = [['house', 'おうち'], ['park', '公園'], ['school', '学校'], ['warehouse', '倉庫'], ['town', '夜の商店街'],
  ['station', 'ガソリンスタンド'], ['circuit', 'サーキット'], ['desert', '古代の砂漠'], ['neon', 'ネオン街'], ['volcano', '火山']];

const NC = { nocol: true }, FL = { nocol: true, flat: true };
const WALL = 4.5; // 内壁の高さ
const table = (h, x, z, w, d, c, ht = 0.76) => {
  h.B(x, ht - 0.08, z, w, 0.08, d, c);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.B(x + sx * (w / 2 - 0.1), 0, z + sz * (d / 2 - 0.1), 0.1, ht - 0.08, 0.1, c, NC);
};
const chair = (h, x, z, c) => h.B(x, 0, z, 0.5, 0.45, 0.5, c, { r: 0.12 });
const sofaX = (h, x, z, w, c, back) => { h.B(x, 0, z, w, 0.5, 1.2, c, { r: 0.2 }); h.B(x, 0.5, z + back * 0.45, w, 0.5, 0.3, c, { r: 0.14 }); };
const sofaZ = (h, x, z, d, c, back) => { h.B(x, 0, z, 1.2, 0.5, d, c, { r: 0.2 }); h.B(x + back * 0.45, 0.5, z, 0.3, 0.5, d, c, { r: 0.14 }); };
const bed = (h, x, z, c) => {
  h.B(x, 0, z, 2.2, 0.55, 3.2, '#efe9df', { r: 0.18 }); h.B(x, 0.55, z - 0.35, 2.2, 0.12, 2.5, c);
  h.B(x, 0.55, z + 1.2, 1.6, 0.2, 0.5, '#ffffff'); h.B(x, 0, z + 1.7, 2.3, 1.1, 0.15, '#6b4a2b');
};
const plant = (h, x, z) => { h.cyl(x, 0, z, 0.35, 0.55, '#b5651d'); h.ball(x, 1.15, z, 0.7, '#2f7d3a', { col: true }); };
const LEAF = ['#2f7d3a', '#3b8f46', '#25622d', '#4a9a3e'];
// 木：太い幹は登れる。てっぺんの枝の足場に乗ると葉っぱの中に隠れられる（葉っぱは弾がすり抜ける）
const tree = (h, x, z, s = 1) => {
  const th = 2.5 * s;
  h.cyl(x, 0, z, 0.55 * s, th, '#6b4a2b', { rt: 0.42 * s, pat: ['bark', '#6b4a2b', 0, 2, 2] });
  h.cyl(x, th, z, 1.05 * s, 0.28 * s, '#5a3c24', { rt: 0.95 * s });
  h.ball(x, th + 0.9 * s, z, 1.65 * s, '#2f7d3a', { soft: true, pat: ['leaf', '#2f7d3a', LEAF, 3, 2] });
  h.ball(x + 0.85 * s, th + 0.5 * s, z + 0.45 * s, 1.15 * s, '#3b8f46', { soft: true, pat: ['leaf', '#3b8f46', LEAF, 2, 2] });
};
const car = (h, x, z, c, alongX) => {
  const w = alongX ? 4.4 : 2, d = alongX ? 2 : 4.4;
  h.B(x, 0.3, z, w, 0.8, d, c, { r: 0.36 }); h.B(x, 1.05, z, alongX ? 2.5 : 1.8, 0.7, alongX ? 1.8 : 2.5, '#2a3038', { r: 0.32 });
  for (const s of [-1, 1]) { h.ball(x + (alongX ? s * 2.1 : 0.6), 0.75, z + (alongX ? 0.6 : s * 2.1), 0.13, s > 0 ? '#fff4c2' : '#e0413a'); h.ball(x + (alongX ? s * 2.1 : -0.6), 0.75, z + (alongX ? -0.6 : s * 2.1), 0.13, s > 0 ? '#fff4c2' : '#e0413a'); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.wheel(x + sx * (alongX ? 1.4 : 0.95), 0.36, z + sz * (alongX ? 0.95 : 1.4), 0.36, 0.26, alongX ? 'z' : 'x');
};
const palm = (h, x, z, s = 1) => {
  h.cyl(x, 0, z, 0.36 * s, 4 * s, '#8a6a3c', { rt: 0.24 * s, pat: ['bark', '#8a6a3c', 0, 2, 3] });
  h.cyl(x, 4 * s, z, 0.7 * s, 0.2 * s, '#6b4a2b', { rt: 0.55 * s });
  for (let i = 0; i < 6; i++) { const a = i * 1.047; h.dome(x + Math.cos(a) * 1.2 * s, 4.1 * s, z + Math.sin(a) * 1.2 * s, 1.4 * s, 0.3 * s, 0.55 * s, '#3f8f3a', { nocol: true, rot: a }); }
  h.ball(x, 4.35 * s, z, 0.3 * s, '#6b4a2b');
};
const tires = (h, x, z, n = 3) => { h.cyl(x, 0, z, 0.45, 0.3 * n, '#1b1d20'); for (let i = 0; i < n; i++) h.tire(x, i * 0.3, z, 0.5); };
const pylon = (h, x, z) => { h.B(x, 0, z, 0.42, 0.04, 0.42, '#f08a3c', NC); h.cone(x, 0.04, z, 0.17, 0.55, '#f08a3c'); };
const kart = (h, x, z, c) => { h.B(x, 0.12, z, 1.1, 0.36, 1.8, c, { r: 0.16 }); h.B(x, 0.48, z + 0.4, 0.7, 0.4, 0.45, '#2a3038', { r: 0.12 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.wheel(x + sx * 0.62, 0.22, z + sz * 0.62, 0.22, 0.2, 'x'); };
const pump = (h, x, z) => {
  h.B(x, 0, z, 1.5, 0.18, 5, '#c9c9c9'); h.B(x, 0.18, z, 0.95, 1.75, 0.6, '#e0413a', { r: 0.2 }); h.B(x, 1.93, z, 1.05, 0.3, 0.7, '#f4f4f4');
  h.B(x, 1.2, z, 0.7, 0.45, 0.64, '#15171a', NC); h.cyl(x - 0.6, 0.18, z, 0.05, 1.2, '#22262b', NC);
  h.cyl(x, 0.18, z - 2.1, 0.12, 0.9, '#f0d040'); h.cyl(x, 0.18, z + 2.1, 0.12, 0.9, '#f0d040');
};
// x方向／z方向にのびる壁。pat = [模様, 模様の色] で壁紙つき
const wallPat = (pat, c, len, ht) => (pat ? { pat: [pat[0], c, pat[1], Math.max(1, Math.round(len / 1.6)), Math.max(1, Math.round(ht / 1.6))] } : undefined);
const wallX = (h, z, x0, x1, c, ht = WALL, pat) => h.B((x0 + x1) / 2, 0, z, x1 - x0, ht, 0.4, c, wallPat(pat, c, x1 - x0, ht));
const wallZ = (h, x, z0, z1, c, ht = WALL, pat) => h.B(x, 0, (z0 + z1) / 2, 0.4, ht, z1 - z0, c, wallPat(pat, c, z1 - z0, ht));
const lamp = (h, x, z, ht = 2.6) => { h.cyl(x, 0, z, 0.07, ht, '#444a50'); h.ball(x, ht + 0.22, z, 0.26, '#fff4c2', { glow: 1 }); };
const TOY = ['#e04f4f', '#4f7fe0', '#f0d040', '#4fbf6a', '#b06fd8', '#f08a3c'];
const CARD = ['#c7a36a', '#b8935a', '#d4b483', '#a8834f'];
const CONT = ['#b8452f', '#2f6fb0', '#3f9b6a', '#d98a2b', '#7b5ea7', '#8d8f94', '#c9b037'];

// 模様えらび（地の色はそのマップの色、模様の色はアクセント色）
const pick = (h, a) => a[Math.floor(h.rnd() * a.length)];
const PATK = ['dots', 'hstripe', 'vband', 'diag', 'zigzag', 'check2', 'camo', 'confetti', 'splat', 'wave', 'rainbow', 'brick'];
function rpat(h, pal, acc, rx = 1, ry = 1, kinds = PATK) {
  const k = pick(h, kinds), a = pick(h, pal);
  let b = pick(h, acc); if (b === a) b = '#f4f4f4';
  const c2 = k === 'camo' ? [pick(h, pal), b, pick(h, pal)] : (k === 'confetti' || k === 'splat' || k === 'rainbow') ? acc : b;
  return [k, a, c2, rx, ry];
}

// 隠れ場所になる小物（マップごとの kit から自動でたくさん配置される）。pal = マップの色、acc = アクセント色
export const KIT = {
  crate(h, x, z) { const s = 0.8 + h.rnd() * 0.5, o = { r: 0.12 }; h.B(x, 0, z, s, s, s, pick(h, CARD), o); if (h.rnd() < 0.55) h.B(x + 0.08, s, z - 0.05, s * 0.8, s * 0.8, s * 0.8, pick(h, CARD), o); if (h.rnd() < 0.45) h.B(x + s * 0.95, 0, z + 0.2, s * 0.85, s * 0.7, s * 0.85, pick(h, CARD), o); },
  barrel(h, x, z, pal) { const n = 1 + Math.floor(h.rnd() * 3); for (let i = 0; i < n; i++) h.cyl(x + (i % 2) * 0.95, 0, z + (i > 1 ? 0.95 : 0), 0.45, 1.05 + h.rnd() * 0.2, pick(h, pal)); },
  bush(h, x, z) { const r = 0.7 + h.rnd() * 0.5; h.ball(x, r * 0.75, z, r, pick(h, ['#2f7d3a', '#3b8f46', '#2e6b34']), { col: true, pat: ['leaf', '#2f7d3a', LEAF, 2, 2] }); if (h.rnd() < 0.6) h.ball(x + r * 0.9, r * 0.55, z + 0.3, r * 0.7, '#3b8f46', { col: true, pat: ['leaf', '#3b8f46', LEAF, 2, 2] }); },
  rock(h, x, z, pal) { const s = 0.9 + h.rnd() * 1.1; h.B(x, 0, z, s, s * (0.6 + h.rnd() * 0.6), s * (0.7 + h.rnd() * 0.5), pick(h, pal), { r: 0.45 }); if (h.rnd() < 0.5) h.B(x + s * 0.7, 0, z + s * 0.4, s * 0.6, s * 0.45, s * 0.6, pick(h, pal), { r: 0.35 }); },
  planter(h, x, z, pal) { h.B(x, 0, z, 1.3, 0.6, 1.3, pick(h, pal), { r: 0.22 }); h.ball(x, 1.15, z, 0.7, '#2f7d3a', { col: true, pat: ['leaf', '#2f7d3a', LEAF, 2, 2] }); },
  pillar(h, x, z, pal) { h.cyl(x, 0, z, 0.5 + h.rnd() * 0.25, 2.2 + h.rnd() * 1.6, pick(h, pal)); },
  screen(h, x, z, pal, acc) { // ついたて（半分は模様つき）
    const w = 2 + h.rnd() * 1.6, c = pick(h, pal), ht = 1.5 + h.rnd() * 0.6, o = { r: 0.1 };
    if (h.rnd() < 0.5) o.pat = rpat(h, pal, acc, Math.round(w / 1.2), 1);
    if (h.rnd() < 0.5) { h.B(x, 0, z, w, ht, 0.22, c, o); if (h.rnd() < 0.5) h.B(x + w / 2, 0, z + 0.8, 0.22, ht, 1.6, c, o); }
    else { h.B(x, 0, z, 0.22, ht, w, c, o); if (h.rnd() < 0.5) h.B(x + 0.8, 0, z + w / 2, 1.6, ht, 0.22, c, o); }
  },
  toy(h, x, z) { const n = 2 + Math.floor(h.rnd() * 4); for (let i = 0; i < n; i++) { const s = 0.5 + h.rnd() * 0.4; h.B(x + (i % 2) * 0.8, Math.floor(i / 2) * 0.62, z + (i % 3) * 0.15, s, 0.6, s, pick(h, TOY), { r: 0.16 }); } },
  shelfK(h, x, z, pal) { const al = h.rnd() < 0.5; h.B(x, 0, z, al ? 2.2 : 0.7, 1.9, al ? 0.7 : 2.2, pick(h, pal)); for (let i = 0; i < 3; i++) h.B(x, 0.35 + i * 0.6, z, al ? 2.0 : 0.76, 0.28, al ? 0.76 : 2.0, pick(h, TOY), NC); },
  sofaK(h, x, z, pal) { if (h.rnd() < 0.5) sofaX(h, x, z, 2.4 + h.rnd(), pick(h, pal), h.rnd() < 0.5 ? 1 : -1); else sofaZ(h, x, z, 2.4 + h.rnd(), pick(h, pal), h.rnd() < 0.5 ? 1 : -1); },
  stool(h, x, z, pal) { for (let i = 0; i < 3; i++) h.cyl(x + i * 0.75, 0, z + (i % 2) * 0.5, 0.28, 0.5 + (i % 2) * 0.25, pick(h, pal)); },
  plantK(h, x, z) { plant(h, x, z); if (h.rnd() < 0.5) plant(h, x + 0.9, z + 0.3); },
  tiresK(h, x, z) { tires(h, x, z, 2 + Math.floor(h.rnd() * 3)); if (h.rnd() < 0.6) tires(h, x + 1.05, z + 0.2, 1 + Math.floor(h.rnd() * 3)); },
  pylonK(h, x, z) { for (let i = 0; i < 3; i++) pylon(h, x + i * 0.6, z + (i % 2) * 0.5); h.B(x + 0.6, 0, z - 0.9, 2, 0.9, 0.3, '#f4f4f4', { r: 0.12 }); },
  vend(h, x, z) { h.B(x, 0, z, 1, 1.9, 0.8, pick(h, ['#e0413a', '#2f6fb0', '#f4f4f4', '#3f9b6a']), { r: 0.16 }); if (h.rnd() < 0.5) h.cyl(x + 0.95, 0, z, 0.33, 0.85, '#55606b'); },
  pot(h, x, z) { for (let i = 0; i < 3; i++) { const px = x + i * 0.8, pz = z + (i % 2) * 0.6, s = 0.8 + h.rnd() * 0.6; h.cyl(px, 0, pz, 0.35 * s, 0.7 * s, '#b5651d', { rt: 0.22 * s }); h.ball(px, 0.95 * s, pz, 0.36 * s, '#b5651d', { col: true }); } },
  crystal(h, x, z) { h.cone(x, 0, z, 0.7, 2.2 + h.rnd(), '#5a3a8a', { seg: 5 }); h.cone(x + 0.75, 0, z + 0.3, 0.45, 1.4, '#7b4fb8', { seg: 5 }); },
  neonBox(h, x, z, pal) { const s = 0.9 + h.rnd() * 0.5; h.B(x, 0, z, s, s, s, pick(h, pal), { r: 0.2 }); h.B(x, s, z, s * 0.9, 0.06, s * 0.9, pick(h, ['#ff3ab8', '#33eaff', '#ffd940']), { nocol: true, glow: 1.3 }); if (h.rnd() < 0.5) h.B(x + s, 0, z, s * 0.8, s * 1.4, s * 0.8, pick(h, pal), { r: 0.2 }); },

  /* ---- 色をぬって隠れるための物（模様つき・丸い形） ---- */
  mural(h, x, z, pal, acc) { // 模様の壁（コの字のくぼみに入って隠れる）
    const al = h.rnd() < 0.5, w = 2.6 + h.rnd() * 1.2, ht = 2.1 + h.rnd() * 0.8, t = 0.36, wl = 0.9 + h.rnd() * 0.5, sd = h.rnd() < 0.5 ? 1 : -1;
    const p = rpat(h, pal, acc, Math.max(2, Math.round(w / 1.2)), Math.max(2, Math.round(ht / 1.2)));
    const o = { pat: p, r: 0.16 }, ow = { pat: [p[0], p[1], p[2], 1, p[4]], r: 0.16 };
    if (al) { h.B(x, 0, z, w, ht, t, p[1], o); for (const e of [-1, 1]) h.B(x + e * (w / 2 - t / 2), 0, z + sd * (wl + t) / 2, t, ht, wl, p[1], ow); }
    else { h.B(x, 0, z, t, ht, w, p[1], o); for (const e of [-1, 1]) h.B(x + sd * (wl + t) / 2, 0, z + e * (w / 2 - t / 2), wl, ht, t, p[1], ow); }
  },
  blob(h, x, z, pal, acc) { // まんまるクッション
    const rx = 0.9 + h.rnd() * 0.6, ry = 0.6 + h.rnd() * 0.5, p = rpat(h, pal, acc, 3, 2);
    h.dome(x, 0, z, rx, ry, rx * (0.85 + h.rnd() * 0.3), p[1], { pat: p, solid: true });
    if (h.rnd() < 0.5) { const r2 = rx * 0.6; h.dome(x + rx + r2 * 0.5, 0, z + 0.3, r2, ry * 0.75, r2, p[1], { pat: p, solid: true }); }
  },
  pole(h, x, z, pal, acc) { // しましまの丸い柱
    const r = 0.4 + h.rnd() * 0.25, len = 1.4 + h.rnd() * 1.4, p = rpat(h, pal, acc, 3, Math.max(2, Math.round(len)), ['hstripe', 'diag', 'dots', 'zigzag', 'rainbow', 'wave']);
    h.cap(x, 0, z, r, len, p[1], { pat: p });
    if (h.rnd() < 0.5) h.cap(x + r * 2.4, 0, z + 0.2, r * 0.75, len * 0.6, p[1], { pat: p });
  },
  mush(h, x, z, pal) { // きのこ（かさの下にも上にも隠れられる）
    const s = 0.8 + h.rnd() * 0.6, sh = (1.3 + h.rnd() * 0.4) * s, cr = (1.1 + h.rnd() * 0.4) * s;
    const c = pick(h, ['#e04f4f', '#f08a3c', '#b06fd8', '#4f7fe0', '#d8a7b1', pal[0]]);
    h.cyl(x, 0, z, 0.34 * s, sh, '#efe6d2', { rt: 0.27 * s });
    h.dome(x, sh, z, cr, 0.75 * s, cr, c, { pat: ['dots', c, '#f7f3ea', 4, 1], solid: true, half: true });
  },
  rug(h, x, z, pal, acc) { // 模様のマット（寝そべって隠れる）
    const r = 1.1 + h.rnd() * 0.7; h.cyl(x, 0, z, r, 0.03, '#ffffff', { pat: rpat(h, pal, acc, 2, 2), nocol: true, flat: true, seg: 40 });
    if (h.rnd() < 0.6) KIT.blob(h, x + r * 0.45, z - r * 0.35, pal, acc);
  },
  arch(h, x, z, pal, acc) { // にじのアーチ（くぐれる・登れる）
    const R = 1.5 + h.rnd() * 0.5; h.arch(x, z, R, 0.3, h.rnd() < 0.5 ? 0 : Math.PI / 2, ['rainbow', '#ffffff', acc, 1, 1]);
  },
  cubes(h, x, z, pal, acc) { // 模様のキューブ
    const n = 2 + Math.floor(h.rnd() * 3), hs = [];
    for (let i = 0; i < n; i++) {
      const s = 0.75 + h.rnd() * 0.45, p = rpat(h, pal, acc, 1, 1);
      if (i === 3) h.B(x, hs[0], z, s * 0.85, s * 0.85, s * 0.85, p[1], { pat: p, r: 0.2 });
      else { h.B(x + (i % 2) * 1.0, 0, z + (i === 2 ? 1.0 : 0), s, s, s, p[1], { pat: p, r: 0.2 }); hs.push(s); }
    }
  },
  flowers(h, x, z) { // 花のおか
    const rx = 1.2 + h.rnd() * 0.6;
    h.dome(x, 0, z, rx, 0.55 + h.rnd() * 0.3, rx * 0.8, '#4f9a45', { pat: ['confetti', '#4f9a45', ['#ff6fa8', '#ffd940', '#ffffff', '#b06fd8', '#ff8a3c'], 2, 2], solid: true });
  }
};
// 大きめの小物は、まわりに広めのすき間がないと置かない
export const KIT_R = { mural: 2.4, arch: 2.2, blob: 1.8, rug: 2.0, cubes: 1.6, flowers: 1.8, mush: 1.7, screen: 1.9, sofaK: 1.8 };

// ---- 街づくり：塗って隠れる・壁にくっついて隠れるための仕掛けがいっぱいの建物 ----
// T = { pal: 建物の色, acc: アクセント色, night, neon, facade: 外壁の模様 }
function bld(h, T, x, z, w, d, ht, fz) { // fz = ±1：表（通り側）が向く z の向き
  const col = pick(h, T.pal), acc = pick(h, T.acc), zf = z + fz * d / 2, g = T.night ? 1 : 0, mural = h.rnd() < 0.3;
  let ac2 = pick(h, T.acc); if (ac2 === col) ac2 = '#f4f4f4';
  const fk = pick(h, T.facade), fpat = [fk, col, T.neon ? acc : (h.rnd() < 0.5 ? '#f4f4f4' : ac2), Math.max(1, Math.round(w / 2.2)), Math.max(1, Math.round(ht / 2.2))];
  h.B(x, 0, z, w, ht, d, col, { pat: fpat, r: 0.22, glow: T.neon ? 0.45 : 0 }); // 外壁ぜんたいが模様（スポイトで吸って塗れば溶け込める）
  if (mural) { // 大きな壁画
    const mp = [pick(h, ['splat', 'confetti', 'rainbow', 'camo', 'wave']), pick(h, ['#f4f4f4', col, '#2a3038']), T.acc, 3, 2];
    h.B(x, 0.05, zf + fz * 0.03, w * 0.86, Math.min(ht - 0.6, 4.6), 0.05, '#ffffff', { nocol: true, pat: mp, glow: T.neon ? 0.6 : 0 });
  } else { // 1階の店先
    h.B(x - w * 0.12, 0.3, zf + fz * 0.03, w * 0.55, 2.0, 0.06, T.night ? '#ffd98a' : '#9fd0e8', { nocol: true, glow: T.night ? 0.9 : 0.15 });
    h.B(x + w * 0.3, 0, zf + fz * 0.03, 1.1, 2.2, 0.06, '#3a3d44', NC);
  }
  // 日よけ（乗れる・上に隠れられる）
  const aw = w * (0.6 + h.rnd() * 0.25);
  h.B(x, 2.55, zf + fz * 0.8, aw, 0.16, 1.6, acc, { pat: ['vband', acc, '#f4f4f4', Math.max(2, Math.round(aw / 0.8)), 1], r: 0.06, glow: T.neon ? 0.5 : 0 });
  // 上の階：窓・ベランダ（乗れる）・室外機（足場）
  for (let y = 3.6; y < ht - 1.3; y += 2.8) {
    for (const s of [-1, 1]) if (h.rnd() < 0.8) h.B(x + s * w * 0.25, y, zf + fz * 0.03, Math.min(1.4, w * 0.22), 1.3, 0.05, T.night ? pick(h, ['#ffd98a', '#9fd0e8', '#2a3038']) : '#9fd0e8', { nocol: true, glow: T.night ? 0.7 : 0.1 });
    if (h.rnd() < 0.45) {
      const bx = x + (h.rnd() - 0.5) * w * 0.4, bw = Math.min(3, w * 0.45);
      h.B(bx, y - 0.35, zf + fz * 0.65, bw, 0.2, 1.3, '#d8d2c4', { r: 0.06 });
      h.B(bx, y - 0.15, zf + fz * 1.22, bw, 0.75, 0.12, ac2, { pat: [pick(h, ['vband', 'dots', 'hstripe']), ac2, '#f4f4f4', Math.max(2, Math.round(bw / 0.7)), 1], r: 0.05 });
    }
    if (h.rnd() < 0.35) h.B(x + (h.rnd() - 0.5) * w * 0.7, y - 0.55, zf + fz * 0.35, 0.95, 0.65, 0.6, '#d9dde0', { r: 0.1 });
    if (T.neon) h.B(x, y - 0.75, z, w + 0.1, 0.14, d + 0.1, pick(h, T.acc), { nocol: true, glow: 1.5 }); // ネオンの帯
  }
  // 横に突き出た看板（両面にくっつける）・雨どい
  const sx = h.rnd() < 0.5 ? -1 : 1;
  if (h.rnd() < 0.7) h.B(x + sx * (w / 2 - 0.45), 3.1, zf + fz * 0.95, 0.36, Math.min(4.6, ht - 3.4), 1.7, acc, { pat: [pick(h, ['hstripe', 'check2', 'dots', 'rainbow', 'zigzag']), acc, T.neon ? '#ffffff' : ac2, 1, 3], r: 0.1, glow: T.night ? 0.7 : 0 });
  if (h.rnd() < 0.6) h.cyl(x - sx * (w / 2 - 0.2), 0, zf + fz * 0.18, 0.13, ht, '#8d8f94');
  // 屋上：低い壁（かげに隠れる）・タンク・看板
  for (const s of [-1, 1]) { h.B(x, ht, z + s * (d / 2 - 0.1), w, 0.6, 0.2, col, { r: 0.06 }); h.B(x + s * (w / 2 - 0.1), ht, z, 0.2, 0.6, d - 0.4, col, { r: 0.06 }); }
  if (h.rnd() < 0.45) h.cyl(x - w * 0.25, ht, z - fz * d * 0.15, 0.85, 1.7, '#b9c0c7');
  if (h.rnd() < 0.5) h.B(x + w * 0.2, ht, z, 1.2, 0.8, 1, '#d9dde0', { r: 0.12 });
  if (h.rnd() < 0.4) { // 屋上の大きな看板
    const bw = Math.min(5, w - 1);
    for (const s of [-1, 1]) h.B(x + s * bw * 0.35, ht, z - fz * d * 0.2, 0.18, 1.6, 0.18, '#55606b');
    h.B(x, ht + 1.6, z - fz * d * 0.2, bw, 2.2, 0.3, acc, { pat: [pick(h, ['splat', 'confetti', 'check2', 'wave', 'rainbow']), acc, T.acc, 3, 1], r: 0.08, glow: T.night ? 0.6 : 0 });
  }
}
function row(h, T, x0, x1, z, d, fz, hmin, hmax) { // 通りぞいに建物を並べる（ところどころに路地）
  let x = x0;
  while (x1 - x > 4.5) {
    const w = Math.min(x1 - x, 5 + h.rnd() * 4.5); if (x1 - x - w < 4.5) { bld(h, T, (x + x1) / 2, z, x1 - x, d, hmin + h.rnd() * (hmax - hmin), fz); break; }
    bld(h, T, x + w / 2, z, w, d, hmin + h.rnd() * (hmax - hmin), fz); x += w;
    if (h.rnd() < 0.45) { // 路地：木箱・ゴミ箱・パイプ
      const gw = 1.8 + h.rnd() * 1; KIT.crate(h, x + gw / 2, z + (h.rnd() - 0.5) * d * 0.6); x += gw;
    }
  }
}
function courtyard(h, T, x0, x1, z0, z1) { // 建物のあいだの中庭
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, k = h.rnd();
  if (k < 0.4) { // 模様のタイル広場
    h.F(cx, cz, w - 1, d - 1, '#ffffff', [pick(h, ['check2', 'dots', 'zigzag', 'brick']), pick(h, T.pal), pick(h, T.acc), Math.round(w / 3), Math.round(d / 3)], 1);
    for (const s of [-1, 1]) { h.B(cx + s * w * 0.3, 0, cz, 2, 0.5, 0.6, '#8a5a33', { r: 0.12 }); h.B(cx + s * w * 0.3, 0.5, cz + 0.25, 2, 0.5, 0.12, '#8a5a33'); }
    KIT.pole(h, cx, cz, T.pal, T.acc);
  } else if (k < 0.7) { // 小さな公園
    h.F(cx, cz, w - 1, d - 1, '#6fae5a', null, 1);
    tree(h, cx - w * 0.22, cz, 0.9); KIT.bush(h, cx + w * 0.25, cz - d * 0.15); KIT.flowers(h, cx + w * 0.15, cz + d * 0.2);
  } else { // 屋台
    for (const s of [-1, 1]) {
      const sx = cx + s * w * 0.22, c = pick(h, T.acc);
      table(h, sx, cz, 2.6, 1.2, '#b08a5a', 0.95);
      for (let i = 0; i < 3; i++) h.B(sx - 0.8 + i * 0.8, 0.95, cz, 0.6, 0.35, 0.9, pick(h, TOY), { r: 0.1 });
      for (const t of [-1, 1]) h.B(sx + t * 1.2, 0, cz - 0.5, 0.1, 2.3, 0.1, '#55606b', NC);
      h.B(sx, 2.3, cz, 3, 0.14, 1.6, c, { pat: ['vband', c, '#f4f4f4', 4, 1], nocol: true, glow: T.neon ? 0.5 : 0 });
    }
  }
}
function city(h, T) {
  const hx = 36, hz = 28;
  // 歩道
  for (const s of [-1, 1]) h.B(0, 0, s * 5.2, 72, 0.15, 2.4, '#b9b7b0', { flat: true });
  for (const s of [-1, 1]) for (const t of [-1, 1]) h.B(s * 4.7, 0, t * 16.2, 2.4, 0.15, 21.6, '#b9b7b0', { flat: true });
  for (let x = -34; x <= 34; x += 4) if (Math.abs(x) > 6) h.B(x, 0, 0, 2, 0.02, 0.25, '#ffffff', FL); // 道路の線
  // 4つの区画 × 2ブロック：通りぞいの建物・奥の建物・その間の中庭
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const [a, b] of [[6.4, 18.6], [21.4, 34.6]]) {
    const x0 = sx > 0 ? a : -b, x1 = sx > 0 ? b : -a;
    row(h, T, x0, x1, sz * 10.4, 7, -sz, T.hmin, T.hmax); // 通りに面した建物（大通りのほうを向く）
    row(h, T, x0, x1, sz * 23.6, 6.4, -sz, T.hmin + 1, T.hmax + 2); // 奥の建物（中庭のほうを向く）
    courtyard(h, T, x0, x1, sz > 0 ? 14.2 : -20.2, sz > 0 ? 20.2 : -14.2);
    // 路地の入口（ブロックの間）に木箱
    if (a > 10) { KIT.crate(h, sx * 20, sz * 11); KIT.barrel(h, sx * 20, sz * 17, T.pal); }
  }
  // まんなかの噴水広場
  h.F(0, 0, 12, 10, '#ffffff', [pick(h, ['check2', 'brick']), '#e8dcc8', pick(h, T.acc), 6, 5], 1);
  h.cyl(0, 0, 0, 2.8, 0.6, '#b9c0c7'); h.cyl(0, 0.6, 0, 2.5, 0.04, T.neon ? '#33eaff' : '#5fa8d8', { nocol: true, glow: T.neon ? 0.9 : 0 });
  h.cap(0, 0, 0, 0.55, 2.2, '#ffffff', { pat: ['rainbow', '#ffffff', T.acc, 2, 3] });
  // 大通りの小物：街灯・ベンチ・自動販売機・バス停・看板柱
  for (let x = -32; x <= 32; x += 8) if (Math.abs(x) > 6) for (const s of [-1, 1]) {
    const z = s * 4.6, k = Math.round(x / 8 + s * 3) % 4;
    h.cyl(x, 0.15, z, 0.09, 4, '#444a50'); h.ball(x, 4.35, z, 0.32, T.neon ? pick(h, T.acc) : '#fff4c2', { glow: 1 });
    if (k === 0) { h.B(x + 1.6, 0.15, z + s * 0.4, 1, 1.9, 0.8, pick(h, ['#e04f4f', '#2f6fb0', '#f4f4f4', '#3f9b6a']), { r: 0.14 }); h.B(x + 2.7, 0.15, z + s * 0.4, 1, 1.9, 0.8, pick(h, T.acc), { r: 0.14 }); }
    else if (k === 1) { h.B(x + 2, 0.15, z, 2.2, 0.5, 0.6, '#8a5a33', { r: 0.12 }); h.B(x + 2, 0.65, z + s * 0.25, 2.2, 0.5, 0.12, '#8a5a33'); }
    else if (k === 2) { // バス停（ポスターの壁）
      const c = pick(h, T.acc); h.B(x + 2.2, 0.15, z + s * 0.9, 3.2, 2.4, 0.16, c, { pat: [pick(h, ['splat', 'confetti', 'wave', 'dots']), c, T.acc, 2, 1], r: 0.06, glow: T.night ? 0.4 : 0 });
      h.B(x + 2.2, 2.55, z + s * 0.5, 3.4, 0.14, 1.2, '#55606b'); h.B(x + 2.2, 0.15, z + s * 0.5, 2.4, 0.45, 0.5, '#8a5a33', { r: 0.1 });
    } else { // 看板柱（大きな板にくっつける）
      const c = pick(h, T.acc); for (const t of [-1, 1]) h.cyl(x + 2 + t * 1.3, 0.15, z, 0.1, 2.4, '#55606b');
      h.B(x + 2, 2.4, z, 3.2, 1.8, 0.25, c, { pat: [pick(h, ['check2', 'hstripe', 'rainbow', 'camo']), c, T.acc, 2, 1], r: 0.08, glow: T.night ? 0.5 : 0 });
    }
  }
  car(h, -14, -1.9, pick(h, T.acc), true); car(h, 12, 1.9, pick(h, T.acc), true); car(h, 27, -1.9, pick(h, T.acc), true); car(h, -27, 1.9, pick(h, T.acc), true);
}

export const MAPS = {
  /* ---------- ロビー（ゲーム開始までみんなで歩き回る。まんなかの HUNTER の円に乗ると鬼になれる） ---------- */
  lobby: {
    name: 'ロビー', hx: 11, hz: 8.5, sky: '#cfd8e3', spawn: [0, 5.2], hunter: [0, 0, 1.7],
    build(h) {
      h.F(0, 0, 22, 17, 0, ['check2', '#ece7dd', '#dcd5c8', 11, 8]);
      h.outer(5, '#efe6d6');
      // HUNTER の円（床の印。当たり判定はなく、円の中に立っているかだけを見る）
      h.cyl(0, 0, 0, 1.86, 0.03, '#ffffff', { nocol: true, flat: true, seg: 56 });
      h.cyl(0, 0, 0, 1.7, 0.045, '#d9342b', { nocol: true, flat: true, seg: 56, glow: 0.35 });
      h.label(0, 0.06, 0, 2.9, 0.8, 'HUNTER', '#ffffff');
      // 奥の壁ぞい：模様の練習パネル
      [['dots', '#f0d040', '#e04f4f'], ['hstripe', '#4f7fe0', '#f4f4f4'], ['camo', '#6fae5a', ['#2e6b34', '#8a5a33', '#d8c9a3']], ['splat', '#f4f4f4', TOY], ['brick', '#d9b08c', '#b8452f'], ['zigzag', '#b06fd8', '#f4f4f4']]
        .forEach(([k, a, b], i) => h.B(-8.75 + i * 3.5, 0, -8.1, 2.8, 3, 0.35, a, { pat: [k, a, b, 2, 2], r: 0.15 }));
      // 左：くっつく練習の壁（でっぱりつき）
      h.B(-10.7, 0, -2.5, 0.5, 4.5, 6, '#7d8fb3', { pat: ['vband', '#7d8fb3', '#f4f4f4', 4, 3], r: 0.12 });
      for (const [z, y] of [[-4.5, 1.4], [-1.5, 2.4], [-3.5, 3.4]]) h.B(-10.2, y, z, 0.6, 0.18, 1.2, '#f4f4f4', { r: 0.06 });
      // 左手前：ラウンジ
      sofaZ(h, -9.6, 4.5, 3.6, '#c9573f', -1); table(h, -7.6, 4.5, 1.2, 2, '#6b4a2b', 0.45); plant(h, -9.8, 7.4);
      // 右：色見本・小物
      TOY.forEach((c, i) => h.B(10.75, 0.6 + (i % 2) * 1.3, -4 + Math.floor(i / 2) * 2.2, 0.15, 1.1, 1.8, c, NC));
      KIT.cubes(h, 8.2, 2.6, ['#e8dcc8', '#7d8fb3'], TOY);
      KIT.arch(h, 6.4, 5.9, ['#ffffff'], TOY);
      KIT.mush(h, -5.4, 6.2, ['#e04f4f']);
      h.cap(-5.6, 0, -4.6, 0.5, 1.6, '#f08a3c', { pat: ['diag', '#f08a3c', '#ffffff', 3, 2] });
      h.dome(5.8, 0, -4.4, 1.0, 0.75, 0.9, '#b06fd8', { pat: ['dots', '#b06fd8', '#f7f3ea', 3, 2], solid: true });
      for (const [x, z] of [[-10.2, -7.8], [10.2, -7.8], [-10.2, 7.8], [10.2, 7.8]]) lamp(h, x, z);
      plant(h, 9.8, 7.4); plant(h, 9.8, -7.4);
    }
  },

  /* ---------- おうち ---------- */
  house: {
    name: 'おうち', hx: 30, hz: 22, sky: '#d5dde6', kit: ['toy', 'plantK', 'screen', 'sofaK', 'shelfK', 'crate', 'stool', 'cubes', 'mural', 'mural', 'rug', 'blob', 'pole'], pal: ['#e8dcc8', '#b98d5c', '#7d8fb3', '#8fbf7a', '#f3f1ec', '#c9573f', '#3f5f8a'], clutter: 70, spawn: [0, -11],
    build(h) {
      h.F(-15, -11, 30, 22, 0, ['vstripe', '#b98d5c', '#ad8253', 15, 1]);
      h.F(15, -11, 30, 22, 0, ['checker', '#ecebe4', '#a9bcc6', 15, 11]);
      h.F(-20, 11, 20, 22, '#7d8fb3'); h.F(0, 11, 20, 22, '#8fbf7a');
      h.F(20, 11, 20, 22, 0, ['checker', '#dfe7ea', '#c5d3d9', 10, 11]);
      h.outer(6, '#efe6d6');
      const W = '#f3f1ec';
      wallX(h, 0, -30, -21.5, W); wallX(h, 0, -18.5, -1.5, W); wallX(h, 0, 1.5, 18.5, W); wallX(h, 0, 21.5, 30, W);
      wallZ(h, 0, -22, -13, W); wallZ(h, 0, -9, 0, W);
      wallZ(h, -10, 0, 9, '#e7d9c8', WALL, ['dots', '#e0719a']); wallZ(h, -10, 12, 22, '#e7d9c8', WALL, ['dots', '#e0719a']); wallZ(h, 10, 0, 9, '#d9e7e3', WALL, ['hstripe', '#59b6d8']); wallZ(h, 10, 12, 22, '#d9e7e3', WALL, ['hstripe', '#59b6d8']);
      for (const p of [[-12, -1], [12, -1], [-11.2, 21], [4, 21.3], [28.8, 11], [-28.8, -1.2], [28.5, -19]]) lamp(h, p[0], p[1]);
      // リビング
      h.B(-17, 0, -12, 9, 0.04, 7, '#a8443f', { flat: true, pat: ['diag', '#a8443f', '#d9a441', 6, 5] });
      sofaX(h, -17, -17, 5, '#3f5f8a', -1); sofaZ(h, -23, -12, 4, '#3f5f8a', -1);
      table(h, -17, -12, 2.4, 1.2, '#6b4a2b', 0.45);
      h.B(-17, 0, -6.5, 4.4, 0.6, 0.7, '#2b2b2b'); h.B(-17, 0.6, -6.5, 3, 1.6, 0.12, '#111418');
      h.B(-29.5, 0, -17, 0.9, 2.4, 4, '#8a5a33'); h.B(-29.5, 0, -6, 0.9, 2.4, 3, '#7a4c2a');
      plant(h, -28.5, -21); plant(h, -1.5, -21);
      h.B(-7, 0, -20.6, 3, 1.2, 1.4, '#15171a'); chair(h, -7, -19.2, '#3a2a1c');
      table(h, -8, -4.5, 3.6, 1.6, '#c98f4e');
      for (const dx of [-1.2, 0, 1.2]) { chair(h, -8 + dx, -3.2, '#8a5a33'); chair(h, -8 + dx, -5.8, '#8a5a33'); }
      h.B(-11.5, 0, -16.5, 1.2, 0.8, 1.2, '#d9a441'); h.cyl(-26.5, 0, -2, 0.12, 1.8, '#444a50'); h.ball(-26.5, 1.9, -2, 0.35, '#f5e9c0', { glow: 1 });
      h.B(-27, 0, -10, 1.6, 0.5, 1.6, '#7b5ea7');
      // キッチン
      h.B(17, 0, -21.4, 22, 0.95, 1.2, '#f4f4f4'); h.B(17, 0.95, -21.4, 22, 0.06, 1.25, '#3a3a3a');
      h.B(29.3, 0, -10, 1.2, 0.95, 12, '#f4f4f4'); h.B(29.3, 0.95, -10, 1.25, 0.06, 12, '#3a3a3a');
      h.B(3.2, 0, -21.2, 1.4, 2.3, 1.4, '#c9d1d6');
      h.B(15, 0, -13, 6, 0.95, 2, '#4a4f57'); h.B(15, 0.95, -13, 6.2, 0.06, 2.2, '#d8d2c4');
      for (const dx of [-2, -0.7, 0.7, 2]) h.cyl(15 + dx, 0, -11.2, 0.25, 0.65, '#e05a5a');
      table(h, 8, -5, 2.6, 1.6, '#e8dcc8'); chair(h, 7, -3.7, '#5ae0a0'); chair(h, 9, -3.7, '#5ae0a0'); chair(h, 7, -6.3, '#5ae0a0'); chair(h, 9, -6.3, '#5ae0a0');
      h.cyl(27, 0, -19.5, 0.35, 0.8, '#55606b'); h.cyl(26, 0, -19.6, 0.3, 0.7, '#3f9b6a');
      h.B(26, 0, -0.9, 5, 2.4, 0.9, '#8a6a4a'); h.B(21, 0, -6, 1, 1, 1, CARD[0]); h.B(21.2, 1, -6, 0.7, 0.7, 0.7, CARD[2]); h.B(22.2, 0, -5.6, 0.9, 0.8, 0.9, CARD[1]);
      // 寝室
      h.B(-21, 0, 13, 7, 0.04, 6, '#e8e1d2', { flat: true, pat: ['dots', '#e8e1d2', '#7d8fb3', 5, 4] });
      bed(h, -25, 18, '#5b76b8'); h.B(-23.2, 0, 19.3, 0.7, 0.6, 0.7, '#7a5a3a'); h.B(-29.3, 0, 6, 1.2, 2.6, 4, '#5a3c28');
      table(h, -14, 20.6, 3, 1.2, '#d8d0c0'); chair(h, -14, 19.3, '#444444'); h.B(-18.5, 0, 21.2, 2.4, 1, 1, '#7a5a3a');
      plant(h, -11, 1.2); h.cyl(-28.5, 0, 12, 0.4, 0.7, '#d8c9a3'); h.B(-13, 0, 6, 1.4, 0.45, 1.4, '#c9573f');
      // 子ども部屋
      h.B(0, 0, 6, 8, 0.04, 6, '#f0d040', { flat: true, pat: ['confetti', '#f0d040', TOY, 4, 3] });
      bed(h, -7, 18, '#e0719a'); bed(h, 7, 18, '#59b6d8');
      for (let i = 0; i < 14; i++) { const x = -4.5 + h.rnd() * 9, z = 3 + h.rnd() * 7, s = 0.6 + h.rnd() * 0.4; h.B(x, 0, z, s, s, s, TOY[i % 6]); if (i % 4 === 0) h.B(x, s, z, s * 0.8, s * 0.8, s * 0.8, TOY[(i + 2) % 6]); }
      h.B(0, 0, 21.3, 5, 1.4, 0.9, '#f0d040'); h.ball(3.5, 0.5, 13, 0.5, '#e04f4f', { col: true }); h.ball(-3, 0.4, 14, 0.4, '#4f7fe0', { col: true });
      h.B(-9.2, 0, 4, 0.9, 1.8, 3, '#f08a3c'); h.B(9.2, 0, 4, 0.9, 1.8, 3, '#4fbf6a');
      // 浴室・物置
      h.B(27, 0, 18, 3.2, 0.7, 5, '#ffffff'); h.B(27, 0.7, 18, 2.6, 0.02, 4.4, '#7fc4e0', NC);
      h.B(12, 0, 20.8, 1, 1.1, 1, '#e9edf0'); h.B(13.2, 0, 20.8, 1, 1.1, 1, '#d5dbe0'); h.B(29.4, 0, 6, 1, 2.2, 5, '#9aa7b0');
      h.cyl(15.5, 0, 20.5, 0.45, 0.7, '#d8c9a3'); h.cyl(22, 0, 13, 0.4, 0.5, '#5fa8d8');
      for (let i = 0; i < 9; i++) { const x = 12.5 + (i % 3) * 1.25, z = 2 + Math.floor(i / 3) * 1.25; h.B(x, 0, z, 1.1, 1, 1.1, CARD[i % 4]); if (i % 2) h.B(x, 1, z, 0.9, 0.8, 0.9, CARD[(i + 1) % 4]); }
      h.B(20, 0, 5, 2.2, 0.9, 0.8, '#f4f4f4'); h.B(23, 0, 21, 4, 0.04, 1.6, '#5fa8d8', { flat: true });
    }
  },

  /* ---------- 公園 ---------- */
  park: {
    name: '公園', hx: 36, hz: 28, sky: '#8fc8f0', dark: 0.95, floorTex: 'grass', kit: ['bush', 'bush', 'rock', 'planter', 'crate', 'barrel', 'screen', 'mush', 'mush', 'mural', 'blob', 'arch', 'flowers', 'pole'], pal: ['#6fae5a', '#8d8f94', '#8a5a33', '#2e6b34', '#d8c9a3'], clutter: 100, spawn: [0, -6],
    build(h) {
      h.F(0, 0, 72, 56, '#6fae5a');
      h.outer(6, '#3c6e3a');
      h.B(0, 0, 0, 72, 0.03, 3.4, '#d8c9a3', FL); h.B(0, 0, 0, 3.4, 0.03, 56, '#d8c9a3', FL);
      h.cyl(0, 0, 0, 5.2, 0.035, '#d8c9a3', FL);
      h.cyl(0, 0, 0, 3.2, 0.55, '#b9c0c7'); h.cyl(0, 0.55, 0, 2.8, 0.04, '#5fa8d8', NC); h.cyl(0, 0, 0, 0.5, 2.2, '#aab2ba');
      // 池
      h.cyl(22, 0, -15, 6.5, 0.04, '#4f95c9', FL);
      for (let i = 0; i < 9; i++) { const a = i * 0.7; h.B(22 + Math.cos(a) * 7, 0, -15 + Math.sin(a) * 7, 0.9 + h.rnd(), 0.5 + h.rnd() * 0.6, 0.9 + h.rnd(), '#8d8f94'); }
      // 遊具
      h.F(-22, 15, 18, 16, '#e2cf9c', null, 1);
      h.B(-28, 0, 10, 1.4, 2.1, 1.4, '#e04f4f'); h.B(-26.2, 0, 10, 2.2, 1.4, 1.1, '#f0d040'); h.B(-24.2, 0, 10, 1.8, 0.7, 1.1, '#f0d040');
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) h.B(-18 + i * 1.25, 0, 18 + j * 1.25, 1.1, 0.9 + ((i + j) % 3) * 0.7, 1.1, TOY[(i * 3 + j) % 6]);
      h.B(-28, 0, 20, 0.2, 2.6, 0.2, '#4f7fe0'); h.B(-23.6, 0, 20, 0.2, 2.6, 0.2, '#4f7fe0'); h.B(-25.8, 2.6, 20, 4.6, 0.2, 0.2, '#4f7fe0', NC);
      h.B(-27, 0.5, 20, 0.7, 0.1, 0.4, '#e04f4f', NC); h.B(-24.6, 0.5, 20, 0.7, 0.1, 0.4, '#e04f4f', NC);
      h.B(-21, 0, 12, 4, 0.5, 0.4, '#4fbf6a'); h.cyl(-16, 0, 11, 1.2, 0.45, '#b06fd8'); h.B(-15, 0, 24, 3, 0.35, 3, '#8a5a33');
      // 生け垣の迷路
      for (let k = 0; k < 5; k++) h.B(-23 + (k % 2 ? 3 : -3), 0, -24 + k * 4, 16, 1.9, 0.9, '#2e6b34');
      h.B(-33, 0, -16, 0.9, 1.9, 16, '#2e6b34'); h.B(-13, 0, -14, 0.9, 1.9, 12, '#2e6b34');
      // 木とやぶ
      let n = 0, guard = 0;
      while (n < 30 && guard++ < 400) {
        const x = -33 + h.rnd() * 66, z = -25 + h.rnd() * 50;
        if (Math.abs(x) < 4 || Math.abs(z) < 4 || Math.hypot(x, z) < 8) continue;
        if (x < -11 && z < -4) continue; if (x < -11 && z > 6) continue; if (Math.hypot(x - 22, z + 15) < 9) continue; if (x > 18 && z > 12) continue;
        tree(h, x, z, 0.8 + h.rnd() * 0.5); n++;
      }
      for (let i = 0; i < 16; i++) { const x = -33 + h.rnd() * 66, z = -25 + h.rnd() * 50; if (Math.abs(x) < 3 || Math.abs(z) < 3 || (x < -11 && z < -4)) continue; const s = 1 + h.rnd() * 0.8; h.B(x, 0, z, s, 0.8 + h.rnd() * 0.5, s, i % 2 ? '#3b8f46' : '#2f7d3a'); }
      // ベンチ・花だん
      for (const x of [-28, -18, -9, 9, 18, 28]) { h.B(x, 0, 2.6, 2, 0.5, 0.6, '#8a5a33'); h.B(x, 0.5, 2.85, 2, 0.5, 0.12, '#8a5a33'); }
      for (const z of [-20, -11, 11, 20]) h.B(-2.7, 0, z, 0.6, 0.5, 2, '#8a5a33');
      [[8, -8, '#e0719a'], [-8, -8, '#f0d040'], [8, 8, '#e04f4f'], [-8, 8, '#b06fd8']].forEach(f => { h.B(f[0], 0, f[1], 4, 0.4, 4, '#6b4a2b'); h.B(f[0], 0.4, f[1], 3.6, 0.25, 3.6, f[2]); });
      // 小屋とピクニック
      h.B(27, 0, 21, 7, 3.2, 6, '#9b6b43'); h.B(27, 3.2, 21, 7.8, 0.4, 6.8, '#5a3c28', NC);
      for (const p of [[13, 14], [18, 20], [12, 23]]) { table(h, p[0], p[1], 2.4, 1.2, '#b08a5a'); h.B(p[0], 0, p[1] - 1.1, 2.4, 0.42, 0.4, '#b08a5a'); h.B(p[0], 0, p[1] + 1.1, 2.4, 0.42, 0.4, '#b08a5a'); }
      h.B(31, 0, -2, 4, 3, 4.5, '#d9d2c4'); h.B(27.6, 0, -3, 0.9, 1.9, 0.8, '#e04f4f'); h.B(27.6, 0, -1.6, 0.9, 1.9, 0.8, '#4f7fe0');
      h.cyl(5, 0, 5, 0.35, 0.8, '#55606b'); h.cyl(-5, 0, -5, 0.35, 0.8, '#55606b'); h.cyl(21, 0, 3, 0.35, 0.8, '#3f9b6a');
      for (const p of [[6, -20], [-6, 20], [30, 8], [-30, 3]]) { h.cyl(p[0], 0, p[1], 0.1, 3.4, '#444a50'); h.ball(p[0], 3.5, p[1], 0.3, '#fff4c2', { glow: 1 }); }
    }
  },

  /* ---------- 学校 ---------- */
  school: {
    name: '学校', hx: 34, hz: 26, sky: '#d5dde6', kit: ['shelfK', 'crate', 'screen', 'toy', 'stool', 'plantK', 'mural', 'mural', 'cubes', 'rug', 'pole', 'blob'], pal: ['#f2efe6', '#c9a26b', '#d7b47c', '#5f87b8', '#b85f5f', '#cfe0d3'], clutter: 70, spawn: [0, 0],
    build(h) {
      h.F(0, 0, 68, 6, '#d9d4c7');
      h.F(0, -14.5, 68, 23, 0, ['vstripe', '#c9a26b', '#bf9860', 34, 1]);
      h.F(-21, 14.5, 26, 23, 0, ['vstripe', '#c9a26b', '#bf9860', 13, 1]);
      h.F(13, 14.5, 42, 23, '#d9a55a');
      h.outer(6, '#f2efe6');
      const W = '#f2efe6', G = '#cfe0d3';
      wallX(h, -3, -34, -24.5, W); wallX(h, -3, -21.5, -1.5, W); wallX(h, -3, 1.5, 21.5, W); wallX(h, -3, 24.5, 34, W);
      wallX(h, 3, -34, -22.5, G); wallX(h, 3, -19.5, 28.5, G); wallX(h, 3, 31.5, 34, G);
      wallZ(h, -11.5, -26, -3, W); wallZ(h, 11.5, -26, -3, W); wallZ(h, -8, 3, 26, G, WALL, ['splat', TOY]); // 図工室の壁はペンキのしぶき
      // 教室 ×3
      [-23, 0, 23].forEach((cx, r) => {
        const cc = ['#4f7fe0', '#e04f4f', '#4fbf6a'][r];
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = cx - 6 + i * 4, z = -8 - j * 3.4; h.B(x, 0, z, 1.3, 0.75, 0.8, '#d7b47c'); h.B(x, 0, z + 0.85, 0.5, 0.45, 0.5, cc); }
        h.B(cx, 0, -23, 2.6, 0.8, 1, '#8a5a33'); h.B(cx, 1, -25.8, 9, 1.7, 0.15, '#2f5d46', NC); h.B(cx, 0.9, -25.6, 9, 0.08, 0.3, '#c9a26b', NC);
        h.B(cx + 9.5, 0, -12, 1, 1.6, 6, '#b08a5a'); h.B(cx - 9.5, 0, -22, 1, 2, 2.4, '#55606b'); h.B(cx + 6, 0, -24, 1.2, 1.1, 1.2, '#e9edf0');
      });
      // 廊下のロッカー
      for (let x = -32; x <= 32; x += 3.2) { if ([-23, 0, 23].some(d => Math.abs(x - d) < 3)) continue; h.B(x, 0, -2.5, 2.6, 1.9, 0.5, Math.round(x) % 2 ? '#5f87b8' : '#b85f5f'); }
      for (let x = -32; x <= 32; x += 6.4) { if ([-21, 30].some(d => Math.abs(x - d) < 3.2)) continue; h.B(x, 0, 2.55, 2, 0.5, 0.5, '#8a5a33'); }
      plant(h, -33, 0); plant(h, 33, 0);
      // 図工室
      for (const p of [[-27, 9], [-15, 9], [-27, 17], [-15, 17]]) { table(h, p[0], p[1], 4, 2, '#e8dcc8'); for (const dx of [-1.2, 1.2]) { h.cyl(p[0] + dx, 0, p[1] - 1.5, 0.25, 0.45, '#55606b'); h.cyl(p[0] + dx, 0, p[1] + 1.5, 0.25, 0.45, '#55606b'); } }
      h.B(-21, 0, 25.3, 14, 0.95, 1.2, '#f4f4f4'); h.B(-33.3, 0, 14, 1, 2.2, 8, '#8a5a33');
      TOY.forEach((c, i) => h.cyl(-26 + i * 1.6, 0.95, 25.3, 0.3, 0.45, c));
      h.B(-10, 0, 22, 1.4, 1.8, 0.2, '#e8dcc8'); h.B(-10, 0, 19, 1.4, 1.8, 0.2, '#e8dcc8'); h.B(-9.2, 0, 6, 1.6, 1.2, 3, '#b08a5a');
      // 体育館
      h.B(13, 0, 14.5, 0.15, 0.02, 23, '#ffffff', FL); h.cyl(13, 0, 14.5, 3, 0.02, '#c98f4e', FL);
      h.B(-6.6, 0, 14.5, 0.3, 3.6, 0.3, '#888e94'); h.B(-6.2, 2.7, 14.5, 0.15, 1.2, 1.8, '#ffffff', NC);
      h.B(32.6, 0, 14.5, 0.3, 3.6, 0.3, '#888e94'); h.B(32.2, 2.7, 14.5, 0.15, 1.2, 1.8, '#ffffff', NC);
      for (let k = 0; k < 3; k++) h.B(13, 0, 4.2 + k * 0.9, 26, 0.45 * (3 - k), 0.9, '#b08a5a');
      for (let k = 0; k < 4; k++) h.B(2, k * 0.4, 23, 2.2 - k * 0.2, 0.4, 1.2, k % 2 ? '#e04f4f' : '#f4f4f4');
      h.B(8, 0, 23.5, 3, 0.25, 2, '#3f6fc9'); h.B(8.3, 0.25, 23.5, 3, 0.25, 2, '#3f6fc9'); h.B(12, 0, 24, 3, 0.25, 2, '#3f9b6a');
      h.B(30, 0, 23, 2.4, 1.2, 2.4, '#c0c6cc'); for (let i = 0; i < 5; i++) h.ball(20 + i * 1.1, 0.35, 24.5, 0.35, i % 2 ? '#f08a3c' : '#e04f4f', { col: true });
      h.B(24, 0, 8, 1.6, 1.1, 0.5, '#f0d040'); h.B(27, 0, 8, 1.6, 1.1, 0.5, '#f0d040'); h.B(-2, 0, 8, 3, 1, 1.4, '#5a3c28');
    }
  },

  /* ---------- 倉庫 ---------- */
  warehouse: {
    name: '倉庫', hx: 36, hz: 26, sky: '#39424d', dark: 0.62, floorTex: 'concrete', kit: ['crate', 'crate', 'barrel', 'pillar', 'tiresK', 'screen', 'mural', 'cubes', 'pole'], acc: ['#b8452f', '#2f6fb0', '#3f9b6a', '#d98a2b', '#e0c030', '#f4f4f4'], pal: ['#8a8d91', '#70757b', '#2f6fb0', '#d98a2b', '#b8452f', '#3d5f93'], clutter: 110, spawn: [3, 1],
    build(h) {
      h.F(0, 0, 72, 52, '#8a8d91');
      h.outer(7, '#70757b');
      h.B(0, 0, 0, 72, 0.02, 0.3, '#e0c030', FL); h.B(-4, 0, 0, 0.3, 0.02, 52, '#e0c030', FL); h.B(4, 0, 0, 0.3, 0.02, 52, '#e0c030', FL);
      // コンテナ
      let k = 0;
      for (const x of [-30, -22.5, -15]) for (const z of [-21, -15, -9]) { h.B(x, 0, z, 6, 2.6, 2.5, CONT[k % 7]); if (h.rnd() < 0.45) h.B(x, 2.6, z, 6, 2.6, 2.5, CONT[(k + 3) % 7]); k++; }
      for (const z of [8, 15, 22]) { h.B(-31, 0, z, 2.5, 2.6, 6, CONT[k++ % 7]); }
      // ラック
      for (const x of [9, 15, 21, 27, 33]) {
        for (const z of [-21.5, -7.5]) h.B(x, 0, z, 1.4, 3.8, 0.2, '#3d5f93');
        h.B(x, 0, -14.5, 1.4, 3.8, 0.2, '#3d5f93');
        h.B(x, 1.3, -14.5, 1.5, 0.1, 14, '#e08a2b'); h.B(x, 2.6, -14.5, 1.5, 0.1, 14, '#e08a2b');
        for (let i = 0; i < 5; i++) { const z = -20.5 + i * 3 + h.rnd(), s = 0.8 + h.rnd() * 0.4; h.B(x, 0, z, s, s, s, CARD[i % 4]); if (h.rnd() < 0.6) h.B(x, 1.4, z + 1, s, s * 0.9, s, CARD[(i + 1) % 4]); if (h.rnd() < 0.4) h.B(x, 2.7, z - 0.5, s, s * 0.8, s, CARD[(i + 2) % 4]); }
      }
      // パレット
      for (let x = -22; x <= 14; x += 5.2) for (let z = 6; z <= 22; z += 5.4) {
        if (h.rnd() < 0.2) continue;
        h.B(x, 0, z, 1.7, 0.15, 1.7, '#b08a5a'); const s = 1.2 + h.rnd() * 0.3, lv = 1 + Math.floor(h.rnd() * 2.4);
        for (let i = 0; i < lv; i++) h.B(x, 0.15 + i * 1.0, z, s - i * 0.15, 1.0, s - i * 0.15, CARD[Math.floor(h.rnd() * 4)]);
      }
      for (const p of [[-18, 0], [18, 0], [-26, 3.5], [2, -24], [-9, -12.5], [30, 9], [0, 12], [-22, 24.5]]) lamp(h, p[0], p[1], 3.2);
      // ドラム缶・フォークリフト・柱
      for (let i = 0; i < 10; i++) h.cyl(-33 + (i % 4) * 1.15, 0, -3.5 + Math.floor(i / 4) * 1.15, 0.5, 1.2, ['#2f6fb0', '#d98a2b', '#b8452f'][i % 3]);
      for (const p of [[-8, -3], [18, 3]]) { h.B(p[0], 0, p[1], 1.4, 1.3, 2.4, '#e0b020'); h.B(p[0], 1.3, p[1] + 0.3, 1.2, 0.9, 1.2, '#2a3038'); h.B(p[0], 0, p[1] - 1.5, 1.2, 2.6, 0.2, '#2a3038'); h.B(p[0], 0.1, p[1] - 2.2, 1.1, 0.08, 1.2, '#55606b', NC); }
      for (const x of [-18, 0, 18]) for (const z of [-4, 4]) h.B(x, 0, z, 0.8, 7, 0.8, '#70757b');
      // 事務所
      wallX(h, 12, 22, 29, '#d8d2c4', 3.2); wallX(h, 12, 32, 36, '#d8d2c4', 3.2); wallZ(h, 22, 12, 26, '#d8d2c4', 3.2);
      h.F(29, 19, 14, 14, '#5b76b8', null, 1);
      table(h, 30, 22, 3, 1.4, '#c98f4e'); chair(h, 30, 20.6, '#2a3038'); h.B(35.2, 0, 18, 1, 2, 4, '#8d8f94'); h.B(23.2, 0, 23, 1, 1.2, 3, '#9aa7b0'); plant(h, 34.5, 13.5);
      // トラック
      h.B(28, 0.5, 4, 8, 2.8, 2.6, '#e9edf0'); h.B(33.2, 0.5, 4, 2.2, 2, 2.4, '#b8452f');
      for (const dx of [-3, 0, 4.6]) for (const dz of [-1.2, 1.2]) h.B(28 + dx, 0, 4 + dz, 0.9, 0.9, 0.3, '#15171a', NC);
      h.B(-12, 0, 2, 2.4, 1.2, 1.4, '#3f9b6a'); h.B(8, 0, 24.8, 5, 1, 1, '#55606b');
    }
  },

  /* ---------- 夜の商店街（模様の外壁・日よけ・ベランダ・看板・屋上・中庭の街） ---------- */
  town: {
    name: '夜の商店街', hx: 36, hz: 28, sky: '#0b1024', night: true, dark: 0.5, floorTex: 'asphalt', kit: ['crate', 'barrel', 'planter', 'vend', 'screen', 'mural', 'pole', 'cubes', 'blob', 'bush'], pal: ['#b9b7b0', '#4a4d52', '#d9b08c', '#c97b63', '#9fb7c4', '#8a5a33'], clutter: 40, spawn: [12, 0],
    build(h) {
      h.F(0, 0, 72, 56, '#4a4d52');
      h.outer(9, '#8d8f94');
      city(h, { pal: ['#d9b08c', '#c97b63', '#e8dcc8', '#9fb7c4', '#b5c99a', '#d8a7b1', '#c9c2b0', '#a7b8d8', '#e0c48c', '#b89c84'], acc: ['#e04f4f', '#3f9b6a', '#2f6fb0', '#f08a3c', '#b06fd8', '#f0d040'], night: true, neon: false, facade: ['brick', 'vband', 'hstripe', 'check2', 'dots', 'wave', 'diag'], hmin: 5, hmax: 9 });
      h.ball(-60, 50, -70, 5, '#fff6d8', { glow: 1.6, nolight: true });
    }
  },
  /* ---------- ガソリンスタンド（まんたんステーションより） ---------- */
  station: {
    name: 'ガソリンスタンド', hx: 34, hz: 26, sky: '#a9d4ee', floorTex: 'asphalt', kit: ['crate', 'barrel', 'tiresK', 'planter', 'pylonK', 'vend', 'screen', 'mural', 'mural', 'pole', 'cubes'], pal: ['#5a5d62', '#e0413a', '#f4f4f4', '#eee9df', '#b9c0c7', '#2f6fb0'], clutter: 90, spawn: [0, 13],
    build(h) {
      h.F(0, 0, 68, 52, '#5a5d62'); h.outer(7, '#b9c0c7');
      h.F(0, 21, 68, 10, '#44474c', ['img:road', '#44474c', 0.2, 8, 1.2], 1);
      h.B(0, 0, 15.4, 68, 0.15, 1.2, '#b9b7b0', { flat: true });
      // コンビニ
      const W = '#eee9df';
      h.F(0, -17, 28, 18, '#e9e7df', ['img:tile', '#ffffff', 0.05, 7, 4.5], 1);
      wallZ(h, -14, -26, -8, W); wallZ(h, 14, -26, -8, W); wallX(h, -8, -14, -2, W); wallX(h, -8, 2, 14, W); wallX(h, -19, -14, 9, W);
      h.B(0, 3.5, -7.6, 12, 0.9, 0.3, '#e0413a', { nocol: true, glow: 0.7 }); h.B(0, 3.5, -7.4, 5, 0.5, 0.1, '#ffffff', { nocol: true, glow: 1 });
      [-9, -4.5, 4.5, 9].forEach((x, i) => { for (const z of [-11.5, -15]) { h.B(x, 0, z, 3.4, 1.5, 0.8, '#d9d2c4'); h.B(x, 1.5, z, 3.2, 0.25, 0.6, TOY[(i + (z < -12 ? 3 : 0)) % 6]); } });
      h.B(0, 0, -13.2, 2.4, 1.1, 1.2, '#f4f4f4'); for (let i = 0; i < 3; i++) h.ball(-0.7 + i * 0.7, 1.3, -13.2, 0.25, TOY[i], { col: true });
      h.B(-9.5, 0, -9.3, 5, 1, 1, '#3f5f8a'); h.B(-10.5, 1, -9.3, 0.5, 0.35, 0.5, '#22262b'); h.B(-8.5, 1, -9.3, 0.5, 0.35, 0.5, '#22262b');
      h.B(-13.3, 0, -14.5, 0.9, 2.2, 7, '#cfe6f0', { glow: 0.25 }); h.B(12.9, 0, -10.5, 1.2, 1.4, 3, '#3a3a3a'); h.cyl(12.9, 1.4, -10, 0.2, 0.4, '#e0413a');
      for (let i = 0; i < 10; i++) { const x = -12 + (i % 5) * 2.1, z = -21.5 - Math.floor(i / 5) * 2.2; h.B(x, 0, z, 1, 0.9, 1, CARD[i % 4]); if (i % 3 === 0) h.B(x, 0.9, z, 0.85, 0.8, 0.85, CARD[(i + 1) % 4]); }
      h.B(3, 0, -25.3, 7, 2.2, 0.9, '#55606b'); table(h, 11.5, -24, 2.4, 1.2, '#c98f4e'); h.B(11.5, 0.76, -24.2, 0.9, 0.6, 0.12, '#15171a'); chair(h, 11.5, -22.7, '#2a3038');
      // キャノピーと給油機
      for (const x of [-12.5, 12.5]) for (const z of [0.5, 9.5]) h.cyl(x, 0, z, 0.32, 5.2, '#e9edf0');
      h.B(0, 5.2, 5, 28, 0.7, 12, '#f4f4f4', { r: 0.3 }); h.B(0, 5.25, 5, 28.3, 0.3, 12.3, '#e0413a', NC);
      for (const x of [-8, 0, 8]) { pump(h, x, 5); h.B(x, 5.1, 5, 3.4, 0.08, 1.4, '#fff4c2', { nocol: true, glow: 1.6 }); }
      car(h, -4, 5, '#2f6fb0', false); car(h, 4, 3.5, '#f0d040', false); car(h, -26, -15, '#b8262b', false); car(h, -22.5, -15, '#e9edf0', false);
      // 店の前
      h.B(5, 0, -7.2, 1, 1.9, 0.8, '#e0413a', { r: 0.1 }); h.B(6.2, 0, -7.2, 1, 1.9, 0.8, '#2f6fb0', { r: 0.1 }); h.B(7.4, 0, -7.2, 1, 1.9, 0.8, '#f4f4f4', { r: 0.1 });
      h.B(10.5, 0, -7.1, 2.2, 1, 1, '#cfe6f0'); h.B(-6, 0, -7.2, 2.2, 0.5, 0.6, '#8a5a33'); h.cyl(-8.5, 0, -7.2, 0.35, 0.85, '#55606b'); h.cyl(-9.4, 0, -7.2, 0.35, 0.85, '#3f9b6a');
      h.B(-3.2, 0, -6, 0.9, 1.2, 0.3, '#f0d040'); h.cyl(-14.7, 0, -12, 0.09, 1.1, '#8d8f94'); h.B(-14.35, 1.4, -12, 0.1, 0.6, 0.6, '#2f6fb0', NC);
      h.cyl(-15.6, 0, -11.2, 0.2, 0.32, '#7f8a94'); h.cyl(-16.2, 0, -12, 0.2, 0.32, '#7f8a94'); h.cyl(-15.4, 0, -13, 0.03, 1.4, '#c99a5b');
      // 看板・洗車機・タイヤ
      h.cyl(-28, 0, 12, 0.3, 7, '#8d8f94'); h.B(-28, 5, 12, 4.2, 2.6, 0.5, '#e0413a', { glow: 0.5, r: 0.2 }); h.B(-28, 3.3, 12, 3.6, 1.3, 0.45, '#f4f4f4');
      h.B(20, 0, 2, 1, 1.6, 1, '#f08a3c'); tires(h, 22, 6); tires(h, 23.1, 6.6, 4); tires(h, 21.6, 7.3, 2); tires(h, -18, 9, 3);
      h.B(27.5, 0, 2, 0.5, 3.4, 10, '#3f9b6a'); h.B(33.2, 0, 2, 0.5, 3.4, 10, '#3f9b6a'); h.B(30.35, 3.4, 2, 6.2, 0.4, 10, '#3f9b6a', NC);
      h.cyl(28.6, 0, 0, 0.55, 3, '#4f7fe0'); h.cyl(32.1, 0, 0, 0.55, 3, '#4f7fe0'); h.cyl(28.6, 0, 4, 0.55, 3, '#e04f4f'); h.cyl(32.1, 0, 4, 0.55, 3, '#e04f4f');
      h.B(24, 0.5, -19, 3, 2.8, 8, '#e9edf0', { r: 0.25 }); h.B(24, 0.5, -13.8, 2.7, 2, 2.2, '#2f6fb0', { r: 0.3 });
      for (const dz of [-22, -16.5, -13.6]) for (const dx of [-1.4, 1.4]) h.wheel(24 + dx, 0.5, dz, 0.5, 0.35, 'x');
      h.B(-30, 0, -23, 3, 1.5, 1.8, '#2f6f5a'); h.B(19, 0, -24.5, 1.7, 0.15, 1.7, '#b08a5a'); h.B(19, 0.15, -24.5, 1.4, 1.1, 1.4, CARD[1]);
      tree(h, -31, 3); tree(h, -31, -5, 1.2); tree(h, 31, -23); tree(h, 17, -23, 0.9); tree(h, -19, -23, 1.1);
      lamp(h, -20, 14.7, 4.2); lamp(h, 20, 14.7, 4.2); lamp(h, -31, -11, 3.6); lamp(h, 16.5, -9, 3.2);
      car(h, -18, 20, '#3f9b6a', true); car(h, 14, 23, '#7b5ea7', true);
      for (let x = -32; x <= 32; x += 4) h.B(x, 0.02, 21, 2, 0.02, 0.25, '#ffffff', FL);
      for (let i = 0; i < 5; i++) pylon(h, 15 + i * 1.2, 11);
    }
  },

  /* ---------- サーキット（レースマスター「マスター・サーキット」より） ---------- */
  circuit: {
    name: 'サーキット', hx: 38, hz: 28, sky: '#a8d6f5', floorTex: 'grass', kit: ['tiresK', 'pylonK', 'bush', 'crate', 'barrel', 'rock', 'screen', 'mural', 'arch', 'pole', 'flowers', 'mush'], pal: ['#5fa84f', '#45474e', '#e0413a', '#ffffff', '#b8bcc6', '#8d8f94'], clutter: 90, spawn: [0, 0],
    build(h) {
      h.F(0, 0, 76, 56, '#5fa84f'); h.outer(7, '#3c6e3a');
      const RD = '#45474e';
      h.B(0, 0, -15, 44, 0.03, 9, RD, FL); h.B(0, 0, 15, 44, 0.03, 9, RD, FL);
      for (const sx of [-1, 1]) { h.cyl(sx * 22, 0, 0, 19.5, 0.03, RD, FL); h.cyl(sx * 22, 0.03, 0, 10.5, 0.02, '#5fa84f', FL); }
      h.B(0, 0.03, 0, 44, 0.02, 21, '#5fa84f', FL);
      for (let x = -20; x <= 20; x += 4) { h.B(x, 0.03, -15, 2, 0.02, 0.25, '#ffffff', FL); h.B(x, 0.03, 15, 2, 0.02, 0.25, '#ffffff', FL); }
      for (let x = -21; x <= 21; x += 2) { h.B(x, 0, -19.7, 1.9, 0.12, 0.4, Math.round(x / 2) % 2 ? '#e0413a' : '#ffffff', FL); h.B(x, 0, 10.3, 1.9, 0.12, 0.4, Math.round(x / 2) % 2 ? '#e0413a' : '#ffffff', FL); }
      // スタートゲート
      h.cyl(-3, 0, -20.2, 0.3, 5, '#e9edf0'); h.cyl(-3, 0, -9.8, 0.3, 5, '#e9edf0');
      h.B(-3, 5, -15, 1, 1.2, 11.6, 0, { nocol: true, pat: ['checker', '#ffffff', '#15171a', 1, 6] });
      h.B(-3, 0.035, -15, 1.2, 0.02, 9, 0, { nocol: true, flat: true, pat: ['checker', '#ffffff', '#15171a', 1, 5] });
      // 観客席
      for (const cx of [-13, 13]) for (let r = 0; r < 4; r++) {
        h.B(cx, 0, -22.5 - r * 1.3, 20, 0.7 + r * 0.7, 1.3, '#b8bcc6');
        for (let k = 0; k < 9; k++) h.ball(cx - 8.5 + k * 2.1 + (r % 2), 0.7 + r * 0.7 + 0.35, -22.5 - r * 1.3, 0.32, TOY[(k + r * 2) % 6], { col: true });
      }
      // 湖と丘
      h.cyl(8, 0.05, 1, 6.5, 0.03, '#4f95c9', FL); h.cyl(13, 0.05, -1, 4, 0.03, '#4f95c9', FL);
      h.dome(-10, 0, 1, 6.5, 3.4, 5, '#4f9a45'); h.dome(-17, 0, -2, 4, 2.4, 3.6, '#58a84c'); h.dome(22, 0, 0, 5, 3, 5, '#4f9a45'); h.dome(-22, 0, 1, 4.5, 2.6, 4.5, '#58a84c');
      for (let i = 0; i < 7; i++) { const a = i * 0.9; h.B(8 + Math.cos(a) * 7.4, 0, 1 + Math.sin(a) * 7, 0.9 + h.rnd() * 0.7, 0.5 + h.rnd() * 0.5, 0.9 + h.rnd() * 0.7, '#8d8f94', { r: 0.3 }); }
      // タイヤバリア・パイロン・カート
      for (const sx of [-1, 1]) for (let i = -4; i <= 4; i++) { const a = i * 0.32; tires(h, sx * (22 + Math.cos(a) * 15.2), Math.sin(a) * 15.2, 2 + (Math.abs(i) % 2)); }
      for (let i = 0; i < 8; i++) { pylon(h, -18 + i * 1.5, 10.9); pylon(h, 6 + i * 1.5, 19.2); }
      kart(h, 2, -13, '#e04f4f'); kart(h, 4.5, -16.5, '#4f7fe0'); kart(h, 7, -13, '#f0d040'); kart(h, 9.5, -16.5, '#4fbf6a'); kart(h, -24, 14, '#b06fd8'); kart(h, 16, 16, '#f08a3c');
      // ピット
      h.B(0, 0, 26.9, 30, 3.6, 0.4, '#d9d2c4'); h.B(0, 3.2, 24.6, 30.4, 0.4, 5, '#b8bcc6'); for (let i = 0; i <= 5; i++) h.B(-15 + i * 6, 0, 24.6, 0.4, 3.2, 4.6, '#d9d2c4');
      for (let i = 0; i < 5; i++) { h.B(-12 + i * 6, 0, 26.2, 3.6, 1, 0.8, ['#b8452f', '#2f6fb0'][i % 2], { r: 0.08 }); tires(h, -13.6 + i * 6, 24.4, 2 + i % 3); if (i % 2) kart(h, -11.4 + i * 6, 24.2, TOY[i]); h.B(-12 + i * 6, 2.9, 22.2, 4.4, 0.5, 0.2, TOY[i], { nocol: true, glow: 0.5 }); }
      for (let i = 0; i < 6; i++) { h.cyl(-17 + i * 0.95, 0, 21, 0.4, 1.1, ['#b8452f', '#2f6fb0'][i % 2]); h.B(15 + (i % 3) * 1.3, Math.floor(i / 3) * 0.9, 21, 1.1, 0.9, 1.1, '#b8452f', { r: 0.1 }); }
      tires(h, -20.5, 22.5, 4); tires(h, -21.7, 23, 3); tires(h, 21, 23, 4); h.B(20, 0, 20.5, 2.2, 0.9, 1, '#55606b');
      // 表彰台・アイテムボックス・ジャンプ台
      h.B(27, 0, 22, 1.6, 1.2, 1.6, '#f0d040'); h.B(25.4, 0, 22, 1.6, 0.8, 1.6, '#c0c6cc'); h.B(28.6, 0, 22, 1.6, 0.5, 1.6, '#c98f4e');
      for (let i = 0; i < 4; i++) { h.B(-9 + i * 2.2, 0.5, 15, 1, 1, 1, TOY[i + 1], { glow: 0.9, r: 0.2 }); h.B(-34, 0.5, -6 + i * 4, 1, 1, 1, TOY[i], { glow: 0.9, r: 0.2 }); }
      for (let k = 0; k < 3; k++) h.B(12 + k * 1.5, 0, -15, 1.5, 0.3 + k * 0.3, 7, '#f08a3c');
      h.B(-12, 0.035, -15, 3, 0.02, 3, '#ffd23a', { nocol: true, flat: true, glow: 1.2 }); h.B(30, 0.035, 9, 3, 0.02, 3, '#ffd23a', { nocol: true, flat: true, glow: 1.2 });
      // 木・旗・雲・太陽
      for (const p of [[-34, -24], [-30, -25], [34, -24], [35, 22], [-35, 23], [-30, 25], [0, 5], [3, -5], [-3, -4], [31, 25], [-36, 10], [36, -10]]) tree(h, p[0], p[1], 0.8 + h.rnd() * 0.5);
      for (const x of [-22, -8, 8, 22]) { h.cyl(x, 0, -27, 0.07, 6, '#e9edf0'); h.B(x + 0.7, 5, -27, 1.4, 0.9, 0.06, TOY[(x + 22) / 2 % 6 | 0], NC); }
      for (let k = 0; k < 9; k++) h.dome(-50 + k * 13 + h.rnd() * 6, 30 + h.rnd() * 8, -30 + h.rnd() * 60, 7 + h.rnd() * 5, 2 + h.rnd(), 4 + h.rnd() * 3, '#ffffff', { nocol: true, sky: true });
      h.ball(60, 55, 40, 6, '#fff4c2', { glow: 2, nolight: true });
    }
  },

  /* ---------- 古代の砂漠（レースマスター「古代の砂漠」より） ---------- */
  desert: {
    name: '古代の砂漠', hx: 38, hz: 28, sky: '#f2cc8f', kit: ['rock', 'rock', 'pot', 'pillar', 'crate', 'screen', 'mural', 'mural', 'blob', 'pole'], acc: ['#b8452f', '#2f6fb0', '#f0d040', '#efe2c4', '#8a5a33', '#3fa0c9'], pal: ['#d6ab66', '#c9a36a', '#b8905a', '#ddb672'], clutter: 110, spawn: [0, 4],
    build(h) {
      const S = '#d6ab66', ST = '#c9a36a', ST2 = '#b8905a';
      h.F(0, 0, 76, 56, S); h.outer(7, '#c49a5e');
      // ピラミッド
      h.cone(-24, 0, -16, 11, 11, ST, { seg: 4, cw: 0.62 }); h.cone(22, 0, -18, 8.5, 8.5, ST2, { seg: 4, cw: 0.62 }); h.cone(28, 0, 14, 6, 6, ST, { seg: 4, cw: 0.62 });
      for (let k = 0; k < 5; k++) h.B(-22, k * 1.0, 16, 12 - k * 2.2, 1.0, 12 - k * 2.2, k % 2 ? ST : ST2, { r: 0.12 });
      h.B(-22, 5, 16, 1.4, 1.6, 1.4, '#f0d040', { glow: 0.5, r: 0.3 });
      // 神殿の柱と石
      for (let i = 0; i < 6; i++) { const x = -6 + (i % 3) * 6, z = -20 + Math.floor(i / 3) * 6; h.B(x, 0, z, 1.6, 0.4, 1.6, ST2); h.cyl(x, 0.4, z, 0.55, i === 4 ? 2 : 4.2, ST, { rt: 0.48 }); if (i !== 4) h.B(x, 4.6, z, 1.5, 0.35, 1.5, ST2); }
      h.B(0, 4.95, -20, 14.5, 0.6, 1.6, ST2, NC); h.B(3, 0, -12.5, 0.9, 0.9, 3.6, ST, { r: 0.4 });
      for (let i = 0; i < 16; i++) { const x = -34 + h.rnd() * 68, z = -24 + h.rnd() * 48, s = 0.8 + h.rnd() * 1.3; if (Math.hypot(x, z - 4) < 5) continue; h.B(x, 0, z, s, s * (0.5 + h.rnd() * 0.6), s * (0.8 + h.rnd() * 0.5), i % 2 ? ST : ST2, { r: 0.28 }); }
      // スフィンクス風の像・オベリスク
      h.B(10, 0, 3, 2.4, 1.2, 5.5, ST, { r: 0.4 }); h.B(10, 1.2, 5, 1.6, 1.6, 1.6, ST, { r: 0.5 }); h.ball(10, 3.2, 5.2, 0.85, ST2, { col: true }); h.B(9.2, 0, 6.2, 0.7, 0.6, 2.4, ST2, { r: 0.25 }); h.B(10.8, 0, 6.2, 0.7, 0.6, 2.4, ST2, { r: 0.25 });
      for (const p of [[-10, 2], [-4, 12], [16, -6]]) { h.B(p[0], 0, p[1], 1.5, 0.5, 1.5, ST2); h.B(p[0], 0.5, p[1], 0.9, 5, 0.9, ST, { r: 0.1 }); h.cone(p[0], 5.5, p[1], 0.65, 1, '#f0d040', { seg: 4, nocol: true }); }
      // オアシス
      h.cyl(-4, 0.03, 20, 6, 0.03, '#3fa0c9', FL); h.cyl(-4, 0.02, 20, 7.5, 0.02, '#7fb86a', FL);
      for (const p of [[-11, 18], [-9, 24], [2, 25], [4, 17], [-2, 13.5]]) palm(h, p[0], p[1], 0.9 + h.rnd() * 0.4);
      for (let i = 0; i < 8; i++) { const a = i * 0.8; h.cyl(-4 + Math.cos(a) * 6.6, 0, 20 + Math.sin(a) * 6.3, 0.07, 1 + h.rnd(), '#5f9a45'); }
      // テントと市場
      for (const [x, z, c] of [[14, 20, '#b8452f'], [20, 23, '#2f6fb0'], [8, 12, '#e8dcc8']]) {
        h.cone(x, 0, z, 2.6, 3, c, { seg: 4, cw: 0.5 }); h.B(x + 2.6, 0, z - 1.5, 1, 0.8, 1, CARD[1], { r: 0.1 });
        h.cyl(x - 2.4, 0, z - 1.6, 0.35, 0.7, '#b5651d', { rt: 0.22 }); h.ball(x - 2.4, 0.95, z - 1.6, 0.36, '#b5651d', { col: true }); h.cyl(x - 1.6, 0, z - 2.3, 0.28, 0.55, '#8a5a33', { rt: 0.2 });
      }
      h.B(16, 0, 16, 4, 0.04, 2.6, '#a8443f', { flat: true }); table(h, 16, 16, 3, 1.2, '#8a5a33', 0.7); for (let i = 0; i < 4; i++) h.ball(15 + i * 0.7, 0.95, 16, 0.24, TOY[i], { col: true });
      // 砂丘・サボテン
      h.dome(30, 0, -4, 7, 2.6, 5, '#ddb672'); h.dome(-32, 0, 2, 5, 2.2, 7, '#ddb672'); h.dome(4, 0, -6, 4.5, 1.8, 3.4, '#ddb672'); h.dome(-12, 0, -6, 4, 1.7, 3, '#d9b06c');
      for (const p of [[-16, 6], [20, 6], [33, -22], [-34, -8], [12, -12], [-30, 24], [34, 2]]) { h.cyl(p[0], 0, p[1], 0.3, 2.2, '#3f8f4a'); h.ball(p[0], 2.2, p[1], 0.3, '#3f8f4a'); h.cyl(p[0] + 0.55, 0.9, p[1], 0.16, 0.9, '#3f8f4a', NC); h.ball(p[0] + 0.55, 1.8, p[1], 0.16, '#3f8f4a'); }
      for (const p of [[-14, -22], [14, -24], [-34, 20], [34, 24]]) lamp(h, p[0], p[1], 2.2);
      h.ball(-70, 45, -50, 7, '#fff0c0', { glow: 2, nolight: true });
    }
  },

  /* ---------- ネオン街（光る模様のビルの街） ---------- */
  neon: {
    name: 'ネオン街', hx: 36, hz: 28, sky: '#16052a', night: true, dark: 0.42, kit: ['neonBox', 'neonBox', 'barrel', 'screen', 'mural', 'pole', 'cubes', 'blob'], pal: ['#1c1c2e', '#1a1430', '#221436', '#2a2440', '#3a3550'], acc: ['#ff3ab8', '#33eaff', '#ffd940', '#8a5cff', '#3dff9a'], clutter: 40, spawn: [12, 0],
    build(h) {
      const NE = ['#ff3ab8', '#33eaff', '#ffd940', '#8a5cff', '#3dff9a'];
      h.F(0, 0, 72, 56, '#1c1c2e'); h.outer(12, '#14101f');
      for (let x = -34; x <= 34; x += 4) if (Math.abs(x) > 6) h.B(x, 0.02, 1.9, 2, 0.02, 0.2, NE[1], { nocol: true, flat: true, glow: 1.2 });
      city(h, { pal: ['#1a1430', '#141a36', '#221436', '#2a1d40', '#1c2440'], acc: NE, night: true, neon: true, facade: ['hstripe', 'vband', 'check2', 'zigzag', 'diag', 'dots', 'wave'], hmin: 7, hmax: 13 });
      h.ball(-60, 60, 70, 9, '#ffe6f6', { glow: 1.6, nolight: true });
    }
  },

  /* ---------- 火山（レースマスター「火山コア」より） ---------- */
  volcano: {
    name: '火山', hx: 36, hz: 28, sky: '#2a0a06', night: true, dark: 0.5, kit: ['rock', 'rock', 'crystal', 'barrel', 'crate', 'pillar', 'screen', 'mural', 'mural', 'blob', 'pole'], acc: ['#ff6a14', '#ffa028', '#5a3a8a', '#7b4fb8', '#1c1513', '#ffb46b'], pal: ['#2b2422', '#3a302c', '#332a27', '#40342f'], clutter: 120, spawn: [0, 2],
    build(h) {
      const RK = '#2b2422', RK2 = '#3a302c', LV = '#ff6a14';
      h.F(0, 0, 72, 56, RK); h.outer(9, '#1f1917');
      // 溶岩の川（光る床）と橋
      h.B(0, 0, -9, 72, 0.02, 3, LV, { nocol: true, flat: true, glow: 1.6 }); h.B(-14, 0, 8, 3, 0.02, 40, LV, { nocol: true, flat: true, glow: 1.6 }); h.B(18, 0, 14, 36, 0.02, 2.4, LV, { nocol: true, flat: true, glow: 1.6 });
      h.cyl(22, 0.01, -18, 5, 0.02, LV, { nocol: true, flat: true, glow: 1.6 }); h.cyl(-26, 0.01, 18, 4, 0.02, '#ffa028', { nocol: true, flat: true, glow: 1.6 });
      for (const p of [[-24, -9, 0], [4, -9, 0], [26, -9, 0], [-14, 2, 1], [-14, 20, 1], [10, 14, 0], [28, 14, 0]]) h.B(p[0], 0.02, p[1], p[2] ? 4.4 : 2.6, 0.14, p[2] ? 2.6 : 4.4, '#6b4a2b', { flat: true });
      // 火山
      for (const [x, z, r] of [[-25, -19, 8], [28, 22, 6], [30, -3, 5]]) { h.cone(x, 0, z, r, r * 1.05, RK2, { seg: 9, cw: 0.6, rt: r * 0.22 }); h.cyl(x, r * 1.05 - 0.05, z, r * 0.2, 0.12, LV, { nocol: true, glow: 2.4 }); h.ball(x, r * 1.05 + 0.6, z, 0.5, '#ffb46b', { glow: 1 }); }
      // 柱状の岩・岩
      for (const [cx, cz] of [[6, -20], [-6, 12], [20, 4], [-30, 2], [8, 23]]) for (let i = 0; i < 7; i++) { const a = i * 0.9, d = i ? 1.1 : 0; h.cyl(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d, 0.62, 1 + h.rnd() * 3.2, i % 2 ? RK2 : '#332a27', { seg: 6 }); }
      for (let i = 0; i < 26; i++) { const x = -33 + h.rnd() * 66, z = -25 + h.rnd() * 50, s = 0.8 + h.rnd() * 1.6; if (Math.hypot(x, z - 2) < 4) continue; h.B(x, 0, z, s, s * (0.5 + h.rnd() * 0.7), s * (0.7 + h.rnd() * 0.6), i % 3 ? RK2 : '#40342f', { r: 0.3 }); }
      // 黒曜石の結晶・間欠泉・枯れ木
      for (const p of [[-4, -16], [14, -4], [-22, 10], [2, 18], [32, 10], [-33, -8]]) { h.cone(p[0], 0, p[1], 0.7, 2.6, '#5a3a8a', { seg: 5, cw: 0.7 }); h.cone(p[0] + 0.7, 0, p[1] + 0.4, 0.45, 1.5, '#7b4fb8', { seg: 5, cw: 0.7 }); }
      for (const p of [[10, -14], [-20, -2], [16, 22]]) { h.cyl(p[0], 0, p[1], 0.9, 0.35, RK2); h.cyl(p[0], 0.35, p[1], 0.45, 0.06, '#ffa028', { nocol: true, glow: 2 }); h.ball(p[0], 1, p[1], 0.3, '#ffb46b', { glow: 1 }); }
      for (const p of [[-8, 4], [24, -12], [-30, 24], [34, 18], [0, -24]]) { h.cyl(p[0], 0, p[1], 0.2, 3, '#1c1513', { rt: 0.1 }); h.cyl(p[0] + 0.5, 1.6, p[1], 0.07, 1.2, '#1c1513', NC); }
      // 採掘キャンプ
      for (let i = 0; i < 3; i++) { h.B(4 + i * 2.4, 0.25, 6, 1.6, 0.9, 1.1, '#55606b', { r: 0.15 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.wheel(4 + i * 2.4 + sx * 0.5, 0.25, 6 + sz * 0.6, 0.25, 0.12, 'x'); h.ball(4 + i * 2.4, 1.25, 6, 0.4, i % 2 ? LV : RK2, i % 2 ? { glow: 1.2, nolight: true } : {}); }
      h.B(8, 0, 6.6, 12, 0.08, 0.12, '#8d8f94', FL); h.B(8, 0, 5.4, 12, 0.08, 0.12, '#8d8f94', FL);
      for (let i = 0; i < 6; i++) h.B(-4 + (i % 3) * 1.2, Math.floor(i / 3) * 1, -3, 1.1, 1, 1.1, CARD[i % 4], { r: 0.1 });
      for (let i = 0; i < 4; i++) h.cyl(-8 + i * 1.1, 0, -4.5, 0.48, 1.2, ['#b8452f', '#55606b'][i % 2]);
      h.cone(-2, 0, 7, 2.4, 2.8, '#6b5a4a', { seg: 4, cw: 0.5 }); lamp(h, 1.5, 9, 2.4); lamp(h, -5, -1, 2.4);
      h.dome(-6, 0, 22, 5, 1.8, 3.5, '#3a302c'); h.dome(20, 0, -24, 5, 2, 3, '#3a302c'); h.dome(33, 0, -20, 3, 1.6, 4, '#332a27');
    }
  }
};
