// =============================================================
//  Lệnh: wyr (Would You Rather) - "Bạn sẽ chọn?"
//  Mọi người bấm 🅰️ / 🅱️ để bình chọn; có thanh %.
// =============================================================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const { progressBar } = require('../../core/Animator');
const rng = require('../../core/secureRandom');

const PAIRS = [
  ['Có thể bay', 'Có thể tàng hình'],
  ['Du hành về quá khứ', 'Du hành tới tương lai'],
  ['Không bao giờ phải ngủ', 'Không bao giờ phải ăn'],
  ['Giàu nhưng cô đơn', 'Nghèo nhưng nhiều bạn'],
  ['Luôn nói thật', 'Luôn phải nói dối'],
  ['Sống ở bãi biển', 'Sống trên núi'],
  ['Mất hết tin nhắn cũ', 'Mất hết ảnh cũ'],
  ['Ăn món yêu thích mãi mãi', 'Mỗi ngày một món mới'],
  ['Có tua lại thời gian 10 phút', 'Tạm dừng thời gian 10 phút'],
  ['Đọc được suy nghĩ người khác', 'Ai cũng đọc được suy nghĩ của bạn'],
  ['Nổi tiếng toàn cầu', 'Giàu ngầm không ai biết'],
  ['Không dùng điện thoại 1 năm', 'Không ăn đồ ngọt 1 năm'],
  ['Biết tất cả ngôn ngữ', 'Chơi được tất cả nhạc cụ'],
  ['Thú cưng biết nói', 'Cây cối biết nói'],
  ['Luôn đúng giờ', 'Luôn gặp may mắn nhỏ'],
];

function pickIndex(exclude) {
  if (PAIRS.length <= 1) return 0;
  let idx;
  do { idx = Math.floor(rng.randomFloat() * PAIRS.length); } while (idx === exclude);
  return idx;
}

function buildEmbed(pair, a, b) {
  const total = a + b;
  const pa = total ? Math.round((a / total) * 100) : 0;
  const pb = total ? 100 - pa : 0;
  return Embed.custom(colors.purple, '🤔 Bạn sẽ chọn?',
    `🅰️ **${pair[0]}**\n${progressBar(pa)} **${pa}%** (${a})\n\n🅱️ **${pair[1]}**\n${progressBar(pb)} **${pb}%** (${b})`)
    .setFooter({ text: total ? `${total} lượt bình chọn` : 'Hãy là người đầu tiên bình chọn!' });
}

function row(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wyr_a').setLabel('Lựa chọn A').setEmoji('🅰️').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('wyr_b').setLabel('Lựa chọn B').setEmoji('🅱️').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('wyr_next').setLabel('Câu khác').setEmoji('🔀').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
  );
}

module.exports = {
  name: 'wyr',
  aliases: ['bansechon', '2lua', 'wouldyourather'],
  category: 'fun',
  description: 'Bạn sẽ chọn? — bình chọn hai lựa chọn hóc búa',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    let idx = pickIndex(-1);
    let votesA = new Set();
    let votesB = new Set();

    const msg = await ctx.reply({ embeds: [buildEmbed(PAIRS[idx], 0, 0)], components: [row(false)] });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

    collector.on('collect', async (i) => {
      if (i.customId === 'wyr_next') {
        if (i.user.id !== ctx.author.id) {
          return i.reply({ content: '❌ Chỉ người tạo mới đổi được câu hỏi.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        idx = pickIndex(idx);
        votesA = new Set();
        votesB = new Set();
        return i.update({ embeds: [buildEmbed(PAIRS[idx], 0, 0)], components: [row(false)] });
      }
      if (i.customId === 'wyr_a') { votesA.add(i.user.id); votesB.delete(i.user.id); }
      else { votesB.add(i.user.id); votesA.delete(i.user.id); }
      await i.update({ embeds: [buildEmbed(PAIRS[idx], votesA.size, votesB.size)], components: [row(false)] });
    });

    collector.on('end', () => {
      msg.edit({ embeds: [buildEmbed(PAIRS[idx], votesA.size, votesB.size)], components: [row(true)] }).catch(() => {});
    });
  },
};
