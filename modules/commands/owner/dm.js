// =============================================================
//  Lệnh: dm - gửi tin nhắn riêng (DM) tới một người dùng (CHỈ CHỦ BOT)
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');

module.exports = {
  name: 'dm',
  aliases: ['senddm', 'nhantin', 'dmuser'],
  category: 'owner',
  description: 'Gửi tin nhắn riêng (DM) tới một người dùng theo ID (chỉ chủ bot)',
  usage: '<ID người dùng> <nội dung>',
  cooldown: 3,
  ownerOnly: true,
  slash: true,
  options: [
    { name: 'người_dùng', type: 'string', description: 'ID người dùng cần nhắn', required: true },
    { name: 'nội_dung', type: 'string', description: 'Nội dung tin nhắn', required: true, rest: true },
  ],
  async run(ctx) {
    // Gửi tin nhắn riêng có thể chậm -> báo nhận trước.
    // Giữ dạng hiện công khai đúng như hành vi cũ của lệnh này.
    if (ctx.isSlash) await ctx.defer();

    const client = ctx.client;
    const id = (ctx.getString('người_dùng') || '').trim().replace(/[<@!>]/g, '');
    const content = ctx.getString('nội_dung');

    if (!/^\d{15,20}$/.test(id)) {
      return ctx.reply({ embeds: [Embed.error('ID không hợp lệ', 'Hãy cung cấp ID người dùng hợp lệ (15-20 chữ số).')] });
    }
    if (!content) {
      return ctx.reply({ embeds: [Embed.error('Thiếu nội dung', 'Hãy nhập nội dung tin nhắn cần gửi.')] });
    }

    const user = await client.users.fetch(id).catch(() => null);
    if (!user) {
      return ctx.reply({ embeds: [Embed.error('Không tìm thấy', 'Không tìm thấy người dùng với ID này.')] });
    }
    if (user.bot) {
      return ctx.reply({ embeds: [Embed.error('Không hợp lệ', 'Không thể gửi DM cho bot.')] });
    }

    const sent = await user.send({ content: content.slice(0, 2000) }).then(() => true).catch(() => false);
    if (!sent) {
      return ctx.reply({ embeds: [Embed.error('Không gửi được', 'Người dùng có thể đã tắt tin nhắn riêng hoặc chưa có máy chủ chung với bot.')] });
    }

    const embed = Embed.custom(colors.success, '📨 Đã gửi tin nhắn riêng')
      .addFields(
        { name: 'Người nhận', value: `${user.tag} (\`${user.id}\`)` },
        { name: 'Nội dung', value: content.slice(0, 1024) },
      );
    await ctx.reply({ embeds: [embed] });
  },
};
