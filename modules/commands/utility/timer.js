// =============================================================
//  Lệnh: timer - đặt hẹn giờ đếm ngược
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'timer',
  aliases: ['hengio', 'countdown', 'dongho'],
  category: 'utility',
  description: 'Đặt hẹn giờ đếm ngược (tính bằng giây, tối đa 3600)',
  usage: '<số giây> [lời nhắc]',
  cooldown: 3,
  slash: true,
  options: [
    { name: 'số_giây', type: 'integer', description: 'Thời gian đếm ngược (giây)', required: true },
    { name: 'lời_nhắc', type: 'string', description: 'Lời nhắc khi hết giờ', required: false, rest: true },
  ],
  async run(ctx) {
    let seconds = ctx.getInteger('số_giây');
    const note = ctx.getString('lời_nhắc') || 'Hết giờ rồi!';
    if (!seconds || seconds < 1 || seconds > 3600) {
      return ctx.reply({ embeds: [Embed.error('Thời gian không hợp lệ', 'Hãy nhập từ 1 đến 3600 giây.')] });
    }
    const done = Math.floor(Date.now() / 1000) + seconds;
    await ctx.reply({ embeds: [Embed.custom(colors.info, '⏲️ Đã đặt hẹn giờ', `Sẽ nhắc bạn sau **${seconds} giây** (<t:${done}:R>).\n📝 Lời nhắc: ${note}`)] });

    setTimeout(() => {
      ctx.send({ content: `${ctx.author}`, embeds: [Embed.custom(colors.success, '⏰ Hẹn giờ kết thúc!', note)] }).catch(() => {});
    }, seconds * 1000);
  },
};
