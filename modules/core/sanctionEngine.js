// =============================================================
//  sanctionEngine - HỆ THỐNG 3: ĐÁNH GIÁ MỨC ĐỘ NGHIÊM TRỌNG &
//  QUYẾT ĐỊNH HÌNH THỨC XỬ LÝ (CẢNH CÁO / MUTE / BAN)
//
//  File này là LÕI TÍNH TOÁN THUẦN: KHÔNG require('discord.js'),
//  KHÔNG đọc/ghi đĩa. Nhờ vậy:
//    - Kiểm thử tự động được 100%
//    - Không bao giờ làm sập bot
//    - Chạy cực nhanh (chỉ là phép toán trên số)
//
//  Ý TƯỞNG CHÍNH
//  -------------
//  Hai hệ thống phát hiện (chống bot tự động & chống acc clone) chỉ trả về
//  "điểm nghi". Điểm nghi KHÔNG PHẢI là bản án. File này làm phần "toà án":
//
//    1) Gom mọi bằng chứng thành 6 NHÓM ĐỘC LẬP:
//         macro      - dấu hiệu dùng máy tự động đánh lệnh
//         clone      - dấu hiệu là tài khoản phụ (acc clone)
//         evasion    - trốn tránh xác minh (trượt câu đố, bị cảnh cáo nhiều)
//         economic   - thiệt hại kinh tế (dồn xu, cụm acc lớn)
//         distrust   - điểm tin cậy thấp
//         recidivism - tái phạm (đã từng bị xử lý)
//
//    2) Tính ĐỘ TIN CẬY của bằng chứng (confidence). Ít dữ liệu -> tin thấp.
//       Đây là chốt chống oan sai quan trọng nhất: bằng chứng yếu thì
//       KHÔNG BAO GIỜ ra án nặng, dù điểm nghi có cao.
//
//    3) Cộng điểm có trọng số + THƯỞNG KIỂM CHỨNG CHÉO (corroboration):
//       một dấu hiệu mạnh đơn lẻ có thể là oan; nhưng 2-3 nhóm bằng chứng
//       ĐỘC LẬP cùng chỉ về một hướng thì gần như chắc chắn đúng.
//
//    4) Ra quyết định theo THANG LEO DẦN (escalation ladder):
//         nhắc nhở -> cảnh cáo -> mute (tăng dần thời gian) -> ban vĩnh viễn
//       Không bao giờ nhảy thẳng tới ban trừ khi bằng chứng quyết định
//       (decisive) VÀ đã đủ độ tin cậy rất cao.
//
//  Bảng chú giải:
//    warn  = cảnh cáo (vẫn chơi được, bị ghi hồ sơ)
//    mute  = không cho dùng bot trong một khoảng thời gian
//    ban   = cấm dùng bot vĩnh viễn
// =============================================================
'use strict';

// ---------- Thứ bậc hình thức xử lý ----------
const LEVELS = ['none', 'notice', 'warn', 'mute', 'ban'];
const LEVEL_RANK = { none: 0, notice: 1, warn: 2, mute: 3, ban: 4 };
const LEVEL_LABELS = {
  none: 'Không xử lý',
  notice: 'Nhắc nhở',
  warn: 'Cảnh cáo',
  mute: 'Cấm dùng bot tạm thời',
  ban: 'Cấm dùng bot vĩnh viễn',
};
const LEVEL_EMOJI = { none: '🟢', notice: '🔵', warn: '🟡', mute: '🟠', ban: '🔴' };

