// =============================================================
//  antiAutomation - HỆ THỐNG CHỐNG BOT / MACRO TỰ ĐỘNG ĐÁNH LỆNH
//
//  File này là LÕI TÍNH TOÁN THUẦN (không dùng discord.js) nên kiểm thử
//  được độc lập và không bao giờ làm sập bot.
//
//  Ý tưởng: con người gõ lệnh có "nhịp" rất lộn xộn, còn macro/autoclicker
//  thì đều như máy đếm nhịp. Ta không dựa vào MỘT dấu hiệu duy nhất (dễ oan)
//  mà chấm điểm NHIỀU dấu hiệu độc lập rồi cộng có trọng số:
//
//   1) rhythm     - độ đều của khoảng cách giữa các lệnh (hệ số biến thiên CV thấp)
//   2) speed      - phản xạ nhanh hơn mức con người làm được + tốc độ lệnh/phút
//   3) cadence    - khoảng cách lặp đúng một con số (bấm theo đồng hồ)
//   4) repetition - vòng lặp lệnh cố định, độ đa dạng lệnh thấp
//   5) endurance  - chơi liên tục hàng giờ không hề có quãng nghỉ của người
//   6) nosleep    - hoạt động rải đủ 24 giờ, kể cả 2-5 giờ sáng
//   7) snipe      - bấm lệnh đúng mili-giây sau khi hết thời gian chờ
//
//  Điểm 0-100. Ngưỡng: watch -> challenge (bắt xác minh) -> block (khoá tạm).
//  Có "minSamples" để KHÔNG BAO GIỜ kết luận khi chưa đủ dữ liệu.
// =============================================================
'use strict';

const DEFAULTS = {
  // --- Kích thước dữ liệu quan sát ---
  historySize: 80, // giữ 80 lệnh gần nhất của mỗi người
  minSamples: 12, // chưa đủ số lệnh này thì tuyệt đối không kết luận
  idleForgetMs: 6 * 60 * 60 * 1000, // 6 giờ không dùng lệnh -> xoá bộ nhớ tạm

  // --- 1) Nhịp gõ ---
  rhythmMinSamples: 8,
  rhythmCvStrict: 0.1, // CV <= 0.10 -> gần như chắc chắn là máy
  rhythmCvLoose: 0.3, // CV >= 0.30 -> coi như bình thường

  // --- 2) Tốc độ ---
  humanFloorMs: 700, // dưới mức này là nhanh bất thường
  burstFloorMs: 300, // dưới mức này thì con người không kịp đọc/gõ
  rateWindowMs: 60 * 1000,
  maxPerMinute: 20, // trên mức này là tốc độ của máy

  // --- 3) Bấm theo đồng hồ ---
  cadenceBucketMs: 100, // gom khoảng cách theo bậc 100ms
  cadenceMinSamples: 6,
  cadenceRatioLoose: 0.45, // tỉ lệ trùng bậc bắt đầu bị nghi
  cadenceRatioStrict: 0.8, // tỉ lệ trùng bậc gần như chắc chắn là máy

  // --- 4) Lặp lệnh ---
  cycleMinLen: 1,
  cycleMaxLen: 6,
  cycleMinRepeats: 3,
  cycleFullRepeats: 6,
  diversityWindow: 12, // xét độ đa dạng trên 12 lệnh gần nhất

  // --- 5) Cày liên tục ---
  breakMs: 90 * 1000, // nghỉ trên 90 giây được coi là quãng nghỉ của người
  marathonWarnMs: 90 * 60 * 1000, // 1,5 giờ liên tục -> bắt đầu nghi
  marathonFullMs: 4 * 60 * 60 * 1000, // 4 giờ liên tục không nghỉ -> chắc chắn máy

  // --- 6) Không ngủ ---
  offsetMinutes: 7 * 60, // múi giờ dùng để chia giờ trong ngày (UTC+7)
  hourSpreadWarn: 16, // hoạt động ở 16 giờ khác nhau -> nghi
  hourSpreadFull: 22, // 22/24 giờ -> gần như chắc chắn chạy 24/7
  nightHours: [2, 3, 4, 5], // các giờ "phải ngủ"
  hourMinTotal: 40, // cần ít nhất 40 lệnh mới xét chỉ số giờ

  // --- 7) Bấm sát thời gian chờ ---
  snipeToleranceMs: 500, // bấm trong 500ms sau khi hết cooldown = bấm sát
  snipeMinSamples: 5,
  snipeRatioWarn: 0.6,
  snipeRatioFull: 0.92,

  // --- Chấm điểm ---
  weights: {
    rhythm: 22,
    speed: 16,
    cadence: 14,
    repetition: 13,
    endurance: 12,
    nosleep: 10,
    snipe: 13,
  },
  thresholds: { watch: 40, challenge: 62, block: 82 },
};

