// =============================================================
//  abuseStore - NƠI LƯU TRỮ CỦA HAI HỆ THỐNG CHỐNG GIAN LẬN
//
//  Lưu ở data/antiAbuse.json. Vì file này bị ghi rất thường xuyên
//  (mỗi lệnh người chơi gõ), ta gom việc ghi đĩa lại (debounce) giống
//  cách maintenanceStore đang làm, và tự động dọn dữ liệu cũ để file
//  không bao giờ phình vô hạn.
//
//  Mọi dữ liệu đọc từ đĩa đều đi qua sanitize() nên file bị sửa tay
//  hay hỏng cũng không làm sập bot.
// =============================================================
'use strict';

const db = require('./Database');

const store = new db.JsonStore('antiAbuse.json', {});
const KEY = 'state';

const FLUSH_MS = 8000; // gom ghi đĩa trong 8 giây
const MAX_USERS = 20000;
const MAX_TRANSFERS = 20000;
const MAX_JOINS = 300; // mỗi máy chủ
const MAX_LINKS = 6000;
const MAX_CLUSTERS = 800;
const MAX_LOG = 120;
const MAX_GUILDS_PER_USER = 12;
const MAX_CMD_KEYS = 40;
const USER_IDLE_MS = 30 * 24 * 60 * 60 * 1000; // 30 ngày không hoạt động -> dọn
const TRANSFER_IDLE_MS = 60 * 24 * 60 * 60 * 1000; // 60 ngày

// =============================================================
//  Cấu hình
// =============================================================
const CONFIG_DEFAULTS = {
  preset: 'balanced',

  // ---- Hệ thống chống bot tự động ----
  autoMinSamples: 12,
  autoWatch: 40,
  autoChallenge: 62,
  autoBlock: 82,
  captchaEnabled: true,
  captchaTimeoutMs: 45000,
  captchaMinAnswerMs: 400, // trả lời nhanh hơn mức này = autoclicker
  captchaMaxFailBeforePenalty: 2,
  strikeDecayMs: 12 * 60 * 60 * 1000, // 12 giờ không vi phạm -> giảm 1 cảnh cáo
  trustRecoverPerHour: 4, // điểm tin cậy hồi mỗi giờ
  penaltySteps: [30 * 60 * 1000, 2 * 60 * 60 * 1000, 12 * 60 * 60 * 1000, 24 * 60 * 60 * 1000],

  // ---- Hệ thống chống acc clone ----
  altWatch: 34,
  altQuarantine: 55,
  altFreeze: 76,
  clusterDailyEarnCap: 25000,
  blockIntraClusterTransfer: true,
  minAccountAgeDaysForTransfer: 3,
  minAccountAgeDaysForEarn: 0,

  // ---- Chung ----
  notifyOwner: true,
  // Chỉ nhóm lệnh liên quan đến tiền mới bị xử lý mạnh (tránh oan sai).
  enforceCategories: ['economy', 'casino', 'fishing', 'games'],
};

const PRESETS = {
  lenient: {
    preset: 'lenient',
    autoMinSamples: 20,
    autoWatch: 52,
    autoChallenge: 74,
    autoBlock: 90,
    altWatch: 45,
    altQuarantine: 66,
    altFreeze: 85,
    clusterDailyEarnCap: 60000,
    minAccountAgeDaysForTransfer: 1,
    captchaMaxFailBeforePenalty: 3,
  },
  balanced: {
    preset: 'balanced',
    autoMinSamples: 12,
    autoWatch: 40,
    autoChallenge: 62,
    autoBlock: 82,
    altWatch: 34,
    altQuarantine: 55,
    altFreeze: 76,
    clusterDailyEarnCap: 25000,
    minAccountAgeDaysForTransfer: 3,
    captchaMaxFailBeforePenalty: 2,
  },
  strict: {
    preset: 'strict',
    autoMinSamples: 8,
    autoWatch: 30,
    autoChallenge: 48,
    autoBlock: 66,
    altWatch: 26,
    altQuarantine: 42,
    altFreeze: 62,
    clusterDailyEarnCap: 10000,
    minAccountAgeDaysForTransfer: 7,
    captchaMaxFailBeforePenalty: 1,
  },
};

const PRESET_LABELS = { lenient: 'Nhẹ nhàng', balanced: 'Cân bằng', strict: 'Nghiêm ngặt' };

// =============================================================
//  Tiện ích làm sạch dữ liệu
// =============================================================
function toId(v) {
  const t = String(v == null ? '' : v)
    .trim()
    .replace(/^<@[!&]?/, '')
    .replace(/>$/, '');
  return /^\d{15,25}$/.test(t) ? t : '';
}

