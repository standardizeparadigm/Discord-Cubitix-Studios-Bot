// =============================================================
//  sanctionStore - KHO LƯU TRỮ CỦA HỆ THỐNG XỬ LÝ (warn / mute / ban)
//
//  Lưu ở data/sanctions.json.
//
//  Nguyên tắc thiết kế (giống abuseStore + maintenanceStore để đồng bộ):
//    1) Ghi đĩa được GOM LẠI (debounce) -> không nghẽn I/O dù bot đông người.
//    2) Mọi dữ liệu đọc từ đĩa đi qua sanitize() -> file hỏng/sửa tay cũng
//       không làm sập bot.
//    3) Có CHỈ MỤC TRONG RAM (activeBans / activeMutes) nên việc kiểm tra
//       "người này có bị cấm không?" là O(1) — chạy trên MỌI lệnh nên buộc
//       phải cực nhanh.
//    4) Tự dọn dữ liệu cũ -> file không phình vô hạn.
// =============================================================
'use strict';

const db = require('./Database');
const engine = require('./sanctionEngine');

const store = new db.JsonStore('sanctions.json', {});
const KEY = 'state';

const FLUSH_MS = 6000; // gom ghi đĩa trong 6 giây
const MAX_USERS = 20000;
const MAX_WARNS_PER_USER = 40;
const MAX_HISTORY_PER_USER = 60;
const MAX_CASES = 400;
const MAX_LOG = 150;
const CLEAN_IDLE_MS = 180 * 24 * 60 * 60 * 1000; // 180 ngày sạch sẽ -> dọn hồ sơ

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Các lệnh vẫn được dùng khi đang bị mute / ban.
// Không có các lệnh này thì người bị oan không có đường kêu cứu.
const DEFAULT_ALLOWLIST = ['verify', 'khangnghi', 'appeal', 'help', 'ping', 'botinfo', 'invite'];

// =============================================================
//  Cấu hình
// =============================================================
const CONFIG_DEFAULTS = {
  preset: 'balanced',

  // ---- Công tắc lớn ----
  enabled: true, // bật/tắt toàn bộ việc thực thi án
  autoEnabled: true, // cho phép hệ thống TỰ ĐỘNG ra án
  observeOnly: false, // chế độ quan sát: vẫn chấm điểm & ghi hồ sơ nhưng KHÔNG thực thi
  dmNotify: true, // gửi tin nhắn riêng thông báo cho người bị xử lý
  ownerAlert: true, // báo cho chủ bot mỗi khi có án
  appealEnabled: true, // cho phép kháng nghị
  autoBanEnabled: true, // cho phép hệ thống tự ban (tắt = tối đa chỉ mute)

  // ---- Ngưỡng phán quyết (ghi đè sanctionEngine.DEFAULTS) ----
  noticeAt: engine.DEFAULTS.noticeAt,
  warnAt: engine.DEFAULTS.warnAt,
  muteAt: engine.DEFAULTS.muteAt,
  banAt: engine.DEFAULTS.banAt,

  minConfidenceNotice: engine.DEFAULTS.minConfidenceNotice,
  minConfidenceWarn: engine.DEFAULTS.minConfidenceWarn,
  minConfidenceMute: engine.DEFAULTS.minConfidenceMute,
  minConfidenceBan: engine.DEFAULTS.minConfidenceBan,

  warnsBeforeMute: engine.DEFAULTS.warnsBeforeMute,
  mutesBeforeBan: engine.DEFAULTS.mutesBeforeBan,
  neverBanFirstOffence: engine.DEFAULTS.neverBanFirstOffence,
  muteLadder: engine.DEFAULTS.muteLadder.slice(),
  warnExpireMs: engine.DEFAULTS.warnExpireMs,
  cooldownMs: engine.DEFAULTS.cooldownMs,

  // ---- Vận hành ----
  allowlist: DEFAULT_ALLOWLIST.slice(),
  appealCooldownMs: 12 * HOUR, // chống spam kháng nghị
  maxAppealLength: 600,
};

// Bộ cấu hình sẵn — chủ bot chỉ cần bấm một nút.
const PRESETS = {
  lenient: {
    preset: 'lenient',
    noticeAt: 38,
    warnAt: 56,
    muteAt: 74,
    banAt: 94,
    minConfidenceNotice: 0.35,
    minConfidenceWarn: 0.58,
    minConfidenceMute: 0.74,
    minConfidenceBan: 0.92,
    warnsBeforeMute: 2,
    mutesBeforeBan: 4,
    neverBanFirstOffence: true,
    autoBanEnabled: false,
    muteLadder: [30 * MINUTE, 3 * HOUR, 12 * HOUR, 24 * HOUR, 3 * DAY],
  },
  balanced: {
    preset: 'balanced',
    noticeAt: 30,
    warnAt: 46,
    muteAt: 62,
    banAt: 88,
    minConfidenceNotice: 0.25,
    minConfidenceWarn: 0.45,
    minConfidenceMute: 0.62,
    minConfidenceBan: 0.85,
    warnsBeforeMute: 1,
    mutesBeforeBan: 3,
    neverBanFirstOffence: true,
    autoBanEnabled: true,
    muteLadder: [1 * HOUR, 6 * HOUR, 24 * HOUR, 3 * DAY, 7 * DAY],
  },
  strict: {
    preset: 'strict',
    noticeAt: 24,
    warnAt: 38,
    muteAt: 52,
    banAt: 78,
    minConfidenceNotice: 0.2,
    minConfidenceWarn: 0.38,
    minConfidenceMute: 0.55,
    minConfidenceBan: 0.78,
    warnsBeforeMute: 1,
    mutesBeforeBan: 2,
    neverBanFirstOffence: true,
    autoBanEnabled: true,
    muteLadder: [2 * HOUR, 12 * HOUR, 2 * DAY, 7 * DAY, 14 * DAY],
  },
  ironfist: {
    preset: 'ironfist',
    noticeAt: 20,
    warnAt: 32,
    muteAt: 44,
    banAt: 68,
    minConfidenceNotice: 0.18,
    minConfidenceWarn: 0.32,
    minConfidenceMute: 0.48,
    minConfidenceBan: 0.7,
    warnsBeforeMute: 0,
    mutesBeforeBan: 2,
    neverBanFirstOffence: false,
    autoBanEnabled: true,
    muteLadder: [6 * HOUR, 24 * HOUR, 7 * DAY, 30 * DAY],
  },
};

const PRESET_LABELS = {
  lenient: 'Nhẹ nhàng',
  balanced: 'Cân bằng',
  strict: 'Nghiêm ngặt',
  ironfist: 'Sắt đá',
};

const PRESET_NOTES = {
  lenient: 'Ưu tiên tuyệt đối việc không xử oan. Không bao giờ tự ban.',
  balanced: 'Khuyên dùng. Cân giữa hiệu quả xử lý và tránh oan sai.',
  strict: 'Bắt sớm, án nặng hơn. Dùng khi đang bị cày lậu nhiều.',
  ironfist: 'Cực nghiêm. Có thể ban ngay lần đầu nếu bằng chứng chắc.',
};

