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
//   8) quantize   - khoảng cách luôn là số tròn (3000ms, 5000ms...) [LTS]
//   9) entropy    - độ ngẫu nhiên của khoảng cách quá thấp [LTS]
//  10) precision  - độ lệch tuyệt đối quanh trung vị nhỏ tới mức phi lý [LTS]
//
//  Điểm 0-100. Ngưỡng: watch -> challenge (bắt xác minh) -> block (khoá tạm).
//  Có "minSamples" để KHÔNG BAO GIỜ kết luận khi chưa đủ dữ liệu.
//
//  Bản LTS còn trả thêm:
//   - confidence : độ tin cậy của kết luận (0..1), dựa trên lượng dữ liệu và
//                  số dấu hiệu độc lập cùng chỉ về một hướng. Hệ thống xử lý
//                  dùng con số này để KHÔNG ra án nặng khi bằng chứng còn mỏng.
//   - humanScore : điểm "bằng chứng người thật" đã trừ bớt (chat thường, nghỉ...)
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

  // --- 8) Khoảng cách là số tròn (LTS) ---
  // Macro thường dùng sleep(3000) nên khoảng cách hay chia hết cho 500/1000ms.
  quantizeMinSamples: 10,
  quantizeSteps: [1000, 500, 250], // các bậc "tròn" cần kiểm tra
  quantizeTolerancePct: 0.02, // sai số 2% vẫn coi là tròn (trễ mạng)
  quantizeRatioWarn: 0.45,
  quantizeRatioFull: 0.85,

  // --- 9) Độ ngẫu nhiên của khoảng cách (LTS) ---
  entropyMinSamples: 14,
  entropyBucketMs: 400, // gom khoảng cách theo bậc 400ms rồi tính entropy
  entropyLow: 0.25, // entropy <= 0.25 -> gần như chỉ có một giá trị
  entropyHigh: 0.7, // entropy >= 0.70 -> lộn xộn như người thật

  // --- 10) Độ lệch tuyệt đối quanh trung vị (LTS) ---
  // MAD (median absolute deviation) bền hơn CV khi có vài giá trị lạc.
  precisionMinSamples: 12,
  precisionMadStrict: 0.05, // MAD/trung vị <= 5%  -> chính xác phi lý
  precisionMadLoose: 0.22, // MAD/trung vị >= 22% -> bình thường

  // --- Bằng chứng người thật (LTS) ---
  humanHintDecayMs: 30 * 60 * 1000, // dấu hiệu người thật có giá trị trong 30 phút
  humanHintMaxRelief: 0.35, // giảm tối đa 35% điểm cuối
  humanHintFullAt: 6, // đủ 6 dấu hiệu là được giảm tối đa

  // --- Chấm điểm ---
  weights: {
    rhythm: 20,
    speed: 15,
    cadence: 13,
    repetition: 12,
    endurance: 10,
    nosleep: 9,
    snipe: 12,
    quantize: 12,
    entropy: 10,
    precision: 10,
  },
  thresholds: { watch: 40, challenge: 62, block: 82 },

  // --- Độ tin cậy (LTS) ---
  confidenceFullSamples: 45, // đủ 45 lệnh -> dữ liệu coi như đầy đặn
  confidenceMinSignals: 2, // cần >= 2 dấu hiệu độc lập mới đáng tin
  confidenceFullSignals: 4,
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
  // --- Ba dấu hiệu mới ở bản LTS ---
  quantize: 'khoảng nghỉ luôn là số tròn (1s / 0,5s / 0,25s) như sleep() trong code',
  entropy: 'nhịp gõ gần như không có biến thiên tự nhiên',
  precision: 'độ sai lệch giữa các lần gõ nhỏ tới mức chỉ máy mới làm được',
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
// LƯU Ý (lỗi đã sửa ở bản LTS): với mốc thời gian âm, phép % trong JS trả số âm
// nên `hours[-3]` sẽ tạo thuộc tính lạ trên mảng và làm sai chỉ số "không ngủ".
// Dùng ((x % 24) + 24) % 24 để luôn ra 0..23.
function hourOf(timestamp, offsetMinutes) {
  const t = Number(timestamp);
  if (!Number.isFinite(t)) return 0;
  const off = Number(offsetMinutes);
  const shifted = t + (Number.isFinite(off) ? off : 0) * 60 * 1000;
  const h = Math.floor(shifted / 3600000);
  return ((h % 24) + 24) % 24;
}