function toCount(v, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), max);
}

function toScore(v, max = 100) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.round(n)));
}

function toText(v, max = 200) {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) : t;
}

function toBool(v) {
  return v === true;
}

function toStringList(v, maxItems, maxLen = 40) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const item of v) {
    const t = toText(item, maxLen);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= maxItems) break;
  }
  return out;
}

function toIdList(v, maxItems) {
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const item of v) {
    const id = toId(item);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= maxItems) break;
  }
  return out;
}

function toHours(v) {
  const out = new Array(24).fill(0);
  if (!Array.isArray(v)) return out;
  for (let i = 0; i < 24; i++) out[i] = toCount(v[i], 1e9);
  return out;
}

function toCmdMap(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  let n = 0;
  for (const key of Object.keys(v)) {
    const name = toText(key, 32).toLowerCase();
    if (!name) continue;
    const count = toCount(v[key], 1e9);
    if (!count) continue;
    out[name] = count;
    if (++n >= MAX_CMD_KEYS) break;
  }
  return out;
}

// =============================================================
//  Hồ sơ một người chơi
// =============================================================
function blankUser(now = Date.now()) {
  return {
    first: now,
    last: now,
    name: '',
    trust: 100,
    autoScore: 0,
    autoStrikes: 0,
    autoLastStrikeAt: 0,
    autoFlags: [],
    captchaIssued: 0,
    captchaPassed: 0,
    captchaFailed: 0,
    captchaLastAt: 0,
    captchaPassAt: 0,
    pendingCaptcha: false,
    penaltyUntil: 0,
    penaltyLevel: 0,
    penaltyReason: '',
    risk: 0,
    riskTier: 'ok',
    riskFlags: [],
    verifiedAt: 0,
    trusted: false,
    bornAt: 0,
    joinedAt: 0,
    inviter: '',
    noAvatar: false,
    guilds: [],
    cluster: '',
    earnDay: '',
    earnAmount: 0,
    cmdCount: 0,
    msgCount: 0,
    hours: new Array(24).fill(0),
    cmds: {},
  };
}

function sanitizeUser(raw, now = Date.now()) {
  const u = blankUser(now);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return u;

  u.first = toCount(raw.first) || now;
  u.last = toCount(raw.last) || u.first;
  u.name = toText(raw.name, 40);
  u.trust = Number.isFinite(Number(raw.trust)) ? toScore(raw.trust) : 100;
  u.autoScore = toScore(raw.autoScore);
  u.autoStrikes = toCount(raw.autoStrikes, 999);
  u.autoLastStrikeAt = toCount(raw.autoLastStrikeAt);
  u.autoFlags = toStringList(raw.autoFlags, 10, 24);
  u.captchaIssued = toCount(raw.captchaIssued, 1e9);
  u.captchaPassed = toCount(raw.captchaPassed, 1e9);
  u.captchaFailed = toCount(raw.captchaFailed, 1e9);
  u.captchaLastAt = toCount(raw.captchaLastAt);
  u.captchaPassAt = toCount(raw.captchaPassAt);
  u.pendingCaptcha = toBool(raw.pendingCaptcha);
  u.penaltyUntil = toCount(raw.penaltyUntil);
  u.penaltyLevel = toCount(raw.penaltyLevel, 10);
  u.penaltyReason = toText(raw.penaltyReason, 160);
  u.risk = toScore(raw.risk);
  u.riskTier = ['ok', 'watch', 'quarantine', 'freeze'].includes(raw.riskTier) ? raw.riskTier : 'ok';
  u.riskFlags = toStringList(raw.riskFlags, 12, 24);
  u.verifiedAt = toCount(raw.verifiedAt);
  u.trusted = toBool(raw.trusted);
  u.bornAt = toCount(raw.bornAt);
  u.joinedAt = toCount(raw.joinedAt);
  u.inviter = toId(raw.inviter);
  u.noAvatar = Boolean(raw.noAvatar);
  u.guilds = toIdList(raw.guilds, MAX_GUILDS_PER_USER);
  u.cluster = toText(raw.cluster, 40);
  u.earnDay = toText(raw.earnDay, 12);
  u.earnAmount = toCount(raw.earnAmount, 1e15);
  u.cmdCount = toCount(raw.cmdCount, 1e9);
  u.msgCount = toCount(raw.msgCount, 1e9);
  u.hours = toHours(raw.hours);
  u.cmds = toCmdMap(raw.cmds);
  return u;
}

