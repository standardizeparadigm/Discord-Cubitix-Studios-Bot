// =============================================================
//  minigames - các hàm thuần (pure) tính toán cho mini game
//  Tách riêng để dễ kiểm thử, không phụ thuộc discord.js.
// =============================================================

// --- Mines ---
// Hệ số nhân sau khi mở an toàn `safe` ô trên lưới `total` ô có `mines` mìn.
// Công thức công bằng: tích (ô còn lại / ô an toàn còn lại), trừ phí nhà cái.
const MINES_EDGE = 0.05;
function minesMultiplier(total, mines, safe) {
  const safeTotal = total - mines;
  if (safe <= 0) return 1;
  if (safe > safeTotal) safe = safeTotal;
  let m = 1;
  for (let i = 0; i < safe; i++) {
    m *= (total - i) / (safeTotal - i);
  }
  m *= (1 - MINES_EDGE);
  return Math.max(1, m);
}

// --- High / Low ---
// Bài 1..13. Ba lựa chọn riêng biệt:
//   high  : lá sau > lá hiện tại
//   low   : lá sau < lá hiện tại
//   equal : lá sau = lá hiện tại (tỉ lệ thấp, thưởng cao)
const HL_EDGE = 0.08;
function highlowWinProb(value, guess) {
  if (guess === 'high') return (13 - value) / 13;
  if (guess === 'low') return (value - 1) / 13;
  return 1 / 13; // equal
}
function highlowFactor(value, guess) {
  const p = highlowWinProb(value, guess);
  if (p <= 0) return 0; // không thể thắng (ví dụ đoán cao khi đang là K)
  return (1 - HL_EDGE) / p;
}
function highlowWin(value, guess, next) {
  if (guess === 'high') return next > value;
  if (guess === 'low') return next < value;
  return next === value;
}

module.exports = {
  MINES_EDGE, minesMultiplier,
  HL_EDGE, highlowWinProb, highlowFactor, highlowWin,
};