// Tên tiếng Việt của từng dấu hiệu (dùng để hiển thị cho người chơi/chủ bot).
const SIGNAL_LABELS = {
  rhythm: 'nhịp gõ lệnh đều như máy',
  speed: 'phản xạ nhanh hơn mức con người',
  cadence: 'khoảng cách giữa các lệnh luôn trùng một con số',
  repetition: 'lặp đi lặp lại một chuỗi lệnh cố định',
  endurance: 'chơi liên tục nhiều giờ không nghỉ',
  nosleep: 'hoạt động rải đủ 24 giờ, kể cả đêm khuya',
  snipe: 'bấm lệnh đúng mili-giây sau khi hết thời gian chờ',
};

// =============================================================
//  Các hàm toán học thuần
// =============================================================

function toFiniteArray(values) {
  if (!Array.isArray(values)) return [];
  return values.filter((v) => typeof v === 'number' && Number.isFinite(v));
}

function mean(values) {
  const list = toFiniteArray(values);
  if (!list.length) return 0;
  let sum = 0;
  for (const v of list) sum += v;
  return sum / list.length;
}

function stddev(values) {
  const list = toFiniteArray(values);
  if (list.length < 2) return 0;
  const m = mean(list);
  let acc = 0;
  for (const v of list) acc += (v - m) * (v - m);
  // Phương sai mẫu (chia n-1) để không đánh giá thấp độ lệch khi ít dữ liệu.
  return Math.sqrt(acc / (list.length - 1));
}

// Hệ số biến thiên: độ lệch chuẩn / trung bình. Càng nhỏ càng "đều như máy".
function coefficientOfVariation(values) {
  const list = toFiniteArray(values);
  if (list.length < 2) return 1;
  const m = mean(list);
  if (m <= 0) return 1;
  return stddev(list) / m;
}

function median(values) {
  const list = toFiniteArray(values).slice().sort((a, b) => a - b);
  if (!list.length) return 0;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

// Đưa một giá trị về khoảng 0..1 theo hai mốc (hỗ trợ cả chiều tăng và giảm).
function ramp(value, low, high) {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  if (low === high) return v >= high ? 1 : 0;
  const t = (v - low) / (high - low);
  return Math.max(0, Math.min(1, t));
}

// Độ đa dạng: số lệnh khác nhau / số lệnh đã xét (0..1).
function diversity(sequence, windowSize) {
  const list = Array.isArray(sequence) ? sequence : [];
  const size = Math.max(1, Number(windowSize) || list.length || 1);
  const slice = list.slice(-size);
  if (!slice.length) return 1;
  return new Set(slice).size / slice.length;
}

// Entropy chuẩn hoá 0..1 của một chuỗi (0 = chỉ một loại, 1 = trải đều).
function normalizedEntropy(sequence) {
  const list = Array.isArray(sequence) ? sequence : [];
  if (list.length < 2) return 0;
  const counts = new Map();
  for (const item of list) counts.set(item, (counts.get(item) || 0) + 1);
  if (counts.size < 2) return 0;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / list.length;
    h -= p * Math.log(p);
  }
  return h / Math.log(counts.size);
}

// Tìm vòng lặp ở CUỐI chuỗi: chu kỳ ngắn nhất lặp lại nhiều lần nhất.
// Ví dụ ['fish','fish','work','fish','fish','work'] -> period 3, repeats 2.
function detectCycle(sequence, opts = {}) {
  const list = Array.isArray(sequence) ? sequence : [];
  const minLen = Math.max(1, Number(opts.minLen) || 1);
  const maxLen = Math.max(minLen, Number(opts.maxLen) || 6);
  let best = { period: 0, repeats: 0, covered: 0 };

  for (let period = minLen; period <= maxLen; period++) {
    if (list.length < period * 2) break;
    let repeats = 1;
    // Đếm xem chu kỳ cuối cùng lặp lại được bao nhiêu lần liên tiếp.
    for (let block = 1; (block + 1) * period <= list.length; block++) {
      let same = true;
      for (let i = 0; i < period; i++) {
        const a = list[list.length - 1 - i];
        const b = list[list.length - 1 - i - block * period];
        if (a !== b) {
          same = false;
          break;
        }
      }
      if (!same) break;
      repeats = block + 1;
    }
    const covered = repeats * period;
    // Ưu tiên chu kỳ phủ được nhiều phần tử hơn; bằng nhau thì lấy chu kỳ ngắn.
    if (repeats >= 2 && (covered > best.covered || (covered === best.covered && period < best.period))) {
      best = { period, repeats, covered };
    }
  }
  return best;
}

