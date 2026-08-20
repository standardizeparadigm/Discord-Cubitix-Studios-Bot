// =============================================================
//  Lệnh: unlock - mở khóa kênh
// =============================================================
const Embed = require('../../core/EmbedFactory');

module.exports = {
  name: 'unlock',
  aliases: ['mokhoa', 'mokenh'],
  category: 'moderation',
  description: 'Mở khóa kênh hiện tại (cho phép gửi tin nhắn)',
  cooldown: 4,
  guildOnly: true,
  permissions: ['ManageChannels'],
  slash: true,
  async run(ctx) {
    const everyone = ctx.guild.roles.everyone;
    if (!ctx.channel || !ctx.channel.permissionOverwrites) {
      return ctx.reply({ embeds: [Embed.error('Không hỗ trợ', 'Loại kênh này không thể mở khóa bằng lệnh.')] });
    }
    try {
      await ctx.channel.permissionOverwrites.edit(everyone, { SendMessages: null });
    } catch (err) {
      return ctx.reply({ embeds: [Embed.error('Mở khóa thất bại', `Không sửa được quyền của kênh này.\nLý do: ${err.message}\n\nHãy chắc chắn bot có quyền **Quản lý kênh** và vai trò của bot đủ cao.`)] });
    }
    await ctx.reply({ embeds: [Embed.success('🔓 Đã mở khóa kênh', `Kênh ${ctx.channel} đã trở lại bình thường. Mọi người có thể chat lại.`)] });
  },
};