// =============================================================
//  Hàm hỗ trợ
// =============================================================
function num(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function int(v, fb = 0) {
  return Math.floor(num(v, fb));
}

function clamp(v, lo, hi) {
  const n = num(v, lo);
  return n < lo ? lo : n > hi ? hi : n;
}

function clamp01(v) {
  return clamp(v, 0, 1);
}

function str(v, max = 400) {
  if (v === null || v === undefined) return '';
  return String(v).slice(0, max);
}

function idStr(v) {
  const s = String(v == null ? '' : v).trim();
  return /^\d{5,25}$/.test(s) ? s : '';
}

let caseSeq = 0;
function newId(prefix) {
  caseSeq = (caseSeq + 1) % 100000;
  return `${prefix}${Date.now().toString(36)}${caseSeq.toString(36)}`;
}

// =============================================================
//  Bộ khung dữ liệu
// =============================================================
function blankCounters() {
  return {
    warn: 0,
    mute: 0,
    ban: 0,
    pardon: 0,
    autoWarn: 0,
    autoMute: 0,
    autoBan: 0,
    manual: 0,
    appeals: 0,
  };
}

function blankAppeal() {
  return { at: 0, text: '', status: 'none', reviewedAt: 0, reviewedBy: '', note: '' };
}

function blankUser(id = '') {
  return {
    id: String(id || ''),
    name: '',
    level: 'none',

    // Án đang có hiệu lực
    muteUntil: 0,
    muteAt: 0,
    muteBy: '',
    muteReason: '',
    muteCaseId: '',
    muteDurationMs: 0,

    bannedAt: 0,
    banBy: '',
    banReason: '',
    banCaseId: '',
    banLiftedAt: 0,

    // Hồ sơ
    warns: [],
    history: [],
    counters: blankCounters(),

    firstSeenAt: 0,
    lastSanctionAt: 0,
    lastEvaluatedAt: 0,
    lastSeverity: 0,
    lastConfidence: 0,
    lastVerdict: 'none',

    blockedAttempts: 0,
    lastBlockedAt: 0,

    immune: false,
    appeal: blankAppeal(),
    note: '',
  };
}

function blankStats() {
  return {
    evaluations: 0,
    warnsIssued: 0,
    mutesIssued: 0,
    bansIssued: 0,
    autoActions: 0,
    manualActions: 0,
    pardons: 0,
    liftedMutes: 0,
    liftedBans: 0,
    blockedCommands: 0,
    appealsFiled: 0,
    appealsAccepted: 0,
    appealsRejected: 0,
    observeOnlySkips: 0,
  };
}

// =============================================================
//  Làm sạch cấu hình
// =============================================================
function sanitizeConfig(raw) {
  const cfg = Object.assign({}, CONFIG_DEFAULTS, raw && typeof raw === 'object' ? raw : {});

  cfg.preset = PRESETS[cfg.preset] ? cfg.preset : 'custom';

  for (const k of [
    'enabled',
    'autoEnabled',
    'observeOnly',
    'dmNotify',
    'ownerAlert',
    'appealEnabled',
    'autoBanEnabled',
    'neverBanFirstOffence',
  ]) {
    cfg[k] = cfg[k] !== false && cfg[k] !== 0 && cfg[k] !== 'false';
  }
  // observeOnly mặc định TẮT nên phải xử lý riêng (mặc định của nó là false).
  cfg.observeOnly = raw && typeof raw === 'object' ? raw.observeOnly === true : false;

  cfg.noticeAt = clamp(int(cfg.noticeAt, CONFIG_DEFAULTS.noticeAt), 1, 97);
  cfg.warnAt = clamp(int(cfg.warnAt, CONFIG_DEFAULTS.warnAt), cfg.noticeAt + 1, 98);
  cfg.muteAt = clamp(int(cfg.muteAt, CONFIG_DEFAULTS.muteAt), cfg.warnAt + 1, 99);
  cfg.banAt = clamp(int(cfg.banAt, CONFIG_DEFAULTS.banAt), cfg.muteAt + 1, 100);

  cfg.minConfidenceNotice = clamp01(num(cfg.minConfidenceNotice, CONFIG_DEFAULTS.minConfidenceNotice));
  cfg.minConfidenceWarn = clamp01(Math.max(num(cfg.minConfidenceWarn, 0), cfg.minConfidenceNotice));
  cfg.minConfidenceMute = clamp01(Math.max(num(cfg.minConfidenceMute, 0), cfg.minConfidenceWarn));
  cfg.minConfidenceBan = clamp01(Math.max(num(cfg.minConfidenceBan, 0), cfg.minConfidenceMute));

  cfg.warnsBeforeMute = clamp(int(cfg.warnsBeforeMute, 1), 0, 10);
  cfg.mutesBeforeBan = clamp(int(cfg.mutesBeforeBan, 3), 1, 20);

  const ladder = Array.isArray(cfg.muteLadder) ? cfg.muteLadder : CONFIG_DEFAULTS.muteLadder;
  const clean = ladder
    .map((x) => int(x, 0))
    .filter((x) => x >= MINUTE && x <= 365 * DAY)
    .sort((a, b) => a - b)
    .slice(0, 10);
  cfg.muteLadder = clean.length ? clean : CONFIG_DEFAULTS.muteLadder.slice();

  cfg.warnExpireMs = clamp(int(cfg.warnExpireMs, CONFIG_DEFAULTS.warnExpireMs), HOUR, 365 * DAY);
  cfg.cooldownMs = clamp(int(cfg.cooldownMs, CONFIG_DEFAULTS.cooldownMs), 0, 30 * DAY);
  cfg.appealCooldownMs = clamp(int(cfg.appealCooldownMs, CONFIG_DEFAULTS.appealCooldownMs), MINUTE, 30 * DAY);
  cfg.maxAppealLength = clamp(int(cfg.maxAppealLength, 600), 40, 1500);

  const list = Array.isArray(cfg.allowlist) ? cfg.allowlist : DEFAULT_ALLOWLIST;
  const seen = new Set();
  cfg.allowlist = [];
  for (const raw2 of list) {
    const name = String(raw2 || '')
      .trim()
      .toLowerCase()
      .slice(0, 32);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    cfg.allowlist.push(name);
    if (cfg.allowlist.length >= 40) break;
  }
  if (!cfg.allowlist.length) cfg.allowlist = DEFAULT_ALLOWLIST.slice();

  return cfg;
}

// =============================================================
//  Làm sạch một hồ sơ người dùng
// =============================================================
function sanitizeUser(raw, id) {
  const base = blankUser(id);
  if (!raw || typeof raw !== 'object') return base;

  base.name = str(raw.name, 80);
  base.muteUntil = Math.max(0, int(raw.muteUntil, 0));
  base.muteAt = Math.max(0, int(raw.muteAt, 0));
  base.muteBy = str(raw.muteBy, 32);
  base.muteReason = str(raw.muteReason, 300);
  base.muteCaseId = str(raw.muteCaseId, 40);
  base.muteDurationMs = Math.max(0, int(raw.muteDurationMs, 0));

  base.bannedAt = Math.max(0, int(raw.bannedAt, 0));
  base.banBy = str(raw.banBy, 32);
  base.banReason = str(raw.banReason, 300);
  base.banCaseId = str(raw.banCaseId, 40);
  base.banLiftedAt = Math.max(0, int(raw.banLiftedAt, 0));

  if (Array.isArray(raw.warns)) {
    for (const w of raw.warns.slice(-MAX_WARNS_PER_USER)) {
      if (!w || typeof w !== 'object') continue;
      base.warns.push({
        id: str(w.id, 40) || newId('W'),
        at: Math.max(0, int(w.at, 0)),
        by: str(w.by, 32),
        reason: str(w.reason, 300),
        severity: clamp(int(w.severity, 0), 0, 100),
        confidence: clamp01(num(w.confidence, 0)),
        source: str(w.source, 40) || 'manual',
        expiresAt: Math.max(0, int(w.expiresAt, 0)),
        revokedAt: Math.max(0, int(w.revokedAt, 0)),
        caseId: str(w.caseId, 40),
      });
    }
  }

  if (Array.isArray(raw.history)) {
    for (const h of raw.history.slice(-MAX_HISTORY_PER_USER)) {
      if (!h || typeof h !== 'object') continue;
      base.history.push({
        id: str(h.id, 40) || newId('H'),
        at: Math.max(0, int(h.at, 0)),
        type: str(h.type, 20) || 'note',
        by: str(h.by, 32),
        reason: str(h.reason, 300),
        severity: clamp(int(h.severity, 0), 0, 100),
        confidence: clamp01(num(h.confidence, 0)),
        durationMs: Math.max(0, int(h.durationMs, 0)),
        source: str(h.source, 40) || 'manual',
        caseId: str(h.caseId, 40),
      });
    }
  }

  const c = raw.counters && typeof raw.counters === 'object' ? raw.counters : {};
  base.counters = blankCounters();
  for (const k of Object.keys(base.counters)) base.counters[k] = Math.max(0, int(c[k], 0));

  base.firstSeenAt = Math.max(0, int(raw.firstSeenAt, 0));
  base.lastSanctionAt = Math.max(0, int(raw.lastSanctionAt, 0));
  base.lastEvaluatedAt = Math.max(0, int(raw.lastEvaluatedAt, 0));
  base.lastSeverity = clamp(int(raw.lastSeverity, 0), 0, 100);
  base.lastConfidence = clamp01(num(raw.lastConfidence, 0));
  base.lastVerdict = engine.LEVELS.includes(String(raw.lastVerdict)) ? String(raw.lastVerdict) : 'none';

  base.blockedAttempts = Math.max(0, int(raw.blockedAttempts, 0));
  base.lastBlockedAt = Math.max(0, int(raw.lastBlockedAt, 0));
  base.immune = raw.immune === true;
  base.note = str(raw.note, 500);

  const ap = raw.appeal && typeof raw.appeal === 'object' ? raw.appeal : {};
  base.appeal = {
    at: Math.max(0, int(ap.at, 0)),
    text: str(ap.text, 1500),
    status: ['none', 'pending', 'accepted', 'rejected'].includes(String(ap.status)) ? String(ap.status) : 'none',
    reviewedAt: Math.max(0, int(ap.reviewedAt, 0)),
    reviewedBy: str(ap.reviewedBy, 32),
    note: str(ap.note, 500),
  };

  base.level = deriveLevel(base, Date.now());
  return base;
}

// Trạng thái hiện tại được TÍNH RA, không tin vào giá trị lưu trên đĩa.
// Nhờ vậy dữ liệu không bao giờ "lệch" kiểu đã hết mute nhưng vẫn ghi mute.
function deriveLevel(rec, now) {
  if (!rec) return 'none';
  if (rec.bannedAt > 0 && !rec.banLiftedAt) return 'ban';
  if (rec.muteUntil > now) return 'mute';
  if (activeWarnsOf(rec, now) > 0) return 'warn';
  return 'none';
}

function activeWarnsOf(rec, now) {
  if (!rec || !Array.isArray(rec.warns)) return 0;
  let n = 0;
  for (const w of rec.warns) {
    if (w.revokedAt) continue;
    if (w.expiresAt && w.expiresAt <= now) continue;
    n++;
  }
  return n;
}

// =============================================================
//  Làm sạch toàn bộ state
// =============================================================
function sanitize(raw) {
  const now = Date.now();
  const out = {
    version: 2,
    createdAt: now,
    config: sanitizeConfig(null),
    users: {},
    cases: {},
    log: [],
    stats: blankStats(),
  };
  if (!raw || typeof raw !== 'object') return out;

  out.createdAt = Math.max(0, int(raw.createdAt, now)) || now;
  out.config = sanitizeConfig(raw.config);

  if (raw.users && typeof raw.users === 'object') {
    let count = 0;
    for (const key of Object.keys(raw.users)) {
      const id = idStr(key);
      if (!id) continue;
      out.users[id] = sanitizeUser(raw.users[key], id);
      if (++count >= MAX_USERS) break;
    }
  }

  if (raw.cases && typeof raw.cases === 'object') {
    const keys = Object.keys(raw.cases).slice(-MAX_CASES);
    for (const k of keys) {
      const c = raw.cases[k];
      if (!c || typeof c !== 'object') continue;
      out.cases[str(k, 40)] = {
        id: str(c.id, 40) || str(k, 40),
        at: Math.max(0, int(c.at, 0)),
        userId: idStr(c.userId),
        userName: str(c.userName, 80),
        level: engine.LEVELS.includes(String(c.level)) ? String(c.level) : 'none',
        severity: clamp(int(c.severity, 0), 0, 100),
        confidence: clamp01(num(c.confidence, 0)),
        durationMs: Math.max(0, int(c.durationMs, 0)),
        source: str(c.source, 40) || 'manual',
        by: str(c.by, 32),
        reason: str(c.reason, 400),
        labels: Array.isArray(c.labels) ? c.labels.slice(0, 10).map((x) => str(x, 80)) : [],
        decisive: Array.isArray(c.decisive) ? c.decisive.slice(0, 8).map((x) => str(x, 160)) : [],
        blockers: Array.isArray(c.blockers) ? c.blockers.slice(0, 8).map((x) => str(x, 240)) : [],
        parts: c.parts && typeof c.parts === 'object' ? c.parts : {},
        applied: c.applied === true,
        outcome: str(c.outcome, 60),
      };
    }
  }

  if (Array.isArray(raw.log)) {
    for (const e of raw.log.slice(-MAX_LOG)) {
      if (!e || typeof e !== 'object') continue;
      out.log.push({
        at: Math.max(0, int(e.at, 0)),
        kind: str(e.kind, 20) || 'info',
        actor: str(e.actor, 32),
        text: str(e.text, 400),
      });
    }
  }

  if (raw.stats && typeof raw.stats === 'object') {
    for (const k of Object.keys(out.stats)) out.stats[k] = Math.max(0, int(raw.stats[k], 0));
  }

  return out;
}

// =============================================================
//  Nạp & lưu
// =============================================================
let state = sanitize(store.get(KEY, null));
let dirty = false;
let timer = null;

// ---- Chỉ mục trong RAM: kiểm tra cực nhanh trên mọi lệnh ----
const activeBans = new Set();
const activeMutes = new Map(); // id -> muteUntil

function rebuildIndex() {
  activeBans.clear();
  activeMutes.clear();
  const now = Date.now();
  for (const id of Object.keys(state.users)) {
    const rec = state.users[id];
    if (rec.bannedAt > 0 && !rec.banLiftedAt) activeBans.add(id);
    if (rec.muteUntil > now) activeMutes.set(id, rec.muteUntil);
  }
}
rebuildIndex();

function touchIndex(rec) {
  if (!rec || !rec.id) return;
  if (rec.bannedAt > 0 && !rec.banLiftedAt) activeBans.add(rec.id);
  else activeBans.delete(rec.id);
  if (rec.muteUntil > Date.now()) activeMutes.set(rec.id, rec.muteUntil);
  else activeMutes.delete(rec.id);
}

function persistNow() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!dirty) return;
  dirty = false;
  try {
    store.set(KEY, state);
  } catch {
    /* không được để việc ghi đĩa làm sập bot */
  }
}