// =============================================================
//  Trạng thái tổng
// =============================================================
function blankStats() {
  return {
    commandsChecked: 0,
    commandsBlocked: 0,
    captchaIssued: 0,
    captchaPassed: 0,
    captchaFailed: 0,
    penalties: 0,
    altsFlagged: 0,
    transfersBlocked: 0,
    earningsTrimmed: 0,
    clustersFound: 0,
    // --- Thêm ở bản LTS ---
    // LƯU Ý QUAN TRỌNG: hàm bump() chỉ tăng được những khoá có MẶT
    // trong danh sách này. Mọi khoá mới dùng ở abuseGuard đều phải khai
    // báo ở đây, nếu không số đếm sẽ âm thầm bị bỏ qua (đã từng bị).
    captchaTimeout: 0, // hết thời gian trả lời câu hỏi xác minh
    captchaTooFast: 0, // trả lời nhanh hơn mức người thật làm được
    captchaError: 0, // lỗi kỹ thuật khi ra câu hỏi (không tính là sai)
    challengesSkipped: 0, // bỏ qua xác minh vì đang có phiên khác
    sanctionsRequested: 0, // số lần gọi hệ thống xử lý (warn/mute/ban)
    sanctionsApplied: 0, // số lần thực sự ra quyết định xử lý
    botsDetected: 0, // số lần kết luận dùng bot/macro
    clonesDetected: 0, // số lần kết luận dùng acc clone
    hubsDetected: 0, // số đầu mối thu xu phát hiện được
    analysisRuns: 0, // số lần chạy phân tích sâu
    analysisCacheHits: 0, // số lần dùng lại kết quả cũ (tiết kiệm CPU)
    trustRestored: 0, // số lần hồi điểm tin cậy sau khi xác minh
  };
}

function blankState(now = Date.now()) {
  return {
    version: 1,
    createdAt: now,
    config: Object.assign({}, CONFIG_DEFAULTS),
    users: {},
    links: [],
    clusters: {},
    transfers: {},
    joins: {},
    stats: blankStats(),
    log: [],
  };
}

function sanitizeConfig(raw) {
  const cfg = Object.assign({}, CONFIG_DEFAULTS);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return cfg;

  for (const key of Object.keys(CONFIG_DEFAULTS)) {
    const def = CONFIG_DEFAULTS[key];
    const val = raw[key];
    if (val === undefined) continue;

    if (typeof def === 'boolean') {
      cfg[key] = val === true;
    } else if (typeof def === 'number') {
      const n = Number(val);
      if (Number.isFinite(n) && n >= 0) cfg[key] = Math.floor(n);
    } else if (Array.isArray(def)) {
      if (key === 'penaltySteps') {
        const steps = Array.isArray(val)
          ? val.map((x) => toCount(x)).filter((x) => x >= 60 * 1000 && x <= 7 * 24 * 60 * 60 * 1000)
          : [];
        if (steps.length) cfg[key] = steps.slice(0, 8);
      } else {
        const list = toStringList(val, 20, 24);
        if (list.length) cfg[key] = list;
      }
    } else if (typeof def === 'string') {
      const t = toText(val, 24);
      if (t) cfg[key] = t;
    }
  }

  // Ràng buộc logic: các ngưỡng phải tăng dần, nếu không hệ thống sẽ xử lý sai.
  cfg.autoWatch = Math.max(1, Math.min(99, cfg.autoWatch));
  cfg.autoChallenge = Math.max(cfg.autoWatch + 1, Math.min(99, cfg.autoChallenge));
  cfg.autoBlock = Math.max(cfg.autoChallenge + 1, Math.min(100, cfg.autoBlock));
  cfg.altWatch = Math.max(1, Math.min(99, cfg.altWatch));
  cfg.altQuarantine = Math.max(cfg.altWatch + 1, Math.min(99, cfg.altQuarantine));
  cfg.altFreeze = Math.max(cfg.altQuarantine + 1, Math.min(100, cfg.altFreeze));
  cfg.autoMinSamples = Math.max(4, Math.min(200, cfg.autoMinSamples));
  cfg.captchaTimeoutMs = Math.max(10000, Math.min(300000, cfg.captchaTimeoutMs));
  cfg.captchaMinAnswerMs = Math.max(0, Math.min(5000, cfg.captchaMinAnswerMs));
  cfg.captchaMaxFailBeforePenalty = Math.max(1, Math.min(10, cfg.captchaMaxFailBeforePenalty));
  if (!PRESETS[cfg.preset]) cfg.preset = 'custom';
  return cfg;
}

