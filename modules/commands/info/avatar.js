// =============================================================
//  Lệnh: avatar - xem ảnh đại diện (có nút tải theo định dạng)
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');

module.exports = {
  name: 'avatar',
  aliases: ['av', 'pfp', 'anhdaidien'],
  category: 'info',
  description: 'Xem ảnh đại diện của bạn hoặc người khác',
  usage: '[@thành_viên]',
  cooldown: 3,
  slash: true,
  options: [
    { name: 'thành_viên', type: 'user', description: 'Người muốn xem ảnh đại diện', required: false },
  ],
  async run(ctx) {
    const target = ctx.getUser('thành_viên') || ctx.author;

    // Avatar mặc định (người dùng chưa đặt ảnh) chỉ có định dạng PNG.
    // Avatar bắt đầu bằng "a_" là ảnh động (GIF).
    const hasAvatar = Boolean(target.avatar);
    const isAnimated = hasAvatar && target.avatar.startsWith('a_');
    const base = target.displayAvatarURL({ size: 1024 });

    const formats = [];
    if (isAnimated) formats.push({ label: 'GIF', emoji: '🎬', ext: 'gif' });
    formats.push({ label: 'PNG', emoji: '🖼️', ext: 'png' });
    if (hasAvatar) {
      formats.push({ label: 'JPG', emoji: null, ext: 'jpg' });
      formats.push({ label: 'WEBP', emoji: null, ext: 'webp' });
    }

    const embed = Embed.custom(colors.primary, `${emoji.sparkles} Ảnh đại diện của ${target.username}`)
      .setImage(base)
      .setDescription('Nhấn nút bên dưới để tải ảnh theo định dạng bạn muốn.');

    const row = new ActionRowBuilder().addComponents(
      ...formats.map((f) => {
        const btn = new ButtonBuilder()
          .setLabel(f.label)
          .setStyle(ButtonStyle.Link)
          .setURL(target.displayAvatarURL({ size: 1024, extension: f.ext }));
        if (f.emoji) btn.setEmoji(f.emoji);
        return btn;
      }),
    );

    await ctx.reply({ embeds: [embed], components: [row] });
  },
};
