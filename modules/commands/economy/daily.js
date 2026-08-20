// =============================================================
//  Lệnh: daily - nhận xu mỗi ngày (có chuỗi điểm danh - streak)
//  LÀM MỚI LÚC 00:00 GIỜ VIỆT NAM (không phải đợi đủ 24 giờ nữa).
// =============================================================
const Embed = require('../../core/EmbedFactory');
const { colors, emoji } = require('../../core/palette');
const db = require('../../core/Database');
const rng = require('../../core/secureRandom');
const day = require('../../core/dayCycle');
const quests = require('../../core/questLogic');

module.exports = {
  name: 'daily',
  aliases: ['hangngay', 'diemdanh'],
  category: 'economy',
  description: 'Điểm danh nhận xu mỗi ngày (làm mới lúc 00:00)',
  cooldown: 4,
  guildOnly: true,
  slash: true,
  async run(ctx) {
    const wallet = db.getWallet(ctx.author.id);
    const now = Date.now();
    const last = wallet.lastDaily || 0;

    // Đã điểm danh trong ngày hôm nay (theo giờ VN) -> chờ tới nửa đêm.
    if (day.isToday(last, now)) {
      return ctx.reply({
        embeds: [Embed.warn(
          '\u0110\u00e3 \u0111i\u1ec3m danh h\u00f4m nay r\u1ed3i!',
          `L\u01b0\u1ee3t m\u1edbi m\u1edf l\u00fac **00:00** (gi\u1edd VN) \u2014 c\u00f2n **${day.humanUntilMidnight(now)}** n\u1eefa nh\u00e9.`,
        )],
      });
    }

    // --- Chuỗi điểm danh (streak) ---
    // Điểm danh đúng ngày kế tiếp -> nối chuỗi; bỏ lỡ trọn một ngày -> làm lại từ 1.
    const continued = last > 0 && day.isYesterday(last, now);
    wallet.dailyStreak = continued ? (wallet.dailyStreak || 0) + 1 : 1;
    const streak = wallet.dailyStreak;

    // --- Tính thưởng: cơ bản + thưởng theo chuỗi (tối đa +750 xu) ---
    const base = 250 + rng.randomInt(250);
    const streakBonus = Math.min(streak, 30) * 25;
    const reward = base + streakBonus;

    wallet.balance = (wallet.balance || 0) + reward;
    wallet.lastDaily = now;
    quests.track(wallet, 'daily', 1);
    quests.track(wallet, 'earn', reward);
    db.saveWallet(ctx.author.id, wallet);

    const brokeInfo = !continued && last > 0 ? '\n> \ud83d\udca4 Chu\u1ed7i c\u0169 \u0111\u00e3 reset v\u00ec b\u1ea1n b\u1ecf l\u1ee1 m\u1ed9t ng\u00e0y.' : '';
    const embed = Embed.custom(colors.success, `${emoji.coin} \u0110i\u1ec3m danh h\u00e0ng ng\u00e0y`)
      .setDescription(
        `B\u1ea1n nh\u1eadn \u0111\u01b0\u1ee3c **+${reward.toLocaleString('vi-VN')}** xu! ${emoji.sparkles}\n` +
        `\ud83d\udd25 Chu\u1ed7i \u0111i\u1ec3m danh: **${streak}** ng\u00e0y${streakBonus > 0 ? ` (th\u01b0\u1edfng chu\u1ed7i: **+${streakBonus.toLocaleString('vi-VN')}** xu)` : ''}\n` +
        `S\u1ed1 d\u01b0 v\u00ed hi\u1ec7n t\u1ea1i: **${wallet.balance.toLocaleString('vi-VN')}** xu.${brokeInfo}`,
      )
      .setFooter({ text: `L\u01b0\u1ee3t \u0111i\u1ec3m danh k\u1ebf ti\u1ebfp m\u1edf l\u00fac 00:00 (c\u00f2n ${day.humanUntilMidnight(now)})` });
    await ctx.reply({ embeds: [embed] });
  },
};
