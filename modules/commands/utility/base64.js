// =============================================================
//  Lệnh: base64 - mã hóa / giải mã chuỗi Base64
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'base64',
  aliases: ['b64'],
  category: 'utility',
  description: 'Mã hóa hoặc giải mã văn bản bằng Base64',
  usage: '<encode|decode> <nội dung>',
  cooldown: 3,
  slash: true,
  options: [
    { name: 'chế_độ', type: 'string', description: 'encode (mã hóa) hoặc decode (giải mã)', required: true },
    { name: 'nội_dung', type: 'string', description: 'Văn bản cần xử lý', required: true, rest: true },
  ],
  async run(ctx) {
    const mode = (ctx.getString('chế_độ') || '').toLowerCase();
    const text = ctx.getString('nội_dung');
    if (!text) return ctx.reply({ embeds: [Embed.error('Thiếu nội dung', 'Hãy nhập văn bản cần xử lý.')] });

    try {
      let result;
      if (['encode', 'ma', 'mahoa', 'e'].includes(mode)) {
        result = Buffer.from(text, 'utf8').toString('base64');
      } else if (['decode', 'giai', 'giaima', 'd'].includes(mode)) {
        result = Buffer.from(text, 'base64').toString('utf8');
      } else {
        return ctx.reply({ embeds: [Embed.error('Chế độ không hợp lệ', 'Hãy chọn `encode` (mã hóa) hoặc `decode` (giải mã).')] });
      }
      if (result.length > 1000) result = result.slice(0, 1000) + '...';
      await ctx.reply({ embeds: [Embed.custom(colors.aqua, '🔐 Base64', `\`\`\`\n${result}\n\`\`\``)] });
    } catch (e) {
      await ctx.reply({ embeds: [Embed.error('Xử lý thất bại', 'Chuỗi không hợp lệ hoặc không thể giải mã.')] });
    }
  },
};
