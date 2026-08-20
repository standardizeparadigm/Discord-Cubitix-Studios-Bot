// =============================================================
//  Lệnh: loading - hiệu ứng đang tải với thanh tiến trình & spinner
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { sleep, progressBar, spinners } = require('../../core/Animator');
const { colors } = require('../../core/palette');

const STAGES = ['Khởi tạo hệ thống', 'Kết nối máy chủ', 'Tải dữ liệu', 'Tối ưu hóa', 'Hoàn tất'];

module.exports = {
  name: 'loading',
  aliases: ['load', 'tai'],
  category: 'animation',
  description: 'Hiệu ứng thanh tải (loading) sinh động',
  cooldown: 8,
  slash: true,
  async run(ctx) {
    const msg = await ctx.reply({ embeds: [Embed.custom(colors.info, '⚙️ Đang xử lý', progressBar(0))] });
    if (!msg || typeof msg.edit !== 'function') return; // không lấy được tin nhắn -> dừng, tránh lỗi
    for (let p = 0; p <= 100; p += 10) {
      await sleep(400);
      const spin = spinners[(p / 10) % spinners.length];
      const stage = STAGES[Math.min(STAGES.length - 1, Math.floor(p / 25))];
      await msg.edit({
        embeds: [Embed.custom(colors.info, `${spin} ${stage}`, progressBar(p))],
      }).catch(() => {});
    }
    await msg.edit({ embeds: [Embed.success('Hoàn tất!', `${progressBar(100)}\n\nĐã xử lý xong tất cả! 🎉`)] }).catch(() => {});
  },
};