// ---------- Bậc mức độ nghiêm trọng (để hiển thị) ----------
const SEVERITY_TIERS = [
  { key: 'clean', min: 0, label: 'Sạch', emoji: '🟢' },
  { key: 'low', min: 25, label: 'Nhẹ', emoji: '🔵' },
  { key: 'medium', min: 45, label: 'Trung bình', emoji: '🟡' },
  { key: 'high', min: 65, label: 'Nặng', emoji: '🟠' },
  { key: 'critical', min: 82, label: 'Rất nặng', emoji: '🔴' },
];

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DEFAULTS = {
  // ---- Trọng số 6 nhóm bằng chứng (tổng không cần bằng 100) ----
  weights: {
    macro: 26,
    clone: 24,
    evasion: 14,
    economic: 14,
    distrust: 10,
    recidivism: 12,
  },

  // ---- Thưởng kiểm chứng chéo ----
  // Mỗi nhóm bằng chứng "mạnh" (>= corroborateAt) tính là 1 phiếu.
  corroborateAt: 0.5,
  corroborationBonus: 0.09, // +9% điểm cho mỗi phiếu vượt quá phiếu đầu tiên
  corroborationMax: 0.28, // nhưng tối đa +28%
  lonelySignalPenalty: 0.2, // chỉ 1 phiếu duy nhất -> giảm 20% (rất dễ oan)

  // ---- Ngưỡng ra quyết định (điểm nghiêm trọng 0..100) ----
  noticeAt: 30,
  warnAt: 46,
  muteAt: 62,
  banAt: 88,

  // ---- Chốt chống oan sai: độ tin cậy tối thiểu cho từng mức ----
  minConfidenceNotice: 0.25,
  minConfidenceWarn: 0.45,
  minConfidenceMute: 0.62,
  minConfidenceBan: 0.85,

  // ---- Điều kiện leo bậc ----
  // Phải có ít nhất bao nhiêu cảnh cáo còn hiệu lực trước khi được mute?
  warnsBeforeMute: 1,
  // Điểm rất cao thì cho phép mute ngay không cần cảnh cáo trước.
  muteWithoutWarnAt: 78,
  // Phải bị mute bao nhiêu lần trước khi ban?
  mutesBeforeBan: 3,
  // Bằng chứng quyết định + điểm cực cao thì cho ban sớm hơn.
  banWithoutLadderAt: 96,
  // Không bao giờ ban ở lần vi phạm đầu tiên (khoá an toàn cứng).
  neverBanFirstOffence: true,

  // ---- Thang thời gian mute (leo dần theo số lần đã bị mute) ----
  muteLadder: [1 * HOUR, 6 * HOUR, 24 * HOUR, 3 * DAY, 7 * DAY],

  // ---- Suy giảm theo thời gian ----
  warnExpireMs: 30 * DAY, // cảnh cáo hết hiệu lực leo bậc sau 30 ngày
  muteExpireMs: 120 * DAY, // mute hết hiệu lực leo bậc sau 120 ngày
  cooldownMs: 45 * MINUTE, // sau mỗi lần ra án, chờ ít nhất bấy nhiêu mới ra án mới

  // ---- Bằng chứng quyết định (decisive) ----
  decisiveFunnelTransfers: 8, // dồn xu một chiều >= 8 lần
  decisiveFunnelAmount: 50000, // hoặc >= 50.000 xu
  decisiveClusterSize: 5, // cụm >= 5 tài khoản cùng chủ
  decisiveCaptchaFails: 4, // trượt xác minh >= 4 lần
  decisiveMacroScore: 92, // điểm macro >= 92 với dữ liệu dày
};

// Nhãn tiếng Việt cho từng nhóm bằng chứng.
const GROUP_LABELS = {
  macro: 'dùng máy tự động đánh lệnh',
  clone: 'tài khoản phụ (acc clone)',
  evasion: 'trốn tránh xác minh người thật',
  economic: 'dồn xu / cày xu theo cụm',
  distrust: 'điểm tin cậy rất thấp',
  recidivism: 'tái phạm nhiều lần',
};