function sanitize(raw, now = Date.now()) {
  const s = blankState(now);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;

  s.createdAt = toCount(raw.createdAt) || now;
  s.config = sanitizeConfig(raw.config);

  if (raw.users && typeof raw.users === 'object' && !Array.isArray(raw.users)) {
    let n = 0;
    for (const key of Object.keys(raw.users)) {
      const id = toId(key);
      if (!id) continue;
      s.users[id] = sanitizeUser(raw.users[key], now);
      if (++n >= MAX_USERS) break;
    }
  }

  if (Array.isArray(raw.links)) {
    for (const l of raw.links.slice(-MAX_LINKS)) {
      if (!l || typeof l !== 'object') continue;
      const a = toId(l.a);
      const b = toId(l.b);
      if (!a || !b || a === b) continue;
      s.links.push({
        a,
        b,
        reason: toText(l.reason, 40) || 'unknown',
        weight: Math.max(0, Math.min(100, Number(l.weight) || 0)),
        at: toCount(l.at) || now,
        manual: toBool(l.manual),
      });
    }
  }

  if (raw.clusters && typeof raw.clusters === 'object' && !Array.isArray(raw.clusters)) {
    let n = 0;
    for (const key of Object.keys(raw.clusters)) {
      const id = toText(key, 40);
      const c = raw.clusters[key];
      if (!id || !c || typeof c !== 'object' || Array.isArray(c)) continue;
      s.clusters[id] = {
        members: toIdList(c.members, 200),
        score: toScore(c.score),
        createdAt: toCount(c.createdAt) || now,
        updatedAt: toCount(c.updatedAt) || now,
        reasons: toStringList(c.reasons, 10, 40),
        frozen: toBool(c.frozen),
        note: toText(c.note, 160),
        earnDay: toText(c.earnDay, 12),
        earnAmount: toCount(c.earnAmount, 1e15),
      };
      if (++n >= MAX_CLUSTERS) break;
    }
  }

  if (raw.transfers && typeof raw.transfers === 'object' && !Array.isArray(raw.transfers)) {
    let n = 0;
    for (const key of Object.keys(raw.transfers)) {
      const parts = String(key).split('>');
      const from = toId(parts[0]);
      const to = toId(parts[1]);
      const t = raw.transfers[key];
      if (!from || !to || from === to || !t || typeof t !== 'object') continue;
      s.transfers[from + '>' + to] = {
        count: toCount(t.count, 1e9),
        total: toCount(t.total, 1e15),
        first: toCount(t.first) || now,
        last: toCount(t.last) || now,
        blocked: toCount(t.blocked, 1e9),
      };
      if (++n >= MAX_TRANSFERS) break;
    }
  }

  if (raw.joins && typeof raw.joins === 'object' && !Array.isArray(raw.joins)) {
    for (const key of Object.keys(raw.joins)) {
      const gid = toId(key);
      if (!gid || !Array.isArray(raw.joins[key])) continue;
      const list = [];
      for (const j of raw.joins[key].slice(-MAX_JOINS)) {
        if (!j || typeof j !== 'object') continue;
        const u = toId(j.u);
        const at = toCount(j.at);
        if (!u || !at) continue;
        list.push({ u, at, inv: toId(j.inv) });
      }
      if (list.length) s.joins[gid] = list;
    }
  }

  if (raw.stats && typeof raw.stats === 'object' && !Array.isArray(raw.stats)) {
    const st = blankStats();
    for (const key of Object.keys(st)) st[key] = toCount(raw.stats[key], 1e15);
    s.stats = st;
  }

  if (Array.isArray(raw.log)) {
    s.log = raw.log
      .filter((e) => e && typeof e === 'object' && !Array.isArray(e))
      .slice(-MAX_LOG)
      .map((e) => ({
        at: toCount(e.at) || now,
        kind: toText(e.kind, 24) || 'info',
        user: toId(e.user),
        note: toText(e.note, 200),
      }));
  }

  return s;
}

let state = sanitize(store.get(KEY, null));

// =============================================================
//  Ghi đĩa có gom nhóm
// =============================================================
let flushTimer = null;
let dirty = false;

function persistNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!dirty) return;
  dirty = false;
  try {
    store.set(KEY, state);
  } catch {
    /* lỗi ghi đĩa không được làm sập bot */
  }
}

function persistSoon() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    persistNow();
  }, FLUSH_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

// Ghi ngay khi bot tắt để không mất dữ liệu.
function flush() {
  dirty = true;
  persistNow();
}

// =============================================================
//  Cấu hình
// =============================================================
function getConfig() {
  return Object.assign({}, state.config);
}

function setConfig(patch) {
  state.config = sanitizeConfig(Object.assign({}, state.config, patch || {}));
  // Sửa tay cấu hình thì không còn là preset gốc nữa.
  if (patch && !Object.prototype.hasOwnProperty.call(patch, 'preset')) state.config.preset = 'custom';
  persistNow();
  return getConfig();
}

