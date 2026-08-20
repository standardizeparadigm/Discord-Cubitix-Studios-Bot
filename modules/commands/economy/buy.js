// =============================================================
//  Lệnh: buy - mua vật phẩm từ cửa hàng
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const quests = require('../../core/questLogic');
const shop = require('../../core/shopItems');

module.exports = {
  name: 'buy',
  aliases: ['mua', 'purchase'],
  category: 'economy',
  description: 'Mua vật phẩm từ cửa hàng',
  usage: 'buy <id vật phẩm> [số lượng]',
  cooldown: 3,
  guildOnly: true,
  slash: true,
  options: [
    { name: 'vat_pham', type: 'string', description: 'ID vật phẩm (xem shop)', required: true },
    { name: 'so_luong', type: 'integer', description: 'Số lượng (mặc định 1)', required: false },
  ],
  async run(ctx) {
    const query = ctx.getString('vat_pham');
    if (!query) {
      return ctx.reply({ embeds: [Embed.warn('Thi\u1ebfu v\u1eadt ph\u1ea9m', 'D\u00f9ng `buy <id>` \u2014 g\u00f5 `shop` \u0111\u1ec3 xem danh s\u00e1ch.')] });
    }
    const item = shop.resolve(query);
    if (!item) {
      return ctx.reply({ embeds: [Embed.error('Kh\u00f4ng t\u00ecm th\u1ea5y v\u1eadt ph\u1ea9m', `Kh\u00f4ng c\u00f3 v\u1eadt ph\u1ea9m n\u00e0o kh\u1edbp **${query}**. G\u00f5 \`shop\` \u0111\u1ec3 xem danh s\u00e1ch.`)] });
    }
    let qty = ctx.getInteger('so_luong');
    if (!qty || qty < 1) qty = 1;
    if (qty > 100) qty = 100;

    const wallet = db.getWallet(ctx.author.id);
    const cost = item.price * qty;
    if (wallet.balance < cost) {
      return ctx.reply({ embeds: [Embed.error('Kh\u00f4ng \u0111\u1ee7 xu', `C\u1ea7n **${cost.toLocaleString('vi-VN')}** xu \u0111\u1ec3 mua ${qty}x ${item.emoji} ${item.name}, nh\u01b0ng b\u1ea1n ch\u1ec9 c\u00f3 **${wallet.balance.toLocaleString('vi-VN')}** xu.`)] });
    }

    wallet.balance -= cost;
    // Hi\u1ec7u \u1ee9ng \u0111\u1eb7c bi\u1ec7t
    let extra = '';
    if (item.special === 'karma') {
      const gain = (item.karma || 5) * qty;
      wallet.karma = (wallet.karma || 0) + gain;
      extra = `\n\ud83c\udf40 Nghi\u1ec7p (karma) +${gain} \u2192 hi\u1ec7n **${wallet.karma}**.`;
      wallet.inventory[item.id] = (wallet.inventory[item.id] || 0) + qty;
    } else {
      wallet.inventory[item.id] = (wallet.inventory[item.id] || 0) + qty;
    }
    quests.track(wallet, 'spend', cost);
    quests.track(wallet, 'buyItem', qty);
    db.saveWallet(ctx.author.id, wallet);

    const owned = wallet.inventory[item.id] || 0;
    const embed = Embed.custom(colors.success, `${emoji.success} Mua th\u00e0nh c\u00f4ng`)
      .setDescription(`\u0110\u00e3 mua **${qty}x** ${item.emoji} **${item.name}** v\u1edbi gi\u00e1 ${emoji.coin} **${cost.toLocaleString('vi-VN')}** xu.${extra}`)
      .addFields(
        { name: 'S\u1edf h\u1eefu', value: `${item.emoji} x${owned}`, inline: true },
        { name: 'S\u1ed1 d\u01b0 c\u00f2n l\u1ea1i', value: `${emoji.coin} ${wallet.balance.toLocaleString('vi-VN')} xu`, inline: true },
      );
    await ctx.reply({ embeds: [embed] });
  },
};
