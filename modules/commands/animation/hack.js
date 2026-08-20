// =============================================================
//  Lệnh: hack - hiệu ứng "hack" giả lập cho vui (không thật)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { sleep, progressBar } = require('../../core/Animator');
const { colors } = require('../../core/palette');

const STEPS = [
  '🔍 Đang dò tìm mục tiêu...',
  '📡 Kết nối tới máy chủ...',
  '🔓 Vượt qua tường lửa...',
  '💾 Đang tải dữ liệu...',
  '🔑 Giải mã mật khẩu...',
  '📤 Đang trích xuất hồ sơ...',
];
const FAKE = ['mat_khau: ******', 'so_thich: ngủ nướng', 'iq: 999', 'so_nguoi_yeu: 0', 'diem_toan: 3.5', 'level_lol: sắt'];

module.exports = {
  name: 'hack',
  aliases: ['hacker'],
  category: 'animation',
  description: 'Hiệu ứng "hack" giả lập cho vui (không gây hại)',
  usage: '[@thành_viên]',
  cooldown: 10,
  slash: true,
  options: [{ name: 'thành_viên', type: 'user', description: 'Mục tiêu (cho vui)', required: false }],
  async run(ctx) {
    const target = ctx.getUser('thành_viên') || ctx.author;
    const msg = await ctx.reply({ embeds: [Embed.custom(colors.dark, '💻 HACKING...', `Mục tiêu: **${target.tag}**\n\`\`\`Đang bắt đầu...\`\`\``)] });
    if (!msg || typeof msg.edit !== 'function') return; // không lấy được tin nhắn -> dừng, tránh lỗi

    let logText = '';
    for (let i = 0; i < STEPS.length; i++) {
      await sleep(900);
      logText += STEPS[i] + '\n';
      const percent = ((i + 1) / STEPS.length) * 100;
      await msg.edit({
        embeds: [Embed.custom(colors.dark, '💻 HACKING...', `Mục tiêu: **${target.tag}**\n\`\`\`\n${logText}\`\`\`\n${progressBar(percent)}`)],
      }).catch(() => {});
    }
    await sleep(800);
    const data = FAKE.map((f) => '  ' + f).join('\n');
    await msg.edit({
      embeds: [Embed.custom(colors.success, '✅ HACK HOÀN TẤT (giả lập)', `Hồ sơ của **${target.tag}**:\n\`\`\`yaml\n${data}\n\`\`\`\n> 😂 Chỉ là trò đùa thôi nhé, không có gì thật cả!`)],
    }).catch(() => {});
  },
};
