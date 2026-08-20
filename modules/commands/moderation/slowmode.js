// =============================================================
//  Lệnh: slowmode - đặt chế độ chậm cho kênh
// =============================================================
const Embed = require('../../core/EmbedFactory');

module.exports = {
  name: 'slowmode',
  aliases: ['slow', 'chamlai'],
  category: 'moderation',
  description: 'Đặt chế độ chậm (giây) cho kênh hiện tại (0 = tắt)',
  usage: '<số giây>',
  cooldown: 4,
  guildOnly: true,
  permissions: ['ManageChannels'],
  slash: true,
  options: [{ name: 'số_giây', type: 'integer', description: 'Số giây chờ giữa các tin (0-21600)', required: true }],
  async run(ctx) {
    let seconds = ctx.getInteger('số_giây');
    if (seconds === null || seconds < 0 || seconds > 21600) {
      return ctx.reply({ embeds: [Embed.error('Số không hợp lệ', 'Hãy nhập từ 0 đến 21600 giây (6 giờ).')] });
    }
    if (!ctx.channel || typeof ctx.channel.setRateLimitPerUser !== 'function') {
      return ctx.reply({ embeds: [Embed.error('Không hỗ trợ', 'Loại kênh này không dùng được chế độ chậm.')] });
    }
    try {
      await ctx.channel.setRateLimitPerUser(seconds);
    } catch (err) {
      return ctx.reply({ embeds: [Embed.error('Đặt chế độ chậm thất bại', `Không thay đổi được kênh này.\nLý do: ${err.message}\n\nHãy chắc chắn bot có quyền **Quản lý kênh**.`)] });
    }
    const embed = seconds === 0
      ? Embed.success('Đã tắt chế độ chậm', 'Kênh này đã trở lại bình thường.')
      : Embed.success('Đã bật chế độ chậm', `Mỗi thành viên phải chờ **${seconds}s** giữa các tin nhắn.`);
    await ctx.reply({ embeds: [embed] });
  },
};
