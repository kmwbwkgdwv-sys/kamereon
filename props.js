// 作り込んだ小物：でこぼこの物（石垣・土のう・風船・だるま・招き猫・たぬき・雪だるま・ペンギン・ちょうちん・配管）、
// 看板（文字の看板・袖看板・立体看板・のれん・垂れ幕・非常口・道路標識）、掲示板、旗（旗ざお・三角旗・こいのぼり・のぼり）、
// 土管（3本つみ・立てた土管）、本物の引き出し・とびらのある家具（cab3d）など。
// h = maps.js と同じ道具（h.B / h.cyl / h.lump …）。座標はマップの設計図の単位（あとで scale 倍される）
// 隠れる側の大きさ：体の高さ 0.64（1倍）〜 1.28（2倍）くらい。でこぼこはこの大きさに近いほど、体のでこぼこがまぎれる
export const NC = { nocol: true };
export const shade = (c, k) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('');
export const pick = (h, a) => a[Math.floor(h.rnd() * a.length)];
const seed8 = h => Math.floor(h.rnd() * 8);
const TOY = ['#e04f4f', '#4f7fe0', '#f0d040', '#4fbf6a', '#b06fd8', '#f08a3c'];
const PASTEL = ['#ff9bb8', '#9fd0f0', '#fff1a0', '#b8f0c0', '#d8b8ff', '#ffc8a0'];
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
// 2点をむすぶ細い棒（当たり判定は球をならべる）
export function rod(h, p, q, r, c, o) { const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], l = Math.hypot(dx, dy, dz); h.capc((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2, r, Math.max(0.01, l - 2 * r), dx, dy, dz, c, o); }
// 向きのある物を置く道具：a = 正面（dir）の向き、b = 横
export function frame(h, x, z, dir) {
  const ax = dir[0], az = dir[1];
  const at = (a, b) => [x + ax * a - az * b, z + az * a + ax * b];
  const B = (a, b, y, la, ht, lb, col, o) => { const [px, pz] = at(a, b); h.B(px, y, pz, ax ? la : lb, ht, ax ? lb : la, col, o); };
  const tilt = ang => (ax ? [0, 0, -ax * ang] : [az * ang, 0, 0]);
  return { at, B, tilt, ax, az };
}
// 窓ガラス（中が見える・体は通らない）
export const glassBox = (h, x, y, z, w, ht, d) => { h.B(x, y, z, w, ht, d, '#bfe3f2', { soft: true, glass: true, sharp: true }); h.boxc(x, y, z, w, ht, d, { sharp: true }); };
// 文字の模様（看板）。asp = 面の 横/縦
export const txt = (t, bg, fg, asp = 1, v = false, frame = true, edge) => ['artTxt|' + t + '|' + (v ? 'v' : 'h') + '|' + (Math.round(asp * 100) / 100) + '|' + (frame ? 1 : 0), bg, [fg, edge || fg, edge && edge !== fg ? edge : undefined].filter(Boolean), 1, 1];

/* ================= 本物の引き出し・とびらのある家具 ================= */
// (x,y,z,w,ht,d) = 家具の箱（h.B と同じ）。face = 正面の向き [fx,fz]。nx×ny = 引き出し／とびらの数。
// とびら・引き出しは少し前に出ていて、すき間と取っ手がある。o.legs = 脚つき、o.mess = 引き出しが少し開いていることがある
export function cab3d(h, x, y, z, w, ht, d, c, c2, nx = 1, ny = 1, face = [0, 1], o = {}) {
  const al = face[1] !== 0, L = al ? w : d, D = al ? d : w, sg = al ? face[1] : face[0];
  const leg = o.legs ? Math.min(0.18, ht * 0.18) : 0;
  h.B(x, y + leg, z, w, ht - leg, d, c, { r: 0.02, pat: o.pat || ['grain', c, 0, 1, 1], sink: o.sink, nocol: o.nocol });
  if (leg) for (const s of [-1, 1]) for (const t of [-1, 1]) h.cyl(x + s * (w / 2 - 0.06), y, z + t * (d / 2 - 0.06), 0.03, leg + 0.01, shade(c, 0.6), { seg: 8, rt: 0.025 });
  const plinth = !leg && ht > 0.45 ? Math.min(0.08, ht * 0.08) : 0, topT = ht > 0.4 ? 0.04 : 0.015, gap = 0.022;
  nx = Math.max(1, Math.round(nx)); ny = Math.max(1, Math.round(ny));
  const pw = (L - 0.06 - gap * (nx - 1)) / nx, ph = (ht - leg - plinth - topT - 0.03 - gap * (ny - 1)) / ny;
  if (pw < 0.05 || ph < 0.05) return;
  const fo = D / 2 + 0.017, fc = shade(c, 1.05), kc = c2 || '#c9a24a';
  const P = (u, off) => (al ? [x + u, z + sg * off] : [x + sg * off, z + u]);
  const open = o.mess && ny >= 2 && h.rnd() < 0.5 ? Math.floor(h.rnd() * nx * ny) : -1;
  let k = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++, k++) {
    const u = -L / 2 + 0.03 + pw / 2 + i * (pw + gap), yb = y + leg + plinth + 0.015 + j * (ph + gap);
    const out = k === open ? 0.22 : 0, [px, pz] = P(u, fo + out);
    h.B(px, yb, pz, al ? pw : 0.03, ph, al ? 0.03 : pw, fc, { nocol: !out, r: 0.012 });
    if (out) { // 少し開いた引き出し：中から服がのぞく
      const [ix, iz] = P(u, D / 2 + out / 2 - 0.02); h.B(ix, yb, iz, al ? pw - 0.04 : out, ph * 0.8, al ? out : pw - 0.04, shade(c, 0.8), { r: 0.01 });
      h.lump(ix, yb + ph * 0.85, iz, al ? pw * 0.4 : out * 0.6, 0.07, al ? out * 0.6 : pw * 0.4, pick(h, PASTEL), { seed: seed8(h), bump: 0.3, freq: 2, nocol: true });
    }
    const [kx, kz] = P(u, fo + out + 0.02);
    if (ph < 0.5 || ny >= 3) h.B(kx, yb + ph * 0.62, kz, al ? Math.min(0.24, pw * 0.4) : 0.025, 0.035, al ? 0.025 : Math.min(0.24, pw * 0.4), kc, { nocol: true, r: 0.01 }); // 引き出しの取っ手
    else { const e = nx > 1 ? (i % 2 ? -1 : 1) : 1, [qx, qz] = P(u + e * (pw / 2 - 0.07), fo + 0.02); h.B(qx, yb + ph * 0.4, qz, al ? 0.03 : 0.025, Math.min(0.3, ph * 0.35), al ? 0.025 : 0.03, kc, { nocol: true, r: 0.01 }); } // とびらの取っ手
  }
  if (plinth) { const [px, pz] = P(0, D / 2 - 0.012); h.B(px, y, pz, al ? L - 0.04 : 0.03, plinth, al ? 0.03 : L - 0.04, shade(c, 0.55), NC); }
  if (ht > 0.4 && !o.notop) h.B(x, y + ht - 0.001, z, w + 0.04, 0.035, d + 0.04, shade(c, 0.92), { r: 0.012, nocol: true }); // 天板のふち
}
// frame（向きつき）版：F.B と同じ引数のあとに、取っ手の色・横の数・たての数
export function cabF(h, F, a, b, y, la, ht, lb, c, c2, nx, ny, o) {
  const [px, pz] = F.at(a, b); cab3d(h, px, y, pz, F.ax ? la : lb, ht, F.ax ? lb : la, c, c2, nx, ny, [F.ax, F.az], o);
}
// 板のとびら（わく・板の飾り・取っ手）。al = とびらの面が z 向き（x にのびる）
export function door3d(h, x, y, z, w, ht, t, al, c, ks = 1, o = {}) {
  h.B(x, y, z, al ? w : t, ht, al ? t : w, c, { r: 0.02, pat: ['grain', c, 0, 1, 2], nocol: o.nocol });
  for (const s of [-1, 1]) for (const [y0, hh] of [[0.12, ht * 0.38], [ht * 0.56, ht * 0.36]]) {
    const off = s * (t / 2 + 0.012); h.B(al ? x : x + off, y + y0, al ? z + off : z, al ? w * 0.7 : 0.02, hh, al ? 0.02 : w * 0.7, shade(c, 1.08), { nocol: true, r: 0.015 });
    const ko = s * (t / 2 + 0.05), kp = ks * (w / 2 - 0.12); h.ball(al ? x + kp : x + ko, y + ht * 0.47, al ? z + ko : z + kp, 0.05, '#c9a24a', NC);
  }
}

/* ================= 土管・つつ ================= */
// 横にねかせた筒を y0 の高さに置く（中を通りぬけられる）。当たり判定は輪切りの箱
export function tubeAt(h, x, y0, z, ro, ri, L, alongX, col, o) {
  h.tube(x, y0 + ro, z, ro, ri, L, alongX ? 'x' : 'z', col, o);
  const cy = y0 + ro, yf = y0 + Math.min(ro - ri + 0.1, 0.22), zi0 = Math.sqrt(Math.max(0, ri * ri - (cy - yf) * (cy - yf)));
  const box = (a, b, ya, yb) => { const m = (a + b) / 2; h.boxc(alongX ? x : x + m, ya, alongX ? z + m : z, alongX ? L : b - a, yb - ya, alongX ? b - a : L, { sharp: true }); };
  box(-zi0, zi0, y0 + (y0 > 0 ? ro - Math.sqrt(Math.max(0, ro * ro - zi0 * zi0)) : 0), yf);
  h.B(x, yf - 0.04, z, alongX ? L - 0.04 : 2 * zi0 + 0.1, 0.04, alongX ? 2 * zi0 + 0.1 : L - 0.04, shade(col, 0.6), { nocol: true, sharp: true });
  const N = 6, hs = (cy + ri - yf) / N;
  for (let k = 0; k < N; k++) {
    const ya = yf + k * hs, yb = ya + hs, dIn = Math.max(Math.abs(ya - cy), Math.abs(yb - cy)), dOut = ya <= cy && yb >= cy ? 0 : Math.min(Math.abs(ya - cy), Math.abs(yb - cy));
    const zi = Math.sqrt(Math.max(0, ri * ri - dIn * dIn)), zo = Math.sqrt(Math.max(0, ro * ro - dOut * dOut));
    if (zi < 0.03) box(-zo, zo, ya, yb); else { box(-zo, -zi, ya, yb); box(zi, zo, ya, yb); }
  }
  const zt = Math.sqrt(ro * ro - ri * ri); box(-zt, zt, cy + ri, cy + ro);
  if (y0 > 0) { const zb = Math.sqrt(Math.max(0, ro * ro - (ro - 0.12) * (ro - 0.12))); box(-zb, zb, y0, y0 + 0.12); } // 下にのった土管の、筒の底
}
// 立てた土管（上から飛びこむと中にかくれる）。当たり判定は輪にそって並べた板
export function standPipe(h, x, z, ro, ht, col, o = {}) {
  const ri = ro - 0.12;
  h.lathe(x, 0, z, [[ri, 0.02], [ro, 0], [ro, ht], [ro + 0.04, ht], [ro + 0.04, ht + 0.06], [ri, ht + 0.06], [ri, 0.02]], col, Object.assign({ nocol: true, seg: 24 }, o));
  h.cyl(x, 0, z, ri, 0.03, shade(col, 0.55), { nocol: true, flat: true });
  const n = 14, rm = (ro + ri) / 2, sl = 2 * Math.PI * rm / n * 1.08;
  for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * Math.PI * 2; h.obox(x + Math.cos(a) * rm, 0, z + Math.sin(a) * rm, ro - ri + 0.04, ht + 0.06, sl, -a); }
}

