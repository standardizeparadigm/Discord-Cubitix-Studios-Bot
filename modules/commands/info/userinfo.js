// =============================================================
//  Lệnh: userinfo - thông tin thành viên
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'userinfo',
  aliases: ['user', 'whois', 'thongtin'],
  category: 'info',
  description: 'Xem thông tin của một thành viên',
  usage: '[@thành_viên]',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  options: [{ name: 'thành_viên', type: 'user', description: 'Thành viên muốn xem (bỏ trống = chính bạn)', required: false }],
  async run(ctx) {
    if (ctx.isSlash) await ctx.defer();

    const user = ctx.getUser('thành_viên') || ctx.author;
    const member = await ctx.guild.members.fetch(user.id).catch(() => null);

    const roles = member
      ? member.roles.cache.filter((r) => r.id !== ctx.guild.id).sort((a, b) => b.position - a.position).map((r) => r.toString())
      : [];

    // Ghép vai trò nhưng không vượt 1024 ký tự (giới hạn một trường embed)
    let roleText = 'Không có';
    if (roles.length) {
      const shown = [];
      let used = 0;
      for (const r of roles.slice(0, 15)) {
        if (used + r.length + 1 > 990) break;
        shown.push(r);
        used += r.length + 1;
      }
      const hidden = roles.length - shown.length;
      roleText = shown.length ? shown.join(' ') + (hidden > 0 ? ` … +${hidden}` : '') : `${roles.length} vai trò`;
    }

    const embed = Embed.custom(member?.displayHexColor && member.displayHexColor !== '#000000' ? member.displayHexColor : colors.primary, `👤 Thông tin: ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🏷️ Tên đầy đủ', value: `${user.tag}`, inline: true },
        { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
        { name: '🤖 Là bot?', value: user.bot ? 'Có' : 'Không', inline: true },
        { name: '📅 Tạo tài khoản', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      );
    if (member) {
      embed.addFields(
        { name: '📥 Tham gia máy chủ', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Không rõ', inline: true },
        { name: '🎭 Biệt danh', value: member.nickname || 'Không có', inline: true },
        { name: `🎖️ Vai trò (${roles.length})`, value: roleText },
      );
    }
    await ctx.reply({ embeds: [embed] });
  },
};
