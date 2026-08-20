// =============================================================
//  Database - lưu trữ dữ liệu đơn giản bằng file JSON
//  Dùng cho economy (tiền), warn (cảnh cáo), và cài đặt guild
// =============================================================
const fs = require('fs');
const path = require('path');
const fishing = require('./fishing');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

class JsonStore {
  constructor(fileName, initial = {}) {
    this.file = path.join(DATA_DIR, fileName);
    this.data = initial;
    this._ensure();
    this._load();
  }

  _ensure() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  _load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')) || {};
    } catch {
      this.data = {};
    }
  }

  // Ghi an toàn: ghi ra file tạm rồi đổi tên đè lên file thật.
  // Nếu bot tắt đột ngột giữa chừng, file gốc vẫn nguyên vẹn (không bị JSON hỏng).
  save() {
    const tmp = this.file + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
      // Dự phòng: ghi trực tiếp nếu không đổi tên được
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    }
  }

  get(key, fallback = null) {
    return key in this.data ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
    return value;
  }

  all() {
    return this.data;
  }

  delete(key) {
    delete this.data[key];
    this.save();
  }
}

// ---- Hàm hỗ trợ cho Economy ----
const economy = new JsonStore('economy.json', {});

function emptyFishStats() {
  return { caught: 0, spent: 0, earned: 0, best: null, discovered: {}, byRarity: {} };
}

// Đảm bảo ví có đầy đủ trường thống kê câu cá (có di trú dữ liệu cũ).
function ensureFishStats(w) {
  const seedFromAquarium = !w.fishStats;
  w.fishStats = Object.assign(emptyFishStats(), w.fishStats || {});
  // Tự động bổ sung các trường con nếu thiếu
  if (!w.fishStats.discovered || typeof w.fishStats.discovered !== 'object') w.fishStats.discovered = {};
  if (!w.fishStats.byRarity || typeof w.fishStats.byRarity !== 'object') w.fishStats.byRarity = {};
  // Người chơi cũ: gieo dữ liệu sưu tầm từ bể cá hiện tại để không mất tiến độ Fishdex.
  if (seedFromAquarium && Array.isArray(w.aquarium) && w.aquarium.length) {
    for (const f of w.aquarium) {
      w.fishStats.discovered[f.id] = (w.fishStats.discovered[f.id] || 0) + 1;
      const sp = fishing.speciesById(f.id);
      if (sp) w.fishStats.byRarity[sp.rarity] = (w.fishStats.byRarity[sp.rarity] || 0) + 1;
      if (!w.fishStats.best || (f.value || 0) > (w.fishStats.best.value || 0)) {
        w.fishStats.best = { id: f.id, value: f.value || 0 };
      }
    }
    w.fishStats.caught = w.aquarium.length;
  }
  return w;
}

// Đảm bảo ví có đủ các trường mở rộng (shop/buy/quest/pray/curse).
// Có di trú dữ liệu cũ — không ghi đè giá trị đã có.
function ensureExtras(w) {
  if (!w.inventory || typeof w.inventory !== 'object') w.inventory = {};
  if (typeof w.karma !== 'number') w.karma = 0;
  // Lệnh snailgarden đã gỡ bỏ — trường `garden` cũ (nếu còn trong dữ liệu) được bỏ qua, không đọc/ghi nữa.
  if (typeof w.lastPray !== 'number') w.lastPray = 0;
  if (typeof w.lastCurse !== 'number') w.lastCurse = 0;
  if (typeof w.cursedUntil !== 'number') w.cursedUntil = 0;
  if (w.quest === undefined) w.quest = null;
  return w;
}