/* ================= 看板 ================= */
// 壁にはる看板：(x,z) = 壁の面の点、(nx,nz) = 壁から外への向き、y0 = 下のはし。体の前の方が少し入る（文字と同じ色に塗る）
export function signBoard(h, x, y0, z, nx, nz, w, ht, text, bg, fg, o = {}) {
  const al = nz !== 0, t = o.t || 0.14, cx = x + nx * t / 2, cz = z + nz * t / 2;
  h.B(cx, y0, cz, al ? w : t, ht, al ? t : w, bg, { pat: txt(text, bg, fg, w / ht, !!o.v, o.frame !== false, o.edge), sharp: true, sink: true, glow: o.glow || 0 });
  const fc = o.fc || shade(bg, 0.6), f = 0.07, ft = t + 0.06, fx = x + nx * ft / 2, fz = z + nz * ft / 2; // わく（でこぼこ）
  for (const s of [-1, 1]) {
    h.B(fx, s < 0 ? y0 - f : y0 + ht, fz, al ? w + 2 * f : ft, f, al ? ft : w + 2 * f, fc, { r: 0.01 });
    h.B(al ? fx + s * (w / 2 + f / 2) : fx, y0, al ? fz : fz + s * (w / 2 + f / 2), al ? f : ft, ht, al ? ft : f, fc, { r: 0.01 });
  }
  if (o.lamps) for (let i = 0; i < Math.max(1, Math.round(w / 1.4)); i++) { // 看板を照らすライト（首の長いランプ）
    const u = (i + 0.5) / Math.max(1, Math.round(w / 1.4)) * w - w / 2, bx = al ? x + u : x, bz = al ? z : z + u;
    rod(h, [bx + nx * 0.05, y0 + ht + 0.1, bz + nz * 0.05], [bx + nx * 0.55, y0 + ht + 0.35, bz + nz * 0.55], 0.025, '#2a3038', NC);
    h.cone(bx + nx * 0.6, y0 + ht + 0.18, bz + nz * 0.6, 0.11, 0.16, '#2a3038', { nocol: true, rt: 0.05 }); h.ball(bx + nx * 0.6, y0 + ht + 0.17, bz + nz * 0.6, 0.06, '#fff4c2', { glow: 1, nocol: true, nolight: true });
  }
}
// 袖看板（壁から横につき出た、たて書きの看板。両面にくっつける）
export function sodeSign(h, x, y0, z, nx, nz, ht, text, bg, fg, o = {}) {
  const al = nz !== 0, wd = o.w || 0.85, t = 0.26, off = 0.25 + wd / 2, cx = x + nx * off, cz = z + nz * off;
  h.B(cx, y0, cz, al ? t : wd, ht, al ? wd : t, bg, { pat: txt(text, bg, fg, wd / ht, true, true, o.edge), sharp: true, sink: true, glow: o.glow || 0 });
  const fc = shade(bg, 0.55);
  for (const s of [-1, 1]) h.B(cx, s < 0 ? y0 - 0.08 : y0 + ht, cz, al ? t + 0.06 : wd + 0.1, 0.08, al ? wd + 0.1 : t + 0.06, fc, { r: 0.02 });
  for (const yy of [y0 + ht * 0.15, y0 + ht * 0.85]) h.B(x + nx * 0.13, yy, z + nz * 0.13, al ? 0.06 : 0.26, 0.06, al ? 0.26 : 0.06, '#55606b', NC); // うで
  if (o.bulbs) for (let i = 0; i < Math.round(ht / 0.4); i++) for (const s of [-1, 1]) h.ball(cx + (al ? s * (t / 2 + 0.04) : (wd / 2 + 0.03) * (i % 2 ? 1 : -1)), y0 + 0.2 + i * 0.4, cz + (al ? (wd / 2 + 0.03) * (i % 2 ? 1 : -1) : s * (t / 2 + 0.04)), 0.045, '#fff4c2', { glow: 1, nocol: true, nolight: true });
}
// 垂れ幕（ビルのかべに、たてに長い布）
export function banner(h, x, y0, z, nx, nz, w, ht, text, bg, fg) {
  const al = nz !== 0; h.B(x + nx * 0.04, y0, z + nz * 0.04, al ? w : 0.05, ht, al ? 0.05 : w, bg, { pat: txt(text, bg, fg, w / ht, true, true), sharp: true, sink: true });
  for (const yy of [y0 - 0.04, y0 + ht]) h.cyl(x + nx * 0.08, yy + 0.02, z + nz * 0.08, 0.03, w + 0.2, '#c9c9c9', { nocol: true, rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] });
}
// のれん（入口の上からたれる布。何枚かに分かれていて、あいだを通れる）。(x,z) = 入口のまん中、y1 = 上のはし、(nx,nz) = 外への向き
export function noren(h, x, y1, z, nx, nz, w, text, c, fg = '#ffffff') {
  const al = nz !== 0, n = Math.max(2, Math.min(4, Math.round(w / 0.55))), pw = w / n, ht = 1.05;
  h.cyl(x + nx * 0.06, y1 + 0.03, z + nz * 0.06, 0.035, w + 0.3, '#6b4a2b', { nocol: true, rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] });
  for (let i = 0; i < n; i++) {
    const u = -w / 2 + (i + 0.5) * pw, px = al ? x + u : x + nx * 0.07, pz = al ? z + nz * 0.07 : z + u;
    h.B(px, y1 - ht, pz, al ? pw - 0.04 : 0.03, ht, al ? 0.03 : pw - 0.04, c, { r: 0.01, pat: ['artNoren|' + text + '|' + i + '|' + n, c, [fg], 1, 1], rot: al ? [0, 0, (i % 2 ? 1 : -1) * 0.02] : [(i % 2 ? 1 : -1) * 0.02, 0, 0] });
  }
}
// 非常口のマーク（光る）
export function exitSign(h, x, y, z, nx, nz) { const al = nz !== 0; h.B(x + nx * 0.06, y, z + nz * 0.06, al ? 0.72 : 0.1, 0.3, al ? 0.1 : 0.72, '#1fa15a', { nocol: true, glow: 0.9, pat: ['artExit', '#1fa15a', ['#ffffff'], 1, 1], r: 0.02 }); }
// 道路標識（柱・板の形・中の絵）。face = 板の向き [fx,fz]、ht = 板の高さ
export function roadSign(h, x, z, kind, ht = 2.2, face = [0, 1], o = {}) {
  const al = face[1] !== 0, s = o.s || 1;
  if (!o.nopole) h.cyl(x, 0, z, 0.045, ht + 0.35 * s, '#c9ccd0', { seg: 8 });
  const fx = x + face[0] * 0.06, fz = z + face[1] * 0.06, R = 0.38 * s, T = 0.035;
  const disc = (c, r, seg = 24) => h.cyl(fx, ht, fz, r, T, c, { seg, rot: al ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] });
  const inner = (c, w, hh, pat, dy = 0) => h.B(fx + face[0] * 0.025, ht + dy - hh / 2, fz + face[1] * 0.025, al ? w : 0.02, hh, al ? 0.02 : w, c, { nocol: true, sharp: true, pat });
  if (kind === 'noentry') { disc('#d9342b', R); inner('#ffffff', R * 1.3, R * 0.32); }
  else if (kind === 'speed') { disc('#d9342b', R); h.cyl(fx + face[0] * 0.02, ht, fz + face[1] * 0.02, R * 0.78, T, '#ffffff', { nocol: true, seg: 24, rot: al ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] }); inner('#ffffff', R * 1.05, R * 0.8, ['artRoad|speed|' + (o.n || pick(h, [20, 30, 40, 50])), '#ffffff', ['#2a5fb0'], 1, 1]); }
  else if (kind === 'arrow') { disc('#2a5fb0', R); inner('#ffffff', R * 0.22, R * 0.9, undefined, -0.12); const [ax, az] = [fx + face[0] * 0.03, fz + face[1] * 0.03]; h.cyl(ax, ht + R * 0.32, az, R * 0.42, 0.02, '#ffffff', { nocol: true, seg: 3, rot: al ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, 0, Math.PI / 2] }); } // 上向きの矢印
  else if (kind === 'stop') { h.cyl(fx, ht, fz, R * 1.15, T, '#d9342b', { seg: 3, rot: al ? [Math.PI / 2, 0, 0] : [Math.PI / 2, 0, Math.PI / 2] }); inner('#d9342b', R * 1.1, R * 0.5, ['artRoad|stop', '#d9342b', ['#ffffff'], 1, 1], R * 0.32); }
  else if (kind === 'warn' || kind === 'work') { const [px, pz] = [fx, fz]; h.B(px, ht - R * 0.75, pz, al ? R * 1.5 : T, R * 1.5, al ? T : R * 1.5, '#f0c020', { rot: al ? [0, 0, Math.PI / 4] : [Math.PI / 4, 0, 0] }); inner('#f0c020', R * 1.05, R * 1.05, ['artRoad|' + kind, '#f0c020', ['#1b1d20'], 1, 1]); }
  else if (kind === 'walk') { h.B(fx, ht - R, fz, al ? R * 2 : T, R * 2, al ? T : R * 2, '#2a5fb0', { r: 0.03 }); inner('#2a5fb0', R * 1.8, R * 1.8, ['artRoad|walk', '#2a5fb0', ['#ffffff'], 1, 1]); }
  else { h.B(fx, ht - R, fz, al ? R * 2 : T, R * 2, al ? T : R * 2, '#2a5fb0', { r: 0.03 }); inner('#2a5fb0', R * 1.8, R * 1.8, ['artRoad|P', '#2a5fb0', ['#ffffff'], 1, 1]); }
}
// 立体看板（大きな食べ物などの形。かべにとりつける。上に乗れる・くっつける）。(x,y,z) = 取りつける所、(nx,nz) = 外への向き、s = 大きさ
export function food3D(h, x, y, z, nx, nz, kind, s = 1) {
  const cx = x + nx * 0.9 * s, cz = z + nz * 0.9 * s, rx = -nz, rz = nx, yaw = Math.atan2(nx, nz);
  h.B(x + nx * 0.2, y + 0.3 * s, z + nz * 0.2, nz ? 1.2 * s : 0.4, 0.2, nx ? 1.2 * s : 0.4, '#55606b', { r: 0.03 }); // 取りつけの台
  if (kind === 'tako') { // たこ：あたま・はちまき・目・口・くねった足
    const c = '#e0533a';
    h.lump(cx, y + 1.5 * s, cz, 0.85 * s, 1.0 * s, 0.85 * s, c, { seed: 2, bump: 0.06, freq: 1.5, core: 0.93, pat: ['dots', c, shade(c, 0.85), 3, 2] });
    h.ring(cx, y + 1.25 * s, cz, 0.84 * s, 0.09 * s, '#f4f4f4');
    for (const t of [-1, 1]) { h.ball(cx + rx * t * 0.3 * s + nx * 0.7 * s, y + 1.05 * s, cz + rz * t * 0.3 * s + nz * 0.7 * s, 0.16 * s, '#ffffff', NC); h.ball(cx + rx * t * 0.3 * s + nx * 0.82 * s, y + 1.05 * s, cz + rz * t * 0.3 * s + nz * 0.82 * s, 0.07 * s, '#1b1d20', NC); }
    h.torus(cx + nx * 0.75 * s, y + 0.75 * s, cz + nz * 0.75 * s, 0.13 * s, 0.06 * s, [0, yaw, 0], shade(c, 0.85), NC);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28, ca = Math.cos(a), sa = Math.sin(a); rod(h, [cx + ca * 0.4 * s, y + 0.6 * s, cz + sa * 0.4 * s], [cx + ca * 1.0 * s, y + 0.15 * s, cz + sa * 1.0 * s], 0.17 * s, c); h.ball(cx + ca * 1.1 * s, y + 0.3 * s, cz + sa * 1.1 * s, 0.15 * s, c); }
  } else if (kind === 'ebi') { // えびフライ：ころもの体・しっぽ
    const c = '#e0a840';
    h.lump(cx, y + 0.9 * s, cz, nz ? 1.3 * s : 0.42 * s, 0.42 * s, nx ? 1.3 * s : 0.42 * s, c, { seed: 6, bump: 0.28, freq: 5, core: 0.9, ry: 0, pat: ['confetti', c, ['#c98a30', '#f0c860'], 3, 1] });
    for (const t of [-1, 1]) h.cone(cx + rx * 1.35 * s, y + 0.75 * s + t * 0.1 * s, cz + rz * 1.35 * s, 0.22 * s, 0.4 * s, '#e0413a', { seg: 6, nocol: true });
    h.lump(cx - rx * 0.4 * s, y + 0.45 * s, cz - rz * 0.4 * s, 0.5 * s, 0.1 * s, 0.4 * s, '#7fbf3f', { seed: 1, bump: 0.3, freq: 3, nocol: true }); // キャベツ
  } else if (kind === 'ramen') { // ラーメン：どんぶり・めん・なると・はし
    const c = '#e0413a';
    h.lathe(cx, y + 0.35 * s, cz, [[0.001, 0], [0.5 * s, 0], [0.62 * s, 0.1 * s], [1.0 * s, 0.75 * s], [0.94 * s, 0.75 * s], [0.001, 0.62 * s]], c, { pat: ['zigzag', c, '#f4f4f4', 6, 1], seg: 24 });
    h.lump(cx, y + 1.05 * s, cz, 0.9 * s, 0.22 * s, 0.9 * s, '#f0d070', { seed: 4, bump: 0.25, freq: 6, core: 0.9, pat: ['wave', '#f0d070', ['#e0b850'], 3, 3] });
    h.cyl(cx + rx * 0.35 * s, y + 1.2 * s, cz + rz * 0.35 * s, 0.26 * s, 0.07 * s, '#f4f4f4', { pat: ['wave', '#f4f4f4', ['#ff8ab8'], 1, 1] });
    h.B(cx - rx * 0.3 * s, y + 1.12 * s, cz - rz * 0.3 * s, 0.4 * s, 0.05 * s, 0.4 * s, '#3a6a3a', { nocol: true, r: 0.02 });
    for (const t of [-0.08, 0.08]) rod(h, [cx + rx * t * s - nx * 0.4 * s, y + 0.9 * s, cz + rz * t * s - nz * 0.4 * s], [cx + rx * (t + 0.3) * s + nx * 0.2 * s, y + 2.3 * s, cz + rz * (t + 0.3) * s + nz * 0.2 * s], 0.045 * s, '#c98f4e');
  } else if (kind === 'gyoza') { // ぎょうざ（ひだのある三日月）×3
    for (let i = 0; i < 3; i++) { const u = (i - 1) * 0.75 * s; h.lump(cx + rx * u, y + 0.6 * s + (i === 1 ? 0.25 * s : 0), cz + rz * u, 0.42 * s, 0.32 * s, 0.6 * s, '#f0d8a8', { seed: 3 + i, bump: 0.12, freq: 4, core: 0.92, ry: yaw, pat: ['zigzag', '#f0d8a8', ['#e0b070'], 1, 3] }); }
  } else if (kind === 'onigiri') { // おにぎり：角の丸い三角のごはん・のり・うめ
    const al = nz !== 0, rot = al ? [-Math.PI / 2, 0, 0] : [-Math.PI / 2, 0, Math.PI / 2], R = 0.95 * s, cy = y + 0.45 * s + R * 0.5;
    h.cyl(cx, cy, cz, R, 0.6 * s, '#f6f2e6', { seg: 3, rot, pat: ['confetti', '#f6f2e6', ['#e8e2d0', '#ffffff'], 3, 3] });
    for (const a of [0, 2.094, 4.189]) h.ball(cx + rx * Math.sin(a) * R * 0.62, cy + Math.cos(a) * R * 0.62, cz + rz * Math.sin(a) * R * 0.62, 0.3 * s, '#f6f2e6', NC); // 丸い角
    h.B(cx + nx * 0.31 * s, y + 0.3 * s, cz + nz * 0.31 * s, nz ? 0.75 * s : 0.06, 0.62 * s, nx ? 0.75 * s : 0.06, '#1e2a22', { r: 0.02, nocol: true });
    h.ball(cx + nx * 0.32 * s, cy + 0.2 * s, cz + nz * 0.32 * s, 0.13 * s, '#c9302a', NC);
  } else if (kind === 'soft') { // ソフトクリーム：コーン・うずまき
    h.cone(cx, y + 0.1 * s, cz, 0.12 * s, 1.0 * s, '#d9a85a', { rt: 0.48 * s, seg: 16, pat: ['check2', '#d9a85a', '#c08a40', 4, 3] });
    for (let i = 0; i < 4; i++) h.lump(cx, y + (1.25 + i * 0.32) * s, cz, (0.58 - i * 0.12) * s, 0.2 * s, (0.58 - i * 0.12) * s, '#fdf6ea', { seed: i, bump: 0.08, freq: 2, core: 0.92 });
    h.cone(cx, y + 2.35 * s, cz, 0.14 * s, 0.25 * s, '#fdf6ea', NC);
  } else if (kind === 'sushi') { // にぎりずし：ごはん・ネタ
    for (let i = 0; i < 2; i++) { const u = (i - 0.5) * 1.0 * s, c = i ? '#f08a5a' : '#c9302a'; h.lump(cx + rx * u, y + 0.65 * s, cz + rz * u, 0.42 * s, 0.28 * s, 0.7 * s, '#f6f2e6', { seed: 2 + i, bump: 0.12, freq: 6, core: 0.92, ry: yaw }); h.lump(cx + rx * u, y + 0.95 * s, cz + rz * u, 0.48 * s, 0.12 * s, 0.85 * s, c, { seed: 5 + i, bump: 0.05, freq: 2, core: 0.92, ry: yaw, pat: ['diag', c, '#ffffff', 2, 3] }); }
  } else if (kind === 'pudding') { // プリン
    h.lathe(cx, y + 0.35 * s, cz, [[0.001, 0], [0.8 * s, 0], [0.62 * s, 1.0 * s], [0.001, 1.05 * s]], '#f6d878', { seg: 22 });
    h.lump(cx, y + 1.38 * s, cz, 0.62 * s, 0.14 * s, 0.62 * s, '#7a3a14', { seed: 1, bump: 0.08, freq: 2, core: 0.9 }); h.ball(cx, y + 1.6 * s, cz, 0.16 * s, '#d9302a');
    h.cyl(cx, y + 0.3 * s, cz, 1.0 * s, 0.06 * s, '#f4f4f4');
  } else { // だんご
    rod(h, [cx, y + 0.1 * s, cz], [cx, y + 2.2 * s, cz], 0.05 * s, '#c9a26b');
    ['#ff9bb8', '#f6f2e6', '#7fbf6a'].forEach((c, i) => h.lump(cx, y + (0.55 + i * 0.6) * s, cz, 0.36 * s, 0.32 * s, 0.36 * s, c, { seed: i, bump: 0.04, freq: 1.5, core: 0.93 }));
  }
}

