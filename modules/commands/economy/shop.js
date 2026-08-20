// =============================================================
//  Lệnh: shop - xem cửa hàng vật phẩm
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const shop = require('../../core/shopItems');

module.exports = {
  name: 'shop',
  aliases: ['store', 'cuahang', 'shopping'],
  category: 'economy',
  description: 'Xem cửa hàng vật phẩm có thể mua',
  usage: 'shop',
  cooldown: 4,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    const wallet = db.getWallet(ctx.author.id);
    const lines = shop.ITEMS.map((it) => {
      const owned = wallet.inventory[it.id] || 0;
      const ownTag = owned > 0 ? `  \`x${owned}\`` : '';
      return `${it.emoji} **${it.name}** \u2014 \`${it.id}\`${ownTag}\n\u2003${emoji.coin} **${it.price.toLocaleString('vi-VN')}** xu \u00b7 ${it.desc}`;
    });
    const embed = Embed.custom(colors.gold, '\ud83d\uded2 C\u1eeda h\u00e0ng Cubitix')
      .setDescription(lines.join('\n\n'))
      .addFields(
        { name: 'S\u1ed1 d\u01b0 c\u1ee7a b\u1ea1n', value: `${emoji.coin} **${wallet.balance.toLocaleString('vi-VN')}** xu`, inline: true },
        { name: 'Mua v\u1eadt ph\u1ea9m', value: `G\u00f5 \`buy <id> [s\u1ed1 l\u01b0\u1ee3ng]\`\nV\u00ed d\u1ee5: \`buy flower 3\``, inline: true },
      )
      .setFooter({ text: `${ctx.client.config?.footerText || 'Cubitix Studios'} \u00b7 ${shop.ITEMS.length} v\u1eadt ph\u1ea9m` });
    await ctx.reply({ embeds: [embed] });
  },
};
