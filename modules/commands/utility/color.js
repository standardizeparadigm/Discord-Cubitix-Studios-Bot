// =============================================================
//  Lệnh: color - xem trước một màu từ mã HEX
// =============================================================
const Embed = require('../../core/EmbedFactory');

module.exports = {
  name: 'color',
  aliases: ['mau', 'hex', 'colour'],
  category: 'utility',
  description: 'Xem trước một màu từ mã HEX (ví dụ #5865F2)',
  usage: '<mã hex>',
  cooldown: 3,
  slash: true,
  options: [{ name: 'hex', type: 'string', description: 'Mã màu HEX, ví dụ #5865F2 hoặc 5865F2', required: true }],
  async run(ctx) {
    let raw = (ctx.getString('hex') || '').trim().replace(/^#/, '');
    // Cho phép dạng rút gọn 3 ký tự (vd: f0a -> ff00aa)
    if (/^[0-9a-fA-F]{3}$/.test(raw)) raw = raw.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(raw)) {
      return ctx.reply({ embeds: [Embed.error('Mã màu không hợp lệ', 'Hãy nhập mã HEX 6 (hoặc 3) ký tự, ví dụ `#5865F2`.')] });
    }

    const hex = raw.toUpperCase();
    const int = parseInt(hex, 16);
    const r = (int >> 16) & 255;
    const g = (int >> 8) & 255;
    const b = int & 255;
    const lower = raw.toLowerCase();
    const image = 'https://dummyimage.com/360x140/' + lower + '/' + lower + '.png';

    const embed = Embed.custom(int, `🎨 Màu #${hex}`)
      .addFields(
        { name: 'HEX', value: `\`#${hex}\``, inline: true },
        { name: 'RGB', value: `\`rgb(${r}, ${g}, ${b})\``, inline: true },
        { name: 'Số nguyên', value: `\`${int}\``, inline: true },
      )
      .setImage(image);
    await ctx.reply({ embeds: [embed] });
  },
};
