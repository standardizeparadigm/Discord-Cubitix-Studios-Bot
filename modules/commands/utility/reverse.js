// =============================================================
//  Lệnh: reverse - đảo ngược chuỗi văn bản
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'reverse',
  aliases: ['daonguoc', 'rev'],
  category: 'utility',
  description: 'Đảo ngược thứ tự các ký tự trong văn bản',
  usage: '<nội dung>',
  cooldown: 3,
  slash: true,
  options: [{ name: 'nội_dung', type: 'string', description: 'Văn bản cần đảo ngược', required: true, rest: true }],
  async run(ctx) {
    const text = ctx.getString('nội_dung');
    if (!text) return ctx.reply({ embeds: [Embed.error('Thiếu nội dung', 'Hãy nhập văn bản cần đảo ngược.')] });
    // Giới hạn 3900 ký tự để không vượt mức 4096 của phần mô tả embed (đã tính cả dấu ```)
    let reversed = [...text].reverse().join('');
    if (reversed.length > 3900) reversed = reversed.slice(0, 3899) + '\u2026';
    await ctx.reply({ embeds: [Embed.custom(colors.purple, '🔄 Đảo ngược', `\`\`\`\n${reversed}\n\`\`\``)] });
  },
};
