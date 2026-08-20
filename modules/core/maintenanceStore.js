// =============================================================
//  maintenanceStore - quản lý CHẾ ĐỘ BẢO TRÌ của bot
//
//  Khi bật bảo trì, mọi lệnh (cả prefix lẫn slash) đều bị chặn,
//  chỉ chủ bot và những người trong danh sách miễn trừ được dùng.
//
//  Trạng thái được lưu vào data/maintenance.json nên bot khởi động
//  lại vẫn nhớ đang bảo trì hay không (quan trọng khi host 24/7).
// =============================================================
const db = require('./Database');

const store = new db.JsonStore('maintenance.json', {});
const KEY = 'state';

const MAX_LOG = 50; // giữ tối đa 50 dòng nhật ký, tránh file phình vô hạn
const MAX_ALLOW = 100; // tối đa 100 người được miễn trừ
const MAX_CMD = 100; // tối đa 100 lệnh được bảo trì riêng cùng lúc
const MAX_MS = 30 * 24 * 60 * 60 * 1000; // hẹn giờ tối đa 30 ngày
const MIN_MS = 10 * 1000; // hẹn giờ tối thiểu 10 giây
const FLUSH_MS = 10000; // gom việc ghi file trong 10 giây một lần

// ---------- Các hàm làm sạch dữ liệu (chống file JSON bị sửa tay/hỏng) ----------
function toCount(v, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

function toText(v, max = 400) {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) : t;
}

function toId(v) {
  const t = String(v == null ? '' : v).trim().replace(/^<@[!&]?/, '').replace(/>$/, '');
  return /^\d{15,25}$/.test(t) ? t : null;
}

// Tên lệnh hợp lệ (chỉ chữ thường, số, '-' và '_').
function toCmdName(v) {
  const t = String(v == null ? '' : v).trim().toLowerCase().replace(/^[\/!.]+/, '');
  return /^[a-z0-9_-]{1,32}$/.test(t) ? t : null;
}

function blankState() {
  return {
    enabled: false,
    reason: '',
    since: 0,
    until: 0,
    by: '',
    allowlist: [],
    allowRoles: [],
    blocked: 0, // số lệnh bị chặn trong phiên bảo trì hiện tại
    totalBlocked: 0, // tổng từ trước tới nay
    lastBlockedAt: 0,
    sessions: 0, // số lần đã bật bảo trì
    // Bảo trì RIÊNG theo từng lệnh: { tenlenh: { reason, since, until, by } }
    // Chỉ lệnh nằm trong danh sách này bị chặn, mọi lệnh khác vẫn hoạt động bình thường.
    commands: {},
    log: [],
  };
}

function sanitize(raw) {
  const s = blankState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;
  s.enabled = raw.enabled === true;
  s.reason = toText(raw.reason, 400);
  s.since = toCount(raw.since);
  s.until = toCount(raw.until);
  s.by = toId(raw.by) || '';
  s.allowlist = Array.isArray(raw.allowlist)
    ? [...new Set(raw.allowlist.map(toId).filter(Boolean))].slice(0, MAX_ALLOW)
    : [];
  s.allowRoles = Array.isArray(raw.allowRoles)
    ? [...new Set(raw.allowRoles.map(toId).filter(Boolean))].slice(0, MAX_ALLOW)
    : [];
  s.blocked = toCount(raw.blocked);
  s.totalBlocked = toCount(raw.totalBlocked);
  s.lastBlockedAt = toCount(raw.lastBlockedAt);
  s.sessions = toCount(raw.sessions);
  s.commands = {};
  if (raw.commands && typeof raw.commands === 'object' && !Array.isArray(raw.commands)) {
    let n = 0;
    for (const key of Object.keys(raw.commands)) {
      if (n >= MAX_CMD) break;
      const name = toCmdName(key);
      const val = raw.commands[key];
      if (!name || !val || typeof val !== 'object' || Array.isArray(val)) continue;
      s.commands[name] = {
        reason: toText(val.reason, 400),
        since: toCount(val.since),
        until: toCount(val.until),
        by: toId(val.by) || '',
      };
      n += 1;
    }
  }
  s.log = Array.isArray(raw.log)
    ? raw.log
        .filter((e) => e && typeof e === 'object' && !Array.isArray(e))
        .slice(-MAX_LOG)
        .map((e) => ({
          at: toCount(e.at),
          action: toText(e.action, 32),
          by: toId(e.by) || '',
          note: toText(e.note, 300),
        }))
    : [];
  if (!s.enabled) s.until = 0; // không giữ hẹn giờ khi đã tắt
  return s;
}

