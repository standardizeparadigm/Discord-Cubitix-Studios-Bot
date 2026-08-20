// =============================================================
//  Lệnh: ship - đo độ hợp nhau giữa hai người (cho vui)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { progressBar } = require('../../core/Animator');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'ship',
  aliases: ['tinhyeu', 'love', 'ghep'],
  category: 'fun',
  description: 'Đo độ hợp nhau giữa hai người (chỉ để vui)',
  usage: '<@người1> [@người2]',
  cooldown: 4,
  slash: true,
  options: [
    { name: 'người_1', type: 'user', description: 'Người thứ nhất', required: true },
    { name: 'người_2', type: 'user', description: 'Người thứ hai (bỏ trống = chính bạn)', required: false },
  ],
  async run(ctx) {
    const a = ctx.getUser('người_1');
    const b = ctx.getUser('người_2') || ctx.author;
    if (!a) return ctx.reply({ embeds: [Embed.error('Thiếu người', 'Hãy nhắc tên ít nhất một người để ghép đôi.')] });

    // Tính điểm ổn định dựa trên 2 ID (lần sau vẫn ra kết quả đó)
    const seed = (BigInt(a.id) + BigInt(b.id)) % 101n;
    const percent = Number(seed);
    let comment;
    if (percent < 20) comment = 'Hơi khó nha... 😅';
    else if (percent < 50) comment = 'Có tiềm năng đấy! 😊';
    else if (percent < 80) comment = 'Khá hợp nhau đó! 💕';
    else comment = 'Trời sinh một cặp! 💘';

    const heart = percent >= 50 ? '💘' : '💔';
    const embed = Embed.custom(colors.pink, `${heart} Độ hợp: ${a.username} × ${b.username}`)
      .setDescription(`${progressBar(percent)}\n\n**${percent}%** — ${comment}`);
    await ctx.reply({ embeds: [embed] });
  },
};