/* ================= 掲示板 ================= */
// kind: 'cork'（かべにかけるコルク板）・'stand'（脚つき両面）・'town'（屋根つきの町の掲示板）・'white'（ホワイトボード）・'chalk'（メニューの黒板）
// (x,z) = 置く場所（cork はかべの面の点）、dir = 正面の向き
export function bboard(h, x, z, dir, w = 2.2, ht = 1.4, kind = 'cork', o = {}) {
  const F = frame(h, x, z, dir), y0 = o.y0 != null ? o.y0 : kind === 'cork' ? 1.0 : kind === 'town' ? 0.9 : 0.75;
  const t = 0.08, wood = o.wood || '#8a5a33';
  const surf = kind === 'white' ? ['noise', '#f4f6f6', 0, 2, 1] : kind === 'chalk' ? ['artChalk|0', '#2f4a3a', ['#f4f4f4'], 1, 1] : ['cork', '#c69a62', 0, Math.max(1, Math.round(w / 1.2)), Math.max(1, Math.round(ht / 1.2))];
  const two = kind !== 'cork', face = two ? [-1, 1] : [1];
  const a0 = kind === 'cork' ? t / 2 : 0;
  F.B(a0, 0, y0, t, ht, w, surf[1], { pat: surf, sharp: true, sink: true });
  const fc = kind === 'white' ? '#c9ccd0' : wood, f = 0.08;
  for (const s of [-1, 1]) { F.B(a0, 0, s < 0 ? y0 - f : y0 + ht, t + 0.05, f, w + 2 * f, fc, { r: 0.02 }); F.B(a0, s * (w / 2 + f / 2), y0, t + 0.05, ht, f, fc, { r: 0.02 }); }
  if (kind === 'white') { F.B(a0 + t / 2 + 0.06, 0, y0 - 0.02, 0.12, 0.03, w * 0.6, '#c9ccd0', { nocol: true }); for (let i = 0; i < 3; i++) F.B(a0 + t / 2 + 0.07, -w * 0.2 + i * 0.12, y0 + 0.01, 0.03, 0.03, 0.1, TOY[i], NC); }
  // はり紙（少し出っぱる・少しかたむく）とピン・マグネット
  if (kind !== 'chalk') for (const s of face) {
    const n = kind === 'white' ? 3 : Math.max(3, Math.round(w * ht * 2.6));
    for (let i = 0; i < n; i++) {
      const pw = kind === 'white' ? 0.5 : 0.32 + h.rnd() * 0.32, ph = pw * (1.1 + h.rnd() * 0.4), u = (h.rnd() - 0.5) * (w - pw - 0.12), v = y0 + 0.06 + h.rnd() * Math.max(0.01, ht - ph - 0.12);
      const k = Math.floor(h.rnd() * 8), pc = pick(h, ['#fbfaf4', '#fff4c2', '#e8f4ff', '#ffe8ef', '#f0ffe8']), [px, pz] = F.at(a0 + s * (t / 2 + 0.008 + i * 0.002), u), ang = (h.rnd() - 0.5) * 0.16;
      const pat = kind === 'white' ? ['artChalk|1', '#ffffff', ['#2f6fb0'], 1, 1] : ['artPaper|' + k, pc, pick(h, [['#e04f4f', '#4f7fe0', '#f0d040', '#4fbf6a'], ['#2f6fb0', '#e0719a', '#3f9b6a', '#f08a3c'], ['#b06fd8', '#59b6d8', '#f0d040', '#e04f4f']]), 1, 1];
      h.B(px, v, pz, F.ax ? 0.012 : pw, ph, F.ax ? pw : 0.012, pc, { nocol: true, sharp: true, pat, rot: F.ax ? [ang, 0, 0] : [0, 0, ang] });
      const [qx, qz] = F.at(a0 + s * (t / 2 + 0.03), u); h.ball(qx, v + ph - 0.05, qz, 0.03, pick(h, TOY), NC);
    }
  }
  if (kind === 'stand' || kind === 'white' || kind === 'chalk') { // 脚
    for (const s of [-1, 1]) { const [px, pz] = F.at(0, s * (w / 2 + 0.04)); h.cyl(px, 0, pz, 0.035, y0 + ht, '#55606b', { seg: 8 }); F.B(0, s * (w / 2 + 0.04), 0, 0.6, 0.05, 0.08, '#55606b', { r: 0.02 }); }
  }
  if (kind === 'town') { // 柱・屋根
    for (const s of [-1, 1]) { const [px, pz] = F.at(0, s * (w / 2 + 0.12)); h.cyl(px, 0, pz, 0.07, y0 + ht + 0.35, wood, { seg: 10 }); }
    const [px, pz] = F.at(0, 0); h.roof(px, y0 + ht + 0.3, pz, F.ax ? 0.7 : w + 0.6, F.ax ? w + 0.6 : 0.7, 0.3, w + 0.6, '#3a4a5e', { al: !!F.ax });
  }
}

