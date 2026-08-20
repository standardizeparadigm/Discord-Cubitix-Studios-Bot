// =============================================================
//  Lenh: mines - do min co bac (luoi 3x3)
//  Mo o an toan de tang he so nhan; trung min mat cuoc; rut bat cu luc nao.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const quests = require('../../core/questLogic');
const gambling = require('../../core/gambling');
const { minesMultiplier } = require('../../core/minigames');
const rng = require('../../core/secureRandom');

const SIZE = 9;    // 3x3
const COLS = 3;
const MAX_MINES = 8;
// Đệm nhãn bằng khoảng trắng "em space" để nút to/dài hơn, người chơi dễ bấm.
// Nếu Discord có cắt bớt phần đệm thì nút vẫn hoạt động bình thường với emoji.
const BTN_PAD = '\u2003\u2003\u2003';

function pickMines(count) {
  const set = new Set();
  while (set.size < count) set.add(rng.randomInt(SIZE));
  return set;
}

module.exports = {
  name: 'mines',
  aliases: ['domin', 'minesweeper', 'bom'],
  category: 'casino',
  description: 'Dò mìn cờ bạc — mở ô an toàn để nhân tiền, tránh mìn',
  usage: '<số xu cược | all> [số mìn 1-8]',
  cooldown: 6,
  guildOnly: true,
  slash: true,
  options: [
    { name: 'tien_cuoc', type: 'string', description: "Số xu đặt cược (hoặc 'all')", required: true },
    { name: 'so_min', type: 'integer', description: 'Số mìn (1-8, mặc định 3)', required: false },
  ],
  async run(ctx) {
    const wallet = db.getWallet(ctx.author.id);
    const r = gambling.resolveBet(ctx.getString('tien_cuoc'), wallet.balance);
    if (!r.ok) {
      if (r.reason === 'over') return ctx.reply({ embeds: [Embed.error('Cược quá lớn', `Tối đa **${r.max.toLocaleString('vi-VN')}** xu mỗi lượt.`)] });
      if (r.reason === 'insufficient') return ctx.reply({ embeds: [Embed.error('Không đủ xu', `Ví bạn chỉ có **${wallet.balance.toLocaleString('vi-VN')}** xu.`)] });
      return ctx.reply({ embeds: [Embed.error('Tiền cược không hợp lệ', "Hãy nhập số xu dương hoặc `all` (tối đa 250.000).")] });
    }
    const bet = r.bet;
    const rawMines = ctx.getInteger('so_min');
    let mineCount = rawMines;
    if (!mineCount || mineCount < 1) mineCount = 3;
    if (mineCount > MAX_MINES) mineCount = MAX_MINES;
    // Thông báo nếu số bôm nhập vào bị điều chỉnh về khoảng hợp lệ
    const clampNote = (rawMines !== null && (rawMines < 1 || rawMines > MAX_MINES))
      ? `\n⚠️ Số bôm phải từ 1–${MAX_MINES}, đã chỉnh về **${mineCount}**.` : '';

    wallet.balance -= bet;
    quests.track(wallet, 'gamble', 1);
    quests.track(wallet, 'minesPlay', 1);
    quests.track(wallet, 'betAmount', bet);
    db.saveWallet(ctx.author.id, wallet);

    const mines = pickMines(mineCount);
    const revealed = new Set();
    let ended = false;
    const safeTotal = SIZE - mineCount;

    const curMult = () => minesMultiplier(SIZE, mineCount, revealed.size);

    // revealAll = true: lộ toàn bộ đáp án.
    //   Mọi ô AN TOÀN đều hiển thị kim cương 💎; nhưng CHỈ ô người chơi ĐÃ bấm mới nền xanh lá,
    //   còn ô an toàn CHƯA bấm để nền xám/trắng giống mìn (đừng xanh lá).
    //   idx === hitIdx -> mìn vừa nổ 💥; các mìn còn lại 💣.
    function grid(revealAll = false, hitIdx = -1) {
      const rows = [];
      for (let rIdx = 0; rIdx < COLS; rIdx++) {
        const row = new ActionRowBuilder();
        for (let c = 0; c < COLS; c++) {
          const idx = rIdx * COLS + c;
          const b = new ButtonBuilder().setCustomId(`mn_${idx}`);
          const isMine = mines.has(idx);
          const isOpen = revealed.has(idx);
          if (revealAll) {
            if (idx === hitIdx) {
              b.setEmoji('💥').setStyle(ButtonStyle.Danger);            // mìn vừa nổ
            } else if (isMine) {
              b.setEmoji('💣').setStyle(ButtonStyle.Secondary);         // mìn còn lại
            } else {
              // Ô an toàn — kim cương 💎. Chỉ ô người chơi ĐÃ bấm mới xanh lá (Success);
              // ô an toàn CHƯA bấm để nền xám/trắng giống mìn (Secondary).
              b.setEmoji('💎').setStyle(isOpen ? ButtonStyle.Success : ButtonStyle.Secondary);
            }
            b.setDisabled(true);
          } else if (isOpen) {
            b.setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true);
          } else {
            b.setEmoji('❓').setStyle(ButtonStyle.Secondary).setDisabled(false); // chưa mở: dấu chấm hỏi (nền xám)
          }
          b.setLabel(BTN_PAD); // nới rộng nút cho dễ bấm
          row.addComponents(b);
        }
        rows.push(row);
      }
      const cashRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mn_cash').setLabel(`Rút tiền (${Math.floor(bet * curMult()).toLocaleString('vi-VN')} xu)`).setEmoji('💰').setStyle(ButtonStyle.Success).setDisabled(revealAll || revealed.size === 0),
      );
      rows.push(cashRow);
      return rows;
    }

    function board(extra = '') {
      const pot = Math.floor(bet * curMult());
      return Embed.custom(colors.warning, '💣 Dò Mìn',
        `Lưới 3x3 · **${mineCount}** mìn · đã mở **${revealed.size}/${safeTotal}** ô an toàn.${extra}`)
        .addFields(
          { name: '🎯 Cược', value: `**${bet.toLocaleString('vi-VN')}** xu`, inline: true },
          { name: '✖️ Hệ số', value: `**x${curMult().toFixed(2)}**`, inline: true },
          { name: '💰 Rút ngay', value: `**${pot.toLocaleString('vi-VN')}** xu`, inline: true },
        )
        .setFooter({ text: 'Mở càng nhiều ô — thưởng càng cao, nhưng rủi ro càng lớn!' });
    }

    const cappedNote = r.capped ? '\n⚠️ Đã giới hạn cược ở mức tối đa **250.000** xu.' : '';
    const tip = `\n💡 Mẹo: gõ \`mines <số xu> <số bôm 1-${MAX_MINES}>\` — càng nhiều bôm, hệ số nhân càng cao (mặc định 3).`;
    const opening = cappedNote + clampNote + tip;
    const msg = await ctx.reply({ embeds: [board(opening)], components: grid() });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 90000 });

    const doCashOut = async (i) => {
      ended = true;
      collector.stop();
      const pot = Math.floor(bet * curMult());
      const w = db.getWallet(ctx.author.id);
      w.balance += pot;
      if (pot > bet) quests.track(w, 'gambleWin', 1);
      if (pot > bet) quests.track(w, 'gambleProfit', pot - bet);
      db.saveWallet(ctx.author.id, w);
      const net = pot - bet;
      const e = Embed.custom(colors.gold, '💰 Đã rút tiền an toàn!',
        `Mở được **${revealed.size}** ô · hệ số x${curMult().toFixed(2)}.\nMang về **${pot.toLocaleString('vi-VN')}** xu.`)
        .addFields(
          { name: net >= 0 ? '📈 Lãi' : '📉 Lỗ', value: `**${net >= 0 ? '+' : ''}${net.toLocaleString('vi-VN')}** xu`, inline: true },
          { name: '👛 Số dư ví', value: `**${w.balance.toLocaleString('vi-VN')}** xu`, inline: true },
        );
      await i.update({ embeds: [e], components: grid(true) });
    };

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} Đây không phải lượt chơi của bạn!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      if (ended) return i.deferUpdate();
      if (i.customId === 'mn_cash') return doCashOut(i);

      const idx = parseInt(i.customId.split('_')[1], 10);
      if (Number.isNaN(idx) || revealed.has(idx)) return i.deferUpdate();

      if (mines.has(idx)) {
        ended = true;
        collector.stop();
        const w = db.getWallet(ctx.author.id);
        const e = Embed.custom(colors.error, '💥 Nổ! Trúng mìn!',
          `Bạn đã mở **${revealed.size}** ô an toàn rồi dính mìn.\nMất **${bet.toLocaleString('vi-VN')}** xu.`)
          .addFields({ name: '👛 Số dư ví', value: `**${w.balance.toLocaleString('vi-VN')}** xu`, inline: true });
        return i.update({ embeds: [e], components: grid(true, idx) });
      }

      revealed.add(idx);
      if (revealed.size >= safeTotal) {
        ended = true;
        collector.stop();
        const pot = Math.floor(bet * curMult());
        const w = db.getWallet(ctx.author.id);
        w.balance += pot;
        if (pot > bet) quests.track(w, 'gambleWin', 1);
        if (pot > bet) quests.track(w, 'gambleProfit', pot - bet);
        db.saveWallet(ctx.author.id, w);
        const e = Embed.custom(colors.gold, '🏆 HOÀN HẢO! Mở hết ô an toàn!',
          `Hệ số x${curMult().toFixed(2)} — mang về **${pot.toLocaleString('vi-VN')}** xu!`)
          .addFields({ name: '👛 Số dư ví', value: `**${w.balance.toLocaleString('vi-VN')}** xu`, inline: true });
        return i.update({ embeds: [e], components: grid(true) });
      }
      await i.update({ embeds: [board(`\n✅ An toàn! Hệ số x${curMult().toFixed(2)}.`)], components: grid() });
    });

    collector.on('end', async () => {
      if (ended) return;
      const w = db.getWallet(ctx.author.id);
      if (revealed.size > 0) {
        const pot = Math.floor(bet * curMult());
        w.balance += pot;
        if (pot > bet) quests.track(w, 'gambleWin', 1);
        if (pot > bet) quests.track(w, 'gambleProfit', pot - bet);
        db.saveWallet(ctx.author.id, w);
        const e = Embed.custom(colors.info, '⏰ Hết giờ — tự động rút tiền',
          `Nhận **${pot.toLocaleString('vi-VN')}** xu (x${curMult().toFixed(2)}).\nSố dư ví: **${w.balance.toLocaleString('vi-VN')}** xu.`);
        msg.edit({ embeds: [e], components: grid(true) }).catch(() => {});
      } else {
        // Chưa mở ô nào mà hết giờ -> HOÀN LẠI tiền cược.
        // Trước đây người chơi bị mất trắng tiền cược dù chưa hề bấm ô nào.
        w.balance += bet;
        db.saveWallet(ctx.author.id, w);
        const e = Embed.custom(colors.info, '⏰ Hết giờ — đã hoàn tiền cược',
          `Bạn chưa mở ô nào nên **${bet.toLocaleString('vi-VN')}** xu tiền cược đã được hoàn lại.\nSố dư ví: **${w.balance.toLocaleString('vi-VN')}** xu.`);
        msg.edit({ embeds: [e], components: grid(true) }).catch(() => {});
      }
    });
  },
};
