// =============================================================
//  Lệnh: kick - đuổi thành viên khỏi máy chủ
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { guardTarget } = require('../../core/modGuard');

module.exports = {
  name: 'kick',
  aliases: ['duoi'],
  category: 'moderation',
  description: 'Đuổi (kick) một thành viên khỏi máy chủ',
  usage: '<@thành_viên> [lý do]',
  cooldown: 4,
  guildOnly: true,
  permissions: ['KickMembers'],
  slash: true,
  options: [
    { name: 'thành_viên', type: 'user', description: 'Thành viên cần đuổi', required: true },
    { name: 'lý_do', type: 'string', description: 'Lý do đuổi', required: false, rest: true },
  ],
  async run(ctx) {
    const member = await ctx.getMember('thành_viên');
    const reason = (ctx.getString('lý_do') || 'Không có lý do').slice(0, 400);
    // Lá chắn chung: tự đuổi mình / đuổi bot / đuổi chủ máy chủ / đuổi người cấp cao hơn.
    const guard = guardTarget(ctx, member, 'kick');
    if (!guard.ok) return ctx.reply({ embeds: [guard.embed] });
    if (!member.kickable) return ctx.reply({ embeds: [Embed.error('Không thể đuổi', 'Tôi không đủ quyền để đuổi thành viên này.')] });

    const ok = await member.kick(reason).then(() => true).catch(() => false);
    if (!ok) return ctx.reply({ embeds: [Embed.error('Thất bại', 'Không thể đuổi thành viên này. Có thể do thứ bậc vai trò hoặc quyền của bot.')] });
    const embed = Embed.custom(Embed.colors.orange, '👢 Đã đuổi thành viên')
      .addFields(
        { name: 'Thành viên', value: `${member.user.tag}`, inline: true },
        { name: 'Người thực hiện', value: `${ctx.author.tag}`, inline: true },
        { name: 'Lý do', value: reason },
      );
    await ctx.reply({ embeds: [embed] });
  },
};