let state = sanitize(store.get(KEY, null));

// ---------- Ghi file có gom nhóm ----------
// Mỗi lệnh bị chặn sẽ tăng bộ đếm; nếu ghi file ngay thì một đợt spam lệnh
// có thể ghi đĩa hàng trăm lần/giây. Vì vậy ta gom lại, tối đa 10 giây ghi 1 lần.
let flushTimer = null;

function persistNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    store.set(KEY, state);
  } catch {
    /* không để lỗi ghi file làm sập bot */
  }
}

function persistSoon() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    persistNow();
  }, FLUSH_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

function pushLog(action, by, note) {
  state.log.push({ at: Date.now(), action: toText(action, 32), by: toId(by) || '', note: toText(note, 300) });
  if (state.log.length > MAX_LOG) state.log = state.log.slice(-MAX_LOG);
}

// ---------- Hẹn giờ tự động kết thúc ----------
// Không dùng setTimeout dài hạn (bot restart là mất). Thay vào đó kiểm tra
// mốc thời gian mỗi lần có ai đó chạy lệnh -> luôn đúng kể cả sau khi restart.
function checkExpiry() {
  const now = Date.now();
  let changed = false;

  if (state.enabled && state.until > 0 && now >= state.until) {
    state.enabled = false;
    state.until = 0;
    state.blocked = 0;
    pushLog('auto-off', state.by, 'Hết thời gian hẹn giờ, tự động mở lại bot');
    changed = true;
  }

  // Hết hạn bảo trì riêng của từng lệnh
  for (const name of Object.keys(state.commands)) {
    const info = state.commands[name];
    if (info && info.until > 0 && now >= info.until) {
      delete state.commands[name];
      pushLog('cmd-auto-off', info.by, 'Lệnh "' + name + '" tự mở lại (hết hẹn giờ)');
      changed = true;
    }
  }

  if (changed) persistNow();
  return changed;
}

// ---------- API công khai ----------
// Thông tin bảo trì của một lệnh (đã tính sẵn thời gian còn lại).
function describeCommand(name) {
  const info = state.commands[name];
  if (!info) return null;
  return {
    name,
    reason: info.reason,
    since: info.since,
    until: info.until,
    by: info.by,
    remaining: info.until > 0 ? Math.max(0, info.until - Date.now()) : 0,
  };
}

function getState() {
  checkExpiry();
  const commands = {};
  for (const name of Object.keys(state.commands)) commands[name] = { ...state.commands[name] };
  return {
    ...state,
    allowlist: [...state.allowlist],
    allowRoles: [...state.allowRoles],
    commands,
    commandList: Object.keys(state.commands).sort().map(describeCommand),
    log: state.log.map((e) => ({ ...e })),
    remaining: state.enabled && state.until > 0 ? Math.max(0, state.until - Date.now()) : 0,
    elapsed: state.enabled && state.since > 0 ? Math.max(0, Date.now() - state.since) : 0,
  };
}

function isEnabled() {
  checkExpiry();
  return state.enabled === true;
}

function isAllowed(userId) {
  const uid = toId(userId);
  return Boolean(uid && state.allowlist.includes(uid));
}

// Người này có vai trò nào nằm trong danh sách miễn trừ không?
// roleIds nhận mảng, Set, Collection (có .keys()) hoặc một ID lẻ.
function hasAllowedRole(roleIds) {
  if (!state.allowRoles.length || !roleIds) return false;
  let list = roleIds;
  if (typeof list === 'string') list = [list];
  else if (typeof list.keys === 'function' && !Array.isArray(list)) {
    try {
      list = Array.from(list.keys());
    } catch (_) {
      return false;
    }
  }
  if (!Array.isArray(list)) return false;
  for (const r of list) {
    const rid = toId(r && r.id ? r.id : r);
    if (rid && state.allowRoles.includes(rid)) return true;
  }
  return false;
}

