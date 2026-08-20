// =============================================================
//  Lệnh: leaveguild - cho bot rời khỏi một máy chủ (CHỈ CHỦ BOT)
//  Có xác nhận 2 nút. Hết 60 giây tự hủy.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');

const CONFIRM_MS = 60 * 1000;

function row(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('lg_yes').setLabel('Rời máy chủ').setEmoji('🚪').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('lg_no').setLabel('Hủy').setEmoji('❌').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );
}

module.exports = {
  name: 'leaveguild',
  aliases: ['leaveserver', 'roiserver'],
  category: 'owner',
  description: 'Cho bot rời khỏi một máy chủ theo ID (chỉ chủ bot)',
  usage: '<ID máy chủ>',
  cooldown: 5,
  ownerOnly: true,
  slash: true,
  options: [{ name: 'server', type: 'string', description: 'ID máy chủ cần rời', required: true }],
  async run(ctx) {
    const client = ctx.client;
    const id = (ctx.getString('server') || '').trim();
    const guild = client.guilds.cache.get(id);
    if (!guild) {
      return ctx.reply({ embeds: [Embed.error('Không tìm thấy máy chủ', `Bot không ở trong máy chủ có ID \`${id}\`. Dùng \`servers\` để xem danh sách.`)] });
    }

    const info = Embed.custom(colors.warning, '⚠️ Xác nhận rời máy chủ')
      .setDescription('Bạn có chắc muốn cho bot **rời khỏi** máy chủ dưới đây không?')
      .addFields(
        { name: 'Máy chủ', value: `**${guild.name}**`, inline: true },
        { name: 'ID', value: `\`${guild.id}\``, inline: true },
        { name: 'Thành viên', value: `${(guild.memberCount || 0).toLocaleString('vi-VN')}`, inline: true },
      )
      .setFooter({ text: 'Còn 60 giây để quyết định' });

    const msg = await ctx.reply({ embeds: [info], components: [row(false)] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: CONFIRM_MS });
    let settled = false;

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} Đây không phải thao tác của bạn!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      if (i.customId === 'lg_no') {
        settled = true;
        collector.stop();
        return i.update({ embeds: [Embed.custom(colors.dark, '❌ Đã hủy', 'Bot vẫn ở lại máy chủ.')], components: [row(true)] });
      }
      settled = true;
      collector.stop();
      const name = guild.name;
      const left = await guild.leave().then(() => true).catch(() => false);
      const done = left
        ? Embed.custom(colors.success, '🚪 Đã rời máy chủ', `Bot đã rời khỏi **${name}**.`)
        : Embed.error('Thất bại', 'Không thể rời khỏi máy chủ này. (Bot có thể là chủ máy chủ.)');
      return i.update({ embeds: [done], components: [row(true)] });
    });

    collector.on('end', () => {
      if (settled) return;
      msg.edit({ embeds: [Embed.custom(colors.dark, '⌛ Đã hết thời gian', 'Đã tự hủy sau 60 giây. Bot vẫn ở lại máy chủ.')], components: [row(true)] }).catch(() => {});
    });
  },
};
