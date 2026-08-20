// =============================================================
//  Lệnh: setstatus - đặt trạng thái & hoạt động cho bot (CHỈ CHỦ BOT)
//  Khi đặt thủ công, trạng thái xoay vòng tự động sẽ tạm dừng.
//  Dùng "auto" để bật lại chế độ xoay vòng.
// =============================================================
const { ActivityType } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

const STATUS_MAP = {
  online: { key: 'online', label: '🟢 Trực tuyến' },
  idle: { key: 'idle', label: '🌙 Chờ' },
  dnd: { key: 'dnd', label: '⛔ Bận' },
  invisible: { key: 'invisible', label: '⚫ Ẩn' },
};

module.exports = {
  name: 'setstatus',
  aliases: ['presence', 'botstatus'],
  category: 'owner',
  description: 'Đặt trạng thái & hoạt động cho bot (chỉ chủ bot)',
  usage: '<online|idle|dnd|invisible|auto> [nội dung hoạt động]',
  cooldown: 3,
  ownerOnly: true,
  slash: true,
  options: [
    { name: 'trạng_thái', type: 'string', description: 'Trạng thái: online, idle, dnd, invisible, hoặc auto', required: true },
    { name: 'hoạt_động', type: 'string', description: 'Nội dung hoạt động (bỏ trống = không có)', required: false, rest: true },
  ],
  async run(ctx) {
    const client = ctx.client;
    const raw = (ctx.getString('trạng_thái') || '').trim().toLowerCase();

    // --- Bật lại chế độ xoay vòng tự động ---
    if (raw === 'auto') {
      client.presenceLocked = false;
      return ctx.reply({ embeds: [Embed.success('Đã bật xoay vòng', 'Trạng thái sẽ tự động xoay vòng trở lại trong giây lát.')] });
    }

    const st = STATUS_MAP[raw];
    if (!st) {
      return ctx.reply({ embeds: [Embed.error('Trạng thái không hợp lệ', 'Chọn một trong: `online`, `idle`, `dnd`, `invisible`, `auto`.')] });
    }

    const text = ctx.getString('hoạt_động');
    try {
      client.presenceLocked = true; // tạm dừng xoay vòng để giữ trạng thái thủ công
      client.user.setPresence({
        status: st.key,
        activities: text ? [{ name: text.slice(0, 128), type: ActivityType.Playing }] : [],
      });
    } catch (err) {
      client.presenceLocked = false;
      return ctx.reply({ embeds: [Embed.error('Thất bại', 'Không thể đặt trạng thái: ' + err.message)] });
    }

    const embed = Embed.custom(colors.success, '🎛️ Đã cập nhật trạng thái')
      .addFields(
        { name: 'Trạng thái', value: st.label, inline: true },
        { name: 'Hoạt động', value: text ? `Đang chơi **${text.slice(0, 128)}**` : 'Không có', inline: true },
      )
      .setFooter({ text: 'Dùng "setstatus auto" để bật lại xoay vòng tự động' });
    await ctx.reply({ embeds: [embed] });
  },
};
