// =============================================================
//  Lệnh: eval - chạy mã JavaScript trực tiếp (CHỈ CHỦ BOT)
//  Cảnh báo: cực mạnh, chỉ chủ bot dùng được. Token luôn được ẩn.
// =============================================================
const util = require('util');
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

// Mỗi field của embed chỉ chứa tối đa 1024 ký tự (kể cả dấu ```js```),
// nên cắt ở 900 để không bị Discord từ chối tin nhắn.
const MAX = 900;

function clean(input, client) {
  let text = typeof input === 'string' ? input : util.inspect(input, { depth: 1, getters: true });
  const token = client && client.token;
  if (token) text = text.split(token).join('[ĐÃ ẨN TOKEN]');
  // Chèn ký tự vô hình để không phá vỡ khối mã và không ping
  text = text.replace(/`/g, '`\u200b').replace(/@/g, '@\u200b');
  if (text.length > MAX) text = text.slice(0, MAX) + '\n... (đã cắt bớt)';
  return text;
}

module.exports = {
  name: 'eval',
  aliases: ['ev', 'exec', 'runjs'],
  category: 'owner',
  description: 'Chạy mã JavaScript trực tiếp (chỉ chủ bot)',
  usage: '<mã JavaScript>',
  cooldown: 1,
  ownerOnly: true,
  slash: true,
  options: [{ name: 'mã', type: 'string', description: 'Đoạn mã JavaScript cần chạy', required: true, rest: true }],
  async run(ctx) {
    const client = ctx.client;
    const code = ctx.getString('mã');
    if (!code) {
      return ctx.reply({ embeds: [Embed.error('Thiếu mã', 'Hãy nhập đoạn mã cần chạy. Ví dụ: `eval client.guilds.cache.size`')] });
    }

    // Các biến tiện lợi có thể dùng trong mã (được eval nhìn thấy trong phạm vi này)
    const { guild, channel, author, member, message, interaction } = ctx; // eslint-disable-line no-unused-vars

    const started = Date.now();
    let evaled;
    let ok = true;
    try {
      // eslint-disable-next-line no-eval
      evaled = eval(code);
      if (evaled instanceof Promise) evaled = await evaled;
    } catch (err) {
      ok = false;
      evaled = err && err.stack ? err.stack : String(err);
    }
    const took = Date.now() - started;

    const type = ok ? typeof evaled : 'error';
    const out = clean(evaled, client);
    const embed = Embed.custom(ok ? colors.success : colors.error, ok ? '✅ Kết quả eval' : '❌ Lỗi khi chạy')
      .addFields(
        { name: '📥 Đầu vào', value: '```js\n' + clean(code, client).slice(0, 900) + '\n```' },
        { name: ok ? '📤 Kết quả' : '📤 Lỗi', value: '```js\n' + out + '\n```' },
      )
      .setFooter({ text: `Kiểu: ${type} • ${took}ms` });
    await ctx.reply({ embeds: [embed] });
  },
};
