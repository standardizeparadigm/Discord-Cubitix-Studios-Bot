// =============================================================
//  Lệnh: rainbow - đổi màu embed liên tục theo cầu vồng
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { sleep } = require('../../core/Animator');
const { rainbow } = require('../../core/palette');

module.exports = {
  name: 'rainbow',
  aliases: ['cauvong', 'rgb'],
  category: 'animation',
  description: 'Hiệu ứng đổi màu cầu vồng cho văn bản',
  usage: '[nội dung]',
  cooldown: 8,
  slash: true,
  options: [{ name: 'nội_dung', type: 'string', description: 'Văn bản hiển thị', required: false, rest: true }],
  async run(ctx) {
    const raw = ctx.getString('nội_dung') || 'Cubitix Studios — All In One Bot!';
    // Chặn tràn giới hạn 4096 ký tự của phần mô tả embed
    const text = raw.length > 4000 ? raw.slice(0, 3999) + '\u2026' : raw;
    const msg = await ctx.reply({ embeds: [Embed.custom(rainbow[0], '🌈 Cầu vồng', text)] });
    if (!msg || typeof msg.edit !== 'function') return; // không lấy được tin nhắn -> dừng, tránh lỗi
    for (let i = 1; i < rainbow.length * 2; i++) {
      await sleep(500);
      await msg.edit({ embeds: [Embed.custom(rainbow[i % rainbow.length], '🌈 Cầu vồng', text)] }).catch(() => {});
    }
  },
};