// Trung vị của độ lệch tuyệt đối quanh trung vị (MAD) — bền với giá trị lạc.
// Trả về tỉ lệ MAD / trung vị để so sánh được giữa các nhịp nhanh/chậm.
function madRatio(values) {
  const list = toFiniteArray(values).filter((v) => v > 0);
  if (list.length < 3) return 1;
  const med = median(list);
  if (med <= 0) return 1;
  const devs = list.map((v) => Math.abs(v - med));
  return median(devs) / med;
}

/**
 * Tỉ lệ khoảng cách là "số tròn" theo một trong các bậc cho trước.
 * Macro dùng sleep(3000) nên gần như 100% khoảng cách chia hết cho 1000ms,
 * còn người thật thì gần như không bao giờ.
 *
 * @param {number[]} gaps
 * @param {number[]} steps các bậc cần thử, ví dụ [1000, 500, 250]
 * @param {number} tolerancePct sai số cho phép (0.02 = 2%)
 * @returns {{ratio:number, step:number, count:number, total:number}}
 */
function quantizeRatio(gaps, steps, tolerancePct) {
  const list = toFiniteArray(gaps).filter((g) => g > 0);
  const stepList = Array.isArray(steps) && steps.length ? steps : [1000];
  if (list.length < 3) return { ratio: 0, step: 0, count: 0, total: list.length };
  const tol = Number.isFinite(Number(tolerancePct)) ? Math.max(0, Number(tolerancePct)) : 0.02;

  let best = { ratio: 0, step: 0, count: 0, total: list.length };
  for (const rawStep of stepList) {
    const step = Math.max(1, Math.floor(Number(rawStep) || 0));
    let hits = 0;
    for (const g of list) {
      const rem = g % step;
      const dist = Math.min(rem, step - rem);
      // Sai số cho phép: theo % của khoảng cách, nhưng không quá nửa bậc.
      const allow = Math.min(step / 2, Math.max(25, g * tol));
      if (dist <= allow) hits++;
    }
    const ratio = hits / list.length;
    if (ratio > best.ratio) best = { ratio, step, count: hits, total: list.length };
  }
  return best;
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
        // --- LTS ---
        humanHits: 0, // số bằng chứng "người thật" còn hiệu lực
        humanAt: 0, // mốc bằng chứng người thật gần nhất
        breaks: 0, // số lần nghỉ giữa phiên (người thật hay nghỉ)
        scoreCache: null, // bộ đệm kết quả chấm điểm
        scoreCacheAt: 0,
        version: 0, // tăng mỗi lần có dữ liệu mới -> làm hỏng bộ đệm
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

    // ---- HỢP ĐỒNG (LTS v3.1.4): CHỈ NHẬN DỮ LIỆU TỪ VIỆC GÕ LỆNH ----
    // Bộ máy này chấm điểm "nhịp GÕ LỆNH", nên chỉ được nhận dữ liệu
    // khi người chơi dùng LỆNH của bot. Tin nhắn chat bình thường và việc
    // bấm nút khi chơi (nút câu cá, nút bảng, giveaway, minigame…) KHÔNG
    // được tính là dấu hiệu dùng máy. Gọi từ nguồn khác thì chỉ được XEM
    // điểm hiện tại, tuyệt đối không ghi thêm mẫu để không ai bị nghi oan.
    const source = String(input.source == null ? 'command' : input.source);
    if (source !== 'command') {
      return this.users.has(userId) ? this.evaluate(userId, at) : this._empty();
    }

    const command = String(input.command == null ? '?' : input.command);
    const st = this._state(userId, at);
    this.prune(at);

    // ---- Cập nhật dữ liệu quan sát ----
    const prevAt = st.lastAt;
    if (prevAt > 0) {
      const gap = at - prevAt;
      // Bỏ qua khoảng cách âm (đồng hồ nhảy) và khoảng cách quá dài (đã nghỉ).
      if (gap > 0 && gap <= cfg.breakMs) st.gaps.push(gap);
      if (gap > cfg.breakMs || gap < 0) {
        st.sessionStart = at; // đã nghỉ -> phiên mới
        st.breaks = (st.breaks || 0) + 1; // nghỉ là dấu hiệu người thật
      }
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
      // (Lỗi đã sửa ở bản LTS): trước đây xóa theo THỨ TỰ THÊM VÀO nên có
      // thể xóa mất lệnh đang dùng liên tục và giữ lại lệnh đã lâu không dùng,
      // làm mất dấu hiệu "bấm sát cooldown". Nay xóa theo mục CŨ NHẤT.
      if (st.perCmd.size > 120) {
        let oldestKey = null;
        let oldestAt = Infinity;
        for (const [k, v] of st.perCmd) {
          if (v < oldestAt) {
            oldestAt = v;
            oldestKey = k;
          }
        }
        if (oldestKey !== null) st.perCmd.delete(oldestKey);
      }
    }

    // Bằng chứng người thật làm giãn dữ liệu nghi vấn (giảm oan sai).
    // input.humanHint có thể là true/false hoặc một con số "cường độ".
    const hint = Number(input.humanHint);
    const hintWeight = input.humanHint === true ? 1 : Number.isFinite(hint) ? Math.max(0, Math.min(5, hint)) : 0;
    if (hintWeight > 0) {
      // Dấu hiệu cũ sẽ phai dần theo thời gian.
      if (st.humanAt > 0 && at - st.humanAt > cfg.humanHintDecayMs) st.humanHits = 0;
      st.humanHits = Math.min(cfg.humanHintFullAt * 2, (st.humanHits || 0) + hintWeight);
      st.humanAt = at;
      st.snipeHits = Math.max(0, st.snipeHits - 1);
    }

    // ---- Giới hạn kích thước bộ nhớ ----
    if (st.times.length > cfg.historySize) st.times.splice(0, st.times.length - cfg.historySize);
    if (st.cmds.length > cfg.historySize) st.cmds.splice(0, st.cmds.length - cfg.historySize);
    if (st.gaps.length > cfg.historySize) st.gaps.splice(0, st.gaps.length - cfg.historySize);

    st.version = (st.version || 0) + 1;
    return this._score(st, at);
  }

  /**
   * Ghi nhận bằng chứng "người thật" mà không phải là một lần dùng lệnh.
   * Ví dụ: người đó gõ chat bình thường, trả lời tin nhắn, đổi biệt danh...
   * Macro gần như không bao giờ làm những việc này.
   */
  noteHuman(userId, weight = 1, at = Date.now()) {
    const key = String(userId == null ? '' : userId);
    if (!key) return false;
    const st = this.users.get(key);
    if (!st) return false;
    const cfg = this.cfg;
    const w = Math.max(0, Math.min(5, Number(weight) || 0));
    if (w <= 0) return false;
    if (st.humanAt > 0 && at - st.humanAt > cfg.humanHintDecayMs) st.humanHits = 0;
    st.humanHits = Math.min(cfg.humanHintFullAt * 2, (st.humanHits || 0) + w);
    st.humanAt = at;
    st.lastSeen = Math.max(st.lastSeen || 0, at);
    st.version = (st.version || 0) + 1;
    return true;
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
      // Giữ cả hai tên cho tương thích ngược với mã cũ.
      enough: false,
      confidence: 0,
      humanScore: 0,
      parts: {},
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

    // ---- 8) Khoảng cách luôn là số tròn (LTS) ----
    // Đây là dấu hiệu rất mạnh: sleep(3000) trong macro tạo ra khoảng cách
    // chia hết cho 1000ms, còn người thật thì gần như không bao giờ.
    if (gaps.length >= cfg.quantizeMinSamples) {
      const q = quantizeRatio(gaps, cfg.quantizeSteps, cfg.quantizeTolerancePct);
      detail.quantizeRatio = Number(q.ratio.toFixed(3));
      detail.quantizeStepMs = q.step;
      parts.quantize = ramp(q.ratio, cfg.quantizeRatioWarn, cfg.quantizeRatioFull);
    } else {
      parts.quantize = 0;
    }

    // ---- 9) Độ ngẫu nhiên của khoảng cách (LTS) ----
    // Người thật tạo ra nhiều khoảng cách khác nhau -> entropy cao.
    if (gaps.length >= cfg.entropyMinSamples) {
      const bucket = Math.max(1, Number(cfg.entropyBucketMs) || 400);
      const buckets = gaps.map((g) => String(Math.round(g / bucket)));
      const ent = normalizedEntropy(buckets);
      detail.gapEntropy = Number(ent.toFixed(3));
      // Đảo chiều: entropy thấp -> nghi cao.
      parts.entropy = 1 - ramp(ent, cfg.entropyLow, cfg.entropyHigh);
    } else {
      parts.entropy = 0;
    }

    // ---- 10) Độ chính xác quanh trung vị (LTS) ----
    // MAD bền hơn CV: người chơi thật thỉnh thoảng nghỉ vài giây làm CV cao
    // giả, nhưng MAD vẫn phản ánh đúng "phần lớn các lần bấm".
    if (gaps.length >= cfg.precisionMinSamples) {
      const mad = madRatio(gaps);
      detail.madRatio = Number(mad.toFixed(4));
      parts.precision = 1 - ramp(mad, cfg.precisionMadStrict, cfg.precisionMadLoose);
    } else {
      parts.precision = 0;
    }

    // ---- Tổng hợp ----
    const weights = cfg.weights;
    let total = 0;
    let maxTotal = 0;
    const reasons = [];
    let strongSignals = 0;
    for (const key of Object.keys(weights)) {
      const w = Number(weights[key]) || 0;
      const p = Math.max(0, Math.min(1, Number(parts[key]) || 0));
      parts[key] = p;
      total += w * p;
      maxTotal += w;
      if (p >= 0.5) {
        reasons.push(key);
        strongSignals++;
      }
    }
    const enoughData = samples >= cfg.minSamples;
    let raw = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

    // --- Bằng chứng người thật: giảm điểm để tránh oan sai (LTS) ---
    let humanScore = 0;
    if (st.humanAt > 0 && now - st.humanAt <= cfg.humanHintDecayMs) {
      humanScore = Math.min(1, (st.humanHits || 0) / Math.max(1, cfg.humanHintFullAt));
    }
    // Nghỉ giữa phiên cũng là bằng chứng người thật (macro không nghỉ).
    if (samples >= cfg.minSamples && (st.breaks || 0) >= 3) {
      humanScore = Math.max(humanScore, Math.min(0.5, (st.breaks || 0) / 12));
    }
    detail.humanScore = Number(humanScore.toFixed(3));
    detail.humanHits = st.humanHits || 0;
    detail.breaks = st.breaks || 0;
    if (humanScore > 0) raw = raw * (1 - humanScore * cfg.humanHintMaxRelief);

    // Chưa đủ dữ liệu thì điểm chỉ mang tính tham khảo, không dùng để trừng phạt.
    const score = enoughData ? Math.round(raw) : Math.round(raw * 0.4);

    // --- Độ tin cậy của kết luận (LTS) ---
    // Kết hợp 2 yếu tố: đủ dữ liệu chưa, và có bao nhiêu dấu hiệu độc lập
    // cùng chỉ về một hướng. Một dấu hiệu đơn lẻ thì rất dễ oan.
    const dataConf = ramp(samples, cfg.minSamples, cfg.confidenceFullSamples);
    const signalConf = ramp(strongSignals, cfg.confidenceMinSignals, cfg.confidenceFullSignals);
    let confidence = enoughData ? Math.sqrt(Math.max(0.02, dataConf) * Math.max(0.02, signalConf)) : dataConf * 0.3;
    // Có bằng chứng người thật thì bớt tự tin đi.
    confidence = Math.max(0, Math.min(1, confidence * (1 - humanScore * 0.3)));
    detail.strongSignals = strongSignals;
    detail.confidence = Number(confidence.toFixed(3));

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
      // Giữ cả hai tên cho tương thích ngược với mã cũ và bảng điều khiển.
      enough: enoughData,
      confidence,
      confidencePercent: Math.round(confidence * 100),
      humanScore,
      strongSignals,
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
  // --- LTS ---
  madRatio,
  quantizeRatio,
};