// Trả về true nếu người này ĐƯỢC PHÉP dùng lệnh lúc này.
function canUse(userId, ownerId, roleIds) {
  if (!isEnabled()) return true;
  const uid = toId(userId);
  const oid = toId(ownerId);
  if (uid && oid && uid === oid) return true;
  if (isAllowed(uid)) return true;
  return hasAllowedRole(roleIds);
}

// ---------- BẢO TRÌ RIÊNG THEO TỪNG LỆNH ----------
// Bật bảo trì cho đúng một lệnh; các lệnh còn lại KHÔNG bị ảnh hưởng.
function enableCommand(name, opts) {
  const o = opts || {};
  const key = toCmdName(name);
  if (!key) return { ok: false, error: 'Tên lệnh không hợp lệ.' };
  checkExpiry();
  const existing = state.commands[key];
  if (!existing && Object.keys(state.commands).length >= MAX_CMD) {
    return { ok: false, error: 'Chỉ có thể bảo trì tối đa ' + MAX_CMD + ' lệnh cùng lúc.' };
  }
  let duration = Number(o.ms);
  if (!Number.isFinite(duration) || duration <= 0) duration = 0;
  else duration = Math.min(Math.max(Math.floor(duration), MIN_MS), MAX_MS);
  const now = Date.now();
  state.commands[key] = {
    reason: toText(o.reason, 400),
    since: existing && existing.since > 0 ? existing.since : now,
    until: duration > 0 ? now + duration : 0,
    by: toId(o.by) || '',
  };
  pushLog(existing ? 'cmd-update' : 'cmd-on', o.by, 'Lệnh "' + key + '"' + (state.commands[key].reason ? ' — ' + state.commands[key].reason : ''));
  persistNow();
  return { ok: true, name: key, info: describeCommand(key), state: getState() };
}

// Mở lại một lệnh đang bảo trì riêng.
function disableCommand(name, by) {
  const key = toCmdName(name);
  if (!key) return { ok: false, error: 'Tên lệnh không hợp lệ.' };
  checkExpiry();
  if (!state.commands[key]) return { ok: false, error: 'Lệnh "' + key + '" không nằm trong danh sách bảo trì riêng.' };
  delete state.commands[key];
  pushLog('cmd-off', by, 'Đã mở lại lệnh "' + key + '"');
  persistNow();
  return { ok: true, name: key, state: getState() };
}

function clearCommands(by) {
  checkExpiry();
  const n = Object.keys(state.commands).length;
  state.commands = {};
  if (n) pushLog('cmd-off-all', by, 'Mở lại toàn bộ ' + n + ' lệnh đang bảo trì riêng');
  persistNow();
  return getState();
}

// Thông tin bảo trì của một lệnh, hoặc null nếu lệnh đang bình thường.
function commandInfo(name) {
  checkExpiry();
  const key = toCmdName(name);
  if (!key) return null;
  return describeCommand(key);
}

function isCommandDown(name) {
  return commandInfo(name) !== null;
}

function listCommands() {
  checkExpiry();
  return Object.keys(state.commands).sort().map(describeCommand);
}

// Người này có được dùng LỆNH NÀY không? (chỉ xét bảo trì riêng của lệnh)
// Chủ bot và danh sách miễn trừ (người/vai trò) luôn được ưu tiên.
function canUseCommand(name, userId, ownerId, roleIds) {
  if (!isCommandDown(name)) return true;
  const uid = toId(userId);
  const oid = toId(ownerId);
  if (uid && oid && uid === oid) return true;
  if (isAllowed(uid)) return true;
  return hasAllowedRole(roleIds);
}

function enable(opts) {
  const o = opts || {};
  const now = Date.now();
  let duration = Number(o.ms);
  if (!Number.isFinite(duration) || duration <= 0) duration = 0;
  else duration = Math.min(Math.max(Math.floor(duration), MIN_MS), MAX_MS);

  const wasOn = state.enabled;
  state.enabled = true;
  state.reason = toText(o.reason, 400);
  state.by = toId(o.by) || '';
  state.until = duration > 0 ? now + duration : 0;
  if (!wasOn) {
    state.since = now;
    state.blocked = 0;
    state.sessions = toCount(state.sessions) + 1;
  }
  pushLog(wasOn ? 'update' : 'on', o.by, state.reason || 'Không nêu lý do');
  persistNow();
  return getState();
}

