// =============================================================
//  Sự kiện: guildCreate - bot vừa được thêm vào một máy chủ mới
//  Nạp sẵn danh sách lời mời để tính năng đếm lượt mời hoạt động ngay.
// =============================================================
const inviteStore = require('../core/inviteStore');

module.exports = {
  name: 'guildCreate',
  async execute(client, guild) {
    try {
      if (!guild) return;
      client.logger?.info?.('Đã tham gia máy chủ mới: ' + guild.name + ' (' + guild.id + ')');
      const n = await inviteStore.primeGuild(guild);
      if (n) client.logger?.info?.('Đã nạp ' + n + ' lời mời của "' + guild.name + '".');
    } catch (_) {
      /* không để lỗi nhỏ làm ảnh hưởng bot */
    }
  },
};
