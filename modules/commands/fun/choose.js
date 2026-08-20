// =============================================================
//  Lệnh: choose - bảo bot chọn giúp một lựa chọn
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const rng = require('../../core/secureRandom');

module.exports = {
  name: 'choose',
  aliases: ['pick', 'chon', 'chonhelp'],
  category: 'fun',
  description: 'Bảo bot chọn giúp bạn giữa nhiều lựa chọn',
  usage: 'lựa chọn 1 | lựa chọn 2 | ...',
  cooldown: 3,
  slash: true,
  options: [{ name: 'các_lựa_chọn', type: 'string', description: 'Các lựa chọn, ngăn cách bằng dấu |', required: true, rest: true }],
  async run(ctx) {
    const raw = ctx.getString('các_lựa_chọn') || '';
    const parts = (raw.includes('|') ? raw.split('|') : raw.split(/\s+/))
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) {
      return ctx.reply({ embeds: [Embed.error('Cần ít nhất 2 lựa chọn', 'Ví dụ: `choose Trà sữa | Cà phê | Nước ép`')] });
    }
    const picked = parts[Math.floor(rng.randomFloat() * parts.length)];
    const embed = Embed.custom(colors.purple, `${emoji.sparkles} Tôi chọn...`)
      .setDescription(`➤ **${picked}**`)
      .addFields({ name: 'Các lựa chọn', value: parts.map((p) => (p === picked ? `✅ ${p}` : `• ${p}`)).join('\n').slice(0, 1000) });
    await ctx.reply({ embeds: [embed] });
  },
};
