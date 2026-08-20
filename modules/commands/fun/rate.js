// =============================================================
//  Lệnh: rate - chấm điểm bất kỳ thứ gì (ổn định theo nội dung, cho vui)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { progressBar } = require('../../core/Animator');
const { colors } = require('../../core/palette');

// Hàm băm đơn giản để cùng nội dung luôn ra cùng điểm
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

module.exports = {
  name: 'rate',
  aliases: ['danhgia', 'cham', 'chamdiem'],
  category: 'fun',
  description: 'Chấm điểm (0-100) cho bất kỳ thứ gì bạn nhập',
  usage: '<nội dung>',
  cooldown: 3,
  slash: true,
  options: [{ name: 'nội_dung', type: 'string', description: 'Thứ cần chấm điểm', required: true, rest: true }],
  async run(ctx) {
    const text = ctx.getString('nội_dung');
    if (!text) return ctx.reply({ embeds: [Embed.error('Thiếu nội dung', 'Hãy nhập thứ cần chấm điểm.')] });

    const score = hash(text.toLowerCase().trim()) % 101;
    let comment;
    if (score < 20) comment = '😬 Thôi bỏ đi...';
    else if (score < 40) comment = '🙅 Tạm ổn thôi.';
    else if (score < 60) comment = '🙂 Cũng được đấy.';
    else if (score < 80) comment = '😎 Khá ngon!';
    else if (score < 95) comment = '🔥 Tuyệt vời!';
    else comment = '💎 Hoàn hảo 10 điểm!';

    const embed = Embed.custom(colors.pink, '⭐ Bảng chấm điểm')
      .setDescription(`Cho **“${text.length > 100 ? text.slice(0, 100) + '…' : text}”**\n\n${progressBar(score)}\n\n**${score}/100** — ${comment}`);
    await ctx.reply({ embeds: [embed] });
  },
};