/* ================= 旗 ================= */
// 旗ざお：台・さお・玉・なみうつ旗（たての帯を少しずつ向きを変えて並べる）
export function flagpole(h, x, z, ht = 5, design = 'stripe', cols = TOY, o = {}) {
  h.cyl(x, 0, z, 0.32, 0.25, '#b9b7b0', { seg: 12 }); h.cyl(x, 0.25, z, 0.06, ht - 0.25, '#e9edf0', { seg: 10 }); h.ball(x, ht + 0.06, z, 0.1, '#c9a24a', NC);
  flag(h, x, ht - 0.12, z, o.w || 1.6, o.h || 1.0, o.yaw || 0, design, cols, o.bg || '#ffffff', o.text);
}
// 旗だけ（(x,ytop,z) = さおにつく上のはし、yaw = なびく向き）
export function flag(h, x, ytop, z, fw, fh, yaw, design, cols, bg = '#ffffff', text) {
  const n = 5, sw = fw / n, c = Math.cos(yaw), s = Math.sin(yaw);
  let px = x, pz = z;
  for (let i = 0; i < n; i++) {
    const a = yaw + (i % 2 ? 0.28 : -0.28), dx = Math.cos(a) * sw, dz = -Math.sin(a) * sw;
    h.B(px + dx / 2, ytop - fh, pz + dz / 2, sw * 1.04, fh, 0.02, bg, { nocol: true, sharp: true, rot: [0, a, 0], pat: ['artFlag|' + design + '|' + i + '|' + n + (text ? '|' + text : ''), bg, cols, 1, 1] });
    px += dx; pz += dz;
  }
}
// 三角旗のガーランド（2点のあいだにたるませてはる）。p,q = [x,y,z]
export function bunting(h, p, q, n = 10, cols = TOY, o = {}) {
  const sag = o.sag == null ? 0.35 : o.sag, dx = q[0] - p[0], dz = q[2] - p[2], al = Math.abs(dx) >= Math.abs(dz);
  let prev = p;
  for (let i = 1; i <= n; i++) {
    const t = i / n, cur = [p[0] + dx * t, p[1] + (q[1] - p[1]) * t - sag * 4 * t * (1 - t), p[2] + dz * t];
    rod(h, prev, cur, 0.012, '#f4f4f4', NC); prev = cur;
    if (i === n) break;
    const c = cols[i % cols.length], sz = o.size || 0.32;
    h.cyl(cur[0], cur[1] - sz * 0.5, cur[2], sz * 0.58, 0.015, c, { nocol: true, seg: 3, rot: al ? [Math.PI / 2, 0, 0] : [Math.PI / 2, 0, Math.PI / 2] });
  }
}
// こいのぼり（さお・矢車・吹き流し・3びきのこい）
export function koinobori(h, x, z, ht = 7, yaw = 0) {
  h.cyl(x, 0, z, 0.35, 0.3, '#b9b7b0', { seg: 12 }); h.cyl(x, 0.3, z, 0.08, ht, '#e9edf0', { seg: 10 }); h.ball(x, ht + 0.42, z, 0.14, '#c9a24a', NC);
  h.torus(x, ht + 0.1, z, 0.35, 0.03, [0, 0, 0], '#c9a24a', NC); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; rod(h, [x, ht + 0.1, z], [x + Math.cos(a) * 0.35, ht + 0.1, z + Math.sin(a) * 0.35], 0.015, '#c9a24a', NC); }
  const c = Math.cos(yaw), s = Math.sin(yaw), fish = (y, L, col, i) => {
    const r = L * 0.18, mx = x + c * (L / 2 + 0.15), mz = z - s * (L / 2 + 0.15);
    h.capc(mx, y - (i ? 0.1 : 0), mz, r, L, c, -0.08, -s, col, { nocol: true, pat: i < 0 ? ['rainbow', '#ffffff', TOY, 1, 1] : ['scales', col, [shade(col, 1.25), shade(col, 0.8)], 6, 2] });
    if (i >= 0) { const ex = x + c * 0.35, ez = z - s * 0.35; for (const t of [-1, 1]) { h.ball(ex - s * t * r * 0.75, y + r * 0.2, ez - c * t * r * 0.75, r * 0.32, '#ffffff', NC); h.ball(ex - s * t * r * 0.95, y + r * 0.22, ez - c * t * r * 0.95, r * 0.15, '#1b1d20', NC); } h.lump(x + c * (L + 0.4), y - 0.15, z - s * (L + 0.4), r * 0.75, r * 1.05, 0.05, col, { nocol: true, seed: 2, bump: 0.25, freq: 2, ry: yaw }); } // しっぽ
  };
  fish(ht - 0.35, 1.6, '#ffffff', -1); fish(ht - 1.15, 2.6, '#1b1d20', 0); fish(ht - 2.1, 2.1, '#d9342b', 1); fish(ht - 2.9, 1.6, '#2f6fb0', 2);
}
// のぼり旗（たての布に文字）。台は水を入れるおもり
export function nobori(h, x, z, face, text, c, fg = '#ffffff') {
  const al = face[1] !== 0;
  h.lathe(x, 0, z, [[0.001, 0], [0.22, 0], [0.22, 0.2], [0.08, 0.28], [0.001, 0.28]], '#55606b', { seg: 12 });
  h.cyl(x, 0.28, z, 0.03, 2.9, '#c9ccd0', { seg: 6 }); h.cyl(x + (al ? 0.3 : 0), 3.05, z + (al ? 0 : 0.3), 0.02, 0.7, '#c9ccd0', { nocol: true, rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] });
  h.B(x + (al ? 0.33 : 0), 0.9, z + (al ? 0 : 0.33), al ? 0.6 : 0.02, 2.15, al ? 0.02 : 0.6, c, { nocol: true, sharp: true, pat: txt(text, c, fg, 0.6 / 2.15, true, true) });
}
// ちょうちん（ふくらんだ形・上下の黒いふた・文字）
export function chochin(h, x, y, z, s, c, text, o = {}) {
  const prof = [[0.001, 0]]; for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push([s * (0.3 + 0.7 * Math.sin(t * Math.PI)) * 0.42, t * s * 1.1]); } prof.push([0.001, s * 1.1]);
  h.lathe(x, y, z, prof, c, { glow: o.glow == null ? 0.35 : o.glow, seg: 18, pat: ['artChochin|' + (text || '祭'), c, ['#1b1d20'], 1, 1], nocol: !!o.nocol });
  h.cyl(x, y - 0.05 * s, z, s * 0.14, 0.08 * s, '#1b1d20', NC); h.cyl(x, y + s * 1.07, z, s * 0.14, 0.08 * s, '#1b1d20', NC);
}
// ちょうちんを線にそってならべる（p,q = [x,y,z]、上の線の高さ）
export function lanternLine(h, p, q, n, cols, texts, s = 0.55) {
  rod(h, p, q, 0.012, '#1b1d20', NC);
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t, z = p[2] + (q[2] - p[2]) * t; rod(h, [x, y, z], [x, y - 0.15, z], 0.008, '#1b1d20', NC); chochin(h, x, y - 0.15 - s * 1.1, z, s, cols[i % cols.length], texts[i % texts.length]); }
}

