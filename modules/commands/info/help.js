// =============================================================
//  Lệnh: help - menu trợ giúp tương tác (menu chọn + nút Trang chủ)
// =============================================================
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');

const CATEGORY_META = {
  info: { emoji: 'ℹ️', label: 'Thông tin' },
  fun: { emoji: '🎉', label: 'Giải trí' },
  utility: { emoji: '🛠️', label: 'Tiện ích' },
  moderation: { emoji: '🛡️', label: 'Quản lý' },
  economy: { emoji: '🪙', label: 'Kinh tế' },
  fishing: { emoji: '🎣', label: 'Câu cá' },
  casino: { emoji: '🎰', label: 'Sòng bài' },
  games: { emoji: '🎮', label: 'Trò chơi' },
  giveaway: { emoji: '🎁', label: 'Giveaway' },
  animation: { emoji: '✨', label: 'Hiệu ứng' },
  owner: { emoji: '👑', label: 'Chủ bot' },
};

function meta(cat) {
  return CATEGORY_META[cat] || { emoji: '📁', label: cat };
}

module.exports = {
  name: 'help',
  aliases: ['h', 'tro-giup', 'lenh', 'commands'],
  category: 'info',
  description: 'Xem danh sách tất cả lệnh của bot',
  usage: '[tên lệnh]',
  cooldown: 5,
  slash: true,
  options: [{ name: 'lệnh', type: 'string', description: 'Tên lệnh muốn xem chi tiết', required: false }],
  async run(ctx) {
    const client = ctx.client;
    const prefix = db.getPrefix(ctx.guild?.id) || client.config.prefix;
    const query = ctx.getString('lệnh');

    // Chỉ chủ bot mới thấy các lệnh ownerOnly trong help
    const isOwner = Boolean(client.config.ownerId) && String(ctx.author.id) === String(client.config.ownerId);
    const visible = (c) => isOwner || !c.ownerOnly;

    // --- Nếu xem chi tiết 1 lệnh ---
    if (query) {
      const cmd =
        client.commands.get(query.toLowerCase()) ||
        client.commands.get(client.aliases.get(query.toLowerCase()));
      if (!cmd || !visible(cmd)) {
        return ctx.reply({ embeds: [Embed.error('Không tìm thấy lệnh', `Không có lệnh tên \`${query}\`.`)] });
      }
      const m = meta(cmd.category);
      const detail = Embed.custom(colors.info, `${m.emoji} Lệnh: ${cmd.name}`)
        .setDescription(cmd.description || 'Không có mô tả.')
        .addFields(
          { name: 'Nhóm', value: m.label, inline: true },
          { name: 'Thời gian chờ', value: `${cmd.cooldown || 2}s`, inline: true },
          { name: 'Tên gọi khác', value: cmd.aliases?.length ? cmd.aliases.map((a) => `\`${a}\``).join(', ') : 'Không có', inline: true },
          { name: 'Cách dùng', value: `\`${prefix}${cmd.name}${cmd.usage ? ' ' + cmd.usage : ''}\`` },
        );
      return ctx.reply({ embeds: [detail] });
    }

    const cats = [...new Set(client.commands.filter(visible).map((c) => c.category))].sort();

    // --- Trang tổng quan ---
    function overviewEmbed() {
      const total = client.commands.filter(visible).size;
      const e = Embed.custom(
        colors.primary,
        `${emoji.sparkles} Trung tâm trợ giúp — ${client.config.brand}`,
        `Chào mừng bạn! Tôi có **${total}** lệnh thuộc **${cats.length}** nhóm.\n` +
          `${emoji.right} Prefix: \`${prefix}\`  |  Cũng hỗ trợ slash \`/\`\n` +
          `${emoji.right} Dùng menu bên dưới để xem lệnh theo từng nhóm.\n` +
          `${emoji.right} Gõ \`${prefix}help <tên lệnh>\` để xem chi tiết.`,
      );
      for (const cat of cats) {
        const m = meta(cat);
        const list = client.commands.filter((c) => c.category === cat && visible(c));
        // Giới hạn 1024 ký tự cho mỗi trường embed
        let value = list.map((c) => `\`${c.name}\``).join(', ') || 'Trống';
        if (value.length > 1024) value = value.slice(0, 1015).replace(/,[^,]*$/, '') + ' …';
        e.addFields({
          name: `${m.emoji} ${m.label} (${list.size})`,
          value,
        });
      }
      return e;
    }

    function categoryEmbed(cat) {
      const m = meta(cat);
      const list = client.commands.filter((c) => c.category === cat && visible(c));
      let desc =
        list
          .map((c) => `${emoji.right} \`${prefix}${c.name}\` — ${c.description || 'Không có mô tả'}`)
          .join('\n') || 'Nhóm này chưa có lệnh.';
      // Giới hạn 4096 ký tự cho phần mô tả embed
      if (desc.length > 4096) desc = desc.slice(0, 4087).replace(/\n[^\n]*$/, '') + '\n…';
      return Embed.custom(colors.info, `${m.emoji} Nhóm: ${m.label}`).setDescription(desc);
    }

    function components(homeDisabled) {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('help_menu')
        .setPlaceholder('📚 Chọn một nhóm lệnh để xem chi tiết...')
        .addOptions(
          cats.map((cat) => {
            const m = meta(cat);
            return { label: m.label, value: cat, emoji: m.emoji, description: `Xem các lệnh nhóm ${m.label}` };
          }),
        );
      const homeBtn = new ButtonBuilder()
        .setCustomId('help_home')
        .setLabel('Trang chủ')
        .setEmoji('🏠')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(homeDisabled);
      return [
        new ActionRowBuilder().addComponents(menu),
        new ActionRowBuilder().addComponents(homeBtn),
      ];
    }

    const msg = await ctx.reply({ embeds: [overviewEmbed()], components: components(true) });

    const collector = msg.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({
          content: `${emoji.error} Menu này không phải của bạn. Hãy tự gõ lệnh help nhé!`,
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
      if (i.componentType === ComponentType.StringSelect) {
        const payload = { embeds: [categoryEmbed(i.values[0])], components: components(false) };
        await i.update(payload).catch(() => msg.edit(payload).catch(() => {}));
      } else if (i.componentType === ComponentType.Button && i.customId === 'help_home') {
        const payload = { embeds: [overviewEmbed()], components: components(true) };
        await i.update(payload).catch(() => msg.edit(payload).catch(() => {}));
      }
    });

    collector.on('end', () => {
      msg.edit({ components: [] }).catch(() => {});
    });
  },
};
