// =============================================================
//  Lệnh: typewriter - hiệu ứng gõ chữ từng ký tự
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { sleep, typewriterFrames } = require('../../core/Animator');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'typewriter',
  aliases: ['type', 'gochu'],
  category: 'animation',
  description: 'Hiệu ứng gõ chữ (typewriter) cho văn bản của bạn',
  usage: '<nội dung>',
  cooldown: 8,
  slash: true,
  options: [{ name: 'nội_dung', type: 'string', description: 'Văn bản cần gõ', required: true, rest: true }],
  async run(ctx) {
    let text = ctx.getString('nội_dung');
    if (!text) return ctx.reply({ embeds: [Embed.error('Thiếu nội dung', 'Nhập văn bản để gõ.')] });
    if (text.length > 200) text = text.slice(0, 200);

    const frames = typewriterFrames(text, 2);
    const msg = await ctx.reply({ embeds: [Embed.custom(colors.aqua, '⌨️ Typewriter', '█')] });
    if (!msg || typeof msg.edit !== 'function') return; // không lấy được tin nhắn -> dừng, tránh lỗi
    for (const frame of frames) {
      await sleep(220);
      await msg.edit({ embeds: [Embed.custom(colors.aqua, '⌨️ Typewriter', frame)] }).catch(() => {});
    }
  },
};
