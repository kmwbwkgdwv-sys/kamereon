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
    case 'planks': { // 木箱の板（たての板・すき間・まわりのわく）
      const fr = q * 0.34; x.fillStyle = col(0);
      for (let i = 0; i < 4; i++) { x.fillStyle = shade(c1, 0.9 + ((i * 37) % 5) * 0.04); x.fillRect(i * q, 0, q, S); x.fillStyle = 'rgba(0,0,0,0.42)'; x.fillRect(i * q, 0, 3, S); }
      for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(60,30,10,${(0.05 + r() * 0.08).toFixed(3)})`; x.fillRect(r() * S, r() * S, 1 + r() * 1.5, 8 + r() * 26); } // 木目
      x.fillStyle = shade(c1, 0.78); x.fillRect(0, 0, S, fr); x.fillRect(0, S - fr, S, fr); x.fillRect(0, 0, fr, S); x.fillRect(S - fr, 0, fr, S);
      x.strokeStyle = shade(c1, 0.72); x.lineWidth = fr * 0.8; x.beginPath(); x.moveTo(fr, fr); x.lineTo(S - fr, S - fr); x.stroke(); // ななめの補強
      x.fillStyle = 'rgba(0,0,0,0.5)'; for (const [a, b] of [[fr / 2, fr / 2], [S - fr / 2, fr / 2], [fr / 2, S - fr / 2], [S - fr / 2, S - fr / 2]]) { x.beginPath(); x.arc(a, b, 2.2, 0, 6.2832); x.fill(); } // くぎ
      break;
    }
    case 'carton': // 段ボール（まん中にガムテープ・ふたの線・印刷）
      speck(120, 0.03);
      x.fillStyle = shade(c1, 0.82); x.fillRect(0, S * 0.495, S, 2);
      x.fillStyle = 'rgba(236,224,196,0.85)'; x.fillRect(S * 0.41, 0, S * 0.18, S);
      x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(S * 0.43, 0, S * 0.03, S);
      x.strokeStyle = 'rgba(40,30,20,0.55)'; x.lineWidth = 2; x.strokeRect(S * 0.08, S * 0.66, S * 0.2, S * 0.2); x.beginPath(); x.moveTo(S * 0.12, S * 0.8); x.lineTo(S * 0.18, S * 0.7); x.lineTo(S * 0.24, S * 0.8); x.stroke(); // 上向き矢印のマーク
      break;
    case 'corrugate': // 波板（コンテナ・倉庫の壁）
      for (let i = 0; i < 16; i++) { const g = x.createLinearGradient(i * S / 16, 0, (i + 1) * S / 16, 0); g.addColorStop(0, shade(c1, 0.78)); g.addColorStop(0.5, shade(c1, 1.12)); g.addColorStop(1, shade(c1, 0.78)); x.fillStyle = g; x.fillRect(i * S / 16, 0, S / 16 + 1, S); }
      for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(120,60,20,${(0.05 + r() * 0.12).toFixed(3)})`; x.fillRect(r() * S, r() * S, 2 + r() * 10, 2 + r() * 16); } // さび
      break;
    case 'vents': // ロッカーの通気口・取っ手
      x.fillStyle = 'rgba(0,0,0,0.45)'; for (let i = 0; i < 6; i++) x.fillRect(S * 0.3, S * 0.06 + i * S * 0.045, S * 0.4, S * 0.022);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, 3, S); x.fillRect(S - 3, 0, 3, S);
      x.fillStyle = '#c9ccd0'; x.fillRect(S * 0.78, S * 0.45, S * 0.06, S * 0.14); x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(S * 0.79, S * 0.47, S * 0.04, S * 0.1);
      x.fillStyle = '#f4f4f4'; x.fillRect(S * 0.4, S * 0.38, S * 0.2, S * 0.08);
      break;
    case 'rockface': // 岩肌：大きな色の面（体に塗りやすい）と少しのひび
      for (let k = 0; k < 7; k++) { // 角ばった色の面
        const cx = r() * S, cy = r() * S, rad = q * (0.7 + r() * 0.9), n = 5 + Math.floor(r() * 3), c = col(k);
        x.fillStyle = c; wrap((a, b) => { x.beginPath(); for (let i = 0; i < n; i++) { const t = i / n * 6.2832 + r() * 0.4, rr = rad * (0.7 + r() * 0.3); i ? x.lineTo(a + Math.cos(t) * rr, b + Math.sin(t) * rr) : x.moveTo(a + Math.cos(t) * rr, b + Math.sin(t) * rr); } x.closePath(); x.fill(); }, cx, cy, rad);
      }
      x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 1.6;
      for (let k = 0; k < 4; k++) { let a = r() * S, b = r() * S; x.beginPath(); x.moveTo(a, b); for (let i = 0; i < 5; i++) { a += (r() - 0.5) * q; b += r() * q * 0.6; x.lineTo(a, b); } x.stroke(); }
      speck(90, 0.04);
      break;
    case 'strata': // 地層（よこの帯。上下でつながる）
      { const n = 3; for (let i = 0; i < n; i++) { x.fillStyle = col(i); const y0 = Math.floor(i * S / n + (i ? S / n * 0.3 : 0)); x.fillRect(0, y0, S, Math.ceil(S / n * (i ? 0.3 : 0.5))); } }
      x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 1.5; for (let k = 0; k < 3; k++) { const y = r() * S; x.beginPath(); for (let i = 0; i <= 8; i++) x.lineTo(i * S / 8, y + (r() - 0.5) * 6); x.stroke(); }
      speck(110, 0.035);
      break;
    case 'bigcamo': // 大きな迷彩（色の数が少なく、体にまねしやすい）
      for (let k = 0; k < 2; k++) for (let i = 0; i < 4; i++) { const cx = r() * S, cy = r() * S, c = col(k); for (let b = 0; b < 3; b++) dot(cx + (r() - 0.5) * q * 1.4, cy + (r() - 0.5) * q * 1.4, q * (0.45 + r() * 0.35), c); }
      break;
    case 'graffiti': // らくがき（太いしぶき・ぐるぐる・ギザギザの線）
      for (let i = 0; i < 6; i++) { const cx = r() * S, cy = r() * S, c = col(i), s = q * (0.4 + r() * 0.5); dot(cx, cy, s, c); for (let b = 0; b < 5; b++) { const a = r() * 6.283, d = s * (1 + r()); dot(cx + Math.cos(a) * d, cy + Math.sin(a) * d, s * (0.1 + r() * 0.2), c); } }
      x.lineCap = 'round'; x.lineJoin = 'round';
      for (let i = 0; i < 4; i++) { x.strokeStyle = col(i + 2); x.lineWidth = q * (0.12 + r() * 0.12); x.beginPath(); let a = r() * S, b = r() * S; x.moveTo(a, b); for (let k = 0; k < 6; k++) { a += (r() - 0.5) * q * 1.6; b += (r() - 0.5) * q * 1.6; x.lineTo(a, b); } x.stroke(); }
      x.strokeStyle = '#1b1d20'; x.lineWidth = 3; for (let i = 0; i < 2; i++) { const a = r() * S * 0.6, b = r() * S * 0.7 + 20; x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(a + 20, b - 30, a + 40, b); x.quadraticCurveTo(a + 60, b + 30, a + 80, b); x.stroke(); }
      break;
    case 'grain': // 木目（家具の板）
      for (let i = 0; i < 22; i++) { x.strokeStyle = `rgba(70,40,15,${(0.06 + r() * 0.1).toFixed(3)})`; x.lineWidth = 1 + r() * 2; const y = r() * S; x.beginPath(); for (let k = 0; k <= 8; k++) x.lineTo(k * S / 8, y + Math.sin(k * 0.9 + i) * 3 + (r() - 0.5) * 2); x.stroke(); }
      speck(60, 0.03);
      break;
    case 'fabric': // 布（ソファ・クッションの織り目）
      for (let i = 0; i < S; i += 4) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(i, 0, 1, S); x.fillRect(0, i, S, 1); }
      speck(160, 0.03);
      break;
    case 'vend': // 自動販売機の窓（ならんだ飲み物とねだん）
      x.fillStyle = shade(c1, 1.05); x.fillRect(0, 0, S, S);
      for (let j = 0; j < 3; j++) {
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, (j + 1) * S / 3 - 6, S, 6);
        for (let i = 0; i < 6; i++) { const cx = (i + 0.5) * S / 6, by = (j + 1) * S / 3 - 14, c = col(i + j * 2); x.fillStyle = c; x.fillRect(cx - 7, by - 22, 14, 22); x.fillRect(cx - 3, by - 28, 6, 6); x.fillStyle = 'rgba(255,255,255,0.4)'; x.fillRect(cx - 5, by - 18, 3, 14); x.fillStyle = '#1b1d20'; x.fillRect(cx - 6, by + 2, 12, 5); }
      }
      break;
    case 'tatami': { // たたみ（い草のすじ・ふちの帯）。1枚に2畳（たて・よこ）
      x.fillStyle = 'rgba(70,90,30,0.16)'; for (let i = 0; i < S; i += 5) x.fillRect(0, i, S, 2);
      x.fillStyle = 'rgba(255,255,230,0.10)'; for (let i = 2; i < S; i += 9) x.fillRect(0, i, S, 1);
      speck(70, 0.03); x.fillStyle = col(0); x.fillRect(0, 0, S, 9); x.fillRect(0, S / 2 - 4, S, 9); x.fillRect(0, 0, 3, S);
      break;
    }
    case 'clock': { // 時計の文字ばん（目もりと針）
      const c = S / 2; x.fillStyle = col(0);
      for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, rr = k % 3 ? 5 : 9; x.fillRect(c + Math.cos(a) * S * 0.4 - rr, c + Math.sin(a) * S * 0.4 - rr, rr * 2, rr * 2); }
      x.strokeStyle = col(0); x.lineCap = 'round'; x.lineWidth = S * 0.045; x.beginPath(); x.moveTo(c, c); x.lineTo(c + S * 0.2, c - S * 0.12); x.stroke();
      x.lineWidth = S * 0.03; x.beginPath(); x.moveTo(c, c); x.lineTo(c - S * 0.05, c - S * 0.33); x.stroke();
      break;
    }
    case 'rooftile': { // 屋根がわら（横にならんだかわら。段ごとにずれた継ぎ目・かげ・つや）
      for (let j = 0; j < 4; j++) {
        const y0 = j * q; x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, y0 + q * 0.8, S, q * 0.2);
        x.fillStyle = 'rgba(255,255,255,0.13)'; x.fillRect(0, y0 + q * 0.08, S, q * 0.16);
        for (let i = 0; i < 8; i++) { const cx = i * S / 8 + (j % 2 ? S / 16 : 0); x.fillStyle = col(0); wrap((a, b) => x.fillRect(a, b, 4, q * 0.8), cx, y0, 8); }
      }
      break;
    }
    case 'tile': { // タイル（目地）
      const n = 4, t = S / n; x.fillStyle = col(0);
      for (let i = 0; i < n; i++) { x.fillRect(0, i * t, S, 3); x.fillRect(i * t, 0, 3, S); }
      x.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) x.fillRect(i * t + 6, j * t + 6, t * 0.35, 3);
      break;
    }
    case 'shoji': { // しょうじ（白い紙と木のこうし）
      x.fillStyle = col(0); const c = 3, rws = 4;
      for (let i = 0; i <= c; i++) x.fillRect(i * S / c - 3, 0, 6, S);
      for (let j = 0; j <= rws; j++) x.fillRect(0, j * S / rws - 3, S, 6);
      x.fillStyle = 'rgba(0,0,0,0.04)'; for (let i = 0; i < 30; i++) x.fillRect(r() * S, r() * S, 10 + r() * 20, 2);
      break;
    }
    case 'floorwood': { // フローリング（ずらして並んだ板）
      const n = 6, t = S / n;
      for (let j = 0; j < n; j++) {
        let a = -Math.floor(r() * S * 0.5);
        while (a < S) { const L = S * (0.35 + r() * 0.5); x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${(0.03 + r() * 0.06).toFixed(3)})`; x.fillRect(a, j * t, L, t); x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(a, j * t, 2, t); a += L; }
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, j * t, S, 2);
      }
      x.fillStyle = 'rgba(0,0,0,0.05)'; for (let i = 0; i < 60; i++) x.fillRect(r() * S, r() * S, 12 + r() * 30, 1);
      break;
    }
    case 'cabinet': // 台所の戸だな（とびらと取っ手）
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, 0, 3, S); x.fillRect(0, S * 0.24, S, 3);
      x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(6, S * 0.3, S - 12, 2);
      x.fillStyle = col(0); x.fillRect(S * 0.72, S * 0.1, S * 0.16, 4); x.fillRect(S * 0.8, S * 0.36, 5, S * 0.22);
      break;
    case 'books': // 本だなの本（いろいろな色と高さの背表紙）
      for (let j = 0; j < 4; j++) {
        const y1 = (j + 1) * S / 4 - 4; x.fillStyle = shade(c1, 0.7); x.fillRect(0, y1, S, 4);
        for (let a = 2; a < S - 4;) { const w = 5 + Math.floor(r() * 7), hh = S / 4 * (0.6 + r() * 0.32); x.fillStyle = col(Math.floor(r() * 8)); x.fillRect(a, y1 - hh, w, hh); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(a + 1, y1 - hh * 0.8, w - 2, 2); a += w + 1; }
      }
      break;
    case 'chain': // 金あみのフェンス（ひし形のあみ目）
      x.fillStyle = shade(c1, 0.42); x.fillRect(0, 0, S, S);
      x.strokeStyle = c1; x.lineWidth = 2.2;
      for (let k = -8; k <= 8; k++) { x.beginPath(); x.moveTo(k * q / 2, 0); x.lineTo(k * q / 2 + S, S); x.stroke(); x.beginPath(); x.moveTo(k * q / 2, S); x.lineTo(k * q / 2 + S, 0); x.stroke(); }
      break;
    case 'blockwall': // ブロック塀（目地と、ところどころに花の形の穴）
      x.fillStyle = 'rgba(0,0,0,0.28)';
      for (let j = 0; j < 4; j++) { x.fillRect(0, j * q, S, 3); for (let i = 0; i < 2; i++) x.fillRect(i * S / 2, j * q, 3, q); }
      for (const [a, b] of [[S * 0.25, q * 1.5], [S * 0.75, q * 3.5]]) { x.fillStyle = 'rgba(0,0,0,0.55)'; for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(a + Math.cos(k * 1.571) * q * 0.16, b + Math.sin(k * 1.571) * q * 0.16, q * 0.14, 0, 6.2832); x.fill(); } }
      speck(120, 0.04);
      break;
    case 'aqua': { // 水そう（水・水草・魚・あわ・じゃり）
      const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#9fdcf0'); g.addColorStop(1, '#2f7fb0'); x.fillStyle = g; x.fillRect(0, 0, S, S);
      x.fillStyle = '#d9c49a'; x.fillRect(0, S * 0.86, S, S * 0.14); for (let i = 0; i < 40; i++) { x.fillStyle = r() < 0.5 ? '#b8a07a' : '#efe2c4'; x.fillRect(r() * S, S * 0.86 + r() * S * 0.12, 3, 3); }
      x.strokeStyle = '#3f9b4a'; x.lineWidth = 4; for (let i = 0; i < 6; i++) { const a = r() * S; x.beginPath(); x.moveTo(a, S * 0.88); for (let k = 1; k <= 6; k++) x.lineTo(a + Math.sin(k + i) * 6, S * 0.88 - k * S * 0.08); x.stroke(); }
      for (let i = 0; i < 5; i++) { const a = 20 + r() * (S - 40), b = 20 + r() * S * 0.6, c = col(i); x.fillStyle = c; x.beginPath(); x.ellipse(a, b, 9, 5, 0, 0, 6.2832); x.fill(); x.beginPath(); x.moveTo(a - 8, b); x.lineTo(a - 15, b - 5); x.lineTo(a - 15, b + 5); x.closePath(); x.fill(); }
      x.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 0; i < 10; i++) { x.beginPath(); x.arc(S * 0.8 + r() * 10, r() * S * 0.8, 2 + r() * 2, 0, 6.2832); x.fill(); }
      break;
    }
    case 'pegboard': // 有孔ボード（工具をかける板の穴）
      speck(60, 0.03); x.fillStyle = 'rgba(0,0,0,0.5)';
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { x.beginPath(); x.arc((i + 0.5) * S / 6, (j + 0.5) * S / 6, 2.6, 0, 6.2832); x.fill(); }
      break;
    case 'scales': // うろこ（こいのぼり・魚）
      x.lineWidth = 3;
      for (let j = 0; j < 5; j++) for (let i = -1; i < 5; i++) { const cx = i * S / 4 + (j % 2 ? S / 8 : 0), cy = j * S / 4; x.fillStyle = col(j); x.beginPath(); x.arc(cx, cy, S / 8, 0, Math.PI); x.fill(); x.strokeStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.arc(cx, cy, S / 8, 0, Math.PI); x.stroke(); }
      break;
    case 'cork': // コルクの板
      for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(90,50,20,0.22)' : 'rgba(255,230,190,0.18)'; x.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3); }
      break;
    case 'shutter': // シャッター（よこのみぞ）
      for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(0, i * S / 8, S, 3); x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(0, i * S / 8 + 3, S, 2); }
      speck(40, 0.03);
      break;
    case 'grate': // 金あみの床・たな
      x.strokeStyle = col(0); x.lineWidth = 3;
      for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * S / 8, 0); x.lineTo(i * S / 8, S); x.stroke(); x.beginPath(); x.moveTo(0, i * S / 8); x.lineTo(S, i * S / 8); x.stroke(); }
      break;
    case 'plaid': // チェックの布
      x.globalAlpha = 0.45; x.fillStyle = col(0); for (let i = 0; i < 4; i += 2) { x.fillRect(i * q, 0, q, S); x.fillRect(0, i * q, S, q); }
      x.globalAlpha = 0.6; x.fillStyle = col(1); x.fillRect(q * 1.4, 0, 4, S); x.fillRect(0, q * 1.4, S, 4); x.fillRect(q * 3.4, 0, 4, S); x.fillRect(0, q * 3.4, S, 4); x.globalAlpha = 1;
      break;
    case 'adobe': // 日干しれんが（土のかべ）
      speck(200, 0.05); x.fillStyle = 'rgba(80,50,20,0.16)';
      for (let j = 0; j < 4; j++) { x.fillRect(0, j * q, S, 3); for (let i = 0; i < 2; i++) x.fillRect(((i * S / 2 + (j % 2 ? S / 4 : 0)) % S), j * q, 3, q); }
      break;
    case 'hiero': { // 古代の壁の絵文字（目・鳥・波・羽・丸）
      x.fillStyle = 'rgba(60,40,20,0.12)'; for (let i = 1; i < 4; i++) x.fillRect(i * q - 1, 0, 2, S);
      const sym = (k, a, b) => {
        x.fillStyle = col(k); x.strokeStyle = col(k); x.lineWidth = 3;
        if (k % 5 === 0) { x.beginPath(); x.ellipse(a, b, 11, 6, 0, 0, 6.2832); x.stroke(); x.beginPath(); x.arc(a, b, 3.5, 0, 6.2832); x.fill(); }
        else if (k % 5 === 1) { x.beginPath(); x.ellipse(a, b, 9, 6, 0, 0, 6.2832); x.fill(); x.beginPath(); x.moveTo(a + 7, b - 3); x.lineTo(a + 14, b - 6); x.lineTo(a + 8, b + 1); x.fill(); x.fillRect(a - 3, b + 5, 2, 7); x.fillRect(a + 2, b + 5, 2, 7); }
        else if (k % 5 === 2) { x.beginPath(); for (let i = 0; i <= 6; i++) x.lineTo(a - 12 + i * 4, b + (i % 2 ? -4 : 4)); x.stroke(); }
        else if (k % 5 === 3) { x.beginPath(); x.ellipse(a, b, 4, 12, 0.2, 0, 6.2832); x.fill(); }
        else { x.beginPath(); x.arc(a, b - 4, 6, 0, 6.2832); x.stroke(); x.fillRect(a - 1.5, b + 2, 3, 12); x.fillRect(a - 7, b + 4, 14, 3); }
      };
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) sym(i * 3 + j * 2 + Math.floor(r() * 2), i * q + q / 2, j * q + q / 2);
      break;
    }
    case 'frost': // しもがついた（冷凍庫）
      for (let i = 0; i < 220; i++) { x.fillStyle = `rgba(255,255,255,${(0.08 + r() * 0.2).toFixed(3)})`; x.beginPath(); x.arc(r() * S, r() * S, 1 + r() * 4, 0, 6.2832); x.fill(); }
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
  { const a = kind.split('|'); if (EXTRA[a[0]]) { EXTRA[a[0]](x, S, c1, P, r, a.slice(1), u); return; } }
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

// ---- 看板の文字・はり紙・標識・旗など（kind = '名前|引数|…'）----
const JFONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",system-ui,sans-serif';
// 文字を箱にぴったり入れる（v = たて書き）
function fitText(x, t, cx, cy, w, h, col, v, weight = 900, stroke) {
  x.fillStyle = col; x.textAlign = 'center'; x.textBaseline = 'middle';
  const ch = Array.from(t);
  if (v) {
    let fs = Math.min(w * 0.92, h / ch.length * 0.98);
    x.font = `${weight} ${fs}px ${JFONT}`;
    const top = cy - fs * ch.length / 2 + fs / 2;
    ch.forEach((c, i) => { if (stroke) { x.lineWidth = fs * 0.12; x.strokeStyle = stroke; x.strokeText(c, cx, top + i * fs); } x.fillText(c, cx, top + i * fs); });
  } else {
    let fs = h * 0.9; x.font = `${weight} ${fs}px ${JFONT}`;
    const mw = x.measureText(t).width; if (mw > w) { fs *= w / mw; x.font = `${weight} ${fs}px ${JFONT}`; }
    if (stroke) { x.lineWidth = fs * 0.12; x.strokeStyle = stroke; x.strokeText(t, cx, cy + fs * 0.04); }
    x.fillText(t, cx, cy + fs * 0.04);
  }
}
// 面の縦横の比（asp = 横 / 縦）に合わせて、文字がのびないように描く
function aspect(x, S, asp, fn) {
  x.save();
  if (asp >= 1) { x.scale(1 / asp, 1); fn(S * asp, S); } else { x.scale(1, asp); fn(S, S / asp); }
  x.restore();
}
const EXTRA = {
  // 看板の文字：artTxt|文字|h か v|横/縦の比|わく(0/1)
  artTxt(x, S, c1, P, r, a) {
    const [t = '', mode = 'h', asp = '1', fr = '1'] = a, v = mode === 'v';
    aspect(x, S, Number(asp) || 1, (W, H) => {
      if (fr === '1') { x.strokeStyle = P[1] || P[0]; x.lineWidth = Math.min(W, H) * 0.06; x.strokeRect(x.lineWidth / 2 + 2, x.lineWidth / 2 + 2, W - x.lineWidth - 4, H - x.lineWidth - 4); }
      const m = Math.min(W, H) * (fr === '1' ? 0.16 : 0.08);
      fitText(x, t, W / 2, H / 2, W - 2 * m, H - 2 * m, P[0], v, 900, P[2]);
    });
  },
  // のれん：artNoren|文字|何枚目|全部で何枚
  artNoren(x, S, c1, P, r, a) {
    const t = a[0] || '', i = Number(a[1]) || 0, n = Number(a[2]) || 1, ch = Array.from(t);
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(0, S * 0.86, S, S * 0.03);
    const per = Math.ceil(ch.length / n), part = ch.slice(i * per, i * per + per).join('');
    if (part) fitText(x, part, S / 2, S * 0.45, S * 0.8, S * 0.62, P[0], true);
  },
  // はり紙：artPaper|種類（0〜7）
  artPaper(x, S, c1, P, r, a) {
    const k = Number(a[0]) || 0, p = i => P[i % P.length], u = S / 256;
    const R = (c, a1, b, w, h) => { x.fillStyle = c; x.fillRect(a1 * u, b * u, w * u, h * u); };
    const C = (c, a1, b, rad) => { x.fillStyle = c; x.beginPath(); x.arc(a1 * u, b * u, rad * u, 0, 6.2832); x.fill(); };
    const lines = (y0, n, w = 200) => { for (let i = 0; i < n; i++) R('rgba(40,40,50,0.55)', 28, y0 + i * 18, w * (0.55 + r() * 0.45), 6); };
    if (k === 0) { R(p(0), 0, 0, 256, 56); fitText(x, ['おしらせ', 'ぼしゅう', 'ちゅうい', 'お祭り', 'イベント'][Math.floor(r() * 5)], S / 2, 28 * u, 220 * u, 44 * u, '#ffffff', false); lines(80, 8); }
    else if (k === 1) { R('#bfe3f2', 0, 0, 256, 150); C('#ffd23a', 200, 50, 26); R('#7fbf5f', 0, 150, 256, 106); R(p(1), 70, 110, 80, 70); x.fillStyle = p(2); x.beginPath(); x.moveTo(60 * u, 112 * u); x.lineTo(110 * u, 70 * u); x.lineTo(160 * u, 112 * u); x.fill(); R('#6b4a2b', 98, 140, 22, 40); }
    else if (k === 2) { R('#f4f4f4', 0, 0, 256, 256); R(p(0), 16, 16, 224, 160); R(shade(p(0), 0.7), 16, 120, 224, 56); C('#fff4c2', 190, 60, 18); lines(196, 3); }
    else if (k === 3) { R('#f4f4f4', 0, 0, 256, 256); for (let i = 0; i < 6; i++) { const hh = 40 + r() * 140; R(p(i), 28 + i * 36, 220 - hh, 24, hh); } R('#2a3038', 22, 220, 214, 4); R('#2a3038', 22, 30, 4, 194); }
    else if (k === 4) { R('#f4f4f4', 0, 0, 256, 256); R(p(0), 0, 0, 256, 40); x.strokeStyle = 'rgba(40,40,50,0.5)'; x.lineWidth = 2 * u; for (let i = 0; i <= 7; i++) { x.beginPath(); x.moveTo((16 + i * 32) * u, 48 * u); x.lineTo((16 + i * 32) * u, 240 * u); x.stroke(); } for (let j = 0; j <= 5; j++) { x.beginPath(); x.moveTo(16 * u, (48 + j * 38) * u); x.lineTo(240 * u, (48 + j * 38) * u); x.stroke(); } for (let i = 0; i < 5; i++) C(p(i + 1), 32 + Math.floor(r() * 7) * 32, 66 + Math.floor(r() * 5) * 38, 9); }
    else if (k === 5) { R('#efe6cf', 0, 0, 256, 256); x.strokeStyle = '#7f9fbf'; x.lineWidth = 10 * u; x.beginPath(); x.moveTo(0, 90 * u); x.bezierCurveTo(80 * u, 60 * u, 150 * u, 180 * u, 256 * u, 150 * u); x.stroke(); x.strokeStyle = '#c9a26b'; x.lineWidth = 6 * u; x.beginPath(); x.moveTo(60 * u, 0); x.lineTo(110 * u, 256 * u); x.moveTo(0, 200 * u); x.lineTo(256 * u, 210 * u); x.stroke(); C('#e0413a', 140, 120, 12); C('#ffffff', 140, 120, 5); }
    else if (k === 6) { R('#f3e3b0', 0, 0, 256, 256); fitText(x, 'さがしています', S / 2, 30 * u, 220 * u, 40 * u, '#5a2a1a', false); C(p(0), 128, 130, 62); C('#1b1d20', 108, 120, 7); C('#1b1d20', 148, 120, 7); R('#1b1d20', 112, 152, 32, 5); lines(206, 2); }
    else { R(p(0), 0, 0, 256, 256); for (let i = 0; i < 14; i++) { x.fillStyle = p(i + 1); x.beginPath(); x.arc(r() * S, r() * S, (8 + r() * 26) * u, 0, 6.2832); x.fill(); } R('#ffffff', 20, 190, 216, 48); fitText(x, ['SALE', '大売出し', 'NEW', 'ひみつ', 'ぬりえ大会'][Math.floor(r() * 5)], S / 2, 214 * u, 200 * u, 40 * u, p(1), false); }
  },
  // 道路標識の中の絵：artRoad|種類
  artRoad(x, S, c1, P, r, a) {
    const k = a[0], u = S / 256;
    if (k === 'stop') fitText(x, '止まれ', S / 2, S * 0.4, S * 0.7, S * 0.36, '#ffffff', false);
    else if (k === 'speed') { fitText(x, String(a[1] || '40'), S / 2, S / 2, S * 0.8, S * 0.62, '#2a5fb0', false); }
    else if (k === 'warn') fitText(x, '！', S / 2, S / 2, S * 0.6, S * 0.7, '#1b1d20', false);
    else if (k === 'work') { x.fillStyle = '#1b1d20'; x.beginPath(); x.arc(S * 0.45, S * 0.28, S * 0.08, 0, 6.2832); x.fill(); x.lineWidth = S * 0.07; x.strokeStyle = '#1b1d20'; x.lineCap = 'round'; x.beginPath(); x.moveTo(S * 0.45, S * 0.36); x.lineTo(S * 0.4, S * 0.6); x.lineTo(S * 0.3, S * 0.82); x.moveTo(S * 0.4, S * 0.6); x.lineTo(S * 0.52, S * 0.82); x.moveTo(S * 0.44, S * 0.42); x.lineTo(S * 0.66, S * 0.56); x.stroke(); x.fillRect(S * 0.6, S * 0.7, S * 0.22, S * 0.12); }
    else if (k === 'P') fitText(x, 'P', S / 2, S / 2, S * 0.7, S * 0.8, '#ffffff', false);
    else if (k === 'walk') { x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(S * 0.5, S * 0.1); x.lineTo(S * 0.9, S * 0.85); x.lineTo(S * 0.1, S * 0.85); x.closePath(); x.fill(); x.fillStyle = '#1b1d20'; x.beginPath(); x.arc(S * 0.52, S * 0.36, S * 0.06, 0, 6.2832); x.fill(); x.lineWidth = S * 0.06; x.strokeStyle = '#1b1d20'; x.lineCap = 'round'; x.beginPath(); x.moveTo(S * 0.5, S * 0.44); x.lineTo(S * 0.46, S * 0.62); x.lineTo(S * 0.38, S * 0.76); x.moveTo(S * 0.46, S * 0.62); x.lineTo(S * 0.56, S * 0.76); x.stroke(); for (let i = 0; i < 4; i++) x.fillRect(S * (0.22 + i * 0.15), S * 0.79, S * 0.08, S * 0.04); }
    else fitText(x, a[1] || '徐行', S / 2, S / 2, S * 0.8, S * 0.5, '#1b1d20', false);
  },
  // 非常口（みどりの板・走る人・ドア）
  artExit(x, S, c1, P, r, a) {
    aspect(x, S, 2.4, (W, H) => {
      x.fillStyle = '#ffffff'; x.fillRect(W * 0.08, H * 0.12, W * 0.26, H * 0.76); x.fillStyle = c1; x.fillRect(W * 0.12, H * 0.18, W * 0.18, H * 0.64);
      x.fillStyle = '#ffffff'; x.beginPath(); x.arc(W * 0.5, H * 0.26, H * 0.11, 0, 6.2832); x.fill();
      x.strokeStyle = '#ffffff'; x.lineCap = 'round'; x.lineWidth = H * 0.12; x.beginPath(); x.moveTo(W * 0.5, H * 0.42); x.lineTo(W * 0.46, H * 0.62); x.lineTo(W * 0.36, H * 0.84); x.moveTo(W * 0.46, H * 0.62); x.lineTo(W * 0.58, H * 0.86); x.moveTo(W * 0.4, H * 0.45); x.lineTo(W * 0.6, H * 0.52); x.stroke();
      fitText(x, 'EXIT', W * 0.8, H * 0.5, W * 0.3, H * 0.5, '#ffffff', false);
    });
  },
  // 旗：artFlag|がら|何本目|全部で何本（横に切って、なみうつ板に1枚ずつはる）
  artFlag(x, S, c1, P, r, a) {
    const d = a[0] || 'stripe', i = Number(a[1]) || 0, n = Number(a[2]) || 1, p = k => P[k % P.length];
    x.save(); x.scale(n, 1); x.translate(-i * S / n, 0); // 旗ぜんたい（横 S、縦 S）の i 番目のたての帯だけが見える
    const W = S, H = S;
    if (d === 'stripe') { for (let k = 0; k < 3; k++) { x.fillStyle = p(k); x.fillRect(0, k * H / 3, W, H / 3 + 1); } }
    else if (d === 'band') { for (let k = 0; k < 3; k++) { x.fillStyle = p(k); x.fillRect(k * W / 3, 0, W / 3 + 1, H); } }
    else if (d === 'star') { x.fillStyle = c1; x.fillRect(0, 0, W, H); x.fillStyle = p(0); x.beginPath(); for (let k = 0; k < 10; k++) { const t = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? H * 0.14 : H * 0.32; x.lineTo(W * 0.5 + Math.cos(t) * rr, H * 0.5 + Math.sin(t) * rr); } x.fill(); }
    else if (d === 'check') { const m = 6; for (let a1 = 0; a1 < m; a1++) for (let b = 0; b < m; b++) { x.fillStyle = (a1 + b) % 2 ? '#15171a' : '#ffffff'; x.fillRect(a1 * W / m, b * H / m, W / m + 1, H / m + 1); } }
    else if (d === 'diag') { x.fillStyle = c1; x.fillRect(0, 0, W, H); x.fillStyle = p(0); x.beginPath(); x.moveTo(0, H); x.lineTo(W, 0); x.lineTo(W, H); x.fill(); x.fillStyle = p(1); x.beginPath(); x.arc(W * 0.28, H * 0.3, H * 0.14, 0, 6.2832); x.fill(); }
    else if (d === 'fish') { x.fillStyle = c1; x.fillRect(0, 0, W, H); for (let k = 0; k < 4; k++) { x.fillStyle = p(k); x.fillRect(0, H * (0.7 + k * 0.075), W, H * 0.075); } x.fillStyle = p(1); x.beginPath(); x.ellipse(W * 0.48, H * 0.36, W * 0.26, H * 0.16, 0, 0, 6.2832); x.fill(); x.beginPath(); x.moveTo(W * 0.72, H * 0.36); x.lineTo(W * 0.9, H * 0.2); x.lineTo(W * 0.9, H * 0.52); x.fill(); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(W * 0.32, H * 0.32, H * 0.04, 0, 6.2832); x.fill(); fitText(x, a[3] || '大漁', W * 0.5, H * 0.6, W * 0.6, H * 0.14, p(0), false); }
    else { x.fillStyle = c1; x.fillRect(0, 0, W, H); x.fillStyle = p(0); x.beginPath(); x.arc(W * 0.5, H * 0.5, H * 0.3, 0, 6.2832); x.fill(); fitText(x, a[3] || '★', W * 0.5, H * 0.5, H * 0.4, H * 0.4, p(1), false); }
    x.restore();
  },
  // 黒板のメニュー・ホワイトボード：artChalk|0/1
  artChalk(x, S, c1, P, r, a) {
    const white = a[0] === '1', ink = white ? ['#2f6fb0', '#e0413a', '#2a3038'] : ['#f4f4f4', '#ffd96b', '#ff9bb8'], u = S / 256;
    x.strokeStyle = ink[0]; x.lineWidth = 3 * u; x.lineCap = 'round';
    fitText(x, white ? ['きょうの予定', 'かいぎ', 'TODO', '作業メモ'][Math.floor(r() * 4)] : ['おすすめ', 'MENU', 'きょうの定食', 'ランチ'][Math.floor(r() * 4)], S / 2, 30 * u, 200 * u, 40 * u, ink[1], false, 700);
    for (let i = 0; i < 6; i++) { const y = 70 + i * 28; x.beginPath(); x.moveTo(30 * u, y * u); for (let k = 0; k < 8; k++) x.lineTo((30 + k * 14 + r() * 6) * u, (y + (r() - 0.5) * 6) * u); x.stroke(); x.fillStyle = ink[2]; x.fillRect(190 * u, (y - 6) * u, 36 * u, 10 * u); }
    if (white) { x.strokeStyle = ink[1]; x.strokeRect(150 * u, 60 * u, 70 * u, 40 * u); x.beginPath(); x.moveTo(150 * u, 80 * u); x.lineTo(110 * u, 120 * u); x.stroke(); }
    else { x.fillStyle = ink[2]; x.beginPath(); x.arc(200 * u, 220 * u, 18 * u, 0, 6.2832); x.fill(); }
  },
  // 画面（モニター）：artScreen|種類
  artScreen(x, S, c1, P, r, a) {
    const k = Number(a[0]) || 0, u = S / 256;
    x.fillStyle = '#0d1a24'; x.fillRect(0, 0, S, S);
    if (k === 0) { x.strokeStyle = '#3dff9a'; x.lineWidth = 3 * u; for (let j = 0; j < 3; j++) { x.beginPath(); for (let i = 0; i <= 64; i++) x.lineTo(i * 4 * u, (60 + j * 70 + Math.sin(i * 0.4 + j) * (10 + r() * 20)) * u); x.stroke(); } }
    else if (k === 1) { x.fillStyle = '#2f6f4a'; x.fillRect(0, 0, S, S); x.strokeStyle = '#9fd0a8'; x.lineWidth = 2 * u; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(128 * u, 128 * u, (20 + i * 20) * u, 0, 6.2832); x.stroke(); } x.fillStyle = '#ff6a14'; x.beginPath(); x.arc((128 + r() * 40) * u, (128 - r() * 40) * u, 10 * u, 0, 6.2832); x.fill(); }
    else if (k === 2) { for (let i = 0; i < 4; i++) { x.fillStyle = ['#3a4a5e', '#4a5a4a', '#5a4a3a', '#3a3a5a'][i]; x.fillRect((i % 2) * 128 * u + 4, Math.floor(i / 2) * 128 * u + 4, 120 * u, 120 * u); } }
    else { for (let i = 0; i < 8; i++) { x.fillStyle = ['#ff6a14', '#ffd23a', '#3dff9a', '#33eaff'][i % 4]; const hh = 30 + r() * 180; x.fillRect((20 + i * 28) * u, (230 - hh) * u, 18 * u, hh * u); } }
  },
  // ちょうちん：artChochin|文字（まわりの4分の1に、たて書き）
  artChochin(x, S, c1, P, r, a) {
    x.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 12; i++) x.fillRect(0, i * S / 12, S, 2);
    fitText(x, a[0] || '祭', S * 0.25, S / 2, S * 0.2, S * 0.7, P[0] || '#1b1d20', true);
    fitText(x, a[0] || '祭', S * 0.75, S / 2, S * 0.2, S * 0.7, P[0] || '#1b1d20', true);
  }
};