function persistSoon() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    persistNow();
  }, FLUSH_MS);
  if (timer && typeof timer.unref === 'function') timer.unref();
}

function flush() {
  persistNow();
}

// =============================================================
//  Cấu hình
// =============================================================
function getConfig() {
  return Object.assign({}, state.config, { muteLadder: state.config.muteLadder.slice(), allowlist: state.config.allowlist.slice() });
}

// Cấu hình dạng engine hiểu được.
function engineOptions() {
  const c = state.config;
  return {
    noticeAt: c.noticeAt,
    warnAt: c.warnAt,
    muteAt: c.muteAt,
    banAt: c.banAt,
    minConfidenceNotice: c.minConfidenceNotice,
    minConfidenceWarn: c.minConfidenceWarn,
    minConfidenceMute: c.minConfidenceMute,
    minConfidenceBan: c.minConfidenceBan,
    warnsBeforeMute: c.warnsBeforeMute,
    mutesBeforeBan: c.mutesBeforeBan,
    neverBanFirstOffence: c.neverBanFirstOffence,
    muteLadder: c.muteLadder.slice(),
    warnExpireMs: c.warnExpireMs,
    cooldownMs: c.cooldownMs,
  };
}

function setConfig(patch) {
  if (!patch || typeof patch !== 'object') return getConfig();
  const merged = Object.assign({}, state.config, patch);
  // Sửa tay bất kỳ ngưỡng nào -> không còn là bộ cấu hình sẵn nữa.
  const touchedTuning = Object.keys(patch).some((k) =>
    [
      'noticeAt',
      'warnAt',
      'muteAt',
      'banAt',
      'minConfidenceNotice',
      'minConfidenceWarn',
      'minConfidenceMute',
      'minConfidenceBan',
      'warnsBeforeMute',
      'mutesBeforeBan',
      'muteLadder',
      'neverBanFirstOffence',
      'autoBanEnabled',
    ].includes(k),
  );
  if (touchedTuning && !patch.preset) merged.preset = 'custom';
  state.config = sanitizeConfig(merged);
  persistSoon();
  return getConfig();
}

