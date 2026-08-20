// =============================================================
//  Lệnh: antispam - bật/tắt hệ thống chống spam của máy chủ
//  Cần quyền Quản lý máy chủ (ManageGuild).
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const db = require('../../core/Database');

const ON_WORDS = ['on', 'bat', 'bật', 'enable', 'true', '1'];
const OFF_WORDS = ['off', 'tat', 'tắt', 'disable', 'false', '0'];

module.exports = {
  name: 'antispam',
  aliases: ['chongspam', 'antspam'],
  category: 'moderation',
  description: 'Bật/tắt hệ thống chống spam của máy chủ',
  usage: '[on | off | status]',
  cooldown: 3,
  guildOnly: true,
  permissions: ['ManageGuild'],
  slash: true,
  options: [
    { name: 'trang_thai', type: 'string', description: 'on | off | status', required: false },
  ],
  async run(ctx) {
    const raw = (ctx.getString('trang_thai') || '').trim().toLowerCase();
    const cur = db.isAntiSpamEnabled(ctx.guild.id);

    if (!raw || raw === 'status' || raw === 'trangthai') {
      return ctx.reply({
        embeds: [Embed.custom(cur ? colors.success : colors.dark, '\ud83d\udee1\ufe0f Chống spam',
          `Trạng thái hiện tại: **${cur ? 'ĐANG BẬT ✅' : 'ĐANG TẮT ❌'}**.\nDùng \`antispam on\` hoặc \`antispam off\` để thay đổi.`)],
      });
    }

    if (ON_WORDS.includes(raw)) {
      db.setAntiSpamEnabled(ctx.guild.id, true);
      return ctx.reply({ embeds: [Embed.custom(colors.success, '\ud83d\udee1\ufe0f Đã BẬT chống spam', 'Từ giờ bot sẽ tự động cảnh cáo và tạm khóa người spam.')] });
    }
    if (OFF_WORDS.includes(raw)) {
      db.setAntiSpamEnabled(ctx.guild.id, false);
      return ctx.reply({ embeds: [Embed.warn('\ud83d\udee1\ufe0f Đã TẮT chống spam', 'Hệ thống chống spam đã được tắt cho máy chủ này.')] });
    }
    return ctx.reply({ embeds: [Embed.error('Không hiểu lựa chọn', 'Hãy dùng: `antispam on`, `antispam off`, hoặc `antispam status`.')] });
  },
};
