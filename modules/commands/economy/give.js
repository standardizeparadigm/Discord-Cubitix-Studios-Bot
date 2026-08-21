// =============================================================
//  Lệnh: give - chuyển (cho) xu cho người chơi khác
//  Có XÁC NHẬN tương tác: 2 nút Có / Không, 10 phút để quyết định.
//  Hết giờ hoặc bấm Không -> tự hủy, KHÔNG trừ xu.
//  An toàn: chỉ chuyển được số xu đang có, không tự chuyển cho
//  chính mình, không chuyển cho bot, số xu phải > 0. Chỉ xu
//  được trừ khi người gửi bấm XÁC NHẬN.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const quests = require('../../core/questLogic');
const abuseGuard = require('../../core/abuseGuard');

const CONFIRM_MS = 10 * 60 * 1000; // 10 phút để quyết định

// Chuyển chuỗi người dùng nhập -> số xu.
//  - Hỗ trợ 'all' / 'hết' / 'max' = toàn bộ số dư.
//  - Cho phép dấu phân cách như 10.000 hoặc 10,000.
function parseAmount(raw, balance) {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
  if (['all', 'hết', 'het', 'tatca', 'tấtcả', 'max', 'full'].includes(s)) return balance;
  const cleaned = s.replace(/[.,]/g, '');
  if (!/^\d+$/.test(cleaned)) return null;
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}

function fmt(n) {
  return n.toLocaleString('vi-VN');
}

// Hàng nút Xác nhận / Hủy (disabled = vô hiệu hoá sau khi xong).
function confirmRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('give_yes').setLabel('Có, chuyển').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId('give_no').setLabel('Không, hủy').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );
}

