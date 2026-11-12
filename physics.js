// 当たり判定（見た目どおりの形）と壁のぼり。three.js に依存しない純粋な計算だけ
// 当たり判定の形
//   t:0 箱（rr = 角の丸み）
//   t:1 円柱・円すい（r0=下の半径, r1=上の半径, sq=四角すい）
//   t:2 だ円体（terrain=丘として上を歩ける, half=上半分だけ）
// sink（箱）= 絵・模様の壁：体の中心が面から sinkD まで沈みこめる（表面だけが出て、絵と同化できる）
// sinkV（だ円体・箱）= 葉っぱ・しげみ・ボールプール：上に乗ると sinkV だけ沈む。soft = 上に乗れるだけで横からはすり抜ける（中に入れる）
// どの形も x0..x1 / z0..z1 / y0..y1 の外枠を持つ（大まかな判定と配置チェック用）

export const STEP = 0.36; // 乗り越えられる段差
export const CLIMB = { hold: 0.2, speed: 2.8, side: 0.55, pull: 6 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function boxCol(x0, x1, z0, z1, y0, y1, o = {}) {
  const rr = Math.max(0, Math.min(o.rr || 0, (x1 - x0) / 2 - 0.001, (z1 - z0) / 2 - 0.001));
  return { t: 0, x0, x1, z0, z1, y0, y1, rr, nc: !!o.nc || !!o.soft, sink: !!o.sink, soft: !!o.soft, sinkV: o.sinkV || 0 };
}
export function cylCol(cx, cz, y0, y1, r0, r1, o = {}) {
  const m = Math.max(r0, r1);
  return { t: 1, cx, cz, y0, y1, r0, r1, sq: !!o.sq, walk: !!o.walk, nc: !!o.nc, x0: cx - m, x1: cx + m, z0: cz - m, z1: cz + m };
}
export function ellCol(cx, cy, cz, rx, ry, rz, o = {}) {
  return { t: 2, cx, cy, cz, rx, ry, rz, terrain: !!o.terrain, nc: !!o.nc || !!o.soft, soft: !!o.soft, sinkV: o.sinkV || 0, y0: o.half ? cy : cy - ry, y1: cy + ry, x0: cx - rx, x1: cx + rx, z0: cz - rz, z1: cz + rz };
}

export const cylRad = (c, y) => (y <= c.y0 ? c.r0 : y >= c.y1 ? c.r1 : c.r0 + (c.r1 - c.r0) * (y - c.y0) / (c.y1 - c.y0));
// だ円の、中心から (dx,dz) 方向へのふちまでの距離
function ellRim(c, dx, dz, d) {
  if (d < 1e-6) return Math.min(c.rx, c.rz);
  const ux = dx / d / c.rx, uz = dz / d / c.rz;
  return 1 / Math.sqrt(ux * ux + uz * uz);
}

// 体（半径R・高さHの縦長の筒）を当たり判定から押し出す。足元の高さ ground を返す
export function collide(p, R, H, cols, fall = 0, sinkD = 0) {
  const stepT = Math.max(STEP, fall + 0.08), top = p.y + H * 0.92;
  let ground = 0, blocked = false;
  for (const c of cols) {
    if (p.x <= c.x0 - R || p.x >= c.x1 + R || p.z <= c.z0 - R || p.z >= c.z1 + R) continue;
    if (c.t === 0 && c.soft) { // ボールの海・水面など：上から入ると sinkV だけ沈んで立つ。横からはすり抜ける
      if (p.x <= c.x0 || p.x >= c.x1 || p.z <= c.z0 || p.z >= c.z1) continue;
      const s = c.y1 - c.sinkV; if (p.y >= s - Math.min(stepT, fall + 0.12) && s > ground) ground = s;
      continue;
    }
    if (c.t === 0) {
      const rr = c.rr, cx = clamp(p.x, c.x0 + rr, c.x1 - rr), cz = clamp(p.z, c.z0 + rr, c.z1 - rr);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz, RR = R + rr;
      if (d2 >= RR * RR) continue;
      const sunk = c.sink && p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1; // 絵の壁に沈んでいる（よじ登り中に段差として上に乗らない）
      if (p.y >= c.y1 - (sunk ? Math.min(stepT, fall + 0.02) : stepT)) { const k = rr + R * 0.7; if (d2 < k * k && c.y1 > ground) ground = c.y1; continue; } // 上に乗れる
      if (top < c.y0) continue;
      if (!c.nc) blocked = true;
      if (c.sink && sinkD > 0) { // 絵・模様の壁：中心が面から sinkD より深く入ったぶんだけ戻す
        if (p.x <= c.x0 || p.x >= c.x1 || p.z <= c.z0 || p.z >= c.z1) continue;
        const a = [p.x - c.x0, c.x1 - p.x, p.z - c.z0, c.z1 - p.z], i = a.indexOf(Math.min(...a)), m = a[i] - sinkD;
        if (m > 0) { if (i === 0) p.x -= m; else if (i === 1) p.x += m; else if (i === 2) p.z -= m; else p.z += m; }
        continue;
      }
      pushBox(p, R, c.x0, c.x1, c.z0, c.z1, rr);
    } else if (c.t === 1) {
      const dx = p.x - c.cx, dz = p.z - c.cz, d = c.sq ? Math.max(Math.abs(dx), Math.abs(dz)) : Math.hypot(dx, dz);
      if (d >= Math.max(c.r0, c.r1) + R) continue;
      // 足場になるか（てっぺん／ゆるい坂）
      const dS = Math.max(0, d - R * 0.6); let s = -1e9;
      if (dS <= c.r1 + 1e-6) s = c.y1;
      else if (c.r0 > c.r1 && dS < c.r0) s = c.y0 + (c.y1 - c.y0) * (c.r0 - dS) / (c.r0 - c.r1);
      if (s > -1e8 && p.y >= s - stepT && (dS <= c.r1 + 1e-6 || c.walk || s <= p.y + 0.03)) { if (s > ground) ground = s; continue; }
      if (top <= c.y0 || p.y >= c.y1) continue;
      const rad = cylRad(c, c.r0 >= c.r1 ? Math.max(p.y, c.y0) : Math.min(top, c.y1));
      if (c.sq) { if (pushBox(p, R, c.cx - rad, c.cx + rad, c.cz - rad, c.cz + rad, 0) && !c.nc) blocked = true; continue; }
      if (d >= rad + R) continue;
      if (!c.nc) blocked = true;
      if (d > 1e-6) { const k = (rad + R) / d; p.x = c.cx + dx * k; p.z = c.cz + dz * k; } else p.x = c.cx + rad + R;
    } else {
      const dx = p.x - c.cx, dz = p.z - c.cz, d = Math.hypot(dx, dz), rh = ellRim(c, dx, dz, d);
      if (d >= rh + R) continue;
      const dS = Math.max(0, d - R * (c.terrain ? 0.3 : 0.6)), sv = c.sinkV;
      if (dS < rh) {
        const q = dS / rh, s = c.cy + c.ry * Math.sqrt(1 - q * q);
        if (s >= c.y0 && p.y >= s - sv - (c.terrain ? 3 : c.soft ? Math.min(stepT, fall + 0.12) : stepT) && (c.terrain || c.soft || q < 0.75 || s - sv <= p.y + 0.03)) { if (s - sv > ground) ground = s - sv; continue; } // 葉っぱなどは少し沈む
      }
      if (c.terrain || c.soft) continue; // 丘は地面として扱うだけ／葉っぱは横からすり抜ける
      const lo = Math.max(p.y, c.y0), hi = Math.min(top, c.y1); if (lo >= hi) continue;
      const v = (clamp(c.cy, lo, hi) - c.cy) / c.ry; if (v * v >= 1) continue;
      const rad = rh * Math.sqrt(1 - v * v);
      if (d >= rad + R) continue;
      if (!c.nc) blocked = true;
      if (d > 1e-6) { const k = (rad + R) / d; p.x = c.cx + dx * k; p.z = c.cz + dz * k; } else p.x = c.cx + rad + R;
    }
  }
  return { ground, blocked };
}
function pushBox(p, R, x0, x1, z0, z1, rr) {
  const cx = clamp(p.x, x0 + rr, x1 - rr), cz = clamp(p.z, z0 + rr, z1 - rr);
  const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz, RR = R + rr;
  if (d2 >= RR * RR) return false;
  if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (RR - d) / d; p.x += dx * k; p.z += dz * k; return true; }
  const a = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z], i = a.indexOf(Math.min(...a)); // 中に入り込んだら一番近い面へ
  if (i === 0) p.x = x0 - R; else if (i === 1) p.x = x1 + R; else if (i === 2) p.z = z0 - R; else p.z = z1 + R;
  return true;
}

