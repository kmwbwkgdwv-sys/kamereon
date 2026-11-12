// マップ定義。h = { B(箱), F(床), cyl(円柱), ball(球), dome(だ円の山), cap(丸頭の柱), arch(アーチ), outer(外壁), rnd(乱数),
//                   lathe(回転体：たる・つぼ), ring(輪の飾り), slab(岩の板：凸の多角形の柱), lump(でこぼこ), capc(向きつきの柱) … }
// B(x, y0, z, 幅, 高さ, 奥行, 色, opt)  ※ x,z は中心、y0 は底面の高さ
// opt.pat = [模様, 地の色, 模様の色(配列も可), 横のくり返し, 縦のくり返し]  模様は patterns.js
// opt.nocol = 当たり判定なし（面に貼った薄い飾りだけに使う。体がうまる大きさの物には使わない）
// opt.sink = 絵・模様の壁（隠れる側は体の前の方だけが少し入りこむ。全身はうまらない）
// opt.soft + sinkV = 水面・ボールの海（上から入ると沈む。沈むのは体の高さの3割ほどまで）
// 見た目と当たり判定はそろえる：かたむけた箱・ねかせた円柱・玉・タイヤ・枝・葉っぱも、見た目どおりに当たる
export const MAP_LIST = [['house', 'おうち'], ['park', '公園'], ['school', '学校'], ['warehouse', '倉庫'], ['town', '夜の商店街'],
  ['station', 'ガソリンスタンド'], ['circuit', 'サーキット'], ['desert', '古代の砂漠'], ['neon', 'ネオン街'], ['volcano', '火山']];

const NC = { nocol: true }, FL = { nocol: true, flat: true };
const WALL = 4.5; // 内壁の高さ
const shade = (c, k) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join(''); // 色を明るく・暗く
const seed8 = h => Math.floor(h.rnd() * 8);
const pick = (h, a) => a[Math.floor(h.rnd() * a.length)];
const LEAF = ['#2f7d3a', '#3b8f46', '#25622d', '#4a9a3e'];
const LEAFC = { core: 0.92 }; // 葉っぱ：かたいかたまり（でこぼこの表面に体が少し入るだけ。中にはもぐれない）
const TOY = ['#e04f4f', '#4f7fe0', '#f0d040', '#4fbf6a', '#b06fd8', '#f08a3c'];
const CARD = ['#c7a36a', '#b8935a', '#d4b483', '#a8834f'];
const CONT = ['#b8452f', '#2f6fb0', '#3f9b6a', '#d98a2b', '#7b5ea7', '#8d8f94', '#c9b037'];
const WOOD = '#8a5a33';

// 模様えらび（地の色はそのマップの色、模様の色はアクセント色）
const PATK = ['dots', 'hstripe', 'vband', 'diag', 'zigzag', 'check2', 'camo', 'confetti', 'splat', 'wave', 'rainbow', 'brick', 'bigcamo'];
function rpat(h, pal, acc, rx = 1, ry = 1, kinds = PATK) {
  const k = pick(h, kinds), a = pick(h, pal);
  let b = pick(h, acc); if (b === a) b = '#f4f4f4';
  const c2 = k === 'camo' ? [pick(h, pal), b, pick(h, pal)] : k === 'bigcamo' ? [b, shade(a, 0.78)] : (k === 'confetti' || k === 'splat' || k === 'rainbow') ? acc : b;
  return [k, a, c2, rx, ry];
}
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

/* ---- 形づくりの道具 ---- */
function hull(P) { // 凸包（岩の板の形を凸の多角形にする）
  const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
// だ円（rx, rz を rot だけ回す）のまわりに n 個の点を少しゆらして置き、凸の多角形にする
function rockPts(h, rx, rz, n = 8, j = 0.15, rot = 0) {
  const P = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) { const a = (i + (h.rnd() - 0.5) * 0.55) / n * 6.2832, k = 1 - h.rnd() * j, px = Math.cos(a) * rx * k, pz = Math.sin(a) * rz * k; P.push([px * c - pz * s, px * s + pz * c]); }
  return hull(P);
}
// 角ばった岩（平らな面が多い。大きな色の面の岩肌なので、体に同じ色を塗ってはりつける）
function stone(h, x, z, s, c, y = 0, flat = 0) {
  const ht = s * (flat || (0.6 + h.rnd() * 0.55)), pts = rockPts(h, s, s * (0.62 + h.rnd() * 0.35), 7 + Math.floor(h.rnd() * 3), 0.16, h.rnd() * 6.28);
  h.slab(x, y, z, pts, ht, c, { top: 0.84 + h.rnd() * 0.1, bev: Math.min(0.24, ht * 0.25), pat: ['rockface', c, [shade(c, 0.86), shade(c, 1.12)], 0.42, 0.42] });
  return ht;
}

/* ---- 家具・小物（実物をまねて細かく作る。当たり判定も見た目どおり） ---- */
const table = (h, x, z, w, d, c, ht = 0.76) => { // 天板・幕板・下が細い脚
  h.B(x, ht - 0.07, z, w, 0.07, d, c, { r: 0.03, pat: ['grain', c, 0, 2, 1] });
  const ac = shade(c, 0.85);
  for (const s of [-1, 1]) { h.B(x, ht - 0.17, z + s * (d / 2 - 0.09), w - 0.24, 0.1, 0.04, ac, { r: 0.01 }); h.B(x + s * (w / 2 - 0.09), ht - 0.17, z, 0.04, 0.1, d - 0.24, ac, { r: 0.01 }); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.cyl(x + sx * (w / 2 - 0.09), 0, z + sz * (d / 2 - 0.09), 0.035, ht - 0.07, ac, { rt: 0.05, seg: 10 });
};
// いす：座面・4本の脚・背もたれ（fz / fx = 座った人が向く方向）
const chair = (h, x, z, c, fz = 1, fx = 0) => {
  const sh = 0.46, w = 0.46, ac = shade(c, 0.85);
  h.B(x, sh - 0.05, z, w, 0.05, w, c, { r: 0.02, pat: ['grain', c, 0, 1, 1] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.cyl(x + sx * (w / 2 - 0.04), 0, z + sz * (w / 2 - 0.04), 0.022, sh - 0.05, ac, { seg: 8 });
  const bx = x - fx * (w / 2 - 0.03), bz = z - fz * (w / 2 - 0.03), al = fz !== 0;
  for (const s of [-1, 1]) h.B(bx + (al ? s * (w / 2 - 0.03) : 0), sh, bz + (al ? 0 : s * (w / 2 - 0.03)), 0.04, 0.5, 0.04, ac, { r: 0.01 });
  h.B(bx, sh + 0.32, bz, al ? w : 0.035, 0.16, al ? 0.035 : w, c, { r: 0.015 });
  h.B(bx, sh + 0.12, bz, al ? w - 0.08 : 0.03, 0.06, al ? 0.03 : w - 0.08, c, { r: 0.01 });
};
// ソファ：脚・台・ひじかけ・背もたれ・分かれた座面と背のクッション。back = ±1 背もたれのある側
function sofa(h, x, z, L, c, al, back) {
  const D = 1.15, P = (a, b) => (al ? [x + a, z + b] : [x + b, z + a]), fab = ['fabric', c, 0, 2, 1];
  const B = (a, y, b, l, ht, d, col, o) => { const [px, pz] = P(a, b); h.B(px, y, pz, al ? l : d, ht, al ? d : l, col, o); };
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) { const [px, pz] = P(sa * (L / 2 - 0.14), sb * (D / 2 - 0.14)); h.cyl(px, 0, pz, 0.04, 0.12, '#3a2a1c', { seg: 8 }); }
  B(0, 0.12, 0, L, 0.2, D, shade(c, 0.88), { r: 0.06, pat: fab });
  for (const s of [-1, 1]) B(s * (L / 2 - 0.14), 0.12, 0, 0.28, 0.55, D, c, { r: 0.1, pat: fab });
  B(0, 0.12, back * (D / 2 - 0.15), L, 0.82, 0.3, c, { r: 0.12, pat: fab });
  const n = Math.max(2, Math.round((L - 0.56) / 0.85)), cw = (L - 0.56) / n;
  for (let i = 0; i < n; i++) {
    const a = -L / 2 + 0.28 + cw * (i + 0.5);
    B(a, 0.32, -back * 0.08, cw - 0.04, 0.17, D - 0.4, shade(c, 1.06), { r: 0.07, pat: fab }); // 座面のクッション
    B(a, 0.49, back * (D / 2 - 0.4), cw - 0.06, 0.42, 0.2, shade(c, 1.12), { r: 0.09, pat: fab }); // 背のクッション
  }
}
const sofaX = (h, x, z, w, c, back) => sofa(h, x, z, w, c, true, back);
const sofaZ = (h, x, z, d, c, back) => sofa(h, x, z, d, c, false, back);
// ベッド：脚・木のわく・マットレス・掛けぶとん・まくら・ヘッドボード（ベッドの下には少しすき間がある）
const bed = (h, x, z, c) => {
  const W = 2.2, L = 3.2, wd = '#6b4a2b';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.B(x + sx * (W / 2 - 0.08), 0, z + sz * (L / 2 - 0.08), 0.12, 0.32, 0.12, wd, { r: 0.02 });
  h.B(x, 0.3, z, W, 0.14, L, wd, { r: 0.03, pat: ['grain', wd, 0, 2, 2] });
  h.B(x, 0.44, z, W - 0.1, 0.24, L - 0.14, '#efe9df', { r: 0.1, pat: ['fabric', '#efe9df', 0, 3, 3] });
  h.B(x, 0.64, z - 0.32, W + 0.04, 0.1, L - 0.74, c, { r: 0.05, pat: ['fabric', c, 0, 3, 3] });
  h.B(x, 0.46, z - L / 2 + 0.04, W + 0.04, 0.24, 0.06, c, { r: 0.03 }); // 足もとに垂れた掛けぶとん
  for (const s of [-1, 1]) h.lump(x + s * 0.5, 0.79, z + 1.15, 0.42, 0.11, 0.24, '#ffffff', { seed: seed8(h), bump: 0.12, freq: 1.3, pat: ['fabric', '#ffffff', 0, 2, 1] });
  h.B(x, 0, z + L / 2 + 0.06, W + 0.12, 1.25, 0.12, wd, { r: 0.04, pat: ['grain', wd, 0, 2, 1] });
  for (const s of [-1, 1]) h.cyl(x + s * (W / 2 + 0.02), 0, z + L / 2 + 0.06, 0.07, 1.4, wd, { seg: 12 }); // ヘッドボードの柱
  h.B(x, 0, z - L / 2 - 0.05, W + 0.1, 0.64, 0.1, wd, { r: 0.03 });
};
// 車：車体・屋根・窓・バンパー・ライト・ミラー・ドアの線・車輪（車の下にも少しすき間がある）
const car = (h, x, z, c, alongX) => {
  const L = 4.4, W = 2, P = (a, b) => (alongX ? [x + a, z + b] : [x + b, z + a]);
  const B = (a, y, b, l, ht, w, col, o) => { const [px, pz] = P(a, b); h.B(px, y, pz, alongX ? l : w, ht, alongX ? w : l, col, o); };
  const G = '#1e2a36', gl = { nocol: true, r: 0.02, rough: 0.12 };
  B(0, 0.32, 0, L, 0.6, W, c, { r: 0.3 });
  B(-0.15, 0.92, 0, 2.4, 0.62, W - 0.26, c, { r: 0.28 });
  for (const s of [-1, 1]) { B(-0.15, 0.98, s * (W / 2 - 0.12), 2.1, 0.44, 0.04, G, gl); B(-0.15, 0.98, s * (W / 2 - 0.115), 0.06, 0.44, 0.05, c, NC); } // 横の窓と柱
  B(1.06, 0.98, 0, 0.04, 0.44, W - 0.42, G, gl); B(-1.36, 0.98, 0, 0.04, 0.44, W - 0.42, G, gl); // 前後のガラス
  B(L / 2 + 0.04, 0.3, 0, 0.18, 0.26, W - 0.08, '#2a3038', { r: 0.09 }); B(-L / 2 - 0.04, 0.3, 0, 0.18, 0.26, W - 0.08, '#2a3038', { r: 0.09 }); // バンパー
  for (const s of [-1, 1]) {
    B(L / 2 + 0.005, 0.64, s * 0.68, 0.05, 0.14, 0.36, '#fff4c2', { nocol: true, glow: 0.6, r: 0.03 }); B(-L / 2 - 0.005, 0.64, s * 0.7, 0.05, 0.14, 0.32, '#e0413a', { nocol: true, glow: 0.5, r: 0.03 });
    B(0.92, 0.94, s * (W / 2 + 0.07), 0.14, 0.12, 0.14, c, { r: 0.04 }); // ミラー
    B(0.05, 0.42, s * (W / 2 + 0.004), 0.02, 0.46, 0.01, shade(c, 0.65), NC); B(-0.35, 0.78, s * (W / 2 + 0.01), 0.2, 0.04, 0.02, '#c9ccd0', NC); // ドアの線・取っ手
  }
  B(L / 2 + 0.135, 0.34, 0, 0.02, 0.15, 0.52, '#f4f4f4', NC); // ナンバー
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) { const [px, pz] = P(sa * 1.4, sb * 0.92); h.wheel(px, 0.36, pz, 0.36, 0.28, alongX ? 'z' : 'x'); }
};
const palm = (h, x, z, s = 1) => { // ヤシ：節のある幹・葉（葉にも当たる）・実
  const H = 4 * s;
  h.cyl(x, 0, z, 0.36 * s, H, '#8a6a3c', { rt: 0.24 * s, pat: ['bark', '#8a6a3c', 0, 2, 3] });
  for (let k = 1; k < 8; k++) h.ring(x, k * H / 8, z, (0.36 - 0.12 * k / 8) * s + 0.01, 0.035 * s, '#6b4a2b');
  h.cyl(x, H, z, 0.7 * s, 0.2 * s, '#6b4a2b', { rt: 0.55 * s });
  for (let i = 0; i < 7; i++) {
    const a = i * 0.898 + h.rnd() * 0.3, ca = Math.cos(a), sa = Math.sin(a);
    h.dome(x + ca * 1.2 * s, 4.05 * s, z + sa * 1.2 * s, 1.4 * s, 0.24 * s, 0.5 * s, '#3f8f3a', { nocol: true, rot: a, pat: ['leaf', '#3f8f3a', LEAF, 3, 1] });
    for (const d of [0.6, 1.25, 1.95]) h.ell(x + ca * d * s, (4.12 - d * 0.08) * s, z + sa * d * s, 0.4 * s, 0.2 * s, 0.4 * s); // 葉の当たり判定
  }
  for (let i = 0; i < 3; i++) h.ball(x + Math.cos(i * 2.1) * 0.3 * s, 3.85 * s, z + Math.sin(i * 2.1) * 0.3 * s, 0.17 * s, '#6b4a2b');
};
// 木：根もとが広がった太い幹（登れる）・枝・でこぼこの葉っぱのかたまり
// 葉っぱはかたいので中にはもぐれない。上に乗ると表面のでこぼこに少しだけ体が沈む
const tree = (h, x, z, s = 1) => {
  const th = 2.5 * s, bk = ['bark', '#6b4a2b', 0, 3, 2];
  h.lathe(x, 0, z, [[0.001, 0], [0.9 * s, 0], [0.66 * s, 0.16 * s], [0.52 * s, 0.5 * s], [0.46 * s, th * 0.6], [0.38 * s, th], [0.3 * s, th + 0.4 * s], [0.001, th + 0.45 * s]], '#6b4a2b',
    { pat: bk, seg: 14, cols: [[0, 0.3 * s, 0.78 * s, 0.56 * s], [0.3 * s, th, 0.52 * s, 0.38 * s]] });
  for (let i = 0; i < 5; i++) { // 根
    const a = i * 1.2566 + h.rnd() * 0.5, len = (0.8 + h.rnd() * 0.4) * s;
    h.capc(x + Math.cos(a) * (0.5 * s + len * 0.4), 0.06 * s, z + Math.sin(a) * (0.5 * s + len * 0.4), 0.14 * s, len, Math.cos(a), -0.12, Math.sin(a), '#5a3c24', { pat: ['bark', '#5a3c24', 0, 1, 2] });
  }
  for (let i = 0; i < 4; i++) { const a = i * 1.571 + h.rnd() * 0.8, tl = 0.6 + h.rnd() * 0.35, len = (1.1 + h.rnd() * 0.5) * s, dx = Math.cos(a) * Math.sin(tl), dy = Math.cos(tl), dz = Math.sin(a) * Math.sin(tl); h.capc(x + dx * len / 2, th - 0.2 * s + dy * len / 2, z + dz * len / 2, 0.13 * s, len, dx, dy, dz, '#5a3c24', { pat: ['bark', '#5a3c24', 0, 1, 2] }); }
  // 葉っぱは小さめのかたまりをいくつも集めた形（かたまりの間のくぼみは本物のくぼみ。かたまりの中にはもぐれない）
  const cs = ['#2f7d3a', '#3b8f46', '#2e6b34', '#357f3c'];
  const leaf = (px, py, pz, r) => { const c = pick(h, cs); h.lump(px, py, pz, r * 1.05, r * 0.86, r, c, { core: 0.93, seed: seed8(h), bump: 0.15, freq: 2.6, ry: h.rnd() * 6.28, pat: ['leaf', c, LEAF, 2, 2] }); };
  leaf(x, th + 1.6 * s, z, 1.05 * s);
  const n = 5 + (h.rnd() < 0.5 ? 1 : 0), a0 = h.rnd() * 6.28;
  for (let i = 0; i < n; i++) { const a = a0 + i / n * 6.2832 + (h.rnd() - 0.5) * 0.4; leaf(x + Math.cos(a) * 1.05 * s, th + (0.75 + h.rnd() * 0.3) * s, z + Math.sin(a) * 1.05 * s, (0.82 + h.rnd() * 0.25) * s); }
  for (let i = 0; i < 3; i++) { const a = a0 + 0.5 + i * 2.094; leaf(x + Math.cos(a) * 0.85 * s, th + 0.05 * s, z + Math.sin(a) * 0.85 * s, 0.68 * s); }
};
const plant = (h, x, z) => { // 鉢植え：ふちのある鉢・土・葉っぱ
  h.lathe(x, 0, z, [[0.001, 0], [0.26, 0], [0.35, 0.5], [0.4, 0.52], [0.4, 0.6], [0.35, 0.6], [0.34, 0.54], [0.001, 0.53]], '#b5651d', { cols: [[0, 0.6, 0.3, 0.4]] });
  h.cyl(x, 0.5, z, 0.33, 0.04, '#4a3426', NC);
  h.lump(x, 1.15, z, 0.7, 0.72, 0.7, '#2f7d3a', { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3, pat: ['leaf', '#2f7d3a', LEAF, 2, 2] });
};
const tires = (h, x, z, n = 3) => { // 積んだタイヤ：まん中の穴に入れる（当たり判定は輪にそって並べた細い柱）
  for (let i = 0; i < 8; i++) { const a = i * 0.785; h.cylc(x + Math.cos(a) * 0.36, 0, z + Math.sin(a) * 0.36, 0.14, 0.3 * n); }
  for (let i = 0; i < n; i++) h.tire(x, i * 0.3, z, 0.5, NC);
};
const pylon = (h, x, z) => { h.B(x, 0, z, 0.42, 0.04, 0.42, '#f08a3c'); h.cone(x, 0.04, z, 0.17, 0.55, '#f08a3c', { pat: ['hstripe', '#f08a3c', '#f4f4f4', 1, 2] }); };
const kart = (h, x, z, c) => {
  h.B(x, 0.12, z, 1.1, 0.3, 1.8, c, { r: 0.14 }); h.B(x, 0.42, z + 0.42, 0.66, 0.42, 0.42, '#2a3038', { r: 0.12 });
  h.B(x, 0.42, z - 0.55, 0.9, 0.14, 0.3, shade(c, 0.85), { r: 0.06 }); h.cyl(x, 0.42, z - 0.25, 0.03, 0.3, '#2a3038', { seg: 8 }); h.ring(x, 0.72, z - 0.25, 0.14, 0.025, '#2a3038');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.wheel(x + sx * 0.62, 0.22, z + sz * 0.62, 0.22, 0.2, 'x');
};
const pump = (h, x, z) => { // 給油機：島（縁石）・本体・画面・ノズル掛け・ホース・車止め
  h.B(x, 0, z, 1.5, 0.18, 5, '#c9c9c9', { r: 0.06, pat: ['noise', '#c9c9c9', 0, 2, 4] });
  h.B(x, 0.18, z, 0.95, 1.75, 0.6, '#e0413a', { r: 0.2 }); h.B(x, 1.93, z, 1.05, 0.3, 0.7, '#f4f4f4', { r: 0.06 });
  for (const s of [-1, 1]) {
    h.B(x, 1.2, z + s * 0.31, 0.7, 0.45, 0.02, '#15171a', NC); h.B(x - 0.15, 1.32, z + s * 0.32, 0.3, 0.12, 0.01, '#5fe0a0', { nocol: true, glow: 0.8 }); // 画面
    h.B(x + 0.25, 0.7, z + s * 0.34, 0.18, 0.3, 0.1, '#2a3038', { r: 0.03 }); // ノズル掛け
    h.capc(x + 0.25, 0.6, z + s * 0.42, 0.035, 0.6, 0.05, -1, 0.2 * s, '#22262b', NC); // ホース
    h.cyl(x, 0.18, z + s * 2.1, 0.12, 0.9, '#f0d040', { pat: ['hstripe', '#f0d040', '#2a3038', 1, 3] });
  }
};
const lamp = (h, x, z, ht = 2.6) => { h.cyl(x, 0, z, 0.16, 0.12, '#444a50'); h.cyl(x, 0, z, 0.07, ht, '#444a50'); h.cyl(x, ht, z, 0.2, 0.05, '#444a50', NC); h.ball(x, ht + 0.22, z, 0.26, '#fff4c2', { glow: 1 }); };
const bench = (h, x, z, alongX, c = WOOD, fz = 1) => { // ベンチ：板の座面・背もたれ・鉄の脚（fz = 背もたれのある側）
  const L = 2, P = (a, b) => (alongX ? [x + a, z + b * fz] : [x + b * fz, z + a]), B = (a, y, b, l, ht, d, col, o) => { const [px, pz] = P(a, b); h.B(px, y, pz, alongX ? l : d, ht, alongX ? d : l, col, o); };
  for (let i = 0; i < 3; i++) B(0, 0.42, -0.2 + i * 0.17, L, 0.05, 0.13, c, { r: 0.02, pat: ['grain', c, 0, 2, 1] });
  for (let i = 0; i < 2; i++) B(0, 0.6 + i * 0.2, 0.3, L, 0.13, 0.04, c, { r: 0.02, pat: ['grain', c, 0, 2, 1] });
  for (const s of [-1, 1]) { B(s * (L / 2 - 0.15), 0, -0.2, 0.06, 0.42, 0.06, '#2a3038', { r: 0.01 }); B(s * (L / 2 - 0.15), 0, 0.22, 0.06, 1.0, 0.06, '#2a3038', { r: 0.01 }); B(s * (L / 2 - 0.15), 0.38, 0.01, 0.06, 0.05, 0.5, '#2a3038', { r: 0.01 }); }
};
const carton = (h, x, y, z, w, ht, d, c) => h.B(x, y, z, w, ht, d, c, { r: 0.03, pat: ['carton', c, 0, 1, 1] }); // 段ボール（ガムテープつき）
const woodcrate = (h, x, y, z, s, c = '#b08a5a') => { // 木箱（板・わく・くぎ）
  h.B(x, y, z, s, s, s, c, { r: 0.04, pat: ['planks', c, 0, 1, 1] });
  for (const a of [-1, 1]) for (const b of [-1, 1]) h.B(x + a * (s / 2 - 0.02), y, z + b * (s / 2 - 0.02), 0.07, s, 0.07, shade(c, 0.75), { nocol: true, r: 0.01 }); // 角の柱
};
function drum(h, x, z, c, y = 0) { // ドラム缶（ふち・2本の輪・注ぎ口）
  const R = 0.45, H = 1.2;
  h.lathe(x, y, z, [[0.001, 0], [R, 0], [R, 0.04], [R * 0.96, 0.07], [R * 0.96, H - 0.07], [R, H - 0.04], [R, H], [R * 0.92, H], [R * 0.92, H - 0.025], [0.001, H - 0.025]], c, { rough: 0.45, seg: 22 });
  for (const t of [0.36, 0.7]) h.ring(x, y + t * H, z, R * 0.98, 0.025, shade(c, 0.82));
  h.cyl(x + R * 0.55, y + H - 0.025, z, 0.06, 0.03, shade(c, 0.7), { nocol: true, seg: 10 });
}
function cask(h, x, z, y = 0) { // 木のたる（ふくらんだ形・たが）
  const R = 0.44, H = 1.08, prof = [[0.001, 0]];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([R * (0.84 + 0.16 * Math.sin(t * Math.PI)), t * H]); }
  prof.push([R * 0.78, H], [0.001, H - 0.03]);
  h.lathe(x, y, z, prof, WOOD, { pat: ['vband', WOOD, '#7a4c2a', 5, 1], seg: 20 });
  for (const t of [0.1, 0.34, 0.66, 0.9]) h.ring(x, y + t * H, z, R * (0.84 + 0.16 * Math.sin(t * Math.PI)) + 0.005, 0.028, '#3a3d44');
}
const pallet = (h, x, z, c = '#b08a5a') => { // 木のパレット（板のあいだにすき間）
  for (const s of [-1, 0, 1]) h.B(x + s * 0.72, 0, z, 0.14, 0.1, 1.7, shade(c, 0.85));
  for (let i = 0; i < 5; i++) h.B(x, 0.1, z - 0.7 + i * 0.35, 1.7, 0.05, 0.22, c, { pat: ['grain', c, 0, 2, 1] });
};
function vending(h, x, z, c, fz = 1) { // 自動販売機（飲み物の窓・ボタン・お金を入れる所・取り出し口）
  h.B(x, 0, z, 1, 1.9, 0.8, c, { r: 0.08 });
  const zf = z + fz * 0.405;
  h.B(x - 0.1, 0.95, zf, 0.72, 0.82, 0.02, '#dfeff5', { nocol: true, glow: 0.35, rough: 0.12, pat: ['vend', '#dfeff5', TOY, 1, 1] });
  h.B(x + 0.36, 1.0, zf, 0.16, 0.56, 0.02, '#2a3038', NC);
  for (let i = 0; i < 4; i++) h.B(x + 0.36, 1.06 + i * 0.12, zf + fz * 0.01, 0.08, 0.05, 0.02, '#ffd940', { nocol: true, glow: 0.6 });
  h.B(x - 0.1, 0.2, zf, 0.72, 0.3, 0.02, '#15171a', NC); h.B(x, 1.8, zf, 0.9, 0.08, 0.02, '#f4f4f4', { nocol: true, glow: 0.4 });
}
function bookshelf(h, x, z, w, d, ht, c) { // 本だな（中は本でいっぱい。当たり判定は全体の箱）
  const al = w >= d;
  h.B(x, 0, z, w, ht, d, c, { r: 0.03, pat: ['grain', c, 0, 1, 2] });
  for (const s of [-1, 1]) h.B(al ? x : x + s * (d / 2 + 0.005), 0.08, al ? z + s * (d / 2 + 0.005) : z, al ? w - 0.12 : 0.01, ht - 0.16, al ? 0.01 : w - 0.12, '#f4f1e8', { nocol: true, pat: ['books', c, TOY.concat(['#2a3038', '#f4f1e8']), Math.max(1, Math.round(Math.max(w, d) / 1.2)), Math.max(1, Math.round(ht / 2))] });
}
const brick = (h, x, y, z, s, c) => { h.B(x, y, z, s, s * 0.6, s, c, { r: 0.05 }); for (const a of [-1, 1]) for (const b of [-1, 1]) h.cyl(x + a * s / 4, y + s * 0.6, z + b * s / 4, s * 0.12, s * 0.1, c, { seg: 12, nocol: true }); }; // おもちゃのブロック（上にぽっち）
const stool = (h, x, z, c) => { h.cyl(x, 0, z, 0.22, 0.03, '#55606b'); h.cyl(x, 0, z, 0.04, 0.6, '#8d8f94', { seg: 8 }); h.cyl(x, 0.6, z, 0.24, 0.08, c, { rt: 0.26 }); h.ring(x, 0.25, z, 0.17, 0.015, '#8d8f94'); };
const bin = (h, x, z, c = '#3f9b6a') => { h.lathe(x, 0, z, [[0.001, 0], [0.3, 0], [0.34, 0.85], [0.37, 0.86], [0.37, 0.95], [0.001, 0.95]], c, { pat: ['vband', c, shade(c, 0.85), 6, 1] }); h.B(x, 0.95, z, 0.3, 0.06, 0.08, shade(c, 0.7), NC); }; // ゴミ箱
const hydrant = (h, x, z) => { h.lathe(x, 0, z, [[0.001, 0], [0.18, 0], [0.18, 0.06], [0.13, 0.08], [0.13, 0.62], [0.16, 0.66], [0.15, 0.78], [0.06, 0.86], [0.001, 0.88]], '#e0413a', { cols: [[0, 0.88, 0.16, 0.12]] }); for (const s of [-1, 1]) h.cyl(x + s * 0.18, 0.45, z, 0.06, 0.12, '#e0413a', { rot: [0, 0, Math.PI / 2], nocol: true }); }; // 消火栓
const mailbox = (h, x, z) => { h.B(x, 0, z, 0.14, 0.75, 0.14, '#2a3038'); h.B(x, 0.75, z, 0.5, 0.65, 0.42, '#d9342b', { r: 0.16 }); h.B(x, 1.2, z + 0.215, 0.3, 0.04, 0.01, '#15171a', NC); }; // ポスト