function applyPreset(name) {
  const key = String(name || '').toLowerCase();
  if (!PRESETS[key]) {
    return { ok: false, error: 'Mức độ không hợp lệ. Chọn: ' + Object.keys(PRESETS).join(', ') };
  }
  state.config = sanitizeConfig(Object.assign({}, state.config, PRESETS[key]));
  persistSoon();
  return { ok: true, config: getConfig() };
}

// =============================================================
//  Truy cập hồ sơ
// =============================================================
function peek(userId) {
  const id = idStr(userId);
  return id && state.users[id] ? state.users[id] : null;
}

function user(userId, now = Date.now()) {
  const id = idStr(userId);
  if (!id) return blankUser('');
  let rec = state.users[id];
  if (!rec) {
    rec = blankUser(id);
    rec.firstSeenAt = now;
    state.users[id] = rec;
    persistSoon();
  }
  return rec;
}

function setName(userId, name) {
  const rec = peek(userId);
  if (!rec) return;
  const n = str(name, 80);
  if (n && rec.name !== n) {
    rec.name = n;
    persistSoon();
  }
}

function allUsers() {
  return Object.keys(state.users).map((id) => state.users[id]);
}

function userCount() {
  return Object.keys(state.users).length;
}

// =============================================================
//  ĐƯỜNG NHANH: kiểm tra hạn chế (chạy trên mọi lệnh)
// =============================================================
/**
 * Người này có đang bị cấm dùng bot không?
 * O(1) — chỉ tra Set/Map trong RAM, không đọc đĩa, không quét mảng.
 */
function restriction(userId, now = Date.now()) {
  const id = idStr(userId);
  if (!id) return { restricted: false, level: 'none' };

  if (activeBans.has(id)) {
    const rec = state.users[id];
    return {
      restricted: true,
      level: 'ban',
      until: 0,
      remaining: Infinity,
      reason: rec ? rec.banReason : '',
      at: rec ? rec.bannedAt : 0,
      caseId: rec ? rec.banCaseId : '',
    };
  }

  const until = activeMutes.get(id);
  if (until !== undefined) {
    if (until > now) {
      const rec = state.users[id];
      return {
        restricted: true,
        level: 'mute',
        until,
        remaining: until - now,
        reason: rec ? rec.muteReason : '',
        at: rec ? rec.muteAt : 0,
        caseId: rec ? rec.muteCaseId : '',
      };
    }
    // Hết hạn -> dọn chỉ mục ngay để lần sau khỏi phải kiểm tra lại.
    activeMutes.delete(id);
  }
  return { restricted: false, level: 'none' };
}

function hasAnyRestriction() {
  return activeBans.size > 0 || activeMutes.size > 0;
}

function isBanned(userId) {
  const id = idStr(userId);
  return Boolean(id && activeBans.has(id));
}

function isMuted(userId, now = Date.now()) {
  const r = restriction(userId, now);
  return r.restricted && r.level === 'mute';
}

function isImmune(userId) {
  const rec = peek(userId);
  return Boolean(rec && rec.immune);
}

function allowlist() {
  return state.config.allowlist.slice();
}

// Lệnh này có được dùng khi đang bị mute/ban?
function isAllowedCommand(name) {
  const n = String(name || '')
    .trim()
    .toLowerCase();
  if (!n) return false;
  return state.config.allowlist.indexOf(n) !== -1;
}

// =============================================================
//  Ghi hồ sơ
// =============================================================
function pushHistory(rec, entry) {
  rec.history.push(
    Object.assign(
      {
        id: newId('H'),
        at: Date.now(),
        type: 'note',
        by: '',
        reason: '',
        severity: 0,
        confidence: 0,
        durationMs: 0,
        source: 'manual',
        caseId: '',
      },
      entry || {},
    ),
  );
  if (rec.history.length > MAX_HISTORY_PER_USER) {
    rec.history.splice(0, rec.history.length - MAX_HISTORY_PER_USER);
  }
}

function log(kind, actor, text) {
  state.log.push({
    at: Date.now(),
    kind: str(kind, 20) || 'info',
    actor: str(actor, 32),
    text: str(text, 400),
  });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
  persistSoon();
}

