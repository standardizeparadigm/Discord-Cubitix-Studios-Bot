// =============================================================
//  afkStore - lưu trạng thái AFK (tạm vắng) của thành viên
//  Dữ liệu lưu vào data/afk.json để không mất khi khởi động lại.
// =============================================================
const db = require('./Database');

const store = new db.JsonStore('afk.json', {});
const key = (guildId, userId) => `${guildId}:${userId}`;

module.exports = {
  set(guildId, userId, reason) {
    store.set(key(guildId, userId), { reason, since: Date.now() });
  },
  get(guildId, userId) {
    return store.get(key(guildId, userId), null);
  },
  clear(guildId, userId) {
    store.delete(key(guildId, userId));
  },
};