// x方向／z方向にのびる壁。pat = [模様, 模様の色] で壁紙つき
const wallPat = (pat, c, len, ht) => (pat ? { sink: true, pat: [pat[0], c, pat[1], Math.max(1, Math.round(len / 1.6)), Math.max(1, Math.round(ht / 1.6))] } : undefined); // 壁紙の壁には体の前の方が少し入る
const wallX = (h, z, x0, x1, c, ht = WALL, pat) => h.B((x0 + x1) / 2, 0, z, x1 - x0, ht, 0.4, c, wallPat(pat, c, x1 - x0, ht));
const wallZ = (h, x, z0, z1, c, ht = WALL, pat) => h.B(x, 0, (z0 + z1) / 2, 0.4, ht, z1 - z0, c, wallPat(pat, c, z1 - z0, ht));

/* ---- 額縁の絵：隠れる側は絵に体の前の方を少しだけ入れられる（絵と同じ色・形を体に塗れば同化できる） ---- */
const ART = ['artLand', 'artGrid', 'artFruit', 'artSea', 'artFlower', 'artNight', 'artDots', 'artAbs', 'artField', 'artCat'];
const ARTPAL = [['#4f9a45', '#6fae5a', '#3b7f3a', '#2e6b34'], ['#e04f4f', '#4f7fe0', '#f0d040', '#f4f1e8'], ['#f3e3c3', '#e0719a', '#59b6d8', '#f0d040', '#b06fd8'],
  ['#2f6fb0', '#59b6d8', '#f4f4f4', '#1b2a5a'], ['#f08a3c', '#f0d040', '#e04f4f', '#8a5a33'], ['#b06fd8', '#ff8ac8', '#4fbf6a', '#f0d040'], ['#d9b08c', '#8a5a33', '#c9573f', '#5a3c28']];
// (x,z) = 壁の表面の点、(nx,nz) = 壁から外への向き、y0 = 絵の下の高さ
function pic(h, x, y0, z, nx, nz, w, ht, kind, P) {
  const t = 0.22, al = nz !== 0, k = kind || pick(h, ART); P = P || pick(h, ARTPAL);
  h.B(x + nx * t / 2, y0, z + nz * t / 2, al ? w : t, ht, al ? t : w, P[0], { pat: [k, P[0], P, 1, 1], sharp: true, sink: true });
  const fc = pick(h, ['#c9a24a', '#6b4a2b', '#2a3038', '#f4f4f4']), f = 0.12, ft = t + 0.05, cx = x + nx * ft / 2, cz = z + nz * ft / 2, o = { r: 0.03 };
  for (const s of [-1, 1]) {
    h.B(cx, s < 0 ? y0 - f : y0 + ht, cz, al ? w + 2 * f : ft, f, al ? ft : w + 2 * f, fc, o); // 額縁の上下
    h.B(al ? cx + s * (w / 2 + f / 2) : cx, y0, al ? cz : cz + s * (w / 2 + f / 2), al ? f : ft, ht, al ? ft : f, fc, o); // 左右
  }
}

/* ---- 中に入れる物（現実に中に入れる物は入れるように。入口は隠れる側が通れる大きさ） ---- */
// 箱の殻（4つの壁と屋根）。dir = 入口の向き、dw/dh = 入口の幅・高さ（dw が面より広いとその面はまるごと開く）
function shell(h, x, z, w, d, ht, t, col, o, dir, dw, dh, roof = true) {
  for (const [nx, nz] of DIRS) {
    const alZ = nx !== 0, L = alZ ? d - 2 * t : w, cx = x + nx * (w / 2 - t / 2), cz = z + nz * (d / 2 - t / 2);
    const seg = (a, b, y0, y1) => { if (b - a < 0.02 || y1 - y0 < 0.02) return; const m = (a + b) / 2; h.B(alZ ? cx : cx + m, y0, alZ ? cz + m : cz, alZ ? t : b - a, y1 - y0, alZ ? b - a : t, col, o); };
    if (dir && nx === dir[0] && nz === dir[1] && dw > 0) { const e = Math.min(dw, L) / 2; seg(-L / 2, -e, 0, ht); seg(e, L / 2, 0, ht); seg(-e, e, Math.min(dh, ht), ht); }
    else seg(-L / 2, L / 2, 0, ht);
  }
  if (roof) h.B(x, ht, z, w, t, d, col, o);
}
// 横にねかせた筒（土管・中が空洞の丸太）。当たり判定は輪切りにした箱を重ねる（中は平らな床）
function tube(h, x, z, ro, ri, L, alongX, col, o) {
  h.tube(x, ro, z, ro, ri, L, alongX ? 'x' : 'z', col, o);
  const cy = ro, yf = Math.min(ro - ri + 0.1, 0.22), zi0 = Math.sqrt(ri * ri - (cy - yf) * (cy - yf)); // 床は段差で上がれる高さ
  const box = (a, b, y0, y1) => { const m = (a + b) / 2; h.boxc(alongX ? x : x + m, y0, alongX ? z + m : z, alongX ? L : b - a, y1 - y0, alongX ? b - a : L, { sharp: true }); };
  box(-zi0, zi0, 0, yf);
  h.B(x, yf - 0.04, z, alongX ? L - 0.04 : 2 * zi0 + 0.1, 0.04, alongX ? 2 * zi0 + 0.1 : L - 0.04, shade(col, 0.6), { nocol: true, sharp: true }); // 中の床（落ち葉・砂）
  const N = 6, hs = (cy + ri - yf) / N;
  for (let k = 0; k < N; k++) {
    const ya = yf + k * hs, yb = ya + hs, dIn = Math.max(Math.abs(ya - cy), Math.abs(yb - cy)), dOut = ya <= cy && yb >= cy ? 0 : Math.min(Math.abs(ya - cy), Math.abs(yb - cy));
    const zi = Math.sqrt(Math.max(0, ri * ri - dIn * dIn)), zo = Math.sqrt(ro * ro - dOut * dOut);
    if (zi < 0.03) box(-zo, zo, ya, yb); else { box(-zo, -zi, ya, yb); box(zi, zo, ya, yb); }
  }
  const zt = Math.sqrt(ro * ro - ri * ri); box(-zt, zt, cy + ri, cy + ro);
}
// 洋服だんす：扉が開いていて中に入れる。服はおくの方にかかっていて（服にも当たる）、手前に立つすき間がある
function closet(h, x, z, dir, c, pal, acc) {
  const al = dir[1] !== 0, WD = 2.2, D = 1.15, ht = 2.4, w = al ? WD : D, d = al ? D : WD, bk = -0.19; // bk = 服をおくへずらす量
  shell(h, x, z, w, d, ht, 0.08, c, { r: 0.03, pat: ['grain', c, 0, 1, 2] }, dir, 99, 99);
  for (const s of [-1, 1]) h.B(al ? x + s * WD / 2 : x + dir[0] * (D / 2 + WD / 4), 0.05, al ? z + dir[1] * (D / 2 + WD / 4) : z, al ? 0.06 : WD / 2, ht - 0.1, al ? WD / 2 : 0.06, shade(c, 1.08), { r: 0.02 }); // 開いた扉
  const ox = al ? 0 : dir[0] * bk, oz = al ? dir[1] * bk : 0;
  h.cyl(x + ox, ht - 0.35, z + oz, 0.03, WD - 0.2, '#c9c9c9', { nocol: true, rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] });
  for (let t = -WD / 2 + 0.25; t < WD / 2 - 0.15; t += 0.24 + h.rnd() * 0.12) {
    const ch = 1.25 + h.rnd() * 0.45, cc = pick(h, acc.concat(pal));
    h.B(al ? x + t : x + ox, ht - 0.38 - ch, al ? z + oz : z + t, al ? 0.1 : 0.52, ch, al ? 0.52 : 0.1, cc, { r: 0.03, pat: h.rnd() < 0.6 ? rpat(h, pal, acc, 1, 2) : undefined });
    h.B(al ? x + t : x + ox, ht - 0.42, al ? z + oz : z + t, al ? 0.03 : 0.4, 0.06, al ? 0.4 : 0.03, '#c9c9c9', NC); // ハンガー
  }
}
// テント：入口から中に入れる（三角の屋根は見た目、当たり判定は段々の箱）
function tent(h, x, z, alongX, s, c, c2) {
  const L = 2.6, R = 1.35, hw = R * 0.866, H = R * 1.5, ang = Math.atan2(hw, H), Ls = Math.hypot(hw, H), o = { nocol: true, pat: ['vband', c, c2, 4, 1] };
  for (const e of [-1, 1]) {
    if (alongX) h.B(x, (H - Ls) / 2, z + e * hw / 2, L, Ls, 0.05, c, Object.assign({ rot: [-e * ang, 0, 0] }, o)); // かたむけた布（当たり判定は下の段々の箱）
    else h.B(x + e * hw / 2, (H - Ls) / 2, z, 0.05, Ls, L, c, Object.assign({ rot: [0, 0, e * ang] }, o));
  }
  if (alongX) h.cyl(x - s * L / 2, R * 0.5, z, R, 0.06, c, { nocol: true, seg: 3, rot: [-Math.PI / 2, 0, -Math.PI / 2] });
  else h.cyl(x, R * 0.5, z - s * L / 2, R, 0.06, c, { nocol: true, seg: 3, rot: [-Math.PI / 2, 0, 0] });
  h.B(x, 0, z, alongX ? L : hw * 1.9, 0.03, alongX ? hw * 1.9 : L, c2, { nocol: true, flat: true });
  for (const e of [-1, 1]) h.cyl(alongX ? x + e * (L / 2 + 0.3) : x + e * 0.6, 0, alongX ? z + e * 0.6 : z + e * (L / 2 + 0.3), 0.03, 0.25, '#c9c9c9', { seg: 6 }); // ペグ
  const box = (a, b, y0, y1, l0, l1) => { const m = (a + b) / 2, n = (l0 + l1) / 2; h.boxc(alongX ? x + n : x + m, y0, alongX ? z + m : z + n, alongX ? l1 - l0 : b - a, y1 - y0, alongX ? b - a : l1 - l0, { sharp: true }); };
  const hwy = y => hw * (1 - y / H), N = 5;
  for (let k = 0; k < N; k++) {
    const ya = k * H / N, yb = ya + H / N, a = hwy(ya) + 0.04, b = hwy(yb) - 0.04;
    if (k === N - 1) box(-a, a, ya, yb, -L / 2, L / 2); else { box(-a, -b, ya, yb, -L / 2, L / 2); box(b, a, ya, yb, -L / 2, L / 2); }
    box(-a, a, ya, yb, s > 0 ? -L / 2 - 0.04 : L / 2 - 0.04, s > 0 ? -L / 2 + 0.04 : L / 2 + 0.04); // おくの壁
  }
}
// ボールの海・水そうなど：ふちの壁の中に、上から入ると沈む層（沈むのは体の一部だけ）
function pit(h, x, z, w, d, rh, t, c, o, top, sinkV, pat) {
  shell(h, x, z, w, d, rh, t, c, o, null, 0, 0, false);
  h.B(x, 0, z, w - 2 * t, top, d - 2 * t, pat[1], { soft: true, sinkV, pat, sharp: true });
}