function logEntries(limit = MAX_LOG) {
  const n = clamp(int(limit, MAX_LOG), 1, MAX_LOG);
  return state.log.slice(-n).reverse();
}

function clearLog(by = '') {
  const n = state.log.length;
  state.log = [];
  log('info', by, `Đã xoá ${n} dòng nhật ký xử lý.`);
  return n;
}

function bump(key, by = 1) {
  if (Object.prototype.hasOwnProperty.call(state.stats, key)) {
    state.stats[key] = Math.max(0, int(state.stats[key], 0) + int(by, 1));
    persistSoon();
  }
}

function stats() {
  const now = Date.now();
  return Object.assign({}, state.stats, {
    users: userCount(),
    activeBans: activeBans.size,
    activeMutes: countActiveMutes(now),
    activeWarnUsers: allUsers().filter((u) => activeWarnsOf(u, now) > 0).length,
    pendingAppeals: allUsers().filter((u) => u.appeal && u.appeal.status === 'pending').length,
    immune: allUsers().filter((u) => u.immune).length,
    cases: Object.keys(state.cases).length,
  });
}

function countActiveMutes(now = Date.now()) {
  let n = 0;
  for (const until of activeMutes.values()) if (until > now) n++;
  return n;
}

function resetStats() {
  state.stats = blankStats();
  persistSoon();
}

// =============================================================
//  Hồ sơ vụ việc (case)
// =============================================================
function recordCase(data) {
  const id = str(data && data.id, 40) || newId('C');
  const c = {
    id,
    at: Math.max(0, int(data && data.at, Date.now())) || Date.now(),
    userId: idStr(data && data.userId),
    userName: str(data && data.userName, 80),
    level: engine.LEVELS.includes(String(data && data.level)) ? String(data.level) : 'none',
    severity: clamp(int(data && data.severity, 0), 0, 100),
    confidence: clamp01(num(data && data.confidence, 0)),
    durationMs: Math.max(0, int(data && data.durationMs, 0)),
    source: str(data && data.source, 40) || 'manual',
    by: str(data && data.by, 32),
    reason: str(data && data.reason, 400),
    labels: Array.isArray(data && data.labels) ? data.labels.slice(0, 10).map((x) => str(x, 80)) : [],
    decisive: Array.isArray(data && data.decisive) ? data.decisive.slice(0, 8).map((x) => str(x, 160)) : [],
    blockers: Array.isArray(data && data.blockers) ? data.blockers.slice(0, 8).map((x) => str(x, 240)) : [],
    parts: data && data.parts && typeof data.parts === 'object' ? data.parts : {},
    applied: Boolean(data && data.applied),
    outcome: str(data && data.outcome, 60),
  };
  state.cases[id] = c;

  const keys = Object.keys(state.cases);
  if (keys.length > MAX_CASES) {
    keys
      .sort((a, b) => (state.cases[a].at || 0) - (state.cases[b].at || 0))
      .slice(0, keys.length - MAX_CASES)
      .forEach((k) => delete state.cases[k]);
  }
  persistSoon();
  return c;
}

function getCase(id) {
  const key = str(id, 40);
  return key && state.cases[key] ? state.cases[key] : null;
}

function recentCases(limit = 20) {
  const n = clamp(int(limit, 20), 1, MAX_CASES);
  return Object.keys(state.cases)
    .map((k) => state.cases[k])
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .slice(0, n);
}

function casesOf(userId, limit = 10) {
  const id = idStr(userId);
  if (!id) return [];
  const n = clamp(int(limit, 10), 1, 100);
  return Object.keys(state.cases)
    .map((k) => state.cases[k])
    .filter((c) => c.userId === id)
    .sort((a, b) => (b.at || 0) - (a.at || 0))
    .slice(0, n);
}

// =============================================================
//  Áp án
// =============================================================
function addWarn(userId, opts = {}) {
  const id = idStr(userId);
  if (!id) return { ok: false, error: 'ID người dùng không hợp lệ.' };
  const now = Math.max(0, int(opts.now, Date.now())) || Date.now();
  const rec = user(id, now);
  if (opts.name) rec.name = str(opts.name, 80);

  const warn = {
    id: newId('W'),
    at: now,
    by: str(opts.by, 32) || 'system',
    reason: str(opts.reason, 300) || 'Không ghi lý do',
    severity: clamp(int(opts.severity, 0), 0, 100),
    confidence: clamp01(num(opts.confidence, 0)),
    source: str(opts.source, 40) || 'manual',
    expiresAt: now + (Math.max(0, int(opts.expiresMs, 0)) || state.config.warnExpireMs),
    revokedAt: 0,
    caseId: str(opts.caseId, 40),
  };
  rec.warns.push(warn);
  if (rec.warns.length > MAX_WARNS_PER_USER) rec.warns.splice(0, rec.warns.length - MAX_WARNS_PER_USER);

  rec.counters.warn++;
  if (warn.source === 'manual') rec.counters.manual++;
  else rec.counters.autoWarn++;
  rec.lastSanctionAt = now;
  rec.level = deriveLevel(rec, now);

  pushHistory(rec, {
    at: now,
    type: 'warn',
    by: warn.by,
    reason: warn.reason,
    severity: warn.severity,
    confidence: warn.confidence,
    source: warn.source,
    caseId: warn.caseId,
  });

  bump('warnsIssued');
  bump(warn.source === 'manual' ? 'manualActions' : 'autoActions');
  persistSoon();
  return { ok: true, warn, record: rec, activeWarns: activeWarnsOf(rec, now) };
}

function addMute(userId, opts = {}) {
  const id = idStr(userId);
  if (!id) return { ok: false, error: 'ID người dùng không hợp lệ.' };
  const now = Math.max(0, int(opts.now, Date.now())) || Date.now();
  const rec = user(id, now);
  if (opts.name) rec.name = str(opts.name, 80);

  let duration = Math.max(0, int(opts.durationMs, 0));
  if (!duration) {
    const idx = clamp(rec.counters.mute, 0, state.config.muteLadder.length - 1);
    duration = state.config.muteLadder[idx];
  }
  duration = clamp(duration, MINUTE, 3650 * DAY);

  const until = now + duration;
  // Không bao giờ rút ngắn án đang có hiệu lực bằng một án mới ngắn hơn.
  const source = str(opts.source, 40) || 'manual';
  if (rec.muteUntil > until && source !== 'manual') {
    return {
      ok: false,
      error: 'Người này đang bị mute dài hơn án mới — giữ án cũ.',
      record: rec,
      until: rec.muteUntil,
    };
  }

  rec.muteUntil = until;
  rec.muteAt = now;
  rec.muteBy = str(opts.by, 32) || 'system';
  rec.muteReason = str(opts.reason, 300) || 'Không ghi lý do';
  rec.muteCaseId = str(opts.caseId, 40);
  rec.muteDurationMs = duration;
  rec.counters.mute++;
  if (source === 'manual') rec.counters.manual++;
  else rec.counters.autoMute++;
  rec.lastSanctionAt = now;
  rec.level = deriveLevel(rec, now);

  pushHistory(rec, {
    at: now,
    type: 'mute',
    by: rec.muteBy,
    reason: rec.muteReason,
    severity: clamp(int(opts.severity, 0), 0, 100),
    confidence: clamp01(num(opts.confidence, 0)),
    durationMs: duration,
    source,
    caseId: rec.muteCaseId,
  });

  touchIndex(rec);
  bump('mutesIssued');
  bump(source === 'manual' ? 'manualActions' : 'autoActions');
  persistSoon();
  return { ok: true, until, durationMs: duration, record: rec };
}

