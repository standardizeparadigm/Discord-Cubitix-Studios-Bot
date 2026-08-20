// =============================================================
//  Lệnh: membercount - thống kê số lượng thành viên
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const { progressBar } = require('../../core/Animator');

module.exports = {
  name: 'membercount',
  aliases: ['mc', 'sothanhvien'],
  category: 'info',
  description: 'Xem số lượng thành viên (người thật / bot) của máy chủ',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    // Tải danh sách thành viên có thể lâu hơn 3 giây ở máy chủ lớn.
    if (ctx.isSlash) await ctx.defer();

    const g = ctx.guild;
    await g.members.fetch().catch(() => {});
    const total = g.memberCount;
    const bots = g.members.cache.filter((m) => m.user.bot).size;
    const humans = total - bots;
    const pct = total ? Math.round((humans / total) * 100) : 0;

    const embed = Embed.custom(colors.info, `👥 Thành viên — ${g.name}`)
      .setThumbnail(g.iconURL({ size: 256 }))
      .setDescription(`Tỉ lệ người thật:\n${progressBar(pct)} **${pct}%**`)
      .addFields(
        { name: '📊 Tổng cộng', value: `**${total.toLocaleString('vi-VN')}**`, inline: true },
        { name: '👤 Người thật', value: `**${humans.toLocaleString('vi-VN')}**`, inline: true },
        { name: '🤖 Bot', value: `**${bots.toLocaleString('vi-VN')}**`, inline: true },
      );
    await ctx.reply({ embeds: [embed] });
  },
};
