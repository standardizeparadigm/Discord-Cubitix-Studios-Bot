// =============================================================
//  Lệnh: rps - oắn tù tì (kéo - bú́a - bao) với bot
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const rng = require('../../core/secureRandom');

const CHOICES = {
  rock: { emoji: '🪨', label: 'Búa' },
  paper: { emoji: '📄', label: 'Bao' },
  scissors: { emoji: '✂️', label: 'Kéo' },
};
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

module.exports = {
  name: 'rps',
  aliases: ['keobua', 'oantuti', 'keobuabao'],
  category: 'fun',
  description: 'Chơi oắn tù tì (kéo - búa - bao) với bot',
  cooldown: 5,
  slash: true,
  async run(ctx) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rock').setLabel('Búa').setEmoji('🪨').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('paper').setLabel('Bao').setEmoji('📄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('scissors').setLabel('Kéo').setEmoji('✂️').setStyle(ButtonStyle.Danger),
    );
    const msg = await ctx.reply({ embeds: [Embed.custom(colors.primary, '✊✋✌️ Oắn tù tì', 'Hãy chọn một lựa chọn bên dưới!')], components: [row] });

    // KHÔNG dùng max:1 — nếu người khác bấm trước sẽ ăn mất lượt và làm hỏng ván của chủ lệnh.
    // Thay vào đó tự dừng sau khi chính chủ đã chọn.
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
    let played = false;
    collector.on('collect', async (i) => {
      if (i.user.id !== ctx.author.id) {
        return i.reply({ content: 'Đây không phải ván của bạn!', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      if (played) return;
      played = true;
      const player = i.customId;
      const botKeys = Object.keys(CHOICES);
      const bot = botKeys[Math.floor(rng.randomFloat() * botKeys.length)];

      let result, color;
      if (player === bot) { result = '🤝 HÒA!'; color = colors.warning; }
      else if (BEATS[player] === bot) { result = '🎉 Bạn THẮNG!'; color = colors.success; }
      else { result = '🤖 Bot THẮNG!'; color = colors.error; }

      const embed = Embed.custom(color, '✊✋✌️ Kết quả oắn tù tì')
        .addFields(
          { name: 'Bạn chọn', value: `${CHOICES[player].emoji} ${CHOICES[player].label}`, inline: true },
          { name: 'Bot chọn', value: `${CHOICES[bot].emoji} ${CHOICES[bot].label}`, inline: true },
          { name: 'Kết quả', value: result },
        );
      await i.update({ embeds: [embed], components: [] });
      collector.stop('played');
    });
    collector.on('end', () => {
      if (!played) msg.edit({ components: [] }).catch(() => {});
    });
  },
};
