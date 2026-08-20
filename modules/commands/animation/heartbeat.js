// =============================================================
//  Lệnh: heartbeat - hiệu ứng nhịp tim đập
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { sleep } = require('../../core/Animator');
const { colors } = require('../../core/palette');

const FRAMES = [
  '💛',
  '❤️',
  '❤️ 💓',
  '💓 ❤️ 💓',
  '💓 💖 ❤️ 💖 💓',
  '💓 💖 💗 ❤️ 💗 💖 💓',
  '💓 💖 ❤️ 💖 💓',
  '💓 ❤️ 💓',
  '❤️',
];

module.exports = {
  name: 'heartbeat',
  aliases: ['nhiptim', 'timdap', 'hb'],
  category: 'animation',
  description: 'Hiệu ứng nhịp tim đập rộn ràng',
  cooldown: 8,
  slash: true,
  async run(ctx) {
    const msg = await ctx.reply({ embeds: [Embed.custom(colors.pink, '💓 Nhịp tim', FRAMES[0])] });
    if (!msg || typeof msg.edit !== 'function') return; // không lấy được tin nhắn -> dừng, tránh lỗi
    for (let i = 1; i < FRAMES.length; i++) {
      await sleep(450);
      await msg.edit({ embeds: [Embed.custom(colors.pink, '💓 Nhịp tim', FRAMES[i])] }).catch(() => {});
    }
  },
};
