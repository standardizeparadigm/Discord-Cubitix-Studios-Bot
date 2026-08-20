// =============================================================
//  antiSpam - hệ thống chống spam thông minh, toàn diện
//  Thuần logic, KHÔNG phụ thuộc discord.js nên dễ kiểm thử.
//  Phát hiện nhiều kiểu spam và leo thang hình phạt:
//    1) flood      - gửi quá nhiều tin trong cửa sổ thời gian
//    2) duplicate  - lặp lại cùng nội dung
//    3) mention    - tag quá nhiều người/vai trò (hoặc @everyone)
//    4) wall       - xuống dòng quá nhiều (tường chữ)
//    5) charflood  - lặp 1 ký tự quá nhiều lần liên tiếp
//    6) caps       - viết HOA gần như toàn bộ
//  Hình phạt: lần 1 cảnh cáo; tái phạm -> timeout tăng dần.
//  Vi phạm tự suy giảm sau một khoảng thời gian sạch sẽ.
// =============================================================
'use strict';

const DEFAULTS = {
  windowMs: 6000,        // cửa sổ tính flood
  maxMessages: 6,        // > số này trong cửa sổ = flood
  maxDuplicates: 3,      // số tin trùng nội dung
  dupWindowMs: 15000,    // cửa sổ tính trùng lặp
  maxMentions: 6,        // số mention tối đa trong 1 tin
  maxNewlines: 12,       // số dòng tối đa
  maxRepeatRun: 12,      // chuỗi lặp 1 ký tự tối đa
  minCapsLen: 15,        // độ dài tối thiểu mới xét viết hoa
  capsRatio: 0.8,        // tỷ lệ chữ HOA bị coi là spam
  offenseDecayMs: 5 * 60 * 1000, // sạch trong bao lâu thì xóa vi phạm
  timeouts: [60 * 1000, 10 * 60 * 1000, 60 * 60 * 1000], // leo thang timeout
};

function normalize(content) {
  return String(content || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function countNewlines(content) {
  const s = String(content || '');
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') n++;
  return n;
}

function longestRepeatRun(content) {
  const s = String(content || '');
  let best = 0;
  let run = 0;
  let prev = null;
  for (const ch of s) {
    if (ch === prev) run++;
    else { run = 1; prev = ch; }
    if (run > best) best = run;
  }
  return best;
}

// Tỷ lệ chữ HOA — hỗ trợ cả chữ có dấu tiếng Việt (À, Ạ, Đ, Ơ...).
// Trước đây chỉ đếm A-Z nên tin nhắn viết HOA tiếng Việt gần như không bị phát hiện.
function capsRatio(content) {
  const s = String(content || '');
  let letters = 0;
  let upper = 0;
  for (const ch of s) {
    if (!/\p{L}/u.test(ch)) continue;
    letters++;
    // Ký tự không phân biệt hoa/thường (ví dụ chữ Hán) sẽ không được tính là HOA.
    if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) upper++;
  }
  return letters === 0 ? 0 : upper / letters;
}

// Dọn bộ nhớ: bot chạy 24/7 sẽ gặp rất nhiều người, nếu giữ mãi trạng thái của
// từng người thì Map cứ phình lên mãi (rò rỉ bộ nhớ). Ai im lặng đủ lâu thì
// xóa trạng thái — không ảnh hưởng gì vì cả bộ đệm lẫn số lần vi phạm đều đã hết hạn.
const PRUNE_EVERY_MS = 60 * 1000; // quét nhiều nhất 1 lần mỗi phút
const MIN_IDLE_MS = 10 * 60 * 1000; // ít nhất 10 phút không nói gì mới dọn

class AntiSpamEngine {
  constructor(options = {}) {
    this.cfg = Object.assign({}, DEFAULTS, options);
    this.users = new Map(); // key `${guildId}:${userId}` -> state
    this.lastPrune = 0;
  }

  _state(key, now = Date.now()) {
    let st = this.users.get(key);
    if (!st) {
      st = { times: [], recent: [], offenses: 0, lastOffenseAt: 0, lastSeen: now };
      this.users.set(key, st);
    }
    return st;
  }

  // Xóa trạng thái của những người đã im lặng lâu. Trả về số mục đã dọn.
  prune(now = Date.now(), force = false) {
    if (!force && now - this.lastPrune < PRUNE_EVERY_MS) return 0;
    this.lastPrune = now;
    const idleLimit = Math.max(this.cfg.offenseDecayMs || 0, this.cfg.dupWindowMs || 0, MIN_IDLE_MS);
    let removed = 0;
    for (const [k, st] of this.users) {
      if (now - (st.lastSeen || 0) > idleLimit) {
        this.users.delete(k);
        removed++;
      }
    }
    return removed;
  }

  // Phân tích một tin nhắn. Trả về quyết định xử lý.
  check({ guildId, userId, content = '', mentions = 0, now = Date.now(), config = {} }) {
    const cfg = Object.assign({}, this.cfg, config);
    const key = `${guildId}:${userId}`;
    const st = this._state(key, now);
    st.lastSeen = now;
    this.prune(now); // tự dọn định kỳ, tối đa 1 lần/phút nên rất nhẹ
    const reasons = [];

    // 1) Flood
    st.times.push(now);
    st.times = st.times.filter((t) => now - t <= cfg.windowMs);
    if (st.times.length > cfg.maxMessages) reasons.push('flood');

    // 2) Trùng nội dung
    const norm = normalize(content);
    if (norm.length > 0) {
      st.recent.push({ h: norm, t: now });
      st.recent = st.recent.filter((r) => now - r.t <= cfg.dupWindowMs);
      const dup = st.recent.filter((r) => r.h === norm).length;
      if (dup >= cfg.maxDuplicates) reasons.push('duplicate');
    }

    // 3) Mention spam
    if (mentions > cfg.maxMentions) reasons.push('mention');

    // 4) Tường chữ (xuống dòng)
    if (countNewlines(content) > cfg.maxNewlines) reasons.push('wall');

    // 5) Lặp ký tự
    if (longestRepeatRun(content) >= cfg.maxRepeatRun) reasons.push('charflood');

    // 6) Viết hoa
    if (String(content).length >= cfg.minCapsLen && capsRatio(content) >= cfg.capsRatio) reasons.push('caps');

    if (reasons.length === 0) {
      return { flagged: false, reasons: [], offenses: st.offenses, action: 'none' };
    }

    // Suy giảm vi phạm nếu đã sạch đủ lâu
    if (st.lastOffenseAt && now - st.lastOffenseAt > cfg.offenseDecayMs) st.offenses = 0;
    st.offenses += 1;
    st.lastOffenseAt = now;
    // Xóa bộ đệm để không đếm lặp 1 sự cố nhiều lần
    st.times = [];
    st.recent = [];

    let action = 'warn';
    let timeoutMs = 0;
    if (st.offenses >= 2) {
      action = 'timeout';
      const idx = Math.min(st.offenses - 2, cfg.timeouts.length - 1);
      timeoutMs = cfg.timeouts[idx];
    }

    return { flagged: true, reasons, offenses: st.offenses, action, timeoutMs, deleteMessage: true };
  }

  reset(guildId, userId) {
    this.users.delete(`${guildId}:${userId}`);
  }
}

module.exports = { AntiSpamEngine, DEFAULTS, normalize, countNewlines, longestRepeatRun, capsRatio };