function addBan(userId, opts = {}) {
  const id = idStr(userId);
  if (!id) return { ok: false, error: 'ID người dùng không hợp lệ.' };
  const now = Math.max(0, int(opts.now, Date.now())) || Date.now();
  const rec = user(id, now);
  if (opts.name) rec.name = str(opts.name, 80);
  if (rec.bannedAt > 0 && !rec.banLiftedAt) {
    return { ok: false, error: 'Người này đã bị cấm vĩnh viễn từ trước.', record: rec };
  }

  const source = str(opts.source, 40) || 'manual';
  rec.bannedAt = now;
  rec.banBy = str(opts.by, 32) || 'system';
  rec.banReason = str(opts.reason, 300) || 'Không ghi lý do';
  rec.banCaseId = str(opts.caseId, 40);
  rec.banLiftedAt = 0;
  rec.counters.ban++;
  if (source === 'manual') rec.counters.manual++;
  else rec.counters.autoBan++;
  rec.lastSanctionAt = now;
  rec.level = 'ban';

  pushHistory(rec, {
    at: now,
    type: 'ban',
    by: rec.banBy,
    reason: rec.banReason,
    severity: clamp(int(opts.severity, 0), 0, 100),
    confidence: clamp01(num(opts.confidence, 0)),
    source,
    caseId: rec.banCaseId,
  });

  touchIndex(rec);
  bump('bansIssued');
  bump(source === 'manual' ? 'manualActions' : 'autoActions');
  persistSoon();
  return { ok: true, record: rec };
}

// =============================================================
//  Gỡ án
// =============================================================
function liftMute(userId, by = '', note = '') {
  const rec = peek(userId);
  const now = Date.now();
  if (!rec || rec.muteUntil <= now) return { ok: false, error: 'Người này không bị mute.' };
  rec.muteUntil = 0;
  rec.muteReason = '';
  rec.muteCaseId = '';
  rec.level = deriveLevel(rec, now);
  pushHistory(rec, { at: now, type: 'unmute', by: str(by, 32), reason: str(note, 300) || 'Gỡ mute thủ công' });
  touchIndex(rec);
  bump('liftedMutes');
  persistSoon();
  return { ok: true, record: rec };
}

function liftBan(userId, by = '', note = '') {
  const rec = peek(userId);
  const now = Date.now();
  if (!rec || !rec.bannedAt || rec.banLiftedAt) return { ok: false, error: 'Người này không bị cấm vĩnh viễn.' };
  rec.banLiftedAt = now;
  rec.level = deriveLevel(rec, now);
  pushHistory(rec, { at: now, type: 'unban', by: str(by, 32), reason: str(note, 300) || 'Gỡ cấm thủ công' });
  touchIndex(rec);
  bump('liftedBans');
  persistSoon();
  return { ok: true, record: rec };
}

function revokeWarn(userId, warnId, by = '') {
  const rec = peek(userId);
  if (!rec) return { ok: false, error: 'Không có hồ sơ nào.' };
  const now = Date.now();
  const target = String(warnId || '');
  let hit = null;
  if (target) hit = rec.warns.find((w) => w.id === target && !w.revokedAt) || null;
  else {
    for (let i = rec.warns.length - 1; i >= 0; i--) {
      const w = rec.warns[i];
      if (!w.revokedAt && (!w.expiresAt || w.expiresAt > now)) {
        hit = w;
        break;
      }
    }
  }
  if (!hit) return { ok: false, error: 'Không tìm thấy cảnh cáo còn hiệu lực.' };
  hit.revokedAt = now;
  rec.level = deriveLevel(rec, now);
  pushHistory(rec, { at: now, type: 'unwarn', by: str(by, 32), reason: 'Xoá cảnh cáo ' + hit.id });
  persistSoon();
  return { ok: true, warn: hit, record: rec, activeWarns: activeWarnsOf(rec, now) };
}

function clearWarns(userId, by = '') {
  const rec = peek(userId);
  if (!rec) return { ok: false, error: 'Không có hồ sơ nào.' };
  const now = Date.now();
  let n = 0;
  for (const w of rec.warns) {
    if (!w.revokedAt && (!w.expiresAt || w.expiresAt > now)) {
      w.revokedAt = now;
      n++;
    }
  }
  rec.level = deriveLevel(rec, now);
  if (n) pushHistory(rec, { at: now, type: 'unwarn', by: str(by, 32), reason: `Xoá toàn bộ ${n} cảnh cáo` });
  persistSoon();
  return { ok: true, cleared: n, record: rec };
}

// Tha bổng hoàn toàn: xoá mọi án + reset bộ đếm leo bậc.
function pardon(userId, by = '', note = '', hard = false) {
  const rec = peek(userId);
  if (!rec) return { ok: false, error: 'Không có hồ sơ nào.' };
  const now = Date.now();
  rec.muteUntil = 0;
  rec.muteReason = '';
  rec.muteCaseId = '';
  if (rec.bannedAt && !rec.banLiftedAt) rec.banLiftedAt = now;
  for (const w of rec.warns) if (!w.revokedAt) w.revokedAt = now;
  rec.counters.pardon++;
  if (hard) {
    // Xoá sạch lịch sử leo bậc: coi như người mới.
    rec.counters.warn = 0;
    rec.counters.mute = 0;
    rec.counters.ban = 0;
    rec.counters.autoWarn = 0;
    rec.counters.autoMute = 0;
    rec.counters.autoBan = 0;
    rec.bannedAt = 0;
    rec.banLiftedAt = 0;
    rec.banReason = '';
  }
  rec.lastSanctionAt = 0;
  rec.level = deriveLevel(rec, now);
  if (rec.appeal.status === 'pending') {
    rec.appeal.status = 'accepted';
    rec.appeal.reviewedAt = now;
    rec.appeal.reviewedBy = str(by, 32);
    rec.appeal.note = str(note, 500) || 'Được tha bổng';
  }
  pushHistory(rec, {
    at: now,
    type: 'pardon',
    by: str(by, 32),
    reason: str(note, 300) || (hard ? 'Tha bổng & xoá sạch hồ sơ' : 'Tha bổng'),
  });
  touchIndex(rec);
  bump('pardons');
  persistSoon();
  return { ok: true, record: rec, hard: Boolean(hard) };
}

function setImmune(userId, on, by = '') {
  const id = idStr(userId);
  if (!id) return { ok: false, error: 'ID người dùng không hợp lệ.' };
  const rec = user(id);
  rec.immune = Boolean(on);
  pushHistory(rec, {
    at: Date.now(),
    type: 'immune',
    by: str(by, 32),
    reason: rec.immune ? 'Thêm vào danh sách miễn trừ' : 'Bỏ khỏi danh sách miễn trừ',
  });
  persistSoon();
  return { ok: true, immune: rec.immune, record: rec };
}

