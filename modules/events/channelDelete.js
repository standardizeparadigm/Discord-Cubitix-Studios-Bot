// =============================================================
//  Sự kiện: channelDelete - làm mới danh sách kênh khi có kênh bị xoá
// =============================================================
const chan = require('../core/channelResolver');

module.exports = {
  name: 'channelDelete',
  async execute(client, channel) {
    if (!channel || !channel.guild) return;
    await chan.fetchAllChannels(channel.guild, { force: true }).catch(() => {});
  },
};
