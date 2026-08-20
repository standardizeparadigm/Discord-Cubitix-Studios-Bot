// =============================================================
//  Lenh: highlow - doan la bai cao/thap/bang (co bac)
//  4 nut: Thap hon, Cao hon, Bang, Rut tien. Dung thi he so nhan tang dan.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const quests = require('../../core/questLogic');
const gambling = require('../../core/gambling');
const { highlowFactor, highlowWin } = require('../../core/minigames');
const rng = require('../../core/secureRandom');

// Trần thưởng mỗi ván. Đoán "bằng" có hệ số x11.96 mỗi lượt, nên chỉ cần 3 lượt
// may mắn liên tiếp là cược 250.000 xu biến thành hơn 400 triệu xu — đủ sức phá vỡ
// nền kinh tế của cả server. Kỳ vọng toán học vẫn giữ nguyên 92%, chỉ chặn đuôi cực đoan.
const MAX_PAYOUT = 10000000; // 10 triệu xu

const SUITS = ['\u2665\ufe0f', '\u2660\ufe0f', '\u2666\ufe0f', '\u2663\ufe0f'];
const NAMES = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
function draw() { return rng.randomIntRange(1, 13); }
function cardStr(v) { const s = rng.pick(SUITS); return `${s} **${NAMES[v] || v}**`; }

// current = gia tri la hien tai (1..13). Disable nut khong the thang.
function row(current, disabled = false) {
  const f = (g) => highlowFactor(current, g).toFixed(2);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hl_low').setLabel(`Th\u1ea5p h\u01a1n (x${f('low')})`).setEmoji('\u2b07\ufe0f').setStyle(ButtonStyle.Primary).setDisabled(disabled || current <= 1),
    new ButtonBuilder().setCustomId('hl_high').setLabel(`Cao h\u01a1n (x${f('high')})`).setEmoji('\u2b06\ufe0f').setStyle(ButtonStyle.Success).setDisabled(disabled || current >= 13),
    new ButtonBuilder().setCustomId('hl_equal').setLabel(`B\u1eb1ng (x${f('equal')})`).setEmoji('\ud83d\udff0').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('hl_cash').setLabel('R\u00fat ti\u1ec1n').setEmoji('\ud83d\udcb0').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );
}

