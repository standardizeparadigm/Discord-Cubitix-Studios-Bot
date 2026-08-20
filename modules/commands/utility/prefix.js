// =============================================================
//  Lệnh: prefix - xem / đổi prefix riêng cho từng máy chủ
//  - Lưu theo từng server (guildSettings.json)
//  - Áp dụng NGAY LẬP TỨC, không cần khởi động lại bot
//  - Chỉ người có quyền "Quản lý máy chủ" mới đổi được
// =============================================================
const { PermissionsBitField } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');

const MAX_LEN = 5;
const RESET_WORDS = ['reset', 'macdinh', 'default', 'mặc định', 'mac dinh'];

// Prefix hợp lệ: 1-5 ký tự, không khoảng trắng, không dùng ký tự dễ gây rối.
function isValidPrefix(p) {
  if (!p) return false;
  if (p.length > MAX_LEN) return false;
  if (/\s/.test(p)) return false;
  if (/[`@#]/.test(p)) return false;
  return true;
}

module.exports = {
  name: 'prefix',
  aliases: ['setprefix', 'doiprefix'],
  category: 'utility',
  description: 'Xem hoặc đổi prefix riêng cho máy chủ này',
  usage: '[prefix mới | reset]',
  cooldown: 4,
  guildOnly: true,
  slash: true,
  options: [
    { name: 'prefix_moi', type: 'string', description: "Prefix mới (hoặc 'reset' để về mặc định)", required: false },
  ],
  async run(ctx) {
    const defaultPrefix = ctx.client.config.prefix;
    const current = db.getPrefix(ctx.guild.id) || defaultPrefix;

    let input = ctx.getString('prefix_moi');
    if (input == null && !ctx.isSlash) input = ctx.args.join(' ');
    input = (input || '').trim();

    // --- Không nhập gì -> xem prefix hiện tại ---
    if (!input) {
      const e = Embed.custom(colors.info, emoji.info + ' Prefix của máy chủ',
        'Prefix hiện tại: \`' + current + '\`\n\n' +
        emoji.right + ' Đổi prefix: \`' + current + 'prefix <prefix mới>\`\n' +
        emoji.right + ' Về mặc định: \`' + current + 'prefix reset\`\n' +
        emoji.right + ' Nếu quên prefix, bạn luôn có thể tag bot để gọi lệnh.')
        .setFooter({ text: 'Chỉ người có quyền Quản lý máy chủ mới đổi được • Cubitix Studios' });
      return ctx.reply({ embeds: [e] });
    }

    // --- Muốn thay đổi -> cần quyền Quản lý máy chủ ---
    const canManage =
      ctx.member && ctx.member.permissions && ctx.member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    if (!canManage) {
      return ctx.reply({
        embeds: [Embed.error('Thiếu quyền', 'Bạn cần quyền **Quản lý máy chủ (Manage Server)** để đổi prefix.')],
      });
    }

    // --- Đặt lại về mặc định ---
    if (RESET_WORDS.includes(input.toLowerCase())) {
      db.resetPrefix(ctx.guild.id);
      const e = Embed.custom(colors.success, emoji.success + ' Đã đặt lại prefix',
        'Prefix đã trở về mặc định: \`' + defaultPrefix + '\`\n' +
        'Áp dụng ngay lập tức — thử gõ \`' + defaultPrefix + 'help\`.');
      return ctx.reply({ embeds: [e] });
    }

    // --- Đổi sang prefix mới ---
    const newPrefix = input.split(/\s+/)[0]; // chỉ lấy phần đầu, phòng khi gõ dư
    if (!isValidPrefix(newPrefix)) {
      return ctx.reply({
        embeds: [Embed.error('Prefix không hợp lệ',
          'Prefix phải dài 1–' + MAX_LEN + ' ký tự, không chứa khoảng trắng và không dùng các ký tự @ # hay dấu backtick.')],
      });
    }
    if (newPrefix === current) {
      return ctx.reply({
        embeds: [Embed.warn('Không có gì thay đổi', 'Prefix của máy chủ vốn đã là \`' + current + '\`.')],
      });
    }

    db.setPrefix(ctx.guild.id, newPrefix);
    const e = Embed.custom(colors.success, emoji.success + ' Đã đổi prefix',
      'Prefix mới của máy chủ: \`' + newPrefix + '\`\n\n' +
      emoji.right + ' Áp dụng **ngay lập tức**, không cần khởi động lại bot.\n' +
      emoji.right + ' Thử ngay: \`' + newPrefix + 'help\`')
      .addFields(
        { name: 'Trước', value: '\`' + current + '\`', inline: true },
        { name: 'Sau', value: '\`' + newPrefix + '\`', inline: true },
      )
      .setFooter({ text: 'Đổi prefix • Cubitix Studios' });
    await ctx.reply({ embeds: [e] });
  },
};