// 体のパーツの1点が物にめり込んでいたら、外へ出すための移動量 [dx, dz] を返す
export function pushOut(v, cols, allow = 0) {
  for (const c of cols) {
    if (c.soft) continue;
    if (v.x <= c.x0 || v.x >= c.x1 || v.z <= c.z0 || v.z >= c.z1 || v.y <= c.y0 + 0.06 || v.y >= c.y1 - 0.1) continue;
    if (c.t === 0) {
      if (c.sink && allow > 0) { // 絵・模様の壁：allow までは体が入りこんでよい
        const a = [v.x - c.x0, c.x1 - v.x, v.z - c.z0, c.z1 - v.z], k = a.indexOf(Math.min(...a)), d = a[k] - allow;
        if (d <= 0) continue;
        return k === 0 ? [-d - 0.02, 0] : k === 1 ? [d + 0.02, 0] : k === 2 ? [0, -d - 0.02] : [0, d + 0.02];
      }
      const r = faceOut(v, c.x0, c.x1, c.z0, c.z1); if (r) return r; continue;
    }
    const dx = v.x - (c.cx), dz = v.z - c.cz, d = Math.hypot(dx, dz);
    let rad;
    if (c.t === 1) {
      rad = cylRad(c, v.y);
      if (c.sq) { if (Math.abs(dx) >= rad || Math.abs(dz) >= rad) continue; const r = faceOut(v, c.cx - rad, c.cx + rad, c.cz - rad, c.cz + rad); if (r) return r; continue; }
    } else {
      if (c.terrain || c.soft) continue;
      const rh = ellRim(c, dx, dz, d), w = (v.y - c.cy) / c.ry; if (w * w >= 1) continue;
      rad = rh * Math.sqrt(1 - w * w);
      const q = Math.min(1, d / rh), s = c.cy + c.ry * Math.sqrt(1 - q * q);
      if (v.y >= s - c.sinkV - 0.1) continue; // 表面にのっている（沈んでいる）だけ
    }
    if (d >= rad) continue;
    const m = rad - d + 0.03;
    return d > 1e-6 ? [dx / d * m, dz / d * m] : [m, 0];
  }
  return null;
}
function faceOut(v, x0, x1, z0, z1) {
  const a = [v.x - x0, x1 - v.x, v.z - z0, z1 - v.z], k = a.indexOf(Math.min(...a)), d = a[k] + 0.03;
  return k === 0 ? [-d, 0] : k === 1 ? [d, 0] : k === 2 ? [0, -d] : [0, d];
}