module.exports = {
  name: 'highlow',
  aliases: ['hl', 'caothap', 'higherlower'],
  category: 'casino',
  description: 'C\u01b0\u1ee3c \u0111o\u00e1n l\u00e1 b\u00e0i cao/th\u1ea5p/b\u1eb1ng \u2014 h\u1ec7 s\u1ed1 nh\u00e2n t\u0103ng d\u1ea7n',
  usage: '<s\u1ed1 xu c\u01b0\u1ee3c | all>',
  cooldown: 6,
  guildOnly: true,
  slash: true,
  options: [{ name: 'tien_cuoc', type: 'string', description: "S\u1ed1 xu \u0111\u1eb7t c\u01b0\u1ee3c (ho\u1eb7c 'all')", required: true, rest: true }],
  async run(ctx) {
    const wallet = db.getWallet(ctx.author.id);
    const r = gambling.resolveBet(ctx.getString('tien_cuoc'), wallet.balance);
    if (!r.ok) {
      if (r.reason === 'over') return ctx.reply({ embeds: [Embed.error('C\u01b0\u1ee3c qu\u00e1 l\u1edbn', `T\u1ed1i \u0111a **${r.max.toLocaleString('vi-VN')}** xu m\u1ed7i l\u01b0\u1ee3t.`)] });
      if (r.reason === 'insufficient') return ctx.reply({ embeds: [Embed.error('Kh\u00f4ng \u0111\u1ee7 xu', `V\u00ed b\u1ea1n ch\u1ec9 c\u00f3 **${wallet.balance.toLocaleString('vi-VN')}** xu.`)] });
      return ctx.reply({ embeds: [Embed.error('Ti\u1ec1n c\u01b0\u1ee3c kh\u00f4ng h\u1ee3p l\u1ec7', "H\u00e3y nh\u1eadp s\u1ed1 xu d\u01b0\u01a1ng ho\u1eb7c `all` (t\u1ed1i \u0111a 250.000).")] });
    }
    const bet = r.bet;

    wallet.balance -= bet;
    quests.track(wallet, 'gamble', 1);
    quests.track(wallet, 'highlowPlay', 1);
    quests.track(wallet, 'betAmount', bet);
    db.saveWallet(ctx.author.id, wallet);

    let current = draw();
    let currentStr = cardStr(current);
    let multiplier = 1;
    let streak = 0;
    let ended = false;

    const board = (extra = '') => {
      const pot = Math.min(Math.floor(bet * multiplier), MAX_PAYOUT);
      return Embed.custom(colors.warning, '\ud83c\udccf Cao hay Th\u1ea5p?',
        `L\u00e1 hi\u1ec7n t\u1ea1i: ${currentStr}\n\n\u0110o\u00e1n l\u00e1 ti\u1ebfp theo: **th\u1ea5p h\u01a1n**, **cao h\u01a1n** hay **b\u1eb1ng**? \u0110o\u00e1n \`b\u1eb1ng\` r\u1ea5t kh\u00f3 nh\u01b0ng th\u01b0\u1edfng c\u1ef1c cao!${extra}`)
        .addFields(
          { name: '\ud83c\udfaf C\u01b0\u1ee3c', value: `**${bet.toLocaleString('vi-VN')}** xu`, inline: true },
          { name: '\u2716\ufe0f H\u1ec7 s\u1ed1', value: `**x${multiplier.toFixed(2)}**`, inline: true },
          { name: '\ud83d\udcb0 R\u00fat ngay \u0111\u01b0\u1ee3c', value: `**${pot.toLocaleString('vi-VN')}** xu`, inline: true },
        )
        .setFooter({ text: `Chu\u1ed7i th\u1eafng: ${streak}` });
    };
    const opening = r.capped ? '\n\u26a0\ufe0f \u0110\u00e3 gi\u1edbi h\u1ea1n c\u01b0\u1ee3c \u1edf m\u1ee9c t\u1ed1i \u0111a **250.000** xu.' : '';

    const msg = await ctx.reply({ embeds: [board(opening)], components: [row(current, false)] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 45000 });

    const cashOut = async (i) => {
      ended = true;
      collector.stop();
      const pot = Math.min(Math.floor(bet * multiplier), MAX_PAYOUT);
      const w = db.getWallet(ctx.author.id);
      w.balance += pot;
      if (pot > bet) quests.track(w, 'gambleWin', 1);
      if (pot > bet) quests.track(w, 'gambleProfit', pot - bet);
      db.saveWallet(ctx.author.id, w);
      const net = pot - bet;
      const e = Embed.custom(colors.gold, '\ud83d\udcb0 \u0110\u00e3 r\u00fat ti\u1ec1n!',
        `L\u00e1 cu\u1ed1i: ${currentStr}\nB\u1ea1n mang v\u1ec1 **${pot.toLocaleString('vi-VN')}** xu (x${multiplier.toFixed(2)}).`)
        .addFields(
          { name: net >= 0 ? '\ud83d\udcc8 L\u00e3i' : '\ud83d\udcc9 L\u1ed7', value: `**${net >= 0 ? '+' : ''}${net.toLocaleString('vi-VN')}** xu`, inline: true },
          { name: '\ud83d\udc5b S\u1ed1 d\u01b0 v\u00ed', value: `**${w.balance.toLocaleString('vi-VN')}** xu`, inline: true },
        );
      await i.update({ embeds: [e], components: [row(current, true)] });
    };

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} \u0110\u00e2y kh\u00f4ng ph\u1ea3i l\u01b0\u1ee3t ch\u01a1i c\u1ee7a b\u1ea1n!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      if (ended) return i.deferUpdate();
      if (i.customId === 'hl_cash') return cashOut(i);

      const guess = i.customId === 'hl_high' ? 'high' : i.customId === 'hl_low' ? 'low' : 'equal';
      const factor = highlowFactor(current, guess);
      const next = draw();
      const nextStr = cardStr(next);
      const win = highlowWin(current, guess, next);
      const label = guess === 'high' ? 'cao h\u01a1n' : guess === 'low' ? 'th\u1ea5p h\u01a1n' : 'b\u1eb1ng';

      if (win) {
        multiplier *= factor;
        streak += 1;
        current = next;
        currentStr = nextStr;
        const extra = `\n\n\u2705 L\u00e1 m\u1edbi ${nextStr} \u2014 \u0110\u00fang (${label})! H\u1ec7 s\u1ed1 x${multiplier.toFixed(2)}.`;
        await i.update({ embeds: [board(extra)], components: [row(current, false)] });
      } else {
        ended = true;
        collector.stop();
        const w = db.getWallet(ctx.author.id);
        const e = Embed.custom(colors.error, '\ud83d\udca5 Sai r\u1ed3i!',
          `L\u00e1 tr\u01b0\u1edbc: ${currentStr}\nL\u00e1 m\u1edbi: ${nextStr} (b\u1ea1n \u0111o\u00e1n *${label}*)\n\nB\u1ea1n m\u1ea5t **${bet.toLocaleString('vi-VN')}** xu.`)
          .addFields(
            { name: '\ud83d\udd25 Chu\u1ed7i th\u1eafng', value: `**${streak}**`, inline: true },
            { name: '\ud83d\udc5b S\u1ed1 d\u01b0 v\u00ed', value: `**${w.balance.toLocaleString('vi-VN')}** xu`, inline: true },
          );
        await i.update({ embeds: [e], components: [row(current, true)] });
      }
    });

    collector.on('end', async () => {
      if (ended) return;
      const pot = Math.min(Math.floor(bet * multiplier), MAX_PAYOUT);
      const w = db.getWallet(ctx.author.id);
      w.balance += pot;
      if (pot > bet) quests.track(w, 'gambleWin', 1);
      if (pot > bet) quests.track(w, 'gambleProfit', pot - bet);
      db.saveWallet(ctx.author.id, w);
      const e = Embed.custom(colors.info, '\u23f0 H\u1ebft gi\u1edd \u2014 t\u1ef1 \u0111\u1ed9ng r\u00fat ti\u1ec1n',
        `B\u1ea1n nh\u1eadn **${pot.toLocaleString('vi-VN')}** xu (x${multiplier.toFixed(2)}).\nS\u1ed1 d\u01b0 v\u00ed: **${w.balance.toLocaleString('vi-VN')}** xu.`);
      msg.edit({ embeds: [e], components: [row(current, true)] }).catch(() => {});
    });
  },
};
