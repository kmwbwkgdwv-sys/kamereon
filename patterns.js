// 模様テクスチャ（どれも上下左右につなぎ目なく並ぶ）。スポイトで模様の色も吸える
// drawPattern(ctx, S, kind, c1, c2, rnd)  c1 = 地の色、c2 = 模様の色（色の配列も可）
const arr = c => (Array.isArray(c) ? c : [c]);

export function drawPattern(x, S, kind, c1, c2, r) {
  if (kind.startsWith('art')) return drawArt(x, S, kind, c1, arr(c2), r);
  const cols = arr(c2), col = i => cols[i % cols.length];
  x.fillStyle = c1; x.fillRect(0, 0, S, S);
  // はみ出した分を反対側にも描いて、つなぎ目をなくす
  const wrap = (fn, px, py, m) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) if (px + dx > -m && px + dx < S + m && py + dy > -m && py + dy < S + m) fn(px + dx, py + dy); };
  const dot = (px, py, rad, c) => { x.fillStyle = c; wrap((a, b) => { x.beginPath(); x.arc(a, b, rad, 0, 6.2832); x.fill(); }, px, py, rad); };
  const speck = (n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; x.fillRect(r() * S, r() * S, 2 + r() * 5, 2 + r() * 5); } };
  const q = S / 4;
  switch (kind) {
    case 'dots': // 水玉
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) dot(i * q + (j % 2 ? q / 2 : 0) + q / 4, j * q + q / 2, q * 0.27, col(i + j));
      break;
    case 'hstripe': // 横じま
      for (let i = 0; i < 4; i++) if (i % 2) { x.fillStyle = col(i >> 1); x.fillRect(0, i * q, S, q); }
      break;
    case 'vband': // たてじま
      for (let i = 0; i < 4; i++) if (i % 2) { x.fillStyle = col(i >> 1); x.fillRect(i * q, 0, q, S); }
      break;
    case 'diag': // ななめじま
      x.lineWidth = q * 0.5; x.lineCap = 'butt';
      for (let k = -6; k < 6; k++) { x.strokeStyle = col(k & 1); x.beginPath(); x.moveTo(k * q - q, -q); x.lineTo(k * q + S + q, S + q); x.stroke(); }
      break;
    case 'zigzag': // ギザギザ
      x.lineWidth = q * 0.36; x.lineJoin = 'miter';
      for (let j = 0; j < 4; j++) { x.strokeStyle = col(j); x.beginPath(); for (let i = -1; i <= 8; i++) x.lineTo(i * q / 2, j * q + q / 2 + (i % 2 ? -q / 4 : q / 4)); x.stroke(); }
      break;
    case 'check2': // 大きな市松
      x.fillStyle = col(0); x.fillRect(0, 0, S / 2, S / 2); x.fillRect(S / 2, S / 2, S / 2, S / 2);
      break;
    case 'brick': // レンガ
      x.fillStyle = col(0); x.fillRect(0, 0, S, S); x.fillStyle = c1;
      for (let j = 0; j < 4; j++) { x.fillRect(0, j * q, S, 4); for (let i = 0; i < 2; i++) x.fillRect(((i * S / 2 + (j % 2 ? S / 4 : 0)) % S), j * q, 4, q); }
      speck(80, 0.04);
      break;
    case 'camo': // 迷彩（まだら）
      for (let k = 0; k < 3; k++) for (let i = 0; i < 9; i++) { const cx = r() * S, cy = r() * S, c = col(k); for (let b = 0; b < 4; b++) dot(cx + (r() - 0.5) * q, cy + (r() - 0.5) * q, q * (0.22 + r() * 0.3), c); }
      break;
    case 'confetti': // 紙ふぶき・花畑
      for (let i = 0; i < 70; i++) dot(r() * S, r() * S, 2.5 + r() * 4, col(i));
      break;
    case 'splat': // ペンキのしぶき
      for (let i = 0; i < 9; i++) {
        const cx = r() * S, cy = r() * S, c = col(i), s = q * (0.35 + r() * 0.45); dot(cx, cy, s, c);
        for (let b = 0; b < 7; b++) { const a = r() * 6.283, d = s * (1 + r() * 1.3); dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s * (0.12 + r() * 0.25), c); }
      }
      break;
    case 'rainbow': // にじ色の帯
      { const n = Math.max(2, cols.length); for (let i = 0; i < n; i++) { x.fillStyle = col(i); x.fillRect(0, Math.floor(i * S / n), S, Math.ceil(S / n) + 1); } }
      break;
    case 'wave': // 波
      x.lineWidth = q * 0.34;
      for (let j = 0; j < 4; j++) { x.strokeStyle = col(j); x.beginPath(); for (let i = -8; i <= S + 8; i += 4) x.lineTo(i, j * q + q / 2 + Math.sin(i / S * 6.2832 * 2) * q * 0.22); x.stroke(); }
      break;
    case 'leaf': // 葉っぱ
      speck(60, 0.05);
      for (let i = 0; i < 46; i++) { const cx = r() * S, cy = r() * S, c = col(i), a = r() * 3.14; x.fillStyle = c; wrap((ax, ay) => { x.beginPath(); x.ellipse(ax, ay, 9, 4.5, a, 0, 6.2832); x.fill(); }, cx, cy, 10); }
      break;
    case 'bark': // 木の皮
      for (let i = 0; i < 26; i++) { x.fillStyle = r() < 0.6 ? 'rgba(0,0,0,0.16)' : 'rgba(255,255,255,0.08)'; const px = r() * S, w = 2 + r() * 5; x.fillRect(px, 0, w, S); }
      speck(60, 0.05);
      break;
    default: speck(280, 0.035); // ざらつき
  }
}

