// =============================================================
//  Lệnh: ban - cấm thành viên khỏi máy chủ
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { guardTarget } = require('../../core/modGuard');

module.exports = {
  name: 'ban',
  aliases: ['cam'],
  category: 'moderation',
  description: 'Cấm (ban) một thành viên khỏi máy chủ',
  usage: '<@thành_viên> [lý do]',
  cooldown: 4,
  guildOnly: true,
  permissions: ['BanMembers'],
  slash: true,
  options: [
    { name: 'thành_viên', type: 'user', description: 'Thành viên cần cấm', required: true },
    { name: 'lý_do', type: 'string', description: 'Lý do cấm', required: false, rest: true },
  ],
  async run(ctx) {
    const member = await ctx.getMember('thành_viên');
    const targetUser = await ctx.getUser('thành_viên');
    // Discord: lý do audit-log tối đa 512 ký tự, field embed tối đa 1024 ký tự.
    const reason = (ctx.getString('lý_do') || 'Không có lý do').slice(0, 400);
    // Lá chắn chung: tự cấm mình / cấm bot / cấm chủ máy chủ / cấm người cấp cao hơn.
    // Trường hợp người cần cấm KHÔNG còn trong máy chủ (đã rời/đã bị kiệu):
    // vẫn cho phép cấm theo ID (hack-ban) thay vì báo lỗi.
    if (!member && targetUser) {
      if (targetUser.id === ctx.author.id) {
        return ctx.reply({ embeds: [Embed.error('Không thể cấm', 'Bạn không thể tự cấm chính mình.')] });
      }
      if (targetUser.id === ctx.client.user.id) {
        return ctx.reply({ embeds: [Embed.error('Không thể cấm', 'Tôi không thể tự cấm chính mình.')] });
      }
      const banned = await ctx.guild.bans.fetch(targetUser.id).catch(() => null);
      if (banned) {
        return ctx.reply({ embeds: [Embed.error('Đã bị cấm trước đó', `**${targetUser.tag}** hiện đã nằm trong danh sách cấm.`)] });
      }
      const okId = await ctx.guild.bans.create(targetUser.id, { reason }).then(() => true).catch(() => false);
      if (!okId) {
        return ctx.reply({ embeds: [Embed.error('Thất bại', 'Không cấm được người này. Hãy kiểm tra quyền **Cấm thành viên** của bot.')] });
      }
      const eId = Embed.custom(Embed.colors.error, '🔨 Đã cấm theo ID')
        .addFields(
          { name: 'Người dùng', value: `${targetUser.tag} (\`${targetUser.id}\`)`, inline: true },
          { name: 'Người thực hiện', value: `${ctx.author.tag}`, inline: true },
          { name: 'Lý do', value: reason },
        )
        .setFooter({ text: 'Người này không còn trong máy chủ nên được cấm thẳng theo ID' });
      return ctx.reply({ embeds: [eId] });
    }

    const guard = guardTarget(ctx, member, 'ban');
    if (!guard.ok) return ctx.reply({ embeds: [guard.embed] });
    if (!member.bannable) return ctx.reply({ embeds: [Embed.error('Không thể cấm', 'Tôi không đủ quyền để cấm thành viên này.')] });

    const ok = await member.ban({ reason }).then(() => true).catch(() => false);
    if (!ok) return ctx.reply({ embeds: [Embed.error('Thất bại', 'Không thể cấm thành viên này. Có thể do thứ bậc vai trò hoặc quyền của bot.')] });
    const embed = Embed.custom(Embed.colors.error, '🔨 Đã cấm thành viên')
      .addFields(
        { name: 'Thành viên', value: `${member.user.tag}`, inline: true },
        { name: 'Người thực hiện', value: `${ctx.author.tag}`, inline: true },
        { name: 'Lý do', value: reason },
      );
    await ctx.reply({ embeds: [embed] });
  },
};
