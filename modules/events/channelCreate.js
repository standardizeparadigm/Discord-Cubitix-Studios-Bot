// =============================================================
//  Sự kiện: channelCreate
//  Khi bạn tạo kênh mới, ta làm mới ngay bộ nhớ đệm kênh của máy chủ
//  để các lệnh slash có ô chọn kênh thấy kênh mới NGAY LẬP TỨC.
// =============================================================
const chan = require('../core/channelResolver');

module.exports = {
  name: 'channelCreate',
  async execute(client, channel) {
    if (!channel || !channel.guild) return;
    await chan.fetchAllChannels(channel.guild, { force: true }).catch(() => {});
    client.logger?.info?.(`Kênh mới: #${channel.name} (${channel.guild.name}) — đã cập nhật danh sách kênh.`);
  },
};