// 近くの「登れる面」を探す。gap=体の中心から面までの水平距離、n=面から外向きの向き、top=登りきる高さ
export function findWall(p, R, H, cols, tol) {
  const yb = p.y + 0.05, yt = p.y + H + 0.2;
  let best = null, bg = tol;
  for (const c of cols) {
    if (c.nc || c.terrain || c.y1 <= yb || c.y0 >= yt) continue;
    if (p.x < c.x0 - tol || p.x > c.x1 + tol || p.z < c.z0 - tol || p.z > c.z1 + tol) continue;
    let gap, nx, nz, rTop = 1;
    // collide と同じく「体と重なる高さで一番太いところ」までの距離を測る
    const lo = Math.max(p.y, c.y0), hi = Math.min(p.y + H * 0.92, c.y1);
    const ym = c.t === 1 ? (c.r0 >= c.r1 ? lo : hi) : c.t === 2 ? clamp(c.cy, lo, hi) : lo;
    if (c.t === 0 || c.sq) {
      const h = c.t === 0 ? null : cylRad(c, ym);
      const x0 = h === null ? c.x0 : c.cx - h, x1 = h === null ? c.x1 : c.cx + h, z0 = h === null ? c.z0 : c.cz - h, z1 = h === null ? c.z1 : c.cz + h;
      const dx = p.x - clamp(p.x, x0, x1), dz = p.z - clamp(p.z, z0, z1), d = Math.hypot(dx, dz);
      if (d < 1e-6) { // 中に入っている：絵の壁に沈んでいるときは、いちばん近い面を壁とする
        if (!c.sink) continue;
        const a = [p.x - x0, x1 - p.x, p.z - z0, z1 - p.z], i = a.indexOf(Math.min(...a));
        gap = -a[i]; nx = i === 0 ? -1 : i === 1 ? 1 : 0; nz = i === 2 ? -1 : i === 3 ? 1 : 0;
      } else { gap = d; nx = dx / d; nz = dz / d; }
      rTop = c.t === 0 ? 1 : c.r1;
    } else {
      const dx = p.x - c.cx, dz = p.z - c.cz, d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      let rad;
      if (c.t === 1) { rad = cylRad(c, ym); rTop = c.r1; }
      else { const w = (ym - c.cy) / c.ry; rad = ellRim(c, dx, dz, d) * Math.sqrt(Math.max(0, 1 - w * w)); rTop = 0.15; }
      gap = d - rad; nx = dx / d; nz = dz / d;
    }
    if (gap < bg) { bg = gap; best = { c, gap, nx, nz, rTop, round: c.t !== 0 && !c.sq, sink: !!c.sink }; }
  }
  if (!best) return null;
  // 真上にすき間なく積み重なっている物（その物と重なっている物）があれば、そのてっぺんまで登れる
  let top = best.c.y1, ct = best.c;
  for (let g = 0; g < 8; g++) {
    let nx = null;
    for (const c of cols) {
      if (c === ct || c.nc || c.terrain || c.y0 > top + 0.05 || c.y1 <= top + 0.01) continue;
      if (c.x0 > ct.x1 + 0.1 || c.x1 < ct.x0 - 0.1 || c.z0 > ct.z1 + 0.1 || c.z1 < ct.z0 - 0.1) continue; // いまの物と重なっていない物は別の物
      if (p.x < c.x0 - tol - 0.2 || p.x > c.x1 + tol + 0.2 || p.z < c.z0 - tol - 0.2 || p.z > c.z1 + tol + 0.2) continue;
      if (!nx || c.y1 > nx.y1) nx = c;
    }
    if (!nx) break;
    top = nx.y1; ct = nx;
  }
  best.top = top;
  return best;
}

