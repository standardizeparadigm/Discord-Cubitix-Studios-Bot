// =============================================================
//  Lệnh: giverole - gắn hoặc gỡ một vai trò cho thành viên (bật/tắt)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const { guardTarget } = require('../../core/modGuard');

module.exports = {
  name: 'giverole',
  aliases: ['setrole', 'addrole', 'togglerole', 'themrole'],
  category: 'moderation',
  description: 'Gắn hoặc gỡ một vai trò cho thành viên (tự động bật/tắt)',
  usage: '<@thành_viên> <@vai_trò>',
  cooldown: 4,
  guildOnly: true,
  permissions: ['ManageRoles'],
  slash: true,
  options: [
    { name: 'thành_viên', type: 'user', description: 'Thành viên nhận/bỏ vai trò', required: true },
    { name: 'vai_trò', type: 'role', description: 'Vai trò cần gắn hoặc gỡ', required: true },
  ],
  async run(ctx) {
    const member = await ctx.getMember('thành_viên');
    // Lá chắn chung: chặn đụng vào người có vai trò ngang/cao hơn, chặn đụng vào bot.
    // allowSelf: CHO PHÉP tự gắn/gỡ vai trò cho chính mình, NHƯNG ngay bên dưới
    // vẫn có chốt chống tự nâng quyền: chỉ được tự gắn vai trò THẤP HƠN
    // vai trò cao nhất của chính mình.
    const guard = guardTarget(ctx, member, 'giverole', { allowSelf: true });
    if (!guard.ok) return ctx.reply({ embeds: [guard.embed] });
    const role = ctx.getRole('vai_trò');
    if (!role) return ctx.reply({ embeds: [Embed.error('Không tìm thấy', 'Hãy nhắc tên (mention) một vai trò.')] });

    // Kiểm tra thứ hạng: bot phải cao hơn vai trò và vai trò phải sửa được
    const me = ctx.guild.members.me;
    if (role.managed) return ctx.reply({ embeds: [Embed.error('Không thể gắn', 'Vai trò này do tích hợp quản lý, không thể gắn thủ công.')] });
    if (role.id === ctx.guild.id) return ctx.reply({ embeds: [Embed.error('Không thể gắn', 'Không thể gắn vai trò @everyone.')] });
    if (me && role.position >= me.roles.highest.position) {
      return ctx.reply({ embeds: [Embed.error('Không đủ quyền', 'Vai trò này ngang hoặc cao hơn vai trò cao nhất của tôi.')] });
    }

    // --- Chốt chống tự nâng quyền ---
    // Được phép tự thao tác với chính mình, nhưng không được tự gắn một vai trò
    // ngang hoặc cao hơn vai trò cao nhất hiện có của mình. Thiếu chốt này thì
    // bất kỳ ai có quyền Manage Roles đều có thể tự biến mình thành quản trị viên.
    // Chủ máy chủ được miễn vì vốn dĩ đã toàn quyền.
    const isSelf = member.id === ctx.author.id;
    const isGuildOwner = ctx.author.id === ctx.guild.ownerId;
    const actorTop = ctx.member?.roles?.highest?.position;
    if (isSelf && !isGuildOwner && typeof actorTop === 'number' && role.position >= actorTop) {
      return ctx.reply({
        embeds: [Embed.error('Không thể tự nâng quyền',
          'Bạn chỉ có thể tự gắn cho mình những vai trò **thấp hơn** vai trò cao nhất của bạn. Hãy nhờ người có cấp cao hơn gắn giúp.')],
      });
    }

    const has = member.roles.cache.has(role.id);
    const reason = `${has ? 'Gỡ' : 'Gắn'} bởi ${ctx.author.tag}`;
    const ok = await (has ? member.roles.remove(role, reason) : member.roles.add(role, reason)).then(() => true).catch(() => false);
    if (!ok) return ctx.reply({ embeds: [Embed.error('Thất bại', 'Không thể thay đổi vai trò của thành viên này.')] });

    const embed = has
      ? Embed.custom(colors.warning, '➖ Đã gỡ vai trò', `Đã gỡ <@&${role.id}> khỏi **${member.user.tag}**.`)
      : Embed.success('➕ Đã gắn vai trò', `Đã gắn <@&${role.id}> cho **${member.user.tag}**.`);
    await ctx.reply({ embeds: [embed] });
  },
};