function setNote(userId, text, by = '') {
  const id = idStr(userId);
  if (!id) return { ok: false, error: 'ID người dùng không hợp lệ.' };
  const rec = user(id);
  rec.note = str(text, 500);
  pushHistory(rec, { at: Date.now(), type: 'note', by: str(by, 32), reason: rec.note || 'Xoá ghi chú' });
  persistSoon();
  return { ok: true, record: rec };
}

function noteEvaluation(userId, verdict) {
  const id = idStr(userId);
  if (!id || !verdict) return;
  const rec = user(id);
  rec.lastEvaluatedAt = Date.now();
  rec.lastSeverity = clamp(int(verdict.severity, 0), 0, 100);
  rec.lastConfidence = clamp01(num(verdict.confidence, 0));
  rec.lastVerdict = engine.LEVELS.includes(String(verdict.level)) ? String(verdict.level) : 'none';
  bump('evaluations');
  persistSoon();
}

function noteBlocked(userId) {
  const id = idStr(userId);
  if (!id) return;
  const rec = state.users[id];
  if (!rec) return;
  rec.blockedAttempts++;
  rec.lastBlockedAt = Date.now();
  bump('blockedCommands');
  persistSoon();
}

// =============================================================
//  Kháng nghị
// =============================================================
function submitAppeal(userId, text, now = Date.now()) {
  if (!state.config.appealEnabled) return { ok: false, error: 'Chủ bot đang tắt tính năng kháng nghị.' };
  const id = idStr(userId);
  if (!id) return { ok: false, error: 'ID người dùng không hợp lệ.' };
  const rec = user(id, now);
  const r = restriction(id, now);
  const hasWarn = activeWarnsOf(rec, now) > 0;
  if (!r.restricted && !hasWarn) return { ok: false, error: 'Bạn không có án nào để kháng nghị.' };
  if (rec.appeal.status === 'pending') return { ok: false, error: 'Bạn đã có một kháng nghị đang chờ xét.' };
  if (rec.appeal.reviewedAt && now - rec.appeal.reviewedAt < state.config.appealCooldownMs) {
    return {
      ok: false,
      error: `Bạn vừa kháng nghị rồi. Vui lòng chờ ${engine.fmtDuration(
        state.config.appealCooldownMs - (now - rec.appeal.reviewedAt),
      )} nữa.`,
    };
  }
  const body = str(text, state.config.maxAppealLength).trim();
  if (body.length < 10) return { ok: false, error: 'Hãy viết ít nhất 10 ký tự để chủ bot hiểu tình huống của bạn.' };

  rec.appeal = { at: now, text: body, status: 'pending', reviewedAt: 0, reviewedBy: '', note: '' };
  rec.counters.appeals++;
  pushHistory(rec, { at: now, type: 'appeal', by: id, reason: body.slice(0, 200) });
  bump('appealsFiled');
  persistSoon();
  return { ok: true, record: rec, level: r.level !== 'none' ? r.level : 'warn' };
}

function reviewAppeal(userId, decision, by = '', note = '') {
  const rec = peek(userId);
  if (!rec) return { ok: false, error: 'Không có hồ sơ nào.' };
  if (rec.appeal.status !== 'pending') return { ok: false, error: 'Người này không có kháng nghị đang chờ.' };
  const now = Date.now();
  const accept = String(decision) === 'accept' || decision === true;
  rec.appeal.status = accept ? 'accepted' : 'rejected';
  rec.appeal.reviewedAt = now;
  rec.appeal.reviewedBy = str(by, 32);
  rec.appeal.note = str(note, 500);
  pushHistory(rec, {
    at: now,
    type: accept ? 'appeal_accept' : 'appeal_reject',
    by: str(by, 32),
    reason: rec.appeal.note || (accept ? 'Chấp nhận kháng nghị' : 'Từ chối kháng nghị'),
  });
  bump(accept ? 'appealsAccepted' : 'appealsRejected');
  persistSoon();
  return { ok: true, record: rec, accepted: accept };
}

function pendingAppeals(limit = 20) {
  const n = clamp(int(limit, 20), 1, 200);
  return allUsers()
    .filter((u) => u.appeal && u.appeal.status === 'pending')
    .sort((a, b) => (a.appeal.at || 0) - (b.appeal.at || 0))
    .slice(0, n);
}

// =============================================================
//  Danh sách & báo cáo
// =============================================================
function listRestricted(now = Date.now(), limit = 50) {
  const n = clamp(int(limit, 50), 1, 500);
  const out = [];
  for (const id of activeBans) {
    const rec = state.users[id];
    if (rec) out.push({ record: rec, level: 'ban', until: 0, at: rec.bannedAt });
  }
  for (const [id, until] of activeMutes) {
    if (until <= now) continue;
    const rec = state.users[id];
    if (rec) out.push({ record: rec, level: 'mute', until, at: rec.muteAt });
  }
  out.sort((a, b) => (b.at || 0) - (a.at || 0));
  return out.slice(0, n);
}

function listWarned(now = Date.now(), limit = 50) {
  const n = clamp(int(limit, 50), 1, 500);
  return allUsers()
    .map((u) => ({ record: u, active: activeWarnsOf(u, now) }))
    .filter((x) => x.active > 0)
    .sort((a, b) => b.active - a.active || (b.record.lastSanctionAt || 0) - (a.record.lastSanctionAt || 0))
    .slice(0, n);
}

function listImmune(limit = 50) {
  const n = clamp(int(limit, 50), 1, 500);
  return allUsers()
    .filter((u) => u.immune)
    .slice(0, n);
}

// Bằng chứng lịch sử dạng engine hiểu được.
function historyEvidence(userId, now = Date.now()) {
  const rec = peek(userId);
  if (!rec) {
    return {
      activeWarns: 0,
      totalWarns: 0,
      activeMutes: 0,
      totalMutes: 0,
      totalBans: 0,
      pardons: 0,
      lastSanctionAt: 0,
      currentLevel: 'none',
    };
  }
  return {
    activeWarns: activeWarnsOf(rec, now),
    totalWarns: rec.counters.warn,
    activeMutes: rec.muteUntil > now ? 1 : 0,
    totalMutes: rec.counters.mute,
    totalBans: rec.counters.ban,
    pardons: rec.counters.pardon,
    lastSanctionAt: rec.lastSanctionAt,
    currentLevel: deriveLevel(rec, now),
  };
}

function report(userId, now = Date.now()) {
  const id = idStr(userId);
  if (!id) return null;
  const rec = state.users[id] || blankUser(id);
  const r = restriction(id, now);
  return {
    id,
    name: rec.name,
    level: deriveLevel(rec, now),
    restricted: r.restricted,
    restriction: r,
    activeWarns: activeWarnsOf(rec, now),
    warns: rec.warns.filter((w) => !w.revokedAt && (!w.expiresAt || w.expiresAt > now)),
    counters: Object.assign({}, rec.counters),
    immune: rec.immune,
    note: rec.note,
    appeal: Object.assign({}, rec.appeal),
    history: rec.history.slice(-12).reverse(),
    lastSeverity: rec.lastSeverity,
    lastConfidence: rec.lastConfidence,
    lastVerdict: rec.lastVerdict,
    lastEvaluatedAt: rec.lastEvaluatedAt,
    lastSanctionAt: rec.lastSanctionAt,
    blockedAttempts: rec.blockedAttempts,
    nextMuteMs: engine.nextMuteDuration(rec.counters.mute, engineOptions()),
    mutesBeforeBan: state.config.mutesBeforeBan,
    exists: Boolean(state.users[id]),
  };
}

