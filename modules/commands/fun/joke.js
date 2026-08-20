// =============================================================
//  Lệnh: joke - kể một câu đùa vui
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const rng = require('../../core/secureRandom');

const JOKES = [
  'Vì sao lập trình viên luôn nhầm Halloween và Giáng Sinh? Vì OCT 31 = DEC 25.',
  'Có 2 loại người: người hiểu nhị phân và người không.',
  'Tại sao con bò không biết nhảy? Vì nó có hai chân trái... à nhầm, bốn chân.',
  'Máy tính lạnh nhất thế giới nằm ở đâu? Trong Windows.',
  'Bạn gọi cá không có mắt là gì? Cá... (fsh).',
  'Vì sao bút chì buồn? Vì cuộc đời nó toàn bị gọt giũa.',
  'Anh yêu em nhiều như RAM yêu dữ liệu — mất điện là quên sạch.',
  'Wifi và tình yêu giống nhau: có khi đầy vạch mà vẫn chẳng vào được.',
];

module.exports = {
  name: 'joke',
  aliases: ['dua', 'cuoi', 'haha'],
  category: 'fun',
  description: 'Nghe một câu đùa vui ngẫu nhiên',
  cooldown: 3,
  slash: true,
  async run(ctx) {
    const joke = JOKES[Math.floor(rng.randomFloat() * JOKES.length)];
    await ctx.reply({ embeds: [Embed.custom(colors.orange, '😂 Cười chút cho vui', joke)] });
  },
};
