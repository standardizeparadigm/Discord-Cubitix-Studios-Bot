// =============================================================
//  Lệnh: qrcode - tạo mã QR từ văn bản hoặc đường dẫn
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');

module.exports = {
  name: 'qrcode',
  aliases: ['qr', 'mavach', 'maqr'],
  category: 'utility',
  description: 'Tạo mã QR từ văn bản hoặc đường dẫn (URL)',
  usage: '<nội dung / URL>',
  cooldown: 4,
  slash: true,
  options: [{ name: 'nội_dung', type: 'string', description: 'Nội dung hoặc URL cần tạo mã QR', required: true, rest: true }],
  async run(ctx) {
    const text = ctx.getString('nội_dung');
    if (!text) return ctx.reply({ embeds: [Embed.error('Thiếu nội dung', 'Hãy nhập văn bản hoặc URL cần tạo mã QR.')] });
    if (text.length > 900) return ctx.reply({ embeds: [Embed.error('Nội dung quá dài', 'Tối đa 900 ký tự.')] });

    const url = 'https://api.qrserver.com/v1/create-qr-code/?size=350x350&margin=12&data=' + encodeURIComponent(text);
    const embed = Embed.custom(colors.dark, `${emoji.sparkles} Mã QR của bạn`)
      .setDescription(`Nội dung:\n> ${text.length > 200 ? text.slice(0, 200) + '…' : text}`)
      .setImage(url);
    await ctx.reply({ embeds: [embed] });
  },
};