function applyPreset(name) {
  const key = toText(name, 24).toLowerCase();
  if (!PRESETS[key]) return { ok: false, error: 'Không có mức độ "' + name + '".' };
  state.config = sanitizeConfig(Object.assign({}, CONFIG_DEFAULTS, PRESETS[key]));
  persistNow();
  return { ok: true, config: getConfig() };
}

// =============================================================
//  Hồ sơ người chơi
// =============================================================
function peek(userId) {
  const id = toId(userId);
  if (!id) return null;
  return state.users[id] || null;
}

function user(userId, now = Date.now()) {
  const id = toId(userId);
  if (!id) return blankUser(now);
  let u = state.users[id];
  if (!u) {
    u = blankUser(now);
    state.users[id] = u;
    persistSoon();
    // Nếu quá nhiều hồ sơ thì dọn bớt ngay.
    if (Object.keys(state.users).length > MAX_USERS) prune(now, true);
  }
  return u;
}

function touch() {
  persistSoon();
}

function userCount() {
  return Object.keys(state.users).length;
}

function allUsers() {
  return state.users;
}

function deleteUser(userId) {
  const id = toId(userId);
  if (!id || !state.users[id]) return false;
  delete state.users[id];
  state.links = state.links.filter((l) => l.a !== id && l.b !== id);
  for (const cid of Object.keys(state.clusters)) {
    const c = state.clusters[cid];
    c.members = c.members.filter((m) => m !== id);
    if (c.members.length < 2) delete state.clusters[cid];
  }
  persistNow();
  return true;
}

// =============================================================
//  Liên kết & cụm
// =============================================================
function addLink(a, b, reason, weight, manual = false) {
  const ia = toId(a);
  const ib = toId(b);
  if (!ia || !ib || ia === ib) return false;
  const key = ia < ib ? ia + '|' + ib : ib + '|' + ia;
  const r = toText(reason, 40) || 'unknown';
  const existing = state.links.find((l) => (l.a < l.b ? l.a + '|' + l.b : l.b + '|' + l.a) === key && l.reason === r);
  const w = Math.max(0, Math.min(100, Number(weight) || 0));
  if (existing) {
    existing.at = Date.now();
    if (w > existing.weight) existing.weight = w;
    if (manual) existing.manual = true;
    persistSoon();
    return false;
  }
  state.links.push({ a: ia, b: ib, reason: r, weight: w, at: Date.now(), manual: Boolean(manual) });
  if (state.links.length > MAX_LINKS) {
    state.links = state.links.slice(-MAX_LINKS);
    rebuildIndex(); // đã cắt bớt -> chỉ mục cũ không còn đúng
  } else {
    indexAddLink(ia, ib); // cập nhật chỉ mục tại chỗ (LTS)
  }
  persistSoon();
  return true;
}

function removeLinks(userId) {
  const id = toId(userId);
  if (!id) return 0;
  const before = state.links.length;
  state.links = state.links.filter((l) => l.a !== id && l.b !== id);
  const removed = before - state.links.length;
  if (removed) {
    // Xoá luôn khỏi chỉ mục để không còn gợi ý sai (LTS).
    const set = linkIndex.get(id);
    if (set) {
      for (const other of set) {
        const back = linkIndex.get(other);
        if (back) back.delete(id);
      }
      linkIndex.delete(id);
    }
    persistNow();
  }
  return removed;
}

function links() {
  return state.links;
}

function clusters() {
  return state.clusters;
}

function getCluster(clusterId) {
  const id = toText(clusterId, 40);
  return id ? state.clusters[id] || null : null;
}

function setCluster(clusterId, data) {
  const id = toText(clusterId, 40);
  if (!id) return null;
  const now = Date.now();
  const prev = state.clusters[id];
  const next = {
    members: toIdList(data && data.members, 200),
    score: toScore(data && data.score),
    createdAt: (prev && prev.createdAt) || now,
    updatedAt: now,
    reasons: toStringList(data && data.reasons, 10, 40),
    frozen: prev ? prev.frozen : false,
    note: prev ? prev.note : '',
    earnDay: prev ? prev.earnDay : '',
    earnAmount: prev ? prev.earnAmount : 0,
  };
  if (data && typeof data.frozen === 'boolean') next.frozen = data.frozen;
  if (data && typeof data.note === 'string') next.note = toText(data.note, 160);
  if (next.members.length < 2) {
    delete state.clusters[id];
    persistSoon();
    return null;
  }
  if (!prev) state.stats.clustersFound = toCount(state.stats.clustersFound) + 1;
  state.clusters[id] = next;
  if (Object.keys(state.clusters).length > MAX_CLUSTERS) {
    // Xoá cụm cũ nhất, điểm thấp nhất trước.
    const sorted = Object.keys(state.clusters).sort(
      (x, y) => state.clusters[x].score - state.clusters[y].score || state.clusters[x].updatedAt - state.clusters[y].updatedAt,
    );
    for (const key of sorted.slice(0, Object.keys(state.clusters).length - MAX_CLUSTERS)) delete state.clusters[key];
  }
  persistSoon();
  return state.clusters[id];
}

