// =============================================================
//  Lệnh: ping - kiểm tra độ trễ của bot
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

function quality(ms) {
  if (ms < 120) return '🟢 Tuyệt vời';
  if (ms < 250) return '🟡 Ổn định';
  return '🔴 Hơi chậm';
}

module.exports = {
  name: 'ping',
  aliases: ['pong', 'latency', 'do-tre'],
  category: 'info',
  description: 'Kiểm tra độ trễ (ping) của bot',
  cooldown: 5,
  slash: true,
  async run(ctx) {
    const sent = await ctx.reply({ embeds: [Embed.custom(colors.info, '🏓 Đang đo...', 'Vui lòng chờ một chút...')] });
    // sent có thể là null (ví dụ bị chặn quyền) -> tránh in ra NaN.
    const startedAt = ctx.isSlash ? ctx.interaction.createdTimestamp : ctx.message.createdTimestamp;
    const rttRaw = sent && sent.createdTimestamp ? sent.createdTimestamp - startedAt : NaN;
    const rtt = Number.isFinite(rttRaw) ? Math.max(0, rttRaw) : null;
    const ws = Math.round(ctx.client.ws.ping);

    const embed = Embed.custom(colors.success, '🏓 Pong!')
      .addFields(
        { name: '📨 Độ trễ tin nhắn', value: rtt === null ? '`N/A`\n⏳ Đang tính' : `\`${rtt}ms\`\n${quality(rtt)}`, inline: true },
        { name: '📡 Độ trễ API', value: `\`${ws < 0 ? 'N/A' : ws + 'ms'}\`\n${ws < 0 ? '⏳ Đang tính' : quality(ws)}`, inline: true },
      );
    if (!sent || typeof sent.edit !== 'function') return;
    await sent.edit({ embeds: [embed] }).catch(() => {});
  },
};