// =============================================================
//  Tiện ích toán học thuần
// =============================================================
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(v) {
  const n = num(v, 0);
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function clamp(v, lo, hi) {
  const n = num(v, lo);
  return n < lo ? lo : n > hi ? hi : n;
}

// Đưa giá trị về 0..1 theo hai mốc. low === high thì so sánh trực tiếp.
function ramp(value, low, high) {
  const v = num(value, 0);
  const lo = num(low, 0);
  const hi = num(high, 1);
  if (lo === hi) return v >= hi ? 1 : 0;
  return clamp01((v - lo) / (hi - lo));
}

// Hợp "mềm" hai xác suất độc lập: 1 - (1-a)(1-b). Không bao giờ vượt 1.
function orProb(a, b) {
  return clamp01(1 - (1 - clamp01(a)) * (1 - clamp01(b)));
}

function fmtDuration(ms) {
  const total = Math.max(0, Math.round(num(ms, 0) / 1000));
  if (!total) return 'vài giây';
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (d) parts.push(d + ' ngày');
  if (h) parts.push(h + ' giờ');
  if (m) parts.push(m + ' phút');
  if (!d && !h && s) parts.push(s + ' giây');
  return parts.length ? parts.join(' ') : 'vài giây';
}

function severityTier(severity) {
  const s = clamp(severity, 0, 100);
  let out = SEVERITY_TIERS[0];
  for (const t of SEVERITY_TIERS) if (s >= t.min) out = t;
  return out;
}

function rankOf(level) {
  return LEVEL_RANK[String(level)] || 0;
}

function higherLevel(a, b) {
  return rankOf(a) >= rankOf(b) ? String(a || 'none') : String(b || 'none');
}

// =============================================================
//  Chuẩn hoá cấu hình (không bao giờ ném lỗi)
// =============================================================
function normalizeConfig(options = {}) {
  const cfg = Object.assign({}, DEFAULTS, options || {});
  cfg.weights = Object.assign({}, DEFAULTS.weights, (options && options.weights) || {});

  // Ngưỡng phải tăng dần, nếu không hệ thống sẽ ra án sai bậc.
  cfg.noticeAt = clamp(cfg.noticeAt, 1, 97);
  cfg.warnAt = clamp(Math.max(cfg.warnAt, cfg.noticeAt + 1), 2, 98);
  cfg.muteAt = clamp(Math.max(cfg.muteAt, cfg.warnAt + 1), 3, 99);
  cfg.banAt = clamp(Math.max(cfg.banAt, cfg.muteAt + 1), 4, 100);

  cfg.minConfidenceNotice = clamp01(cfg.minConfidenceNotice);
  cfg.minConfidenceWarn = clamp01(Math.max(cfg.minConfidenceWarn, cfg.minConfidenceNotice));
  cfg.minConfidenceMute = clamp01(Math.max(cfg.minConfidenceMute, cfg.minConfidenceWarn));
  cfg.minConfidenceBan = clamp01(Math.max(cfg.minConfidenceBan, cfg.minConfidenceMute));

  cfg.warnsBeforeMute = clamp(Math.floor(cfg.warnsBeforeMute), 0, 10);
  cfg.mutesBeforeBan = clamp(Math.floor(cfg.mutesBeforeBan), 1, 20);

  const ladder = Array.isArray(cfg.muteLadder) ? cfg.muteLadder : DEFAULTS.muteLadder;
  const clean = ladder
    .map((x) => Math.floor(num(x, 0)))
    .filter((x) => x >= MINUTE && x <= 365 * DAY)
    .sort((a, b) => a - b);
  cfg.muteLadder = clean.length ? clean.slice(0, 10) : DEFAULTS.muteLadder.slice();

  cfg.warnExpireMs = clamp(Math.floor(cfg.warnExpireMs), HOUR, 365 * DAY);
  cfg.muteExpireMs = clamp(Math.floor(cfg.muteExpireMs), HOUR, 3650 * DAY);
  cfg.cooldownMs = clamp(Math.floor(cfg.cooldownMs), 0, 30 * DAY);
  cfg.neverBanFirstOffence = cfg.neverBanFirstOffence !== false;
  return cfg;
}

// =============================================================
//  Chuẩn hoá bằng chứng đầu vào
// =============================================================
function normalizeEvidence(raw = {}) {
  const e = raw && typeof raw === 'object' ? raw : {};
  const hist = e.history && typeof e.history === 'object' ? e.history : {};
  const cluster = e.cluster && typeof e.cluster === 'object' ? e.cluster : {};
  const funnel = e.funnel && typeof e.funnel === 'object' ? e.funnel : {};

  return {
    // --- Hệ thống 1: chống bot tự động ---
    macroScore: clamp(e.macroScore, 0, 100),
    macroSamples: Math.max(0, Math.floor(num(e.macroSamples, 0))),
    macroEnough: e.macroEnough === true,
    macroFlags: Array.isArray(e.macroFlags) ? e.macroFlags.slice(0, 12).map(String) : [],

    // --- Hệ thống 2: chống acc clone ---
    cloneRisk: clamp(e.cloneRisk, 0, 100),
    cloneTier: String(e.cloneTier || 'ok'),
    cloneFlags: Array.isArray(e.cloneFlags) ? e.cloneFlags.slice(0, 14).map(String) : [],

    // --- Trốn tránh xác minh ---
    strikes: Math.max(0, Math.floor(num(e.strikes, 0))),
    captchaIssued: Math.max(0, Math.floor(num(e.captchaIssued, 0))),
    captchaPassed: Math.max(0, Math.floor(num(e.captchaPassed, 0))),
    captchaFailed: Math.max(0, Math.floor(num(e.captchaFailed, 0))),

    // --- Kinh tế ---
    funnelTransfers: Math.max(0, Math.floor(num(funnel.count, 0))),
    funnelAmount: Math.max(0, Math.floor(num(funnel.total, 0))),
    clusterSize: Math.max(0, Math.floor(num(cluster.size, 0))),
    clusterScore: clamp(cluster.score, 0, 100),
    blockedTransfers: Math.max(0, Math.floor(num(e.blockedTransfers, 0))),

    // --- Bối cảnh ---
    trust: clamp(e.trust === undefined ? 100 : e.trust, 0, 100),
    accountAgeDays: e.accountAgeDays == null ? null : Math.max(0, num(e.accountAgeDays, 0)),
    commandCount: Math.max(0, Math.floor(num(e.commandCount, 0))),
    messageCount: Math.max(0, Math.floor(num(e.messageCount, 0))),

    // --- Lịch sử xử lý ---
    activeWarns: Math.max(0, Math.floor(num(hist.activeWarns, 0))),
    totalWarns: Math.max(0, Math.floor(num(hist.totalWarns, 0))),
    activeMutes: Math.max(0, Math.floor(num(hist.activeMutes, 0))),
    totalMutes: Math.max(0, Math.floor(num(hist.totalMutes, 0))),
    totalBans: Math.max(0, Math.floor(num(hist.totalBans, 0))),
    pardons: Math.max(0, Math.floor(num(hist.pardons, 0))),
    lastSanctionAt: Math.max(0, Math.floor(num(hist.lastSanctionAt, 0))),
    currentLevel: LEVELS.includes(String(hist.currentLevel)) ? String(hist.currentLevel) : 'none',

    // --- Miễn trừ ---
    immune: e.immune === true,
  };
}

// =============================================================
//  Tính ĐỘ TIN CẬY của bằng chứng (0..1)
//  Đây là lá chắn chống oan sai. Nguyên tắc: chưa đủ dữ liệu -> tin thấp.
// =============================================================
function computeConfidence(ev, cfg) {
  // 1) Độ dày dữ liệu nhịp gõ lệnh.
  const sampleConf = ramp(ev.macroSamples, 8, 45) * (ev.macroEnough ? 1 : 0.55);

  // 2) Độ dày dữ liệu hành vi chung.
  const activityConf = ramp(ev.commandCount, 12, 120);

  // 3) Bằng chứng cứng: cụm acc, dòng xu một chiều, trượt xác minh.
  //    Đây là những thứ KHÔNG THỂ xảy ra do may mắn.
  const hardConf = Math.max(
    ramp(ev.clusterSize, 2, cfg.decisiveClusterSize),
    ramp(ev.funnelTransfers, 3, cfg.decisiveFunnelTransfers),
    ramp(ev.captchaFailed, 1, cfg.decisiveCaptchaFails),
    ramp(ev.blockedTransfers, 1, 6),
  );

  // 4) Lịch sử xử lý cũ cũng là bằng chứng (đã từng bị bắt).
  const historyConf = ramp(ev.totalWarns + ev.totalMutes * 2 + ev.totalBans * 3, 1, 6);

  // Gộp lại: hard/history là bằng chứng độc lập nên dùng phép hợp mềm,
  // còn sample/activity là "đủ dữ liệu để kết luận" nên lấy trung bình có trọng số.
  const dataConf = clamp01(sampleConf * 0.6 + activityConf * 0.4);
  let conf = orProb(dataConf * 0.85, Math.max(hardConf, historyConf) * 0.9);

  // Người có chat nhiều = có bằng chứng "người thật" -> hạ độ tin cậy buộc tội.
  const socialProof = ramp(ev.messageCount, 20, 300);
  conf *= 1 - socialProof * 0.22;

  // Tài khoản lâu năm cũng được lợi thế nghi vấn.
  if (ev.accountAgeDays != null) conf *= 1 - ramp(ev.accountAgeDays, 90, 720) * 0.12;

  return clamp01(conf);
}

// =============================================================
//  Tính điểm từng nhóm bằng chứng (0..1)
// =============================================================
function computeParts(ev, cfg) {
  const parts = {};

  // ---- 1) macro: dùng máy tự động ----
  // Điểm thô đã do antiAutomation tính. Ở đây chỉ điều chỉnh theo độ dày dữ liệu.
  parts.macro = clamp01((ev.macroScore / 100) * (ev.macroEnough ? 1 : 0.6));

  // ---- 2) clone: tài khoản phụ ----
  const tierBoost = ev.cloneTier === 'freeze' ? 0.12 : ev.cloneTier === 'quarantine' ? 0.06 : 0;
  parts.clone = clamp01(ev.cloneRisk / 100 + tierBoost);

  // ---- 3) evasion: trốn tránh xác minh ----
  const failRatio = ev.captchaIssued > 0 ? ev.captchaFailed / ev.captchaIssued : 0;
  parts.evasion = clamp01(
    Math.max(
      ramp(ev.captchaFailed, 1, cfg.decisiveCaptchaFails),
      ramp(failRatio, 0.34, 0.9) * 0.85,
      ramp(ev.strikes, 1, 5) * 0.8,
    ),
  );
  // Có vượt xác minh sạch sẽ thì được giảm nhẹ.
  if (ev.captchaPassed > 0 && ev.captchaFailed === 0) parts.evasion *= 0.35;

  // ---- 4) economic: thiệt hại kinh tế ----
  const funnelPart = Math.max(
    ramp(ev.funnelTransfers, 3, cfg.decisiveFunnelTransfers),
    ramp(ev.funnelAmount, cfg.decisiveFunnelAmount * 0.2, cfg.decisiveFunnelAmount),
  );
  const clusterPart = Math.max(
    ramp(ev.clusterSize, 2, cfg.decisiveClusterSize),
    ramp(ev.clusterScore, 40, 90) * 0.7,
  );
  parts.economic = clamp01(orProb(funnelPart, clusterPart * 0.9));

  // ---- 5) distrust: điểm tin cậy ----
  parts.distrust = clamp01(ramp(100 - ev.trust, 25, 90));

  // ---- 6) recidivism: tái phạm ----
  const weighted = ev.activeWarns * 1 + ev.activeMutes * 2.5 + ev.totalBans * 4;
  parts.recidivism = clamp01(ramp(weighted, 1, 7));

  return parts;
}

// =============================================================
//  Bằng chứng "quyết định" (decisive)
//  Là loại bằng chứng gần như không thể do trùng hợp / oan sai.
// =============================================================
function decisiveReasons(ev, cfg) {
  const out = [];
  if (ev.funnelTransfers >= cfg.decisiveFunnelTransfers) {
    out.push(`dồn xu một chiều ${ev.funnelTransfers} lần về cùng một tài khoản`);
  }
  if (ev.funnelAmount >= cfg.decisiveFunnelAmount) {
    out.push(`đã chuyển dồn ${ev.funnelAmount.toLocaleString('vi-VN')} xu về một tài khoản`);
  }
  if (ev.clusterSize >= cfg.decisiveClusterSize) {
    out.push(`thuộc cụm ${ev.clusterSize} tài khoản được xác định cùng một chủ`);
  }
  if (ev.captchaFailed >= cfg.decisiveCaptchaFails) {
    out.push(`trượt xác minh người thật ${ev.captchaFailed} lần`);
  }
  if (ev.macroEnough && ev.macroScore >= cfg.decisiveMacroScore) {
    out.push(`nhịp gõ lệnh giống máy tới ${ev.macroScore}/100 với dữ liệu dày`);
  }
  if (ev.totalBans > 0) out.push('đã từng bị cấm dùng bot trước đây');
  return out;
}

// =============================================================
//  HÀM CHÍNH: phán quyết
// =============================================================
/**
 * Đánh giá mức độ nghiêm trọng và đề xuất hình thức xử lý.
 *
 * @param {object} evidence bằng chứng thu được (xem normalizeEvidence)
 * @param {object} options  ghi đè cấu hình (xem DEFAULTS)
 * @param {number} now      mốc thời gian, mặc định Date.now()
 * @returns {object} phán quyết đầy đủ, LUÔN hợp lệ, không bao giờ ném lỗi
 */
function judge(evidence = {}, options = {}, now = Date.now()) {
  const cfg = normalizeConfig(options);
  const ev = normalizeEvidence(evidence);
  const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();

  const parts = computeParts(ev, cfg);
  const confidence = computeConfidence(ev, cfg);

  // ---- Cộng điểm có trọng số ----
  let total = 0;
  let maxTotal = 0;
  const votes = [];
  for (const key of Object.keys(cfg.weights)) {
    const w = Math.max(0, num(cfg.weights[key], 0));
    const p = clamp01(parts[key]);
    total += w * p;
    maxTotal += w;
    if (p >= cfg.corroborateAt) votes.push({ key, strength: w * p });
  }
  let severity = maxTotal > 0 ? (total / maxTotal) * 100 : 0;

  // ---- Thưởng kiểm chứng chéo / trừ tín hiệu đơn lẻ ----
  let corroboration = 0;
  if (votes.length >= 2) {
    corroboration = Math.min(cfg.corroborationMax, (votes.length - 1) * cfg.corroborationBonus);
    severity *= 1 + corroboration;
  } else if (votes.length === 1) {
    severity *= 1 - cfg.lonelySignalPenalty;
  }

  // ---- Bằng chứng yếu thì kéo điểm về gần 0 ----
  // Đây là lá chắn chống oan sai cuối cùng: điểm nghiêm trọng luôn bị
  // giới hạn bởi độ tin cậy. Tin 50% thì án không thể quá 75% mức thô.
  severity *= 0.5 + confidence * 0.5;
  severity = Math.round(clamp(severity, 0, 100));

  votes.sort((a, b) => b.strength - a.strength);
  const reasons = votes.map((v) => v.key);
  const labels = reasons.map((k) => GROUP_LABELS[k] || k);
  const decisive = decisiveReasons(ev, cfg);

  const tier = severityTier(severity);

  // ---- Quyết định mức xử lý ----
  const cooling = ev.lastSanctionAt > 0 && at - ev.lastSanctionAt < cfg.cooldownMs;
  const blockers = [];
  let level = 'none';

  if (ev.immune) {
    blockers.push('Tài khoản nằm trong danh sách miễn trừ / tin cậy.');
  } else {
    // Bậc cao nhất mà ĐIỂM cho phép.
    let byScore = 'none';
    if (severity >= cfg.banAt) byScore = 'ban';
    else if (severity >= cfg.muteAt) byScore = 'mute';
    else if (severity >= cfg.warnAt) byScore = 'warn';
    else if (severity >= cfg.noticeAt) byScore = 'notice';

    // Bậc cao nhất mà ĐỘ TIN CẬY cho phép.
    let byConf = 'none';
    if (confidence >= cfg.minConfidenceBan) byConf = 'ban';
    else if (confidence >= cfg.minConfidenceMute) byConf = 'mute';
    else if (confidence >= cfg.minConfidenceWarn) byConf = 'warn';
    else if (confidence >= cfg.minConfidenceNotice) byConf = 'notice';

    level = rankOf(byScore) <= rankOf(byConf) ? byScore : byConf;
    if (rankOf(byConf) < rankOf(byScore)) {
      blockers.push(
        `Bằng chứng chưa đủ chắc (tin cậy ${Math.round(confidence * 100)}%) nên hạ từ **${
          LEVEL_LABELS[byScore]
        }** xuống **${LEVEL_LABELS[level]}**.`,
      );
    }

    // ---- Thang leo dần: không nhảy bậc vô lý ----
    if (level === 'ban') {
      const ladderOk = ev.totalMutes >= cfg.mutesBeforeBan;
      const hardOk = severity >= cfg.banWithoutLadderAt && decisive.length >= 2;
      const firstOffence = ev.totalWarns === 0 && ev.totalMutes === 0 && ev.totalBans === 0;
      if (cfg.neverBanFirstOffence && firstOffence) {
        level = 'mute';
        blockers.push('Đây là lần vi phạm đầu tiên nên không cấm vĩnh viễn — chuyển sang mute.');
      } else if (!ladderOk && !hardOk) {
        level = 'mute';
        blockers.push(
          `Chưa đủ điều kiện ban (cần ${cfg.mutesBeforeBan} lần mute, hiện có ${ev.totalMutes}) — chuyển sang mute.`,
        );
      }
    }

    if (level === 'mute') {
      const warnedEnough = ev.activeWarns >= cfg.warnsBeforeMute || ev.totalMutes > 0 || ev.totalBans > 0;
      const hardOk = severity >= cfg.muteWithoutWarnAt || decisive.length >= 1;
      if (!warnedEnough && !hardOk) {
        level = 'warn';
        blockers.push(
          `Chưa từng bị cảnh cáo (cần ${cfg.warnsBeforeMute}) và bằng chứng chưa quyết định — chỉ cảnh cáo.`,
        );
      }
    }

    // ---- Chờ nguội: vừa xử lý xong thì không xử lý lại ngay ----
    if (cooling && rankOf(level) <= rankOf(ev.currentLevel)) {
      blockers.push(
        `Vừa xử lý cách đây ${fmtDuration(at - ev.lastSanctionAt)} nên tạm chưa xử lý lại (chờ ${fmtDuration(
          cfg.cooldownMs,
        )}).`,
      );
      level = 'none';
    }
  }

  // ---- Thời lượng mute theo thang leo dần ----
  let durationMs = 0;
  if (level === 'mute') {
    const idx = clamp(ev.totalMutes, 0, cfg.muteLadder.length - 1);
    durationMs = cfg.muteLadder[idx];
    // Điểm càng cao thì án càng dài (nhân tối đa 2 lần), vẫn nằm trong thang.
    const boost = 1 + ramp(severity, cfg.muteAt, 100);
    durationMs = Math.min(cfg.muteLadder[cfg.muteLadder.length - 1] * 2, Math.round(durationMs * boost));
  }

  // ---- Bậc kế tiếp nếu tái phạm (để cảnh báo cho người chơi) ----
  const nextLevel =
    level === 'ban'
      ? 'ban'
      : level === 'mute'
        ? ev.totalMutes + 1 >= cfg.mutesBeforeBan
          ? 'ban'
          : 'mute'
        : level === 'warn'
          ? 'mute'
          : level === 'notice'
            ? 'warn'
            : 'notice';

  const summary = buildSummary(level, severity, confidence, labels, decisive);

  return {
    // Kết quả chính
    level,
    action: level,
    durationMs,
    severity,
    confidence: Math.round(confidence * 1000) / 1000,
    confidencePercent: Math.round(confidence * 100),

    // Diễn giải
    tier: tier.key,
    tierLabel: tier.label,
    tierEmoji: tier.emoji,
    levelLabel: LEVEL_LABELS[level] || level,
    levelEmoji: LEVEL_EMOJI[level] || '⚪',
    reasons,
    labels,
    decisive,
    blockers,
    summary,
    nextLevel,
    nextLevelLabel: LEVEL_LABELS[nextLevel] || nextLevel,

    // Dữ liệu để hiển thị / kiểm thử
    parts,
    votes: votes.map((v) => v.key),
    corroboration: Math.round(corroboration * 100) / 100,
    cooling,
    evidence: ev,
    config: cfg,
    at,
  };
}

function buildSummary(level, severity, confidence, labels, decisive) {
  const head =
    level === 'ban'
      ? 'Cấm dùng bot vĩnh viễn'
      : level === 'mute'
        ? 'Cấm dùng bot tạm thời'
        : level === 'warn'
          ? 'Cảnh cáo'
          : level === 'notice'
            ? 'Nhắc nhở'
            : 'Chưa xử lý';
  const why = decisive.length ? decisive.slice(0, 2).join('; ') : labels.slice(0, 2).join('; ') || 'không có dấu hiệu rõ';
  return `${head} — mức nghiêm trọng ${severity}/100, độ tin cậy ${Math.round(confidence * 100)}% (${why}).`;
}

// =============================================================
//  Trợ giúp cho phần hiển thị & vận hành
// =============================================================

// Thời lượng mute tiếp theo nếu người này bị mute lần nữa.
function nextMuteDuration(pastMutes, options = {}) {
  const cfg = normalizeConfig(options);
  const idx = clamp(Math.floor(num(pastMutes, 0)), 0, cfg.muteLadder.length - 1);
  return cfg.muteLadder[idx];
}

// Mô tả thang xử lý để in ra bảng điều khiển.
function describeLadder(options = {}) {
  const cfg = normalizeConfig(options);
  return {
    thresholds: {
      notice: cfg.noticeAt,
      warn: cfg.warnAt,
      mute: cfg.muteAt,
      ban: cfg.banAt,
    },
    confidence: {
      notice: cfg.minConfidenceNotice,
      warn: cfg.minConfidenceWarn,
      mute: cfg.minConfidenceMute,
      ban: cfg.minConfidenceBan,
    },
    muteLadder: cfg.muteLadder.slice(),
    muteLadderText: cfg.muteLadder.map((ms) => fmtDuration(ms)),
    warnsBeforeMute: cfg.warnsBeforeMute,
    mutesBeforeBan: cfg.mutesBeforeBan,
  };
}

// Kiểm tra một hồ sơ có đang bị hạn chế hay không (dùng cho phần chặn lệnh).
function restrictionOf(record, now = Date.now()) {
  const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  if (!record || typeof record !== 'object') return { restricted: false, level: 'none' };
  if (record.bannedAt && !record.banLiftedAt) {
    return { restricted: true, level: 'ban', until: 0, reason: String(record.banReason || '') };
  }
  const until = Math.floor(num(record.muteUntil, 0));
  if (until > at) {
    return { restricted: true, level: 'mute', until, remaining: until - at, reason: String(record.muteReason || '') };
  }
  return { restricted: false, level: 'none' };
}

module.exports = {
  // Hằng số
  LEVELS,
  LEVEL_RANK,
  LEVEL_LABELS,
  LEVEL_EMOJI,
  SEVERITY_TIERS,
  GROUP_LABELS,
  DEFAULTS,
  MINUTE,
  HOUR,
  DAY,

  // Hàm chính
  judge,

  // Trợ giúp
  normalizeConfig,
  normalizeEvidence,
  computeParts,
  computeConfidence,
  decisiveReasons,
  severityTier,
  nextMuteDuration,
  describeLadder,
  restrictionOf,
  rankOf,
  higherLevel,
  fmtDuration,
  ramp,
  clamp,
  clamp01,
  orProb,
};