// 頭の上の天井をさがす（下から物の中に入りこむと、反対側へ押し出されて壁抜けになるため）
function under(c, p, m) {
  if (c.t === 0) return p.x > c.x0 - m && p.x < c.x1 + m && p.z > c.z0 - m && p.z < c.z1 + m;
  const dx = p.x - c.cx, dz = p.z - c.cz;
  if (c.t === 1) { const r = c.r0 + m; return c.sq ? Math.abs(dx) < r && Math.abs(dz) < r : dx * dx + dz * dz < r * r; }
  if (c.y0 < c.cy - 1e-6) return false; // 下が丸い物は横への押し出しにまかせる
  const d = Math.hypot(dx, dz); return d < ellRim(c, dx, dz, d) + m;
}
export function ceilingAt(p, R, top, cols) {
  let best = null;
  for (const c of cols) {
    if (c.terrain || c.soft || c.y0 < top - 0.05 || (best && c.y0 >= best.y0)) continue;
    if (under(c, p, R * 0.5)) best = c;
  }
  return best;
}
// 向き (nx,nz) に進んで、その物の下から出るまでの距離
function exitDist(c, p, nx, nz, m) {
  if (c.t === 0 || c.sq) {
    const h = c.t === 0 ? 0 : c.r0, x0 = c.t === 0 ? c.x0 : c.cx - h, x1 = c.t === 0 ? c.x1 : c.cx + h, z0 = c.t === 0 ? c.z0 : c.cz - h, z1 = c.t === 0 ? c.z1 : c.cz + h;
    let t = Infinity;
    if (nx > 1e-6) t = Math.min(t, (x1 + m - p.x) / nx); else if (nx < -1e-6) t = Math.min(t, (x0 - m - p.x) / nx);
    if (nz > 1e-6) t = Math.min(t, (z1 + m - p.z) / nz); else if (nz < -1e-6) t = Math.min(t, (z0 - m - p.z) / nz);
    return Math.max(0, t);
  }
  const ox = p.x - c.cx, oz = p.z - c.cz, d = Math.hypot(ox, oz);
  const r = (c.t === 1 ? c.r0 : ellRim(c, ox, oz, d)) + m, b = ox * nx + oz * nz, disc = b * b - (ox * ox + oz * oz - r * r);
  return disc < 0 ? 0 : Math.max(0, -b + Math.sqrt(disc));
}

