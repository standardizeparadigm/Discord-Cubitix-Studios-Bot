// =============================================================
//  dayCycle - mốc "ngày" theo giờ Việt Nam (UTC+7)
//  Mọi thứ reset lúc 00:00 giờ VN: điểm danh (daily) và nhiệm vụ (quest).
//  Việt Nam không đổi giờ mùa hè nên độ lệch luôn cố định +7 giờ.
// =============================================================
const OFFSET_MIN = 7 * 60; // UTC+7
const OFFSET_MS = OFFSET_MIN * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function safeNow(now) {
  return typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
}

// Khoá ngày dạng 'YYYY-MM-DD' theo giờ VN.
function dayKey(now) {
  return new Date(safeNow(now) + OFFSET_MS).toISOString().slice(0, 10);
}

// Mốc 00:00 giờ VN của ngày chứa `now` (trả về timestamp UTC).
function startOfDay(now) {
  const t = safeNow(now);
  return Math.floor((t + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS;
}

// Mốc 00:00 giờ VN của ngày kế tiếp.
function nextMidnight(now) {
  return startOfDay(now) + DAY_MS;
}

function msUntilMidnight(now) {
  const t = safeNow(now);
  return Math.max(0, nextMidnight(t) - t);
}

// `ts` có nằm trong ngày (giờ VN) chứa `now` không?
function isToday(ts, now) {
  if (!ts) return false;
  return dayKey(ts) === dayKey(now);
}

// `ts` có phải "hôm qua" (giờ VN) so với `now` không?
function isYesterday(ts, now) {
  if (!ts) return false;
  return dayKey(ts) === dayKey(startOfDay(now) - 1);
}

// Đếm ngược dạng "3 giờ 12 phút" / "12 phút" / "< 1 phút".
function humanUntilMidnight(now) {
  const left = msUntilMidnight(now);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  if (h > 0) return `${h} giờ ${m} phút`;
  if (m > 0) return `${m} phút`;
  return 'chưa tới 1 phút';
}

module.exports = {
  OFFSET_MIN,
  DAY_MS,
  dayKey,
  startOfDay,
  nextMidnight,
  msUntilMidnight,
  isToday,
  isYesterday,
  humanUntilMidnight,
};
