// =============================================================
//  Lệnh: password - tạo mật khẩu ngẫu nhiên mạnh (an toàn)
// =============================================================
const rng = require('../../core/secureRandom');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '!@#$%^&*?-_=+';

function randChar(set) {
  return set[rng.randomInt(set.length)];
}

// Dùng chung bộ CSPRNG của bot (rng.shuffle là Fisher-Yates không lệch).
function shuffle(arr) {
  return rng.shuffle(arr);
}

function generate(len) {
  const all = LOWER + UPPER + DIGIT + SYMBOL;
  // Đảm bảo có đủ 4 nhóm ký tự
  const chars = [randChar(LOWER), randChar(UPPER), randChar(DIGIT), randChar(SYMBOL)];
  for (let i = chars.length; i < len; i++) chars.push(randChar(all));
  return shuffle(chars).join('');
}

module.exports = {
  name: 'password',
  aliases: ['pass', 'matkhau', 'genpass'],
  category: 'utility',
  description: 'Tạo mật khẩu ngẫu nhiên mạnh (8-64 ký tự)',
  usage: '[độ dài]',
  cooldown: 3,
  slash: true,
  options: [{ name: 'độ_dài', type: 'integer', description: 'Số ký tự (8-64, mặc định 16)', required: false }],
  async run(ctx) {
    let len = ctx.getInteger('độ_dài') || 16;
    if (len < 8) len = 8;
    if (len > 64) len = 64;
    const pw = generate(len);
    const embed = Embed.custom(colors.success, '🔐 Mật khẩu ngẫu nhiên',
      `\`\`\`\n${pw}\n\`\`\`\nĐộ dài: **${len}** ký tự • gồm chữ thường, chữ hoa, số và ký tự đặc biệt.`)
      .setFooter({ text: '⚠️ Đừng chia sẻ mật khẩu này ở nơi công khai!' });
    await ctx.reply({ embeds: [embed] });
  },
};
