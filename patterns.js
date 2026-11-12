// 模様テクスチャ（どれも上下左右につなぎ目なく並ぶ）。スポイトで模様の色も吸える
// drawPattern(ctx, S, kind, c1, c2, rnd)  c1 = 地の色、c2 = 模様の色（色の配列も可）
const arr = c => (Array.isArray(c) ? c : [c]);

export function drawPattern(x, S, kind, c1, c2, r) {
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
