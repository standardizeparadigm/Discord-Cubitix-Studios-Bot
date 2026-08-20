// =============================================================
//  Lệnh: remind - đặt nhắc nhở sau một khoảng thời gian
//  Lưu ý: nhắc nhở chạy bằng bộ nhớ tạm, sẽ mất nếu bot khởi động lại.
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');

const MAX_MS = 7 * 24 * 60 * 60 * 1000; // tối đa 7 ngày

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
  return matched ? { ms, rest: str.replace(re, '').trim() } : null;
}

module.exports = {
  name: 'remind',
  aliases: ['remindme', 'nhac', 'nhacnho'],
  category: 'utility',
  description: 'Đặt nhắc nhở sau một khoảng thời gian',
  usage: '<thời gian: 10m/1h/1d> <nội dung>',
  cooldown: 4,
  slash: true,
  options: [
    { name: 'thời_gian', type: 'string', description: 'Ví dụ: 30s, 10m, 2h, 1d', required: true },
    { name: 'nội_dung', type: 'string', description: 'Nội dung cần nhắc', required: true, rest: true },
  ],
  async run(ctx) {
    // Ở prefix, thời gian là từ đầu tiên, phần còn lại là nội dung.
    const timeArg = ctx.getString('thời_gian');
    const parsed = parseDuration(timeArg);
    if (!parsed || parsed.ms < 5000) {
      return ctx.reply({ embeds: [Embed.error('Thời gian không hợp lệ', 'Ví dụ: `!remind 10m Uống nước` (tối thiểu 5 giây).')] });
    }
    if (parsed.ms > MAX_MS) {
      return ctx.reply({ embeds: [Embed.error('Thời gian quá dài', 'Nhắc nhở tối đa **7 ngày**.')] });
    }

    // nội dung: ở slash là option riêng; ở prefix lấy phần còn lại sau tham số thời gian.
    // (Trước đây dùng parsed.rest — vốn luôn rỗng vì chỉ phân tích 1 từ đầu -> mất nội dung.)
    let content = ctx.isSlash ? ctx.getString('nội_dung') : ctx.args.slice(1).join(' ').trim() || parsed.rest;
    if (!content) content = 'Bạn có một lời nhắc!';
    content = content.slice(0, 1000);

    const when = Math.floor((Date.now() + parsed.ms) / 1000);
    await ctx.reply({
      embeds: [Embed.custom(colors.info, `${emoji.bell} Đã đặt nhắc nhở`, `Tôi sẽ nhắc bạn **<t:${when}:R>**:\n> ${content}`)],
    });

    const channel = ctx.channel;
    const userId = ctx.author.id;
    setTimeout(() => {
      const embed = Embed.custom(colors.gold, `${emoji.bell} Nhắc nhở!`, content)
        .setFooter({ text: 'Đã đến giờ bạn đặt nhắc' });
      channel.send({ content: `<@${userId}>`, embeds: [embed] }).catch(() => {});
    }, parsed.ms);
  },
};
