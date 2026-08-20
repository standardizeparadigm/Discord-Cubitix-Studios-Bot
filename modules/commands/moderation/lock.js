// =============================================================
//  Lệnh: lock - khóa kênh (không cho @everyone gửi tin)
// =============================================================
const Embed = require('../../core/EmbedFactory');

module.exports = {
  name: 'lock',
  aliases: ['khoa', 'khoakenh'],
  category: 'moderation',
  description: 'Khóa kênh hiện tại (chặn gửi tin nhắn)',
  cooldown: 4,
  guildOnly: true,
  permissions: ['ManageChannels'],
  slash: true,
  async run(ctx) {
    const everyone = ctx.guild.roles.everyone;
    if (!ctx.channel || !ctx.channel.permissionOverwrites) {
      return ctx.reply({ embeds: [Embed.error('Không hỗ trợ', 'Loại kênh này không thể khóa bằng lệnh.')] });
    }
    try {
      await ctx.channel.permissionOverwrites.edit(everyone, { SendMessages: false });
    } catch (err) {
      return ctx.reply({ embeds: [Embed.error('Khóa kênh thất bại', `Không sửa được quyền của kênh này.\nLý do: ${err.message}\n\nHãy chắc chắn bot có quyền **Quản lý kênh** và vai trò của bot đủ cao.`)] });
    }
    await ctx.reply({ embeds: [Embed.custom(Embed.colors.error, '🔒 Đã khóa kênh', `Kênh ${ctx.channel} đã bị khóa. Thành viên không thể gửi tin nhắn.`)] });
  },
};
