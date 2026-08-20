// =============================================================
//  Lệnh: fishstats - thống kê câu cá trọn đời của một thành viên
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const fishing = require('../../core/fishing');

function bar(part, whole, size = 10) {
  const filled = whole ? Math.round((part / whole) * size) : 0;
  return '▰'.repeat(Math.min(filled, size)) + '▱'.repeat(Math.max(0, size - filled));
}

module.exports = {
  name: 'fishstats',
  aliases: ['fstats', 'thongkeca', 'fishinfo'],
  category: 'fishing',
  description: 'Xem thống kê câu cá trọn đời',
  usage: '[@thành_viên]',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  options: [{ name: 'thành_viên', type: 'user', description: 'Người muốn xem (bỏ trống = chính bạn)', required: false }],
  async run(ctx) {
    const user = ctx.getUser('thành_viên') || ctx.author;
    const wallet = db.getWallet(user.id);
    const st = wallet.fishStats || db.emptyFishStats();

    const totalSpecies = fishing.SPECIES.length;
    const discovered = st.discovered || {};
    const collected = fishing.SPECIES.filter((s) => (discovered[s.id] || 0) > 0).length;
    const pct = totalSpecies ? Math.round((collected / totalSpecies) * 100) : 0;
    const profit = (st.earned || 0) - (st.spent || 0);

    // Con cá giá trị nhất
    let bestText = 'Chưa có';
    if (st.best) {
      const sp = fishing.speciesById(st.best.id);
      const r = sp ? fishing.rarityMeta(sp.rarity) : null;
      bestText = sp
        ? `${sp.emoji} **${sp.name}** ${r ? r.badge : ''} — ${(st.best.value || 0).toLocaleString('vi-VN')} xu`
        : `${(st.best.value || 0).toLocaleString('vi-VN')} xu`;
    }

    // Phân bố theo độ hiếm
    const byRarity = st.byRarity || {};
    const caught = st.caught || 0;
    const rarityLines = Object.values(fishing.RARITIES)
      .sort((a, b) => a.order - b.order)
      .map((r) => {
        const n = byRarity[r.key] || 0;
        return `${r.badge} **${r.label}** \`${bar(n, caught)}\` ${n.toLocaleString('vi-VN')}`;
      });

    const embed = Embed.custom(colors.aqua, `${emoji.trophy} Thống kê câu cá — ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '🎣 Tổng lượt câu', value: `**${caught.toLocaleString('vi-VN')}**`, inline: true },
        { name: '📖 Sưu tầm', value: `**${collected}/${totalSpecies}** (${pct}%)`, inline: true },
        { name: `${emoji.coin} Lãi ròng`, value: `**${profit.toLocaleString('vi-VN')}** xu`, inline: true },
        { name: '💸 Đã chi (mồi)', value: `${(st.spent || 0).toLocaleString('vi-VN')} xu`, inline: true },
        { name: '💰 Thu từ bán cá', value: `${(st.earned || 0).toLocaleString('vi-VN')} xu`, inline: true },
        { name: '🌟 Cá to nhất', value: bestText, inline: false },
        { name: 'Phân bố theo độ hiếm', value: rarityLines.join('\n'), inline: false },
      )
      .setFooter({ text: 'Câu thêm với lệnh fish • Xem bộ sưu tập với fishdex' });
    await ctx.reply({ embeds: [embed] });
  },
};
