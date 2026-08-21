// =============================================================
//  Lệnh: cash (tên cũ: balance) - xem số xu trong ví & giá trị bể cá
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const fishing = require('../../core/fishing');

module.exports = {
  name: 'cash',
  aliases: ['balance', 'bal', 'sodu', 'money', 'vi'],
  category: 'economy',
  description: 'Xem số dư xu của bạn hoặc người khác',
  usage: '[@thành_viên]',
  cooldown: 4,
  guildOnly: true,
  slash: true,
  options: [{ name: 'thành_viên', type: 'user', description: 'Người muốn xem (bỏ trống = chính bạn)', required: false }],
  async run(ctx) {
    const user = ctx.getUser('thành_viên') || ctx.author;
    const wallet = db.getWallet(user.id);
    const aquarium = wallet.aquarium || [];
    // SỬA LỖI: trước đây dùng f.value nên giá trị hiển thị KHÁC số xu thật nhận
    // được khi bán (lệnh sellfish tính theo fishing.valueOf). Nay dùng chung một
    // cách tính duy nhất để hai con số luôn khớp nhau.
    const fishValue = aquarium.reduce((a, f) => a + fishing.valueOf(f), 0);

    const embed = Embed.custom(colors.gold, `${emoji.coin} Số dư của ${user.username}`)
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: '💵 Ví', value: `**${wallet.balance.toLocaleString('vi-VN')}** xu`, inline: true },
        { name: '🐠 Bể cá', value: `**${aquarium.length}** con`, inline: true },
        { name: '🏷️ Giá trị bể cá', value: `~**${fishValue.toLocaleString('vi-VN')}** xu`, inline: true },
      )
      .setFooter({ text: 'Kiếm xu qua: daily • work • cờ bạc • câu cá' });
    await ctx.reply({ embeds: [embed] });
  },
};
