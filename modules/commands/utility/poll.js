// =============================================================
//  Lệnh: poll - tạo bình chọn nhanh
//  - 1 câu hỏi        -> bình chọn Có / Không (✅ / ❌)
//  - Câu hỏi | A | B  -> bình chọn nhiều lựa chọn (tối đa 10)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const { PermissionFlagsBits } = require('discord.js');

const NUMBER_EMOJIS = ['1\uFE0F\u20E3', '2\uFE0F\u20E3', '3\uFE0F\u20E3', '4\uFE0F\u20E3', '5\uFE0F\u20E3', '6\uFE0F\u20E3', '7\uFE0F\u20E3', '8\uFE0F\u20E3', '9\uFE0F\u20E3', '\uD83D\uDD1F'];

// Thả cảm xúc an toàn: bỏ qua nếu thiếu quyền và báo cho người dùng biết.
async function addReactions(ctx, msg, emojis) {
  if (!msg || typeof msg.react !== 'function') return;
  const me = ctx.guild && ctx.guild.members ? ctx.guild.members.me : null;
  const perms = me && ctx.channel && typeof ctx.channel.permissionsFor === 'function'
    ? ctx.channel.permissionsFor(me)
    : null;
  if (perms && !perms.has(PermissionFlagsBits.AddReactions)) {
    await ctx.send({ embeds: [Embed.warn('Thiếu quyền', 'Bot không có quyền **Thêm cảm xúc** ở kênh này nên mọi người phải tự bấm nhé.')] }).catch(() => {});
    return;
  }
  for (const e of emojis) {
    // eslint-disable-next-line no-await-in-loop
    const done = await msg.react(e).then(() => true).catch(() => false);
    if (!done) break; // thất bại một lần thì dừng, tránh spam lỗi
  }
}

module.exports = {
  name: 'poll',
  aliases: ['binhchon', 'vote'],
  category: 'utility',
  description: 'Tạo bình chọn nhanh (có/không hoặc nhiều lựa chọn)',
  usage: '<câu hỏi>  hoặc  <câu hỏi> | lựa chọn 1 | lựa chọn 2 ...',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  options: [{ name: 'nội_dung', type: 'string', description: 'Câu hỏi, hoặc "Câu hỏi | A | B | C" cho nhiều lựa chọn', required: true, rest: true }],
  async run(ctx) {
    const raw = ctx.getString('nội_dung');
    if (!raw) return ctx.reply({ embeds: [Embed.error('Thiếu câu hỏi', 'Hãy nhập câu hỏi cho cuộc bình chọn.')] });

    const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
    const question = parts[0];
    const choices = parts.slice(1, 11); // tối đa 10 lựa chọn

    // --- Bình chọn nhiều lựa chọn ---
    if (choices.length >= 2) {
      const desc = choices.map((c, i) => `${NUMBER_EMOJIS[i]}  ${c}`).join('\n\n');
      const embed = Embed.custom(colors.info, '📊 Bình chọn')
        .setDescription(`**${question}**\n\n${desc}`)
        .setFooter({ text: `Tạo bởi ${ctx.author.tag} • Bấm số tương ứng để bình chọn` });
      const msg = await ctx.reply({ embeds: [embed] });
      await addReactions(ctx, msg, NUMBER_EMOJIS.slice(0, choices.length));
      return;
    }

    // --- Bình chọn Có / Không ---
    const embed = Embed.custom(colors.info, '📊 Bình chọn')
      .setDescription(`**${question}**`)
      .setFooter({ text: `Tạo bởi ${ctx.author.tag} • Bấm ✅ hoặc ❌ để bình chọn` });
    const msg = await ctx.reply({ embeds: [embed] });
    await addReactions(ctx, msg, ['✅', '❌']);
  },
};
