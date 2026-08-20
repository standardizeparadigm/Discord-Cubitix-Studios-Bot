// =============================================================
//  Lệnh: untimeout - gỡ timeout (mở chat lại) cho thành viên
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const { guardTarget } = require('../../core/modGuard');

module.exports = {
  name: 'untimeout',
  aliases: ['unmute', 'gomute', 'gophat'],
  category: 'moderation',
  description: 'Gỡ timeout cho một thành viên',
  usage: '<@thành_viên>',
  cooldown: 4,
  guildOnly: true,
  permissions: ['ModerateMembers'],
  slash: true,
  options: [{ name: 'thành_viên', type: 'user', description: 'Thành viên cần gỡ timeout', required: true }],
  async run(ctx) {
    const member = await ctx.getMember('thành_viên');
    // Lá chắn chung: không tự gỡ cho mình, không đụng người có vai trò ngang/cao hơn.
    const guard = guardTarget(ctx, member, 'untimeout');
    if (!guard.ok) return ctx.reply({ embeds: [guard.embed] });
    if (!member.isCommunicationDisabled()) {
      return ctx.reply({ embeds: [Embed.info('Không cần thiết', `${member.user.tag} hiện không bị timeout.`)] });
    }

    const ok = await member.timeout(null, `Gỡ timeout bởi ${ctx.author.tag}`).then(() => true).catch(() => false);
    if (!ok) return ctx.reply({ embeds: [Embed.error('Thất bại', 'Không thể gỡ timeout thành viên này.')] });

    await ctx.reply({ embeds: [Embed.custom(colors.success, '🔈 Đã gỡ timeout', `${member.user.tag} có thể chat trở lại.`)] });
  },
};