// Làm sạch ví trước khi dùng và trước khi ghi xuống đĩa.
// Khi chạy 24/7, chỉ cần MỘT phép tính lỗi (NaN, undefined, chia 0) là số xu trở
// thành NaN; JSON.stringify sẽ ghi xuống thành null và ví hỏng vĩnh viễn.
// Hàm này chặn đứng chuỗi hỏng đó ngay tại điểm đọc và điểm ghi.
const MAX_COIN = Number.MAX_SAFE_INTEGER;
function safeNumber(v, fallback = 0) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  if (n > MAX_COIN) return MAX_COIN;
  if (n < -MAX_COIN) return -MAX_COIN;
  return n;
}

function sanitizeWallet(w) {
  if (!w || typeof w !== 'object') w = {};
  w.balance = Math.max(0, Math.floor(safeNumber(w.balance, 0)));
  w.bank = Math.max(0, Math.floor(safeNumber(w.bank, 0)));
  w.lastDaily = Math.max(0, Math.floor(safeNumber(w.lastDaily, 0)));
  w.lastWork = Math.max(0, Math.floor(safeNumber(w.lastWork, 0)));
  w.dailyStreak = Math.max(0, Math.floor(safeNumber(w.dailyStreak, 0)));
  w.karma = Math.floor(safeNumber(w.karma, 0));
  w.lastPray = Math.max(0, Math.floor(safeNumber(w.lastPray, 0)));
  w.lastCurse = Math.max(0, Math.floor(safeNumber(w.lastCurse, 0)));
  w.cursedUntil = Math.max(0, Math.floor(safeNumber(w.cursedUntil, 0)));

  // Bể cá luôn là mảng các con cá hợp lệ.
  if (!Array.isArray(w.aquarium)) w.aquarium = [];
  else {
    w.aquarium = w.aquarium
      .filter((f) => f && typeof f === 'object' && typeof f.id === 'string')
      .map((f) => ({ ...f, value: Math.max(0, Math.floor(safeNumber(f.value, 0))) }));
  }

  // Kho đồ: chỉ giữ số lượng nguyên dương.
  if (!w.inventory || typeof w.inventory !== 'object' || Array.isArray(w.inventory)) w.inventory = {};
  else {
    for (const k of Object.keys(w.inventory)) {
      const qty = Math.floor(safeNumber(w.inventory[k], 0));
      if (qty > 0) w.inventory[k] = qty;
      else delete w.inventory[k];
    }
  }

  // Thống kê câu cá.
  if (!w.fishStats || typeof w.fishStats !== 'object' || Array.isArray(w.fishStats)) w.fishStats = emptyFishStats();
  const st = w.fishStats;
  st.caught = Math.max(0, Math.floor(safeNumber(st.caught, 0)));
  st.spent = Math.max(0, Math.floor(safeNumber(st.spent, 0)));
  st.earned = Math.max(0, Math.floor(safeNumber(st.earned, 0)));
  if (!st.discovered || typeof st.discovered !== 'object' || Array.isArray(st.discovered)) st.discovered = {};
  else for (const k of Object.keys(st.discovered)) st.discovered[k] = Math.max(0, Math.floor(safeNumber(st.discovered[k], 0)));
  if (!st.byRarity || typeof st.byRarity !== 'object' || Array.isArray(st.byRarity)) st.byRarity = {};
  else for (const k of Object.keys(st.byRarity)) st.byRarity[k] = Math.max(0, Math.floor(safeNumber(st.byRarity[k], 0)));
  if (st.best && typeof st.best === 'object') st.best = { ...st.best, value: Math.max(0, Math.floor(safeNumber(st.best.value, 0))) };
  else st.best = null;

  // Nhiệm vụ hằng ngày: nếu hỏng thì bỏ để hệ thống tự phát nhiệm vụ mới.
  if (w.quest !== null && w.quest !== undefined && (typeof w.quest !== 'object' || Array.isArray(w.quest))) w.quest = null;
  return w;
}

