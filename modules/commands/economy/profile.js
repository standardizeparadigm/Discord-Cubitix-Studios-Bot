// =============================================================
//  Lệnh: profile - hồ sơ kinh tế tổng hợp của một thành viên
//  Gộp mọi dữ liệu sẵn có: ví, bể cá, xếp hạng, chuỗi điểm danh, sưu tầm...
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const fishing = require('../../core/fishing');
const day = require('../../core/dayCycle');

// Phải khớp với WORK_COOLDOWN trong modules/commands/economy/work.js
const WORK_COOLDOWN = 10 * 60 * 1000;

function totalAssets(w) {
  const fish = Array.isArray(w.aquarium) ? w.aquarium.reduce((a, f) => a + (f.value || 0), 0) : 0;
  return (w.balance || 0) + (w.bank || 0) + fish;
}

// Thời gian còn lại dạng "sẵn sàng" hoặc "còn Xh Ym"
function readiness(last, period) {
  const passed = Date.now() - (last || 0);
  if (!last || passed >= period) return '✅ Sẵn sàng';
  const left = period - passed;
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return h > 0 ? `⏳ còn ${h}h ${m}m` : `⏳ còn ${m}m`;
}

// Điểm danh làm mới lúc 00:00 (giờ VN) nên hiển thị theo mốc nửa đêm.
function dailyReadiness(last) {
  if (!day.isToday(last, Date.now())) return '\u2705 S\u1eb5n s\u00e0ng';
  return `\u23f3 00:00 (c\u00f2n ${day.humanUntilMidnight(Date.now())})`;
}

module.exports = {
  name: 'profile',
  aliases: ['hoso', 'pf', 'me'],
  category: 'economy',
  description: 'Xem hồ sơ kinh tế tổng hợp của bạn hoặc người khác',
  usage: '[@thành_viên]',
  cooldown: 5,
  guildOnly: true,
  slash: true,
  options: [{ name: 'thành_viên', type: 'user', description: 'Người muốn xem (bỏ trống = chính bạn)', required: false }],
  async run(ctx) {
    const user = ctx.getUser('thành_viên') || ctx.author;
    const wallet = db.getWallet(user.id);
    const aquarium = wallet.aquarium || [];

    // Xếp hạng theo tổng tài sản
    const all = db.economy.all();
    const ranked = Object.entries(all)
      .map(([id, w]) => ({ id, total: totalAssets(w) }))
      .filter((e) => e.total > 0)
      .sort((a, b) => b.total - a.total);
    const rankIdx = ranked.findIndex((e) => e.id === user.id);
    const rankText = rankIdx >= 0 ? `#${rankIdx + 1} / ${ranked.length}` : 'Chưa xếp hạng';

    // Giá trị bể cá
    let fishValue = 0;
    for (const f of aquarium) fishValue += f.value || 0;

    // Cá giá trị nhất từng câu được (lưu trọn đời)
    const fstats = wallet.fishStats || {};
    const best = fstats.best || null;
    let bestText = 'Chưa có';
    if (best) {
      const sp = fishing.speciesById(best.id);
      const r = sp ? fishing.rarityMeta(sp.rarity) : null;
      bestText = sp
        ? `${sp.emoji} **${sp.name}** ${r ? r.badge : ''} — ${(best.value || 0).toLocaleString('vi-VN')} xu`
        : `${(best.value || 0).toLocaleString('vi-VN')} xu`;
    }

    // Tỉ lệ sưu tầm loài (lưu trọn đời, không mất khi bán cá)
    const discovered = fstats.discovered || {};
    const totalSpecies = fishing.SPECIES.length;
    const collected = fishing.SPECIES.filter((s) => (discovered[s.id] || 0) > 0).length;
    const pct = totalSpecies ? Math.round((collected / totalSpecies) * 100) : 0;
    const totalCaught = fstats.caught || 0;

    const embed = Embed.custom(colors.purple, `${emoji.crown} Hồ sơ của ${user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '💵 Ví', value: `**${(wallet.balance || 0).toLocaleString('vi-VN')}** xu`, inline: true },
        { name: '🏷️ Tổng tài sản', value: `**${totalAssets(wallet).toLocaleString('vi-VN')}** xu`, inline: true },
        { name: '🏆 Xếp hạng', value: `**${rankText}**`, inline: true },
        { name: '🐠 Bể cá', value: `**${aquarium.length}** con (~${fishValue.toLocaleString('vi-VN')} xu)`, inline: true },
        { name: '🎣 Đã câu', value: `**${totalCaught.toLocaleString('vi-VN')}** lượt`, inline: true },
        { name: '📖 Sưu tầm', value: `**${collected}/${totalSpecies}** loài (${pct}%)`, inline: true },
        { name: '🔥 Chuỗi điểm danh', value: `**${wallet.dailyStreak || 0}** ngày`, inline: true },
        { name: '🐟 Cá giá trị nhất', value: bestText, inline: false },
        { name: '🎁 daily', value: dailyReadiness(wallet.lastDaily), inline: true },
        { name: '💼 work', value: readiness(wallet.lastWork, WORK_COOLDOWN), inline: true },
      )
      .setFooter({ text: 'Kiếm xu qua: daily • work • cờ bạc • câu cá' });
    await ctx.reply({ embeds: [embed] });
  },
};
