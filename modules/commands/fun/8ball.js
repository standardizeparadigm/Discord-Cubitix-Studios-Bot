// =============================================================
//  Lệnh: 8ball - quả cầu tiên tri trả lời câu hỏi
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const rng = require('../../core/secureRandom');

const ANSWERS = [
  'Chắc chắn rồi!',
  'Không nghi ngờ gì nữa.',
  'Đúng vậy.',
  'Rất có thể.',
  'Nhìn chung là tốt.',
  'Cứ tự tin lên!',
  'Khó nói trước lắm.',
  'Hỏi lại sau nhé.',
  'Tốt nhất là đừng nên.',
  'Tôi không nghĩ vậy đâu.',
  'Rất đáng ngờ.',
  'Chắc chắn là không.',
];

module.exports = {
  name: '8ball',
  aliases: ['8b', 'boi', 'tientri'],
  category: 'fun',
  description: 'Đặt một câu hỏi có/không cho quả cầu tiên tri',
  usage: '<câu hỏi>',
  cooldown: 3,
  slash: true,
  options: [{ name: 'câu_hỏi', type: 'string', description: 'Câu hỏi của bạn', required: true, rest: true }],
  async run(ctx) {
    const question = ctx.getString('câu_hỏi');
    if (!question) return ctx.reply({ embeds: [Embed.error('Thiếu câu hỏi', 'Hãy đặt một câu hỏi nhé!')] });
    const answer = ANSWERS[Math.floor(rng.randomFloat() * ANSWERS.length)];
    const embed = Embed.custom(colors.purple, '🎱 Quả cầu tiên tri')
      .addFields(
        { name: '❓ Câu hỏi', value: question.length > 1024 ? question.slice(0, 1023) + '…' : question },
        { name: '🔮 Trả lời', value: answer },
      );
    await ctx.reply({ embeds: [embed] });
  },
};