function getWallet(userId) {
  const w = economy.get(userId);
  if (w) {
    // --- Di trú dữ liệu cũ ---
    // Hệ thống ngân hàng đã bỏ: gộp số xu trong bank về ví để không mất.
    let migrated = false;
    if (w.bank) {
      w.balance = (w.balance || 0) + w.bank;
      w.bank = 0;
      migrated = true;
    }
    // Bể cá (aquarium): mảng các con cá đã câu được, chưa bán.
    if (!Array.isArray(w.aquarium)) {
      w.aquarium = [];
      migrated = true;
    }
    if (!w.fishStats) migrated = true;
    ensureFishStats(w);
    ensureExtras(w);
    sanitizeWallet(w);
    // Lưu ngay kết quả di trú, tránh mất xu từ bank nếu lệnh chỉ đọc ví.
    if (migrated) economy.set(userId, w);
    return w;
  }
  const fresh = sanitizeWallet(ensureExtras({ balance: 0, bank: 0, lastDaily: 0, lastWork: 0, dailyStreak: 0, aquarium: [], fishStats: emptyFishStats() }));
  economy.set(userId, fresh);
  return fresh;
}

function saveWallet(userId, wallet) {
  // Làm sạch TRƯỚC khi ghi — hàng rào cuối cùng bảo vệ file economy.json.
  economy.set(userId, sanitizeWallet(wallet));
}

// ---- Hàm hỗ trợ cho Cảnh cáo (warn) ----
const warns = new JsonStore('warns.json', {});

function getWarns(guildId, userId) {
  const key = `${guildId}:${userId}`;
  return warns.get(key, []);
}

// Giữ tối đa 100 cảnh cáo gần nhất cho mỗi người — tránh file warns.json phình
// vô hạn khi bot chạy nhiều tháng. Lệnh `warn list` vốn cũng chỉ hiện 10 mục cuối.
const MAX_WARNS_PER_USER = 100;

function addWarn(guildId, userId, entry) {
  const key = `${guildId}:${userId}`;
  const list = warns.get(key, []);
  list.push(entry);
  if (list.length > MAX_WARNS_PER_USER) list.splice(0, list.length - MAX_WARNS_PER_USER);
  warns.set(key, list);
  return list;
}

function clearWarns(guildId, userId) {
  warns.delete(`${guildId}:${userId}`);
}

// ---- Cài đặt theo từng máy chủ (guild) ----
// Lưu prefix riêng cho mỗi server. Được đọc lại ở mỗi tin nhắn nên thay đổi
// áp dụng NGAY LẬP TỨC, không cần khởi động lại bot.
const guildSettings = new JsonStore('guildSettings.json', {});

function getPrefix(guildId) {
  if (!guildId) return null;
  const s = guildSettings.get(guildId, null);
  return s && typeof s.prefix === 'string' && s.prefix ? s.prefix : null;
}

function setPrefix(guildId, prefix) {
  const s = guildSettings.get(guildId, {}) || {};
  s.prefix = prefix;
  guildSettings.set(guildId, s);
  return prefix;
}

function resetPrefix(guildId) {
  const s = guildSettings.get(guildId, {}) || {};
  delete s.prefix;
  guildSettings.set(guildId, s);
}

// ---- Chống spam theo từng máy chủ (mặc định BẬT) ----
function isAntiSpamEnabled(guildId) {
  if (!guildId) return false;
  const s = guildSettings.get(guildId, null);
  if (!s || typeof s.antiSpam !== 'boolean') return true; // mặc định BẬT
  return s.antiSpam;
}

function setAntiSpamEnabled(guildId, enabled) {
  const s = guildSettings.get(guildId, {}) || {};
  s.antiSpam = !!enabled;
  guildSettings.set(guildId, s);
  return s.antiSpam;
}

module.exports = {
  JsonStore,
  economy,
  getWallet,
  saveWallet,
  emptyFishStats,
  ensureExtras,
  warns,
  getWarns,
  addWarn,
  clearWarns,
  guildSettings,
  getPrefix,
  setPrefix,
  resetPrefix,
  isAntiSpamEnabled,
  setAntiSpamEnabled,
};
