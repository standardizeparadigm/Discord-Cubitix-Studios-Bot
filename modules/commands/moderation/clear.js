// =============================================================
//  Lệnh: clear - xóa hàng loạt tin nhắn
// =============================================================
const Embed = require('../../core/EmbedFactory');

module.exports = {
  name: 'clear',
  aliases: ['purge', 'xoa', 'delete'],
  category: 'moderation',
  description: 'Xóa nhiều tin nhắn cùng lúc (1-100)',
  usage: '<số lượng>',
  cooldown: 4,
  guildOnly: true,
  permissions: ['ManageMessages'],
  slash: true,
  options: [{ name: 'số_lượng', type: 'integer', description: 'Số tin nhắn cần xóa (1-100)', required: true }],
  async run(ctx) {
    let amount = ctx.getInteger('số_lượng') || 0;
    if (amount < 1 || amount > 100) {
      return ctx.reply({ embeds: [Embed.error('Số không hợp lệ', 'Hãy nhập từ 1 đến 100.')] });
    }
    await ctx.defer(true);

    // Ở chế độ prefix, xóa luôn tin nhắn lệnh của người dùng
    if (!ctx.isSlash) await ctx.message.delete().catch(() => {});

    const deleted = await ctx.channel.bulkDelete(amount, true).catch(() => null);
    const count = deleted ? deleted.size : 0;
    const embed = Embed.success('Đã dọn dẹp', `Đã xóa **${count}** tin nhắn.\n*(Không thể xóa tin nhắn cũ hơn 14 ngày.)*`);

    if (ctx.isSlash) {
      await ctx.reply({ embeds: [embed] });
    } else {
      const m = await ctx.channel.send({ embeds: [embed] });
      setTimeout(() => m.delete().catch(() => {}), 5000);
    }
  },
};
