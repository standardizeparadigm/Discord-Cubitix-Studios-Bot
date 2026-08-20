// =============================================================
//  Lệnh: guess - trò chơi đoán số 1-100
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const rng = require('../../core/secureRandom');
const db = require('../../core/Database');
const quests = require('../../core/questLogic');

module.exports = {
  name: 'guess',
  aliases: ['doanso', 'guessnumber'],
  category: 'games',
  description: 'Trò chơi đoán số từ 1 đến 100 (7 lượt đoán)',
  cooldown: 10,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    const answer = 1 + rng.randomInt(100);
    let tries = 7;

    // Ghi nhận tiến độ nhiệm vụ hàng ngày
    const qw = db.getWallet(ctx.author.id);
    quests.track(qw, 'game', 1);
    db.saveWallet(ctx.author.id, qw);

    await ctx.reply({
      embeds: [Embed.custom(colors.info, '🎯 Đoán số', `Tôi đã nghĩ một số từ **1** đến **100**.\nBạn có **${tries}** lượt đoán. Gõ số vào chat nhé!`)],
    });

    const filter = (m) => m.author.id === ctx.author.id && /^\d+$/.test(m.content.trim());
    const collector = ctx.channel.createMessageCollector({ filter, time: 60000 });

    collector.on('collect', (m) => {
      const g = parseInt(m.content.trim(), 10);
      tries--;
      if (g === answer) {
        // Ghi nhận nhiệm vụ "đoán trúng số bí mật"
        try {
          const ww = db.getWallet(ctx.author.id);
          quests.track(ww, 'guessWin', 1);
          db.saveWallet(ctx.author.id, ww);
        } catch { /* không để lỗi ghi nhận làm hỏng trò chơi */ }
        m.reply({ embeds: [Embed.success('Chính xác! 🎉', `Số đúng là **${answer}**. Bạn thật giỏi!`)] }).catch(() => {});
        return collector.stop('win');
      }
      if (tries <= 0) {
        m.reply({ embeds: [Embed.error('Hết lượt!', `Bạn đã hết lượt. Số đúng là **${answer}**.`)] }).catch(() => {});
        return collector.stop('lose');
      }
      const hint = g < answer ? '🔺 Lớn hơn!' : '🔻 Nhỏ hơn!';
      m.reply({ embeds: [Embed.custom(colors.warning, hint, `Còn lại **${tries}** lượt.`)] }).catch(() => {});
    });

    collector.on('end', (_c, reason) => {
      if (reason === 'time') {
        ctx.channel.send({ embeds: [Embed.warn('Hết giờ', `Trò chơi kết thúc. Số đúng là **${answer}**.`)] }).catch(() => {});
      }
    });
  },
};
