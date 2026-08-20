// =============================================================
//  Lệnh: timeout - tạm khóa chat (mute) một thành viên có thời hạn
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const { guardTarget } = require('../../core/modGuard');

const MAX_MS = 28 * 24 * 60 * 60 * 1000; // Discord giới hạn 28 ngày

// Phân tích chuỗi thời gian: 10s / 5m / 2h / 1d (hoặc giây/phút/giờ/ngày)
function parseDuration(str) {
  if (!str) return null;
  const re = /(\d+)\s*(d|h|m|s|ngày|giờ|phút|giây)/gi;
  let ms = 0;
  let matched = false;
  let m;
  while ((m = re.exec(str)) !== null) {
    matched = true;
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    if (u === 'd' || u === 'ngày') ms += n * 86400000;
    else if (u === 'h' || u === 'giờ') ms += n * 3600000;
    else if (u === 'm' || u === 'phút') ms += n * 60000;
    else ms += n * 1000;
  }
  return matched ? ms : null;
}

module.exports = {
  name: 'timeout',
  aliases: ['mute', 'cambchat', 'phat'],
  category: 'moderation',
  description: 'Tạm khóa chat (timeout) một thành viên',
  usage: '<@thành_viên> <thời gian: 10m/2h/1d> [lý do]',
  cooldown: 4,
  guildOnly: true,
  permissions: ['ModerateMembers'],
  slash: true,
  options: [
    { name: 'thành_viên', type: 'user', description: 'Thành viên cần timeout', required: true },
    { name: 'thời_gian', type: 'string', description: 'Ví dụ: 30s, 10m, 2h, 1d', required: true },
    { name: 'lý_do', type: 'string', description: 'Lý do', required: false, rest: true },
  ],
  async run(ctx) {
    const member = await ctx.getMember('thành_viên');
    // Lá chắn chung: tự timeout mình / timeout bot / chủ máy chủ / người cấp cao hơn.
    const guard = guardTarget(ctx, member, 'timeout');
    if (!guard.ok) return ctx.reply({ embeds: [guard.embed] });
    if (!member.moderatable) return ctx.reply({ embeds: [Embed.error('Không thể timeout', 'Tôi không đủ quyền để timeout thành viên này.')] });

    const ms = parseDuration(ctx.getString('thời_gian'));
    if (!ms || ms < 5000) return ctx.reply({ embeds: [Embed.error('Thời gian không hợp lệ', 'Ví dụ: `30s`, `10m`, `2h`, `1d` (tối thiểu 5 giây).')] });
    if (ms > MAX_MS) return ctx.reply({ embeds: [Embed.error('Thời gian quá dài', 'Timeout tối đa là **28 ngày**.')] });

    // Discord: lý do audit-log tối đa 512 ký tự, field embed tối đa 1024 ký tự.
    const reason = (ctx.getString('lý_do') || 'Không có lý do').slice(0, 400);
    const ok = await member.timeout(ms, reason).then(() => true).catch(() => false);
    if (!ok) return ctx.reply({ embeds: [Embed.error('Thất bại', 'Không thể timeout thành viên này.')] });

    const until = Math.floor((Date.now() + ms) / 1000);
    const embed = Embed.custom(colors.orange, '🔇 Đã timeout thành viên')
      .addFields(
        { name: 'Thành viên', value: `${member.user.tag}`, inline: true },
        { name: 'Người thực hiện', value: `${ctx.author.tag}`, inline: true },
        { name: 'Hết hạn', value: `<t:${until}:R>`, inline: true },
        { name: 'Lý do', value: reason },
      );
    await ctx.reply({ embeds: [embed] });
    member.send({ embeds: [Embed.warn(`Bạn bị timeout tại ${ctx.guild.name}`, `Thời hạn: hết <t:${until}:R>\nLý do: ${reason}`)] }).catch(() => {});
  },
};
