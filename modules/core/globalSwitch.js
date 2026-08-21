// =============================================================
//  globalSwitch - CÔNG TẮC TOÀN CỤC do CHỦ BOT điều khiển
//
//  Mục đích: có những hệ thống phải bật/tắt cho TOÀN BỘ máy chủ cùng lúc
//  (ví dụ: chống bot tự động, chống acc clone). Chủ bot tắt ở một nơi là
//  tắt ở mọi máy chủ; bật lại cũng vậy. Máy chủ KHÔNG thể tự ghi đè.
//
//  Trạng thái lưu ở data/globalSwitches.json nên bot khởi động lại vẫn nhớ.
//  Ghi file được gom nhóm (debounce) để không đụng ổ đĩa liên tục.
// =============================================================
'use strict';

const db = require('./Database');

const store = new db.JsonStore('globalSwitches.json', {});
const KEY = 'state';

const MAX_LOG = 60; // giữ tối đa 60 dòng nhật ký thay đổi
const FLUSH_MS = 4000; // gom việc ghi file trong 4 giây

// Sổ đăng ký các công tắc: key -> { key, label, description, def }
const registry = new Map();
// Những người muốn được thông báo khi có công tắc thay đổi.
const listeners = new Set();

// ---------- Tiện ích làm sạch ----------
function toKey(v) {
  const t = String(v == null ? '' : v).trim();
  return /^[A-Za-z][A-Za-z0-9_-]{0,48}$/.test(t) ? t : '';
}

function toId(v) {
  const t = String(v == null ? '' : v)
    .trim()
    .replace(/^<@[!&]?/, '')
    .replace(/>$/, '');
  return /^\d{15,25}$/.test(t) ? t : '';
}

function toText(v, max = 300) {
  if (typeof v !== 'string') return '';
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) : t;
}