function disable(opts) {
  const by = (opts && opts.by) || '';
  const wasOn = state.enabled;
  state.enabled = false;
  state.until = 0;
  state.reason = '';
  state.blocked = 0;
  if (wasOn) pushLog('off', by, 'Đã mở lại bot cho mọi người');
  persistNow();
  return getState();
}

function extend(ms, by) {
  if (!isEnabled()) return null;
  const add = Number(ms);
  if (!Number.isFinite(add) || add <= 0) return getState();
  const now = Date.now();
  const base = state.until > now ? state.until : now;
  state.until = Math.min(base + Math.floor(add), now + MAX_MS);
  pushLog('extend', by, 'Gia hạn thêm ' + Math.round(add / 60000) + ' phút');
  persistNow();
  return getState();
}

// Bỏ hẹn giờ -> bảo trì kéo dài tới khi chủ bot tắt thủ công.
function clearTimer(by) {
  if (!isEnabled() || state.until === 0) return getState();
  state.until = 0;
  pushLog('no-timer', by, 'Bỏ hẹn giờ, bảo trì tới khi tắt thủ công');
  persistNow();
  return getState();
}

function setReason(reason, by) {
  state.reason = toText(reason, 400);
  pushLog('reason', by, state.reason || 'Xoá lý do');
  persistNow();
  return getState();
}

function allow(userId, by) {
  const uid = toId(userId);
  if (!uid) return { ok: false, error: 'ID người dùng không hợp lệ.' };
  if (state.allowlist.includes(uid)) return { ok: false, error: 'Người này đã có trong danh sách miễn trừ.' };
  if (state.allowlist.length >= MAX_ALLOW) return { ok: false, error: 'Danh sách miễn trừ đã đầy (tối đa ' + MAX_ALLOW + ').' };
  state.allowlist.push(uid);
  pushLog('allow', by, 'Miễn trừ cho ' + uid);
  persistNow();
  return { ok: true, state: getState() };
}

function disallow(userId, by) {
  const uid = toId(userId);
  if (!uid) return { ok: false, error: 'ID người dùng không hợp lệ.' };
  const i = state.allowlist.indexOf(uid);
  if (i === -1) return { ok: false, error: 'Người này không có trong danh sách miễn trừ.' };
  state.allowlist.splice(i, 1);
  pushLog('deny', by, 'Gỡ miễn trừ của ' + uid);
  persistNow();
  return { ok: true, state: getState() };
}

function allowRole(roleId, by) {
  const rid = toId(roleId);
  if (!rid) return { ok: false, error: 'ID vai trò không hợp lệ.' };
  if (state.allowRoles.includes(rid)) return { ok: false, error: 'Vai trò này đã có trong danh sách miễn trừ.' };
  if (state.allowRoles.length >= MAX_ALLOW) return { ok: false, error: 'Danh sách vai trò miễn trừ đã đầy (tối đa ' + MAX_ALLOW + ').' };
  state.allowRoles.push(rid);
  pushLog('allow-role', by, 'Miễn trừ cho vai trò ' + rid);
  persistNow();
  return { ok: true, state: getState() };
}

function disallowRole(roleId, by) {
  const rid = toId(roleId);
  if (!rid) return { ok: false, error: 'ID vai trò không hợp lệ.' };
  const i = state.allowRoles.indexOf(rid);
  if (i === -1) return { ok: false, error: 'Vai trò này không có trong danh sách miễn trừ.' };
  state.allowRoles.splice(i, 1);
  pushLog('deny-role', by, 'Gỡ miễn trừ của vai trò ' + rid);
  persistNow();
  return { ok: true, state: getState() };
}

// Bật/tắt nhanh một người (dùng cho menu chọn trên bảng điều khiển).
function toggleUser(userId, by) {
  const uid = toId(userId);
  if (!uid) return { ok: false, error: 'ID người dùng không hợp lệ.' };
  return state.allowlist.includes(uid)
    ? { ...disallow(uid, by), removed: true }
    : { ...allow(uid, by), added: true };
}

function toggleRole(roleId, by) {
  const rid = toId(roleId);
  if (!rid) return { ok: false, error: 'ID vai trò không hợp lệ.' };
  return state.allowRoles.includes(rid)
    ? { ...disallowRole(rid, by), removed: true }
    : { ...allowRole(rid, by), added: true };
}