function deleteCluster(clusterId) {
  const id = toText(clusterId, 40);
  if (!id || !state.clusters[id]) return false;
  for (const m of state.clusters[id].members) {
    const u = state.users[m];
    if (u && u.cluster === id) u.cluster = '';
  }
  delete state.clusters[id];
  persistNow();
  return true;
}

// =============================================================
//  Chuyển xu
// =============================================================
function noteTransfer(from, to, amount, blocked = false) {
  const a = toId(from);
  const b = toId(to);
  if (!a || !b || a === b) return null;
  const key = a + '>' + b;
  const now = Date.now();
  let edge = state.transfers[key];
  if (!edge) {
    edge = { count: 0, total: 0, first: now, last: now, blocked: 0 };
    state.transfers[key] = edge;
  }
  if (blocked) {
    edge.blocked = toCount(edge.blocked) + 1;
    state.stats.transfersBlocked = toCount(state.stats.transfersBlocked) + 1;
  } else {
    edge.count = toCount(edge.count) + 1;
    edge.total = toCount(edge.total) + Math.max(0, Math.floor(Number(amount) || 0));
  }
  edge.last = now;
  indexAddTransfer(a, b, edge); // cập nhật chỉ mục tại chỗ (LTS)
  if (Object.keys(state.transfers).length > MAX_TRANSFERS) prune(now, true);
  persistSoon();
  return edge;
}

function transferEdges() {
  const out = [];
  for (const key of Object.keys(state.transfers)) {
    const parts = key.split('>');
    const edge = state.transfers[key];
    out.push({ from: parts[0], to: parts[1], count: edge.count, total: edge.total, first: edge.first, last: edge.last });
  }
  return out;
}

function edgesOf(userId) {
  const id = toId(userId);
  if (!id) return { sent: [], received: [] };
  const sent = [];
  const received = [];
  for (const key of Object.keys(state.transfers)) {
    const parts = key.split('>');
    const edge = state.transfers[key];
    if (parts[0] === id) sent.push({ to: parts[1], ...edge });
    else if (parts[1] === id) received.push({ from: parts[0], ...edge });
  }
  return { sent, received };
}

// =============================================================
//  Lượt vào máy chủ
// =============================================================
function noteJoin(guildId, userId, at = Date.now(), inviterId = '') {
  const gid = toId(guildId);
  const uid = toId(userId);
  if (!gid || !uid) return [];
  if (!Array.isArray(state.joins[gid])) state.joins[gid] = [];
  const list = state.joins[gid];
  list.push({ u: uid, at: toCount(at) || Date.now(), inv: toId(inviterId) });
  if (list.length > MAX_JOINS) state.joins[gid] = list.slice(-MAX_JOINS);
  persistSoon();
  return state.joins[gid];
}

function recentJoins(guildId, windowMs, at = Date.now()) {
  const gid = toId(guildId);
  if (!gid || !Array.isArray(state.joins[gid])) return [];
  const w = Math.max(1000, Number(windowMs) || 60000);
  return state.joins[gid].filter((j) => Math.abs(at - j.at) <= w);
}

function joinsOf(guildId) {
  const gid = toId(guildId);
  return gid && Array.isArray(state.joins[gid]) ? state.joins[gid] : [];
}

function forgetGuild(guildId) {
  const gid = toId(guildId);
  if (!gid || !state.joins[gid]) return false;
  delete state.joins[gid];
  persistNow();
  return true;
}

// =============================================================
//  Thống kê & nhật ký
// =============================================================
function bump(key, amount = 1) {
  const k = toText(key, 32);
  if (!k || !(k in state.stats)) return 0;
  state.stats[k] = toCount(state.stats[k]) + Math.max(0, Math.floor(Number(amount) || 0));
  persistSoon();
  return state.stats[k];
}

function stats() {
  return Object.assign({}, state.stats);
}

function resetStats() {
  state.stats = blankStats();
  persistNow();
  return stats();
}

function log(kind, userId, note) {
  state.log.push({
    at: Date.now(),
    kind: toText(kind, 24) || 'info',
    user: toId(userId),
    note: toText(note, 200),
  });
  if (state.log.length > MAX_LOG) state.log = state.log.slice(-MAX_LOG);
  persistSoon();
  return true;
}