// =============================================================
//  Bảo trì định kỳ
// =============================================================
/**
 * Tìm những án mute vừa hết hạn để thông báo cho người chơi.
 * Trả về danh sách id. Gọi định kỳ từ ready.js.
 */
function collectExpiredMutes(now = Date.now()) {
  const done = [];
  for (const [id, until] of activeMutes) {
    if (until <= now) {
      done.push(id);
      activeMutes.delete(id);
      const rec = state.users[id];
      if (rec) {
        rec.level = deriveLevel(rec, now);
        pushHistory(rec, { at: now, type: 'mute_expired', by: 'system', reason: 'Hết hạn cấm tạm thời', source: 'auto' });
      }
    }
  }
  if (done.length) persistSoon();
  return done;
}

function prune(now = Date.now()) {
  let removed = 0;

  for (const id of Object.keys(state.users)) {
    const rec = state.users[id];

    // Dọn cảnh cáo đã hết hạn/đã xoá từ rất lâu.
    if (rec.warns.length) {
      const keep = rec.warns.filter((w) => {
        const dead = w.revokedAt || (w.expiresAt && w.expiresAt <= now);
        if (!dead) return true;
        const when = w.revokedAt || w.expiresAt || w.at;
        return now - when < CLEAN_IDLE_MS;
      });
      if (keep.length !== rec.warns.length) rec.warns = keep;
    }

    if (rec.history.length > MAX_HISTORY_PER_USER) {
      rec.history.splice(0, rec.history.length - MAX_HISTORY_PER_USER);
    }

    // Hồ sơ sạch, không án, không miễn trừ, im lặng rất lâu -> bỏ.
    const clean =
      !rec.immune &&
      !rec.note &&
      rec.level === 'none' &&
      !rec.warns.length &&
      (!rec.bannedAt || rec.banLiftedAt) &&
      rec.appeal.status !== 'pending';
    const idle = now - Math.max(rec.lastSanctionAt, rec.lastEvaluatedAt, rec.firstSeenAt, rec.lastBlockedAt);
    if (clean && idle > CLEAN_IDLE_MS) {
      delete state.users[id];
      activeBans.delete(id);
      activeMutes.delete(id);
      removed++;
    }
  }

  // Vượt trần thì bỏ hồ sơ cũ & nhẹ nhất trước.
  const ids = Object.keys(state.users);
  if (ids.length > MAX_USERS) {
    ids
      .filter((id) => {
        const r = state.users[id];
        return !r.immune && r.level === 'none' && (!r.bannedAt || r.banLiftedAt);
      })
      .sort((a, b) => {
        const ra = state.users[a];
        const rb = state.users[b];
        return (
          Math.max(ra.lastSanctionAt, ra.lastEvaluatedAt) - Math.max(rb.lastSanctionAt, rb.lastEvaluatedAt)
        );
      })
      .slice(0, ids.length - MAX_USERS)
      .forEach((id) => {
        delete state.users[id];
        activeBans.delete(id);
        activeMutes.delete(id);
        removed++;
      });
  }

  const caseKeys = Object.keys(state.cases);
  if (caseKeys.length > MAX_CASES) {
    caseKeys
      .sort((a, b) => (state.cases[a].at || 0) - (state.cases[b].at || 0))
      .slice(0, caseKeys.length - MAX_CASES)
      .forEach((k) => delete state.cases[k]);
  }

  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
  if (removed) persistSoon();
  return removed;
}

// Xoá sạch mọi án (nút đỏ, dùng khi phát hiện cấu hình sai gây oan hàng loạt).
function amnesty(by = '', hard = false) {
  const now = Date.now();
  let n = 0;
  for (const id of Object.keys(state.users)) {
    const rec = state.users[id];
    const had = rec.muteUntil > now || (rec.bannedAt && !rec.banLiftedAt) || activeWarnsOf(rec, now) > 0;
    if (!had) continue;
    pardon(id, by, 'Đại xá toàn hệ thống', hard);
    n++;
  }
  log('warn', by, `Đại xá: đã gỡ án cho ${n} tài khoản${hard ? ' (xoá sạch hồ sơ)' : ''}.`);
  rebuildIndex();
  persistNow();
  return n;
}

function exportSnapshot(now = Date.now()) {
  return {
    at: now,
    config: getConfig(),
    stats: stats(),
    restricted: listRestricted(now, 200).map((x) => ({
      id: x.record.id,
      name: x.record.name,
      level: x.level,
      until: x.until,
      reason: x.level === 'ban' ? x.record.banReason : x.record.muteReason,
      at: x.at,
    })),
    warned: listWarned(now, 200).map((x) => ({ id: x.record.id, name: x.record.name, active: x.active })),
    immune: listImmune(200).map((u) => ({ id: u.id, name: u.name })),
    appeals: pendingAppeals(100).map((u) => ({ id: u.id, name: u.name, at: u.appeal.at, text: u.appeal.text })),
    cases: recentCases(80),
  };
}

module.exports = {
  // Hằng số
  CONFIG_DEFAULTS,
  PRESETS,
  PRESET_LABELS,
  PRESET_NOTES,
  DEFAULT_ALLOWLIST,
  MAX_LOG,
  MINUTE,
  HOUR,
  DAY,

  // Cấu hình
  getConfig,
  setConfig,
  applyPreset,
  engineOptions,

  // Hồ sơ
  blankUser,
  peek,
  user,
  setName,
  allUsers,
  userCount,
  report,
  historyEvidence,
  activeWarns: (id, now = Date.now()) => activeWarnsOf(peek(id), now),
  deriveLevel: (id, now = Date.now()) => deriveLevel(peek(id), now),

  // Đường nhanh
  restriction,
  hasAnyRestriction,
  isBanned,
  isMuted,
  isImmune,
  isAllowedCommand,
  allowlist,

  // Áp án
  addWarn,
  addMute,
  addBan,

  // Gỡ án
  liftMute,
  liftBan,
  revokeWarn,
  clearWarns,
  pardon,
  amnesty,
  setImmune,
  setNote,

  // Kháng nghị
  submitAppeal,
  reviewAppeal,
  pendingAppeals,

  // Vụ việc
  recordCase,
  getCase,
  recentCases,
  casesOf,

  // Danh sách
  listRestricted,
  listWarned,
  listImmune,

  // Thống kê & nhật ký
  noteEvaluation,
  noteBlocked,
  bump,
  stats,
  resetStats,
  log,
  logEntries,
  clearLog,

  // Bảo trì
  collectExpiredMutes,
  prune,
  rebuildIndex,
  exportSnapshot,
  flush,
};
