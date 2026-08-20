// =============================================================
//  Lệnh: slots - máy quay may mắn (đặt cược xu, có hiệu ứng quay)
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const { sleep } = require('../../core/Animator');
const db = require('../../core/Database');
const quests = require('../../core/questLogic');
const gambling = require('../../core/gambling');
const rng = require('../../core/secureRandom');

// Biểu tượng trên máy quay + hệ số thưởng khi đủ 3 cái giống nhau
const REELS = [
  { icon: '🍒', triple: 3 },
  { icon: '🍋', triple: 4 },
  { icon: '🍉', triple: 5 },
  { icon: '🔔', triple: 8 },
  { icon: '⭐', triple: 12 },
  { icon: '💎', triple: 25 },
  { icon: '🍀', triple: 50 },
];
const ICONS = REELS.map((r) => r.icon);

function spin() {
  return [0, 1, 2].map(() => rng.pick(ICONS));
}

// Tính tiền thưởng dựa trên kết quả và tiền cược
function payout(result, bet) {
  const [a, b, c] = result;
  if (a === b && b === c) {
    const reel = REELS.find((r) => r.icon === a);
    return { win: bet * reel.triple, text: `🎉 JACKPOT! Ba ${a} — thưởng x${reel.triple}!` };
  }
  if (a === b || b === c || a === c) {
    return { win: Math.floor(bet * 1.5), text: '✨ Hai biểu tượng trùng — thưởng x1.5!' };
  }
  return { win: 0, text: '😢 Không trùng biểu tượng nào. Chúc may mắn lần sau!' };
}

function display(result) {
  return `╭───┬───┬───╮\n│ ${result[0]} │ ${result[1]} │ ${result[2]} │\n╰───┴───┴───╯`;
}

function buildRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('slots_again').setLabel('Quay lại').setEmoji('🎰').setStyle(ButtonStyle.Success).setDisabled(disabled),
  );
}

async function playRound(user, bet, editFn) {
  // Hiệu ứng quay
  for (let f = 0; f < 4; f++) {
    await editFn({
      embeds: [Embed.custom(colors.warning, '🎰 Máy quay may mắn', `${display(spin())}\n\n${emoji.loading} Đang quay...`)],
      components: [buildRow(true)],
    });
    await sleep(320);
  }

  const result = spin();
  const wallet = db.getWallet(user.id);
  const { win, text } = payout(result, bet);
  wallet.balance += win; // tiền cược đã trừ trước đó
  quests.track(wallet, 'gamble', 1);
  quests.track(wallet, 'slotsPlay', 1);
  quests.track(wallet, 'betAmount', bet);
  if (win > bet) quests.track(wallet, 'gambleWin', 1);
  if (win > bet) quests.track(wallet, 'gambleProfit', win - bet);
  db.saveWallet(user.id, wallet);

  const net = win - bet;
  const color = win > 0 ? colors.gold : colors.error;
  const embed = Embed.custom(color, '🎰 Máy quay may mắn', `${display(result)}\n\n${text}`)
    .addFields(
      { name: '🎯 Đặt cược', value: `**${bet.toLocaleString('vi-VN')}** xu`, inline: true },
      { name: '💰 Thưởng', value: `**${win.toLocaleString('vi-VN')}** xu`, inline: true },
      { name: net >= 0 ? '📈 Lãi' : '📉 Lỗ', value: `**${net >= 0 ? '+' : ''}${net.toLocaleString('vi-VN')}** xu`, inline: true },
      { name: '👛 Số dư ví', value: `**${wallet.balance.toLocaleString('vi-VN')}** xu`, inline: false },
    );
  await editFn({ embeds: [embed], components: [buildRow(false)] });
}

module.exports = {
  name: 'slots',
  aliases: ['slot', 'quay', 'maykeo'],
  category: 'casino',
  description: 'Đặt cược xu và quay máy may mắn',
  usage: '<số xu cược | all>',
  cooldown: 5,
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

    // Trừ tiền cược ngay
    wallet.balance -= bet;
    db.saveWallet(ctx.author.id, wallet);

    const msg = await ctx.reply({ embeds: [Embed.custom(colors.warning, '🎰 Máy quay may mắn', `${r.capped ? '⚠️ Đã giới hạn cược ở mức tối đa **250.000** xu.\n\n' : ''}${emoji.loading} Đang khởi động với cược **${bet.toLocaleString('vi-VN')}** xu...`)] });
    const editFn = (payload) => (ctx.isSlash ? ctx.interaction.editReply(payload) : msg.edit(payload));
    await playRound(ctx.author, bet, editFn);

    // Cho phép quay lại bằng nút bấm trong 60 giây (tự trừ tiền cược mỗi lần)
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
    let spinning = false; // khóa chống bấm liên tục gây trừ tiền nhiều lần cùng lúc
    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} Đây không phải lượt của bạn!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      if (spinning) return i.deferUpdate().catch(() => {}); // đang quay, bỏ qua bấm thừa
      const w = db.getWallet(ctx.author.id);
      if (w.balance < bet) {
        await i.reply({ content: `${emoji.error} Bạn không còn đủ **${bet.toLocaleString('vi-VN')}** xu để quay tiếp.`, flags: MessageFlags.Ephemeral }).catch(() => {});
        return;
      }
      spinning = true;
      w.balance -= bet;
      db.saveWallet(ctx.author.id, w);
      await i.deferUpdate();
      try {
        await playRound(ctx.author, bet, (payload) => i.editReply(payload));
      } finally {
        spinning = false;
      }
    });
    collector.on('end', () => {
      editFn({ components: [buildRow(true)] }).catch(() => {});
    });
  },
};