function logEntries(limit = 15) {
  const n = Math.max(1, Math.min(MAX_LOG, Number(limit) || 15));
  return state.log.slice(-n).reverse().map((e) => ({ ...e }));
}

function clearLog() {
  state.log = [];
  persistNow();
  return true;
}

// =============================================================
//  Dọn dẹp
// =============================================================
function prune(now = Date.now(), force = false) {
  let removed = 0;

  // 1) Hồ sơ lâu không hoạt động, không bị phạt, không được đánh dấu đặc biệt.
  for (const id of Object.keys(state.users)) {
    const u = state.users[id];
    const idle = now - toCount(u.last);
    const protectedUser = u.trusted || u.penaltyUntil > now || u.cluster || u.risk >= state.config.altWatch;
    if (idle > USER_IDLE_MS && !protectedUser) {
      delete state.users[id];
      removed++;
    }
  }

  // 2) Nếu vẫn quá nhiều, bỏ những hồ sơ cũ nhất và ít rủi ro nhất.
  let ids = Object.keys(state.users);
  if (ids.length > MAX_USERS) {
    ids.sort((a, b) => {
      const ua = state.users[a];
      const ub = state.users[b];
      const pa = (ua.trusted || ua.cluster ? 1 : 0) * 1e15 + ua.risk * 1e12 + ua.last;
      const pb = (ub.trusted || ub.cluster ? 1 : 0) * 1e15 + ub.risk * 1e12 + ub.last;
      return pa - pb;
    });
    for (const id of ids.slice(0, ids.length - MAX_USERS)) {
      delete state.users[id];
      removed++;
    }
  }

  // 3) Cạnh chuyển xu quá cũ.
  const keys = Object.keys(state.transfers);
  for (const key of keys) {
    if (now - toCount(state.transfers[key].last) > TRANSFER_IDLE_MS) {
      delete state.transfers[key];
      removed++;
    }
  }
  let tKeys = Object.keys(state.transfers);
  if (tKeys.length > MAX_TRANSFERS) {
    tKeys.sort((a, b) => state.transfers[a].last - state.transfers[b].last);
    for (const key of tKeys.slice(0, tKeys.length - MAX_TRANSFERS)) {
      delete state.transfers[key];
      removed++;
    }
  }

  // 4) Liên kết trỏ tới hồ sơ không còn tồn tại (trừ liên kết do chủ bot tạo tay).
  const before = state.links.length;
  state.links = state.links.filter((l) => l.manual || (state.users[l.a] && state.users[l.b]));
  removed += before - state.links.length;

  // 5) Cụm rỗng.
  for (const cid of Object.keys(state.clusters)) {
    const c = state.clusters[cid];
    c.members = c.members.filter((m) => state.users[m]);
    if (c.members.length < 2 && !c.frozen) {
      delete state.clusters[cid];
      removed++;
    }
  }

  // 6) Lượt vào server quá cũ (chỉ cần cho phát hiện vào cùng đợt).
  for (const gid of Object.keys(state.joins)) {
    const list = state.joins[gid].filter((j) => now - j.at <= 14 * 24 * 60 * 60 * 1000);
    if (list.length) state.joins[gid] = list.slice(-MAX_JOINS);
    else delete state.joins[gid];
  }

  // 7) Tham chiếu cụm trên hồ sơ trỏ tới cụm không còn tồn tại (LTS).
  // Trước đây khi cụm bị xoá ở bước 5 thì u.cluster vẫn giữ ID cũ, làm
  // hồ sơ đó "được bảo vệ vĩnh viễn" khỏi dọn rác và hiển thị sai cụm.
  for (const id of Object.keys(state.users)) {
    const u = state.users[id];
    if (u.cluster && !state.clusters[u.cluster]) {
      u.cluster = '';
      removed++;
    }
  }

  // 8) Dựng lại chỉ mục tra cứu nhanh sau khi dọn (LTS).
  rebuildIndex();

  if (removed || force) persistSoon();
  return removed;
}

// =============================================================
//  Chỉ mục tra cứu nhanh (chỉ nạp trong RAM, KHÔNG lưu ra đĩa) — LTS
//
//  Vấn đề hiệu năng cũ: mỗi lần cần biết "ai liên hệ với ai" hoặc
//  "ai đã chuyển xu cho ai", mã phải quét TOÀN BỘ mảng links (tới 6.000
//  phần tử) và toàn bộ bảng transfers (tới 20.000 phần tử) — và việc này
//  xảy ra trên MỖI LỆNH của MỖI NGƯỜI. Nay ta dựng sẵn chỉ mục Map để
//  tra cứu O(1).
// =============================================================
let linkIndex = new Map(); // userId -> Set<userId>
let outIndex = new Map(); // from -> Map<to, edge>
let inIndex = new Map(); // to   -> Map<from, edge>

