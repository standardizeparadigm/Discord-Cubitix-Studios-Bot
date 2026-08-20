// =============================================================
//  Lệnh: dice - gieo xúc xắc (có nút gieo lại)
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const { sleep } = require('../../core/Animator');
const rng = require('../../core/secureRandom');

const DIE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function roll(sides) {
  return Math.floor(rng.randomFloat() * sides) + 1;
}

function faceIcon(value, sides) {
  return sides === 6 ? DIE_FACES[value - 1] : '🎲';
}

function buildRow(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('dice_reroll')
      .setLabel('Gieo lại')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

function resultEmbed(author, sides) {
  const value = roll(sides);
  return Embed.custom(colors.aqua, `${faceIcon(value, sides)} Xúc xắc ${sides} mặt`)
    .setDescription(`${emoji.sparkles} Bạn gieo được: **${value}** / ${sides}`)
    .setFooter({ text: `Người gieo: ${author.username}` });
}

module.exports = {
  name: 'dice',
  aliases: ['roll', 'xucxac', 'd'],
  category: 'fun',
  description: 'Gieo một con xúc xắc (mặc định 6 mặt)',
  usage: '[số mặt]',
  cooldown: 3,
  slash: true,
  options: [
    { name: 'số_mặt', type: 'integer', description: 'Số mặt của xúc xắc (2 - 1000)', required: false },
  ],
  async run(ctx) {
    let sides = ctx.getInteger('số_mặt') || 6;
    if (sides < 2) sides = 2;
    if (sides > 1000) sides = 1000;

    const msg = await ctx.reply({
      embeds: [Embed.custom(colors.warning, '🎲 Đang gieo xúc xắc...', '\u200b')],
    });
    const editFn = (payload) => (ctx.isSlash ? ctx.interaction.editReply(payload) : msg.edit(payload));
    await sleep(600);
    await editFn({ embeds: [resultEmbed(ctx.author, sides)], components: [buildRow()] });

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: `${emoji.error} Đây không phải lượt của bạn!`, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      await i.deferUpdate();
      await i.editReply({ embeds: [Embed.custom(colors.warning, '🎲 Đang gieo lại...', '\u200b')], components: [buildRow(true)] });
      await sleep(500);
      await i.editReply({ embeds: [resultEmbed(ctx.author, sides)], components: [buildRow()] });
    });

    collector.on('end', () => {
      editFn({ components: [buildRow(true)] }).catch(() => {});
    });
  },
};
