// =============================================================
//  Lệnh: servers - liệt kê TẤT CẢ máy chủ mà bot đang tham gia
//  Chỉ dành cho chủ bot (ownerOnly). Có phân trang bằng nút bấm.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');

const PER_PAGE = 10;

module.exports = {
  name: 'servers',
  aliases: ['guilds', 'danhsachserver', 'allservers'],
  category: 'owner',
  description: 'Liệt kê tất cả máy chủ mà bot đang tham gia (chỉ chủ bot)',
  usage: '',
  cooldown: 5,
  ownerOnly: true,
  slash: true,
  async run(ctx) {
    await ctx.defer();
    const client = ctx.client;
    const guilds = [...client.guilds.cache.values()].sort(
      (a, b) => (b.memberCount || 0) - (a.memberCount || 0),
    );
    const totalMembers = guilds.reduce((sum, g) => sum + (g.memberCount || 0), 0);

    if (guilds.length === 0) {
      return ctx.reply({ embeds: [Embed.info('Không có máy chủ', 'Bot hiện chưa tham gia máy chủ nào.')] });
    }

    const totalPages = Math.ceil(guilds.length / PER_PAGE);
    let page = 0;

    const render = () => {
      const start = page * PER_PAGE;
      const slice = guilds.slice(start, start + PER_PAGE);
      const lines = slice.map((g, i) =>
        `**${start + i + 1}. ${g.name}**\n\`${g.id}\` • 👥 ${(g.memberCount || 0).toLocaleString('vi-VN')} thành viên • 👑 <@${g.ownerId}>`,
      );
      return Embed.custom(colors.info, `🌐 Máy chủ của bot (${guilds.length})`,
        `Tổng cộng **${guilds.length}** máy chủ • **${totalMembers.toLocaleString('vi-VN')}** thành viên (có thể trùng người ở nhiều máy chủ).\n\n${lines.join('\n\n')}`)
        .setFooter({ text: `Trang ${page + 1}/${totalPages} • Dùng "members <ID>" để xem thành viên` });
    };

    const buttons = (disabled = false) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sv_prev').setLabel('Trước').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page === 0),
      new ButtonBuilder().setCustomId('sv_next').setLabel('Sau').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= totalPages - 1),
    );

    const msg = await ctx.reply({ embeds: [render()], components: totalPages > 1 ? [buttons()] : [] });
    if (totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
    let ended = false;
    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} Đây không phải menu của bạn!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      if (ended) return i.deferUpdate();
      if (i.customId === 'sv_prev' && page > 0) page--;
      else if (i.customId === 'sv_next' && page < totalPages - 1) page++;
      await i.update({ embeds: [render()], components: [buttons()] });
    });
    collector.on('end', () => {
      if (ended) return;
      ended = true;
      msg.edit({ components: [buttons(true)] }).catch(() => {});
    });
  },
};
