// =============================================================
//  Sự kiện: channelUpdate - làm mới khi kênh đổi tên / đổi quyền
//  (Đổi quyền rất quan trọng: bot vừa được cấp quyền "Xem kênh" thì
//   kênh đó phải xuất hiện ngay trong ô chọn kênh.)
// =============================================================
const chan = require('../core/channelResolver');

module.exports = {
  name: 'channelUpdate',
  async execute(client, _oldChannel, newChannel) {
    const guild = newChannel && newChannel.guild;
    if (!guild) return;
    await chan.fetchAllChannels(guild, { force: true }).catch(() => {});
  },
};
