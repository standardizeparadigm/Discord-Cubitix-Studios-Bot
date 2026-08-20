// =============================================================
//  Lệnh: coinflip - cược tung đồng xu (cờ bạc, gấp đôi hoặc mất)
//  Chọn mặt sấp/ngửa, tung trúng thì x2 tiền cược.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const { sleep } = require('../../core/Animator');
const db = require('../../core/Database');
const quests = require('../../core/questLogic');
const gambling = require('../../core/gambling');
const rng = require('../../core/secureRandom');

const FACES = {
  heads: { label: 'Ngửa', emoji: '🪙' },
  tails: { label: 'Sấp', emoji: '💰' },
};

function chooseRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cb_heads').setLabel('Ngửa').setEmoji('🪙').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('cb_tails').setLabel('Sấp').setEmoji('💰').setStyle(ButtonStyle.Primary).setDisabled(disabled),
  );
}

module.exports = {
  name: 'coinflip',
  aliases: ['cuoc', 'cuocxu', 'flipbet'],
  category: 'casino',
  description: 'Cược tung đồng xu — đoán trúng thắng lớn (x1.95)',
  usage: '<số xu cược | all>',
  cooldown: 6,
  guildOnly: true,
  slash: true,
  options: [{ name: 'tiền_cược', type: 'string', description: "Số xu đặt cược (hoặc 'all')", required: true, rest: true }],
  async run(ctx) {
    const wallet = db.getWallet(ctx.author.id);
    const r = gambling.resolveBet(ctx.getString('tiền_cược'), wallet.balance);
    if (!r.ok) {
      if (r.reason === 'over') return ctx.reply({ embeds: [Embed.error('Cược quá lớn', `Tối đa **${r.max.toLocaleString('vi-VN')}** xu mỗi lượt.`)] });
      if (r.reason === 'insufficient') return ctx.reply({ embeds: [Embed.error('Không đủ xu', `Ví bạn chỉ có **${wallet.balance.toLocaleString('vi-VN')}** xu.`)] });
      return ctx.reply({ embeds: [Embed.error('Tiền cược không hợp lệ', "Hãy nhập số xu dương hoặc `all` (tối đa 250.000).")] });
    }
    const bet = r.bet;

    const msg = await ctx.reply({
      embeds: [Embed.custom(colors.warning, '🪙 Cược tung đồng xu', `${r.capped ? '⚠️ Đã giới hạn cược ở mức tối đa **250.000** xu.\n\n' : ''}Cược **${bet.toLocaleString('vi-VN')}** xu.\nChọn mặt bạn đoán:`)],
      components: [chooseRow(false)],
    });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
    let done = false;

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} Đây không phải lượt cược của bạn!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      // Chống bấm nhanh 2 lần: nếu đã xử lý thì bỏ qua (tránh trừ cược/tung xu 2 lần trong 1 lượt).
      if (done) return i.deferUpdate();
      done = true;
      collector.stop();

      // Kiểm tra lại số dư & trừ tiền cược
      const w = db.getWallet(ctx.author.id);
      if (w.balance < bet) {
        return i.update({ embeds: [Embed.error('Không đủ xu', 'Số dư của bạn đã thay đổi, không đủ để cược.')], components: [chooseRow(true)] });
      }
      w.balance -= bet;
      db.saveWallet(ctx.author.id, w);

      const pick = i.customId === 'cb_heads' ? 'heads' : 'tails';
      await i.deferUpdate();

      // Hiệu ứng tung xu
      for (let f = 0; f < 4; f++) {
        const face = f % 2 === 0 ? '🪙' : '💰';
        await i.editReply({ embeds: [Embed.custom(colors.warning, '🪙 Đang tung...', `${emoji.loading} ${face} đồng xu đang xoay...`)], components: [chooseRow(true)] });
        await sleep(360);
      }

      const result = rng.chance(0.5) ? 'heads' : 'tails';
      const win = result === pick;
      const w2 = db.getWallet(ctx.author.id);
      // Trả thưởng có phí nhà cái ~2.5% (x1.95 thay vì x2) để chống lạm phát.
      let net = -bet;
      if (win) {
        const gross = Math.floor(bet * 1.95);
        w2.balance += gross;
        net = gross - bet;
      }
      quests.track(w2, 'gamble', 1);
      quests.track(w2, 'coinflipPlay', 1);
      quests.track(w2, 'betAmount', bet);
      if (win) quests.track(w2, 'gambleWin', 1);
      if (net > 0) quests.track(w2, 'gambleProfit', net);
      db.saveWallet(ctx.author.id, w2);
      const embed = Embed.custom(win ? colors.gold : colors.error, win ? '🎉 Bạn THẮNG!' : '😢 Bạn THUA!',
        `Kết quả: ${FACES[result].emoji} **${FACES[result].label}**\nBạn chọn: ${FACES[pick].emoji} **${FACES[pick].label}**`)
        .addFields(
          { name: '🎯 Cược', value: `**${bet.toLocaleString('vi-VN')}** xu`, inline: true },
          { name: net >= 0 ? '📈 Lãi' : '📉 Lỗ', value: `**${net >= 0 ? '+' : ''}${net.toLocaleString('vi-VN')}** xu`, inline: true },
          { name: '👛 Số dư ví', value: `**${w2.balance.toLocaleString('vi-VN')}** xu`, inline: true },
        );
      await i.editReply({ embeds: [embed], components: [chooseRow(true)] });
    });

    collector.on('end', () => {
      if (!done) msg.edit({ components: [chooseRow(true)] }).catch(() => {});
    });
  },
};