// ---- 額縁の絵（つなぎ目なしではなく、1枚の絵）。体に同じ色・形を塗れば絵に溶けこめる ----
export const ART_KINDS = ['artLand', 'artGrid', 'artFruit', 'artSea', 'artFlower', 'artNight', 'artDots', 'artAbs', 'artField', 'artCat'];
function drawArt(x, S, kind, c1, P, r) {
  const p = i => P[i % P.length], u = S / 256;
  const rect = (c, a, b, w, h) => { x.fillStyle = c; x.fillRect(a * u, b * u, w * u, h * u); };
  const circ = (c, a, b, rad) => { x.fillStyle = c; x.beginPath(); x.arc(a * u, b * u, rad * u, 0, 6.2832); x.fill(); };
  const ell = (c, a, b, rx, ry, rot = 0) => { x.fillStyle = c; x.beginPath(); x.ellipse(a * u, b * u, rx * u, ry * u, rot, 0, 6.2832); x.fill(); };
  const poly = (c, pts) => { x.fillStyle = c; x.beginPath(); pts.forEach((q, i) => (i ? x.lineTo(q[0] * u, q[1] * u) : x.moveTo(q[0] * u, q[1] * u))); x.closePath(); x.fill(); };
  const hill = (c, base, amp, f, ph) => { const pts = [[0, 256]]; for (let i = 0; i <= 32; i++) pts.push([i * 8, base - amp * (0.6 * Math.sin(i * f + ph) + 0.4 * Math.sin(i * f * 2.3 + ph * 1.7))]); pts.push([256, 256]); poly(c, pts); };
  const brush = (n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = r() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`; x.fillRect(r() * S, r() * S, (3 + r() * 10) * u, (1 + r() * 2) * u); } }; // 筆のあと
  x.fillStyle = c1; x.fillRect(0, 0, S, S);
  switch (kind) {
    case 'artLand': { // 山と丘の風景
      for (let i = 0; i < 6; i++) rect(i % 2 ? '#bfe3f2' : '#aedcf0', 0, i * 22, 256, 22);
      circ('#ffe28a', 196, 46, 22); circ('#fff4c2', 196, 46, 15);
      ell('#ffffff', 70, 40, 30, 10); ell('#ffffff', 92, 34, 22, 10);
      poly('#8d9bb0', [[0, 150], [60, 70], [110, 140], [160, 60], [230, 150], [256, 120], [256, 256], [0, 256]]);
      poly('#f4f4f4', [[60, 70], [72, 86], [52, 86]]); poly('#f4f4f4', [[160, 60], [174, 78], [148, 78]]);
      hill(p(0), 170, 14, 0.35, 1); hill(p(1), 200, 12, 0.5, 3); hill(p(2), 230, 10, 0.7, 5);
      for (let i = 0; i < 9; i++) { const a = 20 + r() * 216, b = 190 + r() * 50; rect('#6b4a2b', a - 2, b, 4, 12); circ(p(3), a, b - 4, 9); }
      break;
    }
    case 'artGrid': { // 太い線と原色の四角
      const xs = [0, 60 + r() * 30, 150 + r() * 30, 256], ys = [0, 50 + r() * 40, 150 + r() * 40, 256];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const c = r() < 0.45 ? p(i * 3 + j) : '#f4f1e8'; rect(c, xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j]); }
      for (const v of xs.slice(1, 3)) rect('#1b1d20', v - 5, 0, 10, 256);
      for (const v of ys.slice(1, 3)) rect('#1b1d20', 0, v - 5, 256, 10);
      rect('#1b1d20', xs[1], ys[1] + 40, xs[2] - xs[1], 8);
      break;
    }
    case 'artFruit': { // 机の上のくだもの
      rect(p(0), 0, 0, 256, 160); rect(shade(p(0), 0.85), 0, 0, 256, 18);
      rect('#8a5a33', 0, 160, 256, 96); rect('#7a4c2a', 0, 160, 256, 8);
      ell('#e8e1d2', 128, 176, 86, 20); ell('#c9c1b0', 128, 182, 70, 12);
      const F = [['#e0413a', 92, 150, 22], ['#f0a020', 132, 146, 24], ['#7fbf3f', 168, 154, 20], ['#e0413a', 112, 128, 18], ['#b06fd8', 150, 124, 16], ['#f0d040', 76, 166, 14]];
      for (const [c, a, b, rad] of F) { circ(c, a, b, rad); circ('rgba(255,255,255,0.35)', a - rad * 0.35, b - rad * 0.35, rad * 0.3); }
      rect('#4a7a2a', 130, 118, 3, 10); ell('#4fbf6a', 138, 120, 7, 3, -0.4);
      break;
    }
    case 'artSea': { // 波と舟
      for (let i = 0; i < 5; i++) rect(i % 2 ? '#ffd9a8' : '#ffc78a', 0, i * 20, 256, 20);
      circ('#ff8a5c', 128, 100, 30);
      for (let j = 0; j < 8; j++) { const y = 100 + j * 20; x.fillStyle = j % 2 ? p(0) : p(1); x.beginPath(); x.moveTo(0, y * u); for (let i = 0; i <= 16; i++) x.quadraticCurveTo((i * 16 - 8) * u, (y - 10) * u, i * 16 * u, y * u); x.lineTo(S, S); x.lineTo(0, S); x.closePath(); x.fill(); }
      poly('#8a5a33', [[100, 128], [160, 128], [150, 140], [110, 140]]); rect('#55606b', 128, 86, 3, 42); poly('#f4f4f4', [[131, 88], [131, 124], [156, 124]]);
      break;
    }
    case 'artFlower': { // 花びん
      rect(p(0), 0, 0, 256, 256); for (let i = 0; i < 8; i++) rect(shade(p(0), i % 2 ? 0.94 : 1.04), i * 32, 0, 32, 190);
      rect('#b08a5a', 0, 190, 256, 66);
      poly(p(1), [[100, 140], [156, 140], [168, 200], [150, 230], [106, 230], [88, 200]]);
      for (let i = 0; i < 9; i++) { const a = 70 + r() * 116, b = 40 + r() * 80, c = p(2 + i); x.strokeStyle = '#3f7a2a'; x.lineWidth = 3 * u; x.beginPath(); x.moveTo(128 * u, 145 * u); x.lineTo(a * u, b * u); x.stroke(); for (let k = 0; k < 6; k++) circ(c, a + Math.cos(k * 1.05) * 10, b + Math.sin(k * 1.05) * 10, 8); circ('#ffd940', a, b, 6); }
      break;
    }
    case 'artNight': { // うずまく星空
      rect('#1b2a5a', 0, 0, 256, 256);
      for (let k = 0; k < 7; k++) { const a = r() * 256, b = r() * 150, R = 12 + r() * 26; x.strokeStyle = k % 2 ? '#7fa8e8' : '#4f7fe0'; x.lineWidth = 6 * u; x.beginPath(); for (let t = 0; t < 14; t += 0.2) x.lineTo((a + Math.cos(t) * R * t / 14) * u, (b + Math.sin(t) * R * t / 14) * u); x.stroke(); }
      for (let i = 0; i < 12; i++) { const a = r() * 256, b = r() * 160; circ('#f0d040', a, b, 7); circ('#fff4c2', a, b, 3); }
      circ('#ffe28a', 210, 40, 18); circ('#1b2a5a', 218, 34, 15);
      hill('#1b2440', 200, 16, 0.4, 2); hill(p(0), 228, 10, 0.6, 4);
      poly('#14181f', [[40, 256], [52, 90], [64, 256]]); poly('#14181f', [[60, 256], [70, 130], [80, 256]]);
      break;
    }
    case 'artDots': { // ポップな水玉と帯
      rect(p(0), 0, 0, 256, 256);
      for (let i = 0; i < 4; i++) rect(p(1 + i), 0, i * 64 + 22, 256, 20);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) circ(p(2 + ((i + j) % 4)), 21 + i * 43, 21 + j * 43, 8 + ((i * 3 + j) % 3) * 4);
      break;
    }
    case 'artAbs': { // ぬりたくった抽象画
      rect(p(0), 0, 0, 256, 256);
      for (let i = 0; i < 9; i++) ell(p(1 + i), r() * 256, r() * 256, 20 + r() * 60, 12 + r() * 40, r() * 3);
      for (let i = 0; i < 6; i++) { x.strokeStyle = p(i + 3); x.lineWidth = (6 + r() * 10) * u; x.lineCap = 'round'; x.beginPath(); x.moveTo(r() * S, r() * S); x.bezierCurveTo(r() * S, r() * S, r() * S, r() * S, r() * S, r() * S); x.stroke(); }
      break;
    }
    case 'artField': { // 大きな色の面（体に塗りやすい）
      const n = 3 + Math.floor(r() * 2); let y = 0;
      for (let i = 0; i < n; i++) { const h = i === n - 1 ? 256 - y : 40 + r() * 70; rect(p(i), 0, y, 256, h); y += h; }
      rect(p(n), 30, 40, 196, 60); rect(shade(p(n), 0.8), 30, 140, 196, 70);
      break;
    }
    case 'artCat': { // ねこの絵
      rect(p(0), 0, 0, 256, 256); rect(shade(p(0), 0.88), 0, 190, 256, 66);
      const c = p(1); ell(c, 128, 170, 62, 50); circ(c, 128, 100, 44);
      poly(c, [[92, 80], [96, 40], [122, 66]]); poly(c, [[164, 80], [160, 40], [134, 66]]);
      x.strokeStyle = c; x.lineWidth = 14 * u; x.lineCap = 'round'; x.beginPath(); x.moveTo(186 * u, 200 * u); x.quadraticCurveTo(236 * u, 190 * u, 220 * u, 130 * u); x.stroke();
      ell('#f0d040', 112, 98, 8, 10); ell('#f0d040', 144, 98, 8, 10); ell('#1b1d20', 112, 98, 3, 9); ell('#1b1d20', 144, 98, 3, 9);
      poly('#e0719a', [[122, 114], [134, 114], [128, 121]]);
      break;
    }
  }
  brush(160, 0.05);
}
const shade = (c, k) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('');
