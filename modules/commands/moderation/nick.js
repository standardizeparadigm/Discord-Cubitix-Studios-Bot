// =============================================================
//  Lệnh: nick - đổi hoặc xóa biệt danh của một thành viên
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const { guardTarget } = require('../../core/modGuard');

module.exports = {
  name: 'nick',
  aliases: ['setnick', 'bietdanh', 'doibietdanh', 'nickname'],
  category: 'moderation',
  description: 'Đổi biệt danh cho thành viên (bỏ trống để xóa biệt danh)',
  usage: '<@thành_viên> [biệt danh mới]',
  cooldown: 4,
  guildOnly: true,
  permissions: ['ManageNicknames'],
  slash: true,
  options: [
    { name: 'thành_viên', type: 'user', description: 'Thành viên cần đổi biệt danh', required: true },
    { name: 'biệt_danh', type: 'string', description: 'Biệt danh mới (bỏ trống để xóa)', required: false, rest: true },
  ],
  async run(ctx) {
    const member = await ctx.getMember('thành_viên');
    // Lá chắn chung: không đổi biệt danh của người cấp cao hơn, không đổi của bot.
    // allowSelf: CHO PHÉP tự đổi biệt danh của chính mình - đây là việc vô hại,
    // Discord cũng có quyền riêng "Change Nickname" cho mục đích này.
    const guard = guardTarget(ctx, member, 'nick', { allowSelf: true });
    if (!guard.ok) return ctx.reply({ embeds: [guard.embed] });
    const isSelf = member.id === ctx.author.id;
    if (!member.manageable) {
      return ctx.reply({
        embeds: [Embed.error('Không thể đổi', isSelf
          ? 'Tôi không đủ quyền đổi biệt danh của bạn (vai trò của bạn ngang hoặc cao hơn tôi, hoặc bạn là chủ máy chủ). Bạn có thể tự đổi trực tiếp trong phần cài đặt máy chủ.'
          : 'Tôi không đủ quyền đổi biệt danh của thành viên này.')],
      });
    }

    let nick = (ctx.getString('biệt_danh') || '').trim();
    if (nick.length > 32) return ctx.reply({ embeds: [Embed.error('Quá dài', 'Biệt danh tối đa **32** ký tự.')] });

    const old = member.nickname || member.user.username;
    const ok = await member.setNickname(nick || null, `Đổi bởi ${ctx.author.tag}`).then(() => true).catch(() => false);
    if (!ok) return ctx.reply({ embeds: [Embed.error('Thất bại', 'Không thể đổi biệt danh (có thể do thứ hạng vai trò).')] });

    const embed = nick
      ? Embed.success('✏️ Đã đổi biệt danh', `**${member.user.tag}**\n\`${old}\` → \`${nick}\``)
      : Embed.custom(colors.warning, '🧹 Đã xóa biệt danh', `Đã trả **${member.user.tag}** về tên gốc.`);
    await ctx.reply({ embeds: [embed] });
  },
};