function toCount(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

function blank() {
  return { switches: {}, log: [] };
}

function sanitize(raw) {
  const s = blank();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return s;

  if (raw.switches && typeof raw.switches === 'object' && !Array.isArray(raw.switches)) {
    for (const rawKey of Object.keys(raw.switches)) {
      const key = toKey(rawKey);
      const val = raw.switches[rawKey];
      if (!key || !val || typeof val !== 'object' || Array.isArray(val)) continue;
      s.switches[key] = {
        // Chỉ nhận đúng true/false. Thiếu thì để null = "chưa từng đặt" -> dùng mặc định.
        on: typeof val.on === 'boolean' ? val.on : null,
        changedAt: toCount(val.changedAt),
        changedBy: toId(val.changedBy),
        toggles: toCount(val.toggles),
      };
    }
  }

  s.log = Array.isArray(raw.log)
    ? raw.log
        .filter((e) => e && typeof e === 'object' && !Array.isArray(e))
        .slice(-MAX_LOG)
        .map((e) => ({
          at: toCount(e.at),
          key: toKey(e.key),
          on: e.on === true,
          by: toId(e.by),
          note: toText(e.note, 200),
        }))
        .filter((e) => e.key)
    : [];

  return s;
}

let state = sanitize(store.get(KEY, null));

// ---------- Ghi file có gom nhóm ----------
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

// ---------- Đăng ký công tắc ----------
/**
 * Khai báo một công tắc toàn cục.
 * @param {string} key            khoá duy nhất, ví dụ 'antiAutomation'
 * @param {object} opts           { label, description, default }
 */
function register(key, opts = {}) {
  const k = toKey(key);
  if (!k) throw new Error('globalSwitch.register: khoá không hợp lệ: ' + key);
  const def = opts.default === undefined ? true : Boolean(opts.default);
  registry.set(k, {
    key: k,
    label: toText(opts.label, 80) || k,
    description: toText(opts.description, 300),
    def,
  });
  return k;
}

function meta(key) {
  const k = toKey(key);
  return registry.get(k) || { key: k, label: k, description: '', def: true };
}

function isRegistered(key) {
  return registry.has(toKey(key));
}

// ---------- Đọc trạng thái ----------
// Công tắc BẬT khi: đã được đặt true, hoặc chưa từng đặt và mặc định là bật.
function isOn(key) {
  const k = toKey(key);
  if (!k) return false;
  const rec = state.switches[k];
  if (rec && typeof rec.on === 'boolean') return rec.on;
  return meta(k).def;
}

function getState(key) {
  const k = toKey(key);
  const m = meta(k);
  const rec = state.switches[k] || {};
  return {
    key: k,
    label: m.label,
    description: m.description,
    default: m.def,
    on: isOn(k),
    explicit: typeof rec.on === 'boolean',
    changedAt: toCount(rec.changedAt),
    changedBy: toId(rec.changedBy),
    toggles: toCount(rec.toggles),
  };
}

function list() {
  return Array.from(registry.keys())
    .sort()
    .map((k) => getState(k));
}

// ---------- Ghi trạng thái ----------
function pushLog(key, on, by, note) {
  state.log.push({ at: Date.now(), key: toKey(key), on: Boolean(on), by: toId(by), note: toText(note, 200) });
  if (state.log.length > MAX_LOG) state.log = state.log.slice(-MAX_LOG);
}

function notify(key, on, by) {
  for (const fn of Array.from(listeners)) {
    try {
      fn({ key, on, by });
    } catch {
      /* một người nghe lỗi không được làm hỏng những người còn lại */
    }
  }
}

/**
 * Bật/tắt một công tắc cho TOÀN BỘ máy chủ.
 * @returns {{ok:boolean, changed?:boolean, state?:object, error?:string}}
 */
function set(key, on, by, note) {
  const k = toKey(key);
  if (!k) return { ok: false, error: 'Khoá công tắc không hợp lệ.' };
  if (!registry.has(k)) return { ok: false, error: 'Không có công tắc nào tên "' + k + '".' };

  const next = Boolean(on);
  const before = isOn(k);
  const rec = state.switches[k] || { on: null, changedAt: 0, changedBy: '', toggles: 0 };

  rec.on = next;
  rec.changedAt = Date.now();
  rec.changedBy = toId(by);
  if (before !== next) rec.toggles = toCount(rec.toggles) + 1;
  state.switches[k] = rec;

  if (before !== next) {
    pushLog(k, next, by, note || (next ? 'Bật cho toàn bộ máy chủ' : 'Tắt cho toàn bộ máy chủ'));
    persistNow();
    notify(k, next, toId(by));
  } else {
    persistSoon();
  }

  return { ok: true, changed: before !== next, state: getState(k) };
}

function toggle(key, by, note) {
  const k = toKey(key);
  if (!registry.has(k)) return { ok: false, error: 'Không có công tắc nào tên "' + k + '".' };
  return set(k, !isOn(k), by, note);
}

// Trả công tắc về đúng giá trị mặc định (xoá lựa chọn thủ công).
function reset(key, by) {
  const k = toKey(key);
  if (!registry.has(k)) return { ok: false, error: 'Không có công tắc nào tên "' + k + '".' };
  const before = isOn(k);
  delete state.switches[k];
  const after = isOn(k);
  if (before !== after) {
    pushLog(k, after, by, 'Trả về mặc định');
    notify(k, after, toId(by));
  }
  persistNow();
  return { ok: true, changed: before !== after, state: getState(k) };
}

function setMany(keys, on, by, note) {
  const results = [];
  for (const k of Array.isArray(keys) ? keys : []) results.push(set(k, on, by, note));
  return results;
}

function onChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function logEntries(limit = 15) {
  const n = Math.max(1, Math.min(MAX_LOG, Number(limit) || 15));
  return state.log.slice(-n).reverse().map((e) => ({ ...e }));
}

function clearLog(by) {
  state.log = [];
  pushLog('all', isOn('all'), by, 'Đã xoá nhật ký công tắc');
  // Dòng vừa thêm chỉ mang tính đánh dấu; nếu khoá 'all' chưa đăng ký thì bỏ luôn.
  state.log = state.log.filter((e) => registry.has(e.key));
  persistNow();
  return true;
}

module.exports = {
  MAX_LOG,
  register,
  isRegistered,
  meta,
  isOn,
  getState,
  list,
  set,
  toggle,
  reset,
  setMany,
  onChange,
  logEntries,
  clearLog,
  flush: persistNow,
};
