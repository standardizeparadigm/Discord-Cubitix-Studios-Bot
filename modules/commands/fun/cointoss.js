// =============================================================
//  Lệnh: cointoss - tung đồng xu giải trí (có nút tung lại)
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const { sleep } = require('../../core/Animator');
const rng = require('../../core/secureRandom');

function flip() {
  return rng.randomFloat() < 0.5
    ? { face: 'SẤP', icon: '🟡', color: colors.gold }
    : { face: 'NGỬA', icon: '⚪', color: colors.info };
}

function buildRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('coin_reflip')
      .setLabel('Tung lại')
      .setEmoji('🪙')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );
}

async function animate(msg, editFn) {
  const frames = ['🪙', '🔄', '🪙', '🔄'];
  for (const f of frames) {
    await editFn({ embeds: [Embed.custom(colors.warning, `${f} Đang tung đồng xu...`, '\u200b')] });
    await sleep(280);
  }
}

function resultEmbed(author) {
  const r = flip();
  return Embed.custom(r.color, `${r.icon} Kết quả: **${r.face}**`)
    .setDescription(`${emoji.sparkles} Đồng xu đã dừng lại ở mặt **${r.face}**!`)
    .setFooter({ text: `Người tung: ${author.username}` });
}

module.exports = {
  name: 'cointoss',
  aliases: ['coin', 'flip'],
  category: 'fun',
  description: 'Tung một đồng xu: SẤP hay NGỬA?',
  usage: '',
  cooldown: 3,
  slash: true,
  async run(ctx) {
    const msg = await ctx.reply({
      embeds: [Embed.custom(colors.warning, '🪙 Đang tung đồng xu...', '\u200b')],
    });
    const editFn = (payload) => (ctx.isSlash ? ctx.interaction.editReply(payload) : msg.edit(payload));
    await animate(msg, editFn);
    await editFn({ embeds: [resultEmbed(ctx.author)], components: [buildRow()] });

    // Bộ thu thập nút bấm: cho phép tung lại trong 60 giây
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} Đây không phải lượt của bạn!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      await i.deferUpdate();
      await i.editReply({ embeds: [Embed.custom(colors.warning, '🪙 Đang tung lại...', '\u200b')], components: [buildRow(true)] });
      await sleep(500);
      await i.editReply({ embeds: [resultEmbed(ctx.author)], components: [buildRow()] });
    });

    collector.on('end', () => {
      editFn({ components: [buildRow(true)] }).catch(() => {});
    });
  },
};