/* ---- 隠れ場所になる小物（マップごとの kit から自動でたくさん配置される）。pal = マップの色、acc = アクセント色 ---- */
export const KIT = {
  crate(h, x, z) { // 木箱と段ボールの山
    const s = 0.8 + h.rnd() * 0.5, wood = h.rnd() < 0.5, put = (px, py, pz, k) => (wood ? woodcrate(h, px, py, pz, k, pick(h, ['#b08a5a', '#a07a4a', '#c09a6a'])) : carton(h, px, py, pz, k, k * 0.85, k, pick(h, CARD)));
    put(x, 0, z, s); if (h.rnd() < 0.55) put(x + 0.08, wood ? s : s * 0.85, z - 0.05, s * 0.78); if (h.rnd() < 0.45) put(x + s * 0.98, 0, z + 0.2, s * 0.8);
  },
  barrel(h, x, z, pal) { const n = 1 + Math.floor(h.rnd() * 3), wood = h.rnd() < 0.4; for (let i = 0; i < n; i++) { const px = x + (i % 2) * 0.95, pz = z + (i > 1 ? 0.95 : 0); if (wood) cask(h, px, pz); else drum(h, px, pz, pick(h, pal)); } },
  bush(h, x, z) { // でこぼこのしげみ（かたいので中にはもぐれない）
    const r = 0.7 + h.rnd() * 0.5, c = pick(h, ['#2f7d3a', '#3b8f46', '#2e6b34']);
    h.lump(x, r * 0.7, z, r * 1.1, r * 0.9, r, c, { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3, ry: h.rnd() * 6, pat: ['leaf', c, LEAF, 2, 2] });
    if (h.rnd() < 0.6) h.lump(x + r * 0.95, r * 0.5, z + 0.3, r * 0.75, r * 0.65, r * 0.7, '#3b8f46', { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3.2, pat: ['leaf', '#3b8f46', LEAF, 2, 2] });
  },
  rock(h, x, z, pal) { // 角ばった岩の集まり（平らな面に体をよせて、岩と同じ色にぬる）
    const n = 1 + Math.floor(h.rnd() * 3), c = pick(h, pal);
    for (let i = 0; i < n; i++) stone(h, x + (h.rnd() - 0.5) * 1.8, z + (h.rnd() - 0.5) * 1.8, 0.7 + h.rnd() * 0.7, i % 2 ? shade(c, 0.9) : c);
  },
  planter(h, x, z, pal) { const c = pick(h, pal); h.B(x, 0, z, 1.3, 0.6, 1.3, c, { r: 0.18, pat: ['noise', c, 0, 1, 1] }); h.B(x, 0.58, z, 1.1, 0.04, 1.1, '#4a3426', NC); h.lump(x, 1.15, z, 0.75, 0.68, 0.75, '#2f7d3a', { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3, pat: ['leaf', '#2f7d3a', LEAF, 2, 2] }); },
  pillar(h, x, z, pal) { // 柱（台座・みぞ・柱頭）
    const r = 0.5 + h.rnd() * 0.22, ht = 2.2 + h.rnd() * 1.6, c = pick(h, pal);
    h.B(x, 0, z, r * 2.5, 0.3, r * 2.5, shade(c, 0.88), { r: 0.04 });
    h.cyl(x, 0.3, z, r, ht - 0.55, c, { rt: r * 0.92, seg: 16, pat: ['vband', c, shade(c, 0.86), 4, 1] });
    h.B(x, ht - 0.25, z, r * 2.3, 0.25, r * 2.3, shade(c, 0.9), { r: 0.05 });
  },
  screen(h, x, z, pal, acc) { // ついたて（わく・足つき。半分は模様つき）
    const w = 2 + h.rnd() * 1.6, c = pick(h, pal), ht = 1.5 + h.rnd() * 0.6, o = { r: 0.06, sink: true };
    if (h.rnd() < 0.5) o.pat = rpat(h, pal, acc, Math.round(w / 1.2), 1);
    const one = (cx, cz, al, L) => {
      h.B(cx, 0.1, cz, al ? L : 0.16, ht - 0.1, al ? 0.16 : L, c, o);
      h.B(cx, ht - 0.02, cz, al ? L + 0.08 : 0.22, 0.08, al ? 0.22 : L + 0.08, shade(c, 0.75), { r: 0.02 });
      for (const s of [-1, 1]) h.B(al ? cx + s * (L / 2 - 0.1) : cx, 0, al ? cz : cz + s * (L / 2 - 0.1), al ? 0.12 : 0.5, 0.1, al ? 0.5 : 0.12, '#55606b', { r: 0.02 });
    };
    if (h.rnd() < 0.5) { one(x, z, true, w); if (h.rnd() < 0.5) one(x + w / 2, z + 0.8, false, 1.6); }
    else { one(x, z, false, w); if (h.rnd() < 0.5) one(x + 0.8, z + w / 2, true, 1.6); }
  },
  toy(h, x, z) { const n = 2 + Math.floor(h.rnd() * 4); for (let i = 0; i < n; i++) { const s = 0.5 + h.rnd() * 0.4; brick(h, x + (i % 2) * 0.8, Math.floor(i / 2) * 0.34, z + (i % 3) * 0.15, s, pick(h, TOY)); } },
  shelfK(h, x, z, pal) { const al = h.rnd() < 0.5; bookshelf(h, x, z, al ? 2.2 : 0.7, al ? 0.7 : 2.2, 1.9, pick(h, pal)); },
  sofaK(h, x, z, pal) { if (h.rnd() < 0.5) sofaX(h, x, z, 2.4 + h.rnd(), pick(h, pal), h.rnd() < 0.5 ? 1 : -1); else sofaZ(h, x, z, 2.4 + h.rnd(), pick(h, pal), h.rnd() < 0.5 ? 1 : -1); },
  stool(h, x, z, pal) { for (let i = 0; i < 3; i++) stool(h, x + i * 0.75, z + (i % 2) * 0.5, pick(h, pal)); },
  plantK(h, x, z) { plant(h, x, z); if (h.rnd() < 0.5) plant(h, x + 0.9, z + 0.3); },
  tiresK(h, x, z) { tires(h, x, z, 2 + Math.floor(h.rnd() * 3)); if (h.rnd() < 0.6) tires(h, x + 1.05, z + 0.2, 1 + Math.floor(h.rnd() * 3)); },
  pylonK(h, x, z) { for (let i = 0; i < 3; i++) pylon(h, x + i * 0.6, z + (i % 2) * 0.5); h.B(x + 0.6, 0, z - 0.9, 2, 0.9, 0.3, '#f4f4f4', { r: 0.12, pat: ['diag', '#f4f4f4', '#e0413a', 3, 1] }); },
  vend(h, x, z) { vending(h, x, z, pick(h, ['#e0413a', '#2f6fb0', '#f4f4f4', '#3f9b6a']), h.rnd() < 0.5 ? 1 : -1); if (h.rnd() < 0.5) bin(h, x + 0.95, z, '#55606b'); },
  pot(h, x, z) { // つぼ（回転体。首が細い）
    for (let i = 0; i < 3; i++) {
      const px = x + i * 0.8, pz = z + (i % 2) * 0.6, s = 0.8 + h.rnd() * 0.6, c = pick(h, ['#b5651d', '#a8582a', '#c97b4a']);
      h.lathe(px, 0, pz, [[0.001, 0], [0.22 * s, 0], [0.38 * s, 0.3 * s], [0.4 * s, 0.55 * s], [0.3 * s, 0.85 * s], [0.16 * s, 1.0 * s], [0.2 * s, 1.12 * s], [0.18 * s, 1.14 * s], [0.12 * s, 1.0 * s]], c, { pat: ['hstripe', c, shade(c, 0.78), 1, 3], cols: [[0, 0.75 * s, 0.38 * s, 0.32 * s], [0.75 * s, 1.14 * s, 0.22 * s, 0.18 * s]] });
    }
  },
  crystal(h, x, z) { // 六角の結晶のかたまり
    for (let i = 0; i < 3 + Math.floor(h.rnd() * 3); i++) {
      const r = 0.22 + h.rnd() * 0.3, ht = 0.8 + h.rnd() * 1.8, px = x + (h.rnd() - 0.5) * 1.4, pz = z + (h.rnd() - 0.5) * 1.4, c = pick(h, ['#5a3a8a', '#7b4fb8', '#8a5cff', '#4a2a70']);
      h.cyl(px, 0, pz, r, ht, c, { seg: 6, rough: 0.2, glow: 0.15 }); h.cone(px, ht, pz, r, r * 1.6, shade(c, 1.15), { seg: 6, rough: 0.2, glow: 0.2 });
    }
  },
  neonBox(h, x, z, pal) { const s = 0.9 + h.rnd() * 0.5; h.B(x, 0, z, s, s, s, pick(h, pal), { r: 0.2 }); h.B(x, s, z, s * 0.9, 0.06, s * 0.9, pick(h, ['#ff3ab8', '#33eaff', '#ffd940']), { glow: 1.3 }); if (h.rnd() < 0.5) h.B(x + s, 0, z, s * 0.8, s * 1.4, s * 0.8, pick(h, pal), { r: 0.2 }); },

  /* ---- 色をぬって隠れるための物（模様つき・丸い形） ---- */
  mural(h, x, z, pal, acc) { // 模様の壁（コの字のくぼみに入って隠れる）
    const al = h.rnd() < 0.5, w = 2.6 + h.rnd() * 1.2, ht = 2.1 + h.rnd() * 0.8, t = 0.36, wl = 0.9 + h.rnd() * 0.5, sd = h.rnd() < 0.5 ? 1 : -1;
    const p = rpat(h, pal, acc, Math.max(2, Math.round(w / 1.2)), Math.max(2, Math.round(ht / 1.2)));
    const o = { pat: p, r: 0.16, sink: true }, ow = { pat: [p[0], p[1], p[2], 1, p[4]], r: 0.16, sink: true }; // 模様の壁には体の前の方が少し入る
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
    h.ring(x, sh * 0.72, z, 0.3 * s, 0.05 * s, '#f7f3ea'); // つば
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
  },

  /* ---- カメレオンのように「同じ色・模様の場所にはりついて」隠れるための物 ---- */
  // くぼみのある模様の壁：くぼみ（体が入る深さ）に入って、くぼみのおくと同じ色に塗る。高い所のくぼみには登って入る
  nook(h, x, z, pal, acc, f = {}) {
    const al = f.al != null ? f.al : h.rnd() < 0.5, sd = f.sd || (h.rnd() < 0.5 ? 1 : -1);
    const L = f.L || 3.8 + h.rnd() * 1.4, ht = 2.6 + h.rnd() * 0.7, T = 0.75, nd = 0.42, bt = 0.08;
    const p = rpat(h, pal, acc, 1, 1, ['bigcamo', 'hstripe', 'vband', 'check2', 'dots', 'splat', 'brick', 'zigzag', 'camo']);
    const inC = Array.isArray(p[2]) ? p[2][0] : p[2];
    const B = (a0, a1, y0, y1, b0, b1, pat) => { // a = 長さの向き、b = 厚みの向き（＋がくぼみのある面）
      if (a1 - a0 < 0.02 || y1 - y0 < 0.02) return;
      const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2 * sd, pp = [pat[0], pat[1], pat[2], Math.max(1, Math.round((a1 - a0) / 1.1)), Math.max(1, Math.round((y1 - y0) / 1.1))];
      h.B(al ? x + ca : x + cb, y0, al ? z + cb : z + ca, al ? a1 - a0 : b1 - b0, y1 - y0, al ? b1 - b0 : a1 - a0, pat[1], { pat: pp, r: 0.03, sink: true });
    };
    const nN = L > 4.4 ? 2 : 1 + (h.rnd() < 0.5 ? 1 : 0), N = [];
    for (let i = 0; i < nN; i++) N.push({ c: -L / 2 + L * (i + 0.5) / nN + (h.rnd() - 0.5) * 0.3, w: 0.95 + h.rnd() * 0.3, hh: 1.3 + h.rnd() * 0.3, y: i % 2 && ht > 2.8 ? 1.0 : 0 });
    const inner = ['noise', inC, 0, 1, 1];
    let a = -L / 2;
    for (const n of N) {
      const a0 = n.c - n.w / 2, a1 = n.c + n.w / 2;
      B(a, a0, 0, ht, -T / 2 + bt, T / 2, p); // くぼみのあいだの壁
      B(a0, a1, 0, n.y, -T / 2 + bt, T / 2, p); // くぼみの下
      B(a0, a1, n.y + n.hh, ht, -T / 2 + bt, T / 2, p); // くぼみの上
      B(a0, a1, n.y, n.y + n.hh, -T / 2 + bt, T / 2 - nd, inner); // くぼみのおく（無地なので体を同じ色に塗りやすい）
      a = a1;
    }
    B(a, L / 2, 0, ht, -T / 2 + bt, T / 2, p);
    B(-L / 2, L / 2, 0, ht, -T / 2, -T / 2 + bt, p); // うしろの面
    h.B(x, ht, z, al ? L + 0.16 : T + 0.12, 0.14, al ? T + 0.12 : L + 0.16, shade(p[1], 0.8), { r: 0.04 }); // 上のふち
  },
  // もようの大きなブロックの山：ブロックのあいだのすき間・のせたブロックの下のトンネルに入って、同じ模様に塗る
  blocks(h, x, z, pal, acc) {
    const s = 1.3 + h.rnd() * 0.4, g = 0.55, off = s / 2 + g / 2, skip = Math.floor(h.rnd() * 6), ks = ['bigcamo', 'check2', 'dots', 'hstripe', 'vband', 'zigzag', 'splat', 'diag', 'brick'];
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach((c, i) => { if (i === skip) return; const p = rpat(h, pal, acc, 1, 1, ks); h.B(x + c[0] * off, 0, z + c[1] * off, s, s * 0.9, s, p[1], { pat: p, r: 0.06, sink: true }); });
    const br = [[0, 1, true, -1], [2, 3, true, 1], [0, 2, false, -1], [1, 3, false, 1]].filter(b => b[0] !== skip && b[1] !== skip), b = pick(h, br), p = rpat(h, pal, acc, 2, 1, ks);
    if (b[2]) h.B(x, s * 0.9, z + b[3] * off, 2 * s + g, s * 0.7, s * 0.85, p[1], { pat: p, r: 0.06, sink: true }); // 上にのった横長のブロック（下にトンネル）
    else h.B(x + b[3] * off, s * 0.9, z, s * 0.85, s * 0.7, 2 * s + g, p[1], { pat: p, r: 0.06, sink: true });
  },
  // 地層の岩：色の帯がかさなる大きな岩。下の層が小さく、上の層が「ひさし」になって、その下に立って隠れられる
  outcrop(h, x, z, pal, acc, k = 1) {
    const c0 = pick(h, pal), c1 = pick(h, pal), band = [c0, shade(c1, 0.9), shade(c0, 1.12), c1, shade(c0, 0.84)];
    const a = h.rnd() * 6.28, ux = Math.cos(a), uz = Math.sin(a), R = (2.3 + h.rnd() * 0.8) * k, el = 0.72 + h.rnd() * 0.22;
    let y = 0, i = 0;
    const layer = (cx, cz, r, t) => { const c = band[i++ % band.length]; h.slab(cx, y, cz, rockPts(h, r, r * el, 9, 0.1, a), t, c, { top: 0.95, bev: 0.07, pat: ['strata', c, [shade(c, 0.88), shade(c, 1.1)], 0.45, Math.round(4 / t) / 4] }); y += t; };
    layer(x - ux * R * 0.36, z - uz * R * 0.36, R * 0.6, (1.15 + h.rnd() * 0.3) * Math.max(1, k)); // 下の層（小さく、うしろ寄り）
    layer(x, z, R, 0.5 + h.rnd() * 0.25); // ひさしになる層
    const n = 1 + Math.floor(h.rnd() * 3);
    for (let j = 0; j < n; j++) { const kk = 0.8 - j * 0.17, w = (h.rnd() - 0.5) * R * 0.3; layer(x - ux * R * 0.13 * (j + 1) + uz * w, z - uz * R * 0.13 * (j + 1) - ux * w, R * kk, 0.45 + h.rnd() * 0.35); }
  },
  // 岩のすき間：2つの大きな岩のあいだにもぐって、岩肌と同じ色に塗る（上に石がはさまっていることも）
  crevice(h, x, z, pal) {
    const al = h.rnd() < 0.5, c = pick(h, pal), g = 0.74 + h.rnd() * 0.2; let lo = 99;
    for (const s of [-1, 1]) {
      const w = 1.1 + h.rnd() * 0.45, L = 2.4 + h.rnd() * 1.1, ht = 2.3 + h.rnd() * 1.2, cc = s < 0 ? c : shade(c, 0.88);
      h.slab(x + (al ? 0 : s * (g / 2 + w)), 0, z + (al ? s * (g / 2 + w) : 0), rockPts(h, al ? L / 2 : w, al ? w : L / 2, 10, 0.07, 0), ht, cc, { top: 0.92, bev: 0.14, pat: ['rockface', cc, [shade(cc, 0.88), shade(cc, 1.12)], 0.42, 0.42] });
      lo = Math.min(lo, ht);
    }
    if (h.rnd() < 0.55) h.slab(x, lo - 0.05, z, rockPts(h, g / 2 + 0.7, g / 2 + 0.7, 7, 0.12, h.rnd() * 3), 0.55, shade(c, 1.06), { top: 0.8, bev: 0.12, pat: ['rockface', c, [shade(c, 0.9), shade(c, 1.1)], 0.42, 0.42] });
  },
  stoneK(h, x, z, pal) { KIT.rock(h, x, z, pal); },
  // らくがきの壁・ペンキ缶・はしご：しぶきの色を体に塗って壁にはりつく
  graffiti(h, x, z, pal, acc) {
    const al = h.rnd() < 0.5, L = 4 + h.rnd() * 1.5, ht = 2.4 + h.rnd() * 0.6, base = pick(h, ['#f4f4f4', '#2a3038', pal[0], '#d9d2c4']), sd = h.rnd() < 0.5 ? 1 : -1;
    const p = ['graffiti', base, acc, Math.max(2, Math.round(L / 1.6)), Math.max(1, Math.round(ht / 1.6))];
    h.B(x, 0, z, al ? L : 0.3, ht, al ? 0.3 : L, base, { pat: p, r: 0.05, sink: true });
    const wl = 1.4 + h.rnd() * 0.8, e = h.rnd() < 0.5 ? 1 : -1; // 角になる短い壁
    h.B(al ? x + e * (L / 2 - 0.15) : x + sd * (wl / 2 + 0.15), 0, al ? z + sd * (wl / 2 + 0.15) : z + e * (L / 2 - 0.15), al ? 0.3 : wl, ht * 0.85, al ? wl : 0.3, base, { pat: ['graffiti', base, acc, 1, 1], r: 0.05, sink: true });
    for (let i = 0; i < 3 + Math.floor(h.rnd() * 3); i++) { // ペンキ缶
      const c = pick(h, acc), t = (h.rnd() - 0.5) * (L - 1.2), px = al ? x + t : x + sd * (0.4 + h.rnd() * 0.3), pz = al ? z + sd * (0.4 + h.rnd() * 0.3) : z + t;
      h.lathe(px, 0, pz, [[0.001, 0], [0.16, 0], [0.16, 0.26], [0.145, 0.27], [0.001, 0.27]], c, { seg: 14 }); h.B(px, 0.27, pz, 0.3, 0.012, 0.3, c, { nocol: true, flat: true }); // こぼれたペンキ
    }
    const hl = ht * 0.9, t = (h.rnd() - 0.5) * (L - 1.5); // はしご（かたむけて立てかける）
    for (const s of [-1, 1]) h.B(al ? x + t + s * 0.22 : x + sd * 0.35, 0, al ? z + sd * 0.35 : z + t + s * 0.22, 0.06, hl, 0.06, '#c9c9c9', { rot: al ? [sd * 0.18, 0, 0] : [0, 0, -sd * 0.18] });
  },
  // しましまの階段：階段の下にすき間（もぐれる）・上の踊り場のうしろに模様の壁
  stairs(h, x, z, pal, acc) {
    const dir = pick(h, DIRS), n = 4 + Math.floor(h.rnd() * 2), rise = 0.42, run = 0.55, W = 1.6, side = h.rnd() < 0.5 ? 1 : -1;
    const p = rpat(h, pal, acc, 2, 1, ['hstripe', 'vband', 'check2', 'zigzag', 'dots', 'bigcamo']);
    const at = (a, b) => (dir[0] ? [x + dir[0] * a, z + b] : [x + b, z + dir[1] * a]); // a = のぼる向き, b = 横
    const B = (a, b, y, la, ht, lb, o) => { const [px, pz] = at(a, b); h.B(px, y, pz, dir[0] ? la : lb, ht, dir[0] ? lb : la, o.pat ? o.pat[1] : p[1], o); };
    const a0 = -(n * run) / 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k + 0.5) * run, y = (k + 1) * rise;
      B(a, 0, y - 0.14, run + 0.02, 0.14, W, { pat: [p[0], p[1], p[2], 2, 1], r: 0.02 }); // ふみ板
      B(a, side * (W / 2 + 0.1), 0, run, y, 0.2, { pat: [p[0], p[1], p[2], 1, Math.max(1, k)], r: 0.02 }); // 横の壁（ささえ）
    }
    const ty = n * rise, la = a0 + n * run + 0.6;
    B(la, 0, 0, 1.2, ty, W + 0.4, { pat: [p[0], p[1], p[2], 1, 2], r: 0.03, sink: true }); // 踊り場
    B(la + 0.7, 0, ty, 0.25, 2.0, W + 0.4, { pat: [p[0], p[1], p[2], 2, 2], r: 0.03, sink: true }); // 踊り場のうしろの壁
  },
  // 床の大きなもよう＋同じもようのクッション：寝そべって床と同じもようを塗る
  patch(h, x, z, pal, acc) {
    const w = 3 + h.rnd() * 1.4, d = 2.6 + h.rnd() * 1.2, p = rpat(h, pal, acc, Math.max(1, Math.round(w / 1.4)), Math.max(1, Math.round(d / 1.4)), ['bigcamo', 'check2', 'dots', 'zigzag', 'splat', 'confetti', 'wave', 'hstripe']);
    h.B(x, 0, z, w, 0.04, d, p[1], { pat: p, flat: true, nocol: true });
    for (let i = 0; i < 2 + Math.floor(h.rnd() * 2); i++) h.B(x + (h.rnd() - 0.5) * (w - 1), 0, z + (h.rnd() - 0.5) * (d - 1), 0.8 + h.rnd() * 0.4, 0.35 + h.rnd() * 0.3, 0.8 + h.rnd() * 0.4, p[1], { pat: [p[0], p[1], p[2], 1, 1], r: 0.16 });
  },

  /* ---- 形がばらばら・でこぼこの物（すぐにバレないように） ---- */
  junk(h, x, z, pal, acc) { // がらくたの山：かたむいた箱・タイヤ・ボール・横だおしのたる（ひとつずつ見た目どおりに当たる）
    const cs = pal.concat(acc);
    for (let i = 0; i < 10; i++) {
      const a = h.rnd() * 6.28, d = Math.sqrt(h.rnd()) * 1.15, s = 0.35 + h.rnd() * 0.45, y = i > 5 ? 0.4 + h.rnd() * 0.3 : 0, c = pick(h, cs), px = x + Math.cos(a) * d * (i > 5 ? 0.5 : 1), pz = z + Math.sin(a) * d * (i > 5 ? 0.5 : 1), k = h.rnd();
      if (k < 0.5) h.B(px, y, pz, s, s * (0.6 + h.rnd() * 0.6), s * (0.7 + h.rnd() * 0.5), c, { r: 0.06, rot: [h.rnd() * 0.5 - 0.25, h.rnd() * 3.14, h.rnd() * 0.5 - 0.25], pat: h.rnd() < 0.45 ? rpat(h, pal, acc, 1, 1) : undefined });
      else if (k < 0.68) h.ball(px, y + s * 0.5, pz, s * 0.5, c, h.rnd() < 0.5 ? { pat: rpat(h, pal, acc, 2, 1, ['hstripe', 'dots', 'check2']) } : undefined);
      else if (k < 0.84) h.tire(px, y, pz, s * 0.9);
      else h.cyl(px, y + s * 0.45, pz, s * 0.42, s * 1.3, c, { rot: [Math.PI / 2, 0, 0], pat: ['hstripe', c, shade(c, 0.8), 1, 3] });
    }
  },
  bags(h, x, z, pal) { // ふくろの山（ぽってりした、でこぼこの形。ひとつずつ当たる）
    const cs = ['#c8a36a', '#b08a5a', '#d9c49a', '#8a7a5a', '#e8e1d2'].concat(pal), n = 5 + Math.floor(h.rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = h.rnd() * 6.28, d = h.rnd() * 0.9, s = 0.45 + h.rnd() * 0.25, top = i > 3, c = pick(h, cs);
      h.lump(x + Math.cos(a) * d * (top ? 0.5 : 1), top ? 0.62 + s * 0.45 : s * 0.55, z + Math.sin(a) * d * (top ? 0.5 : 1), s * 1.15, s * 0.6, s * 0.85, c, { seed: seed8(h), bump: 0.2, freq: 1.5, ry: h.rnd() * 3.14, core: 0.92, pat: [pick(h, ['noise', 'noise', 'hstripe', 'camo']), c, [shade(c, 0.85), shade(c, 1.12)], 2, 2] });
    }
  },
  sculpt(h, x, z, pal, acc) { // 変な形のオブジェ（ねじれた輪・でこぼこの石を積んだもの）
    const c = pick(h, acc);
    h.B(x, 0, z, 1.9, 0.6, 1.9, pick(h, ['#d9d2c4', '#b9c0c7', '#8d8f94']), { r: 0.25 });
    if (h.rnd() < 0.55) { const R = 0.85 + h.rnd() * 0.35; h.knot(x, 0.6 + R * 1.55 + 0.26, z, R, 0.26, 2, 3, h.rnd() * 3.14, c, { pat: [pick(h, ['rainbow', 'hstripe', 'dots', 'zigzag']), c, acc, 8, 1] }); }
    else { let y = 0.6; for (let i = 0; i < 4; i++) { const s = 0.75 - i * 0.12; h.lump(x + (h.rnd() - 0.5) * 0.35, y + s * 0.8, z + (h.rnd() - 0.5) * 0.35, s, s * 0.85, s, pick(h, acc), { seed: seed8(h), bump: 0.22, freq: 2.6, ry: h.rnd() * 6, pat: rpat(h, pal, acc, 2, 2) }); y += s * 1.45; } }
  },
  coral(h, x, z, pal, acc) { // 枝分かれしたくねくねの形（サンゴ・サボテン・ねじれた木）
    const c = pick(h, pal.concat(acc)), pat = h.rnd() < 0.6 ? rpat(h, pal, acc, 2, 3, ['hstripe', 'dots', 'zigzag', 'camo', 'wave']) : undefined;
    const th = 1.6 + h.rnd() * 1.2, r = 0.3 + h.rnd() * 0.12, nb = 3 + Math.floor(h.rnd() * 3);
    h.cap(x, 0, z, r, th, c, { pat });
    for (let i = 0; i < nb; i++) {
      const a = i / nb * 6.28 + h.rnd() * 0.9, tilt = 0.7 + h.rnd() * 0.6, len = 1.0 + h.rnd() * 1.0, y0 = th * (0.3 + h.rnd() * 0.55), br = r * (0.6 + h.rnd() * 0.25);
      const dx = Math.cos(a) * Math.sin(tilt), dy = Math.cos(tilt), dz = Math.sin(a) * Math.sin(tilt);
      h.capc(x + dx * len / 2, y0 + dy * len / 2, z + dz * len / 2, br, len, dx, dy, dz, c, { pat });
      h.ball(x + dx * len, y0 + dy * len, z + dz * len, br * 1.3, c, { pat });
    }
  },
  goods(h, x, z, pal, acc) { // 商品がぎっしり並んだ棚（こまかい色の中にまぎれる。棚ぜんたいが当たる）
    const al = h.rnd() < 0.5, L = 2.4 + Math.floor(h.rnd() * 3) * 0.5, D = 0.7, w = al ? L : D, d = al ? D : L, c = pick(h, pal), cs = acc.concat(TOY, ['#f4f4f4', '#2a3038']);
    for (const s of [-1, 1]) h.B(x + (al ? s * (L / 2 - 0.04) : 0), 0, z + (al ? 0 : s * (L / 2 - 0.04)), al ? 0.08 : D, 1.95, al ? D : 0.08, c, { nocol: true, r: 0.02 });
    for (let lv = 0; lv < 4; lv++) {
      const y = 0.08 + lv * 0.47; h.B(x, y, z, w, 0.05, d, shade(c, 1.1), { nocol: true, sharp: true });
      h.B(al ? x : x + 0.36, y + 0.02, al ? z + 0.36 : z, al ? w - 0.1 : 0.02, 0.06, al ? 0.02 : d - 0.1, '#f4f4f4', NC); // ねだんのふだ
      for (let t = -L / 2 + 0.14; t < L / 2 - 0.16;) {
        const iw = 0.12 + Math.floor(h.rnd() * 4) * 0.05, ih = 0.15 + Math.floor(h.rnd() * 4) * 0.06, ic = pick(h, cs), px = al ? x + t + iw / 2 : x, pz = al ? z : z + t + iw / 2;
        if (h.rnd() < 0.62) h.B(px, y + 0.05, pz, al ? iw : 0.32, ih, al ? 0.32 : iw, ic, { nocol: true, r: 0.02 });
        else h.cyl(px, y + 0.05, pz, iw * 0.45, ih * 1.25, ic, { nocol: true, seg: 10 });
        t += iw + 0.03;
      }
    }
    h.boxc(x, 0, z, w, 1.95, d);
  },
  laundry(h, x, z, pal, acc) { // 洗たく物（ひらひらの布のうしろに隠れる。布にも当たる）
    const al = h.rnd() < 0.5, L = 3 + h.rnd() * 1.5;
    for (const s of [-1, 1]) { h.cyl(x + (al ? s * L / 2 : 0), 0, z + (al ? 0 : s * L / 2), 0.07, 2.1, '#8d8f94'); h.B(x + (al ? s * L / 2 : 0), 0, z + (al ? 0 : s * L / 2), 0.5, 0.06, 0.5, '#8d8f94'); }
    h.B(x, 2.0, z, al ? L : 0.03, 0.03, al ? 0.03 : L, '#f4f4f4', { nocol: true, sharp: true });
    for (let t = -L / 2 + 0.4; t < L / 2 - 0.3; t += 0.55 + h.rnd() * 0.3) {
      const cw = 0.4 + h.rnd() * 0.35, ch = 0.6 + h.rnd() * 0.6, c = pick(h, acc.concat(pal));
      h.B(x + (al ? t : 0), 2.0 - ch, z + (al ? 0 : t), al ? cw : 0.04, ch, al ? 0.04 : cw, c, { r: 0.01, pat: h.rnd() < 0.6 ? rpat(h, pal, acc, 1, 1) : undefined, rot: al ? [0, 0, (h.rnd() - 0.5) * 0.14] : [(h.rnd() - 0.5) * 0.14, 0, 0] });
      for (const s of [-1, 1]) h.B(x + (al ? t + s * cw * 0.35 : 0), 1.98, z + (al ? 0 : t + s * cw * 0.35), 0.03, 0.07, 0.03, '#ffd940', NC); // せんたくばさみ
    }
  },
  logs(h, x, z) { // 丸太の山（1本ずつ見た目どおりに当たる）
    const al = h.rnd() < 0.5, L = 2 + h.rnd(), r = 0.22;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) {
      const o = (i - (2 - row) / 2) * r * 2.05, c = pick(h, ['#8a5a33', '#7a4c2a', '#9b6b43']), px = x + (al ? 0 : o), py = r + row * r * 1.75, pz = z + (al ? o : 0);
      h.cyl(px, py, pz, r, L, c, { rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0], pat: ['bark', c, 0, 2, 1] });
      for (const s of [-1, 1]) h.cyl(al ? px + s * (L / 2 + 0.005) : px, py, al ? pz : pz + s * (L / 2 + 0.005), r * 0.92, 0.012, '#d9b48a', { nocol: true, rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0], pat: ['wave', '#d9b48a', '#b08a5a', 1, 2] }); // 切り口（年輪）
    }
  },
  parasol(h, x, z, pal, acc) { // パラソルの席（ポール・かさにも当たる）
    const c = pick(h, acc);
    h.cyl(x, 0, z, 0.05, 2.3, '#d9d2c4'); h.cone(x, 2.0, z, 1.6, 0.6, c, { seg: 12, pat: ['vband', c, '#f4f4f4', 6, 1] });
    h.cyl(x, 0, z, 0.25, 0.05, '#8d8f94');
    h.cyl(x, 0.7, z, 0.6, 0.05, '#f4f4f4'); h.cyl(x, 0, z, 0.06, 0.7, '#d9d2c4', { seg: 8 }); // テーブル
    for (const s of [-1, 1]) stool(h, x + s * 1.05, z + s * 0.3, pick(h, pal));
  },
  hedge(h, x, z) { // でこぼこの生け垣（かたいので中にはもぐれない）
    const al = h.rnd() < 0.5, n = 3 + Math.floor(h.rnd() * 3);
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * 0.95, sz = 0.6 + h.rnd() * 0.25; h.lump(x + (al ? o : 0), sz * 0.9, z + (al ? 0 : o), sz, sz * 1.05, sz, '#2f7d3a', { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3.2, pat: ['leaf', '#2f7d3a', LEAF, 2, 2] }); }
  },

  /* ---- 中に入れる物・少し沈める物 ---- */
  gallery(h, x, z, pal) { // 絵がかかった壁（絵に体の前の方を入れて隠れる）
    const al = h.rnd() < 0.5, L = 4.4, ht = 3, t = 0.3, c = pick(h, ['#f4f1e8', '#e8dcc8', '#d9dde0', pal[0]]);
    h.B(x, 0, z, al ? L : t, ht, al ? t : L, c, { r: 0.06 });
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) h.B(al ? x + (k - 0.5) * (L - 0.3) : x, 0, al ? z : z + (k - 0.5) * (L - 0.3), al ? 0.3 : t + 0.2, 0.2, al ? t + 0.2 : 0.3, shade(c, 0.8), { r: 0.02 }); // 足
    for (const s of [-1, 1]) {
      const n = h.rnd() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) { const o = n === 1 ? 0 : (i - 0.5) * 2.1, pw = n === 1 ? 3 : 1.7, ph = n === 1 ? 2.3 : 2.0; pic(h, al ? x + o : x + s * t / 2, 0.3, al ? z + s * t / 2 : z + o, al ? 0 : s, al ? s : 0, pw, ph); }
    }
  },
  hut(h, x, z, pal, acc) { // 小屋（入口から中に入れる・屋根にも登れる）
    const w = 2.3 + h.rnd() * 0.5, d = 2.1 + h.rnd() * 0.4, ht = 1.9, c = pick(h, pal), o = { r: 0.04, pat: h.rnd() < 0.5 ? rpat(h, pal, acc, 2, 2) : ['vstripe', c, shade(c, 0.88), 3, 2] }, dir = pick(h, DIRS);
    shell(h, x, z, w, d, ht, 0.12, c, o, dir, 1.0, 1.45);
    h.cone(x, ht + 0.12, z, (Math.max(w, d) / 2 + 0.25) / 0.707, 1.0, pick(h, acc), { seg: 4, pat: ['hstripe', '#ffffff', 0, 1, 6] });
    const al = dir[1] !== 0; h.B(al ? x + 0.65 : x + dir[0] * (w / 2 + 0.01), 0.9, al ? z + dir[1] * (d / 2 + 0.01) : z + 0.65, al ? 0.6 : 0.02, 0.5, al ? 0.02 : 0.6, '#9fd0e8', { nocol: true, rough: 0.15 }); // 窓
  },
  bigbox(h, x, z) { // 横だおしの大きな段ボール（一面が開いていて中に入れる）
    const w = 1.6 + h.rnd() * 0.4, d = 1.5 + h.rnd() * 0.3, ht = 1.3 + h.rnd() * 0.3, dir = pick(h, DIRS), c = pick(h, CARD), o = { r: 0.03, pat: ['carton', c, 0, 1, 1] };
    shell(h, x, z, w, d, ht, 0.06, c, o, dir, 99, 99);
    if (dir[1]) h.B(x, ht - 0.3, z + dir[1] * (d / 2 + 0.26), w - 0.04, 0.03, 0.55, c, { rot: [dir[1] * 0.55, 0, 0] }); // 開いたふた（当たる）
    else h.B(x + dir[0] * (w / 2 + 0.26), ht - 0.3, z, 0.55, 0.03, d - 0.04, c, { rot: [0, 0, -dir[0] * 0.55] });
  },
  pipe(h, x, z, pal, acc) { // 土管（中を通りぬけられる・上にも乗れる）
    const c = pick(h, ['#b9c0c7', '#a8afb6', '#c9c1b0']);
    tube(h, x, z, 0.97, 0.85, 2.8 + h.rnd() * 0.8, h.rnd() < 0.5, c, { pat: h.rnd() < 0.5 ? ['noise', c, 0, 3, 2] : rpat(h, pal, acc, 3, 2) });
  },
  hlog(h, x, z) { // 中がからっぽの丸太（もぐりこめる）
    const c = pick(h, ['#8a5a33', '#7a4c2a']);
    tube(h, x, z, 0.84, 0.7, 2.6 + h.rnd() * 0.6, h.rnd() < 0.5, c, { pat: ['bark', c, 0, 4, 1] });
  },
  closet(h, x, z, pal, acc) { closet(h, x, z, pick(h, DIRS), pick(h, ['#8a5a33', '#6b4a2b', '#c9a26b', '#f3f1ec', pal[0]]), pal, acc); },
  tent(h, x, z, pal, acc) { const c = pick(h, acc); let c2 = pick(h, acc); if (c2 === c) c2 = '#f4f4f4'; tent(h, x, z, h.rnd() < 0.5, h.rnd() < 0.5 ? 1 : -1, c, c2); },
  ballpit(h, x, z, pal, acc) { // ボールプール（上から飛びこむと体の下の方がしずむ）
    const w = 3 + h.rnd() * 0.8, d = 2.4 + h.rnd() * 0.6, c = pick(h, acc);
    pit(h, x, z, w, d, 0.5, 0.22, c, { r: 0.08, pat: ['vband', c, '#f4f4f4', 6, 1] }, 0.62, 0.44, ['dots', pick(h, TOY), TOY, 4, 3]);
    for (let i = 0; i < 12; i++) h.ball(x + (h.rnd() - 0.5) * (w - 0.8), 0.64, z + (h.rnd() - 0.5) * (d - 0.8), 0.14, pick(h, TOY), NC); // ボールの海の表面の飾り
  },
  grass(h, x, z) { // 背の高い草のかたまり（かたいので中にはもぐれない。上に乗ると少し沈む）
    const n = 4 + Math.floor(h.rnd() * 3), c = pick(h, ['#5f9a3a', '#6fae4a', '#4f8a32']);
    for (let i = 0; i < n; i++) {
      const a = h.rnd() * 6.28, d = Math.sqrt(h.rnd()) * 1.0, s = 0.6 + h.rnd() * 0.3, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      h.lump(px, s * 0.6, pz, s * 0.85, s * 1.1, s * 0.85, c, { core: 0.9, seed: seed8(h), bump: 0.24, freq: 4.5, pat: ['leaf', c, ['#7fc24f', '#3f7a2a', '#a8c94f'], 2, 3] });
      for (let k = 0; k < 3; k++) { const b = h.rnd() * 6.28; h.cone(px + Math.cos(b) * s * 0.5, s * 0.9, pz + Math.sin(b) * s * 0.5, 0.05, 0.6 + h.rnd() * 0.4, '#7fc24f', { nocol: true, seg: 4 }); } // 穂先（細いので体はかくれない）
    }
  },
  leafpile(h, x, z) { // 落ち葉の山（上に乗ると少しだけ沈む）
    const r = 1.1 + h.rnd() * 0.4, c = pick(h, ['#d98a2b', '#c9573f', '#e0b040', '#a8692b']);
    h.lump(x, 0, z, r, r * 0.7, r * 0.9, c, { core: 0.9, half: true, seed: seed8(h), bump: 0.18, freq: 3, pat: ['confetti', c, ['#e0b040', '#b8452f', '#8a5a33', '#f0d040'], 2, 2] });
  },
  dumpster(h, x, z) { // 大きなゴミ箱（上から飛びこんで中に隠れる）
    const al = h.rnd() < 0.5, w = al ? 2.3 : 1.5, d = al ? 1.5 : 2.3, ht = 1.25, c = pick(h, ['#2f6f4a', '#2f6fb0', '#55606b', '#b8452f']);
    pit(h, x, z, w, d, ht, 0.08, c, { r: 0.03, pat: ['vband', c, shade(c, 0.85), 4, 1] }, 0.55, 0.3, ['camo', '#3a3d44', ['#55606b', '#2a2d33', '#8a7a5a'], 2, 2]);
    if (al) h.B(x, ht - 0.02, z - d / 2 - 0.12, w, 0.9, 0.05, shade(c, 0.85), { rot: [-0.25, 0, 0] }); // 開いたふた（当たる）
    else h.B(x - w / 2 - 0.12, ht - 0.02, z, 0.05, 0.9, d, shade(c, 0.85), { rot: [0, 0, 0.25] });
    for (const s of [-1, 1]) for (const t of [-1, 1]) h.wheel(x + s * (w / 2 - 0.2), 0.08, z + t * (d / 2 - 0.2), 0.08, 0.06, al ? 'z' : 'x', NC);
  },
  booth(h, x, z, pal, acc) { // 電話ボックス・写真ブース（半分しめたカーテンのうしろに隠れる。カーテンにも当たる）
    const dir = pick(h, DIRS), w = 1.5, d = 1.5, ht = 2.3, c = pick(h, acc), cc = pick(h, acc.concat(pal)), al = dir[0] === 0;
    shell(h, x, z, w, d, ht, 0.1, c, { r: 0.04, pat: rpat(h, pal, acc, 1, 2) }, dir, 99, 99);
    const cw = (w - 0.2) / 2, sh = h.rnd() < 0.5 ? 1 : -1;
    h.B(x + dir[0] * (w / 2 - 0.06) + (al ? sh * cw / 2 : 0), 0.35, z + dir[1] * (d / 2 - 0.06) + (al ? 0 : sh * cw / 2), al ? cw : 0.05, ht - 0.45, al ? 0.05 : cw, cc, { r: 0.02, pat: [pick(h, ['vband', 'dots', 'hstripe']), cc, '#f4f4f4', 2, 2] });
    h.B(x + dir[0] * (w / 2 - 0.06), ht - 0.12, z + dir[1] * (d / 2 - 0.06), al ? w - 0.2 : 0.03, 0.03, al ? 0.03 : d - 0.2, '#c9c9c9', NC); // カーテンレール
    h.B(x - dir[0] * 0.5, 0, z - dir[1] * 0.5, al ? 0.5 : 0.4, 0.5, al ? 0.4 : 0.5, '#55606b', { r: 0.1 }); // 中のいす
    h.B(x, ht + 0.1, z, w + 0.1, 0.35, d + 0.1, pick(h, acc), { glow: 0.8, r: 0.05 });
  }
};
// 大きめの小物は、まわりに広めのすき間がないと置かない
export const KIT_R = { gallery: 2.6, hut: 2.0, bigbox: 1.5, pipe: 2.2, hlog: 2.0, closet: 1.9, tent: 2.0, ballpit: 2.3, grass: 1.8, leafpile: 1.6, dumpster: 1.7, booth: 1.4, tiresK: 1.4, mural: 2.4, arch: 2.2, blob: 1.8, rug: 2.0, cubes: 1.6, flowers: 1.8, mush: 1.7, screen: 1.9, sofaK: 1.8, junk: 1.8, bags: 1.6, sculpt: 1.6, coral: 1.9, goods: 1.9, laundry: 2.4, logs: 1.7, parasol: 1.9, hedge: 2.5, rock: 1.9,
  nook: 2.9, blocks: 2.2, outcrop: 3.3, crevice: 3.0, stoneK: 1.9, graffiti: 2.9, stairs: 2.6, patch: 2.3, pot: 1.6, crystal: 1.4, vend: 1.3 };