function indexAddLink(a, b) {
  if (!linkIndex.has(a)) linkIndex.set(a, new Set());
  if (!linkIndex.has(b)) linkIndex.set(b, new Set());
  linkIndex.get(a).add(b);
  linkIndex.get(b).add(a);
}

function indexAddTransfer(from, to, edge) {
  if (!outIndex.has(from)) outIndex.set(from, new Map());
  outIndex.get(from).set(to, edge);
  if (!inIndex.has(to)) inIndex.set(to, new Map());
  inIndex.get(to).set(from, edge);
}

// Dựng lại toàn bộ chỉ mục từ dữ liệu hiện tại.
function rebuildIndex() {
  linkIndex = new Map();
  outIndex = new Map();
  inIndex = new Map();
  for (const l of state.links) {
    if (l && l.a && l.b) indexAddLink(l.a, l.b);
  }
  for (const key of Object.keys(state.transfers)) {
    const cut = key.indexOf('>');
    if (cut <= 0) continue;
    indexAddTransfer(key.slice(0, cut), key.slice(cut + 1), state.transfers[key]);
  }
  return { links: linkIndex.size, senders: outIndex.size, receivers: inIndex.size };
}

/**
 * Những ai có liên hệ trực tiếp với người này (O(1) thay vì O(tất cả)).
 * @returns {string[]}
 */
function linkedTo(userId) {
  const id = toId(userId);
  if (!id) return [];
  const set = linkIndex.get(id);
  return set ? Array.from(set) : [];
}

/**
 * Láng giềng trong phạm vi `depth` bước (BFS có giới hạn).
 * Dùng để tìm nhanh cụm của một người mà không phải dựng lại cả đồ thị.
 */
function neighbourhood(userId, depth = 2, limit = 120) {
  const start = toId(userId);
  if (!start) return [];
  const seen = new Set([start]);
  let frontier = [start];
  const maxDepth = Math.max(1, Math.min(4, Number(depth) || 2));
  const cap = Math.max(2, Math.min(500, Number(limit) || 120));
  for (let d = 0; d < maxDepth && frontier.length && seen.size < cap; d++) {
    const next = [];
    for (const node of frontier) {
      const set = linkIndex.get(node);
      if (!set) continue;
      for (const other of set) {
        if (seen.has(other)) continue;
        seen.add(other);
        next.push(other);
        if (seen.size >= cap) break;
      }
      if (seen.size >= cap) break;
    }
    frontier = next;
  }
  seen.delete(start);
  return Array.from(seen);
}

// Các cạnh chuyển xu của một người, tra qua chỉ mục (O(bậc) thay vì O(tất cả)).
function fastEdgesOf(userId) {
  const id = toId(userId);
  if (!id) return { sent: [], received: [] };
  const sent = [];
  const received = [];
  const out = outIndex.get(id);
  if (out) for (const [to, edge] of out) sent.push(Object.assign({ to }, edge));
  const inc = inIndex.get(id);
  if (inc) for (const [from, edge] of inc) received.push(Object.assign({ from }, edge));
  return { sent, received };
}

// Số người đã dồn xu VỀ người này (để xét vai "đầu mối").
function inboundSenders(userId, minCount = 1) {
  const id = toId(userId);
  if (!id) return 0;
  const inc = inIndex.get(id);
  if (!inc) return 0;
  const floor = Math.max(1, Number(minCount) || 1);
  let n = 0;
  for (const edge of inc.values()) if (toCount(edge.count) >= floor) n++;
  return n;
}

// Dựng chỉ mục ngay khi nạp module (dữ liệu đã đọc từ đĩa xong).
rebuildIndex();

module.exports = {
  CONFIG_DEFAULTS,
  PRESETS,
  PRESET_LABELS,
  MAX_LOG,
  blankUser,
  getConfig,
  setConfig,
  applyPreset,
  peek,
  user,
  touch,
  userCount,
  allUsers,
  deleteUser,
  addLink,
  removeLinks,
  links,
  clusters,
  getCluster,
  setCluster,
  deleteCluster,
  noteTransfer,
  transferEdges,
  edgesOf,
  noteJoin,
  recentJoins,
  joinsOf,
  forgetGuild,
  bump,
  stats,
  resetStats,
  log,
  logEntries,
  clearLog,
  prune,
  flush,
  // --- Chỉ mục tra cứu nhanh (LTS) ---
  rebuildIndex,
  linkedTo,
  neighbourhood,
  fastEdgesOf,
  inboundSenders,
};
