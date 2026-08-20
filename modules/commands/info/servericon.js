// =============================================================
//  Lệnh: servericon - xem/tải ảnh đại diện của máy chủ
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');

module.exports = {
  name: 'servericon',
  aliases: ['icon', 'anhserver', 'guildicon'],
  category: 'info',
  description: 'Xem ảnh đại diện (icon) của máy chủ',
  usage: '',
  cooldown: 4,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    const icon = ctx.guild.iconURL({ size: 1024 });
    if (!icon) {
      return ctx.reply({ embeds: [Embed.warn('Không có icon', 'Máy chủ này chưa đặt ảnh đại diện.')] });
    }

    const embed = Embed.custom(colors.primary, `${emoji.sparkles} Icon của ${ctx.guild.name}`).setImage(icon);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Mở ảnh gốc').setStyle(ButtonStyle.Link).setURL(icon),
    );
    await ctx.reply({ embeds: [embed], components: [row] });
  },
};
