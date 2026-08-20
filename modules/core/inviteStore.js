// =============================================================
//  inviteStore - theo dõi AI MỜI AI vào máy chủ và đếm số lượt mời
//
//  Cách hoạt động (không cần cài thêm gì):
//   1. Khi bot online, nó chụp lại số lượt dùng của mọi lời mời (bộ nhớ đệm).
//   2. Khi có người vào, bot tải lại danh sách lời mời và so sánh:
//      lời mời nào tăng thêm 1 lượt chính là lời mời đã được dùng.
//   3. Ghi công cho chủ lời mời đó và lưu vào data/invites.json.
//
//  Lưu ý: cần bật intent "GuildInvites" (đã bật sẵn trong index.js) và
//  bot phải có quyền "Manage Server" thì mới đọc được danh sách lời mời.
// =============================================================
const { JsonStore } = require('./Database');

const store = new JsonStore('invites.json', {});

// Bộ nhớ đệm số lượt dùng: Map<guildId, Map<code, { uses, inviterId }>>
// Chỉ nằm trong RAM, sẽ được dựng lại mỗi lần bot khởi động.
const cache = new Map();

function gid(guildId) {
  const id = String(guildId == null ? '' : guildId).trim();
  return /^\d{15,25}$/.test(id) ? id : '';
}

function uid(userId) {
  const id = String(userId == null ? '' : userId).trim();
  return /^\d{15,25}$/.test(id) ? id : '';
}

function bucket(guildId) {
  const g = gid(guildId);
  if (!g) return null;
  let data = store.get(g, null);
  if (!data || typeof data !== 'object') data = {};
  if (!data.counts || typeof data.counts !== 'object') data.counts = {};
  if (!data.joined || typeof data.joined !== 'object') data.joined = {};
  return data;
}

function saveBucket(guildId, data) {
  const g = gid(guildId);
  if (!g) return;
  store.set(g, data);
}

function emptyCount() {
  return { joins: 0, leaves: 0, bonus: 0 };
}

function entry(data, userId) {
  const u = uid(userId);
  if (!u) return null;
  if (!data.counts[u] || typeof data.counts[u] !== 'object') data.counts[u] = emptyCount();
  const c = data.counts[u];
  if (!Number.isFinite(c.joins)) c.joins = 0;
  if (!Number.isFinite(c.leaves)) c.leaves = 0;
  if (!Number.isFinite(c.bonus)) c.bonus = 0;
  return c;
}

// ---------- Bộ nhớ đệm lời mời ----------

// Tải toàn bộ lời mời của máy chủ vào bộ nhớ đệm.
async function primeGuild(guild) {
  const g = gid(guild && guild.id);
  if (!g || !guild.invites || typeof guild.invites.fetch !== 'function') return 0;
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    for (const inv of invites.values()) {
      map.set(inv.code, { uses: inv.uses || 0, inviterId: inv.inviter ? String(inv.inviter.id) : '' });
    }
    // Lời mời tục (vanity URL) cũng được đếm riêng nếu máy chủ có.
    try {
      if (guild.vanityURLCode && typeof guild.fetchVanityData === 'function') {
        const vanity = await guild.fetchVanityData();
        if (vanity && vanity.code) map.set('vanity:' + vanity.code, { uses: vanity.uses || 0, inviterId: '' });
      }
    } catch (_) {
      /* không có quyền hoặc máy chủ không có vanity -> bỏ qua */
    }
    cache.set(g, map);
    return map.size;
  } catch (_) {
    // Thiếu quyền "Manage Server" -> không theo dõi được, nhưng KHÔNG làm sập bot.
    return 0;
  }
}

function addInvite(invite) {
  const g = gid(invite && invite.guild && invite.guild.id);
  if (!g || !invite.code) return;
  if (!cache.has(g)) cache.set(g, new Map());
  cache.get(g).set(invite.code, {
    uses: invite.uses || 0,
    inviterId: invite.inviter ? String(invite.inviter.id) : '',
  });
}

function removeInvite(invite) {
  const g = gid(invite && invite.guild && invite.guild.id);
  if (!g || !invite.code) return;
  const map = cache.get(g);
  if (map) map.delete(invite.code);
}

function forgetGuild(guildId) {
  const g = gid(guildId);
  if (g) cache.delete(g);
}

// So sánh bộ nhớ đệm cũ với danh sách mới để tìm ra lời mời vừa được dùng.
// Trả về { inviterId, code, uses } hoặc null nếu không xác định được.
async function detectInviter(guild) {
  const g = gid(guild && guild.id);
  if (!g || !guild.invites || typeof guild.invites.fetch !== 'function') return null;

  const before = cache.get(g) || new Map();
  let after;
  try {
    after = await guild.invites.fetch();
  } catch (_) {
    return null; // thiếu quyền -> bỏ qua, không báo lỗi ra ngoài
  }

  let found = null;
  const next = new Map();

  for (const inv of after.values()) {
    const old = before.get(inv.code);
    const oldUses = old ? old.uses : 0;
    const nowUses = inv.uses || 0;
    // Lời mời mới toàn tập (không có trong cache) chỉ tính khi đã có người dùng.
    if (!found && nowUses > oldUses) {
      found = {
        code: inv.code,
        uses: nowUses,
        inviterId: inv.inviter ? String(inv.inviter.id) : '',
      };
    }
    next.set(inv.code, { uses: nowUses, inviterId: inv.inviter ? String(inv.inviter.id) : '' });
  }

  // Lời mời dùng hết lượt sẽ biến mất khỏi danh sách -> vẫn phải ghi công cho chủ lời mời.
  if (!found) {
    for (const [code, old] of before) {
      if (code.startsWith('vanity:')) continue;
      if (!next.has(code)) {
        found = { code, uses: (old.uses || 0) + 1, inviterId: old.inviterId || '' };
        break;
      }
    }
  }

  // Kiểm tra vanity URL (link rút gọn riêng của máy chủ).
  try {
    if (guild.vanityURLCode && typeof guild.fetchVanityData === 'function') {
      const vanity = await guild.fetchVanityData();
      if (vanity && vanity.code) {
        const vk = 'vanity:' + vanity.code;
        const old = before.get(vk);
        if (!found && old && (vanity.uses || 0) > (old.uses || 0)) {
          found = { code: vanity.code, uses: vanity.uses || 0, inviterId: '', vanity: true };
        }
        next.set(vk, { uses: vanity.uses || 0, inviterId: '' });
      }
    }
  } catch (_) {
    /* bỏ qua */
  }

  cache.set(g, next);
  return found;
}