// ---- 街づくり：塗って隠れる・壁にくっついて隠れるための仕掛けがいっぱいの建物 ----
// T = { pal: 建物の色, acc: アクセント色, night, neon, facade: 外壁の模様 }
function bld(h, T, x, z, w, d, ht, fz) { // fz = ±1：表（通り側）が向く z の向き
  const col = pick(h, T.pal), acc = pick(h, T.acc), zf = z + fz * d / 2, mural = h.rnd() < 0.3;
  let ac2 = pick(h, T.acc); if (ac2 === col) ac2 = '#f4f4f4';
  const fk = pick(h, T.facade), fpat = [fk, col, T.neon ? acc : (h.rnd() < 0.5 ? '#f4f4f4' : ac2), Math.max(1, Math.round(w / 2.2)), Math.max(1, Math.round(ht / 2.2))];
  h.B(x, 0, z, w, ht, d, col, { pat: fpat, r: 0.22, glow: T.neon ? 0.45 : 0, sink: true }); // 外壁ぜんたいが模様（体の前の方が少し入る）（スポイトで吸って塗れば溶け込める）
  // 外壁の凹凸：角の柱・屋根のふち・1階と2階のあいだの帯（すき間やくぼみに隠れる）
  const dc = shade(col, 0.82);
  for (const s of [-1, 1]) h.B(x + s * (w / 2 - 0.25), 0, zf + fz * 0.16, 0.5, ht, 0.32, dc, { r: 0.08 });
  h.B(x, ht - 0.4, zf + fz * 0.22, w + 0.3, 0.4, 0.44, dc, { r: 0.08 });
  h.B(x, 3.15, zf + fz * 0.1, w - 1.0, 0.18, 0.2, dc, { r: 0.04 });
  if (mural) { // 大きな壁画
    const mp = [pick(h, ['splat', 'confetti', 'rainbow', 'camo', 'wave', 'graffiti', 'bigcamo']), pick(h, ['#f4f4f4', col, '#2a3038']), T.acc, 3, 2];
    h.B(x, 0.05, zf + fz * 0.15, w - 1.1, Math.min(ht - 0.6, 4.6), 0.3, '#ffffff', { sharp: true, sink: true, pat: mp, glow: T.neon ? 0.6 : 0 }); // 壁画（体の前の方を入れて隠れる）
  } else { // 1階の店先：ショーウィンドウ・とびら・入口の段
    h.B(x - w * 0.12, 0.3, zf + fz * 0.03, w * 0.55, 2.0, 0.06, T.night ? '#ffd98a' : '#9fd0e8', { nocol: true, glow: T.night ? 0.9 : 0.15 });
    h.B(x - w * 0.12, 0.3, zf + fz * 0.07, 0.06, 2.0, 0.04, dc, NC); h.B(x - w * 0.12, 0.22, zf + fz * 0.12, w * 0.58, 0.1, 0.2, dc, { r: 0.02 }); // 窓わく・窓の下の台
    h.B(x + w * 0.3, 0, zf + fz * 0.03, 1.1, 2.2, 0.06, '#3a3d44', NC); h.B(x + w * 0.3 + 0.38, 1.0, zf + fz * 0.08, 0.06, 0.2, 0.04, '#c9ccd0', NC);
    h.B(x + w * 0.3, 0, zf + fz * 0.35, 1.5, 0.14, 0.7, '#b9b7b0', { r: 0.02 });
  }
  // 日よけ（乗れる・上に隠れられる）
  const aw = w * (0.6 + h.rnd() * 0.25);
  h.B(x, 2.55, zf + fz * 0.8, aw, 0.16, 1.6, acc, { pat: ['vband', acc, '#f4f4f4', Math.max(2, Math.round(aw / 0.8)), 1], r: 0.06, glow: T.neon ? 0.5 : 0 });
  h.B(x, 2.32, zf + fz * 1.58, aw, 0.24, 0.04, acc, { pat: ['zigzag', acc, '#f4f4f4', Math.max(2, Math.round(aw / 0.8)), 1] }); // 日よけのたれ
  // 上の階：窓・ベランダ（乗れる）・室外機（足場）
  for (let y = 3.6; y < ht - 1.3; y += 2.8) {
    for (const s of [-1, 1]) if (h.rnd() < 0.8) {
      const ww = Math.min(1.4, w * 0.22);
      h.B(x + s * w * 0.25, y, zf + fz * 0.03, ww, 1.3, 0.05, T.night ? pick(h, ['#ffd98a', '#9fd0e8', '#2a3038']) : '#9fd0e8', { nocol: true, glow: T.night ? 0.7 : 0.1 });
      h.B(x + s * w * 0.25, y + 0.62, zf + fz * 0.06, ww, 0.05, 0.03, '#f4f4f4', NC); // 窓の桟
      h.B(x + s * w * 0.25, y - 0.14, zf + fz * 0.17, ww + 0.25, 0.14, 0.34, '#d9d2c4', { r: 0.04 }); // 窓の下の出っぱり（足場）
      if (h.rnd() < 0.3) { h.B(x + s * w * 0.25, y - 0.0, zf + fz * 0.3, ww, 0.3, 0.3, '#8a5a33', { r: 0.03 }); h.lump(x + s * w * 0.25, y + 0.42, zf + fz * 0.3, ww * 0.45, 0.22, 0.17, '#3b8f46', { ...LEAFC, seed: seed8(h), bump: 0.3, freq: 3, pat: ['confetti', '#3b8f46', ['#ff6fa8', '#ffd940', '#ffffff'], 2, 1] }); } // 窓の花だん
    }
    if (h.rnd() < 0.45) {
      const bx = x + (h.rnd() - 0.5) * w * 0.4, bw = Math.min(3, w * 0.45);
      h.B(bx, y - 0.35, zf + fz * 0.65, bw, 0.2, 1.3, '#d8d2c4', { r: 0.06 });
      h.B(bx, y - 0.15, zf + fz * 1.22, bw, 0.75, 0.12, ac2, { pat: [pick(h, ['vband', 'dots', 'hstripe']), ac2, '#f4f4f4', Math.max(2, Math.round(bw / 0.7)), 1], r: 0.05 });
    }
    if (h.rnd() < 0.35) { const ax = x + (h.rnd() - 0.5) * w * 0.7; h.B(ax, y - 0.55, zf + fz * 0.35, 0.95, 0.65, 0.6, '#d9dde0', { r: 0.1 }); h.cyl(ax, y - 0.22, zf + fz * 0.66, 0.24, 0.02, '#55606b', { nocol: true, rot: [Math.PI / 2, 0, 0] }); } // 室外機（ファン）
    if (T.neon) h.B(x, y - 0.75, z, w + 0.1, 0.14, d + 0.1, pick(h, T.acc), { nocol: true, glow: 1.5 }); // ネオンの帯
  }
  // 横に突き出た看板（両面にくっつける）・雨どい
  const sx = h.rnd() < 0.5 ? -1 : 1;
  if (h.rnd() < 0.7) { const sh = Math.min(4.6, ht - 3.4); h.B(x + sx * (w / 2 - 0.45), 3.1, zf + fz * 0.95, 0.36, sh, 1.7, acc, { pat: [pick(h, ['hstripe', 'check2', 'dots', 'rainbow', 'zigzag']), acc, T.neon ? '#ffffff' : ac2, 1, 3], r: 0.1, glow: T.night ? 0.7 : 0, sink: true }); h.B(x + sx * (w / 2 - 0.45), 3.1 + sh, zf + fz * 0.4, 0.08, 0.08, 0.8, '#55606b'); }
  if (h.rnd() < 0.6) { h.cyl(x - sx * (w / 2 - 0.2), 0, zf + fz * 0.18, 0.13, ht, '#8d8f94'); for (let y = 2; y < ht; y += 2.5) h.B(x - sx * (w / 2 - 0.2), y, zf + fz * 0.09, 0.1, 0.08, 0.2, '#6d7076', NC); }
  // 屋上：低い壁（かげに隠れる）・タンク・看板
  for (const s of [-1, 1]) { h.B(x, ht, z + s * (d / 2 - 0.1), w, 0.6, 0.2, col, { r: 0.06 }); h.B(x + s * (w / 2 - 0.1), ht, z, 0.2, 0.6, d - 0.4, col, { r: 0.06 }); }
  if (h.rnd() < 0.45) { const tx = x - w * 0.25, tz = z - fz * d * 0.15; h.cyl(tx, ht + 0.3, tz, 0.85, 1.7, '#b9c0c7', { pat: ['hstripe', '#b9c0c7', '#a3aab2', 1, 3] }); for (const s of [-1, 1]) for (const t of [-1, 1]) h.cyl(tx + s * 0.5, ht, tz + t * 0.5, 0.05, 0.3, '#55606b', { seg: 6 }); }
  if (h.rnd() < 0.5) h.B(x + w * 0.2, ht, z, 1.2, 0.8, 1, '#d9dde0', { r: 0.12 });
  if (h.rnd() < 0.4) { // 屋上の大きな看板
    const bw = Math.min(5, w - 1);
    for (const s of [-1, 1]) h.B(x + s * bw * 0.35, ht, z - fz * d * 0.2, 0.18, 1.6, 0.18, '#55606b');
    h.B(x, ht + 1.6, z - fz * d * 0.2, bw, 2.2, 0.3, acc, { pat: [pick(h, ['splat', 'confetti', 'check2', 'wave', 'rainbow']), acc, T.acc, 3, 1], r: 0.08, glow: T.night ? 0.6 : 0, sink: true });
  }
}
function row(h, T, x0, x1, z, d, fz, hmin, hmax) { // 通りぞいに建物を並べる（ところどころに路地）
  let x = x0;
  while (x1 - x > 4.5) {
    const w = Math.min(x1 - x, 5 + h.rnd() * 4.5); if (x1 - x - w < 4.5) { bld(h, T, (x + x1) / 2, z, x1 - x, d, hmin + h.rnd() * (hmax - hmin), fz); break; }
    bld(h, T, x + w / 2, z, w, d, hmin + h.rnd() * (hmax - hmin), fz); x += w;
    if (h.rnd() < 0.45) { // 路地：木箱・ゴミ箱
      const gw = 1.8 + h.rnd() * 1; KIT.crate(h, x + gw / 2, z + (h.rnd() - 0.5) * d * 0.6); x += gw;
    }
  }
}
function courtyard(h, T, x0, x1, z0, z1) { // 建物のあいだの中庭
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0, k = h.rnd();
  if (k < 0.3) { // 模様のタイル広場
    h.F(cx, cz, w - 1, d - 1, '#ffffff', [pick(h, ['check2', 'dots', 'zigzag', 'brick']), pick(h, T.pal), pick(h, T.acc), Math.round(w / 3), Math.round(d / 3)], 1);
    for (const s of [-1, 1]) bench(h, cx + s * w * 0.3, cz, true, WOOD, 1);
    KIT.pole(h, cx, cz, T.pal, T.acc);
  } else if (k < 0.55) { // 小さな公園
    h.F(cx, cz, w - 1, d - 1, '#6fae5a', null, 1);
    tree(h, cx - w * 0.22, cz, 0.9); KIT.bush(h, cx + w * 0.25, cz - d * 0.15); KIT.flowers(h, cx + w * 0.15, cz + d * 0.2);
  } else if (k < 0.78) { // らくがきの路地裏（はりついて隠れる）
    KIT.graffiti(h, cx - w * 0.18, cz, T.pal, T.acc); KIT.blocks(h, cx + w * 0.22, cz, T.pal, T.acc);
  } else { // 屋台
    for (const s of [-1, 1]) {
      const sx = cx + s * w * 0.22, c = pick(h, T.acc);
      table(h, sx, cz, 2.6, 1.2, '#b08a5a', 0.95);
      for (let i = 0; i < 3; i++) h.B(sx - 0.8 + i * 0.8, 0.95, cz, 0.6, 0.35, 0.9, pick(h, TOY), { r: 0.1 });
      for (const t of [-1, 1]) h.B(sx + t * 1.2, 0, cz - 0.5, 0.1, 2.3, 0.1, '#55606b');
      h.B(sx, 2.3, cz, 3, 0.14, 1.6, c, { pat: ['vband', c, '#f4f4f4', 4, 1], glow: T.neon ? 0.5 : 0 });
    }
  }
}
function city(h, T) {
  // 歩道
  for (const s of [-1, 1]) h.B(0, 0, s * 5.2, 72, 0.15, 2.4, '#b9b7b0', { flat: true, pat: ['check2', '#b9b7b0', '#aaa8a1', 36, 1] });
  for (const s of [-1, 1]) for (const t of [-1, 1]) h.B(s * 4.7, 0, t * 16.2, 2.4, 0.15, 21.6, '#b9b7b0', { flat: true, pat: ['check2', '#b9b7b0', '#aaa8a1', 1, 11] });
  for (let x = -34; x <= 34; x += 4) if (Math.abs(x) > 6) h.B(x, 0, 0, 2, 0.02, 0.25, '#ffffff', FL); // 道路の線
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) h.B(s * 8.6, 0, -2.6 + k * 1.05, 1.6, 0.02, 0.5, '#ffffff', FL); // 横断歩道
  // 4つの区画 × 2ブロック：通りぞいの建物・奥の建物・その間の中庭
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const [a, b] of [[6.4, 18.6], [21.4, 34.6]]) {
    const x0 = sx > 0 ? a : -b, x1 = sx > 0 ? b : -a;
    row(h, T, x0, x1, sz * 10.4, 7, -sz, T.hmin, T.hmax); // 通りに面した建物（大通りのほうを向く）
    row(h, T, x0, x1, sz * 23.6, 6.4, -sz, T.hmin + 1, T.hmax + 2); // 奥の建物（中庭のほうを向く）
    courtyard(h, T, x0, x1, sz > 0 ? 14.2 : -20.2, sz > 0 ? 20.2 : -14.2);
    // 路地の入口（ブロックの間）に木箱・たる
    if (a > 10) { KIT.crate(h, sx * 20, sz * 11); KIT.barrel(h, sx * 20, sz * 17, T.pal); }
  }
  // まんなかの噴水広場
  h.F(0, 0, 12, 10, '#ffffff', [pick(h, ['check2', 'brick']), '#e8dcc8', pick(h, T.acc), 6, 5], 1);
  h.cyl(0, 0, 0, 2.8, 0.6, '#b9c0c7', { pat: ['brick', '#b9c0c7', '#9aa1a8', 8, 1] }); h.ring(0, 0.6, 0, 2.75, 0.08, '#d9dde0'); h.cyl(0, 0.6, 0, 2.5, 0.04, T.neon ? '#33eaff' : '#5fa8d8', { nocol: true, glow: T.neon ? 0.9 : 0 });
  h.cap(0, 0, 0, 0.55, 2.2, '#ffffff', { pat: ['rainbow', '#ffffff', T.acc, 2, 3] }); h.cyl(0, 1.5, 0, 1.0, 0.12, '#d9dde0', { rt: 0.8 });
  // 大通りの小物：街灯・ベンチ・自動販売機・バス停・看板柱・ゴミ箱・消火栓・ポスト
  for (let x = -32; x <= 32; x += 8) if (Math.abs(x) > 6) for (const s of [-1, 1]) {
    const z = s * 4.6, k = Math.round(x / 8 + s * 3) % 4;
    h.cyl(x, 0.15, z, 0.16, 0.2, '#444a50'); h.cyl(x, 0.15, z, 0.09, 4, '#444a50'); h.B(x, 4.0, z - s * 0.3, 0.08, 0.08, 0.7, '#444a50'); h.ball(x, 4.35, z - s * 0.55, 0.32, T.neon ? pick(h, T.acc) : '#fff4c2', { glow: 1 });
    if (k === 0) { vending(h, x + 1.6, z + s * 0.4, pick(h, ['#e04f4f', '#2f6fb0', '#f4f4f4', '#3f9b6a']), -s); vending(h, x + 2.7, z + s * 0.4, pick(h, T.acc), -s); bin(h, x + 3.6, z + s * 0.2, '#55606b'); }
    else if (k === 1) { bench(h, x + 2, z, true, WOOD, s); hydrant(h, x - 1.2, z - s * 0.4); }
    else if (k === 2) { // バス停（ポスターの壁・屋根・ベンチ）
      const c = pick(h, T.acc); h.B(x + 2.2, 0.15, z + s * 0.9, 3.2, 2.4, 0.16, c, { pat: [pick(h, ['splat', 'confetti', 'wave', 'dots']), c, T.acc, 2, 1], r: 0.06, glow: T.night ? 0.4 : 0, sink: true });
      h.B(x + 2.2, 2.55, z + s * 0.5, 3.4, 0.14, 1.2, '#55606b'); for (const t of [-1, 1]) h.B(x + 2.2 + t * 1.6, 0.15, z + s * 0.1, 0.08, 2.4, 0.08, '#55606b');
      bench(h, x + 2.2, z + s * 0.45, true, WOOD, s); h.cyl(x + 0.4, 0.15, z - s * 0.3, 0.05, 2.6, '#55606b'); h.cyl(x + 0.4, 2.75, z - s * 0.3, 0.3, 0.05, '#2f6fb0', { rot: [Math.PI / 2, 0, 0] });
    } else { // 看板柱（大きな板にくっつける）・ポスト
      const c = pick(h, T.acc); for (const t of [-1, 1]) h.cyl(x + 2 + t * 1.3, 0.15, z, 0.1, 2.4, '#55606b');
      h.B(x + 2, 2.4, z, 3.2, 1.8, 0.25, c, { pat: [pick(h, ['check2', 'hstripe', 'rainbow', 'camo', 'graffiti']), c, T.acc, 2, 1], r: 0.08, glow: T.night ? 0.5 : 0, sink: true });
      mailbox(h, x - 1.4, z);
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
        .forEach(([k, a, b], i) => h.B(-8.75 + i * 3.5, 0, -8.1, 2.8, 3, 0.35, a, { pat: [k, a, b, 2, 2], r: 0.15, sink: true }));
      // 手前の壁：体の前の方を入れて隠れる絵／ボールプール／入れる小屋
      pic(h, -1.9, 0.15, 8.5, 0, -1, 3.2, 2.6, 'artField', ['#59b6d8', '#f0d040', '#e04f4f', '#4fbf6a', '#f4f1e8']); pic(h, 1.9, 0.15, 8.5, 0, -1, 3.2, 2.6, 'artLand', ARTPAL[0]);
      pit(h, -2.4, -5.4, 3.2, 2.2, 0.5, 0.22, '#4f7fe0', { r: 0.08, pat: ['vband', '#4f7fe0', '#f4f4f4', 6, 1] }, 0.62, 0.44, ['dots', '#f0d040', TOY, 4, 3]);
      shell(h, 2.6, -5.4, 2.2, 2.0, 1.9, 0.12, '#e8dcc8', { r: 0.04, pat: ['vstripe', '#e8dcc8', '#d4c4a8', 3, 2] }, [0, 1], 1.0, 1.45); h.cone(2.6, 2.02, -5.4, 1.35 / 0.707, 1.0, '#c9573f', { seg: 4 });
      // 左：くっつく練習の壁（でっぱりつき）
      h.B(-10.7, 0, -2.5, 0.5, 4.5, 6, '#7d8fb3', { pat: ['vband', '#7d8fb3', '#f4f4f4', 4, 3], r: 0.12 });
      for (const [z, y] of [[-4.5, 1.4], [-1.5, 2.4], [-3.5, 3.4]]) h.B(-10.2, y, z, 0.6, 0.18, 1.2, '#f4f4f4', { r: 0.06 });
      // くぼみの壁（カメレオンの練習：くぼみに入って、おくと同じ色に塗る）
      KIT.nook(h, -6.4, -6.2, ['#f0d040', '#59b6d8', '#e0719a'], TOY, { al: true, sd: 1, L: 3.4 });
      // 左手前：ラウンジ
      sofaZ(h, -9.6, 4.5, 3.6, '#c9573f', -1); table(h, -7.6, 4.5, 1.2, 2, '#6b4a2b', 0.45); plant(h, -9.8, 7.4);
      // 右：色見本・小物
      TOY.forEach((c, i) => h.B(10.75, 0.6 + (i % 2) * 1.3, -4 + Math.floor(i / 2) * 2.2, 0.15, 1.1, 1.8, c));
      KIT.junk(h, 8.2, 2.6, ['#e8dcc8', '#7d8fb3'], TOY);
      KIT.sculpt(h, -7, 0.8, ['#e8dcc8'], TOY);
      KIT.outcrop(h, 6.6, -2.2, ['#c9a36a', '#b8452f', '#e8dcc8'], TOY, 0.62); // 地層の岩（ひさしの下に入る練習）
      KIT.arch(h, 6.4, 5.9, ['#ffffff'], TOY);
      KIT.mush(h, -5.4, 6.2, ['#e04f4f']);
      h.dome(5.8, 0, -5.6, 1.0, 0.75, 0.9, '#b06fd8', { pat: ['dots', '#b06fd8', '#f7f3ea', 3, 2], solid: true });
      for (const [x, z] of [[-10.2, -7.8], [10.2, -7.8], [-10.2, 7.8], [10.2, 7.8]]) lamp(h, x, z);
      plant(h, 9.8, 7.4); plant(h, 9.8, -7.4);
    }
  },

  /* ---------- おうち ---------- */
  house: {
    name: 'おうち', hx: 30, hz: 22, sky: '#d5dde6', kit: ['toy', 'plantK', 'screen', 'sofaK', 'goods', 'crate', 'junk', 'laundry', 'bags', 'sculpt', 'mural', 'rug', 'cubes', 'pole', 'bigbox', 'bigbox', 'closet', 'gallery', 'tent', 'nook', 'nook', 'blocks', 'patch', 'shelfK'], pal: ['#e8dcc8', '#b98d5c', '#7d8fb3', '#8fbf7a', '#f3f1ec', '#c9573f', '#3f5f8a'], clutter: 66, spawn: [0, -11],
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
      for (const x of [-20, -10, 0, 10, 20]) for (const z of [-0.2, 0.2]) h.B(x, 0, z, 2.8, 0.12, 0.04, '#d9d2c4', NC); // はば木
      for (const p of [[-12, -1], [12, -1], [-11.2, 21], [4, 21.3], [28.8, 11], [-28.8, -1.2], [28.5, -19]]) lamp(h, p[0], p[1]);
      // リビング
      h.B(-17, 0, -12, 9, 0.04, 7, '#a8443f', { flat: true, nocol: true, pat: ['diag', '#a8443f', '#d9a441', 6, 5] });
      sofaX(h, -17, -17, 5, '#3f5f8a', -1); sofaZ(h, -23, -12, 4, '#3f5f8a', -1);
      table(h, -17, -12, 2.4, 1.2, '#6b4a2b', 0.45);
      h.B(-17, 0, -6.5, 4.4, 0.6, 0.7, '#2b2b2b', { r: 0.04, pat: ['cabinet', '#2b2b2b', '#c9ccd0', 3, 1] }); // テレビ台
      h.B(-17, 0.6, -6.5, 0.6, 0.08, 0.4, '#15171a'); h.B(-17, 0.68, -6.5, 0.1, 0.25, 0.1, '#15171a'); h.B(-17, 0.92, -6.5, 3, 1.5, 0.1, '#111418', { r: 0.03 }); h.B(-17, 0.98, -6.56, 2.85, 1.38, 0.02, '#1d3550', { nocol: true, glow: 0.25 }); // テレビ
      bookshelf(h, -29.5, -17, 0.9, 4, 2.4, '#8a5a33'); bookshelf(h, -29.5, -6, 0.9, 3, 2.4, '#7a4c2a');
      plant(h, -28.5, -21); plant(h, -1.5, -21);
      h.B(-7, 0, -20.6, 3, 1.0, 1.4, '#15171a', { r: 0.04 }); h.B(-7, 1.0, -20.95, 3, 0.4, 0.7, '#15171a', { r: 0.04 }); h.B(-7, 0.98, -20.2, 2.7, 0.04, 0.5, '#f4f4f4', { pat: ['vband', '#f4f4f4', '#15171a', 26, 1] }); chair(h, -7, -19.2, '#3a2a1c', -1); // ピアノといす
      table(h, -8, -4.5, 3.6, 1.6, '#c98f4e');
      for (const dx of [-1.2, 0, 1.2]) { chair(h, -8 + dx, -3.2, '#8a5a33', -1); chair(h, -8 + dx, -5.8, '#8a5a33', 1); }
      h.B(-11.5, 0, -16.5, 1.2, 0.8, 1.2, '#d9a441', { r: 0.2, pat: ['fabric', '#d9a441', 0, 1, 1] }); h.cyl(-26.5, 0, -2, 0.12, 1.8, '#444a50'); h.cyl(-26.5, 0, -2, 0.3, 0.04, '#444a50'); h.cone(-26.5, 1.75, -2, 0.42, 0.45, '#f5e9c0', { rt: 0.25, glow: 0.6 }); // 電気スタンド
      h.B(-27, 0, -10, 1.6, 0.5, 1.6, '#7b5ea7', { r: 0.25, pat: ['fabric', '#7b5ea7', 0, 1, 1] });
      // 絵（体の前の方を少し入れて隠れる）
      pic(h, -13, 0.15, -0.2, 0, -1, 3, 2.4); pic(h, -5, 1.3, -0.2, 0, -1, 2.2, 1.6); pic(h, -0.2, 1.0, -18, -1, 0, 2.4, 1.8); pic(h, 0.2, 0.15, -16, 1, 0, 2.6, 2.4);
      pic(h, -30, 1.0, -11.5, 1, 0, 2.6, 1.9); pic(h, -21.5, 1.0, 22, 0, -1, 2.2, 1.7); pic(h, -9.8, 0.15, 7.6, 1, 0, 2.2, 2.4); pic(h, 10.2, 0.15, 15, 1, 0, 2.6, 2.4);
      // キッチン
      h.B(17, 0, -21.4, 22, 0.95, 1.2, '#f4f4f4', { pat: ['cabinet', '#f4f4f4', '#9aa1a8', 18, 1] }); h.B(17, 0.95, -21.4, 22, 0.06, 1.25, '#3a3a3a');
      h.B(17, 1.6, -21.75, 22, 0.75, 0.5, '#f4f4f4', { pat: ['cabinet', '#f4f4f4', '#9aa1a8', 18, 1] }); // つり戸だな
      h.B(12, 1.0, -21.4, 1.0, 0.05, 0.6, '#c9ccd0', NC); h.cyl(12, 1.05, -21.9, 0.03, 0.35, '#c9ccd0', { seg: 8 }); // 流し・じゃ口
      for (const dx of [-0.35, 0.35]) h.ring(20 + dx, 1.02, -21.4, 0.18, 0.025, '#2a3038'); // コンロ
      h.B(29.3, 0, -10, 1.2, 0.95, 12, '#f4f4f4', { pat: ['cabinet', '#f4f4f4', '#9aa1a8', 10, 1] }); h.B(29.3, 0.95, -10, 1.25, 0.06, 12, '#3a3a3a');
      h.B(3.2, 0, -21.2, 1.4, 2.3, 1.4, '#c9d1d6', { r: 0.08 }); h.B(3.2, 1.5, -20.49, 1.36, 0.02, 0.02, '#9aa1a8', NC); h.B(3.75, 0.6, -20.47, 0.05, 0.6, 0.05, '#9aa1a8', NC); h.B(3.75, 1.65, -20.47, 0.05, 0.4, 0.05, '#9aa1a8', NC); // 冷蔵庫
      h.B(15, 0, -13, 6, 0.95, 2, '#4a4f57', { pat: ['cabinet', '#4a4f57', '#c9ccd0', 5, 1] }); h.B(15, 0.95, -13, 6.2, 0.06, 2.2, '#d8d2c4');
      for (const dx of [-2, -0.7, 0.7, 2]) stool(h, 15 + dx, -11.2, '#e05a5a');
      table(h, 8, -5, 2.6, 1.6, '#e8dcc8'); chair(h, 7, -3.7, '#5ae0a0', -1); chair(h, 9, -3.7, '#5ae0a0', -1); chair(h, 7, -6.3, '#5ae0a0', 1); chair(h, 9, -6.3, '#5ae0a0', 1);
      bin(h, 27, -19.5, '#55606b'); bin(h, 26, -19.6, '#3f9b6a');
      h.B(26, 0, -0.9, 5, 2.4, 0.9, '#8a6a4a', { pat: ['cabinet', '#8a6a4a', '#d9d2c4', 4, 2] }); carton(h, 21, 0, -6, 1, 1, 1, CARD[0]); carton(h, 21.2, 1, -6, 0.7, 0.7, 0.7, CARD[2]); carton(h, 22.2, 0, -5.6, 0.9, 0.8, 0.9, CARD[1]);
      // 寝室
      h.B(-21, 0, 13, 7, 0.04, 6, '#e8e1d2', { flat: true, nocol: true, pat: ['dots', '#e8e1d2', '#7d8fb3', 5, 4] });
      bed(h, -25, 18, '#5b76b8'); h.B(-23.2, 0, 19.3, 0.7, 0.6, 0.7, '#7a5a3a', { pat: ['cabinet', '#7a5a3a', '#d9d2c4', 1, 2] }); closet(h, -29.3, 6, [1, 0], '#5a3c28', ['#e8dcc8', '#7d8fb3', '#c9573f'], TOY); // 洋服だんす（中に入れる）
      table(h, -14, 20.6, 3, 1.2, '#d8d0c0'); chair(h, -14, 19.3, '#444444', 1); h.B(-18.5, 0, 21.2, 2.4, 1, 1, '#7a5a3a', { pat: ['cabinet', '#7a5a3a', '#d9d2c4', 2, 2] });
      plant(h, -11, 1.2); h.cyl(-28.5, 0, 12, 0.4, 0.7, '#d8c9a3', { pat: ['fabric', '#d8c9a3', 0, 2, 1] }); h.B(-13, 0, 6, 1.4, 0.45, 1.4, '#c9573f', { r: 0.2, pat: ['fabric', '#c9573f', 0, 1, 1] });
      // 子ども部屋
      h.B(0, 0, 6, 8, 0.04, 6, '#f0d040', { flat: true, nocol: true, pat: ['confetti', '#f0d040', TOY, 4, 3] });
      bed(h, -7, 18, '#e0719a'); bed(h, 7, 18, '#59b6d8');
      for (let i = 0; i < 14; i++) { const x = -4.5 + h.rnd() * 9, z = 3 + h.rnd() * 7, s = 0.6 + h.rnd() * 0.4; brick(h, x, 0, z, s, TOY[i % 6]); if (i % 4 === 0) brick(h, x, s * 0.6 + s * 0.1, z, s * 0.8, TOY[(i + 2) % 6]); }
      h.B(0, 0, 21.3, 5, 1.4, 0.9, '#f0d040', { pat: ['cabinet', '#f0d040', '#e0413a', 5, 2] }); h.ball(5.5, 0.5, 12.5, 0.5, '#e04f4f', { pat: ['hstripe', '#e04f4f', '#f4f4f4', 2, 3] }); h.ball(-3.5, 0.4, 12.2, 0.4, '#4f7fe0', { pat: ['dots', '#4f7fe0', '#f4f4f4', 3, 2] });
      pit(h, 0, 15.2, 4, 3, 0.5, 0.22, '#e0719a', { r: 0.08, pat: ['vband', '#e0719a', '#f4f4f4', 6, 1] }, 0.62, 0.44, ['dots', '#59b6d8', TOY, 5, 4]); // ボールプール
      for (let i = 0; i < 12; i++) h.ball(-1.5 + h.rnd() * 3, 0.64, 14.1 + h.rnd() * 2.2, 0.14, TOY[i % 6], NC);
      tent(h, -6.5, 11.5, true, 1, '#f08a3c', '#f4f4f4'); // 子ども用テント（入口は部屋のまん中向き）
      h.B(-9.2, 0, 4, 0.9, 1.8, 3, '#f08a3c', { pat: ['cabinet', '#f08a3c', '#f4f4f4', 1, 3] }); h.B(9.2, 0, 4, 0.9, 1.8, 3, '#4fbf6a', { pat: ['cabinet', '#4fbf6a', '#f4f4f4', 1, 3] });
      KIT.nook(h, 7.6, 9.4, TOY, ['#f4f4f4', '#2a3038'], { al: false, sd: -1, L: 3.4 }); // 子ども部屋のくぼみの壁
      // 浴室・物置
      pit(h, 27, 18, 3.2, 5, 0.75, 0.25, '#ffffff', { r: 0.12 }, 0.62, 0.36, ['wave', '#7fc4e0', '#b8e2f0', 3, 4]); // 湯ぶね（お湯に体の下の方が沈む）
      h.cyl(27, 0.75, 20.3, 0.04, 0.5, '#c9ccd0', { seg: 8 }); h.B(27, 1.2, 20.45, 0.4, 0.04, 0.1, '#c9ccd0', NC);
      h.B(12, 0, 20.8, 1, 1.1, 1, '#e9edf0', { r: 0.08 }); h.ring(12, 0.55, 20.29, 0.3, 0.04, '#9aa1a8'); h.B(13.2, 0, 20.8, 1, 1.1, 1, '#d5dbe0', { r: 0.08 }); h.B(29.4, 0, 6, 1, 2.2, 5, '#9aa1a8', { pat: ['cabinet', '#9aa1a8', '#f4f4f4', 1, 5] }); // 洗たく機
      h.lathe(15.5, 0, 20.5, [[0.001, 0], [0.3, 0], [0.45, 0.4], [0.45, 0.7], [0.001, 0.7]], '#d8c9a3', { pat: ['vband', '#d8c9a3', '#c4b48c', 6, 1] }); h.cyl(22, 0, 13, 0.4, 0.5, '#5fa8d8');
      for (let i = 0; i < 9; i++) { const x = 12.5 + (i % 3) * 1.25, z = 2 + Math.floor(i / 3) * 1.25; carton(h, x, 0, z, 1.1, 1, 1.1, CARD[i % 4]); if (i % 2) carton(h, x, 1, z, 0.9, 0.8, 0.9, CARD[(i + 1) % 4]); }
      h.B(20, 0, 5, 2.2, 0.9, 0.8, '#f4f4f4', { pat: ['cabinet', '#f4f4f4', '#9aa1a8', 2, 1] }); h.B(23, 0, 21, 4, 0.04, 1.6, '#5fa8d8', { flat: true, nocol: true });
    }
  },

  /* ---------- 公園 ---------- */
  park: {
    name: '公園', hx: 36, hz: 28, sky: '#8fc8f0', dark: 0.95, floorTex: 'grass', kit: ['bush', 'hedge', 'rock', 'rock', 'planter', 'mush', 'sculpt', 'coral', 'logs', 'parasol', 'junk', 'laundry', 'flowers', 'mural', 'arch', 'pipe', 'hlog', 'grass', 'leafpile', 'tent', 'hut', 'outcrop', 'outcrop', 'crevice', 'nook', 'blocks', 'patch', 'stairs'], pal: ['#6fae5a', '#8d8f94', '#8a5a33', '#2e6b34', '#d8c9a3'], clutter: 92, spawn: [0, -6],
    build(h) {
      h.F(0, 0, 72, 56, '#6fae5a');
      h.outer(6, '#3c6e3a');
      h.B(0, 0, 0, 72, 0.03, 3.4, '#d8c9a3', FL); h.B(0, 0, 0, 3.4, 0.03, 56, '#d8c9a3', FL);
      h.cyl(0, 0, 0, 5.2, 0.035, '#d8c9a3', FL);
      h.cyl(0, 0, 0, 3.2, 0.55, '#b9c0c7', { pat: ['brick', '#b9c0c7', '#9aa1a8', 10, 1] }); h.ring(0, 0.55, 0, 3.15, 0.08, '#d9dde0'); h.cyl(0, 0.55, 0, 2.8, 0.04, '#5fa8d8', NC); h.cyl(0, 0, 0, 0.5, 2.2, '#aab2ba'); h.cyl(0, 1.6, 0, 1.1, 0.12, '#aab2ba', { rt: 0.9 });
      // 池（まわりは角ばった石）
      h.cyl(22, 0, -15, 6.5, 0.04, '#4f95c9', FL);
      for (let i = 0; i < 9; i++) { const a = i * 0.7; stone(h, 22 + Math.cos(a) * 7, -15 + Math.sin(a) * 7, 0.6 + h.rnd() * 0.45, i % 2 ? '#8d8f94' : '#9a9ca0', 0, 0.55); }
      // 遊具：すべり台・ジャングルジム・ブランコ
      h.F(-22, 15, 18, 16, '#e2cf9c', null, 1);
      h.B(-28, 0, 10, 1.4, 2.1, 1.4, '#e04f4f', { r: 0.1 }); for (let k = 0; k < 5; k++) h.B(-28.85, k * 0.42, 10, 0.3, 0.06, 1.2, '#f4f4f4'); // 段
      h.B(-26.2, 0, 10, 2.2, 1.4, 1.1, '#f0d040', { r: 0.1 }); h.B(-24.2, 0, 10, 1.8, 0.7, 1.1, '#f0d040', { r: 0.1 }); for (const s of [-1, 1]) h.B(-25.4, 0.7, 10 + s * 0.6, 4.2, 0.2, 0.08, '#f08a3c', { r: 0.03 }); // すべり台のへり
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) h.B(-18 + i * 1.25, 0, 18 + j * 1.25, 1.1, 0.9 + ((i + j) % 3) * 0.7, 1.1, TOY[(i * 3 + j) % 6], { r: 0.08 });
      h.B(-28, 0, 20, 0.2, 2.6, 0.2, '#4f7fe0'); h.B(-23.6, 0, 20, 0.2, 2.6, 0.2, '#4f7fe0'); h.B(-25.8, 2.6, 20, 4.6, 0.2, 0.2, '#4f7fe0');
      for (const x of [-27, -24.6]) { h.B(x, 0.5, 20, 0.7, 0.08, 0.4, '#e04f4f'); for (const s of [-1, 1]) h.B(x + s * 0.32, 0.58, 20, 0.02, 2.0, 0.02, '#c9ccd0', NC); } // ブランコ（くさり）
      h.B(-21, 0, 12, 4, 0.5, 0.4, '#4fbf6a', { r: 0.1 }); h.cyl(-16, 0, 11, 1.2, 0.45, '#b06fd8'); h.B(-15, 0, 24, 3, 0.35, 3, '#8a5a33', { pat: ['grain', '#8a5a33', 0, 3, 3] });
      // 生け垣の迷路（でこぼこの葉っぱの壁。中にはもぐれない）
      for (let k = 0; k < 5; k++) h.B(-23 + (k % 2 ? 3 : -3), 0, -24 + k * 4, 16, 1.9, 0.9, '#2e6b34', { r: 0.25, pat: ['leaf', '#2e6b34', LEAF, 12, 2] });
      h.B(-33, 0, -16, 0.9, 1.9, 16, '#2e6b34', { r: 0.25, pat: ['leaf', '#2e6b34', LEAF, 12, 2] }); h.B(-13, 0, -14, 0.9, 1.9, 12, '#2e6b34', { r: 0.25, pat: ['leaf', '#2e6b34', LEAF, 9, 2] });
      // 木とやぶ
      let n = 0, guard = 0;
      while (n < 30 && guard++ < 400) {
        const x = -33 + h.rnd() * 66, z = -25 + h.rnd() * 50;
        if (Math.abs(x) < 4 || Math.abs(z) < 4 || Math.hypot(x, z) < 8) continue;
        if (x < -11 && z < -4) continue; if (x < -11 && z > 6) continue; if (Math.hypot(x - 22, z + 15) < 9) continue; if (x > 18 && z > 12) continue;
        tree(h, x, z, 0.8 + h.rnd() * 0.5); n++;
      }
      for (let i = 0; i < 16; i++) { const x = -33 + h.rnd() * 66, z = -25 + h.rnd() * 50; if (Math.abs(x) < 3 || Math.abs(z) < 3 || (x < -11 && z < -4)) continue; const s = 0.6 + h.rnd() * 0.45, c = i % 2 ? '#3b8f46' : '#2f7d3a'; h.lump(x, s * 0.75, z, s * 1.3, s, s * 1.1, c, { ...LEAFC, seed: seed8(h), bump: 0.2, freq: 3, ry: h.rnd() * 6, pat: ['leaf', c, LEAF, 2, 2] }); }
      // ベンチ・花だん
      for (const x of [-28, -18, -9, 9, 18, 28]) bench(h, x, 2.7, true, WOOD, 1);
      for (const z of [-20, -11, 11, 20]) bench(h, -2.8, z, false, WOOD, -1);
      [[8, -8, '#e0719a'], [-8, -8, '#f0d040'], [8, 8, '#e04f4f'], [-8, 8, '#b06fd8']].forEach(f => { h.B(f[0], 0, f[1], 4, 0.4, 4, '#6b4a2b', { r: 0.06, pat: ['brick', '#6b4a2b', '#5a3c24', 4, 1] }); h.B(f[0], 0.4, f[1], 3.6, 0.25, 3.6, f[2], { pat: ['confetti', f[2], ['#ffffff', '#ffd940', '#3b8f46'], 3, 3] }); });
      // 小屋とピクニック
      h.B(27, 0, 21, 7, 3.2, 6, '#9b6b43', { pat: ['vstripe', '#9b6b43', '#8a5a33', 6, 2] }); h.B(27, 3.2, 21, 7.8, 0.4, 6.8, '#5a3c28'); h.B(27, 0, 17.98, 1.2, 2.2, 0.04, '#5a3c28', NC); h.B(25, 1.2, 17.98, 1.2, 0.9, 0.04, '#9fd0e8', NC);
      for (const p of [[13, 14], [18, 20], [12, 23]]) { table(h, p[0], p[1], 2.4, 1.2, '#b08a5a'); h.B(p[0], 0, p[1] - 1.1, 2.4, 0.42, 0.4, '#b08a5a', { pat: ['grain', '#b08a5a', 0, 2, 1] }); h.B(p[0], 0, p[1] + 1.1, 2.4, 0.42, 0.4, '#b08a5a', { pat: ['grain', '#b08a5a', 0, 2, 1] }); }
      h.B(31, 0, -2, 4, 3, 4.5, '#d9d2c4', { pat: ['brick', '#d9d2c4', '#c4bcaa', 4, 3] }); vending(h, 27.6, -3, '#e04f4f', -1); vending(h, 27.6, -1.6, '#4f7fe0', -1);
      bin(h, 5, 5, '#55606b'); bin(h, -5, -5, '#55606b'); bin(h, 21, 3, '#3f9b6a');
      for (const p of [[6, -20], [-6, 20], [30, 8], [-30, 3]]) lamp(h, p[0], p[1], 3.4);
      // 岩場（地層の岩・すき間）
      const PP = ['#8d8f94', '#a39a8a', '#7a7c80', '#b5ab98'];
      KIT.outcrop(h, -17, -3, PP, []); KIT.outcrop(h, 3, -15, PP, []); KIT.crevice(h, 13, -23, PP);
    }
  },

  /* ---------- 学校 ---------- */
  school: {
    name: '学校', hx: 34, hz: 26, sky: '#d5dde6', kit: ['goods', 'crate', 'screen', 'toy', 'stool', 'plantK', 'junk', 'bags', 'sculpt', 'laundry', 'mural', 'rug', 'pole', 'bigbox', 'closet', 'gallery', 'gallery', 'nook', 'nook', 'blocks', 'patch', 'stairs', 'shelfK'], pal: ['#f2efe6', '#c9a26b', '#d7b47c', '#5f87b8', '#b85f5f', '#cfe0d3'], clutter: 66, spawn: [0, 0],
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
      // 教室 ×3：机（天板・脚・物入れ）といす
      [-23, 0, 23].forEach((cx, r) => {
        const cc = ['#4f7fe0', '#e04f4f', '#4fbf6a'][r];
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const x = cx - 6 + i * 4, z = -8 - j * 3.4;
          h.B(x, 0.68, z, 1.3, 0.06, 0.8, '#d7b47c', { r: 0.02, pat: ['grain', '#d7b47c', 0, 1, 1] }); h.B(x, 0.5, z, 1.2, 0.14, 0.7, '#8d8f94', { r: 0.01 });
          for (const sx of [-1, 1]) h.B(x + sx * 0.58, 0, z, 0.05, 0.5, 0.7, '#8d8f94', { r: 0.01 });
          chair(h, x, z + 0.85, cc, -1);
        }
        h.B(cx, 0, -23, 2.6, 0.8, 1, '#8a5a33', { r: 0.03, pat: ['cabinet', '#8a5a33', '#d9d2c4', 2, 1] }); h.B(cx, 1, -25.8, 9, 1.7, 0.15, '#2f5d46', NC); h.B(cx, 0.9, -25.6, 9, 0.08, 0.3, '#c9a26b', NC);
        for (let k = 0; k < 4; k++) h.B(cx - 3 + k * 1.6, 1.4 + (k % 2) * 0.4, -25.72, 0.8, 0.03, 0.01, '#f4f4f4', NC); // 黒板の字
        bookshelf(h, cx + 9.5, -12, 1, 6, 1.6, '#b08a5a'); h.B(cx - 9.5, 0, -22, 1, 2, 2.4, '#55606b', { pat: ['vents', '#55606b', 0, 2, 1] }); h.B(cx + 6, 0, -24, 1.2, 1.1, 1.2, '#e9edf0', { r: 0.06 });
      });
      // 廊下のロッカー（通気口・取っ手・名ふだ）
      for (let x = -32; x <= 32; x += 3.2) { if ([-23, 0, 23].some(d => Math.abs(x - d) < 3)) continue; const c = Math.round(x) % 2 ? '#5f87b8' : '#b85f5f'; h.B(x, 0, -2.5, 2.6, 1.9, 0.5, c, { r: 0.03 }); for (const s of [-1, 1]) h.B(x + s * 0.65, 0.05, -2.245, 1.25, 1.8, 0.01, c, { nocol: true, pat: ['vents', c, 0, 1, 1] }); }
      for (let x = -32; x <= 32; x += 6.4) { if ([-21, 30].some(d => Math.abs(x - d) < 3.2)) continue; bench(h, x, 2.4, true, '#8a5a33', 1); }
      plant(h, -33, 0); plant(h, 33, 0);
      for (const x of [-29, -16, -6, 6, 16, 29]) pic(h, x, 1.0, -3.2, 0, -1, 2.4, 1.7); // 教室のうしろの壁の絵
      pic(h, -8.2, 0.15, 10, -1, 0, 2.6, 2.4); pic(h, -8.2, 0.15, 14.5, -1, 0, 2.6, 2.4); // 図工室の大きな絵
      // 図工室
      for (const p of [[-27, 9], [-15, 9], [-27, 17], [-15, 17]]) { table(h, p[0], p[1], 4, 2, '#e8dcc8'); for (const dx of [-1.2, 1.2]) { stool(h, p[0] + dx, p[1] - 1.5, '#55606b'); stool(h, p[0] + dx, p[1] + 1.5, '#55606b'); } }
      h.B(-21, 0, 25.3, 14, 0.95, 1.2, '#f4f4f4', { pat: ['cabinet', '#f4f4f4', '#9aa1a8', 12, 1] }); bookshelf(h, -33.3, 14, 1, 8, 2.2, '#8a5a33');
      TOY.forEach((c, i) => h.lathe(-26 + i * 1.6, 0.95, 25.3, [[0.001, 0], [0.3, 0], [0.3, 0.42], [0.27, 0.45], [0.001, 0.45]], c, { seg: 16 }));
      h.B(-10, 0, 22, 1.4, 1.8, 0.2, '#e8dcc8'); h.B(-10, 0, 19, 1.4, 1.8, 0.2, '#e8dcc8'); h.B(-9.2, 0, 6, 1.6, 1.2, 3, '#b08a5a', { pat: ['cabinet', '#b08a5a', '#f4f4f4', 1, 2] });
      KIT.nook(h, -30.6, 22.8, ['#e04f4f', '#4f7fe0', '#f0d040'], TOY, { al: true, sd: -1, L: 4.4 }); // 図工室のくぼみの壁
      // 体育館
      h.B(13, 0, 14.5, 0.15, 0.02, 23, '#ffffff', FL); h.cyl(13, 0, 14.5, 3, 0.02, '#c98f4e', FL);
      for (const [x, s] of [[-6.6, 1], [32.6, -1]]) { h.B(x, 0, 14.5, 0.3, 3.6, 0.3, '#888e94'); h.B(x + s * 0.4, 2.7, 14.5, 0.15, 1.2, 1.8, '#ffffff'); h.ring(x + s * 0.75, 2.9, 14.5, 0.25, 0.025, '#e0413a'); }
      for (let k = 0; k < 3; k++) h.B(13, 0, 4.2 + k * 0.9, 26, 0.45 * (3 - k), 0.9, '#b08a5a', { pat: ['grain', '#b08a5a', 0, 10, 1] });
      for (let k = 0; k < 4; k++) h.B(2, k * 0.4, 23, 2.2 - k * 0.2, 0.4, 1.2, k % 2 ? '#e04f4f' : '#f4f4f4', { r: 0.03 });
      h.B(8, 0, 23.5, 3, 0.25, 2, '#3f6fc9', { r: 0.06 }); h.B(8.3, 0.25, 23.5, 3, 0.25, 2, '#3f6fc9', { r: 0.06 }); h.B(12, 0, 24, 3, 0.25, 2, '#3f9b6a', { r: 0.06 });
      h.B(30, 0, 23, 2.4, 1.2, 2.4, '#c0c6cc', { pat: ['vband', '#c0c6cc', '#a8afb6', 3, 1] }); for (let i = 0; i < 5; i++) h.ball(20 + i * 1.1, 0.35, 24.5, 0.35, i % 2 ? '#f08a3c' : '#e04f4f', { pat: ['hstripe', i % 2 ? '#f08a3c' : '#e04f4f', '#2a3038', 1, 4] });
      h.B(24, 0, 8, 1.6, 1.1, 0.5, '#f0d040', { r: 0.05 }); h.B(27, 0, 8, 1.6, 1.1, 0.5, '#f0d040', { r: 0.05 }); h.B(-2, 0, 8, 3, 1, 1.4, '#5a3c28', { r: 0.05, pat: ['cabinet', '#5a3c28', '#d9d2c4', 2, 1] });
    }
  },

  /* ---------- 倉庫 ---------- */
  warehouse: {
    name: '倉庫', hx: 36, hz: 26, sky: '#39424d', dark: 0.62, floorTex: 'concrete', kit: ['crate', 'barrel', 'tiresK', 'junk', 'bags', 'bags', 'logs', 'goods', 'screen', 'mural', 'pole', 'bigbox', 'bigbox', 'dumpster', 'pipe', 'hut', 'graffiti', 'graffiti', 'nook', 'blocks', 'stairs'], acc: ['#b8452f', '#2f6fb0', '#3f9b6a', '#d98a2b', '#e0c030', '#f4f4f4'], pal: ['#8a8d91', '#70757b', '#2f6fb0', '#d98a2b', '#b8452f', '#3d5f93'], clutter: 100, spawn: [3, 1],
    build(h) {
      h.F(0, 0, 72, 52, '#8a8d91');
      h.outer(7, '#70757b');
      h.B(0, 0, 0, 72, 0.02, 0.3, '#e0c030', FL); h.B(-4, 0, 0, 0.3, 0.02, 52, '#e0c030', FL); h.B(4, 0, 0, 0.3, 0.02, 52, '#e0c030', FL);
      // コンテナ（波板・とびらのかんぬき・角の金具）
      const box = (x, y, z, c, alongX) => {
        h.B(x, y, z, alongX ? 6 : 2.5, 2.6, alongX ? 2.5 : 6, c, { r: 0.04, pat: ['corrugate', c, 0, alongX ? 3 : 1, 1] });
        const ex = alongX ? x + 3.01 : x, ez = alongX ? z : z + 3.01;
        for (let k = 0; k < 4; k++) h.B(alongX ? ex : x - 0.9 + k * 0.6, y + 0.2, alongX ? z - 0.9 + k * 0.6 : ez, alongX ? 0.04 : 0.05, 2.2, alongX ? 0.05 : 0.04, '#c9ccd0', NC); // かんぬき
        for (const s of [-1, 1]) for (const t of [0, 1]) h.B(alongX ? x + s * 2.92 : x + s * 1.17, y + t * 2.42, alongX ? z + 1.17 : z + s * 2.92, 0.18, 0.18, 0.18, shade(c, 0.7), NC); // 角の金具
      };
      let k = 0;
      for (const x of [-30, -22.5, -15]) for (const z of [-21, -15, -9]) { box(x, 0, z, CONT[k % 7], true); if (h.rnd() < 0.45) box(x, 2.6, z, CONT[(k + 3) % 7], true); k++; }
      for (const z of [8, 15, 22]) box(-31, 0, z, CONT[k++ % 7], false);
      // ラック（柱・棚板・段ボール）
      for (const x of [9, 15, 21, 27, 33]) {
        for (const z of [-21.5, -7.5, -14.5]) h.B(x, 0, z, 1.4, 3.8, 0.2, '#3d5f93', { pat: ['vents', '#3d5f93', 0, 1, 3] });
        h.B(x, 1.3, -14.5, 1.5, 0.1, 14, '#e08a2b'); h.B(x, 2.6, -14.5, 1.5, 0.1, 14, '#e08a2b');
        for (let i = 0; i < 5; i++) { const z = -20.5 + i * 3 + h.rnd(), s = 0.8 + h.rnd() * 0.4; carton(h, x, 0, z, s, s, s, CARD[i % 4]); if (h.rnd() < 0.6) carton(h, x, 1.4, z + 1, s, s * 0.9, s, CARD[(i + 1) % 4]); if (h.rnd() < 0.4) carton(h, x, 2.7, z - 0.5, s, s * 0.8, s, CARD[(i + 2) % 4]); }
      }
      // パレット（板のすき間つき）と段ボールの山
      for (let x = -22; x <= 14; x += 5.2) for (let z = 6; z <= 22; z += 5.4) {
        if (h.rnd() < 0.2) continue;
        pallet(h, x, z); const s = 1.2 + h.rnd() * 0.3, lv = 1 + Math.floor(h.rnd() * 2.4);
        for (let i = 0; i < lv; i++) carton(h, x, 0.15 + i * 1.0, z, s - i * 0.15, 1.0, s - i * 0.15, CARD[Math.floor(h.rnd() * 4)]);
      }
      for (const p of [[-18, 0], [18, 0], [-26, 3.5], [2, -24], [-9, -12.5], [30, 9], [0, 12], [-22, 24.5]]) lamp(h, p[0], p[1], 3.2);
      // ドラム缶・フォークリフト・柱
      for (let i = 0; i < 10; i++) drum(h, -33 + (i % 4) * 1.15, -3.5 + Math.floor(i / 4) * 1.15, ['#2f6fb0', '#d98a2b', '#b8452f'][i % 3]);
      for (const p of [[-8, -3], [18, 3]]) {
        h.B(p[0], 0.15, p[1], 1.4, 1.15, 2.4, '#e0b020', { r: 0.1 }); h.B(p[0], 1.3, p[1] + 0.3, 1.2, 0.9, 1.2, '#2a3038', { r: 0.06 }); h.B(p[0], 2.2, p[1] + 0.3, 1.3, 0.08, 1.3, '#e0b020');
        for (const s of [-1, 1]) { h.B(p[0] + s * 0.4, 0, p[1] - 1.5, 0.1, 2.6, 0.12, '#2a3038'); h.B(p[0] + s * 0.3, 0.1, p[1] - 2.2, 0.15, 0.06, 1.2, '#55606b'); h.cyl(p[0] + s * 0.6, 1.3, p[1] + 0.9, 0.04, 0.9, '#2a3038', { seg: 6 }); }
        for (const s of [-1, 1]) for (const t of [-1, 1]) h.wheel(p[0] + s * 0.62, 0.3, p[1] + t * 0.8, 0.3, 0.22, 'x');
      }
      for (const x of [-18, 0, 18]) for (const z of [-4, 4]) { h.B(x, 0, z, 0.8, 7, 0.8, '#70757b', { pat: ['hstripe', '#70757b', '#e0c030', 1, 1] }); h.B(x, 0, z, 0.9, 1.2, 0.9, '#e0c030', { pat: ['diag', '#e0c030', '#2a3038', 2, 1] }); }
      // 事務所
      wallX(h, 12, 22, 29, '#d8d2c4', 3.2); wallX(h, 12, 32, 36, '#d8d2c4', 3.2); wallZ(h, 22, 12, 26, '#d8d2c4', 3.2);
      h.F(29, 19, 14, 14, '#5b76b8', null, 1);
      table(h, 30, 22, 3, 1.4, '#c98f4e'); chair(h, 30, 20.6, '#2a3038', 1); h.B(35.2, 0, 18, 1, 2, 4, '#8d8f94', { pat: ['cabinet', '#8d8f94', '#2a3038', 1, 4] }); h.B(23.2, 0, 23, 1, 1.2, 3, '#9aa1a8', { pat: ['cabinet', '#9aa1a8', '#2a3038', 1, 3] }); plant(h, 34.5, 13.5);
      // トラック（荷台・運転席・窓・車輪）
      h.B(28, 0.5, 4, 8, 2.8, 2.6, '#e9edf0', { r: 0.06, pat: ['corrugate', '#e9edf0', 0, 4, 1] }); h.B(33.2, 0.5, 4, 2.2, 2, 2.4, '#b8452f', { r: 0.2 }); h.B(34.31, 1.6, 4, 0.04, 0.7, 1.9, '#1e2a36', { nocol: true, rough: 0.12 }); h.B(34.4, 0.5, 4, 0.2, 0.4, 2.4, '#2a3038', { r: 0.06 });
      for (const dx of [-3, 0, 4.6]) for (const dz of [-1.2, 1.2]) h.wheel(28 + dx, 0.45, 4 + dz, 0.45, 0.3, 'z');
      h.B(-12, 0, 2, 2.4, 1.2, 1.4, '#3f9b6a', { pat: ['corrugate', '#3f9b6a', 0, 1, 1] }); h.B(8, 0, 24.8, 5, 1, 1, '#55606b', { pat: ['cabinet', '#55606b', '#c9ccd0', 4, 1] });
    }
  },

  /* ---------- 夜の商店街（模様の外壁・日よけ・ベランダ・看板・屋上・中庭の街） ---------- */
  town: {
    name: '夜の商店街', hx: 36, hz: 28, sky: '#0b1024', night: true, dark: 0.5, floorTex: 'asphalt', kit: ['crate', 'barrel', 'planter', 'vend', 'junk', 'bags', 'sculpt', 'parasol', 'goods', 'laundry', 'hedge', 'mural', 'pole', 'booth', 'dumpster', 'gallery', 'hut', 'bigbox', 'graffiti', 'nook', 'blocks'], pal: ['#b9b7b0', '#4a4d52', '#d9b08c', '#c97b63', '#9fb7c4', '#8a5a33'], clutter: 40, spawn: [12, 0],
    build(h) {
      h.F(0, 0, 72, 56, '#4a4d52');
      h.outer(9, '#8d8f94');
      city(h, { pal: ['#d9b08c', '#c97b63', '#e8dcc8', '#9fb7c4', '#b5c99a', '#d8a7b1', '#c9c2b0', '#a7b8d8', '#e0c48c', '#b89c84'], acc: ['#e04f4f', '#3f9b6a', '#2f6fb0', '#f08a3c', '#b06fd8', '#f0d040'], night: true, neon: false, facade: ['brick', 'vband', 'hstripe', 'check2', 'dots', 'wave', 'diag', 'bigcamo'], hmin: 5, hmax: 9 });
      h.ball(-60, 50, -70, 5, '#fff6d8', { glow: 1.6, nolight: true });
    }
  },
  /* ---------- ガソリンスタンド（まんたんステーションより） ---------- */
  station: {
    name: 'ガソリンスタンド', hx: 34, hz: 26, sky: '#a9d4ee', floorTex: 'asphalt', kit: ['crate', 'barrel', 'tiresK', 'junk', 'bags', 'pylonK', 'vend', 'sculpt', 'parasol', 'goods', 'screen', 'mural', 'dumpster', 'booth', 'bigbox', 'hut', 'pipe', 'graffiti', 'graffiti', 'nook', 'blocks', 'patch'], pal: ['#5a5d62', '#e0413a', '#f4f4f4', '#eee9df', '#b9c0c7', '#2f6fb0'], clutter: 84, spawn: [0, 13],
    build(h) {
      h.F(0, 0, 68, 52, '#5a5d62'); h.outer(7, '#b9c0c7');
      h.F(0, 21, 68, 10, '#44474c', ['img:road', '#44474c', 0.2, 8, 1.2], 1);
      h.B(0, 0, 15.4, 68, 0.15, 1.2, '#b9b7b0', { flat: true, pat: ['check2', '#b9b7b0', '#aaa8a1', 34, 1] });
      // コンビニ
      const W = '#eee9df';
      h.F(0, -17, 28, 18, '#e9e7df', ['img:tile', '#ffffff', 0.05, 7, 4.5], 1);
      wallZ(h, -14, -26, -8, W); wallZ(h, 14, -26, -8, W); wallX(h, -8, -14, -2, W); wallX(h, -8, 2, 14, W); wallX(h, -19, -14, 9, W);
      h.B(0, 3.5, -7.6, 12, 0.9, 0.3, '#e0413a', { glow: 0.7 }); h.B(0, 3.5, -7.4, 5, 0.5, 0.1, '#ffffff', { nocol: true, glow: 1 });
      [-9, -4.5, 4.5, 9].forEach((x, i) => { for (const z of [-11.5, -15]) { h.B(x, 0, z, 3.4, 1.5, 0.8, '#d9d2c4', { r: 0.03 }); h.B(x, 1.5, z, 3.2, 0.25, 0.6, TOY[(i + (z < -12 ? 3 : 0)) % 6], { pat: ['vend', '#f4f4f4', TOY, 3, 1] }); for (const s of [-1, 1]) h.B(x, 0.1, z + s * 0.41, 3.3, 1.3, 0.01, '#f4f4f4', { nocol: true, pat: ['books', '#d9d2c4', TOY, 3, 1] }); } });
      h.B(0, 0, -13.2, 2.4, 1.1, 1.2, '#f4f4f4', { r: 0.04 }); for (let i = 0; i < 3; i++) h.ball(-0.7 + i * 0.7, 1.3, -13.2, 0.25, TOY[i]);
      h.B(-9.5, 0, -9.3, 5, 1, 1, '#3f5f8a', { r: 0.04 }); h.B(-10.5, 1, -9.3, 0.5, 0.35, 0.5, '#22262b', { r: 0.04 }); h.B(-8.5, 1, -9.3, 0.5, 0.35, 0.5, '#22262b', { r: 0.04 }); // レジ
      h.B(-13.3, 0, -14.5, 0.9, 2.2, 7, '#cfe6f0', { glow: 0.25, pat: ['vend', '#cfe6f0', TOY, 5, 2] }); h.B(12.9, 0, -10.5, 1.2, 1.4, 3, '#3a3a3a', { r: 0.04 }); h.cyl(12.9, 1.4, -10, 0.2, 0.4, '#e0413a');
      for (let i = 0; i < 10; i++) { const x = -12 + (i % 5) * 2.1, z = -21.5 - Math.floor(i / 5) * 2.2; carton(h, x, 0, z, 1, 0.9, 1, CARD[i % 4]); if (i % 3 === 0) carton(h, x, 0.9, z, 0.85, 0.8, 0.85, CARD[(i + 1) % 4]); }
      h.B(3, 0, -25.3, 7, 2.2, 0.9, '#55606b', { pat: ['cabinet', '#55606b', '#c9ccd0', 6, 2] }); table(h, 11.5, -24, 2.4, 1.2, '#c98f4e'); h.B(11.5, 0.76, -24.2, 0.9, 0.6, 0.12, '#15171a'); chair(h, 11.5, -22.7, '#2a3038', -1);
      // キャノピーと給油機
      for (const x of [-12.5, 12.5]) for (const z of [0.5, 9.5]) h.cyl(x, 0, z, 0.32, 5.2, '#e9edf0');
      h.B(0, 5.2, 5, 28, 0.7, 12, '#f4f4f4', { r: 0.3 }); h.B(0, 5.25, 5, 28.3, 0.3, 12.3, '#e0413a');
      for (const x of [-8, 0, 8]) { pump(h, x, 5); h.B(x, 5.1, 5, 3.4, 0.08, 1.4, '#fff4c2', { nocol: true, glow: 1.6 }); }
      car(h, -4, 5, '#2f6fb0', false); car(h, 4, 3.5, '#f0d040', false); car(h, -26, -15, '#b8262b', false); car(h, -22.5, -15, '#e9edf0', false);
      // 店の前
      vending(h, 5, -7.2, '#e0413a', 1); vending(h, 6.2, -7.2, '#2f6fb0', 1); vending(h, 7.4, -7.2, '#f4f4f4', 1);
      h.B(10.5, 0, -7.1, 2.2, 1, 1, '#cfe6f0', { r: 0.06, pat: ['vend', '#cfe6f0', TOY, 2, 1] }); bench(h, -6, -7.0, true, WOOD, 1); bin(h, -8.5, -7.2, '#55606b'); bin(h, -9.4, -7.2, '#3f9b6a');
      h.B(-3.2, 0, -6, 0.9, 1.2, 0.3, '#f0d040', { pat: ['diag', '#f0d040', '#2a3038', 1, 1] }); h.cyl(-14.7, 0, -12, 0.09, 1.1, '#8d8f94'); h.B(-14.35, 1.4, -12, 0.1, 0.6, 0.6, '#2f6fb0');
      h.cyl(-15.6, 0, -11.2, 0.2, 0.32, '#7f8a94'); h.cyl(-16.2, 0, -12, 0.2, 0.32, '#7f8a94'); h.cyl(-15.4, 0, -13, 0.03, 1.4, '#c99a5b');
      // 看板・洗車機・タイヤ
      h.cyl(-28, 0, 12, 0.3, 7, '#8d8f94'); h.B(-28, 5, 12, 4.2, 2.6, 0.5, '#e0413a', { glow: 0.5, r: 0.2 }); h.B(-28, 3.3, 12, 3.6, 1.3, 0.45, '#f4f4f4', { r: 0.06 });
      for (let i = 0; i < 3; i++) h.B(-29.2 + i * 1.2, 3.5, 11.76, 0.9, 0.9, 0.02, '#2a3038', NC); // ねだんの数字
      h.B(20, 0, 2, 1, 1.6, 1, '#f08a3c', { r: 0.06 }); tires(h, 22, 6); tires(h, 23.1, 6.6, 4); tires(h, 21.6, 7.3, 2); tires(h, -18, 9, 3);
      h.B(27.5, 0, 2, 0.5, 3.4, 10, '#3f9b6a', { pat: ['vband', '#3f9b6a', '#f4f4f4', 6, 1] }); h.B(33.2, 0, 2, 0.5, 3.4, 10, '#3f9b6a', { pat: ['vband', '#3f9b6a', '#f4f4f4', 6, 1] }); h.B(30.35, 3.4, 2, 6.2, 0.4, 10, '#3f9b6a');
      for (const [x, z, c] of [[28.6, 0, '#4f7fe0'], [32.1, 0, '#4f7fe0'], [28.6, 4, '#e04f4f'], [32.1, 4, '#e04f4f']]) h.cyl(x, 0, z, 0.55, 3, c, { pat: ['camo', c, ['#f4f4f4', shade(c, 0.8)], 3, 4] }); // 洗車のブラシ
      h.B(24, 0.5, -19, 3, 2.8, 8, '#e9edf0', { r: 0.25, pat: ['corrugate', '#e9edf0', 0, 1, 4] }); h.B(24, 0.5, -13.8, 2.7, 2, 2.2, '#2f6fb0', { r: 0.3 }); h.B(24, 1.6, -12.69, 2.2, 0.7, 0.04, '#1e2a36', { nocol: true, rough: 0.12 });
      for (const dz of [-22, -16.5, -13.6]) for (const dx of [-1.4, 1.4]) h.wheel(24 + dx, 0.5, dz, 0.5, 0.35, 'x');
      h.B(-30, 0, -23, 3, 1.5, 1.8, '#2f6f5a', { r: 0.06, pat: ['corrugate', '#2f6f5a', 0, 2, 1] }); pallet(h, 19, -24.5); carton(h, 19, 0.15, -24.5, 1.4, 1.1, 1.4, CARD[1]);
      tree(h, -31, 3); tree(h, -31, -5, 1.2); tree(h, 31, -23); tree(h, 17, -23, 0.9); tree(h, -19, -23, 1.1);
      lamp(h, -20, 14.7, 4.2); lamp(h, 20, 14.7, 4.2); lamp(h, -31, -11, 3.6); lamp(h, 16.5, -9, 3.2);
      car(h, -18, 20, '#3f9b6a', true); car(h, 14, 23, '#7b5ea7', true);
      for (let x = -32; x <= 32; x += 4) h.B(x, 0.02, 21, 2, 0.02, 0.25, '#ffffff', FL);
      for (let i = 0; i < 5; i++) pylon(h, 15 + i * 1.2, 11);
    }
  },

  /* ---------- サーキット（レースマスター「マスター・サーキット」より） ---------- */
  circuit: {
    name: 'サーキット', hx: 38, hz: 28, sky: '#a8d6f5', floorTex: 'grass', kit: ['tiresK', 'pylonK', 'bush', 'hedge', 'rock', 'junk', 'sculpt', 'coral', 'logs', 'parasol', 'flowers', 'mush', 'mural', 'arch', 'tent', 'tent', 'pipe', 'grass', 'leafpile', 'hut', 'hlog', 'outcrop', 'crevice', 'blocks', 'blocks', 'nook', 'patch'], pal: ['#5fa84f', '#45474e', '#e0413a', '#ffffff', '#b8bcc6', '#8d8f94'], clutter: 84, spawn: [0, 0],
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
      h.B(-3, 5, -15, 1, 1.2, 11.6, 0, { pat: ['checker', '#ffffff', '#15171a', 1, 6] });
      h.B(-3, 0.035, -15, 1.2, 0.02, 9, 0, { nocol: true, flat: true, pat: ['checker', '#ffffff', '#15171a', 1, 5] });
      for (let i = 0; i < 5; i++) h.ball(-3.55, 5.6, -17 + i, 0.15, '#e0413a', { glow: 1.2 }); // スタートの信号
      // 観客席（段・観客・手すり）
      for (const cx of [-13, 13]) {
        for (let r = 0; r < 4; r++) {
          h.B(cx, 0, -22.5 - r * 1.3, 20, 0.7 + r * 0.7, 1.3, '#b8bcc6', { pat: ['vband', '#b8bcc6', '#a8acb6', 10, 1] });
          for (let k = 0; k < 9; k++) { const c = TOY[(k + r * 2) % 6]; h.ball(cx - 8.5 + k * 2.1 + (r % 2), 0.7 + r * 0.7 + 0.35, -22.5 - r * 1.3, 0.32, c); h.ball(cx - 8.5 + k * 2.1 + (r % 2), 0.7 + r * 0.7 + 0.85, -22.5 - r * 1.3, 0.2, '#f3d2b0'); }
        }
        h.B(cx, 0.7, -21.8, 20, 0.5, 0.06, '#e9edf0', NC);
      }
      // 湖と丘
      h.cyl(8, 0.05, 1, 6.5, 0.03, '#4f95c9', FL); h.cyl(13, 0.05, -1, 4, 0.03, '#4f95c9', FL);
      h.dome(-10, 0, 1, 6.5, 3.4, 5, '#4f9a45'); h.dome(-17, 0, -2, 4, 2.4, 3.6, '#58a84c'); h.dome(22, 0, 0, 5, 3, 5, '#4f9a45'); h.dome(-22, 0, 1, 4.5, 2.6, 4.5, '#58a84c');
      for (let i = 0; i < 7; i++) { const a = i * 0.9; stone(h, 8 + Math.cos(a) * 7.4, 1 + Math.sin(a) * 7, 0.55 + h.rnd() * 0.4, i % 2 ? '#8d8f94' : '#9a9ca0', 0, 0.55); }
      // タイヤバリア・パイロン・カート
      for (const sx of [-1, 1]) for (let i = -4; i <= 4; i++) { const a = i * 0.32; tires(h, sx * (22 + Math.cos(a) * 15.2), Math.sin(a) * 15.2, 2 + (Math.abs(i) % 2)); }
      for (let i = 0; i < 8; i++) { pylon(h, -18 + i * 1.5, 10.9); pylon(h, 6 + i * 1.5, 19.2); }
      kart(h, 2, -13, '#e04f4f'); kart(h, 4.5, -16.5, '#4f7fe0'); kart(h, 7, -13, '#f0d040'); kart(h, 9.5, -16.5, '#4fbf6a'); kart(h, -24, 14, '#b06fd8'); kart(h, 16, 16, '#f08a3c');
      // ピット
      h.B(0, 0, 26.9, 30, 3.6, 0.4, '#d9d2c4', { pat: ['vstripe', '#d9d2c4', '#c9c2b4', 10, 1] }); h.B(0, 3.2, 24.6, 30.4, 0.4, 5, '#b8bcc6'); for (let i = 0; i <= 5; i++) h.B(-15 + i * 6, 0, 24.6, 0.4, 3.2, 4.6, '#d9d2c4');
      for (let i = 0; i < 5; i++) { h.B(-12 + i * 6, 0, 26.2, 3.6, 1, 0.8, ['#b8452f', '#2f6fb0'][i % 2], { r: 0.08, pat: ['cabinet', ['#b8452f', '#2f6fb0'][i % 2], '#c9ccd0', 3, 1] }); tires(h, -13.6 + i * 6, 24.4, 2 + i % 3); if (i % 2) kart(h, -11.4 + i * 6, 24.2, TOY[i]); h.B(-12 + i * 6, 2.9, 22.2, 4.4, 0.5, 0.2, TOY[i], { glow: 0.5 }); }
      for (let i = 0; i < 6; i++) { drum(h, -17 + i * 0.95, 21, ['#b8452f', '#2f6fb0'][i % 2]); woodcrate(h, 15 + (i % 3) * 1.3, Math.floor(i / 3) * 0.9, 21, 0.9, '#b8452f'); }
      tires(h, -20.5, 22.5, 4); tires(h, -21.7, 23, 3); tires(h, 21, 23, 4); h.B(20, 0, 20.5, 2.2, 0.9, 1, '#55606b', { pat: ['cabinet', '#55606b', '#c9ccd0', 2, 1] });
      // 表彰台・アイテムボックス・ジャンプ台
      h.B(27, 0, 22, 1.6, 1.2, 1.6, '#f0d040', { r: 0.04 }); h.B(25.4, 0, 22, 1.6, 0.8, 1.6, '#c0c6cc', { r: 0.04 }); h.B(28.6, 0, 22, 1.6, 0.5, 1.6, '#c98f4e', { r: 0.04 });
      for (let i = 0; i < 4; i++) { h.B(-9 + i * 2.2, 0.5, 15, 1, 1, 1, TOY[i + 1], { glow: 0.9, r: 0.2, pat: ['dots', TOY[i + 1], '#ffffff', 1, 1] }); h.B(-34, 0.5, -6 + i * 4, 1, 1, 1, TOY[i], { glow: 0.9, r: 0.2, pat: ['dots', TOY[i], '#ffffff', 1, 1] }); }
      for (let k = 0; k < 3; k++) h.B(12 + k * 1.5, 0, -15, 1.5, 0.3 + k * 0.3, 7, '#f08a3c', { pat: ['diag', '#f08a3c', '#f4f4f4', 1, 3] });
      h.B(-12, 0.035, -15, 3, 0.02, 3, '#ffd23a', { nocol: true, flat: true, glow: 1.2 }); h.B(30, 0.035, 9, 3, 0.02, 3, '#ffd23a', { nocol: true, flat: true, glow: 1.2 });
      // 木・旗・雲・太陽
      for (const p of [[-34, -24], [-30, -25], [34, -24], [35, 22], [-35, 23], [-30, 25], [0, 5], [3, -5], [-3, -4], [31, 25], [-36, 10], [36, -10]]) tree(h, p[0], p[1], 0.8 + h.rnd() * 0.5);
      for (const x of [-22, -8, 8, 22]) { h.cyl(x, 0, -27, 0.07, 6, '#e9edf0'); h.B(x + 0.7, 5, -27, 1.4, 0.9, 0.06, TOY[(x + 22) / 2 % 6 | 0], { pat: ['check2', TOY[(x + 22) / 2 % 6 | 0], '#f4f4f4', 2, 1] }); }
      for (let k = 0; k < 9; k++) h.dome(-50 + k * 13 + h.rnd() * 6, 30 + h.rnd() * 8, -30 + h.rnd() * 60, 7 + h.rnd() * 5, 2 + h.rnd(), 4 + h.rnd() * 3, '#ffffff', { nocol: true, sky: true });
      h.ball(60, 55, 40, 6, '#fff4c2', { glow: 2, nolight: true });
      const CP = ['#8d8f94', '#a39a8a', '#b8bcc6', '#7a7c80'];
      KIT.outcrop(h, -33, 17, CP, []); KIT.outcrop(h, 31, -3, CP, []); KIT.crevice(h, -25, -9, CP);
    }
  },

  /* ---------- 古代の砂漠（レースマスター「古代の砂漠」より） ---------- */
  desert: {
    name: '古代の砂漠', hx: 38, hz: 28, sky: '#f2cc8f', kit: ['rock', 'rock', 'pot', 'pillar', 'bags', 'coral', 'sculpt', 'junk', 'logs', 'mural', 'tent', 'tent', 'hut', 'pipe', 'outcrop', 'outcrop', 'outcrop', 'crevice', 'crevice', 'nook', 'nook', 'blocks', 'stairs'], acc: ['#b8452f', '#2f6fb0', '#f0d040', '#efe2c4', '#8a5a33', '#3fa0c9'], pal: ['#d6ab66', '#c9a36a', '#b8905a', '#ddb672', '#c98a5a', '#e0c08c'], clutter: 96, spawn: [0, 4],
    build(h) {
      const S = '#d6ab66', ST = '#c9a36a', ST2 = '#b8905a';
      h.F(0, 0, 76, 56, S); h.outer(7, '#c49a5e');
      // ピラミッド
      h.cone(-24, 0, -16, 11, 11, ST, { seg: 4, cw: 0.62, pat: ['brick', ST, ST2, 6, 6] }); h.cone(22, 0, -18, 8.5, 8.5, ST2, { seg: 4, cw: 0.62, pat: ['brick', ST2, ST, 5, 5] }); h.cone(28, 0, 14, 6, 6, ST, { seg: 4, cw: 0.62, pat: ['brick', ST, ST2, 4, 4] });
      for (let k = 0; k < 5; k++) h.B(-22, k * 1.0, 16, 12 - k * 2.2, 1.0, 12 - k * 2.2, k % 2 ? ST : ST2, { r: 0.12, pat: ['brick', k % 2 ? ST : ST2, shade(ST, 0.85), Math.max(1, 6 - k), 1], sink: true });
      h.B(-22, 5, 16, 1.4, 1.6, 1.4, '#f0d040', { glow: 0.5, r: 0.3 });
      // 神殿の柱と石（みぞのある柱・こわれた柱）
      for (let i = 0; i < 6; i++) { const x = -6 + (i % 3) * 6, z = -20 + Math.floor(i / 3) * 6; h.B(x, 0, z, 1.6, 0.4, 1.6, ST2, { r: 0.04 }); h.cyl(x, 0.4, z, 0.55, i === 4 ? 2 : 4.2, ST, { rt: 0.48, seg: 16, pat: ['vband', ST, shade(ST, 0.86), 4, 1] }); if (i !== 4) h.B(x, 4.6, z, 1.5, 0.35, 1.5, ST2, { r: 0.04 }); }
      h.B(0, 4.95, -20, 14.5, 0.6, 1.6, ST2, { r: 0.04, pat: ['zigzag', ST2, ST, 8, 1] }); h.cyl(3, 0.45, -12.5, 0.45, 3.6, ST, { rot: [Math.PI / 2, 0, 0], seg: 16, pat: ['vband', ST, shade(ST, 0.86), 4, 1] }); // 倒れた柱
      for (let i = 0; i < 16; i++) { const x = -34 + h.rnd() * 68, z = -24 + h.rnd() * 48, s = 0.5 + h.rnd() * 0.8, c = pick(h, [ST, ST2, '#c98a5a']); if (Math.hypot(x, z - 4) < 5) continue; stone(h, x, z, s, c); }
      // スフィンクス風の像・オベリスク
      h.B(10, 0, 3, 2.4, 1.2, 5.5, ST, { r: 0.4, pat: ['brick', ST, ST2, 2, 1] }); h.B(10, 1.2, 5, 1.6, 1.6, 1.6, ST, { r: 0.5 }); h.ball(10, 3.2, 5.2, 0.85, ST2); h.B(9.2, 0, 6.2, 0.7, 0.6, 2.4, ST2, { r: 0.25 }); h.B(10.8, 0, 6.2, 0.7, 0.6, 2.4, ST2, { r: 0.25 });
      h.B(10, 2.2, 5.85, 1.2, 0.9, 0.02, '#2f6fb0', { nocol: true, pat: ['hstripe', '#2f6fb0', '#f0d040', 1, 4] }); // 頭かざり
      for (const p of [[-10, 2], [-4, 12], [16, -6]]) { h.B(p[0], 0, p[1], 1.5, 0.5, 1.5, ST2, { r: 0.04 }); h.B(p[0], 0.5, p[1], 0.9, 5, 0.9, ST, { r: 0.1, pat: ['zigzag', ST, ST2, 1, 5], sink: true }); h.cone(p[0], 5.5, p[1], 0.65, 1, '#f0d040', { seg: 4 }); }
      // オアシス
      h.cyl(-4, 0.03, 20, 6, 0.03, '#3fa0c9', FL); h.cyl(-4, 0.02, 20, 7.5, 0.02, '#7fb86a', FL);
      for (const p of [[-11, 18], [-9, 24], [2, 25], [4, 17], [-2, 13.5]]) palm(h, p[0], p[1], 0.9 + h.rnd() * 0.4);
      for (let i = 0; i < 8; i++) { const a = i * 0.8; h.cyl(-4 + Math.cos(a) * 6.6, 0, 20 + Math.sin(a) * 6.3, 0.07, 1 + h.rnd(), '#5f9a45'); }
      // テントと市場
      for (const [x, z, c] of [[14, 20, '#b8452f'], [20, 23, '#2f6fb0'], [8, 12, '#e8dcc8']]) {
        h.cone(x, 0, z, 2.6, 3, c, { seg: 4, cw: 0.5, pat: ['vband', c, '#efe2c4', 4, 1] }); woodcrate(h, x + 2.6, 0, z - 1.5, 1, '#b08a5a');
        KIT.pot(h, x - 2.6, z - 1.8);
      }
      h.B(16, 0, 16, 4, 0.04, 2.6, '#a8443f', { flat: true, nocol: true, pat: ['zigzag', '#a8443f', '#f0d040', 3, 2] }); table(h, 16, 16, 3, 1.2, '#8a5a33', 0.7); for (let i = 0; i < 4; i++) h.ball(15 + i * 0.7, 0.95, 16, 0.24, TOY[i]);
      // 砂丘・サボテン
      h.dome(30, 0, -4, 7, 2.6, 5, '#ddb672'); h.dome(-32, 0, 2, 5, 2.2, 7, '#ddb672'); h.dome(4, 0, -6, 4.5, 1.8, 3.4, '#ddb672'); h.dome(-12, 0, -6, 4, 1.7, 3, '#d9b06c');
      for (const p of [[-16, 6], [20, 6], [33, -22], [-34, -8], [12, -12], [-30, 24], [34, 2]]) { // サボテン（うでにも当たる）
        const c = '#3f8f4a', pt = ['vband', c, shade(c, 0.85), 6, 1];
        h.cap(p[0], 0, p[1], 0.3, 2.0, c, { pat: pt });
        for (const s of [-1, 1]) if (h.rnd() < 0.75) { const y0 = 0.8 + h.rnd() * 0.6; h.capc(p[0] + s * 0.42, y0, p[1], 0.15, 0.45, s, 0.15, 0, c, { pat: pt }); h.cap(p[0] + s * 0.66, y0, p[1], 0.15, 0.7 + h.rnd() * 0.4, c, { pat: pt }); }
      }
      for (const p of [[-14, -22], [14, -24], [-34, 20], [34, 24]]) lamp(h, p[0], p[1], 2.2);
      // 地層の岩・岩のすき間（ひさしの下・すき間に入って、岩の帯と同じ色に塗る）
      const DP = ['#d6ab66', '#c98a5a', '#e0c08c', '#b8905a', '#a8693f'];
      KIT.outcrop(h, -23, 1, DP, []); KIT.outcrop(h, 15, -1, DP, []); KIT.outcrop(h, 33, -17, DP, []); KIT.crevice(h, -11, -17, DP);
      h.ball(-70, 45, -50, 7, '#fff0c0', { glow: 2, nolight: true });
    }
  },

  /* ---------- ネオン街（光る模様のビルの街） ---------- */
  neon: {
    name: 'ネオン街', hx: 36, hz: 28, sky: '#16052a', night: true, dark: 0.42, kit: ['neonBox', 'junk', 'sculpt', 'sculpt', 'bags', 'coral', 'goods', 'screen', 'mural', 'pole', 'booth', 'booth', 'dumpster', 'gallery', 'hut', 'graffiti', 'graffiti', 'nook', 'blocks'], pal: ['#1c1c2e', '#1a1430', '#221436', '#2a2440', '#3a3550'], acc: ['#ff3ab8', '#33eaff', '#ffd940', '#8a5cff', '#3dff9a'], clutter: 40, spawn: [12, 0],
    build(h) {
      const NE = ['#ff3ab8', '#33eaff', '#ffd940', '#8a5cff', '#3dff9a'];
      h.F(0, 0, 72, 56, '#1c1c2e'); h.outer(12, '#14101f');
      for (let x = -34; x <= 34; x += 4) if (Math.abs(x) > 6) h.B(x, 0.02, 1.9, 2, 0.02, 0.2, NE[1], { nocol: true, flat: true, glow: 1.2 });
      city(h, { pal: ['#1a1430', '#141a36', '#221436', '#2a1d40', '#1c2440'], acc: NE, night: true, neon: true, facade: ['hstripe', 'vband', 'check2', 'zigzag', 'diag', 'dots', 'wave', 'bigcamo'], hmin: 7, hmax: 13 });
      h.ball(-60, 60, 70, 9, '#ffe6f6', { glow: 1.6, nolight: true });
    }
  },

  /* ---------- 火山（レースマスター「火山コア」より） ---------- */
  volcano: {
    name: '火山', hx: 36, hz: 28, sky: '#2a0a06', night: true, dark: 0.5, kit: ['rock', 'rock', 'crystal', 'coral', 'junk', 'bags', 'sculpt', 'barrel', 'mural', 'hlog', 'pipe', 'hut', 'outcrop', 'outcrop', 'outcrop', 'crevice', 'crevice', 'nook', 'blocks'], acc: ['#ff6a14', '#ffa028', '#5a3a8a', '#7b4fb8', '#1c1513', '#ffb46b'], pal: ['#2b2422', '#3a302c', '#332a27', '#40342f', '#5a3a2a', '#6b4a3a'], clutter: 104, spawn: [0, 2],
    build(h) {
      const RK = '#2b2422', RK2 = '#3a302c', LV = '#ff6a14';
      h.F(0, 0, 72, 56, RK); h.outer(9, '#1f1917');
      // 溶岩の川（光る床）と橋
      h.B(0, 0, -9, 72, 0.02, 3, LV, { nocol: true, flat: true, glow: 1.6, pat: ['wave', LV, '#ffa028', 24, 1] }); h.B(-14, 0, 8, 3, 0.02, 40, LV, { nocol: true, flat: true, glow: 1.6, pat: ['wave', LV, '#ffa028', 1, 13] }); h.B(18, 0, 14, 36, 0.02, 2.4, LV, { nocol: true, flat: true, glow: 1.6, pat: ['wave', LV, '#ffa028', 12, 1] });
      h.cyl(22, 0.01, -18, 5, 0.02, LV, { nocol: true, flat: true, glow: 1.6 }); h.cyl(-26, 0.01, 18, 4, 0.02, '#ffa028', { nocol: true, flat: true, glow: 1.6 });
      for (const p of [[-24, -9, 0], [4, -9, 0], [26, -9, 0], [-14, 2, 1], [-14, 20, 1], [10, 14, 0], [28, 14, 0]]) { h.B(p[0], 0.02, p[1], p[2] ? 4.4 : 2.6, 0.14, p[2] ? 2.6 : 4.4, '#6b4a2b', { flat: true, pat: ['vstripe', '#6b4a2b', '#5a3c24', p[2] ? 6 : 4, 1] }); }
      // 火山
      for (const [x, z, r] of [[-25, -19, 8], [28, 22, 6], [30, -3, 5]]) { h.cone(x, 0, z, r, r * 1.05, RK2, { seg: 9, cw: 0.6, rt: r * 0.22, pat: ['rockface', RK2, [RK, '#4a3a34'], 3, 2] }); h.cyl(x, r * 1.05 - 0.05, z, r * 0.2, 0.12, LV, { nocol: true, glow: 2.4 }); h.ball(x, r * 1.05 + 0.6, z, 0.5, '#ffb46b', { glow: 1 }); }
      // 柱状の岩（六角）・岩
      for (const [cx, cz] of [[6, -20], [-6, 12], [20, 4], [-30, 2], [8, 23]]) for (let i = 0; i < 7; i++) { const a = i * 0.9, d = i ? 1.1 : 0; h.cyl(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d, 0.62, 1 + h.rnd() * 3.2, i % 2 ? RK2 : '#332a27', { seg: 6, pat: ['strata', i % 2 ? RK2 : '#332a27', ['#2b2422', '#4a3a34'], 1, 2] }); }
      for (let i = 0; i < 22; i++) { const x = -33 + h.rnd() * 66, z = -25 + h.rnd() * 50, s = 0.5 + h.rnd() * 0.9, c = pick(h, [RK2, '#40342f', '#5a3a2a']); if (Math.hypot(x, z - 2) < 4) continue; stone(h, x, z, s, c); }
      // 黒曜石の結晶・間欠泉・枯れ木
      for (const p of [[-4, -16], [14, -4], [-22, 10], [2, 18], [32, 10], [-33, -8]]) KIT.crystal(h, p[0], p[1]);
      for (const p of [[10, -14], [-20, -2], [16, 22]]) { h.cyl(p[0], 0, p[1], 0.9, 0.35, RK2, { pat: ['rockface', RK2, [RK, '#4a3a34'], 1, 1] }); h.cyl(p[0], 0.35, p[1], 0.45, 0.06, '#ffa028', { nocol: true, glow: 2 }); h.ball(p[0], 1, p[1], 0.3, '#ffb46b', { glow: 1 }); }
      for (const p of [[-8, 4], [24, -12], [-30, 24], [34, 18], [0, -24]]) { h.cyl(p[0], 0, p[1], 0.2, 3, '#1c1513', { rt: 0.1 }); h.capc(p[0] + 0.45, 1.9, p[1], 0.07, 1.0, 0.8, 0.6, 0, '#1c1513'); h.capc(p[0] - 0.35, 2.4, p[1] + 0.2, 0.05, 0.8, -0.7, 0.6, 0.3, '#1c1513'); }
      // 採掘キャンプ（トロッコ・線路・木箱・ドラム缶・テント）
      for (let i = 0; i < 3; i++) { h.B(4 + i * 2.4, 0.25, 6, 1.6, 0.9, 1.1, '#55606b', { r: 0.15, pat: ['corrugate', '#55606b', 0, 2, 1] }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) h.wheel(4 + i * 2.4 + sx * 0.5, 0.25, 6 + sz * 0.6, 0.25, 0.12, 'x'); h.ball(4 + i * 2.4, 1.25, 6, 0.4, i % 2 ? LV : RK2, i % 2 ? { glow: 1.2 } : {}); }
      h.B(8, 0, 6.6, 12, 0.08, 0.12, '#8d8f94', FL); h.B(8, 0, 5.4, 12, 0.08, 0.12, '#8d8f94', FL); for (let k = 0; k < 12; k++) h.B(2.5 + k, 0, 6, 0.2, 0.05, 1.6, '#5a3c24', FL);
      for (let i = 0; i < 6; i++) woodcrate(h, -4 + (i % 3) * 1.2, Math.floor(i / 3) * 1, -3, 1.0, '#a07a4a');
      for (let i = 0; i < 4; i++) drum(h, -8 + i * 1.1, -4.5, ['#b8452f', '#55606b'][i % 2]);
      h.cone(-2, 0, 7, 2.4, 2.8, '#6b5a4a', { seg: 4, cw: 0.5, pat: ['vband', '#6b5a4a', '#5a4a3a', 4, 1] }); lamp(h, 1.5, 9, 2.4); lamp(h, -5, -1, 2.4);
      h.dome(-6, 0, 22, 5, 1.8, 3.5, '#3a302c'); h.dome(20, 0, -24, 5, 2, 3, '#3a302c'); h.dome(33, 0, -20, 3, 1.6, 4, '#332a27');
      // 地層の岩（黒い岩と赤茶の層）・岩のすき間
      const VP = ['#3a302c', '#5a3a2a', '#6b4a3a', '#2b2422', '#7a3a24'];
      KIT.outcrop(h, -27, -5, VP, []); KIT.outcrop(h, -1, 13, VP, []); KIT.outcrop(h, -13, -23, VP, []); KIT.crevice(h, 21, -5, VP);
    }
  }
};
