// =============================================================
//  Lệnh: members - liệt kê thành viên của máy chủ bot đang tham gia
//  Cú pháp: members [ID máy chủ | all]
//    - bỏ trống  -> máy chủ hiện tại
//    - <ID>      -> máy chủ có ID đó (bot phải đang ở trong)
//    - all       -> gộp thành viên của TẤT CẢ máy chủ
//  Chỉ dành cho chủ bot (ownerOnly). Có phân trang bằng nút bấm.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');

const PER_PAGE = 20;

module.exports = {
  name: 'members',
  aliases: ['thanhvien', 'memberlist', 'allmembers'],
  category: 'owner',
  description: 'Liệt kê thành viên của một máy chủ (theo ID) hoặc "all" cho tất cả (chỉ chủ bot)',
  usage: '[ID máy chủ | all]',
  cooldown: 8,
  ownerOnly: true,
  slash: true,
  options: [{ name: 'server', type: 'string', description: 'ID máy chủ, hoặc "all" cho mọi máy chủ (bỏ trống = máy chủ hiện tại)', required: false }],
  async run(ctx) {
    await ctx.defer();
    const client = ctx.client;
    const arg = (ctx.getString('server') || '').trim();

    // --- Xác định danh sách máy chủ cần liệt kê ---
    let targetGuilds = [];
    if (arg.toLowerCase() === 'all') {
      targetGuilds = [...client.guilds.cache.values()];
    } else if (arg) {
      const g = client.guilds.cache.get(arg);
      if (!g) {
        return ctx.reply({ embeds: [Embed.error('Không tìm thấy máy chủ', `Bot không ở trong máy chủ có ID \`${arg}\`. Dùng lệnh \`servers\` để xem danh sách ID.`)] });
      }
      targetGuilds = [g];
    } else if (ctx.guild) {
      targetGuilds = [ctx.guild];
    } else {
      return ctx.reply({ embeds: [Embed.error('Thiếu thông tin', 'Hãy cung cấp ID máy chủ hoặc `all`. Dùng lệnh `servers` để xem danh sách ID.')] });
    }

    // --- Thu thập thành viên (xử lý lỗi từng máy chủ) ---
    const entries = [];
    let failed = 0;
    for (const g of targetGuilds) {
      try {
        const fetched = await g.members.fetch();
        for (const m of fetched.values()) {
          entries.push({ tag: m.user.tag, id: m.id, bot: m.user.bot, guild: g.name });
        }
      } catch {
        failed++;
      }
    }

    if (entries.length === 0) {
      return ctx.reply({ embeds: [Embed.info('Không có dữ liệu', 'Không lấy được thành viên nào. Có thể bot thiếu Intent "Server Members" trong Developer Portal.')] });
    }

    // Người thật trước, bot sau; trong mỗi nhóm sắp theo tên
    entries.sort((a, b) => (Number(a.bot) - Number(b.bot)) || a.tag.localeCompare(b.tag));

    const multi = targetGuilds.length > 1;
    const bots = entries.filter((e) => e.bot).length;
    const humans = entries.length - bots;
    const totalPages = Math.ceil(entries.length / PER_PAGE);
    let page = 0;
    const title = multi ? `👥 Thành viên của toàn bộ ${targetGuilds.length} máy chủ` : `👥 Thành viên • ${targetGuilds[0].name}`;

    const render = () => {
      const start = page * PER_PAGE;
      const slice = entries.slice(start, start + PER_PAGE);
      const lines = slice.map((e, i) => {
        const badge = e.bot ? '🤖' : '👤';
        const suffix = multi ? ` — *${e.guild}*` : '';
        return `\`${String(start + i + 1).padStart(3, ' ')}.\` ${badge} ${e.tag} \`${e.id}\`${suffix}`;
      });
      return Embed.custom(colors.info, title,
        `Tổng **${entries.length.toLocaleString('vi-VN')}** thành viên • 👤 ${humans.toLocaleString('vi-VN')} người • 🤖 ${bots.toLocaleString('vi-VN')} bot${failed ? ` • ⚠️ ${failed} máy chủ lỗi` : ''}\n\n${lines.join('\n')}`)
        .setFooter({ text: `Trang ${page + 1}/${totalPages}` });
    };

    const buttons = (disabled = false) => new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mb_prev').setLabel('Trước').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page === 0),
      new ButtonBuilder().setCustomId('mb_next').setLabel('Sau').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= totalPages - 1),
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
      if (i.customId === 'mb_prev' && page > 0) page--;
      else if (i.customId === 'mb_next' && page < totalPages - 1) page++;
      await i.update({ embeds: [render()], components: [buttons()] });
    });
    collector.on('end', () => {
      if (ended) return;
      ended = true;
      msg.edit({ components: [buttons(true)] }).catch(() => {});
    });
  },
};