// 1フレーム分の移動。b = 体の状態, inp = 入力。くっつき状態が変わったら 'on' / 'off' / 'top' を返す
//   ジャンプ長押し（hold秒以上）で近くの壁にくっつき、押している間は上へ登る
//   一度くっつけば、離しても壁にくっついたまま（スティックで上下左右に移動）
//   もう一度ジャンプを押すと壁から離れる
export function stepBody(b, inp, dt, cols) {
  const p = b.pos; let ev = '';
  if (inp.frozen && b.cling) { b.cling = null; ev = 'off'; }
  if (inp.press && !inp.frozen) {
    if (b.cling) {
      if (b.cling.rel) { const n = b.cling; b.cling = null; b.vy = 4.2; b.kx = n.nx * 3.2; b.kz = n.nz * 3.2; b.used = true; ev = 'off'; }
    } else { b.used = false; if (b.ground) { b.vy = 7; b.ground = false; } }
  }
  if (b.cling && !inp.held) b.cling.rel = true;

  if (b.cling) {
    const n = b.cling, sp = inp.sp || 1, dot = inp.mx * n.nx + inp.mz * n.nz;
    p.x += (inp.mx - dot * n.nx) * CLIMB.side * dt; p.z += (inp.mz - dot * n.nz) * CLIMB.side * dt;
    let v = clamp((inp.held && !n.rel ? CLIMB.speed : 0) - dot / sp * CLIMB.speed, -CLIMB.speed, CLIMB.speed);
    if (v > 0) { // 上に物があるとき：小さな出っぱりなら外へ回りこむ、大きな天井ならそこで止まる
      const top = p.y + b.h * 0.92, cz = ceilingAt(p, b.r, top, cols);
      if (cz && top + v * dt > cz.y0 - 0.01) {
        const out = exitDist(cz, p, n.nx, n.nz, b.r + 0.02);
        if (out < 2.7) { p.x += n.nx * out; p.z += n.nz * out; n.gap += out; }
        else v = Math.max(0, (cz.y0 - 0.01 - top) / dt);
      }
    }
    p.y += v * dt; b.vy = 0; b.kx = b.kz = 0;
    const want = n.sink && b.sinkD > 0 ? -b.sinkD : Math.max(b.r + 0.01, n.hold || 0); // 壁にぴったり寄せる（絵の壁には沈みこむ）
    if (n.gap > want) { const m = Math.min(CLIMB.pull * dt, n.gap - want); p.x -= n.nx * m; p.z -= n.nz * m; }
    const res = collide(p, b.r, b.h, cols, 0, b.sinkD || 0);
    if (p.y <= res.ground) { p.y = res.ground; if (v < 0 || res.ground > 0.01) { b.cling = null; b.ground = true; return 'off'; } }
    const w = findWall(p, b.r, b.h, cols, Math.max(b.r + 0.3, (b.reach || 0) + 0.2));
    if (!w) { b.cling = null; b.ground = false; return 'off'; }
    n.nx = w.nx; n.nz = w.nz; n.gap = w.gap; n.sink = w.sink;
    if (n.pushed) { n.hold = w.gap; n.pushed = false; }
    if (v > 0 && p.y >= w.top - 0.4) { // てっぺんに上がる
      const inward = w.gap + (w.round ? clamp(w.rTop * 0.7, 0.05, 0.3) : 0.3);
      p.x -= w.nx * inward; p.z -= w.nz * inward; p.y = w.top + 0.02; b.vy = 0; b.cling = null; b.ground = true;
      return 'top';
    }
    b.ground = false;
    return ev;
  }

  const kd = Math.max(0, 1 - 5 * dt);
  p.x += (inp.mx + (b.kx || 0)) * dt; p.z += (inp.mz + (b.kz || 0)) * dt; b.kx = (b.kx || 0) * kd; b.kz = (b.kz || 0) * kd;
  b.vy -= 20 * dt; let dy = b.vy * dt;
  if (dy > 0) { const top = p.y + b.h * 0.92, cz = ceilingAt(p, b.r, top, cols); if (cz && top + dy > cz.y0 - 0.01) { dy = Math.max(0, cz.y0 - 0.01 - top); b.vy = 0; } } // 頭をぶつけたら止まる
  p.y += dy;
  const res = collide(p, b.r, b.h, cols, Math.max(0, -b.vy * dt), b.sinkD || 0);
  b.blocked = res.blocked;
  if (p.y <= res.ground) { p.y = res.ground; b.vy = 0; b.ground = true; } else b.ground = false;
  if (inp.held && !b.used && !inp.frozen && inp.heldFor >= CLIMB.hold) {
    const w = findWall(p, b.r, b.h, cols, Math.max(b.r, b.reach || 0) + 0.25); // 壁のすぐそばなら、押しつけていなくてもくっつける
    if (w && w.top > p.y + 0.45) { b.cling = { nx: w.nx, nz: w.nz, gap: w.gap, rel: false, hold: 0, sink: w.sink }; b.vy = 0; b.ground = false; ev = 'on'; }
  }
  return ev;
}

// 物の置き場所チェック（大まかな外枠で判定）
export function isFree(x, z, r, cols) {
  for (const c of cols) { if (c.y1 <= 0.4 || c.y0 >= 1.8) continue; if (x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r) return false; }
  return true;
}
