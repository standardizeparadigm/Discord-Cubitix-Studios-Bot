// =============================================================
//  Lệnh: roles - liệt kê toàn bộ vai trò của máy chủ
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');

module.exports = {
  name: 'roles',
  aliases: ['rolelist', 'danhsachrole', 'listroles'],
  category: 'info',
  description: 'Liệt kê tất cả vai trò trong máy chủ (kèm số thành viên)',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    // Tải danh sách thành viên có thể lâu hơn 3 giây ở máy chủ lớn.
    if (ctx.isSlash) await ctx.defer();

    await ctx.guild.members.fetch().catch(() => {});
    const roles = [...ctx.guild.roles.cache.values()]
      .filter((r) => r.id !== ctx.guild.id) // bỏ @everyone
      .sort((a, b) => b.position - a.position);

    if (!roles.length) return ctx.reply({ embeds: [Embed.info('Không có vai trò', 'Máy chủ này chưa có vai trò nào.')] });

    // Ghép thành nhiều dòng, tránh vượt giới hạn ký tự của Discord
    const lines = roles.map((r) => `<@&${r.id}> — **${r.members.size}** thành viên`);
    const chunks = [];
    let buf = '';
    for (const line of lines) {
      // Chỉ ngắt khi buf đã có nội dung — tránh đẩy vào một ô rỗng (Discord từ chối)
      if (buf && (buf + line).length > 1000) { chunks.push(buf); buf = ''; }
      buf += line + '\n';
    }
    if (buf) chunks.push(buf);
    if (!chunks.length) chunks.push('Không có vai trò nào.');

    const embed = Embed.custom(colors.info, `🎭 Vai trò của ${ctx.guild.name} (${roles.length})`)
      .setDescription(chunks[0])
      .setFooter({ text: `${emoji.dot} Sắp xếp theo thứ hạng từ cao xuống thấp` });
    for (let i = 1; i < chunks.length && i < 6; i++) embed.addFields({ name: '\u200b', value: chunks[i] });
    await ctx.reply({ embeds: [embed] });
  },
};
