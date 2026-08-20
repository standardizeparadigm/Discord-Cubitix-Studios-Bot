// =============================================================
//  Lệnh: firework - hiệu ứng pháo hoa (đồ họa emoji)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { sleep } = require('../../core/Animator');
const { rainbow } = require('../../core/palette');

const FRAMES = [
  '\n\n           ·\n\n',
  '\n\n           |\n           |\n',
  '\n\n          \\|/\n         —💥—\n          /|\\\n',
  '\n      ✨   \\|/   ✨\n     ⭐— 🎆 —⭐\n      ✨   /|\\   ✨\n',
  '\n   🎇  ✨  \\ | /  ✨  🎇\n  ⭐ —— 🎆🎇 —— ⭐\n   🎇  ✨  / | \\  ✨  🎇\n',
  '\n 🎆 🎇 ✨ 🎉 ✨ 🎇 🎆\n✨ CHÚC MỪNG! ✨\n 🎆 🎇 ✨ 🎉 ✨ 🎇 🎆\n',
];

module.exports = {
  name: 'firework',
  aliases: ['phaohoa', 'fw', 'celebrate'],
  category: 'animation',
  description: 'Bắn pháo hoa ăn mừng rực rỡ nhiều màu',
  cooldown: 8,
  slash: true,
  async run(ctx) {
    const msg = await ctx.reply({ embeds: [Embed.custom(rainbow[0], '🎆 Pháo hoa', FRAMES[0])] });
    if (!msg || typeof msg.edit !== 'function') return; // không lấy được tin nhắn -> dừng, tránh lỗi
    for (let i = 0; i < FRAMES.length; i++) {
      await sleep(650);
      await msg.edit({ embeds: [Embed.custom(rainbow[i % rainbow.length], '🎆 Pháo hoa', FRAMES[i])] }).catch(() => {});
    }
  },
};
