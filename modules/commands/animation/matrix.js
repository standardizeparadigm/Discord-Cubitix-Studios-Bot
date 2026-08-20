// =============================================================
//  Lệnh: matrix - hiệu ứng mưa code kiểu "Matrix"
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { sleep } = require('../../core/Animator');
const { colors } = require('../../core/palette');
const rng = require('../../core/secureRandom');

const CHARS = '01アイウエオカキクケコABCDEF#$%&@';
const WIDTH = 18;
const HEIGHT = 8;

function randChar() { return CHARS[Math.floor(rng.randomFloat() * CHARS.length)]; }

function frame(drops) {
  let out = '';
  for (let y = 0; y < HEIGHT; y++) {
    let line = '';
    for (let x = 0; x < WIDTH; x++) {
      const d = drops[x];
      if (y === d) line += randChar();
      else if (y < d && y > d - 3) line += randChar();
      else line += ' ';
    }
    out += line + '\n';
  }
  return '```\n' + out + '```';
}

module.exports = {
  name: 'matrix',
  aliases: ['matran', 'coderain', 'thematrix'],
  category: 'animation',
  description: 'Hiệu ứng mưa ký tự xanh kiểu phim Matrix',
  cooldown: 8,
  slash: true,
  async run(ctx) {
    const drops = Array.from({ length: WIDTH }, () => Math.floor(rng.randomFloat() * HEIGHT));
    const msg = await ctx.reply({ embeds: [Embed.custom(colors.success, '🖥️ The Matrix', frame(drops))] });
    if (!msg || typeof msg.edit !== 'function') return; // không lấy được tin nhắn -> dừng, tránh lỗi
    for (let step = 0; step < 8; step++) {
      await sleep(700);
      for (let x = 0; x < WIDTH; x++) drops[x] = (drops[x] + 1) % (HEIGHT + 2);
      await msg.edit({ embeds: [Embed.custom(colors.success, '🖥️ The Matrix', frame(drops))] }).catch(() => {});
    }
  },
};
