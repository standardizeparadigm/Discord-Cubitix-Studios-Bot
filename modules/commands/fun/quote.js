// =============================================================
//  Lệnh: quote - một câu nói truyền cảm hứng
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const rng = require('../../core/secureRandom');

const QUOTES = [
  { t: 'Cách tốt nhất để dự đoán tương lai là tự tạo ra nó.', a: 'Peter Drucker' },
  { t: 'Hãy làm những điều bình thường theo cách phi thường.', a: 'Jim Rohn' },
  { t: 'Thành công là đi từ thất bại này đến thất bại khác mà không mất nhiệt huyết.', a: 'Winston Churchill' },
  { t: 'Mã nguồn cũng như câu đùa: nếu phải giải thích thì nó tệ rồi.', a: 'Cory House' },
  { t: 'Hành trình nghìn dặm bắt đầu từ một bước chân.', a: 'Lão Tử' },
  { t: 'Đừng đếm từng ngày, hãy làm cho từng ngày đáng giá.', a: 'Muhammad Ali' },
];

module.exports = {
  name: 'quote',
  aliases: ['q', 'chamngon', 'danhngon'],
  category: 'fun',
  description: 'Nhận một câu danh ngôn truyền cảm hứng',
  cooldown: 3,
  slash: true,
  async run(ctx) {
    const q = QUOTES[Math.floor(rng.randomFloat() * QUOTES.length)];
    await ctx.reply({ embeds: [Embed.custom(colors.aqua, '💭 Danh ngôn', `*“${q.t}”*\n\n— **${q.a}**`)] });
  },
};