function clearAllow(by) {
  const n = state.allowlist.length + state.allowRoles.length;
  state.allowlist = [];
  state.allowRoles = [];
  if (n) pushLog('deny-all', by, 'Xoá toàn bộ ' + n + ' mục miễn trừ');
  persistNow();
  return getState();
}

// Ghi nhận một lệnh bị chặn (chỉ đếm, ghi file gom nhóm cho nhẹ đĩa).
function noteBlocked() {
  state.blocked = toCount(state.blocked) + 1;
  state.totalBlocked = toCount(state.totalBlocked) + 1;
  state.lastBlockedAt = Date.now();
  persistSoon();
  return state.blocked;
}

function clearLog(by) {
  state.log = [];
  pushLog('clear-log', by, 'Đã xoá nhật ký bảo trì');
  persistNow();
  return getState();
}

// ---------- Tiện ích thời gian (dùng chung với lệnh maintenance) ----------
// Chấp nhận: "30" (phút), "30m", "2h", "90s", "1d", "1h30m", "vo han"...
function parseDuration(input) {
  if (input == null) return { ms: 0, infinite: true };
  const raw = String(input).trim().toLowerCase();
  if (!raw) return { ms: 0, infinite: true };
  const INF = ['0', 'vo han', 'vô hạn', 'vohan', 'infinite', 'none', 'khong', 'không', 'mai mai', 'mãi mãi'];
  if (INF.indexOf(raw) !== -1) return { ms: 0, infinite: true };
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const mins = Number(raw);
    if (!Number.isFinite(mins) || mins <= 0) return { ms: 0, error: 'Thời lượng phải lớn hơn 0.' };
    const val = Math.round(mins * 60000);
    if (val > MAX_MS) return { ms: 0, error: 'Thời lượng tối đa là 30 ngày.' };
    if (val < MIN_MS) return { ms: 0, error: 'Thời lượng tối thiểu là 10 giây.' };
    return { ms: val };
  }
  const norm = raw
    .replace(/giờ/g, 'gio')
    .replace(/giây/g, 'giay')
    .replace(/phút/g, 'phut')
    .replace(/ngày/g, 'ngay');
  const re = /(\d+(?:\.\d+)?)\s*(ngay|phut|giay|gio|[dhms])/g;
  const unit = { d: 86400000, h: 3600000, m: 60000, s: 1000, ngay: 86400000, gio: 3600000, phut: 60000, giay: 1000 };
  let total = 0;
  let matched = false;
  let m = re.exec(norm);
  while (m !== null) {
    const value = Number(m[1]);
    const mult = unit[m[2]];
    if (Number.isFinite(value) && mult) {
      total += value * mult;
      matched = true;
    }
    m = re.exec(norm);
  }
  if (!matched) return { ms: 0, error: 'Không hiểu thời lượng. Ví dụ: `30m`, `2h`, `1h30m`, `1d`, hoặc `0` để không hẹn giờ.' };
  if (total <= 0) return { ms: 0, error: 'Thời lượng phải lớn hơn 0.' };
  if (total < MIN_MS) return { ms: 0, error: 'Thời lượng tối thiểu là 10 giây.' };
  if (total > MAX_MS) return { ms: 0, error: 'Thời lượng tối đa là 30 ngày.' };
  return { ms: Math.floor(total) };
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  if (total < 1) return 'dưới 1 giây';
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const mi = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const parts = [];
  if (d) parts.push(d + ' ngày');
  if (h) parts.push(h + ' giờ');
  if (mi) parts.push(mi + ' phút');
  if (s && !d && !h) parts.push(s + ' giây');
  return parts.join(' ') || 'dưới 1 giây';
}

module.exports = {
  MAX_LOG,
  MAX_ALLOW,
  MAX_MS,
  MIN_MS,
  getState,
  isEnabled,
  isAllowed,
  canUse,
  enable,
  disable,
  extend,
  clearTimer,
  setReason,
  allow,
  disallow,
  allowRole,
  disallowRole,
  toggleUser,
  toggleRole,
  hasAllowedRole,
  enableCommand,
  disableCommand,
  clearCommands,
  commandInfo,
  isCommandDown,
  listCommands,
  canUseCommand,
  MAX_CMD,
  clearAllow,
  noteBlocked,
  clearLog,
  parseDuration,
  formatDuration,
  flush: persistNow,
};