// ---------- Ghi nhận số liệu ----------

// Ghi công một lượt mời thành công.
function credit(guildId, inviterId, memberId, code) {
  const data = bucket(guildId);
  if (!data) return null;
  const inviter = uid(inviterId);
  const member = uid(memberId);
  if (!member) return null;

  data.joined[member] = {
    inviter: inviter || '',
    code: String(code || '').slice(0, 32),
    at: Date.now(),
  };

  let total = 0;
  if (inviter) {
    const c = entry(data, inviter);
    c.joins += 1;
    total = c.joins - c.leaves + c.bonus;
  }
  saveBucket(guildId, data);
  return { inviterId: inviter, total: Math.max(0, total) };
}

// Khi thành viên rời đi: trả về người đã mời họ (để hiện trong embed tạm biệt)
// và trừ bớt một lượt mời còn hiệu lực.
function noteLeave(guildId, memberId) {
  const data = bucket(guildId);
  if (!data) return null;
  const member = uid(memberId);
  if (!member) return null;

  const rec = data.joined[member];
  if (!rec) return null;

  // SỬA LỖI: phải xoá bản ghi tham gia NGAY. Discord có thể bắn trùng sự kiện
  // guildMemberRemove (mất kết nối rồi nối lại, kick + ban cùng lúc...). Nếu không
  // xoá, mỗi lần bắn lại sẽ trừ thêm một lượt khiến leaves > joins và số liệu sai.
  delete data.joined[member];

  let total = 0;
  if (rec.inviter) {
    const c = entry(data, rec.inviter);
    // Không bao giờ để số lượt rời vượt quá số lượt vào.
    c.leaves = Math.min(c.joins, (Number(c.leaves) || 0) + 1);
    total = c.joins - c.leaves + c.bonus;
  }
  saveBucket(guildId, data);
  return { inviterId: rec.inviter || '', code: rec.code || '', total: Math.max(0, total), joinedAt: rec.at || 0 };
}

function getStats(guildId, userId) {
  const data = bucket(guildId);
  const u = uid(userId);
  if (!data || !u) return { joins: 0, leaves: 0, bonus: 0, total: 0 };
  const c = data.counts[u];
  if (!c) return { joins: 0, leaves: 0, bonus: 0, total: 0 };
  const joins = Number(c.joins) || 0;
  const leaves = Number(c.leaves) || 0;
  const bonus = Number(c.bonus) || 0;
  return { joins, leaves, bonus, total: Math.max(0, joins - leaves + bonus) };
}

// Ai đã mời thành viên này vào?
function getInviterOf(guildId, memberId) {
  const data = bucket(guildId);
  const m = uid(memberId);
  if (!data || !m) return null;
  const rec = data.joined[m];
  return rec ? { inviterId: rec.inviter || '', code: rec.code || '', at: rec.at || 0 } : null;
}

function leaderboard(guildId, limit) {
  const data = bucket(guildId);
  if (!data) return [];
  const max = Math.min(50, Math.max(1, Number(limit) || 10));
  return Object.keys(data.counts)
    .map((id) => Object.assign({ userId: id }, getStats(guildId, id)))
    .filter((r) => r.total > 0 || r.joins > 0)
    .sort((a, b) => b.total - a.total || b.joins - a.joins)
    .slice(0, max);
}

// Cộng / trừ lượt mời thủ công (dành cho quản trị viên).
function addBonus(guildId, userId, amount) {
  const data = bucket(guildId);
  const u = uid(userId);
  if (!data || !u) return { ok: false, error: 'Thành viên không hợp lệ.' };
  const n = Math.trunc(Number(amount));
  if (!Number.isFinite(n) || n === 0) return { ok: false, error: 'Số lượt phải là số nguyên khác 0.' };
  if (Math.abs(n) > 100000) return { ok: false, error: 'Số lượt quá lớn.' };
  const c = entry(data, u);
  c.bonus += n;
  saveBucket(guildId, data);
  return { ok: true, stats: getStats(guildId, u) };
}

function resetGuild(guildId) {
  const g = gid(guildId);
  if (!g) return { ok: false, error: 'Máy chủ không hợp lệ.' };
  store.delete(g);
  return { ok: true };
}

module.exports = {
  primeGuild,
  addInvite,
  removeInvite,
  forgetGuild,
  detectInviter,
  credit,
  noteLeave,
  getStats,
  getInviterOf,
  leaderboard,
  addBonus,
  resetGuild,
  _cache: cache,
};
