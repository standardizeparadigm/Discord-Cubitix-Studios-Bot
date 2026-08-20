// =============================================================
//  Lệnh: unban - gỡ cấm (bỏ ban) một người dùng theo ID
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'unban',
  aliases: ['gocam', 'boban'],
  category: 'moderation',
  description: 'Gỡ cấm (unban) một người dùng theo ID',
  usage: '<ID người dùng> [lý do]',
  cooldown: 4,
  guildOnly: true,
  permissions: ['BanMembers'],
  slash: true,
  options: [
    { name: 'id', type: 'string', description: 'ID người dùng bị cấm', required: true },
    { name: 'lý_do', type: 'string', description: 'Lý do gỡ cấm', required: false, rest: true },
  ],
  async run(ctx) {
    if (ctx.isSlash) await ctx.defer();

    const id = (ctx.getString('id') || '').replace(/[^0-9]/g, '');
    if (!/^\d{15,20}$/.test(id)) {
      return ctx.reply({ embeds: [Embed.error('ID không hợp lệ', 'Hãy nhập đúng **ID** người dùng (dãy số). Bạn có thể xem ID trong danh sách bị cấm của máy chủ.')] });
    }

    const ban = await ctx.guild.bans.fetch(id).catch(() => null);
    if (!ban) {
      return ctx.reply({ embeds: [Embed.warn('Không tìm thấy', 'Người dùng này không nằm trong danh sách bị cấm.')] });
    }

    const reason = (ctx.getString('lý_do') || 'Không có lý do').slice(0, 400);
    const ok = await ctx.guild.bans.remove(id, reason).then(() => true).catch(() => false);
    if (!ok) return ctx.reply({ embeds: [Embed.error('Thất bại', 'Không thể gỡ cấm người dùng này.')] });

    const embed = Embed.custom(colors.success, '🔓 Đã gỡ cấm')
      .addFields(
        { name: 'Người dùng', value: `${ban.user.tag} (\`${id}\`)`, inline: false },
        { name: 'Người thực hiện', value: `${ctx.author.tag}`, inline: true },
        { name: 'Lý do', value: reason, inline: true },
      );
    await ctx.reply({ embeds: [embed] });
  },
};