/* ================= 店・部屋の作りこみ ================= */
// 商品がぎっしりのたな（両面）。al = x 向きにのびる
export function gondola(h, x, z, al, L, ht = 1.7, c = '#e8e1d2', o = {}) {
  const D = 0.9, w = al ? L : D, d = al ? D : L, cs = o.cols || TOY.concat(['#f4f4f4', '#2a3038', '#8a5a33', '#59b6d8']);
  h.B(x, 0, z, w, 0.15, d, shade(c, 0.8), { r: 0.02 }); h.B(x, 0.15, z, al ? L : 0.06, ht - 0.15, al ? 0.06 : L, c, { r: 0.01 });
  for (const s of [-1, 1]) h.B(x + (al ? s * (L / 2 - 0.03) : 0), 0.15, z + (al ? 0 : s * (L / 2 - 0.03)), al ? 0.06 : D, ht - 0.15, al ? D : 0.06, c, { r: 0.01 });
  for (let lv = 0; lv < 4; lv++) {
    const y = 0.15 + lv * (ht - 0.25) / 4;
    for (const sd of [-1, 1]) {
      const off = sd * D / 4; h.B(al ? x : x + off, y, al ? z + off : z, al ? L - 0.1 : D / 2 - 0.05, 0.04, al ? D / 2 - 0.05 : L - 0.1, shade(c, 1.05), { nocol: true, sharp: true });
      h.B(al ? x : x + sd * (D / 2 - 0.01), y + 0.02, al ? z + sd * (D / 2 - 0.01) : z, al ? L - 0.1 : 0.02, 0.07, al ? 0.02 : L - 0.1, '#f4f4f4', NC); // ねだんのふだ
      for (let t = -L / 2 + 0.12; t < L / 2 - 0.16;) {
        const iw = 0.12 + Math.floor(h.rnd() * 4) * 0.05, ih = Math.min((ht - 0.25) / 4 - 0.06, 0.14 + Math.floor(h.rnd() * 4) * 0.06), ic = pick(h, cs), u = t + iw / 2, dd = sd * (D / 4 + 0.03);
        const px = al ? x + u : x + dd, pz = al ? z + dd : z + u, k = h.rnd();
        if (k < 0.5) h.B(px, y + 0.04, pz, al ? iw : 0.3, ih, al ? 0.3 : iw, ic, { nocol: true, r: 0.02 });
        else if (k < 0.8) h.cyl(px, y + 0.04, pz, iw * 0.42, ih * 1.1, ic, { nocol: true, seg: 10 });
        else h.lump(px, y + 0.04 + ih * 0.45, pz, iw * 0.55, ih * 0.5, 0.15, ic, { nocol: true, seed: seed8(h), bump: 0.2, freq: 2 });
        t += iw + 0.03;
      }
    }
  }
  h.boxc(x, 0, z, w, ht, d);
}
// レジのカウンター（台・レジ・お金のトレー・小さなかご）。dir = お客さんの方
export function register(h, x, z, dir, L = 2.2, c = '#c98f4e') {
  const F = frame(h, x, z, dir);
  cabF(h, F, 0, 0, 0, 0.8, 0.95, L, c, '#c9ccd0', Math.max(1, Math.round(L / 0.8)), 1, { notop: true });
  F.B(0, 0, 0.95, 0.9, 0.05, L + 0.1, shade(c, 0.85), { r: 0.02 });
  F.B(-0.1, L * 0.25, 1.0, 0.45, 0.22, 0.45, '#2a3038', { r: 0.04 }); F.B(0.05, L * 0.25, 1.22, 0.06, 0.25, 0.35, '#2a3038', { r: 0.02, rot: F.ax ? [0, 0, F.ax * 0.3] : [-F.az * 0.3, 0, 0] });
  { const [px, pz] = F.at(0.1, L * 0.25); h.B(px, 1.27, pz, F.ax ? 0.02 : 0.28, 0.16, F.ax ? 0.28 : 0.02, '#5fe0a0', { nocol: true, glow: 0.6 }); }
  F.B(0.15, -L * 0.1, 1.0, 0.3, 0.03, 0.3, '#2f6fb0', { r: 0.01 });
  for (let i = 0; i < 3; i++) { const [px, pz] = F.at(0.1, -L * 0.35 + i * 0.12); h.lathe(px, 1.0, pz, [[0.001, 0], [0.06, 0], [0.08, 0.2], [0.001, 0.18]], pick(h, TOY), { seg: 8, nocol: true }); }
}
// つりさげ（台所のなべ・おたま／作業場の工具）。(x,y,z) = バーの中心、al = x 向きのバー
export function hangRail(h, x, y, z, al, L, kind = 'kitchen') {
  h.cyl(x, y, z, 0.025, L, '#9aa1a8', { nocol: true, rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] });
  const n = Math.max(3, Math.round(L / 0.35));
  for (let i = 0; i < n; i++) {
    const u = -L / 2 + (i + 0.5) * L / n, px = al ? x + u : x, pz = al ? z : z + u, k = h.rnd();
    rod(h, [px, y, pz], [px, y - 0.12, pz], 0.01, '#55606b', NC);
    if (kind === 'kitchen') {
      if (k < 0.4) { const r = 0.14 + h.rnd() * 0.1; h.cyl(px, y - 0.12 - r, pz, r, 0.05, pick(h, ['#2a3038', '#c9573f', '#c9ccd0']), { nocol: true, rot: al ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] }); rod(h, [px, y - 0.12, pz], [px, y - 0.12 - r * 0.2, pz], 0.02, '#2a3038', NC); }
      else if (k < 0.7) { rod(h, [px, y - 0.12, pz], [px, y - 0.5, pz], 0.012, '#c9ccd0', NC); h.ball(px, y - 0.55, pz, 0.07, '#c9ccd0', NC); }
      else { rod(h, [px, y - 0.12, pz], [px, y - 0.4, pz], 0.015, '#8a5a33', NC); h.B(px, y - 0.62, pz, al ? 0.1 : 0.02, 0.22, al ? 0.02 : 0.1, '#c9ccd0', NC); }
    } else {
      if (k < 0.35) { rod(h, [px, y - 0.12, pz], [px, y - 0.45, pz], 0.022, '#c98f4e', NC); h.B(px, y - 0.12, pz, al ? 0.2 : 0.07, 0.07, al ? 0.07 : 0.2, '#55606b', NC); }
      else if (k < 0.65) { rod(h, [px, y - 0.12, pz], [px, y - 0.42, pz], 0.025, '#c9ccd0', NC); h.torus(px, y - 0.48, pz, 0.06, 0.02, al ? [0, 0, 0] : [0, Math.PI / 2, 0], '#c9ccd0', NC); }
      else h.torus(px, y - 0.3, pz, 0.16, 0.035, al ? [0, 0, 0] : [0, Math.PI / 2, 0], pick(h, ['#f0d040', '#e0413a', '#2a3038']), NC); // まいたコード
    }
  }
}
// 有孔ボードと工具（壁にかける。工具が少し出ているので、でこぼこ）。(x,z)=かべの面の点、(nx,nz)=外向き
export function pegboard(h, x, y0, z, nx, nz, w, ht) {
  const al = nz !== 0; h.B(x + nx * 0.03, y0, z + nz * 0.03, al ? w : 0.06, ht, al ? 0.06 : w, '#c8a878', { sharp: true, sink: true, pat: ['pegboard', '#c8a878', 0, Math.round(w * 3), Math.round(ht * 3)] });
  const P = (u, y, d) => [al ? x + u : x + nx * d, y, al ? z + nz * d : z + u];
  for (let i = 0; i < Math.round(w * 2.4); i++) {
    const u = (i + 0.5) / Math.round(w * 2.4) * w - w / 2, y = y0 + 0.25 + h.rnd() * (ht - 0.6), k = Math.floor(h.rnd() * 5);
    if (k === 0) { rod(h, P(u, y - 0.32, 0.12), P(u, y, 0.12), 0.025, '#c98f4e', NC); h.B(...P(u, y, 0.12), al ? 0.22 : 0.08, 0.08, al ? 0.08 : 0.22, '#55606b', { r: 0.02, nocol: true }); } // かなづち
    else if (k === 1) { rod(h, P(u, y - 0.3, 0.1), P(u, y, 0.1), 0.02, '#c9ccd0', NC); h.torus(...P(u, y + 0.06, 0.1), 0.06, 0.02, al ? [0, 0, 0] : [0, Math.PI / 2, 0], '#c9ccd0', NC); } // スパナ
    else if (k === 2) { h.B(...P(u, y - 0.3, 0.09), al ? 0.32 : 0.02, 0.18, al ? 0.02 : 0.32, '#c9ccd0', { nocol: true }); h.B(...P(u + 0.2, y - 0.3, 0.09), al ? 0.1 : 0.06, 0.18, al ? 0.06 : 0.1, '#e0413a', { nocol: true, r: 0.02 }); } // のこぎり
    else if (k === 3) { for (let j = 0; j < 3; j++) { rod(h, P(u + (j - 1) * 0.08, y - 0.25, 0.1), P(u + (j - 1) * 0.08, y - 0.05, 0.1), 0.012, '#c9ccd0', NC); h.cyl(...P(u + (j - 1) * 0.08, y - 0.05, 0.1), 0.03, 0.12, pick(h, TOY), { nocol: true, seg: 8 }); } } // ドライバー
    else h.torus(...P(u, y - 0.1, 0.12), 0.16, 0.04, al ? [0, 0, 0] : [0, Math.PI / 2, 0], pick(h, ['#f0d040', '#e0413a', '#2f6fb0']), NC); // まいたロープ
  }
}
// 作業台（板・万力・下のたな・工具箱）。dir = 人が立つ方
export function workbench(h, x, z, dir, L = 2.4) {
  const F = frame(h, x, z, dir), D = 0.9, wd = '#b08a5a';
  F.B(0, 0, 0.85, D, 0.08, L, wd, { r: 0.02, pat: ['grain', wd, 0, 3, 1] });
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) F.B(sa * (D / 2 - 0.08), sb * (L / 2 - 0.08), 0, 0.1, 0.85, 0.1, '#55606b', { r: 0.01 });
  F.B(0, 0, 0.2, D - 0.1, 0.05, L - 0.1, shade(wd, 0.85), { r: 0.01 });
  F.B(D / 2 - 0.1, L / 2 - 0.35, 0.93, 0.2, 0.14, 0.3, '#2f6fb0', { r: 0.02 }); // 万力
  F.B(0, -L / 4, 0.25, 0.45, 0.3, 0.6, '#e0413a', { r: 0.03 }); F.B(0, -L / 4, 0.55, 0.06, 0.12, 0.4, '#2a3038', NC); // 工具箱
  for (let i = 0; i < 3; i++) F.B(0.1 - h.rnd() * 0.3, -L / 3 + i * 0.4 + h.rnd() * 0.2, 0.93, 0.12 + h.rnd() * 0.15, 0.04 + h.rnd() * 0.06, 0.15 + h.rnd() * 0.2, pick(h, ['#c9ccd0', '#f0d040', '#e0413a', '#8a5a33']), { nocol: true, r: 0.01 });
}
// 赤い工具ワゴン（引き出しがたくさん・キャスター）
export function toolchest(h, x, z, dir, c = '#d9342b') {
  const F = frame(h, x, z, dir); cabF(h, F, 0, 0, 0.12, 0.6, 1.0, 0.9, c, '#c9ccd0', 1, 6);
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) { const [px, pz] = F.at(sa * 0.22, sb * 0.36); h.ball(px, 0.06, pz, 0.06, '#2a3038', NC); }
  F.B(0, 0, 1.12, 0.62, 0.04, 0.92, '#2a3038', { r: 0.01 });
}
// UFOキャッチャー（台・ガラスの箱・中にぬいぐるみの山・つめ・光るふち）。dir = 前
export function crane(h, x, z, dir, c) {
  const F = frame(h, x, z, dir), W = 1.2, D = 1.1;
  cabF(h, F, 0, 0, 0, D, 0.95, W, c, '#f4f4f4', 1, 1);
  F.B(D / 2 - 0.1, 0, 0.95, 0.25, 0.08, W, shade(c, 0.8), { r: 0.02 });
  { const [px, pz] = F.at(D / 2 + 0.03, -0.3); h.cyl(px, 0.95, pz, 0.05, 0.12, '#2a3038', { nocol: true }); h.ball(px, 1.1, pz, 0.06, '#e0413a', NC); }
  for (let i = 0; i < 9; i++) { const [px, pz] = F.at((h.rnd() - 0.5) * (D - 0.35), (h.rnd() - 0.5) * (W - 0.35)), cc = pick(h, PASTEL.concat(TOY)); h.lump(px, 1.06 + (i > 5 ? 0.15 : 0), pz, 0.15, 0.12, 0.15, cc, { nocol: true, seed: seed8(h), bump: 0.15, freq: 2 }); h.ball(px, 1.2 + (i > 5 ? 0.15 : 0), pz, 0.09, cc, NC); }
  const [cx, cz] = F.at(0, 0);
  glassBox(h, cx, 1.03, cz, F.ax ? D - 0.06 : W - 0.06, 1.1, F.ax ? W - 0.06 : D - 0.06);
  for (const sa of [-1, 1]) for (const sb of [-1, 1]) { const [px, pz] = F.at(sa * (D / 2 - 0.04), sb * (W / 2 - 0.04)); h.cyl(px, 0.95, pz, 0.04, 1.2, shade(c, 0.85), { seg: 8 }); }
  h.B(cx, 2.13, cz, F.ax ? D : W, 0.3, F.ax ? W : D, c, { r: 0.05, glow: 0.4 });
  F.B(D / 2 + 0.01, 0, 2.16, 0.02, 0.22, W - 0.1, '#fff4c2', { nocol: true, pat: txt('GAME', '#fff4c2', '#e0413a', W / 0.22, false, false), glow: 0.6 });
  rod(h, [cx, 2.13, cz], [cx, 1.75, cz], 0.012, '#c9ccd0', NC); for (let i = 0; i < 3; i++) { const a = i * 2.09; rod(h, [cx, 1.75, cz], [cx + Math.cos(a) * 0.1, 1.6, cz + Math.sin(a) * 0.1], 0.015, '#c9a24a', NC); }
}
// モニターのかべ（制御室）。(x,z) = かべの面の点、(nx,nz) = 外向き
export function monitorWall(h, x, y0, z, nx, nz, cols, rows) {
  const al = nz !== 0, w = 0.9, ht = 0.6;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const u = (i - (cols - 1) / 2) * (w + 0.06), y = y0 + j * (ht + 0.06), px = al ? x + u : x + nx * 0.06, pz = al ? z + nz * 0.06 : z + u;
    h.B(px, y, pz, al ? w : 0.12, ht, al ? 0.12 : w, '#15171a', { r: 0.02 });
    h.B(al ? px : px + nx * 0.065, y + 0.04, al ? pz + nz * 0.065 : pz, al ? w - 0.08 : 0.01, ht - 0.08, al ? 0.01 : w - 0.08, '#0d1a24', { nocol: true, glow: 0.7, pat: ['artScreen|' + ((i + j * 3) % 4), '#0d1a24', ['#3dff9a'], 1, 1] });
  }
}
// トロフィーのたな
export function trophies(h, x, z, dir, L = 2) {
  const F = frame(h, x, z, dir);
  cabF(h, F, 0, 0, 0, 0.5, 0.8, L, '#6b4a2b', '#c9a24a', Math.max(1, Math.round(L / 0.7)), 1);
  for (let lv = 0; lv < 2; lv++) {
    if (lv) F.B(0, 0, 1.55, 0.45, 0.05, L, '#6b4a2b', { r: 0.01 });
    for (let i = 0; i < Math.round(L / 0.45); i++) {
      const [px, pz] = F.at(0, -L / 2 + 0.25 + i * 0.45), y = lv ? 1.6 : 0.8, s = 0.6 + h.rnd() * 0.5, c = pick(h, ['#d9b440', '#c9ccd0', '#c98a50']);
      h.cyl(px, y, pz, 0.08, 0.08, '#2a3038', { seg: 10 }); h.cyl(px, y + 0.08, pz, 0.025, 0.15 * s, c, { seg: 8 });
      h.lathe(px, y + 0.08 + 0.15 * s, pz, [[0.001, 0], [0.04, 0], [0.14 * s, 0.12 * s], [0.15 * s, 0.25 * s], [0.13 * s, 0.25 * s], [0.001, 0.05]], c, { seg: 14, rough: 0.25 });
    }
  }
  for (const s of [-1, 1]) F.B(0, s * (L / 2 - 0.03), 0.8, 0.45, 0.85, 0.05, '#6b4a2b', { r: 0.01 });
}

