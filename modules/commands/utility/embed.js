// =============================================================
//  Lệnh: embed - tạo một embed tùy chỉnh nhanh
//  Cú pháp: embed Tiêu đề | Nội dung | #mau (tùy chọn)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'embed',
  aliases: ['emb', 'taoembed'],
  category: 'utility',
  description: 'Tạo embed tùy chỉnh (ngăn cách bằng dấu |)',
  usage: 'Tiêu đề | Nội dung | #mau',
  cooldown: 4,
  guildOnly: true,
  slash: true,
  options: [{ name: 'nội_dung', type: 'string', description: 'Tiêu đề | Nội dung | #mau (tùy chọn)', required: true, rest: true }],
  async run(ctx) {
    const raw = ctx.getString('nội_dung') || '';
    const parts = raw.split('|').map((s) => s.trim());
    // Cắt theo đúng giới hạn của Discord: tiêu đề 256, mô tả 4096
    const title = (parts[0] || 'Không có tiêu đề').slice(0, 256);
    const body = (parts[1] || '').slice(0, 4096);
    const colorInput = parts[2];

    let color = colors.primary;
    if (colorInput && /^#?[0-9a-fA-F]{6}$/.test(colorInput)) {
      color = parseInt(colorInput.replace('#', ''), 16);
    }

    const embed = Embed.custom(color, title, body || null)
      .setFooter({ text: `Tạo bởi ${ctx.author.tag}` });

    // Ở chế độ prefix: xóa tin lệnh rồi gửi mới (không reply vào tin đã xóa).
    if (!ctx.isSlash) {
      await ctx.message.delete().catch(() => {});
      return ctx.send({ embeds: [embed] });
    }
    await ctx.reply({ embeds: [embed] });
  },
};