module.exports = {
  name: 'give',
  aliases: ['cho', 'pay', 'transfer', 'gui', 'tang'],
  category: 'economy',
  description: 'Chuyển xu cho một người chơi khác (có xác nhận)',
  usage: '<@thành_viên> <số_xu | all>',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  options: [
    { name: 'thành_viên', type: 'user', description: 'Người bạn muốn cho xu', required: true },
    { name: 'số_xu', type: 'string', description: "Số xu muốn cho (hoặc 'all' để cho hết)", required: true },
  ],
  async run(ctx) {
    const target = ctx.getUser('thành_viên');
    const senderWallet = db.getWallet(ctx.author.id);

    // --- Xác định số xu (prefix: dự phòng quét các tham số nếu thứ tự bị đảo) ---
    let amount = parseAmount(ctx.getString('số_xu'), senderWallet.balance);
    if (amount === null && !ctx.isSlash) {
      for (const tok of ctx.args) {
        const a = parseAmount(tok, senderWallet.balance);
        if (a !== null) { amount = a; break; }
      }
    }

    // --- Kiểm tra hợp lệ ---
    if (!target) {
      return ctx.reply({ embeds: [Embed.error('Thiếu người nhận', 'Bạn cần tag người muốn cho xu. Ví dụ: `give @người 500`')] });
    }
    if (target.id === ctx.author.id) {
      return ctx.reply({ embeds: [Embed.error('Không hợp lệ', 'Bạn không thể tự chuyển xu cho chính mình.')] });
    }
    if (target.bot) {
      return ctx.reply({ embeds: [Embed.error('Không hợp lệ', 'Bạn không thể chuyển xu cho bot.')] });
    }
    if (amount === null) {
      return ctx.reply({ embeds: [Embed.error('Số xu không hợp lệ', 'Hãy nhập một số nguyên hợp lệ hoặc `all`. Ví dụ: `give @người 500`')] });
    }
    if (amount < 1) {
      return ctx.reply({ embeds: [Embed.error('Số xu không hợp lệ', 'Số xu phải lớn hơn 0.')] });
    }
    if (amount > senderWallet.balance) {
      return ctx.reply({ embeds: [Embed.error('Không đủ xu', `Bạn chỉ có **${fmt(senderWallet.balance)}** xu.`)] });
    }

    // --- Hệ thống chống acc clone: chặn dồn xu về một tài khoản chính ---
    // Đây là mánh phổ biến nhất: tạo hàng loạt acc clone, cày xu rồi
    // chuyển hết về acc chính. Kiểm tra ngay trước khi hiện bảng xác nhận.
    const guardCheck = abuseGuard.checkTransfer(ctx.client, ctx.author.id, target.id, amount);
    if (!guardCheck.ok) {
      return ctx.reply({ embeds: [Embed.error(guardCheck.title, guardCheck.reason)] });
    }

    // --- Embed XÁC NHẬN (chưa trừ xu) ---
    const balance = senderWallet.balance;
    const after = balance - amount;
    const confirmEmbed = Embed.custom(colors.warning, `${emoji.coin} Xác nhận chuyển xu`)
      .setDescription(`Bạn có chắc muốn chuyển xu cho <@${target.id}> không? Hãy chọn bên dưới.`)
      .addFields(
        { name: '👤 Người gửi', value: `**${ctx.author.username}**`, inline: true },
        { name: '🎁 Người nhận', value: `**${target.username}**`, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: `${emoji.coin} Số xu chuyển`, value: `**${fmt(amount)}** xu`, inline: true },
        { name: '👛 Ví hiện tại', value: `**${fmt(balance)}** xu`, inline: true },
        { name: '📉 Ví sau khi chuyển', value: `**${fmt(after)}** xu`, inline: true },
      )
      .setFooter({ text: 'Còn 10 phút để quyết định • Xu chưa bị trừ' });

    const msg = await ctx.reply({ embeds: [confirmEmbed], components: [confirmRow(false)] });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: CONFIRM_MS });
    let settled = false;

    collector.on('collect', async (i) => {
      // Chỉ người gửi mới được bấm nút
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} Đây không phải giao dịch của bạn!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }

      // --- Bấm KHÔNG: hủy, không trừ xu ---
      if (i.customId === 'give_no') {
        settled = true;
        collector.stop('cancelled');
        const cancelEmbed = Embed.custom(colors.dark, `${emoji.error} Đã hủy chuyển xu`)
          .setDescription('Bạn đã hủy giao dịch. **Không có xu nào bị trừ.**')
          .setFooter({ text: 'Chuyển xu • Cubitix Studios' });
        return i.update({ embeds: [cancelEmbed], components: [confirmRow(true)] });
      }

      // --- Bấm CÓ: thực hiện chuyển ---
      settled = true;
      collector.stop('confirmed');

      // Kiểm tra lại số dư ngay trước khi trừ (phòng khi đã tiêu trong 10 phút)
      const senderNow = db.getWallet(ctx.author.id);
      if (senderNow.balance < amount) {
        const insEmbed = Embed.custom(colors.error, `${emoji.error} Không đủ xu`)
          .setDescription(`Số dư của bạn đã thay đổi, chỉ còn **${fmt(senderNow.balance)}** xu nên không thể chuyển **${fmt(amount)}** xu.\n**Không có xu nào bị trừ.**`)
          .setFooter({ text: 'Chuyển xu • Cubitix Studios' });
        return i.update({ embeds: [insEmbed], components: [confirmRow(true)] });
      }

      // Kiểm tra lại chống gian lận: 10 phút chờ có thể đủ để tài khoản bị đánh dấu.
      const guardRecheck = abuseGuard.checkTransfer(ctx.client, ctx.author.id, target.id, amount);
      if (!guardRecheck.ok) {
        const blockEmbed = Embed.custom(colors.error, `${emoji.error} ${guardRecheck.title}`)
          .setDescription(guardRecheck.reason + '\n**Không có xu nào bị trừ.**')
          .setFooter({ text: 'Chuyển xu • Cubitix Studios' });
        return i.update({ embeds: [blockEmbed], components: [confirmRow(true)] });
      }

      const receiverWallet = db.getWallet(target.id);
      senderNow.balance -= amount;
      receiverWallet.balance += amount;
      quests.track(senderNow, 'give', amount);
      quests.track(senderNow, 'giveCount', 1);
      db.saveWallet(ctx.author.id, senderNow);
      db.saveWallet(target.id, receiverWallet);

      // Ghi lại dòng chuyển xu để hệ thống chống acc clone dựng sơ đồ "ai dồn xu cho ai".
      try {
        abuseGuard.noteTransfer(ctx.client, ctx.author.id, target.id, amount);
      } catch {
        /* bỏ qua - không được làm hỏng giao dịch đã thành công */
      }

      const okEmbed = Embed.custom(colors.gold, `${emoji.coin} Chuyển xu thành công`)
        .setDescription(`**${ctx.author.username}** đã cho <@${target.id}> **${fmt(amount)}** xu ${emoji.sparkles}`)
        .addFields(
          { name: '👛 Ví của bạn', value: `**${fmt(senderNow.balance)}** xu`, inline: true },
          { name: `🎁 Ví của ${target.username}`, value: `**${fmt(receiverWallet.balance)}** xu`, inline: true },
        )
        .setFooter({ text: 'Chuyển xu • Cubitix Studios' });
      return i.update({ embeds: [okEmbed], components: [confirmRow(true)] });
    });

    collector.on('end', () => {
      // Nếu đã xử lý (Có/Không) thì không làm gì thêm
      if (settled) return;
      // Hết 10 phút -> tự hủy, không trừ xu
      const timeoutEmbed = Embed.custom(colors.dark, `${emoji.warning} Đã hết thời gian`)
        .setDescription('Yêu cầu chuyển xu đã tự hủy sau **10 phút**. **Không có xu nào bị trừ.**')
        .setFooter({ text: 'Chuyển xu • Cubitix Studios' });
      msg.edit({ embeds: [timeoutEmbed], components: [confirmRow(true)] }).catch(() => {});
    });
  },
};
