// =============================================================
//  Lệnh: roleinfo - xem thông tin chi tiết một vai trò (role)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'roleinfo',
  aliases: ['role', 'vaitro', 'thongtinrole'],
  category: 'info',
  description: 'Xem thông tin chi tiết của một vai trò',
  usage: '<@vai_trò>',
  cooldown: 4,
  guildOnly: true,
  slash: true,
  options: [{ name: 'vai_trò', type: 'role', description: 'Vai trò muốn xem', required: true }],
  async run(ctx) {
    const role = ctx.getRole('vai_trò');
    if (!role) return ctx.reply({ embeds: [Embed.error('Không tìm thấy', 'Hãy nhắc tên (mention) một vai trò.')] });

    // Đếm số thành viên có vai trò này (cần cache thành viên)
    await ctx.guild.members.fetch().catch(() => {});
    const memberCount = role.members.size;
    const hexColor = role.hexColor && role.hexColor !== '#000000' ? role.hexColor : colors.primary;

    const keyPerms = role.permissions.has('Administrator')
      ? 'Quản trị viên (toàn quyền)'
      : role.permissions.toArray().slice(0, 6).join(', ') || 'Không có quyền đặc biệt';

    const embed = Embed.custom(hexColor, `🎭 Vai trò: ${role.name}`)
      .addFields(
        { name: '🆔 ID', value: `\`${role.id}\``, inline: true },
        { name: '🎨 Màu', value: `\`${role.hexColor}\``, inline: true },
        { name: '👥 Số thành viên', value: `${memberCount}`, inline: true },
        { name: '📍 Vị trí', value: `${role.position}`, inline: true },
        { name: '📌 Hiển thị riêng', value: role.hoist ? 'Có' : 'Không', inline: true },
        { name: '🔔 Cho phép nhắc', value: role.mentionable ? 'Có' : 'Không', inline: true },
        { name: '🤖 Do tích hợp quản lý', value: role.managed ? 'Có' : 'Không', inline: true },
        { name: '📅 Tạo ngày', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:D>`, inline: true },
        { name: '🔑 Quyền chính', value: keyPerms, inline: false },
      );
    await ctx.reply({ embeds: [embed] });
  },
};
