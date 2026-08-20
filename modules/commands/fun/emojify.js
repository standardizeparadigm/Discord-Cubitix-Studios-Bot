// =============================================================
//  Lệnh: emojify - biến chữ thường thành chữ emoji (regional indicator)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

const KEYCAPS = ['0\uFE0F\u20E3', '1\uFE0F\u20E3', '2\uFE0F\u20E3', '3\uFE0F\u20E3', '4\uFE0F\u20E3', '5\uFE0F\u20E3', '6\uFE0F\u20E3', '7\uFE0F\u20E3', '8\uFE0F\u20E3', '9\uFE0F\u20E3'];

function toEmoji(ch) {
  const lower = ch.toLowerCase();
  if (lower >= 'a' && lower <= 'z') {
    // regional indicator: A = U+1F1E6
    return String.fromCodePoint(0x1f1e6 + (lower.charCodeAt(0) - 97)) + '\u200b';
  }
  if (ch >= '0' && ch <= '9') return KEYCAPS[Number(ch)] + '\u200b';
  if (ch === ' ') return '   ';
  return ch;
}

module.exports = {
  name: 'emojify',
  aliases: ['emoji', 'regional', 'chuemoji'],
  category: 'fun',
  description: 'Biến văn bản (a-z, 0-9) thành chữ emoji to đẹp',
  usage: '<nội dung>',
  cooldown: 3,
  slash: true,
  options: [{ name: 'nội_dung', type: 'string', description: 'Văn bản cần biến đổi', required: true, rest: true }],
  async run(ctx) {
    let text = ctx.getString('nội_dung');
    if (!text) return ctx.reply({ embeds: [Embed.error('Thiếu nội dung', 'Hãy nhập văn bản cần biến đổi.')] });
    if (text.length > 100) text = text.slice(0, 100);

    const result = [...text].map(toEmoji).join('');
    await ctx.reply({ embeds: [Embed.custom(colors.aqua, '🆎️ Emojify', result)] });
  },
};