/* ================= でこぼこの隠れ場所（KIT：マップのあちこちに置く物） ================= */
function daruma(h, x, y, z, r, c, yaw) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  h.lump(x, y + r * 1.1, z, r, r * 1.12, r * 0.96, c, { seed: 3, bump: 0.035, freq: 1.2, core: 0.95 });
  h.lump(x + fx * r * 0.62, y + r * 1.32, z + fz * r * 0.62, r * 0.55, r * 0.46, r * 0.32, '#fbf6ea', { seed: 1, bump: 0.02, freq: 1, nocol: true, ry: yaw });
  const rx = fz, rz = -fx;
  for (const t of [-1, 1]) { h.ball(x + fx * r * 0.86 + rx * t * r * 0.2, y + r * 1.4, z + fz * r * 0.86 + rz * t * r * 0.2, r * 0.09, '#fbf6ea', NC); if (t < 0) h.ball(x + fx * r * 0.9 + rx * t * r * 0.2, y + r * 1.4, z + fz * r * 0.9 + rz * t * r * 0.2, r * 0.06, '#1b1d20', NC); }
  h.lump(x + fx * r * 0.9, y + r * 1.16, z + fz * r * 0.9, r * 0.24, r * 0.05, r * 0.06, '#1b1d20', { seed: 2, bump: 0.2, freq: 2, nocol: true, ry: yaw }); // ひげ
  h.lump(x + fx * r * 0.8, y + r * 0.62, z + fz * r * 0.8, r * 0.42, r * 0.22, r * 0.12, '#e8c050', { seed: 4, bump: 0.1, freq: 2, nocol: true, ry: yaw }); // おなかの金の模様
}
function penguin(h, x, z, s, yaw, c = '#1f2a3a') {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
  h.lump(x, 0.55 * s, z, 0.38 * s, 0.55 * s, 0.34 * s, c, { seed: 5, bump: 0.05, freq: 1.3, core: 0.94, ry: yaw, pat: ['fabric', c, 0, 1, 1] });
  h.lump(x + fx * 0.13 * s, 0.5 * s, z + fz * 0.13 * s, 0.28 * s, 0.42 * s, 0.25 * s, '#fbf6ea', { seed: 2, bump: 0.04, freq: 1, nocol: true, ry: yaw });
  h.ball(x, 1.05 * s, z, 0.25 * s, c, { pat: ['fabric', c, 0, 1, 1] });
  for (const t of [-1, 1]) { h.ball(x + fx * 0.2 * s + rx * t * 0.09 * s, 1.1 * s, z + fz * 0.2 * s + rz * t * 0.09 * s, 0.05 * s, '#fbf6ea', NC); h.ball(x + fx * 0.23 * s + rx * t * 0.09 * s, 1.1 * s, z + fz * 0.23 * s + rz * t * 0.09 * s, 0.025 * s, '#1b1d20', NC); h.lump(x + rx * t * 0.36 * s, 0.6 * s, z + rz * t * 0.36 * s, 0.07 * s, 0.26 * s, 0.13 * s, c, { seed: 3, bump: 0.05, freq: 1, nocol: true, ry: yaw }); h.lump(x + fx * 0.14 * s + rx * t * 0.12 * s, 0.04 * s, z + fz * 0.14 * s + rz * t * 0.12 * s, 0.1 * s, 0.04 * s, 0.14 * s, '#f0a030', { seed: 1, bump: 0.05, freq: 1, nocol: true, ry: yaw }); }
  h.lump(x + fx * 0.27 * s, 1.0 * s, z + fz * 0.27 * s, 0.07 * s, 0.05 * s, 0.1 * s, '#f0a030', { seed: 1, bump: 0.02, freq: 1, nocol: true, ry: yaw });
}
function maneki(h, x, z, s, yaw, c = '#fbf6ea') {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
  h.B(x, 0, z, 0.9 * s, 0.14 * s, 0.9 * s, '#c9302a', { r: 0.06, pat: ['fabric', '#c9302a', 0, 1, 1] });
  h.lump(x, 0.14 * s + 0.42 * s, z, 0.38 * s, 0.44 * s, 0.34 * s, c, { seed: 6, bump: 0.04, freq: 1.2, core: 0.94 });
  h.ball(x + fx * 0.04 * s, 1.15 * s, z + fz * 0.04 * s, 0.3 * s, c);
  for (const t of [-1, 1]) { h.cone(x + rx * t * 0.17 * s, 1.36 * s, z + rz * t * 0.17 * s, 0.09 * s, 0.15 * s, c, { seg: 6, nocol: true }); h.lump(x + fx * 0.26 * s + rx * t * 0.1 * s, 1.2 * s, z + fz * 0.26 * s + rz * t * 0.1 * s, 0.035 * s, 0.05 * s, 0.02 * s, '#1b1d20', { seed: 1, bump: 0.01, freq: 1, nocol: true, ry: yaw }); }
  h.ball(x + fx * 0.3 * s, 1.08 * s, z + fz * 0.3 * s, 0.03 * s, '#e0719a', NC);
  h.torus(x, 0.92 * s, z, 0.24 * s, 0.04 * s, [Math.PI / 2, 0, 0], '#d9342b', NC); h.ball(x + fx * 0.26 * s, 0.86 * s, z + fz * 0.26 * s, 0.08 * s, '#e0b030', NC);
  rod(h, [x + rx * 0.3 * s, 0.85 * s, z + rz * 0.3 * s], [x + rx * 0.38 * s + fx * 0.08 * s, 1.4 * s, z + rz * 0.38 * s + fz * 0.08 * s], 0.09 * s, c); // あげた手
  h.lump(x + fx * 0.18 * s, 0.3 * s, z + fz * 0.18 * s, 0.24 * s, 0.14 * s, 0.1 * s, '#e0b030', { seed: 2, bump: 0.05, freq: 1, nocol: true, ry: yaw }); // 小判
}
function tanuki(h, x, z, s, yaw) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx, c = '#8a6a48', o = { pat: ['noise', c, 0, 1, 1] };
  h.lump(x, 0.62 * s, z, 0.48 * s, 0.6 * s, 0.44 * s, c, { seed: 7, bump: 0.05, freq: 1.4, core: 0.94, ...o });
  h.lump(x + fx * 0.22 * s, 0.55 * s, z + fz * 0.22 * s, 0.36 * s, 0.38 * s, 0.3 * s, '#e8d8b8', { seed: 2, bump: 0.02, freq: 1, nocol: true });
  h.ball(x, 1.42 * s, z, 0.32 * s, c, o);
  for (const t of [-1, 1]) { h.ball(x + fx * 0.22 * s + rx * t * 0.12 * s, 1.45 * s, z + fz * 0.22 * s + rz * t * 0.12 * s, 0.09 * s, '#3a2a1c', NC); h.ball(x + fx * 0.28 * s + rx * t * 0.12 * s, 1.46 * s, z + fz * 0.28 * s + rz * t * 0.12 * s, 0.04 * s, '#fbf6ea', NC); h.lump(x + fx * 0.15 * s + rx * t * 0.22 * s, 0.1 * s, z + fz * 0.15 * s + rz * t * 0.22 * s, 0.14 * s, 0.1 * s, 0.18 * s, c, { seed: 1, bump: 0.05, freq: 1, nocol: true, ry: yaw }); }
  h.ball(x + fx * 0.32 * s, 1.36 * s, z + fz * 0.32 * s, 0.07 * s, '#3a2a1c', NC);
  h.cyl(x, 1.62 * s, z, 0.48 * s, 0.05 * s, '#c9a26b', { nocol: true }); h.cone(x, 1.66 * s, z, 0.3 * s, 0.3 * s, '#c9a26b', NC); // かさ
  const bx = x + rx * 0.42 * s + fx * 0.12 * s, bz = z + rz * 0.42 * s + fz * 0.12 * s; h.lathe(bx, 0.35 * s, bz, [[0.001, 0], [0.13 * s, 0], [0.16 * s, 0.18 * s], [0.07 * s, 0.38 * s], [0.05 * s, 0.45 * s], [0.001, 0.45 * s]], '#7a4a2a', { seg: 12 }); // とっくり
}
function snowman(h, x, z, s, yaw) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx, w = '#f6fafc', o = { pat: ['frost', w, 0, 1, 1] };
  h.lump(x, 0.42 * s, z, 0.48 * s, 0.42 * s, 0.48 * s, w, { seed: 1, bump: 0.05, freq: 1.4, core: 0.94, ...o });
  h.lump(x, 1.08 * s, z, 0.34 * s, 0.3 * s, 0.34 * s, w, { seed: 2, bump: 0.05, freq: 1.4, core: 0.94, ...o });
  h.lathe(x, 1.32 * s, z, [[0.001, 0], [0.22 * s, 0], [0.18 * s, 0.24 * s], [0.001, 0.24 * s]], pick(h, ['#2f6fb0', '#e0413a', '#3f9b6a']), { seg: 14 }); // バケツの帽子
  for (const t of [-1, 1]) { h.ball(x + fx * 0.3 * s + rx * t * 0.1 * s, 1.15 * s, z + fz * 0.3 * s + rz * t * 0.1 * s, 0.035 * s, '#1b1d20', NC); rod(h, [x + rx * t * 0.3 * s, 1.0 * s, z + rz * t * 0.3 * s], [x + rx * t * 0.65 * s, 1.25 * s, z + rz * t * 0.65 * s], 0.025 * s, '#6b4a2b', NC); }
  h.capc(x + fx * 0.38 * s, 1.07 * s, z + fz * 0.38 * s, 0.03 * s, 0.14 * s, fx, 0, fz, '#f08a3c', NC);
  h.torus(x, 0.8 * s, z, 0.3 * s, 0.06 * s, [Math.PI / 2, 0, 0], pick(h, ['#e0413a', '#2f6fb0', '#f0d040']), NC);
}
function balloon(h, x, y, z, r, c, o = {}) {
  h.lump(x, y, z, r, r * 1.15, r, c, { seed: 1, bump: 0.02, freq: 1, core: 0.95, rough: 0.25, pat: o.pat });
  h.cone(x, y - r * 1.15 - 0.07, z, 0.06, 0.09, c, { nocol: true, seg: 8 });
}
export const PROPS_KIT = {
  // 石垣（でこぼこの石がびっしり。石と石のあいだのくぼみに体をよせて、石の色に塗る）
  stonewall(h, x, z, pal) {
    const al = h.rnd() < 0.5, L = 3.6 + h.rnd() * 1.6, ht = 1.4 + h.rnd() * 1.0, T = 0.55, cs = ['#9a9890', '#8a8478', '#a8a296', '#7a776f', '#b0a890'].concat(pal.slice(0, 2));
    h.B(x, 0, z, al ? L : T, ht, al ? T : L, '#6f6b62', { r: 0.04, sink: true });
    for (const sd of [-1, 1]) for (let y = 0.22; y < ht - 0.1; y += 0.42) for (let u = -L / 2 + 0.3 + (Math.round(y / 0.42) % 2) * 0.28; u < L / 2 - 0.2; u += 0.55 + h.rnd() * 0.25) {
      const sx = 0.24 + h.rnd() * 0.12, sy = 0.18 + h.rnd() * 0.05, c = pick(h, cs), off = sd * (T / 2 + 0.02);
      h.lump(al ? x + u : x + off, y, al ? z + off : z + u, al ? sx : 0.14, sy, al ? 0.14 : sx, c, { seed: seed8(h), bump: 0.25, freq: 2.2, core: 0.85, pat: ['rockface', c, [shade(c, 0.88), shade(c, 1.1)], 1, 1] });
    }
    for (let u = -L / 2 + 0.3; u < L / 2; u += 0.6) { const c = pick(h, cs); h.lump(al ? x + u : x, ht + 0.1, al ? z : z + u, al ? 0.3 : 0.32, 0.16, al ? 0.32 : 0.3, c, { seed: seed8(h), bump: 0.2, freq: 2, core: 0.88 }); }
  },
  // 土のうの山（L字・コの字にならべる。ふくろのでこぼこにまぎれる）
  sandbags(h, x, z) {
    const al = h.rnd() < 0.5, L = 2.6 + h.rnd() * 1.2, rows = 3 + Math.floor(h.rnd() * 2), cs = ['#b8a070', '#a89060', '#c8b080', '#9a8a68'];
    const seg = (cx, cz, sal, len) => { for (let r = 0; r < rows; r++) for (let u = -len / 2 + 0.3 + (r % 2) * 0.25; u <= len / 2 - 0.25; u += 0.52) { const c = pick(h, cs); h.lump(sal ? cx + u : cx, 0.12 + r * 0.22, sal ? cz : cz + u, sal ? 0.3 : 0.2, 0.13, sal ? 0.2 : 0.3, c, { seed: seed8(h), bump: 0.12, freq: 1.6, core: 0.92, pat: ['noise', c, 0, 1, 1] }); } };
    seg(x, z, al, L);
    if (h.rnd() < 0.7) { const e = h.rnd() < 0.5 ? 1 : -1, L2 = 1.6 + h.rnd(); seg(al ? x + e * L / 2 : x + 0.5 + L2 / 2 - 0.3, al ? z + 0.5 + L2 / 2 - 0.3 : z + e * L / 2, !al, L2); }
  },
  // 風船（床においた大きな風船と、ひもでつながってうかぶ風船。体と同じくらいの大きさ）
  balloons(h, x, z, pal, acc, o = {}) {
    const cs = TOY.concat(PASTEL), n = o.n || 6 + Math.floor(h.rnd() * 5), sp = o.r || 1.3;
    for (let i = 0; i < n; i++) {
      const a = h.rnd() * 6.28, d = Math.sqrt(h.rnd()) * sp, r = 0.25 + h.rnd() * 0.3 * Math.min(1, sp), c = pick(h, cs), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, fl = i % 3 === 2;
      const y = fl ? 1.4 + h.rnd() * 1.2 : r * 1.15 + 0.06, pat = h.rnd() < 0.25 ? ['dots', c, '#ffffff', 2, 2] : undefined;
      balloon(h, px, y, pz, r, c, { pat });
      if (fl) { rod(h, [px, y - r * 1.15 - 0.08, pz], [px + 0.1, 0.1, pz + 0.05], 0.008, '#f4f4f4', NC); h.cyl(px + 0.1, 0, pz + 0.05, 0.09, 0.1, '#55606b', { seg: 10 }); }
    }
  },
  // だるま（大きさのちがうだるまをならべる。丸い体を赤くぬって、まぎれる）
  darumas(h, x, z, pal, acc, o = {}) {
    const yaw = pick(h, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), n = o.n || 3 + Math.floor(h.rnd() * 4), cs = ['#d9302a', '#d9302a', '#d9302a', '#f4f4f4', '#e0b030', '#2f6fb0'];
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
    if (o.steps != null ? o.steps : h.rnd() < 0.5) { // ひな壇にならべる
      for (let k = 0; k < 3; k++) { const dd = -k * 0.55; h.B(x + fx * dd, 0, z + fz * dd, Math.abs(rx) * 3 + Math.abs(fx) * 0.55, (k + 1) * 0.3, Math.abs(rz) * 3 + Math.abs(fz) * 0.55, '#c9302a', { r: 0.02, pat: ['fabric', '#c9302a', 0, 2, 1] }); for (let i = 0; i < 3 - (k === 2 ? 1 : 0); i++) { const u = (i - (k === 2 ? 0.5 : 1)) * 0.9, r = 0.18 + h.rnd() * 0.1; daruma(h, x + fx * dd + rx * u, (k + 1) * 0.3, z + fz * dd + rz * u, r, pick(h, cs), yaw); } }
    }
    const fo = o.steps === false ? 0 : 0.9; for (let i = 0; i < n; i++) { const u = (i - (n - 1) / 2) * 0.95, r = 0.25 + h.rnd() * 0.3; daruma(h, x + rx * u + fx * fo, 0, z + rz * u + fz * fo, r, pick(h, cs), yaw); }
  },
  // 招き猫・たぬきの置物（大きいのと小さいの。台に乗ってとなりでポーズ）
  lucky(h, x, z) {
    const yaw = pick(h, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    for (let i = 0; i < 3; i++) { const u = (i - 1) * 1.1, s = 0.6 + h.rnd() * 0.7, px = x + rx * u, pz = z + rz * u; if (h.rnd() < 0.5) maneki(h, px, pz, s, yaw, pick(h, ['#fbf6ea', '#fbf6ea', '#2a2a2a', '#e0b030'])); else tanuki(h, px, pz, s, yaw); }
  },
  // 雪だるま（冷凍庫・冬の場所）
  snowmen(h, x, z) { const n = 2 + Math.floor(h.rnd() * 3), yaw = h.rnd() * 6.28; for (let i = 0; i < n; i++) snowman(h, x + (i - (n - 1) / 2) * 1.0, z + (h.rnd() - 0.5) * 0.6, 0.7 + h.rnd() * 0.6, yaw + (h.rnd() - 0.5) * 0.6); },
  // ペンギンのぬいぐるみ（大小いろいろ。ぬいぐるみのふりをする）
  penguins(h, x, z, pal, acc, o = {}) { const n = 3 + Math.floor(h.rnd() * 4), yaw = h.rnd() * 6.28, sp = o.r || 1; for (let i = 0; i < n; i++) { const a = i / n * 6.28 + h.rnd() * 0.5, d = i ? (0.6 + h.rnd() * 0.5) * sp : 0; penguin(h, x + Math.cos(a) * d, z + Math.sin(a) * d, 0.5 + h.rnd() * 0.8, yaw + (h.rnd() - 0.5) * 0.8, pick(h, ['#1f2a3a', '#1f2a3a', '#3a4a6a', '#5a6a8a'])); } },
  // ちょうちんの列（2本の柱のあいだ）
  lanternK(h, x, z, pal, acc) {
    const al = h.rnd() < 0.5, L = 3.2 + h.rnd() * 1.2, P = a => (al ? [x + a, z] : [x, z + a]);
    for (const s of [-1, 1]) { const [px, pz] = P(s * L / 2); h.cyl(px, 0, pz, 0.07, 2.9, '#6b4a2b', { seg: 10 }); }
    const [ax, az] = P(-L / 2), [bx, bz] = P(L / 2), n = Math.round(L / 0.65);
    lanternLine(h, [ax, 2.75, az], [bx, 2.75, bz], n, ['#d9302a', '#f4f0e0', '#d9302a', '#e0b030'], ['祭', 'まつり', 'ゆ', '福', 'お茶', 'だんご'], 0.5);
    for (let i = 0; i < 2; i++) { const [px, pz] = P((i - 0.5) * L * 0.5); chochin(h, px + (al ? 0 : 0.6), 0, pz + (al ? 0.6 : 0), 1.0 + h.rnd() * 0.3, pick(h, ['#d9302a', '#f4f0e0']), pick(h, ['祭', '福', 'ゆ']), { glow: 0.25 }); } // 地面においた大きなちょうちん
  },
  // 配管の壁（たて・よこのパイプ・バルブ・メーター。パイプのあいだのでこぼこにまぎれる）
  pipewall(h, x, z, pal, acc, o = {}) {
    const al = o.al != null ? o.al : h.rnd() < 0.5, L = o.L || 3.6 + h.rnd() * 1.4, ht = 2.8, sd = o.sd || (h.rnd() < 0.5 ? 1 : -1), wc = pick(h, ['#8d8f94', '#70757b', '#9aa1a8']);
    h.B(x, 0, z, al ? L : 0.3, ht, al ? 0.3 : L, wc, { sink: true, pat: ['panel', wc, 0, 2, 2] });
    const cs = ['#c9ccd0', '#e0c030', '#3f9b6a', '#d9342b', '#2f6fb0'], P = (u, d) => (al ? [x + u, z + sd * d] : [x + sd * d, z + u]);
    const ys = [0.35, 0.9 + h.rnd() * 0.3, 1.7 + h.rnd() * 0.3, 2.4];
    ys.forEach((y, i) => { const r = 0.09 + h.rnd() * 0.08, c = cs[i % cs.length], [px, pz] = P(0, 0.15 + r); h.cyl(px, y, pz, r, L - 0.2, c, { rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] }); for (let u = -L / 2 + 0.5; u < L / 2; u += 1.2) { const [fx, fz] = P(u, 0.15 + r); h.torus(fx, y, fz, r + 0.02, 0.03, al ? [0, Math.PI / 2, 0] : [0, 0, 0], shade(c, 0.8), NC); } });
    for (let i = 0; i < 2 + Math.floor(h.rnd() * 2); i++) { const u = -L / 2 + 0.5 + h.rnd() * (L - 1), r = 0.08 + h.rnd() * 0.07, c = pick(h, cs), [px, pz] = P(u, 0.48 + r); h.cyl(px, 0, pz, r, ht - 0.1, c, { seg: 14 }); h.ball(px, ht - 0.1, pz, r * 1.1, c, NC); }
    for (let i = 0; i < 3; i++) { const u = -L / 2 + 0.6 + h.rnd() * (L - 1.2), y = ys[1 + i % 2]; const [px, pz] = P(u, 0.55); h.torus(px, y, pz, 0.16, 0.03, al ? [0, 0, 0] : [0, Math.PI / 2, 0], '#d9342b', NC); const [sx, sz] = P(u, 0.2); rod(h, [sx, y, sz], [px, y, pz], 0.025, '#8d8f94', NC); } // バルブ
    for (let i = 0; i < 2; i++) { const u = -L / 2 + 0.8 + h.rnd() * (L - 1.6), [px, pz] = P(u, 0.2); h.cyl(px, 1.35, pz, 0.15, 0.07, '#f4f4f4', { nocol: true, rot: al ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] }); h.torus(px, 1.35, pz, 0.15, 0.025, al ? [0, 0, 0] : [0, Math.PI / 2, 0], '#2a3038', NC); } // メーター
  },
  // 有孔ボードと工具・作業台
  workK(h, x, z) { const dir = pick(h, DIRS), F = frame(h, x, z, dir); const [px, pz] = F.at(-0.59, 0); pegboard(h, px, 1.0, pz, dir[0], dir[1], 2.4, 1.4); F.B(-0.65, 0, 0, 0.12, 2.5, 2.6, '#8d8f94', { r: 0.02 }); workbench(h, ...F.at(-0.05, 0), dir, 2.4); },
  // 土管の山（空き地の3本づみ。下の2本は中を通れる、上に乗れる）
  dokan(h, x, z) {
    const al = h.rnd() < 0.5, R = 0.95, L = 2.8 + h.rnd() * 0.5, c = pick(h, ['#b9bab4', '#a8a9a3', '#c4c1b6']), o = { pat: ['noise', c, 0, 3, 2] }, g = R + 0.03;
    tubeAt(h, al ? x : x - g, 0, al ? z - g : z, R, R - 0.12, L, al, c, o);
    tubeAt(h, al ? x : x + g, 0, al ? z + g : z, R, R - 0.12, L, al, c, o);
    tubeAt(h, x + (al ? 0.25 : 0), Math.sqrt(3) * g - 0.02, z + (al ? 0 : 0.25), R, R - 0.12, L, al, c, o);
    for (let i = 0; i < 5; i++) { const a = h.rnd() * 6.28, d = 2.1 + h.rnd() * 0.6; h.lump(x + Math.cos(a) * d, 0.2, z + Math.sin(a) * d, 0.35, 0.3, 0.35, '#6fae4a', { core: 0.9, seed: seed8(h), bump: 0.3, freq: 4, pat: ['leaf', '#6fae4a', ['#8fc85a', '#4f8a32'], 1, 1] }); }
  },
  // 立てた土管（上からとびこむと中に入れる）と、ねかせた土管
  dokanStand(h, x, z) {
    const c = pick(h, ['#b9bab4', '#a8a9a3', '#c4c1b6']), o = { pat: ['noise', c, 0, 3, 2] };
    standPipe(h, x - 0.7, z, 0.82, 1.0 + h.rnd() * 0.4, c, o); standPipe(h, x + 1.1, z - 0.5, 0.7, 0.7 + h.rnd() * 0.3, c, o);
    tubeAt(h, x + 0.3, 0, z + 1.4, 0.75, 0.63, 2.2, true, c, o);
  },
  // 鉄パイプのたな（細いパイプがたくさん。すき間とでこぼこ）
  pipeRack(h, x, z, pal, acc, o = {}) {
    const al = o.al != null ? o.al : h.rnd() < 0.5, L = 3.4, P = (a, b) => (al ? [x + a, z + b] : [x + b, z + a]);
    for (const s of [-1, 1]) for (const t of [-1, 1]) { const [px, pz] = P(s * (L / 2 - 0.3), t * 0.45); h.cyl(px, 0, pz, 0.05, 1.9, '#2f6fb0', { seg: 8 }); }
    for (const y of [0.55, 1.25]) for (const s of [-1, 1]) { const [px, pz] = P(s * (L / 2 - 0.3), 0); h.B(px, y - 0.06, pz, al ? 0.1 : 1.0, 0.06, al ? 1.0 : 0.1, '#2f6fb0', NC); }
    for (const y of [0.55, 1.25]) for (let i = 0; i < 9; i++) { const r = 0.05 + h.rnd() * 0.06, [px, pz] = P((h.rnd() - 0.5) * 0.3, -0.4 + i * 0.1); h.cyl(px, y + r, pz, r, L + h.rnd() * 0.6, pick(h, ['#c9ccd0', '#8d8f94', '#e0c030', '#d9342b']), { seg: 10, rot: al ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] }); }
  },
  // 旗ざお（なびく旗）
  flagK(h, x, z, pal, acc) { const d = pick(h, ['stripe', 'band', 'star', 'diag', 'fish', 'emblem']), cs = [pick(h, acc), pick(h, TOY), pick(h, pal), '#ffffff']; flagpole(h, x, z, 4.5 + h.rnd() * 1.5, d, cs, { yaw: h.rnd() * 6.28, bg: pick(h, ['#ffffff', pick(h, acc)]), text: pick(h, ['★', '祭', '大漁', 'GO']) }); },
  // 三角旗のガーランドを2本の柱のあいだに
  buntingK(h, x, z, pal, acc) {
    const al = h.rnd() < 0.5, L = 4 + h.rnd() * 2, P = a => (al ? [x + a, z] : [x, z + a]);
    for (const s of [-1, 1]) { const [px, pz] = P(s * L / 2); h.cyl(px, 0, pz, 0.06, 3, '#c9ccd0', { seg: 8 }); h.cyl(px, 0, pz, 0.25, 0.1, '#55606b'); }
    const [ax, az] = P(-L / 2), [bx, bz] = P(L / 2); bunting(h, [ax, 2.9, az], [bx, 2.9, bz], Math.round(L / 0.42), TOY.concat(acc), { sag: 0.5 }); bunting(h, [ax, 2.4, az], [bx, 2.4, bz], Math.round(L / 0.42), PASTEL, { sag: 0.4 });
  },
  koiK(h, x, z) { koinobori(h, x, z, 6.5 + h.rnd(), h.rnd() * 6.28); },
  // のぼり旗のならび
  noboriK(h, x, z, pal, acc) {
    const al = h.rnd() < 0.5, n = 3 + Math.floor(h.rnd() * 3), T = ['大売出し', '営業中', '本日特売', 'セール中', 'うまい！', '新発売', 'たこやき', 'やきそば', 'かき氷', 'ソフトクリーム'];
    for (let i = 0; i < n; i++) { const u = (i - (n - 1) / 2) * 0.95, c = pick(h, ['#d9302a', '#2f6fb0', '#f0d040', '#3f9b6a', '#f08a3c']); nobori(h, al ? x + u : x, al ? z : z + u, al ? [0, 1] : [1, 0], pick(h, T), c, c === '#f0d040' ? '#d9302a' : '#ffffff'); }
  },
  // 掲示板（屋根つきの町の掲示板・脚つきの両面の板）
  bboardK(h, x, z) { const dir = pick(h, DIRS); bboard(h, x, z, dir, 2.2 + h.rnd() * 0.8, 1.3, h.rnd() < 0.5 ? 'town' : 'stand'); },
  // 道路標識の森（同じような標識がいっぱい。標識の柱のあいだにまぎれる）
  roadsigns(h, x, z) {
    const K = ['noentry', 'speed', 'arrow', 'stop', 'warn', 'work', 'walk', 'P'], n = 5 + Math.floor(h.rnd() * 4), face = pick(h, DIRS);
    for (let i = 0; i < n; i++) { const px = x + (h.rnd() - 0.5) * 2.6, pz = z + (h.rnd() - 0.5) * 2.6; if (!h.free(px, pz, 0.3)) continue; roadSign(h, px, pz, pick(h, K), 1.6 + h.rnd() * 0.9, face); h.cyl(px, 0, pz, 0.22, 0.12, '#55606b', { seg: 10 }); }
  },
  // 植木ばちの段（ひな壇に、でこぼこの植木と花）
  potshelf(h, x, z, pal, acc, o = {}) {
    const al = o.al != null ? o.al : h.rnd() < 0.5, fz = o.fz || (h.rnd() < 0.5 ? 1 : -1), W = 2.4, P = (a, b) => (al ? [x + a, z + b * fz] : [x + b * fz, z + a]);
    for (let k = 0; k < 3; k++) { const [px, pz] = P(0, -k * 0.45); h.B(px, 0, pz, al ? W : 0.45, 0.3 + k * 0.35, al ? 0.45 : W, '#8a6a4a', { r: 0.02, pat: ['grain', '#8a6a4a', 0, 2, 1] });
      for (let i = 0; i < 4; i++) { const [qx, qz] = P(-W / 2 + 0.3 + i * 0.6, -k * 0.45), y = 0.3 + k * 0.35, fc = pick(h, ['#ff6fa8', '#ffd940', '#ffffff', '#b06fd8', '#ff8a3c', '#e0413a']), s = 0.8 + h.rnd() * 0.5;
        h.lathe(qx, y, qz, [[0.001, 0], [0.11 * s, 0], [0.16 * s, 0.22 * s], [0.18 * s, 0.24 * s], [0.001, 0.24 * s]], pick(h, ['#b5651d', '#c97b4a', '#f4f4f4', '#2f6fb0']), { seg: 12 });
        h.lump(qx, y + 0.24 * s + 0.16 * s, qz, 0.22 * s, 0.2 * s, 0.22 * s, '#3b8f46', { core: 0.88, seed: seed8(h), bump: 0.3, freq: 3.5, pat: ['confetti', '#3b8f46', [fc, '#ffffff', fc], 1, 1] }); } }
  },
  // 八百屋の台（ななめの木箱に、丸い野菜・くだもの）
  vegstand(h, x, z, pal, acc, o = {}) {
    const al = o.al != null ? o.al : h.rnd() < 0.5, fz = o.fz || (h.rnd() < 0.5 ? 1 : -1), n = 4, P = (a, b) => (al ? [x + a, z + b * fz] : [x + b * fz, z + a]);
    const V = [['#e0413a', 0.12], ['#f08a3c', 0.12], ['#7fbf3f', 0.25], ['#f0d040', 0.1], ['#7a3a8a', 0.1], ['#d9e8c0', 0.2]];
    for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) {
      const [px, pz] = P((i - (n - 1) / 2) * 0.75, -r * 0.6), y = 0.55 + r * 0.35, [c, s] = pick(h, V);
      h.B(px, 0, pz, al ? 0.7 : 0.55, y, al ? 0.55 : 0.7, '#b08a5a', { r: 0.02, pat: ['planks', '#b08a5a', 0, 1, 1] });
      for (let k = 0; k < (s > 0.2 ? 3 : 7); k++) { const [qx, qz] = P((i - (n - 1) / 2) * 0.75 + (h.rnd() - 0.5) * 0.4, -r * 0.6 + (h.rnd() - 0.5) * 0.3); h.lump(qx, y + s * 0.8, qz, s, s * 0.85, s, c, { seed: seed8(h), bump: s > 0.2 ? 0.25 : 0.06, freq: s > 0.2 ? 4 : 1.5, nocol: true }); }
      const [tx, tz] = P((i - (n - 1) / 2) * 0.75, -r * 0.6 + 0.3); h.B(tx, y + 0.02, tz, al ? 0.2 : 0.02, 0.15, al ? 0.02 : 0.2, '#fbfaf4', { nocol: true, pat: txt(pick(h, ['100', '150', '200', '安い', '特価']), '#fbfaf4', '#d9302a', 1.3, false, false) });
    }
  },
  // UFOキャッチャーのならび
  craneK(h, x, z, pal, acc) { const al = h.rnd() < 0.5, fz = h.rnd() < 0.5 ? 1 : -1, n = 2 + Math.floor(h.rnd() * 2), c = pick(h, ['#e0719a', '#59b6d8', '#f0d040', '#b06fd8']); for (let i = 0; i < n; i++) { const u = (i - (n - 1) / 2) * 1.3; crane(h, al ? x + u : x, al ? z : z + u, al ? [0, fz] : [fz, 0], c); } },
  // 看板の立つ所（2本の柱の大きな看板。上に乗れる・板にくっつく）
  bigsign(h, x, z, pal, acc) {
    const al = h.rnd() < 0.5, w = 3 + h.rnd() * 1.2, ht = 1.6, y0 = 1.6 + h.rnd() * 0.6, c = pick(h, acc), T = ['ぬりかくれ商店', 'カメレオン堂', 'まんぷく亭', 'にじいろ書店', 'くじら寿司', 'もぐもぐ屋', 'ペンキ屋', 'おもちゃ', 'カラオケ', '駐車場'];
    for (const s of [-1, 1]) h.cyl(al ? x + s * (w / 2 - 0.3) : x, 0, al ? z : z + s * (w / 2 - 0.3), 0.1, y0, '#55606b', { seg: 10 });
    signBoard(h, al ? x : x - 0.1, y0, al ? z - 0.1 : z, al ? 0 : 1, al ? 1 : 0, w, ht, pick(h, T), c, '#ffffff', { lamps: true, t: 0.2 });
  },
  // 食べ物の立体看板（台にのせて地面に置いたもの）
  foodK(h, x, z) { const dir = pick(h, DIRS), k = pick(h, ['tako', 'ebi', 'ramen', 'gyoza', 'onigiri', 'soft', 'sushi', 'pudding', 'dango']); h.B(x, 0, z, 1.8, 0.5, 1.8, '#55606b', { r: 0.06, pat: ['panel', '#55606b', 0, 1, 1] }); food3D(h, x - dir[0] * 0.9, 0.2, z - dir[1] * 0.9, dir[0], dir[1], k, 0.75); }
};
// ふくろの山（部屋のすみに置く小さめのもの）
export function sackPile(h, x, z, w = 1.2) {
  const cs = ['#c8a36a', '#b08a5a', '#d9c49a', '#8a7a5a', '#e8e1d2'];
  for (let i = 0; i < 6; i++) { const top = i > 3, s = 0.36 + h.rnd() * 0.12, c = pick(h, cs); h.lump(x + (h.rnd() - 0.5) * (w - 0.7) * (top ? 0.5 : 1), top ? 0.5 + s * 0.4 : s * 0.55, z + (h.rnd() - 0.5) * (w - 0.7) * (top ? 0.5 : 1), s * 1.1, s * 0.6, s * 0.85, c, { seed: seed8(h), bump: 0.2, freq: 1.5, ry: h.rnd() * 3.14, core: 0.92, pat: ['noise', c, 0, 2, 2] }); }
}
// 置くときに空けておく半径
export const PROPS_R = { stonewall: 2.6, sandbags: 2.0, balloons: 1.7, darumas: 2.0, lucky: 1.9, snowmen: 1.6, penguins: 1.5, lanternK: 2.3, pipewall: 2.6, workK: 1.8, dokan: 2.6, dokanStand: 2.0, pipeRack: 2.0, flagK: 1.0, buntingK: 3.0, koiK: 1.2, noboriK: 2.4, bboardK: 1.5, roadsigns: 1.8, potshelf: 1.7, vegstand: 1.9, craneK: 2.0, bigsign: 2.0, foodK: 1.4 };
