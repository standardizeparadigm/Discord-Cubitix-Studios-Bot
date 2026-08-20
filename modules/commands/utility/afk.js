// =============================================================
//  Lệnh: afk - đặt trạng thái tạm vắng
//  Khi có người nhắc đến bạn, bot sẽ tự báo là bạn đang AFK.
//  Khi bạn nhắn tin trở lại, trạng thái AFK sẽ tự được gỡ.
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors } = require('../../core/palette');
const afk = require('../../core/afkStore');

module.exports = {
  name: 'afk',
  aliases: ['nghi', 'nghingoi'],
  category: 'utility',
  description: 'Đặt trạng thái AFK (tạm vắng)',
  usage: '[lý do]',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  options: [{ name: 'lý_do', type: 'string', description: 'Lý do tạm vắng', required: false, rest: true }],
  async run(ctx) {
    const reason = (ctx.getString('lý_do') || 'Không có lý do').slice(0, 300);
    afk.set(ctx.guild.id, ctx.author.id, reason);
    const embed = Embed.custom(colors.aqua, '💤 Đã đặt AFK')
      .setDescription(`${ctx.author}, bạn giờ đang **AFK**. Tôi sẽ báo cho ai nhắc đến bạn.\n📝 Lý do: ${reason}`);
    await ctx.reply({ embeds: [embed] });
  },
};