// Tỉ lệ các khoảng cách rơi vào cùng một "bậc" thời gian (bấm theo đồng hồ).
function cadenceRatio(gaps, bucketMs) {
  const list = toFiniteArray(gaps).filter((g) => g > 0);
  if (!list.length) return { ratio: 0, bucket: 0, count: 0, total: 0 };
  const size = Math.max(1, Number(bucketMs) || 100);
  const counts = new Map();
  for (const g of list) {
    const key = Math.round(g / size);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let topKey = 0;
  let topCount = 0;
  for (const [key, count] of counts) {
    if (count > topCount) {
      topCount = count;
      topKey = key;
    }
  }
  return { ratio: topCount / list.length, bucket: topKey * size, count: topCount, total: list.length };
}

// Giờ trong ngày theo múi giờ đã cấu hình.
function hourOf(timestamp, offsetMinutes) {
  const t = Number(timestamp);
  if (!Number.isFinite(t)) return 0;
  const off = Number(offsetMinutes);
  const shifted = t + (Number.isFinite(off) ? off : 0) * 60 * 1000;
  return Math.floor(shifted / 3600000) % 24;
}

// =============================================================
//  Bộ máy phát hiện
// =============================================================
class AutomationEngine {
  constructor(options = {}) {
    this.cfg = Object.assign({}, DEFAULTS, options || {});
    this.cfg.weights = Object.assign({}, DEFAULTS.weights, (options && options.weights) || {});
    this.cfg.thresholds = Object.assign({}, DEFAULTS.thresholds, (options && options.thresholds) || {});
    this.cfg.nightHours = Array.isArray(this.cfg.nightHours) ? this.cfg.nightHours.slice() : DEFAULTS.nightHours.slice();
    this.users = new Map();
    this.lastPrune = 0;
  }

  configure(patch = {}) {
    const weights = Object.assign({}, this.cfg.weights, patch.weights || {});
    const thresholds = Object.assign({}, this.cfg.thresholds, patch.thresholds || {});
    this.cfg = Object.assign({}, this.cfg, patch);
    this.cfg.weights = weights;
    this.cfg.thresholds = thresholds;
    return this.cfg;
  }

  _state(userId, now) {
    let st = this.users.get(userId);
    if (!st) {
      st = {
        times: [], // mốc thời gian của các lệnh
        gaps: [], // khoảng cách giữa hai lệnh liên tiếp
        cmds: [], // tên lệnh
        hours: new Array(24).fill(0),
        hourTotal: 0,
        sessionStart: now,
        lastAt: 0,
        perCmd: new Map(), // lệnh -> mốc dùng gần nhất (để xét bấm sát cooldown)
        snipeHits: 0,
        snipeTotal: 0,
        lastSeen: now,
      };
      this.users.set(userId, st);
    }
    return st;
  }

  // Dọn bộ nhớ tạm của những người đã lâu không dùng lệnh.
  prune(now = Date.now(), force = false) {
    if (!force && now - this.lastPrune < 60 * 1000) return 0;
    this.lastPrune = now;
    let removed = 0;
    for (const [key, st] of this.users) {
      if (now - (st.lastSeen || 0) > this.cfg.idleForgetMs) {
        this.users.delete(key);
        removed++;
      }
    }
    return removed;
  }

  reset(userId) {
    return this.users.delete(String(userId));
  }

  size() {
    return this.users.size;
  }

  /**
   * Ghi nhận một lần dùng lệnh rồi chấm điểm nghi vấn.
   *
   * @param {object} input
   *  - userId      : bắt buộc
   *  - command     : tên lệnh
   *  - at          : mốc thời gian (ms), mặc định Date.now()
   *  - cooldownMs  : thời gian chờ của lệnh (để xét "bấm sát cooldown")
   *  - humanHint   : true nếu vừa có bằng chứng người thật (gõ chat thường...)
   * @returns {{score:number, verdict:string, reasons:string[], samples:number, detail:object}}
   */
  observe(input = {}) {
    const cfg = this.cfg;
    const userId = String(input.userId == null ? '' : input.userId);
    if (!userId) return this._empty();

    const at = Number.isFinite(Number(input.at)) ? Number(input.at) : Date.now();
    const command = String(input.command == null ? '?' : input.command);
    const st = this._state(userId, at);
    this.prune(at);

    // ---- Cập nhật dữ liệu quan sát ----
    const prevAt = st.lastAt;
    if (prevAt > 0) {
      const gap = at - prevAt;
      // Bỏ qua khoảng cách âm (đồng hồ nhảy) và khoảng cách quá dài (đã nghỉ).
      if (gap > 0 && gap <= cfg.breakMs) st.gaps.push(gap);
      if (gap > cfg.breakMs || gap < 0) st.sessionStart = at; // đã nghỉ -> phiên mới
    } else {
      st.sessionStart = at;
    }

    st.times.push(at);
    st.cmds.push(command);
    st.lastAt = at;
    st.lastSeen = at;

    const hour = hourOf(at, cfg.offsetMinutes);
    st.hours[hour] = (st.hours[hour] || 0) + 1;
    st.hourTotal += 1;

    // ---- Bấm sát thời gian chờ ----
    const cooldownMs = Number(input.cooldownMs);
    if (Number.isFinite(cooldownMs) && cooldownMs > 0) {
      const last = st.perCmd.get(command);
      if (Number.isFinite(last) && last > 0) {
        const readyAt = last + cooldownMs;
        const delay = at - readyAt;
        // Chỉ tính khi người chơi thực sự chờ hết cooldown (delay >= 0)
        // và không chờ quá lâu (dưới 30 giây) - tức là họ đang "canh" cooldown.
        if (delay >= 0 && delay <= 30000) {
          st.snipeTotal += 1;
          if (delay <= cfg.snipeToleranceMs) st.snipeHits += 1;
        }
      }
      st.perCmd.set(command, at);
      // Không để Map lệnh phình vô hạn.
      if (st.perCmd.size > 120) {
        const firstKey = st.perCmd.keys().next().value;
        st.perCmd.delete(firstKey);
      }
    }

    // Bằng chứng người thật làm giãn dữ liệu nghi vấn (giảm oan sai).
    if (input.humanHint) {
      st.snipeHits = Math.max(0, st.snipeHits - 1);
    }

    // ---- Giới hạn kích thước bộ nhớ ----
    if (st.times.length > cfg.historySize) st.times.splice(0, st.times.length - cfg.historySize);
    if (st.cmds.length > cfg.historySize) st.cmds.splice(0, st.cmds.length - cfg.historySize);
    if (st.gaps.length > cfg.historySize) st.gaps.splice(0, st.gaps.length - cfg.historySize);

    return this._score(st, at);
  }

  // Chấm điểm hiện tại mà KHÔNG ghi nhận thêm dữ liệu.
  evaluate(userId, now = Date.now()) {
    const st = this.users.get(String(userId));
    if (!st) return this._empty();
    return this._score(st, now);
  }

  _empty() {
    return {
      score: 0,
      verdict: 'ok',
      reasons: [],
      labels: [],
      samples: 0,
      enoughData: false,
      detail: {},
    };
  }

  _score(st, now) {
    const cfg = this.cfg;
    const samples = st.times.length;
    const detail = {};
    const parts = {};

    // ---- 1) Nhịp gõ đều như máy ----
    const gaps = st.gaps;
    if (gaps.length >= cfg.rhythmMinSamples) {
      const cv = coefficientOfVariation(gaps);
      detail.cv = Number(cv.toFixed(4));
      // CV thấp -> nghi cao. Đảo chiều: cv <= strict => 1, cv >= loose => 0.
      parts.rhythm = 1 - ramp(cv, cfg.rhythmCvStrict, cfg.rhythmCvLoose);
    } else {
      parts.rhythm = 0;
    }

    // ---- 2) Tốc độ phản xạ & lệnh/phút ----
    let speed = 0;
    if (gaps.length >= 4) {
      const fastRatio = gaps.filter((g) => g < cfg.humanFloorMs).length / gaps.length;
      const burstRatio = gaps.filter((g) => g < cfg.burstFloorMs).length / gaps.length;
      detail.medianGapMs = Math.round(median(gaps));
      detail.fastRatio = Number(fastRatio.toFixed(3));
      speed = Math.max(ramp(fastRatio, 0.25, 0.8), ramp(burstRatio, 0.05, 0.4));
    }
    const inWindow = st.times.filter((t) => now - t <= cfg.rateWindowMs).length;
    detail.perMinute = inWindow;
    speed = Math.max(speed, ramp(inWindow, cfg.maxPerMinute, cfg.maxPerMinute * 2));
    parts.speed = speed;

    // ---- 3) Bấm theo đồng hồ ----
    if (gaps.length >= cfg.cadenceMinSamples) {
      const cad = cadenceRatio(gaps, cfg.cadenceBucketMs);
      detail.cadenceRatio = Number(cad.ratio.toFixed(3));
      detail.cadenceBucketMs = cad.bucket;
      parts.cadence = ramp(cad.ratio, cfg.cadenceRatioLoose, cfg.cadenceRatioStrict);
    } else {
      parts.cadence = 0;
    }

    // ---- 4) Lặp lệnh theo vòng ----
    const cycle = detectCycle(st.cmds, { minLen: cfg.cycleMinLen, maxLen: cfg.cycleMaxLen });
    const div = diversity(st.cmds, cfg.diversityWindow);
    detail.cyclePeriod = cycle.period;
    detail.cycleRepeats = cycle.repeats;
    detail.diversity = Number(div.toFixed(3));
    const cycleScore =
      cycle.repeats >= cfg.cycleMinRepeats ? ramp(cycle.repeats, cfg.cycleMinRepeats, cfg.cycleFullRepeats) : 0;
    // Ít lệnh khác nhau cũng là dấu hiệu, nhưng nhẹ hơn vòng lặp rõ ràng.
    const monotony = samples >= cfg.minSamples ? 1 - ramp(div, 0.2, 0.55) : 0;
    parts.repetition = Math.max(cycleScore, monotony * 0.8);

    // ---- 5) Cày liên tục không nghỉ ----
    const sessionMs = Math.max(0, now - (st.sessionStart || now));
    detail.sessionMs = sessionMs;
    parts.endurance = ramp(sessionMs, cfg.marathonWarnMs, cfg.marathonFullMs);

    // ---- 6) Không ngủ ----
    if (st.hourTotal >= cfg.hourMinTotal) {
      const activeHours = st.hours.filter((c) => c > 0).length;
      const nightHits = cfg.nightHours.reduce((a, h) => a + (st.hours[h] || 0), 0);
      detail.activeHours = activeHours;
      detail.nightHits = nightHits;
      const spread = ramp(activeHours, cfg.hourSpreadWarn, cfg.hourSpreadFull);
      const nightRatio = ramp(nightHits / st.hourTotal, 0.08, 0.25);
      parts.nosleep = Math.max(spread, Math.min(spread + nightRatio, 1) * 0.9);
    } else {
      parts.nosleep = 0;
    }

    // ---- 7) Bấm sát thời gian chờ ----
    if (st.snipeTotal >= cfg.snipeMinSamples) {
      const ratio = st.snipeHits / st.snipeTotal;
      detail.snipeRatio = Number(ratio.toFixed(3));
      detail.snipeSamples = st.snipeTotal;
      parts.snipe = ramp(ratio, cfg.snipeRatioWarn, cfg.snipeRatioFull);
    } else {
      parts.snipe = 0;
    }

    // ---- Tổng hợp ----
    const weights = cfg.weights;
    let total = 0;
    let maxTotal = 0;
    const reasons = [];
    for (const key of Object.keys(weights)) {
      const w = Number(weights[key]) || 0;
      const p = Math.max(0, Math.min(1, Number(parts[key]) || 0));
      total += w * p;
      maxTotal += w;
      if (p >= 0.5) reasons.push(key);
    }
    const enoughData = samples >= cfg.minSamples;
    const raw = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
    // Chưa đủ dữ liệu thì điểm chỉ mang tính tham khảo, không dùng để trừng phạt.
    const score = enoughData ? Math.round(raw) : Math.round(raw * 0.4);

    // Sắp xếp lý do theo mức độ đóng góp giảm dần cho dễ đọc.
    reasons.sort((a, b) => (Number(weights[b]) || 0) * (parts[b] || 0) - (Number(weights[a]) || 0) * (parts[a] || 0));

    let verdict = 'ok';
    if (enoughData) {
      if (score >= cfg.thresholds.block) verdict = 'block';
      else if (score >= cfg.thresholds.challenge) verdict = 'challenge';
      else if (score >= cfg.thresholds.watch) verdict = 'watch';
    }

    return {
      score,
      verdict,
      reasons,
      labels: reasons.map((r) => SIGNAL_LABELS[r] || r),
      samples,
      enoughData,
      parts,
      detail,
    };
  }
}

module.exports = {
  AutomationEngine,
  DEFAULTS,
  SIGNAL_LABELS,
  // Xuất các hàm thuần để kiểm thử và dùng lại nơi khác.
  mean,
  stddev,
  coefficientOfVariation,
  median,
  ramp,
  diversity,
  normalizedEntropy,
  detectCycle,
  cadenceRatio,
  hourOf,
};
