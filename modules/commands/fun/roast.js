// =============================================================
//  Lệnh: roast - trêu chọc ai đó (nhẹ nhàng, cho vui)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const rng = require('../../core/secureRandom');

const ROASTS = [
  'Bạn code giỏi đến mức bug cũng phải gọi bằng thầy.',
  'Tốc độ phản ứng của bạn nhanh như... Internet Explorer.',
  'Bạn đặc biệt đến mức ai cũng muốn... ngồi bàn khác.',
  'Não bạn là phiên bản giới hạn — rất hiếm khi hoạt động.',
  'Bạn sáng như bóng đèn... đã cháy.',
  'Bạn độc đáo lắm, giống hệt 8 tỉ người khác.',
  'Bạn là lý do tờ hướng dẫn sử dụng luôn có câu "đừng thử ở nhà".',
];

module.exports = {
  name: 'roast',
  aliases: ['trau', 'chiensu'],
  category: 'fun',
  description: 'Trêu chọc ai đó một cách hài hước (chỉ để vui)',
  usage: '[@thành_viên]',
  cooldown: 4,
  slash: true,
  options: [{ name: 'thành_viên', type: 'user', description: 'Người bị trêu (bỏ trống = chính bạn)', required: false }],
  async run(ctx) {
    const target = ctx.getUser('thành_viên') || ctx.author;
    const roast = ROASTS[Math.floor(rng.randomFloat() * ROASTS.length)];
    await ctx.reply({ embeds: [Embed.custom(colors.orange, '🔥 Roast', `${target}, ${roast}`)] });
  },
};
