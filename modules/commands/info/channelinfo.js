// =============================================================
//  Lệnh: channelinfo - xem thông tin một kênh
// =============================================================
const { ChannelType } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

const TYPE_LABEL = {
  [ChannelType.GuildText]: '💬 Kênh văn bản',
  [ChannelType.GuildVoice]: '🔊 Kênh thoại',
  [ChannelType.GuildCategory]: '📁 Danh mục',
  [ChannelType.GuildAnnouncement]: '📢 Kênh thông báo',
  [ChannelType.AnnouncementThread]: '🧵 Luồng thông báo',
  [ChannelType.PublicThread]: '🧵 Luồng công khai',
  [ChannelType.PrivateThread]: '🔐 Luồng riêng tư',
  [ChannelType.GuildStageVoice]: '🎤 Kênh sân khấu',
  [ChannelType.GuildForum]: '🗂️ Kênh diễn đàn',
};

module.exports = {
  name: 'channelinfo',
  aliases: ['ch', 'kenh', 'channel'],
  category: 'info',
  description: 'Xem thông tin chi tiết của một kênh',
  usage: '[#kênh]',
  cooldown: 4,
  guildOnly: true,
  slash: true,
  // Ô gợi ý tự làm mới: liệt kê ĐẦY ĐỦ mọi kênh (kể cả danh mục, diễn đàn, luồng) và cập nhật ngay khi tạo kênh mới.
  options: [{ name: 'kênh', type: 'string', channelPicker: true, autocomplete: true, description: 'Kênh muốn xem (gõ để tìm, bỏ trống = kênh hiện tại)', required: false }],
  async run(ctx) {
    const channel = (await ctx.getChannelAsync('kênh')) || ctx.channel;
    if (!channel) return ctx.reply({ embeds: [Embed.error('Không tìm thấy kênh', 'Hãy chọn một kênh hợp lệ.')] });

    // Một số loại kênh không có createdTimestamp -> tránh in ra NaN
    const created = channel.createdTimestamp ? Math.floor(channel.createdTimestamp / 1000) : null;
    const embed = Embed.custom(colors.info, `📋 Thông tin kênh: ${channel.name}`)
      .addFields(
        { name: 'Tên', value: `${channel}`, inline: true },
        { name: 'ID', value: `\`${channel.id}\``, inline: true },
        { name: 'Loại', value: TYPE_LABEL[channel.type] || 'Khác', inline: true },
        { name: 'Ngày tạo', value: created ? `<t:${created}:D> (<t:${created}:R>)` : 'Không rõ', inline: false },
      );

    if (typeof channel.position === 'number') embed.addFields({ name: 'Vị trí', value: `${channel.position}`, inline: true });
    if (channel.rateLimitPerUser) embed.addFields({ name: 'Chế độ chậm', value: `${channel.rateLimitPerUser}s`, inline: true });
    if (typeof channel.nsfw === 'boolean') embed.addFields({ name: 'NSFW', value: channel.nsfw ? 'Có' : 'Không', inline: true });
    if (channel.topic) embed.addFields({ name: 'Chủ đề', value: channel.topic.slice(0, 500) });

    await ctx.reply({ embeds: [embed] });
  },
};
