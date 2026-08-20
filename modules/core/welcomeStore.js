// =============================================================
//  welcomeStore - lưu cài đặt Chào mừng / Tạm biệt cho TỪNG máy chủ
//  Dữ liệu nằm ở data/welcome.json (tự tạo, không cần cài gì thêm)
//
//  Mỗi máy chủ có thể tự bật/tắt và chọn kênh riêng.
//  Nếu máy chủ chưa cấu hình gì thì bot dùng giá trị mặc định trong .env.
// =============================================================
const { JsonStore } = require('./Database');

const store = new JsonStore('welcome.json', {});

function key(guildId) {
  const id = String(guildId == null ? '' : guildId).trim();
  return /^\d{15,25}$/.test(id) ? id : '';
}

function toChannelId(value) {
  const raw = String(value == null ? '' : value).trim();
  // Chấp nhận cả dạng nhắc kênh <#123...> lẫn ID trần.
  const m = /^<#(\d{15,25})>$/.exec(raw);
  const id = m ? m[1] : raw;
  return /^\d{15,25}$/.test(id) ? id : '';
}

// Đọc phần ghi đè thô của một máy chủ (chưa gộp với .env).
function raw(guildId) {
  const k = key(guildId);
  if (!k) return {};
  const data = store.get(k, null);
  return data && typeof data === 'object' ? data : {};
}

function write(guildId, patch) {
  const k = key(guildId);
  if (!k) return { ok: false, error: 'Máy chủ không hợp lệ.' };
  const next = Object.assign({}, raw(k), patch);
  // Dọn các khoá rỗng để file JSON luôn gọn gàng.
  for (const name of Object.keys(next)) {
    if (next[name] === null || next[name] === undefined || next[name] === '') delete next[name];
  }
  if (Object.keys(next).length === 0) store.delete(k);
  else store.set(k, next);
  return { ok: true, settings: next };
}

// Gộp cài đặt của máy chủ với mặc định trong .env -> cài đặt đang thực sự có hiệu lực.
function resolve(guildId, config) {
  const cfg = config || {};
  const o = raw(guildId);
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : Boolean(fallback));

  const welcomeChannelId = toChannelId(o.welcomeChannelId) || toChannelId(cfg.welcomeChannelId);
  const goodbyeChannelId = toChannelId(o.goodbyeChannelId) || toChannelId(cfg.goodbyeChannelId) || welcomeChannelId;

  return {
    // Chỉ chạy khi vừa được bật, vừa có kênh hợp lệ.
    welcomeEnabled: bool(o.welcomeEnabled, cfg.welcomeEnabled),
    goodbyeEnabled: bool(o.goodbyeEnabled, cfg.goodbyeEnabled),
    inviteTracking: bool(o.inviteTracking, cfg.inviteTracking),
    welcomeChannelId,
    goodbyeChannelId,
    // Cho biết kênh đang lấy từ máy chủ hay từ .env (dùng để hiển thị trong bảng cài đặt).
    welcomeChannelCustom: Boolean(toChannelId(o.welcomeChannelId)),
    goodbyeChannelCustom: Boolean(toChannelId(o.goodbyeChannelId)),
    welcomeOverridden: typeof o.welcomeEnabled === 'boolean',
    goodbyeOverridden: typeof o.goodbyeEnabled === 'boolean',
    inviteOverridden: typeof o.inviteTracking === 'boolean',
  };
}

module.exports = {
  raw,
  resolve,
  toChannelId,

  setWelcomeEnabled(guildId, on) {
    return write(guildId, { welcomeEnabled: Boolean(on) });
  },
  setGoodbyeEnabled(guildId, on) {
    return write(guildId, { goodbyeEnabled: Boolean(on) });
  },
  setInviteTracking(guildId, on) {
    return write(guildId, { inviteTracking: Boolean(on) });
  },
  setBoth(guildId, on) {
    return write(guildId, { welcomeEnabled: Boolean(on), goodbyeEnabled: Boolean(on) });
  },
  setWelcomeChannel(guildId, channelId) {
    const id = toChannelId(channelId);
    if (channelId && !id) return { ok: false, error: 'ID kênh không hợp lệ.' };
    return write(guildId, { welcomeChannelId: id });
  },
  setGoodbyeChannel(guildId, channelId) {
    const id = toChannelId(channelId);
    if (channelId && !id) return { ok: false, error: 'ID kênh không hợp lệ.' };
    return write(guildId, { goodbyeChannelId: id });
  },
  // Xoá mọi tuỳ chỉnh -> quay về đúng như .env.
  reset(guildId) {
    const k = key(guildId);
    if (!k) return { ok: false, error: 'Máy chủ không hợp lệ.' };
    store.delete(k);
    return { ok: true };
  },
  all() {
    return store.all();
  },
};
